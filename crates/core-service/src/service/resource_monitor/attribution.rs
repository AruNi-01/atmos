//! Exclusive process attribution for Resource Monitor snapshots.

use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use core_engine::ResourceProcessSample;

use super::projection::{build_projects, SessionRow};
use super::types::{ResourceAttributionStatus, ResourceUsage};

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

#[derive(Debug, Clone)]
pub(crate) struct AttributionInput {
    pub processes: Vec<ResourceProcessSample>,
    pub server_pid: u32,
    pub path_contexts: Vec<PathContext>,
    pub terminals: Vec<TerminalClaim>,
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
            let path = context.path.as_ref()?.clone();
            Some(ResolvedPathRoot {
                project_id: context.project_id.clone(),
                workspace_id: match context.kind {
                    PathContextKind::Workspace => Some(context.id.clone()),
                    PathContextKind::Project => None,
                },
                path: normalize_path(&path),
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
    let mut session_usage: HashMap<String, ResourceUsage> = HashMap::new();
    let mut workspace_usage: HashMap<(String, String), ResourceUsage> = HashMap::new();
    let mut project_usage: HashMap<String, ResourceUsage> = HashMap::new();
    let mut project_direct: HashMap<String, ResourceUsage> = HashMap::new();

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
                session_usage
                    .entry(session_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                project_usage
                    .entry(project_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                if let Some(workspace_id) = workspace_id {
                    workspace_usage
                        .entry((project_id.clone(), workspace_id.clone()))
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                } else {
                    project_direct
                        .entry(project_id.clone())
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                }
            }
            AssignmentOwner::Cwd {
                project_id,
                workspace_id,
            } => {
                project_usage
                    .entry(project_id.clone())
                    .or_default()
                    .add_process(process.cpu_percent, process.memory_rss_bytes);
                if let Some(workspace_id) = workspace_id {
                    workspace_usage
                        .entry((project_id.clone(), workspace_id.clone()))
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                } else {
                    project_direct
                        .entry(project_id.clone())
                        .or_default()
                        .add_process(process.cpu_percent, process.memory_rss_bytes);
                }
            }
        }
    }

    let projects = build_projects(
        &input.path_contexts,
        &session_rows,
        &session_usage,
        &workspace_usage,
        &project_usage,
        &project_direct,
    );

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
    cwd.starts_with(root)
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

#[cfg(test)]
#[path = "attribution_tests.rs"]
mod attribution_tests;
