use std::collections::{HashMap, HashSet};

use super::*;
use core_engine::TmuxEngine;
use core_service::{
    CaptureSideContextParams, TerminalSideChatRecord, TerminalSideChatStatus,
    UpsertTerminalSideChatParams,
};

impl WsMessageService {
    /// APP-055: rotate/open latest Run log and write a start header.
    pub(super) fn handle_run_log_start(&self, req: RunLogStartRequest) -> Result<Value> {
        let latest_path = self.terminal_service.run_log_start(
            &req.project_root,
            &req.window_name,
            req.command.as_deref(),
        )?;
        Ok(json!(RunLogStartResponse { latest_path }))
    }

    /// APP-055: resolve preferred latest Run log path (if any).
    pub(super) fn handle_run_log_resolve_latest(
        &self,
        req: RunLogResolveLatestRequest,
    ) -> Result<Value> {
        let latest_path = self
            .terminal_service
            .run_log_resolve_latest(&req.project_root);
        Ok(json!(RunLogResolveLatestResponse { latest_path }))
    }

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
                terminal_kind: Some(session.terminal_kind.as_str().to_string()),
                side_chat_id: session.side_chat_id,
                source_pane_id: session.source_pane_id,
                source_tmux_window_name: session.source_tmux_window_name,
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
                let metadata = tmux_engine
                    .get_window_atmos_metadata(&session_name, *window_index)
                    .unwrap_or_default();

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
                    terminal_kind: metadata.terminal_kind,
                    side_chat_id: metadata.side_chat_id,
                    source_pane_id: metadata.source_pane_id,
                    source_tmux_window_name: metadata.source_tmux_window_name,
                    active: false,
                });
            }
        }

        Ok(json!(TerminalWorkspaceCandidatesResponse { candidates }))
    }

    pub(super) async fn handle_terminal_side_context_capture(
        &self,
        req: TerminalSideContextCaptureRequest,
    ) -> Result<Value> {
        let captured = self
            .terminal_service
            .capture_side_context(CaptureSideContextParams {
                workspace_id: req.workspace_id,
                project_name: req.project_name,
                workspace_name: req.workspace_name,
                source_session_id: req.source_session_id,
                source_tmux_window_name: req.source_tmux_window_name,
                max_prompt_bytes: req.max_prompt_bytes,
            })
            .await?;

        Ok(json!(TerminalSideContextCaptureResponse {
            workspace_id: captured.workspace_id,
            project_name: captured.project_name,
            workspace_name: captured.workspace_name,
            tmux_window_name: captured.tmux_window_name,
            tmux_window_index: captured.tmux_window_index,
            captured_lines: captured.captured_lines,
            captured_bytes: captured.captured_bytes,
            prompt_budget_bytes: captured.prompt_budget_bytes,
            omitted_older_bytes: captured.omitted_older_bytes,
            omitted_middle_bytes: captured.omitted_middle_bytes,
            truncated_bytes: captured.truncated_bytes,
            text: captured.text,
        }))
    }

    pub(super) async fn handle_terminal_side_chat_list(
        &self,
        req: TerminalSideChatListRequest,
    ) -> Result<Value> {
        let workspace_id = req.workspace_id.trim().to_string();
        if workspace_id.is_empty() {
            return Err(ServiceError::Validation(
                "workspace_id is required".to_string(),
            ));
        }

        let records = self
            .terminal_service
            .list_side_chat_records(&workspace_id)
            .await?
            .into_iter()
            .map(side_chat_record_to_dto)
            .collect();

        Ok(json!(TerminalSideChatListResponse {
            workspace_id,
            records,
        }))
    }

    pub(super) async fn handle_terminal_side_chat_upsert(
        &self,
        req: TerminalSideChatUpsertRequest,
    ) -> Result<Value> {
        let status = TerminalSideChatStatus::try_from(req.record.status.as_str())
            .map_err(ServiceError::Validation)?;
        let record = self
            .terminal_service
            .upsert_side_chat_record(UpsertTerminalSideChatParams {
                side_chat_id: req.record.side_chat_id,
                workspace_id: req.record.workspace_id,
                project_name: req.record.project_name,
                workspace_name: req.record.workspace_name,
                source_pane_id: req.record.source_pane_id,
                source_tmux_window_name: req.record.source_tmux_window_name,
                source_surface_kind: req.record.source_surface_kind,
                source_surface_ref_json: req.record.source_surface_ref_json,
                side_tmux_window_name: req.record.side_tmux_window_name,
                agent_ref_json: req.record.agent_ref_json,
                color_hex: req.record.color_hex,
                status,
            })
            .await?;
        Ok(json!(side_chat_record_to_dto(record)))
    }

    pub(super) async fn handle_terminal_side_chat_status_update(
        &self,
        req: TerminalSideChatStatusRequest,
    ) -> Result<Value> {
        let status = TerminalSideChatStatus::try_from(req.status.as_str())
            .map_err(ServiceError::Validation)?;
        let record = self
            .terminal_service
            .set_side_chat_status(&req.workspace_id, &req.side_chat_id, status)
            .await?;
        Ok(json!(side_chat_record_to_dto(record)))
    }

    pub(super) async fn handle_terminal_side_chat_close(
        &self,
        req: TerminalSideChatCloseRequest,
    ) -> Result<Value> {
        self.terminal_service
            .close_side_chat(&req.workspace_id, &req.side_chat_id)
            .await?;
        Ok(json!({
            "ok": true,
            "workspace_id": req.workspace_id,
            "side_chat_id": req.side_chat_id,
            "closed": true,
        }))
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

fn side_chat_record_to_dto(record: TerminalSideChatRecord) -> TerminalSideChatRecordDto {
    TerminalSideChatRecordDto {
        side_chat_id: record.side_chat_id,
        workspace_id: record.workspace_id,
        project_name: record.project_name,
        workspace_name: record.workspace_name,
        source_pane_id: record.source_pane_id,
        source_tmux_window_name: record.source_tmux_window_name,
        source_surface_kind: record.source_surface_kind,
        source_surface_ref_json: record.source_surface_ref_json,
        side_tmux_window_name: record.side_tmux_window_name,
        agent_ref_json: record.agent_ref_json,
        color_hex: record.color_hex,
        status: record.status.as_str().to_string(),
        created_at: Some(record.created_at.and_utc().to_rfc3339()),
        updated_at: Some(record.updated_at.and_utc().to_rfc3339()),
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
