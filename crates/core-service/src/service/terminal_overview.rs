//! Terminal overview helpers (diagnostics / manager UI).

use crate::error::Result;
use crate::service::project::ProjectService;
use crate::service::terminal::TerminalService;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// Builds JSON objects for `GET /api/system/terminal-overview` `active_sessions`,
/// including `context_scope` and resolved `tmux_window_name`, with batched project
/// existence checks and per-tmux-session window list caching.
pub async fn build_terminal_overview_active_sessions_json(
    terminal_service: &TerminalService,
    project_service: &ProjectService,
) -> Result<(Vec<Value>, usize)> {
    let active_sessions = terminal_service.list_session_details().await;
    let active_session_count = active_sessions.len();

    let mut unique_workspace_ids: Vec<String> = active_sessions
        .iter()
        .map(|s| s.workspace_id.clone())
        .collect();
    unique_workspace_ids.sort_unstable();
    unique_workspace_ids.dedup();

    let existing_projects = project_service
        .existing_non_deleted_project_guids(&unique_workspace_ids)
        .await?;

    let tmux_engine = terminal_service.tmux_engine();
    let mut tmux_window_names_by_session: HashMap<String, HashMap<u32, String>> = HashMap::new();
    let mut active_sessions_json = Vec::with_capacity(active_sessions.len());

    for s in active_sessions {
        let context_scope = if existing_projects.contains(&s.workspace_id) {
            "project"
        } else {
            "workspace"
        };

        let tmux_window_name = if let Some(name) = s.terminal_name.clone() {
            Some(name)
        } else if let (Some(session_name), Some(window_index)) =
            (s.tmux_session.as_ref(), s.tmux_window_index)
        {
            let session_windows = tmux_window_names_by_session
                .entry(session_name.clone())
                .or_insert_with(|| {
                    tmux_engine
                        .list_windows(session_name)
                        .map(|windows| {
                            windows
                                .into_iter()
                                .map(|window| (window.index, window.name))
                                .collect::<HashMap<_, _>>()
                        })
                        .unwrap_or_default()
                });

            session_windows.get(&window_index).cloned()
        } else {
            None
        };

        active_sessions_json.push(json!({
            "session_id": s.session_id,
            "workspace_id": s.workspace_id,
            "context_scope": context_scope,
            "session_type": s.session_type,
            "project_name": s.project_name,
            "workspace_name": s.workspace_name,
            "terminal_name": s.terminal_name,
            "tmux_session": s.tmux_session,
            "tmux_window_index": s.tmux_window_index,
            "tmux_window_name": tmux_window_name,
            "cwd": s.cwd,
            "uptime_secs": s.uptime_secs,
        }));
    }

    Ok((active_sessions_json, active_session_count))
}
