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
