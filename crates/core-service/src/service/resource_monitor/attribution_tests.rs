use std::collections::HashSet;
use std::path::PathBuf;

use core_engine::ResourceProcessSample;

use super::*;
use crate::service::resource_monitor::types::{ResourceAttributionStatus, ResourceUsage};

fn proc(
    pid: u32,
    parent: Option<u32>,
    start_time: u64,
    cwd: Option<&str>,
    cpu: f32,
    memory: u64,
) -> ResourceProcessSample {
    ResourceProcessSample {
        collected_at_ms: 1,
        pid,
        parent_pid: parent,
        start_time,
        cwd: cwd.map(PathBuf::from),
        name: Some(format!("p{pid}")),
        cpu_percent: cpu,
        memory_rss_bytes: memory,
    }
}

fn project(id: &str, name: &str, path: &str) -> PathContext {
    PathContext {
        id: id.to_string(),
        name: name.to_string(),
        kind: PathContextKind::Project,
        project_id: id.to_string(),
        path: Some(PathBuf::from(path)),
    }
}

fn workspace(id: &str, name: &str, project_id: &str, path: &str) -> PathContext {
    PathContext {
        id: id.to_string(),
        name: name.to_string(),
        kind: PathContextKind::Workspace,
        project_id: project_id.to_string(),
        path: Some(PathBuf::from(path)),
    }
}

fn simple_claim(session_id: &str, context_id: &str, pid: u32) -> TerminalClaim {
    TerminalClaim {
        session_id: session_id.to_string(),
        name: Some(session_id.to_string()),
        terminal_kind: "standard".to_string(),
        context_id: context_id.to_string(),
        root_pids: vec![pid],
        missing_root: false,
    }
}

fn usage_of(
    output: &AttributionOutput,
    processes: &[ResourceProcessSample],
    owner_ok: impl Fn(&AssignmentOwner) -> bool,
) -> ResourceUsage {
    let mut usage = ResourceUsage::zero();
    for process in processes {
        let key = ProcessKey {
            pid: process.pid,
            start_time: process.start_time,
        };
        if output.assignments.get(&key).is_some_and(&owner_ok) {
            usage.add_process(process.cpu_percent, process.memory_rss_bytes);
        }
    }
    usage
}

/// S3 — exclusive attribution, deepest nested terminal, server descendants excluded.
#[test]
fn exclusive_nested_deepest_and_server_excludes_workspace() {
    let processes = vec![
        proc(1, None, 1, Some("/atmos"), 1.0, 100),
        proc(2, Some(1), 1, Some("/atmos"), 2.0, 200),
        proc(10, Some(1), 1, Some("/proj/ws"), 3.0, 300),
        proc(11, Some(10), 1, Some("/proj/ws"), 4.0, 400),
        proc(20, Some(11), 1, Some("/proj/ws"), 5.0, 500),
        proc(21, Some(20), 1, Some("/proj/ws"), 6.0, 600),
        proc(30, Some(1), 1, Some("/proj/ws/src"), 7.0, 700),
        proc(31, Some(30), 1, Some("/proj/ws/src"), 8.0, 800),
        proc(99, Some(50), 1, Some("/unrelated"), 9.0, 900),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 1,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: vec![
            simple_claim("shallow", "ws", 10),
            simple_claim("deep", "ws", 20),
        ],
        port_cache: None,
    });

    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Complete
    );
    assert_eq!(output.assignments.len(), 8);
    assert_eq!(
        output.assignments.len(),
        output.assignments.keys().collect::<HashSet<_>>().len()
    );

    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 20,
            start_time: 1
        }],
        AssignmentOwner::Session {
            session_id: "deep".into(),
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 21,
            start_time: 1
        }],
        AssignmentOwner::Session {
            session_id: "deep".into(),
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 10,
            start_time: 1
        }],
        AssignmentOwner::Session {
            session_id: "shallow".into(),
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 11,
            start_time: 1
        }],
        AssignmentOwner::Session {
            session_id: "shallow".into(),
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 30,
            start_time: 1
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 1,
            start_time: 1
        }],
        AssignmentOwner::Server
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 2,
            start_time: 1
        }],
        AssignmentOwner::SharedRuntime
    );
    assert!(!output.assignments.contains_key(&ProcessKey {
        pid: 99,
        start_time: 1
    }));

    assert_eq!(
        output.server,
        usage_of(&output, &processes, |owner| {
            matches!(owner, AssignmentOwner::Server)
        })
    );
    assert_eq!(output.server.process_count, 1);
    assert_eq!(output.shared_runtime.process_count, 1);
    assert_eq!(output.server.cpu_percent, 1.0);
    assert_eq!(output.shared_runtime.cpu_percent, 2.0);

    let project = &output.projects[0];
    assert_eq!(project.project_id, "proj");
    assert_eq!(project.direct_usage.process_count, 0);
    assert_eq!(project.workspaces.len(), 1);
    let workspace = &project.workspaces[0];
    assert_eq!(workspace.workspace_id, "ws");
    assert_eq!(workspace.usage.process_count, 6);
    assert_eq!(
        workspace.usage.cpu_percent,
        3.0 + 4.0 + 5.0 + 6.0 + 7.0 + 8.0
    );
    assert_eq!(project.usage, workspace.usage);
    assert_eq!(workspace.sessions.len(), 2);
    assert_eq!(workspace.sessions[0].session_id, "deep");
    assert_eq!(workspace.sessions[0].usage.cpu_percent, 11.0);
    assert_eq!(workspace.sessions[1].session_id, "shallow");
    assert_eq!(workspace.sessions[1].usage.cpu_percent, 7.0);
}

/// S5 — duplicate tmux handles claim a pane subtree once.
#[test]
fn duplicate_tmux_roots_claim_once() {
    let roots = vec![
        TerminalRootInput {
            session_id: "dup-a".into(),
            name: Some("alpha".into()),
            terminal_kind: "standard".into(),
            context_id: "ws".into(),
            simple_root_pid: None,
            tmux_session: Some("dev".into()),
            tmux_window_index: Some(1),
        },
        TerminalRootInput {
            session_id: "dup-b".into(),
            name: Some("beta".into()),
            terminal_kind: "standard".into(),
            context_id: "ws".into(),
            simple_root_pid: None,
            tmux_session: Some("dev".into()),
            tmux_window_index: Some(1),
        },
        TerminalRootInput {
            session_id: "other".into(),
            name: Some("other".into()),
            terminal_kind: "standard".into(),
            context_id: "ws".into(),
            simple_root_pid: None,
            tmux_session: Some("dev".into()),
            tmux_window_index: Some(2),
        },
    ];
    let panes = vec![
        TmuxPaneInput {
            session_name: "dev".into(),
            window_index: 1,
            pane_pid: 100,
        },
        TmuxPaneInput {
            session_name: "dev".into(),
            window_index: 2,
            pane_pid: 200,
        },
    ];
    let (claims, partial) = resolve_terminal_claims(&roots, Some(&panes));
    assert!(!partial);
    assert_eq!(claims[0].root_pids, vec![100]);
    assert_eq!(claims[1].root_pids, vec![100]);
    assert_eq!(claims[2].root_pids, vec![200]);

    let processes = vec![
        proc(100, None, 1, None, 1.0, 10),
        proc(101, Some(100), 1, None, 2.0, 20),
        proc(200, None, 1, None, 3.0, 30),
        proc(201, Some(200), 1, None, 4.0, 40),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 1,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: claims,
        port_cache: None,
    });

    let claimed_keys: HashSet<_> = output.assignments.keys().cloned().collect();
    assert_eq!(claimed_keys.len(), 4);
    assert_eq!(output.assignments.len(), 4);

    let owners: HashSet<_> = [100, 101]
        .into_iter()
        .map(|pid| output.assignments[&ProcessKey { pid, start_time: 1 }].clone())
        .collect();
    assert_eq!(owners.len(), 1);
    assert!(matches!(
        owners.iter().next(),
        Some(AssignmentOwner::Session {
            session_id,
            ..
        }) if session_id == "dup-a"
    ));

    let workspace = &output.projects[0].workspaces[0];
    assert_eq!(workspace.sessions.len(), 3);
    assert_eq!(workspace.sessions[0].session_id, "dup-a");
    assert_eq!(workspace.sessions[0].usage.cpu_percent, 3.0);
    assert_eq!(workspace.sessions[1].session_id, "dup-b");
    assert_eq!(workspace.sessions[1].usage.process_count, 0);
    assert_eq!(workspace.sessions[2].session_id, "other");
    assert_eq!(workspace.sessions[2].usage.cpu_percent, 7.0);
    assert_eq!(workspace.usage.cpu_percent, 10.0);
}

/// S6 — project-direct, workspace, and unresolved stale context.
#[test]
fn project_workspace_and_unresolved_contexts() {
    let processes = vec![
        proc(10, None, 1, None, 1.0, 10),
        proc(20, None, 1, None, 2.0, 20),
        proc(30, None, 1, None, 3.0, 30),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 1,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: vec![
            simple_claim("proj-session", "proj", 10),
            simple_claim("ws-session", "ws", 20),
            simple_claim("stale", "missing-guid", 30),
        ],
        port_cache: None,
    });

    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Partial
    );
    assert_eq!(output.unattributed.cpu_percent, 3.0);
    assert_eq!(output.unattributed.process_count, 1);
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 30,
            start_time: 1
        }],
        AssignmentOwner::Unattributed
    );
    assert_eq!(output.projects.len(), 1);
    let project = &output.projects[0];
    assert_eq!(project.direct_usage.cpu_percent, 1.0);
    assert_eq!(project.sessions.len(), 1);
    assert_eq!(project.sessions[0].session_id, "proj-session");
    assert_eq!(project.workspaces.len(), 1);
    assert_eq!(project.workspaces[0].usage.cpu_percent, 2.0);
    assert_eq!(project.usage.cpu_percent, 3.0);
    assert_eq!(project.usage.process_count, 2);
    assert!(!project
        .sessions
        .iter()
        .any(|session| session.session_id == "stale"));
    assert!(!project.workspaces.iter().any(|workspace| workspace
        .sessions
        .iter()
        .any(|session| session.session_id == "stale")));
}

#[test]
fn pid_reuse_uses_start_time_identity() {
    let processes = vec![
        proc(50, None, 100, Some("/proj/ws/src"), 1.0, 10),
        proc(50, None, 200, Some("/elsewhere"), 2.0, 20),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 1,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: vec![simple_claim("term", "ws", 50)],
        port_cache: None,
    });

    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Partial
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 50,
            start_time: 100
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: Some("ws".into()),
        }
    );
    assert!(!output.assignments.contains_key(&ProcessKey {
        pid: 50,
        start_time: 200
    }));
    assert_eq!(output.projects[0].usage.cpu_percent, 1.0);
    assert_eq!(output.projects[0].usage.process_count, 1);
}

#[test]
fn cwd_boundary_uses_path_prefix_not_string_prefix() {
    let processes = vec![
        proc(1, None, 1, Some("/repo/src"), 1.0, 10),
        proc(2, None, 1, Some("/repo/ws/foo"), 2.0, 20),
        proc(3, None, 1, Some("/repo-ws/bar"), 3.0, 30),
        proc(4, None, 1, Some("/repo-other"), 4.0, 40),
        proc(5, None, 1, Some("/repository"), 5.0, 50),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 99,
        path_contexts: vec![
            project("proj", "Demo", "/repo"),
            workspace("nested", "Nested", "proj", "/repo/ws"),
            workspace("sibling", "Sibling", "proj", "/repo-ws"),
        ],
        terminals: Vec::new(),
        port_cache: None,
    });

    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 1,
            start_time: 1
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: None,
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 2,
            start_time: 1
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: Some("nested".into()),
        }
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 3,
            start_time: 1
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: Some("sibling".into()),
        }
    );
    assert!(!output.assignments.contains_key(&ProcessKey {
        pid: 4,
        start_time: 1
    }));
    assert!(!output.assignments.contains_key(&ProcessKey {
        pid: 5,
        start_time: 1
    }));

    let project = &output.projects[0];
    assert_eq!(project.direct_usage.cpu_percent, 1.0);
    assert_eq!(project.usage.cpu_percent, 6.0);
    assert_eq!(project.workspaces[0].workspace_id, "nested");
    assert_eq!(project.workspaces[1].workspace_id, "sibling");
}

#[test]
fn missing_terminal_root_is_partial_without_invented_usage() {
    let output = attribute(AttributionInput {
        processes: vec![proc(1, None, 1, None, 1.0, 10)],
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals: vec![TerminalClaim {
            session_id: "gone".into(),
            name: Some("gone".into()),
            terminal_kind: "standard".into(),
            context_id: "proj".into(),
            root_pids: vec![4242],
            missing_root: true,
        }],
        port_cache: None,
    });
    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Partial
    );
    assert_eq!(output.unattributed.process_count, 0);
    assert_eq!(output.projects[0].sessions[0].session_id, "gone");
    assert_eq!(output.projects[0].sessions[0].usage.process_count, 0);
    assert_eq!(output.projects[0].usage.process_count, 0);
    assert_eq!(output.server.process_count, 1);
}

#[test]
fn unresolved_live_pid_is_unattributed_missing_pid_adds_nothing() {
    let output = attribute(AttributionInput {
        processes: vec![
            proc(1, None, 1, None, 1.0, 10),
            proc(30, None, 1, None, 3.0, 30),
        ],
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals: vec![
            simple_claim("stale", "missing-guid", 30),
            TerminalClaim {
                session_id: "gone".into(),
                name: Some("gone".into()),
                terminal_kind: "standard".into(),
                context_id: "missing-guid".into(),
                root_pids: vec![4242],
                missing_root: true,
            },
        ],
        port_cache: None,
    });
    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Partial
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 30,
            start_time: 1
        }],
        AssignmentOwner::Unattributed
    );
    assert_eq!(output.unattributed.process_count, 1);
    assert_eq!(output.unattributed.cpu_percent, 3.0);
    assert_eq!(output.unattributed.memory_rss_bytes, 30);
    assert!(output.projects.is_empty());
    assert_eq!(output.server.process_count, 1);
}

#[test]
fn tmux_unavailable_marks_tmux_handles_missing() {
    let roots = vec![
        TerminalRootInput {
            session_id: "tmux".into(),
            name: None,
            terminal_kind: "standard".into(),
            context_id: "ws".into(),
            simple_root_pid: None,
            tmux_session: Some("dev".into()),
            tmux_window_index: Some(1),
        },
        TerminalRootInput {
            session_id: "simple".into(),
            name: None,
            terminal_kind: "standard".into(),
            context_id: "ws".into(),
            simple_root_pid: Some(77),
            tmux_session: None,
            tmux_window_index: None,
        },
    ];
    let (claims, partial) = resolve_terminal_claims(&roots, None);
    assert!(partial);
    assert!(claims[0].missing_root);
    assert!(claims[0].root_pids.is_empty());
    assert_eq!(claims[1].root_pids, vec![77]);
    assert!(!claims[1].missing_root);
}

#[test]
fn context_prefers_project_guid_over_workspace() {
    let processes = vec![proc(10, None, 1, None, 1.0, 10)];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 1,
        path_contexts: vec![
            project("shared", "Project", "/proj"),
            workspace("shared", "Workspace", "shared", "/proj/ws"),
        ],
        terminals: vec![simple_claim("sess", "shared", 10)],
        port_cache: None,
    });
    assert_eq!(output.projects[0].direct_usage.process_count, 1);
    assert!(output.projects[0].workspaces.is_empty());
}

#[test]
fn server_pid_stays_server_when_cwd_is_inside_project() {
    let processes = vec![
        proc(1, None, 1, Some("/repo"), 5.0, 50),
        proc(10, Some(1), 1, Some("/repo/src"), 2.0, 20),
    ];
    let output = attribute(AttributionInput {
        processes: processes.clone(),
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/repo")],
        terminals: Vec::new(),
        port_cache: None,
    });

    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 1,
            start_time: 1
        }],
        AssignmentOwner::Server
    );
    assert_eq!(output.server.process_count, 1);
    assert_eq!(output.server.cpu_percent, 5.0);
    assert!(output.server.memory_rss_bytes > 0);
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 10,
            start_time: 1
        }],
        AssignmentOwner::Cwd {
            project_id: "proj".into(),
            workspace_id: None,
        }
    );
    let project = &output.projects[0];
    assert_eq!(project.usage.process_count, 1);
    assert_eq!(project.usage.cpu_percent, 2.0);
    assert_ne!(project.usage, output.server);
}

#[test]
fn terminal_root_equal_server_pid_does_not_steal_server() {
    let processes = vec![
        proc(1, None, 1, Some("/repo"), 5.0, 50),
        proc(10, Some(1), 1, Some("/repo/src"), 2.0, 20),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/repo")],
        terminals: vec![simple_claim("rogue", "proj", 1)],
        port_cache: None,
    });

    assert_eq!(
        output.attribution_status,
        ResourceAttributionStatus::Partial
    );
    assert_eq!(
        output.assignments[&ProcessKey {
            pid: 1,
            start_time: 1
        }],
        AssignmentOwner::Server
    );
    assert_eq!(output.server.cpu_percent, 5.0);
    assert_eq!(output.projects[0].sessions[0].session_id, "rogue");
    assert_eq!(output.projects[0].sessions[0].usage.process_count, 0);
    assert_eq!(output.projects[0].usage.cpu_percent, 2.0);
    assert_eq!(output.projects[0].direct_usage.cpu_percent, 2.0);
}

#[test]
fn windows_containment_strips_verbatim_prefix_and_ascii_case() {
    use std::path::Path;

    assert_eq!(
        normalize_windows_containment_key(Path::new(r"\\?\C:\Repo")),
        r"c:\repo"
    );
    assert_eq!(
        strip_windows_verbatim_prefix(r"\\?\UNC\Srv\Share\Repo"),
        r"\\Srv\Share\Repo"
    );
    assert_eq!(
        normalize_windows_containment_key(Path::new(r"\\?\UNC\Srv\Share\Repo")),
        r"\\srv\share\repo"
    );

    assert!(windows_path_contains(
        Path::new(r"\\?\C:\Repo"),
        Path::new(r"C:\repo\src")
    ));
    assert!(windows_path_contains(
        Path::new(r"\\?\UNC\Srv\Share\Repo"),
        Path::new(r"\\SRV\SHARE\repo\src")
    ));
    assert!(!windows_path_contains(
        Path::new(r"C:\Repo"),
        Path::new(r"C:\Repo-other")
    ));
    assert!(!windows_path_contains(
        Path::new(r"C:\Repo"),
        Path::new(r"C:\Repository")
    ));
}

#[test]
fn normalize_path_canonicalizes_existing_and_falls_back_lexically() {
    let missing = PathBuf::from("/does-not-exist-atmos-rm/foo/../ws");
    assert_eq!(
        normalize_path(&missing),
        PathBuf::from("/does-not-exist-atmos-rm/ws")
    );

    let tmp = tempfile::tempdir().unwrap();
    let real = tmp.path().join("real");
    std::fs::create_dir(&real).unwrap();
    let expected = real.canonicalize().unwrap();
    assert_eq!(normalize_path(&real), expected);

    #[cfg(unix)]
    {
        let link = tmp.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert_eq!(normalize_path(&link), expected);
    }
}

fn proc_named(
    pid: u32,
    parent: Option<u32>,
    cwd: Option<&str>,
    name: &str,
    cpu: f32,
    memory: u64,
) -> ResourceProcessSample {
    ResourceProcessSample {
        collected_at_ms: 1,
        pid,
        parent_pid: parent,
        start_time: 1,
        cwd: cwd.map(PathBuf::from),
        name: Some(name.to_string()),
        cpu_percent: cpu,
        memory_rss_bytes: memory,
    }
}

fn listener(pid: u32, process_name: Option<&str>, port: u16) -> CachedListenerPort {
    CachedListenerPort {
        pid,
        process_name: process_name.map(str::to_string),
        port,
    }
}

fn leaf_names(
    project: &crate::service::resource_monitor::types::ResourceProjectMetrics,
) -> Vec<String> {
    let mut names = Vec::new();
    for session in &project.sessions {
        names.extend(session.processes.iter().map(|process| process.name.clone()));
    }
    names.extend(
        project
            .other_processes
            .iter()
            .map(|process| process.name.clone()),
    );
    for workspace in &project.workspaces {
        for session in &workspace.sessions {
            names.extend(session.processes.iter().map(|process| process.name.clone()));
        }
        names.extend(
            workspace
                .other_processes
                .iter()
                .map(|process| process.name.clone()),
        );
    }
    names
}

fn assert_memory_count_sum(parent: &ResourceUsage, parts: &[&ResourceUsage]) {
    let memory: u64 = parts.iter().map(|usage| usage.memory_rss_bytes).sum();
    let count: u32 = parts.iter().map(|usage| usage.process_count).sum();
    assert_eq!(parent.memory_rss_bytes, memory);
    assert_eq!(parent.process_count, count);
}

/// S17 — exclusive session / project-cwd / workspace-cwd leaves and parent reconciliation.
#[test]
fn exclusive_leaves_nested_sessions_and_project_direct_workspace_cwd() {
    let processes = vec![
        proc_named(10, None, Some("/proj"), "zsh", 1.0, 10),
        proc_named(11, Some(10), Some("/proj"), "cargo", 2.0, 20),
        proc_named(40, None, Some("/proj/src"), "eslint", 3.0, 30),
        proc_named(20, None, Some("/proj/ws"), "bash", 4.0, 40),
        proc_named(21, Some(20), Some("/proj/ws"), "node", 5.0, 50),
        proc_named(22, Some(21), Some("/proj/ws"), "node-worker", 1.0, 15),
        proc_named(50, None, Some("/proj/ws/app"), "vite", 6.0, 60),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: vec![
            simple_claim("proj-session", "proj", 10),
            simple_claim("ws-shallow", "ws", 20),
            simple_claim("ws-deep", "ws", 21),
        ],
        port_cache: None,
    });

    let project = &output.projects[0];
    assert_eq!(project.sessions.len(), 1);
    assert_eq!(project.sessions[0].session_id, "proj-session");
    assert_eq!(
        project.sessions[0]
            .processes
            .iter()
            .map(|process| process.name.as_str())
            .collect::<Vec<_>>(),
        vec!["cargo", "zsh"]
    );
    assert_eq!(project.other_processes.len(), 1);
    assert_eq!(project.other_processes[0].name, "eslint");
    assert_eq!(project.other_usage.process_count, 1);
    assert_eq!(project.other_usage.memory_rss_bytes, 30);

    let workspace = &project.workspaces[0];
    assert_eq!(workspace.sessions.len(), 2);
    assert_eq!(workspace.sessions[0].session_id, "ws-deep");
    assert_eq!(
        workspace.sessions[0]
            .processes
            .iter()
            .map(|process| process.name.as_str())
            .collect::<Vec<_>>(),
        vec!["node", "node-worker"]
    );
    assert_eq!(workspace.sessions[1].session_id, "ws-shallow");
    assert_eq!(workspace.sessions[1].processes[0].name, "bash");
    assert!(!workspace.sessions.iter().any(|session| session
        .processes
        .iter()
        .any(|process| process.name == "vite")));
    assert_eq!(workspace.other_processes.len(), 1);
    assert_eq!(workspace.other_processes[0].name, "vite");

    let names = leaf_names(project);
    let unique: HashSet<_> = names.iter().cloned().collect();
    assert_eq!(
        names.len(),
        unique.len(),
        "each assigned process has one leaf"
    );
    assert_eq!(
        unique,
        HashSet::from([
            "zsh".into(),
            "cargo".into(),
            "eslint".into(),
            "bash".into(),
            "node".into(),
            "node-worker".into(),
            "vite".into(),
        ])
    );

    assert_memory_count_sum(
        &project.direct_usage,
        &[&project.sessions[0].usage, &project.other_usage],
    );
    assert_memory_count_sum(
        &workspace.usage,
        &[
            &workspace.sessions[0].usage,
            &workspace.sessions[1].usage,
            &workspace.other_usage,
        ],
    );
    assert_memory_count_sum(&project.usage, &[&project.direct_usage, &workspace.usage]);
    assert_memory_count_sum(
        &project.sessions[0].usage,
        &[
            &project.sessions[0].processes[0].usage,
            &project.sessions[0].processes[1].usage,
        ],
    );
}

#[test]
fn groups_case_insensitive_basename_and_merges_sorted_ports() {
    let processes = vec![
        proc_named(70, None, Some("/proj/ws"), "Node", 2.0, 20),
        proc_named(71, None, Some("/proj/ws"), "node", 3.0, 30),
        proc_named(72, None, Some("/proj/ws"), "/usr/bin/python", 1.0, 10),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: Vec::new(),
        port_cache: Some(vec![
            listener(70, Some("node"), 3000),
            listener(70, Some("NODE"), 3001),
            listener(71, Some("Node"), 4173),
            listener(72, Some("python"), 8000),
            listener(72, Some("python"), 8000),
            listener(72, None, 8001),
        ]),
    });

    let others = &output.projects[0].workspaces[0].other_processes;
    assert_eq!(
        others
            .iter()
            .map(|process| process.name.as_str())
            .collect::<Vec<_>>(),
        vec!["Node", "python"]
    );
    assert_eq!(others[0].usage.process_count, 2);
    assert_eq!(others[0].usage.memory_rss_bytes, 50);
    assert_eq!(others[0].ports, vec![3000, 3001, 4173]);
    assert_eq!(others[1].name, "python");
    assert_eq!(
        others[1].ports,
        vec![8000],
        "listener without a process name must not attach a port"
    );
}

#[test]
fn name_mismatch_does_not_attach_ports_and_resource_owner_wins() {
    let processes = vec![proc_named(80, None, Some("/proj/ws"), "python", 1.0, 10)];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: Vec::new(),
        port_cache: Some(vec![
            listener(80, Some("node"), 4000),
            listener(81, Some("python"), 5000),
        ]),
    });

    let process = &output.projects[0].workspaces[0].other_processes[0];
    assert_eq!(process.name, "python");
    assert!(process.ports.is_empty());
    assert_eq!(output.projects[0].workspaces[0].workspace_id, "ws");
}

#[test]
fn missing_listener_or_sample_name_does_not_attach_ports() {
    let processes = vec![
        proc_named(80, None, Some("/proj/ws"), "node", 1.0, 10),
        proc_named(81, None, Some("/proj/ws"), "vite", 1.0, 10),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![
            project("proj", "Demo", "/proj"),
            workspace("ws", "Feature", "proj", "/proj/ws"),
        ],
        terminals: Vec::new(),
        port_cache: Some(vec![
            listener(80, None, 3000),
            listener(80, Some("   "), 3001),
            listener(81, Some("vite"), 4173),
        ]),
    });

    let others = &output.projects[0].workspaces[0].other_processes;
    let node = others
        .iter()
        .find(|process| process.name == "node")
        .unwrap();
    let vite = others
        .iter()
        .find(|process| process.name == "vite")
        .unwrap();
    assert!(
        node.ports.is_empty(),
        "fail-closed: missing or blank listener name must not attach"
    );
    assert_eq!(vite.ports, vec![4173]);
}

#[test]
fn blank_or_missing_name_skips_leaf_but_keeps_parent_usage() {
    let processes = vec![
        proc_named(10, None, Some("/proj"), "zsh", 1.0, 10),
        ResourceProcessSample {
            collected_at_ms: 1,
            pid: 11,
            parent_pid: Some(10),
            start_time: 1,
            cwd: Some(PathBuf::from("/proj")),
            name: None,
            cpu_percent: 2.0,
            memory_rss_bytes: 20,
        },
        proc_named(12, Some(10), Some("/proj"), "   ", 3.0, 30),
        ResourceProcessSample {
            collected_at_ms: 1,
            pid: 40,
            parent_pid: None,
            start_time: 1,
            cwd: Some(PathBuf::from("/proj/src")),
            name: None,
            cpu_percent: 4.0,
            memory_rss_bytes: 40,
        },
        proc_named(41, None, Some("/proj/lib"), "\t", 5.0, 50),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals: vec![simple_claim("proj-session", "proj", 10)],
        port_cache: Some(vec![
            listener(11, Some("hidden"), 7000),
            listener(40, Some("eslint"), 7001),
        ]),
    });

    let project = &output.projects[0];
    assert_eq!(
        project.sessions[0]
            .processes
            .iter()
            .map(|process| process.name.as_str())
            .collect::<Vec<_>>(),
        vec!["zsh"]
    );
    assert!(!project.sessions[0]
        .processes
        .iter()
        .any(|process| process.name.trim().is_empty()));
    assert_eq!(project.sessions[0].usage.process_count, 3);
    assert_eq!(project.sessions[0].usage.memory_rss_bytes, 60);
    assert!(
        project.other_processes.is_empty(),
        "None/blank cwd names must not emit empty leaf groups"
    );
    assert_eq!(project.other_usage.process_count, 2);
    assert_eq!(project.other_usage.memory_rss_bytes, 90);
    assert_eq!(project.direct_usage.process_count, 5);
    assert_eq!(project.direct_usage.memory_rss_bytes, 150);
}

#[test]
fn missing_port_cache_still_emits_process_names() {
    let processes = vec![proc_named(90, None, Some("/proj"), "eslint", 1.0, 10)];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 99,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals: Vec::new(),
        port_cache: None,
    });

    assert_eq!(output.projects[0].other_processes.len(), 1);
    assert_eq!(output.projects[0].other_processes[0].name, "eslint");
    assert!(output.projects[0].other_processes[0].ports.is_empty());
}

#[test]
fn snapshot_json_omits_process_identity_fields() {
    let processes = vec![
        proc_named(10, None, Some("/proj"), "zsh", 1.0, 10),
        proc_named(1, None, Some("/atmos"), "atmos", 2.0, 20),
        proc_named(2, Some(1), Some("/atmos"), "helper", 1.0, 5),
        proc_named(30, None, None, "orphan", 3.0, 30),
    ];
    let output = attribute(AttributionInput {
        processes,
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals: vec![
            simple_claim("proj-session", "proj", 10),
            simple_claim("stale", "missing-guid", 30),
        ],
        port_cache: Some(vec![listener(10, Some("zsh"), 9229)]),
    });

    let snapshot = crate::service::resource_monitor::types::ResourceMonitorSnapshot {
        collected_at_ms: 1,
        host: crate::service::resource_monitor::types::ResourceHostMetrics {
            cpu_percent: 1.0,
            memory_used_bytes: 2,
            memory_total_bytes: 3,
            logical_cpu_count: 4,
        },
        server: output.server.clone(),
        shared_runtime: output.shared_runtime.clone(),
        projects: output.projects.clone(),
        unattributed: output.unattributed.clone(),
        attribution_status: output.attribution_status,
    };
    let value = serde_json::to_value(&snapshot).unwrap();
    let keys = json_object_keys(&value);
    for forbidden in [
        "pid",
        "start_time",
        "cmdline",
        "command",
        "command_line",
        "exe",
        "user",
        "env",
        "cwd",
    ] {
        assert!(
            !keys.contains(forbidden),
            "snapshot leaked identity key {forbidden}"
        );
    }
    assert!(keys.contains("processes"));
    assert!(keys.contains("other_processes"));
    assert!(keys.contains("other_usage"));
    assert!(keys.contains("ports"));
    assert_eq!(
        value["projects"][0]["sessions"][0]["processes"][0]["ports"],
        serde_json::json!([9229])
    );

    for bucket in ["server", "shared_runtime", "unattributed"] {
        let object = value[bucket].as_object().unwrap();
        assert!(
            !object.contains_key("processes"),
            "{bucket} exposed process names"
        );
        assert!(!object.contains_key("name"));
        assert!(!object.contains_key("ports"));
    }
}

fn json_object_keys(value: &serde_json::Value) -> HashSet<String> {
    let mut keys = HashSet::new();
    collect_json_keys(value, &mut keys);
    keys
}

fn collect_json_keys(value: &serde_json::Value, keys: &mut HashSet<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                keys.insert(key.clone());
                collect_json_keys(child, keys);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_json_keys(child, keys);
            }
        }
        _ => {}
    }
}

#[test]
fn hundred_sessions_five_process_groups_stay_under_payload_budget() {
    const SESSION_COUNT: u32 = 100;
    const GROUPS: [&str; 5] = ["node", "vite", "eslint", "cargo", "python"];
    const BUDGET_BYTES: usize = 256 * 1024;

    let mut processes = Vec::new();
    let mut terminals = Vec::new();
    let mut pid = 1_000_u32;
    for index in 0..SESSION_COUNT {
        let root = pid;
        terminals.push(simple_claim(&format!("sess-{index:03}"), "proj", root));
        for (offset, name) in GROUPS.iter().enumerate() {
            let parent = (offset > 0).then_some(root);
            processes.push(proc_named(pid, parent, Some("/proj"), name, 0.1, 1024));
            pid += 1;
        }
    }

    let output = attribute(AttributionInput {
        processes,
        server_pid: 1,
        path_contexts: vec![project("proj", "Demo", "/proj")],
        terminals,
        port_cache: None,
    });
    assert_eq!(output.projects[0].sessions.len(), SESSION_COUNT as usize);
    assert!(output.projects[0].sessions.iter().all(|session| {
        session.processes.len() == GROUPS.len()
            && session
                .processes
                .iter()
                .all(|process| GROUPS.contains(&process.name.as_str()))
    }));

    let snapshot = crate::service::resource_monitor::types::ResourceMonitorSnapshot {
        collected_at_ms: 1,
        host: crate::service::resource_monitor::types::ResourceHostMetrics {
            cpu_percent: 1.0,
            memory_used_bytes: 2,
            memory_total_bytes: 3,
            logical_cpu_count: 4,
        },
        server: output.server,
        shared_runtime: output.shared_runtime,
        projects: output.projects,
        unattributed: output.unattributed,
        attribution_status: output.attribution_status,
    };
    let bytes = serde_json::to_vec(&snapshot).expect("serialize snapshot");
    assert!(
        bytes.len() < BUDGET_BYTES,
        "100 sessions × 5 process groups serialized to {} bytes (budget {} bytes). Do not truncate; shrink names or grouping if this regresses.",
        bytes.len(),
        BUDGET_BYTES
    );
}
