use std::collections::HashSet;
use std::path::PathBuf;

use core_engine::{TmuxPaneCapturePage, TmuxPaneSnapshot};
use tracing::{debug, info, warn};

use crate::error::{Result, ServiceError};

use super::runtime::apply_utf8_env_to_tmux_command;
use super::{SessionCommand, SessionDetail, SessionHandle, TerminalService};

impl TerminalService {
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
        let tmux_session = if let (Some(proj), Some(ws)) = (project_name, workspace_name) {
            self.tmux_engine.get_session_name_from_names(proj, ws)
        } else {
            self.tmux_engine.get_session_name(workspace_id)
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
            // Step 1: Ask the control-mode thread to detach and shut down its
            // per-connection grouped session.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: handle.client_session.clone(),
                socket_path: Some(PathBuf::from(self.tmux_engine.socket_file_path())),
            });

            tokio::time::sleep(std::time::Duration::from_millis(50)).await;

            // Step 2: Kill the tmux window in the master session.
            if let (Some(ts), Some(twi)) = (&handle.tmux_session, handle.tmux_window_index) {
                if let Err(e) = self.tmux_engine.kill_window(ts, twi) {
                    warn!("Failed to kill tmux window: {}", e);
                }
            }

            // Step 3: Best-effort cleanup if the control-mode thread has not
            // already removed the grouped session.
            if let Some(client_session) = &handle.client_session {
                let _ = self.tmux_engine.kill_session(client_session);
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
}
