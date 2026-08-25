use std::collections::HashSet;
use std::path::PathBuf;

use core_engine::{TmuxPaneCapturePage, TmuxPaneSnapshot, TmuxWindowAtmosMetadata};
use infra::db::entities::terminal_side_chat;
use infra::{TerminalSideChatRepo, UpsertTerminalSideChatInput};
use tracing::{debug, info, warn};

use crate::error::{Result, ServiceError};

use super::runtime::apply_utf8_env_to_tmux_command;
use super::text_capture::{
    count_lines, process_captured_pane_text, TranscriptBudget, DEFAULT_CAPTURE_APPROX_LINES,
    DEFAULT_HEAD_PREFIX_BYTES, DEFAULT_MAX_RAW_CAPTURE_BYTES, DEFAULT_PROMPT_BUDGET_BYTES,
    MAX_PROMPT_BUDGET_BYTES, MIN_PROMPT_BUDGET_BYTES,
};
use super::{
    CapturePanePlainTextParams, CaptureSideContextParams, CapturedPanePlainText,
    CapturedSideContext, SessionCommand, SessionDetail, SessionHandle, TerminalResourceRoot,
    TerminalService, TerminalSideChatRecord, TerminalSideChatStatus, UpsertTerminalSideChatParams,
};

impl TerminalService {
    /// Capture bounded plain tmux text for any consumer (side chat, /spawn, attention, …).
    ///
    /// Uses `capture-pane` without `-e` (cells, not SGR), then strips residual ANSI and
    /// windows the transcript to the requested byte budget.
    pub async fn capture_pane_plain_text(
        &self,
        params: CapturePanePlainTextParams,
    ) -> Result<CapturedPanePlainText> {
        let workspace_id = params.workspace_id.trim().to_string();
        if workspace_id.is_empty() {
            return Err(ServiceError::Validation("workspace_id is required".into()));
        }

        let source_tmux_window_name = params.source_tmux_window_name.trim().to_string();
        if source_tmux_window_name.is_empty() {
            return Err(ServiceError::Validation(
                "source_tmux_window_name is required".into(),
            ));
        }

        // Generic API: soft bounds only. Side-chat wrapper applies the stricter 8k–128k clamp.
        let text_budget_bytes = params
            .max_text_bytes
            .map(|value| value as usize)
            .unwrap_or(DEFAULT_PROMPT_BUDGET_BYTES)
            .clamp(1, MAX_PROMPT_BUDGET_BYTES);
        let approx_lines = params
            .approx_lines
            .unwrap_or(DEFAULT_CAPTURE_APPROX_LINES)
            .clamp(1, 50_000);
        let max_raw_bytes = params
            .max_raw_bytes
            .unwrap_or(DEFAULT_MAX_RAW_CAPTURE_BYTES)
            .max(text_budget_bytes);
        let head_prefix_bytes = params
            .head_prefix_bytes
            .unwrap_or(DEFAULT_HEAD_PREFIX_BYTES);
        let budget = TranscriptBudget {
            max_text_bytes: text_budget_bytes,
            head_prefix_bytes,
        };

        let primary_tmux_session = self
            .resolve_tmux_session_name(
                &workspace_id,
                params.project_name.as_deref(),
                params.workspace_name.as_deref(),
            )
            .await;

        let capture_target = if let Some(source_session_id) = params
            .source_session_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            self.resolve_active_session_capture_target(source_session_id, &workspace_id)
                .await
        } else {
            None
        };

        let (tmux_session, tmux_window_index, tmux_window_name) =
            if let Some(target) = capture_target {
                target
            } else {
                self.resolve_capture_target_by_window_name(
                    &primary_tmux_session,
                    &source_tmux_window_name,
                )?
            };

        let raw_full =
            self.tmux_engine
                .capture_pane_text(&tmux_session, tmux_window_index, approx_lines)?;
        let selected = process_captured_pane_text(&raw_full, max_raw_bytes, budget);
        let captured_lines = count_lines(&selected.text);
        let captured_bytes = selected.text.len();

        Ok(CapturedPanePlainText {
            workspace_id,
            project_name: params.project_name,
            workspace_name: params.workspace_name,
            tmux_session,
            tmux_window_name,
            tmux_window_index,
            captured_lines,
            captured_bytes: captured_bytes as u32,
            text_budget_bytes: text_budget_bytes as u32,
            omitted_older_bytes: selected.omitted_older_bytes as u32,
            omitted_middle_bytes: selected.omitted_middle_bytes as u32,
            truncated_bytes: selected.truncated,
            text: selected.text,
        })
    }

    /// Capture bounded plain tmux text for `/side` and `/spawn` prompt construction.
    ///
    /// Thin wrapper over [`Self::capture_pane_plain_text`] with side-chat budgets.
    pub async fn capture_side_context(
        &self,
        params: CaptureSideContextParams,
    ) -> Result<CapturedSideContext> {
        let max_prompt_bytes = params
            .max_prompt_bytes
            .map(|value| value as usize)
            .unwrap_or(DEFAULT_PROMPT_BUDGET_BYTES)
            .clamp(MIN_PROMPT_BUDGET_BYTES, MAX_PROMPT_BUDGET_BYTES)
            as u32;
        let captured = self
            .capture_pane_plain_text(CapturePanePlainTextParams {
                workspace_id: params.workspace_id,
                project_name: params.project_name,
                workspace_name: params.workspace_name,
                source_session_id: params.source_session_id,
                source_tmux_window_name: params.source_tmux_window_name,
                max_text_bytes: Some(max_prompt_bytes),
                approx_lines: None,
                max_raw_bytes: None,
                head_prefix_bytes: None,
            })
            .await?;
        Ok(captured.into())
    }

    async fn resolve_active_session_capture_target(
        &self,
        session_id: &str,
        workspace_id: &str,
    ) -> Option<(String, u32, String)> {
        let (tmux_session, tmux_window_index, terminal_name) = {
            let sessions = self.sessions.lock().await;
            let handle = sessions.get(session_id)?;
            if handle.workspace_id != workspace_id {
                return None;
            }
            (
                handle.tmux_session.clone()?,
                handle.tmux_window_index?,
                handle.terminal_name.clone().unwrap_or_default(),
            )
        };
        let tmux_window_name =
            self.tmux_window_name_for_index(&tmux_session, tmux_window_index, &terminal_name);
        Some((tmux_session, tmux_window_index, tmux_window_name))
    }

    fn resolve_capture_target_by_window_name(
        &self,
        tmux_session: &str,
        tmux_window_name: &str,
    ) -> Result<(String, u32, String)> {
        if let Some(window_index) = self
            .tmux_engine
            .find_window_index_by_name(tmux_session, tmux_window_name)?
        {
            let window_name =
                self.tmux_window_name_for_index(tmux_session, window_index, tmux_window_name);
            return Ok((tmux_session.to_string(), window_index, window_name));
        }

        Err(ServiceError::NotFound(format!(
            "Tmux window with name '{}' not found",
            tmux_window_name
        )))
    }

    fn tmux_window_name_for_index(
        &self,
        tmux_session: &str,
        tmux_window_index: u32,
        fallback: &str,
    ) -> String {
        self.tmux_engine
            .list_windows(tmux_session)
            .ok()
            .and_then(|windows| {
                windows
                    .into_iter()
                    .find(|window| window.index == tmux_window_index)
                    .map(|window| window.name)
            })
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| fallback.to_string())
    }

    pub async fn upsert_side_chat_record(
        &self,
        params: UpsertTerminalSideChatParams,
    ) -> Result<TerminalSideChatRecord> {
        super::validate_side_chat_id(&params.side_chat_id)?;
        validate_non_empty("workspace_id", &params.workspace_id)?;
        validate_non_empty("source_pane_id", &params.source_pane_id)?;
        validate_non_empty("source_tmux_window_name", &params.source_tmux_window_name)?;
        validate_non_empty("source_surface_kind", &params.source_surface_kind)?;
        validate_non_empty("side_tmux_window_name", &params.side_tmux_window_name)?;
        validate_bright_color(&params.color_hex)?;
        if params
            .source_surface_ref_json
            .as_ref()
            .is_some_and(|value| value.len() > 4096)
        {
            return Err(ServiceError::Validation(
                "source_surface_ref_json is too large".into(),
            ));
        }
        if params
            .agent_ref_json
            .as_ref()
            .is_some_and(|value| value.len() > 4096)
        {
            return Err(ServiceError::Validation(
                "agent_ref_json is too large".into(),
            ));
        }

        let repo = self.side_chat_repo()?;
        let model = repo
            .upsert_active(UpsertTerminalSideChatInput {
                side_chat_id: params.side_chat_id,
                workspace_guid: params.workspace_id,
                project_name: params.project_name,
                workspace_name: params.workspace_name,
                source_pane_id: params.source_pane_id,
                source_tmux_window_name: params.source_tmux_window_name,
                source_surface_kind: params.source_surface_kind,
                source_surface_ref_json: params.source_surface_ref_json,
                side_tmux_window_name: params.side_tmux_window_name,
                agent_ref_json: params.agent_ref_json,
                color_hex: params.color_hex,
                status: params.status.as_str().to_string(),
            })
            .await?;
        model_to_side_chat_record(model)
    }

    pub async fn list_side_chat_records(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<TerminalSideChatRecord>> {
        self.reconcile_side_chat_records(workspace_id).await
    }

    pub async fn set_side_chat_status(
        &self,
        workspace_id: &str,
        side_chat_id: &str,
        status: TerminalSideChatStatus,
    ) -> Result<TerminalSideChatRecord> {
        validate_non_empty("workspace_id", workspace_id)?;
        super::validate_side_chat_id(side_chat_id)?;
        let repo = self.side_chat_repo()?;
        let Some(model) = repo
            .update_status_in_workspace(workspace_id, side_chat_id, status.as_str())
            .await?
        else {
            return Err(ServiceError::NotFound(format!(
                "Side chat not found: {side_chat_id}"
            )));
        };
        model_to_side_chat_record(model)
    }

    pub async fn close_side_chat(&self, workspace_id: &str, side_chat_id: &str) -> Result<()> {
        validate_non_empty("workspace_id", workspace_id)?;
        super::validate_side_chat_id(side_chat_id)?;
        let repo = self.side_chat_repo()?;
        let Some(record) = repo.get_active_by_side_chat_id(side_chat_id).await? else {
            return Ok(());
        };
        if record.workspace_guid != workspace_id {
            return Err(ServiceError::NotFound(format!(
                "Side chat not found in workspace: {side_chat_id}"
            )));
        }

        self.kill_record_side_window(&record);
        repo.soft_delete(side_chat_id).await?;
        Ok(())
    }

    pub async fn cleanup_side_chats_for_source(
        &self,
        workspace_id: &str,
        source_tmux_window_name: &str,
    ) -> Result<usize> {
        validate_non_empty("workspace_id", workspace_id)?;
        validate_non_empty("source_tmux_window_name", source_tmux_window_name)?;
        let repo = self.side_chat_repo()?;
        let records = repo
            .list_active_by_source(workspace_id, source_tmux_window_name)
            .await?;
        for record in &records {
            self.kill_record_side_window(record);
        }
        repo.soft_delete_by_source(workspace_id, source_tmux_window_name)
            .await?;
        Ok(records.len())
    }

    pub async fn reconcile_side_chat_records(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<TerminalSideChatRecord>> {
        validate_non_empty("workspace_id", workspace_id)?;
        let repo = self.side_chat_repo()?;
        let records = repo.list_active_by_workspace(workspace_id).await?;
        let live = self.discover_live_side_chat_windows(workspace_id);
        // Listing is part of page hydration, so it must not delete persisted
        // records when tmux discovery is temporarily empty during reload.
        let existing_ids = records
            .iter()
            .map(|record| record.side_chat_id.clone())
            .collect::<HashSet<_>>();

        for live_window in live {
            let Some(side_chat_id) = live_window.metadata.side_chat_id.clone() else {
                continue;
            };
            if existing_ids.contains(&side_chat_id) {
                continue;
            }

            let source_tmux_window_name = live_window
                .metadata
                .source_tmux_window_name
                .clone()
                .unwrap_or_else(|| "unknown".to_string());
            let source_pane_id = live_window
                .metadata
                .source_pane_id
                .clone()
                .unwrap_or_else(|| format!("{}:{}", workspace_id, source_tmux_window_name));
            let color_hex = fallback_side_chat_color(&side_chat_id);
            let model = repo
                .upsert_active(UpsertTerminalSideChatInput {
                    side_chat_id,
                    workspace_guid: workspace_id.to_string(),
                    project_name: None,
                    workspace_name: None,
                    source_pane_id,
                    source_tmux_window_name,
                    source_surface_kind: "center".to_string(),
                    source_surface_ref_json: None,
                    side_tmux_window_name: live_window.window_name,
                    agent_ref_json: None,
                    color_hex,
                    status: TerminalSideChatStatus::Hidden.as_str().to_string(),
                })
                .await?;
            let _ = model_to_side_chat_record(model)?;
        }

        repo.list_active_by_workspace(workspace_id)
            .await?
            .into_iter()
            .map(model_to_side_chat_record)
            .collect()
    }

    /// Capture visible tmux pane text for a workspace window (read-only, no PTY attach).
    pub fn capture_window_snapshot(
        &self,
        workspace_id: &str,
        tmux_window_name: &str,
        project_name: Option<&str>,
        workspace_name: Option<&str>,
        max_lines: i32,
    ) -> Result<TmuxPaneSnapshot> {
        self.capture_window_snapshot_page(
            workspace_id,
            tmux_window_name,
            project_name,
            workspace_name,
            0,
            max_lines,
        )
        .map(|page| page.snapshot)
    }

    /// Paginated read of tmux scrollback for canvas extract-text (newest page: skip=0).
    pub fn capture_window_snapshot_page(
        &self,
        workspace_id: &str,
        tmux_window_name: &str,
        project_name: Option<&str>,
        workspace_name: Option<&str>,
        skip_from_bottom: i32,
        take_lines: i32,
    ) -> Result<TmuxPaneCapturePage> {
        // Sync helper: resolve with the same candidate priority as async path,
        // but without awaiting. Prefer names first, then workspace id, then any
        // existing session that contains the requested window.
        let mut candidates = Vec::new();
        if let (Some(proj), Some(ws)) = (project_name, workspace_name) {
            candidates.push(self.tmux_engine.get_session_name_from_names(proj, ws));
        }
        candidates.push(self.tmux_engine.get_session_name(workspace_id));
        let mut deduped = Vec::new();
        for candidate in candidates {
            if !deduped.iter().any(|existing| existing == &candidate) {
                deduped.push(candidate);
            }
        }
        let candidates = deduped;

        let tmux_session = if let Ok(sessions) = self.tmux_engine.list_sessions() {
            candidates
                .iter()
                .find(|candidate| sessions.iter().any(|session| session.name == **candidate))
                .cloned()
                .or_else(|| candidates.first().cloned())
                .unwrap_or_else(|| self.tmux_engine.get_session_name(workspace_id))
        } else {
            candidates
                .into_iter()
                .next()
                .unwrap_or_else(|| self.tmux_engine.get_session_name(workspace_id))
        };

        let window_index = self
            .tmux_engine
            .find_window_index_by_name(&tmux_session, tmux_window_name)
            .map_err(|e| ServiceError::Processing(format!("Failed to resolve tmux window: {}", e)))?
            .ok_or_else(|| {
                ServiceError::NotFound(format!(
                    "Tmux window with name '{}' not found",
                    tmux_window_name
                ))
            })?;

        let take = take_lines.clamp(1, 10_000);
        let skip = skip_from_bottom.max(0);

        self.tmux_engine
            .capture_pane_page(&tmux_session, window_index, skip, take)
            .map_err(|e| ServiceError::Processing(format!("Failed to capture tmux pane: {}", e)))
    }

    /// Send input data to a terminal session
    pub async fn send_input(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Write(data.as_bytes().to_vec()))
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        Ok(())
    }

    /// Send an Enter keypress to a terminal session.
    pub async fn send_enter(&self, session_id: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Enter)
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        Ok(())
    }

    /// Send a terminal emulator report to the active terminal pane.
    ///
    /// xterm.js generates these in response to terminal queries such as OSC 11,
    /// cursor-position requests, and device-attributes probes. In tmux control
    /// mode these must be sent with `refresh-client -r` so tmux treats them as
    /// terminal reports from the client, not as ordinary keyboard input.
    pub async fn send_terminal_report(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Report(data.as_bytes().to_vec()))
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        Ok(())
    }

    /// Resize a terminal session
    ///
    /// Tmux-backed sessions are control-mode clients, so resize is sent through
    /// `refresh-client -C`; simple shell sessions still resize their PTY.
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Resize { cols, rows })
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        debug!(
            "Terminal session {} resized to {}x{}",
            session_id, cols, rows
        );
        Ok(())
    }

    /// Close a terminal session (detach control client but keep tmux window)
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let sock = self.tmux_engine.socket_file_path();

        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Signal the control-mode thread to detach this client and kill the
            // per-connection grouped session. The master tmux session/window is
            // preserved for reconnection.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: handle.client_session.clone(),
                socket_path: Some(PathBuf::from(&sock)),
            });

            let watch_target = match (handle.tmux_session.clone(), handle.tmux_window_index) {
                (Some(ts), Some(twi)) => Some((ts, twi)),
                _ => None,
            };
            drop(sessions);

            // APP-054: if no other browser client remains on this window, keep
            // observing DEC mouse modes so reattach restore stays accurate.
            if let Some((ts, twi)) = watch_target {
                self.ensure_mouse_mode_watch_if_unattached(&ts, twi).await;
            }

            info!(
                "Terminal session closed (detached): {} - tmux window {:?}:{:?} preserved",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
            Err(ServiceError::NotFound(format!(
                "Session not found: {}",
                session_id
            )))
        }
    }

    /// Destroy a terminal session (kill tmux window)
    pub async fn destroy_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            let workspace_id = handle.workspace_id.clone();
            let terminal_name = handle.terminal_name.clone();

            // Step 1: Ask the control-mode thread to detach and shut down its
            // per-connection grouped session.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: handle.client_session.clone(),
                socket_path: Some(PathBuf::from(self.tmux_engine.socket_file_path())),
            });

            tokio::time::sleep(std::time::Duration::from_millis(50)).await;

            // Step 2: Kill the tmux window in the master session.
            if let (Some(ts), Some(twi)) = (&handle.tmux_session, handle.tmux_window_index) {
                self.stop_mouse_mode_watch_for_window(ts, twi);
                if handle.terminal_kind != super::TerminalKind::SideChat {
                    let source_name = handle.terminal_name.clone().or_else(|| {
                        self.tmux_engine.list_windows(ts).ok().and_then(|windows| {
                            windows
                                .into_iter()
                                .find(|window| window.index == twi)
                                .map(|window| window.name)
                        })
                    });
                    if let Some(source_name) = source_name {
                        if let Err(error) = self
                            .cleanup_side_chats_for_source(&handle.workspace_id, &source_name)
                            .await
                        {
                            warn!(
                                "Failed to cleanup child side chats for source {}: {}",
                                source_name, error
                            );
                        }
                    }
                }

                if let Err(e) = self.tmux_engine.kill_window(ts, twi) {
                    warn!("Failed to kill tmux window: {}", e);
                }
            }

            // Step 3: Best-effort cleanup if the control-mode thread has not
            // already removed the grouped session.
            if let Some(client_session) = &handle.client_session {
                let _ = self.tmux_engine.kill_session(client_session);
            }

            // Drop agent-hook rows keyed by the stable ATMOS_PANE_ID so UI
            // indicators cannot stay "running" after the pane is gone.
            if let Some(name) = terminal_name.as_deref() {
                self.clear_agent_hooks_for_pane(&workspace_id, name);
            }

            info!(
                "Terminal session destroyed: {} - tmux window {:?}:{:?} killed",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to destroy non-existent session: {}", session_id);
            Err(ServiceError::NotFound(format!(
                "Session not found: {}",
                session_id
            )))
        }
    }

    /// Get session info (tmux window index) for reconnection
    pub async fn get_session_info(&self, session_id: &str) -> Option<(String, u32)> {
        let sessions = self.sessions.lock().await;
        sessions.get(session_id).and_then(|h| {
            if let (Some(ts), Some(twi)) = (&h.tmux_session, h.tmux_window_index) {
                Some((ts.clone(), twi))
            } else {
                None
            }
        })
    }

    /// List all tmux windows for a workspace (for reconnection)
    pub fn list_workspace_windows(&self, workspace_id: &str) -> Result<Vec<(u32, String)>> {
        let tmux_session = self.tmux_engine.get_session_name(workspace_id);
        let windows = self
            .tmux_engine
            .list_windows(&tmux_session)
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(windows.into_iter().map(|w| (w.index, w.name)).collect())
    }

    /// Check if a "Generate Project Wiki" tmux window exists in the given session.
    pub fn has_project_wiki_window(&self, session_name: &str) -> Result<bool> {
        let idx = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Generate Project Wiki")?;
        Ok(idx.is_some())
    }

    /// Kill the "Generate Project Wiki" tmux window in the given session.
    pub fn kill_project_wiki_window(&self, session_name: &str) -> Result<()> {
        if let Some(index) = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Generate Project Wiki")?
        {
            self.tmux_engine.kill_window(session_name, index)?;
        }
        Ok(())
    }

    /// Kill a tmux window by its user-visible window name in the given session.
    pub fn kill_window_by_name(&self, session_name: &str, tmux_window_name: &str) -> Result<bool> {
        if let Some(index) = self
            .tmux_engine
            .find_window_index_by_name(session_name, tmux_window_name)?
        {
            self.tmux_engine.kill_window(session_name, index)?;
            return Ok(true);
        }
        Ok(false)
    }

    /// Kill a tmux window and clear matching agent-hook sessions for the stable pane id.
    pub fn kill_window_by_name_for_workspace(
        &self,
        workspace_id: &str,
        session_name: &str,
        tmux_window_name: &str,
    ) -> Result<bool> {
        let killed = self.kill_window_by_name(session_name, tmux_window_name)?;
        if killed {
            self.clear_agent_hooks_for_pane(workspace_id, tmux_window_name);
        }
        Ok(killed)
    }

    /// Check if a "Code Review" tmux window exists in the given session.
    pub fn has_code_review_window(&self, session_name: &str) -> Result<bool> {
        let idx = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Code Review")?;
        Ok(idx.is_some())
    }

    /// Kill the "Code Review" tmux window in the given session.
    pub fn kill_code_review_window(&self, session_name: &str) -> Result<()> {
        if let Some(index) = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Code Review")?
        {
            self.tmux_engine.kill_window(session_name, index)?;
        }
        Ok(())
    }

    /// Get all active session IDs
    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }

    /// List detailed information about all active sessions (for Terminal Manager UI)
    pub async fn list_session_details(&self) -> Vec<SessionDetail> {
        let sessions = self.sessions.lock().await;
        sessions
            .iter()
            .map(|(id, handle)| handle.to_detail(id))
            .collect()
    }

    /// Clone-only resource roots. PIDs stay inside this projection.
    pub async fn list_resource_roots(&self) -> Vec<TerminalResourceRoot> {
        let sessions = self.sessions.lock().await;
        sessions
            .iter()
            .map(|(id, handle)| handle.to_resource_root(id))
            .collect()
    }

    /// Check if a session exists
    pub async fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.lock().await.contains_key(session_id)
    }

    /// Get session count
    pub async fn session_count(&self) -> usize {
        self.sessions.lock().await.len()
    }

    /// Gracefully shutdown all terminal sessions.
    /// Called during application shutdown to clean up PTY resources and prevent
    /// PTY device exhaustion ("unable to allocate pty: Device not configured").
    pub async fn shutdown(&self) {
        info!("Shutting down terminal service, cleaning up all sessions...");
        self.mouse_mode_watches.stop_all();

        let mut sessions = self.sessions.lock().await;
        let count = sessions.len();

        if count == 0 {
            info!("No active terminal sessions to clean up");
            drop(sessions);
        } else {
            // Drain all sessions and clean up
            let handles: Vec<(String, SessionHandle)> = sessions.drain().collect();
            drop(sessions); // Release the lock early

            let sock = self.tmux_engine.socket_file_path();
            for (session_id, handle) in &handles {
                // On full shutdown we kill the grouped session (window-stable
                // sessions are recreated on the next API start + first connect).
                if let Some(ref client_session) = handle.client_session {
                    let mut detach_cmd = std::process::Command::new("tmux");
                    detach_cmd.args([
                        "-u",
                        "-f",
                        "/dev/null",
                        "-S",
                        &sock,
                        "detach-client",
                        "-s",
                        client_session,
                    ]);
                    apply_utf8_env_to_tmux_command(&mut detach_cmd);
                    let _ = detach_cmd.output();
                    let _ = self.tmux_engine.kill_session(client_session);
                }

                // Signal the PTY thread to stop its command loop.
                let _ = handle.command_tx.send(SessionCommand::Close {
                    client_session: None,
                    socket_path: None,
                });

                debug!("Sent shutdown signal to session: {}", session_id);
            }

            // Brief wait for PTY threads to see EOF and exit cleanly.
            // Synchronous kill above ensures the PTY fd is already released;
            // this just gives threads time to drain and exit gracefully.
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;

            info!(
                "Terminal service shutdown complete: cleaned up {} sessions",
                count
            );
        }

        // NOTE: Do NOT call cleanup_stale_client_sessions() here.
        // When multiple API instances share the same tmux socket (e.g., a desktop
        // sidecar on port 30303 and a dev server on port 30301), this instance's
        // "stale" sessions include the OTHER instance's live sessions. Cleaning
        // them up on shutdown would kill terminals owned by the other instance.
        // Stale cleanup should only happen on startup, gated by --cleanup-stale-clients.
    }

    /// Clean up stale tmux client sessions from previous crashes or hot-reloads.
    /// Called on startup and shutdown to release PTY resources from orphaned sessions.
    ///
    /// During hot-reload, the process is killed before cleanup can happen.
    /// This leaves behind tmux "grouped sessions" (atmos_client_*) that each hold
    /// a PTY device. Over many hot-reloads, these accumulate and exhaust the system's
    /// PTY device pool.
    pub fn cleanup_stale_client_sessions(&self) {
        // Collect the set of client session names that are currently active
        // so we don't kill live sessions. Killing a live session would cause
        // tmux to write "[exited]" / "can't find session" into the PTY output.
        // Use try_lock to avoid blocking if sessions mutex is held.
        let active_clients: HashSet<String> = self
            .sessions
            .try_lock()
            .map(|sessions| {
                sessions
                    .values()
                    .filter_map(|h| h.client_session.clone())
                    .collect()
            })
            .unwrap_or_default();

        match self.tmux_engine.list_sessions() {
            Ok(sessions) => {
                let mut cleaned = 0;
                for session in sessions {
                    if session.name.starts_with("atmos_client_")
                        && !active_clients.contains(&session.name)
                    {
                        if let Err(e) = self.tmux_engine.kill_session(&session.name) {
                            warn!(
                                "Failed to kill stale client session {}: {}",
                                session.name, e
                            );
                        } else {
                            cleaned += 1;
                        }
                    }
                }
                if cleaned > 0 {
                    info!(
                        "Cleaned up {} stale tmux client sessions (skipped {} active)",
                        cleaned,
                        active_clients.len()
                    );
                } else {
                    debug!("No stale tmux client sessions found");
                }
            }
            Err(e) => {
                warn!("Failed to list tmux sessions for cleanup: {}", e);
            }
        }
    }

    /// Clean up all terminal state associated with a workspace being deleted.
    ///
    /// This detaches live grouped client sessions, removes their PTY handles from
    /// memory, then kills the workspace's backing tmux session.
    pub async fn cleanup_workspace_terminal_state(&self, workspace_id: &str, tmux_session: &str) {
        let matching_handles = {
            let mut sessions = self.sessions.lock().await;
            let matching_ids: Vec<String> = sessions
                .iter()
                .filter(|(_, handle)| {
                    handle.workspace_id == workspace_id
                        || handle.tmux_session.as_deref() == Some(tmux_session)
                })
                .map(|(session_id, _)| session_id.clone())
                .collect();

            matching_ids
                .into_iter()
                .filter_map(|session_id| {
                    sessions
                        .remove(&session_id)
                        .map(|handle| (session_id, handle))
                })
                .collect::<Vec<_>>()
        };

        if !matching_handles.is_empty() {
            let sock = self.tmux_engine.socket_file_path();
            for (session_id, handle) in &matching_handles {
                // Detach first (releases PTY fd immediately), then kill the ghost session.
                if let Some(ref client_session) = handle.client_session {
                    let mut detach_cmd = std::process::Command::new("tmux");
                    detach_cmd.args([
                        "-u",
                        "-f",
                        "/dev/null",
                        "-S",
                        &sock,
                        "detach-client",
                        "-s",
                        client_session,
                    ]);
                    apply_utf8_env_to_tmux_command(&mut detach_cmd);
                    let _ = detach_cmd.output();
                    let _ = self.tmux_engine.kill_session(client_session);
                }
                let _ = handle.command_tx.send(SessionCommand::Close {
                    client_session: None,
                    socket_path: None,
                });
                debug!(
                    "Sent workspace cleanup signal to terminal session: {}",
                    session_id
                );
            }

            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        if let Err(error) = self.tmux_engine.kill_session(tmux_session) {
            warn!(
                "Failed to kill tmux session {} during workspace cleanup: {}",
                tmux_session, error
            );
        }
    }

    fn side_chat_repo(&self) -> Result<TerminalSideChatRepo<'_>> {
        let db = self.db.as_deref().ok_or_else(|| {
            ServiceError::Processing("terminal side chat registry is unavailable".to_string())
        })?;
        Ok(TerminalSideChatRepo::new(db))
    }

    fn discover_live_side_chat_windows(&self, workspace_id: &str) -> Vec<LiveSideChatWindow> {
        let sessions = self.tmux_engine.list_sessions().unwrap_or_default();
        let mut live = Vec::new();

        for session in sessions {
            if session.name.starts_with("atmos_client_") {
                continue;
            }
            let windows = match self.tmux_engine.list_windows(&session.name) {
                Ok(windows) => windows,
                Err(error) => {
                    debug!(
                        "Failed to list tmux windows for side chat reconciliation in {}: {}",
                        session.name, error
                    );
                    continue;
                }
            };

            for window in windows {
                let metadata = match self
                    .tmux_engine
                    .get_window_atmos_metadata(&session.name, window.index)
                {
                    Ok(metadata) => metadata,
                    Err(error) => {
                        debug!(
                            "Failed to read side chat metadata for {}:{}: {}",
                            session.name, window.index, error
                        );
                        continue;
                    }
                };
                if metadata.terminal_kind.as_deref() != Some("side_chat") {
                    continue;
                }
                if metadata.context_id.as_deref() != Some(workspace_id) {
                    continue;
                }

                live.push(LiveSideChatWindow {
                    window_name: window.name,
                    metadata,
                });
            }
        }

        live
    }

    fn kill_record_side_window(&self, record: &terminal_side_chat::Model) {
        for session_name in self.tmux_session_candidates_for_record(record) {
            match self
                .tmux_engine
                .find_window_index_by_name(&session_name, &record.side_tmux_window_name)
            {
                Ok(Some(index)) => {
                    let _ = self.tmux_engine.kill_window(&session_name, index);
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    debug!(
                        "Failed to resolve side chat tmux window {} in {}: {}",
                        record.side_tmux_window_name, session_name, error
                    );
                }
            }
        }
    }

    fn tmux_session_candidates_for_record(
        &self,
        record: &terminal_side_chat::Model,
    ) -> Vec<String> {
        let mut candidates = Vec::new();
        if let (Some(project_name), Some(workspace_name)) = (
            record.project_name.as_deref(),
            record.workspace_name.as_deref(),
        ) {
            candidates.push(
                self.tmux_engine
                    .get_session_name_from_names(project_name, workspace_name),
            );
        }
        candidates.push(self.tmux_engine.get_session_name(&record.workspace_guid));
        if let Ok(sessions) = self.tmux_engine.list_sessions() {
            candidates.extend(
                sessions
                    .into_iter()
                    .filter(|session| !session.name.starts_with("atmos_client_"))
                    .map(|session| session.name),
            );
        }
        candidates.sort();
        candidates.dedup();
        candidates
    }
}

struct LiveSideChatWindow {
    window_name: String,
    metadata: TmuxWindowAtmosMetadata,
}

fn model_to_side_chat_record(model: terminal_side_chat::Model) -> Result<TerminalSideChatRecord> {
    let status = TerminalSideChatStatus::try_from(model.status.as_str())
        .map_err(ServiceError::Validation)?;
    Ok(TerminalSideChatRecord {
        side_chat_id: model.side_chat_id,
        workspace_id: model.workspace_guid,
        project_name: model.project_name,
        workspace_name: model.workspace_name,
        source_pane_id: model.source_pane_id,
        source_tmux_window_name: model.source_tmux_window_name,
        source_surface_kind: model.source_surface_kind,
        source_surface_ref_json: model.source_surface_ref_json,
        side_tmux_window_name: model.side_tmux_window_name,
        agent_ref_json: model.agent_ref_json,
        color_hex: model.color_hex,
        status,
        created_at: model.created_at,
        updated_at: model.updated_at,
    })
}

fn validate_non_empty(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(ServiceError::Validation(format!("{field} is required")));
    }
    Ok(())
}

fn validate_bright_color(value: &str) -> Result<()> {
    let hex = value.trim();
    if hex.len() != 7 || !hex.starts_with('#') || !hex[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ServiceError::Validation(
            "color_hex must be a #RRGGBB value".into(),
        ));
    }
    let parse = |range: std::ops::Range<usize>| u8::from_str_radix(&hex[range], 16).unwrap_or(0);
    let r = parse(1..3) as u32;
    let g = parse(3..5) as u32;
    let b = parse(5..7) as u32;
    let luminance = (299 * r + 587 * g + 114 * b) / 1000;
    if luminance < 120 {
        return Err(ServiceError::Validation(
            "color_hex must be bright enough for terminal surfaces".into(),
        ));
    }
    Ok(())
}

fn fallback_side_chat_color(side_chat_id: &str) -> String {
    const COLORS: &[&str] = &[
        "#6ee7b7", "#93c5fd", "#fcd34d", "#fca5a5", "#c4b5fd", "#67e8f9", "#bef264", "#f9a8d4",
    ];
    let sum = side_chat_id
        .bytes()
        .fold(0usize, |acc, byte| acc.wrapping_add(byte as usize));
    COLORS[sum % COLORS.len()].to_string()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    use super::*;

    async fn setup_service() -> TerminalService {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        infra::Migrator::up(&db, None).await.unwrap();
        TerminalService::new_with_db(Arc::new(db))
    }

    fn side_chat_params(
        workspace_id: String,
        side_chat_id: &str,
        status: TerminalSideChatStatus,
    ) -> UpsertTerminalSideChatParams {
        UpsertTerminalSideChatParams {
            side_chat_id: side_chat_id.to_string(),
            workspace_id: workspace_id.clone(),
            project_name: Some("Project".to_string()),
            workspace_name: Some("Workspace".to_string()),
            source_pane_id: format!("{workspace_id}:main"),
            source_tmux_window_name: "main".to_string(),
            source_surface_kind: "terminal_pane".to_string(),
            source_surface_ref_json: None,
            side_tmux_window_name: format!("{side_chat_id}-window"),
            agent_ref_json: None,
            color_hex: "#06b6d4".to_string(),
            status,
        }
    }

    #[tokio::test]
    async fn list_side_chat_records_keeps_persisted_records_when_live_discovery_is_empty() {
        let service = setup_service().await;
        let workspace_id = format!("workspace-{}", uuid::Uuid::new_v4());

        service
            .upsert_side_chat_record(side_chat_params(
                workspace_id.clone(),
                "side-persisted-1",
                TerminalSideChatStatus::Open,
            ))
            .await
            .unwrap();

        let records = service.list_side_chat_records(&workspace_id).await.unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].side_chat_id, "side-persisted-1");
        assert_eq!(records[0].status, TerminalSideChatStatus::Open);

        let records_after_hydration = service.list_side_chat_records(&workspace_id).await.unwrap();

        assert_eq!(records_after_hydration.len(), 1);
        assert_eq!(records_after_hydration[0].side_chat_id, "side-persisted-1");
    }

    #[tokio::test]
    async fn set_side_chat_status_requires_matching_workspace() {
        let service = setup_service().await;
        let workspace_id = format!("workspace-{}", uuid::Uuid::new_v4());
        let other_workspace_id = format!("workspace-{}", uuid::Uuid::new_v4());

        service
            .upsert_side_chat_record(side_chat_params(
                workspace_id.clone(),
                "side-workspace-scoped-1",
                TerminalSideChatStatus::Open,
            ))
            .await
            .unwrap();

        let error = service
            .set_side_chat_status(
                &other_workspace_id,
                "side-workspace-scoped-1",
                TerminalSideChatStatus::Hidden,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, ServiceError::NotFound(_)));

        let records = service.list_side_chat_records(&workspace_id).await.unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].status, TerminalSideChatStatus::Open);
    }
}
