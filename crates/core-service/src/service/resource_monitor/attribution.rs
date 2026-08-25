//! Exclusive process attribution for Resource Monitor snapshots.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use core_engine::ResourceProcessSample;

use super::projection::{build_projects, HierarchyUsage, SessionRow};
use super::types::{ResourceAttributionStatus, ResourceProcessMetrics, ResourceUsage};

const MAX_PARENT_WALK: usize = 64;

/// Filesystem root used for GUID resolution and deepest-cwd matching.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PathContext {
    pub id: String,
    pub name: String,
    pub kind: PathContextKind,
    pub project_id: String,
    pub path: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PathContextKind {
    Project,
    Workspace,
}

/// Terminal handle before pane join.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TerminalRootInput {
    pub session_id: String,
    pub name: Option<String>,
    pub terminal_kind: String,
    pub context_id: String,
    pub simple_root_pid: Option<u32>,
    pub tmux_session: Option<String>,
    pub tmux_window_index: Option<u32>,
}

/// One row from a batched `list-panes -a`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TmuxPaneInput {
    pub session_name: String,
    pub window_index: u32,
    pub pane_pid: u32,
}

/// Terminal after joining tmux panes or simple PTY PIDs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TerminalClaim {
    pub session_id: String,
    pub name: Option<String>,
    pub terminal_kind: String,
    pub context_id: String,
    pub root_pids: Vec<u32>,
    pub missing_root: bool,
}

/// Cached Local Services listener used only for port annotation.
///
/// Resource owner stays authoritative; this never changes assignment.
#[derive(Debug, Clone)]
pub(crate) struct CachedListenerPort {
    pub pid: u32,
    pub process_name: Option<String>,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub(crate) struct AttributionInput {
    pub processes: Vec<ResourceProcessSample>,
    pub server_pid: u32,
    pub path_contexts: Vec<PathContext>,
    pub terminals: Vec<TerminalClaim>,
    pub port_cache: Option<Vec<CachedListenerPort>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ProcessKey {
    pub pid: u32,
    pub start_time: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum AssignmentOwner {
    Session {
        session_id: String,
        project_id: String,
        workspace_id: Option<String>,
    },
    Cwd {
        project_id: String,
        workspace_id: Option<String>,
    },
    Server,
    SharedRuntime,
    Unattributed,
}

#[derive(Debug, Clone)]
pub(crate) struct AttributionOutput {
    pub server: ResourceUsage,
    pub shared_runtime: ResourceUsage,
    pub projects: Vec<super::types::ResourceProjectMetrics>,
    pub unattributed: ResourceUsage,
    pub attribution_status: ResourceAttributionStatus,
    #[allow(dead_code)]
    pub assignments: HashMap<ProcessKey, AssignmentOwner>,
}

#[derive(Clone)]
struct IndexedProcess {
    key: ProcessKey,
    parent_pid: Option<u32>,
    cwd: Option<PathBuf>,
    name: Option<String>,
    cpu_percent: f32,
    memory_rss_bytes: u64,
}

/// Join terminal handles to one batched pane list on `(session, window_index)`.
///
/// `panes == None` means tmux could not be queried. Tmux handles become missing
/// roots and the caller treats attribution as partial; simple PTY roots still resolve.
pub(crate) fn resolve_terminal_claims(
    roots: &[TerminalRootInput],
    panes: Option<&[TmuxPaneInput]>,
) -> (Vec<TerminalClaim>, bool) {
    let mut pane_pids: HashMap<(String, u32), Vec<u32>> = HashMap::new();
    if let Some(panes) = panes {
        for pane in panes {
            pane_pids
                .entry((pane.session_name.clone(), pane.window_index))
                .or_default()
                .push(pane.pane_pid);
        }
    }

    let mut claims = Vec::with_capacity(roots.len());
    let mut partial = false;
    for root in roots {
        if let (Some(session), Some(index)) = (root.tmux_session.as_ref(), root.tmux_window_index) {
            let (root_pids, missing_root) = match panes {
                None => {
                    partial = true;
                    (Vec::new(), true)
                }
                Some(_) => match pane_pids.get(&(session.clone(), index)) {
                    Some(pids) if !pids.is_empty() => (pids.clone(), false),
                    _ => {
                        partial = true;
                        (Vec::new(), true)
                    }
                },
            };
            claims.push(TerminalClaim {
                session_id: root.session_id.clone(),
                name: root.name.clone(),
                terminal_kind: root.terminal_kind.clone(),
                context_id: root.context_id.clone(),
                root_pids,
                missing_root,
            });
            continue;
        }

        match root.simple_root_pid {
            Some(pid) if pid > 0 => claims.push(TerminalClaim {
                session_id: root.session_id.clone(),
                name: root.name.clone(),
                terminal_kind: root.terminal_kind.clone(),
                context_id: root.context_id.clone(),
                root_pids: vec![pid],
                missing_root: false,
            }),
            _ => {
                partial = true;
                claims.push(TerminalClaim {
                    session_id: root.session_id.clone(),
                    name: root.name.clone(),
                    terminal_kind: root.terminal_kind.clone(),
                    context_id: root.context_id.clone(),
                    root_pids: Vec::new(),
                    missing_root: true,
                });
            }
        }
    }
    (claims, partial)
}

pub(crate) fn attribute(input: AttributionInput) -> AttributionOutput {
    if input.processes.is_empty() {
        return AttributionOutput {
            server: ResourceUsage::zero(),
            shared_runtime: ResourceUsage::zero(),
            projects: Vec::new(),
            unattributed: ResourceUsage::zero(),
            attribution_status: ResourceAttributionStatus::Unsupported,
            assignments: HashMap::new(),
        };
    }

    let processes: Vec<IndexedProcess> = input
        .processes
        .iter()
        .map(|process| IndexedProcess {
            key: ProcessKey {
                pid: process.pid,
                start_time: process.start_time,
            },
            parent_pid: process.parent_pid,
            cwd: process.cwd.as_ref().map(|path| normalize_path(path)),
            name: process.name.clone(),
            cpu_percent: process.cpu_percent,
            memory_rss_bytes: process.memory_rss_bytes,
        })
        .collect();

    let mut by_pid: HashMap<u32, Vec<usize>> = HashMap::new();
    let mut children: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, process) in processes.iter().enumerate() {
        by_pid.entry(process.key.pid).or_default().push(index);
        if let Some(parent_pid) = process.parent_pid {
            children.entry(parent_pid).or_default().push(index);
        }
    }

    let mut assigned: Vec<Option<AssignmentOwner>> = vec![None; processes.len()];
    let mut partial = false;

    reserve_server_pid(&mut assigned, &by_pid, input.server_pid, &mut partial);

    let project_by_id: HashMap<&str, &PathContext> = input
        .path_contexts
        .iter()
        .filter(|context| context.kind == PathContextKind::Project)
        .map(|context| (context.id.as_str(), context))
        .collect();
    let workspace_by_id: HashMap<&str, &PathContext> = input
        .path_contexts
        .iter()
        .filter(|context| context.kind == PathContextKind::Workspace)
        .map(|context| (context.id.as_str(), context))
        .collect();

    let mut session_rows: Vec<SessionRow> = Vec::new();
    let mut term_jobs: Vec<TermJob> = Vec::new();

    for claim in &input.terminals {
        let resolved = resolve_context(claim.context_id.as_str(), &project_by_id, &workspace_by_id);
        if resolved.is_none() {
            partial = true;
        }

        let mut root_indices = Vec::new();
        let mut pid_conflict = false;
        for pid in &claim.root_pids {
            if *pid == input.server_pid {
                // Abnormal: a terminal root must never steal the Atmos Server PID.
                partial = true;
                continue;
            }
            match by_pid.get(pid).map(Vec::as_slice).unwrap_or(&[]) {
                [] => {
                    partial = true;
                }
                [index] => root_indices.push(*index),
                _ => {
                    // Same PID, different start_time: do not merge identities.
                    pid_conflict = true;
                    partial = true;
                }
            }
        }
        if claim.missing_root {
            partial = true;
        }

        session_rows.push(SessionRow {
            session_id: claim.session_id.clone(),
            name: claim.name.clone(),
            terminal_kind: claim.terminal_kind.clone(),
            project_id: resolved.as_ref().map(|context| context.project_id.clone()),
            workspace_id: resolved
                .as_ref()
                .and_then(|context| context.workspace_id.clone()),
        });

        if pid_conflict || root_indices.is_empty() {
            continue;
        }

        let depth = root_indices
            .iter()
            .map(|index| process_depth(*index, &processes, &by_pid))
            .max()
            .unwrap_or(0);
        let owner = match resolved {
            Some(context) => AssignmentOwner::Session {
                session_id: claim.session_id.clone(),
                project_id: context.project_id,
                workspace_id: context.workspace_id,
            },
            None => AssignmentOwner::Unattributed,
        };
        term_jobs.push(TermJob {
            session_id: claim.session_id.clone(),
            depth,
            root_indices,
            owner,
        });
    }

    term_jobs.sort_by(|left, right| {
        right
            .depth
            .cmp(&left.depth)
            .then_with(|| left.session_id.cmp(&right.session_id))
    });

    let mut claimed_roots: HashSet<usize> = HashSet::new();
    for job in &term_jobs {
        // Duplicate tmux handles share root indices; only the first job claims.
        let new_roots: Vec<usize> = job
            .root_indices
            .iter()
            .copied()
            .filter(|index| claimed_roots.insert(*index))
            .collect();
        if new_roots.is_empty() {
            continue;
        }

        for root_index in new_roots {
            for index in subtree_indices(root_index, &processes, &children) {
                if assigned[index].is_none() {
                    assigned[index] = Some(job.owner.clone());
                }
            }
        }
    }

    let path_roots: Vec<ResolvedPathRoot> = input
        .path_contexts
        .iter()
        .filter_map(|context| {
            let path = context.path.as_ref()?;
            if path.as_os_str().is_empty() {
                return None;
            }
            Some(ResolvedPathRoot {
                project_id: context.project_id.clone(),
                workspace_id: match context.kind {
                    PathContextKind::Workspace => Some(context.id.clone()),
                    PathContextKind::Project => None,
                },
                path: path.clone(),
            })
        })
        .collect();

    for (index, process) in processes.iter().enumerate() {
        if assigned[index].is_some() {
            continue;
        }
        let Some(cwd) = process.cwd.as_ref() else {
            continue;
        };
        if let Some(root) = deepest_path_root(cwd, &path_roots) {
            assigned[index] = Some(AssignmentOwner::Cwd {
                project_id: root.project_id.clone(),
                workspace_id: root.workspace_id.clone(),
            });
        }
    }

    let server_descendants = by_pid
        .get(&input.server_pid)
        .into_iter()
        .flatten()
        .copied()
        .flat_map(|index| subtree_indices(index, &processes, &children))
        .collect::<Vec<_>>();
    for index in server_descendants {
        if assigned[index].is_none() {
            assigned[index] = Some(AssignmentOwner::SharedRuntime);
        }
    }

    let mut assignments = HashMap::new();
    let mut server = ResourceUsage::zero();
    let mut shared_runtime = ResourceUsage::zero();
    let mut unattributed = ResourceUsage::zero();
    let mut usage = HierarchyUsage::default();
    let mut session_groups: HashMap<String, HashMap<String, ProcessGroupAcc>> = HashMap::new();
    let mut workspace_other_groups: HashMap<(String, String), HashMap<String, ProcessGroupAcc>> =
        HashMap::new();
    let mut project_other_groups: HashMap<String, HashMap<String, ProcessGroupAcc>> =
        HashMap::new();
    let port_cache = input.port_cache.as_deref();

    for (index, owner) in assigned.iter().enumerate() {
        let Some(owner) = owner else {
            continue;
        };
        let process = &processes[index];
        assignments.insert(process.key.clone(), owner.clone());
        match owner {
            AssignmentOwner::Server => {
                server.add_process(process.cpu_percent, process.memory_rss_bytes);
            }
            AssignmentOwner::SharedRuntime => {
                shared_runtime.add_process(process.cpu_percent, process.memory_rss_bytes);
            }
            AssignmentOwner::Unattributed => {
                unattributed.add_process(process.cpu_percent, process.memory_rss_bytes);
            }
            AssignmentOwner::Session {
                session_id,
                project_id,
                workspace_id,
            } => {
                usage
                    .session_usage
                    .entry(session_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                usage
                    .project_usage
                    .entry(project_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                if let Some(workspace_id) = workspace_id {
                    usage
                        .workspace_usage
                        .entry((project_id.clone(), workspace_id.clone()))
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                } else {
                    usage
                        .project_direct
                        .entry(project_id.clone())
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                }
                add_process_group(
                    session_groups.entry(session_id.clone()).or_default(),
                    process,
                    ports_for_process(process, port_cache),
                );
            }
            AssignmentOwner::Cwd {
                project_id,
                workspace_id,
            } => {
                usage
                    .project_usage
                    .entry(project_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                if let Some(workspace_id) = workspace_id {
                    usage
                        .workspace_usage
                        .entry((project_id.clone(), workspace_id.clone()))
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                    usage
                        .workspace_other_usage
                        .entry((project_id.clone(), workspace_id.clone()))
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                    add_process_group(
                        workspace_other_groups
                            .entry((project_id.clone(), workspace_id.clone()))
                            .or_default(),
                        process,
                        ports_for_process(process, port_cache),
                    );
                } else {
                    usage
                        .project_direct
                        .entry(project_id.clone())
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                    usage
                        .project_other_usage
                        .entry(project_id.clone())
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                    add_process_group(
                        project_other_groups.entry(project_id.clone()).or_default(),
                        process,
                        ports_for_process(process, port_cache),
                    );
                }
            }
        }
    }

    usage.session_processes = session_groups
        .into_iter()
        .map(|(session_id, groups)| (session_id, finish_process_groups(groups)))
        .collect();
    usage.workspace_other_processes = workspace_other_groups
        .into_iter()
        .map(|(key, groups)| (key, finish_process_groups(groups)))
        .collect();
    usage.project_other_processes = project_other_groups
        .into_iter()
        .map(|(project_id, groups)| (project_id, finish_process_groups(groups)))
        .collect();

    let projects = build_projects(&input.path_contexts, &session_rows, &usage);

    AttributionOutput {
        server,
        shared_runtime,
        projects,
        unattributed,
        attribution_status: if partial {
            ResourceAttributionStatus::Partial
        } else {
            ResourceAttributionStatus::Complete
        },
        assignments,
    }
}

fn reserve_server_pid(
    assigned: &mut [Option<AssignmentOwner>],
    by_pid: &HashMap<u32, Vec<usize>>,
    server_pid: u32,
    partial: &mut bool,
) {
    match by_pid.get(&server_pid).map(Vec::as_slice) {
        Some([index]) => {
            assigned[*index] = Some(AssignmentOwner::Server);
        }
        None | Some([]) => {}
        Some(_) => {
            *partial = true;
        }
    }
}

struct TermJob {
    session_id: String,
    depth: u32,
    root_indices: Vec<usize>,
    owner: AssignmentOwner,
}

struct ResolvedContext {
    project_id: String,
    workspace_id: Option<String>,
}

struct ResolvedPathRoot {
    project_id: String,
    workspace_id: Option<String>,
    path: PathBuf,
}

fn resolve_context(
    context_id: &str,
    projects: &HashMap<&str, &PathContext>,
    workspaces: &HashMap<&str, &PathContext>,
) -> Option<ResolvedContext> {
    if let Some(project) = projects.get(context_id) {
        return Some(ResolvedContext {
            project_id: project.id.clone(),
            workspace_id: None,
        });
    }
    if let Some(workspace) = workspaces.get(context_id) {
        return Some(ResolvedContext {
            project_id: workspace.project_id.clone(),
            workspace_id: Some(workspace.id.clone()),
        });
    }
    None
}

fn process_depth(
    index: usize,
    processes: &[IndexedProcess],
    by_pid: &HashMap<u32, Vec<usize>>,
) -> u32 {
    let mut depth = 0;
    let mut current = processes[index].parent_pid;
    let mut seen = HashSet::new();
    seen.insert(processes[index].key.clone());
    while let Some(parent_pid) = current {
        if depth as usize >= MAX_PARENT_WALK {
            break;
        }
        let Some(parent_index) = unique_pid(by_pid, parent_pid) else {
            break;
        };
        if !seen.insert(processes[parent_index].key.clone()) {
            break;
        }
        depth += 1;
        current = processes[parent_index].parent_pid;
    }
    depth
}

fn unique_pid(by_pid: &HashMap<u32, Vec<usize>>, pid: u32) -> Option<usize> {
    match by_pid.get(&pid).map(Vec::as_slice) {
        Some([index]) => Some(*index),
        _ => None,
    }
}

fn subtree_indices(
    root_index: usize,
    processes: &[IndexedProcess],
    children: &HashMap<u32, Vec<usize>>,
) -> Vec<usize> {
    let mut out = Vec::new();
    let mut stack = vec![root_index];
    let mut seen = HashSet::new();
    while let Some(index) = stack.pop() {
        if !seen.insert(processes[index].key.clone()) {
            continue;
        }
        out.push(index);
        if let Some(child_indices) = children.get(&processes[index].key.pid) {
            stack.extend(child_indices.iter().copied());
        }
    }
    out
}

fn deepest_path_root<'a>(
    cwd: &Path,
    roots: &'a [ResolvedPathRoot],
) -> Option<&'a ResolvedPathRoot> {
    roots
        .iter()
        .filter(|root| path_contains(&root.path, cwd))
        .max_by(|left, right| {
            let left_depth = left.path.components().count();
            let right_depth = right.path.components().count();
            left_depth
                .cmp(&right_depth)
                .then_with(|| {
                    left.path
                        .as_os_str()
                        .len()
                        .cmp(&right.path.as_os_str().len())
                })
                .then_with(|| match (&left.workspace_id, &right.workspace_id) {
                    (Some(_), None) => std::cmp::Ordering::Greater,
                    (None, Some(_)) => std::cmp::Ordering::Less,
                    _ => left.project_id.cmp(&right.project_id),
                })
        })
}

fn path_contains(root: &Path, cwd: &Path) -> bool {
    if root.as_os_str().is_empty() {
        return false;
    }
    #[cfg(windows)]
    {
        windows_path_contains(root, cwd)
    }
    #[cfg(not(windows))]
    {
        cwd.starts_with(root)
    }
}

/// Strip `\\?\` / `\\?\UNC\` and ASCII-fold case for Windows containment.
#[cfg(any(windows, test))]
pub(crate) fn normalize_windows_containment_key(path: &Path) -> String {
    let raw = path.to_string_lossy();
    strip_windows_verbatim_prefix(&raw).to_ascii_lowercase()
}

#[cfg(any(windows, test))]
pub(crate) fn strip_windows_verbatim_prefix(path: &str) -> String {
    const UNC: &str = r"\\?\UNC\";
    const VERBATIM: &str = r"\\?\";
    if let Some(rest) = path.strip_prefix(UNC) {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(VERBATIM) {
        rest.to_string()
    } else {
        path.to_string()
    }
}

/// Windows containment after prefix/case normalization. Pure and testable on Unix.
#[cfg(any(windows, test))]
pub(crate) fn windows_path_contains(root: &Path, cwd: &Path) -> bool {
    let root = normalize_windows_containment_key(root);
    let cwd = normalize_windows_containment_key(cwd);
    let root = root.trim_end_matches(['\\', '/']);
    if root.is_empty() {
        return false;
    }
    cwd == root || cwd.starts_with(&format!("{root}\\")) || cwd.starts_with(&format!("{root}/"))
}

pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    let lexical = normalize_path_lexical(path);
    lexical.canonicalize().unwrap_or(lexical)
}

fn normalize_path_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[derive(Default)]
struct ProcessGroupAcc {
    name: String,
    usage: ResourceUsage,
    ports: BTreeSet<u16>,
}

fn add_process_group(
    groups: &mut HashMap<String, ProcessGroupAcc>,
    process: &IndexedProcess,
    ports: Vec<u16>,
) {
    let Some(display) = process_group_name(process.name.as_deref()) else {
        return;
    };
    let key = display.to_ascii_lowercase();
    let entry = groups.entry(key).or_insert_with(|| ProcessGroupAcc {
        name: display,
        usage: ResourceUsage::zero(),
        ports: BTreeSet::new(),
    });
    entry
        .usage
        .add_process(process.cpu_percent, process.memory_rss_bytes);
    entry.ports.extend(ports);
}

fn finish_process_groups(groups: HashMap<String, ProcessGroupAcc>) -> Vec<ResourceProcessMetrics> {
    let mut rows: Vec<ResourceProcessMetrics> = groups
        .into_values()
        .map(|group| ResourceProcessMetrics {
            name: group.name,
            usage: group.usage,
            ports: group.ports.into_iter().collect(),
        })
        .collect();
    rows.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });
    rows
}

fn ports_for_process(process: &IndexedProcess, cache: Option<&[CachedListenerPort]>) -> Vec<u16> {
    let Some(cache) = cache else {
        return Vec::new();
    };
    let mut ports: Vec<u16> = cache
        .iter()
        .filter(|listener| listener_matches_process(listener, process))
        .map(|listener| listener.port)
        .collect();
    ports.sort_unstable();
    ports.dedup();
    ports
}

fn listener_matches_process(listener: &CachedListenerPort, process: &IndexedProcess) -> bool {
    if listener.pid != process.key.pid {
        return false;
    }
    match (
        nonempty_process_name(listener.process_name.as_deref()),
        nonempty_process_name(process.name.as_deref()),
    ) {
        (Some(cached), Some(sample)) => process_names_match(cached, sample),
        _ => false,
    }
}

fn nonempty_process_name(name: Option<&str>) -> Option<&str> {
    name.map(str::trim).filter(|value| !value.is_empty())
}

fn process_group_name(name: Option<&str>) -> Option<String> {
    let display = process_basename(name.unwrap_or(""));
    if display.trim().is_empty() {
        None
    } else {
        Some(display)
    }
}

fn process_names_match(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
        || process_basename(left).eq_ignore_ascii_case(&process_basename(right))
}

fn process_basename(name: &str) -> String {
    let trimmed = name.trim();
    Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(trimmed)
        .to_string()
}

#[cfg(test)]
#[path = "attribution_tests.rs"]
mod attribution_tests;
