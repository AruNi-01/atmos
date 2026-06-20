use std::collections::{HashMap, HashSet};

use super::*;
use core_engine::TmuxEngine;

impl WsMessageService {
    pub(super) async fn handle_terminal_workspace_candidates(
        &self,
        req: TerminalWorkspaceCandidatesRequest,
    ) -> Result<Value> {
        let workspace_id = req.workspace_id.trim().to_string();
        if workspace_id.is_empty() {
            return Err(ServiceError::Validation(
                "workspace_id is required".to_string(),
            ));
        }

        let (project_name, workspace_name) = self
            .resolve_terminal_workspace_names(
                &workspace_id,
                req.project_name.as_deref(),
                req.workspace_name.as_deref(),
            )
            .await?;

        let tmux_engine = self.terminal_service.tmux_engine();
        let mut tmux_session_names = Vec::new();
        if let (Some(project), Some(workspace)) = (project_name.as_ref(), workspace_name.as_ref()) {
            tmux_session_names.push(tmux_engine.get_session_name_from_names(project, workspace));
        }
        tmux_session_names.push(tmux_engine.get_session_name(&workspace_id));
        tmux_session_names.sort();
        tmux_session_names.dedup();

        let mut windows_by_session: HashMap<String, HashMap<u32, String>> = HashMap::new();
        for session_name in &tmux_session_names {
            let windows = match tmux_engine.list_windows(session_name) {
                Ok(windows) => windows,
                Err(error) => {
                    tracing::debug!(
                        "terminal_workspace_candidates: tmux session {} unavailable: {}",
                        session_name,
                        error
                    );
                    continue;
                }
            };

            windows_by_session.insert(
                session_name.clone(),
                windows
                    .into_iter()
                    .map(|window| (window.index, window.name))
                    .collect(),
            );
        }

        let active_sessions = self.terminal_service.list_session_details().await;
        let mut candidates = Vec::new();
        let mut seen_windows: HashSet<(String, u32)> = HashSet::new();
        let mut seen_session_ids: HashSet<String> = HashSet::new();

        for session in active_sessions
            .into_iter()
            .filter(|session| session.workspace_id == workspace_id)
        {
            let resolved_window_name = session.terminal_name.clone().or_else(|| {
                let session_name = session.tmux_session.as_ref()?;
                let window_index = session.tmux_window_index?;
                resolve_tmux_window_name(
                    &tmux_engine,
                    &mut windows_by_session,
                    session_name,
                    window_index,
                )
            });

            if let (Some(session_name), Some(window_index)) =
                (session.tmux_session.clone(), session.tmux_window_index)
            {
                seen_windows.insert((session_name, window_index));
            }
            seen_session_ids.insert(session.session_id.clone());

            let label = resolved_window_name
                .clone()
                .or_else(|| session.terminal_name.clone())
                .or_else(|| session.cwd.clone())
                .unwrap_or_else(|| "Active terminal".to_string());

            candidates.push(TerminalWorkspaceCandidate {
                id: format!("session:{}", session.session_id),
                workspace_id: session.workspace_id,
                label,
                session_id: Some(session.session_id),
                tmux_session: session.tmux_session,
                tmux_window_name: resolved_window_name,
                tmux_window_index: session.tmux_window_index,
                session_type: Some(format!("{:?}", session.session_type).to_lowercase()),
                project_name: session.project_name.or_else(|| project_name.clone()),
                workspace_name: session.workspace_name.or_else(|| workspace_name.clone()),
                terminal_name: session.terminal_name,
                cwd: session.cwd,
                active: true,
            });
        }

        for session_name in tmux_session_names {
            let Some(windows) = windows_by_session.get(&session_name) else {
                continue;
            };

            let mut sorted_windows: Vec<_> = windows.iter().collect();
            sorted_windows.sort_by_key(|(index, _)| **index);

            for (window_index, window_name) in sorted_windows {
                if seen_windows.contains(&(session_name.clone(), *window_index)) {
                    continue;
                }

                let session_id = format!("{}:tmux:{}", workspace_id, window_index);
                if !seen_session_ids.insert(session_id.clone()) {
                    continue;
                }

                candidates.push(TerminalWorkspaceCandidate {
                    id: format!("tmux:{}:{}", session_name, window_index),
                    workspace_id: workspace_id.clone(),
                    label: window_name.to_string(),
                    session_id: Some(session_id),
                    tmux_session: Some(session_name.clone()),
                    tmux_window_name: Some(window_name.to_string()),
                    tmux_window_index: Some(*window_index),
                    session_type: Some("tmux".to_string()),
                    project_name: project_name.clone(),
                    workspace_name: workspace_name.clone(),
                    terminal_name: Some(window_name.to_string()),
                    cwd: None,
                    active: false,
                });
            }
        }

        Ok(json!(TerminalWorkspaceCandidatesResponse { candidates }))
    }

    async fn resolve_terminal_workspace_names(
        &self,
        workspace_id: &str,
        requested_project_name: Option<&str>,
        requested_workspace_name: Option<&str>,
    ) -> Result<(Option<String>, Option<String>)> {
        let mut project_name = requested_project_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let mut workspace_name = requested_workspace_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);

        if project_name.is_some() && workspace_name.is_some() {
            return Ok((project_name, workspace_name));
        }

        let Some(workspace) = self
            .workspace_service
            .get_workspace(workspace_id.to_string())
            .await?
        else {
            return Ok((project_name, workspace_name));
        };

        workspace_name.get_or_insert(workspace.model.name.clone());

        if project_name.is_none() {
            if let Some(project) = self
                .project_service
                .get_project(workspace.model.project_guid.clone())
                .await?
            {
                project_name = Some(project.name);
            }
        }

        Ok((project_name, workspace_name))
    }
}

fn resolve_tmux_window_name(
    tmux_engine: &TmuxEngine,
    windows_by_session: &mut HashMap<String, HashMap<u32, String>>,
    session_name: &str,
    window_index: u32,
) -> Option<String> {
    if !windows_by_session.contains_key(session_name) {
        let windows = tmux_engine
            .list_windows(session_name)
            .map(|windows| {
                windows
                    .into_iter()
                    .map(|window| (window.index, window.name))
                    .collect()
            })
            .unwrap_or_default();
        windows_by_session.insert(session_name.to_string(), windows);
    }

    windows_by_session
        .get(session_name)
        .and_then(|windows| windows.get(&window_index).cloned())
}
