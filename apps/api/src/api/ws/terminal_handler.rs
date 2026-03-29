//! Terminal WebSocket handler for PTY communication with tmux persistence
//!
//! This handler manages WebSocket connections for terminal sessions,
//! bridging the frontend xterm.js with backend tmux-backed PTY.
//!
//! Key features:
//! - Create new terminal sessions (creates tmux window)
//! - Attach to existing sessions (reconnect to tmux window)
//! - Close sessions without destroying (detach, keeps tmux window)
//! - Destroy sessions completely (kills tmux window)

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::Response,
};
use core_engine::GitEngine;
use core_service::{
    AttachSessionParams, CreateSessionParams, CreateSimpleSessionParams, TerminalResponse,
    TerminalService,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::app_state::AppState;

/// Terminal query parameters
#[derive(Debug, Deserialize)]
pub struct TerminalWsQuery {
    pub workspace_id: Option<String>,
    pub shell: Option<String>,
    /// Optional: tmux window index for reconnection (numeric)
    pub tmux_window: Option<u32>,
    /// Optional: tmux window name for reconnection (string, will be parsed to u32)
    pub tmux_window_name: Option<String>,
    /// If true, attach to existing session instead of creating new
    pub attach: Option<bool>,
    /// Optional: project name for human-readable session naming
    pub project_name: Option<String>,
    /// Optional: workspace name for human-readable session naming
    pub workspace_name: Option<String>,
    /// Optional: terminal/window name (e.g., "Claude", "Codex", or auto-incremented number)
    pub terminal_name: Option<String>,
    /// Optional: mode (e.g., "shell" to skip tmux persistence)
    pub mode: Option<String>,
    /// Optional: working directory
    pub cwd: Option<String>,
    /// Optional: initial terminal columns (from frontend fitAddon)
    pub cols: Option<u16>,
    /// Optional: initial terminal rows (from frontend fitAddon)
    pub rows: Option<u16>,
}

/// Terminal message from client
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientTerminalMessage {
    TerminalCreate {
        #[allow(dead_code)]
        workspace_id: String,
        #[allow(dead_code)]
        shell: Option<String>,
    },
    TerminalAttach {
        workspace_id: String,
        tmux_window: u32,
    },
    TerminalInput {
        data: String,
    },
    TerminalResize {
        cols: u16,
        rows: u16,
    },
    TerminalClose,
    TerminalDestroy,
    /// Exit tmux copy-mode safely via `send-keys -X cancel`
    TmuxCancelCopyMode,
    /// Check if tmux pane is currently in copy-mode
    TmuxCheckCopyMode,
}

/// All session-level configuration extracted from query parameters.
pub struct TerminalSessionConfig {
    pub session_id: String,
    pub workspace_id: String,
    pub shell: Option<String>,
    pub tmux_window: Option<u32>,
    pub tmux_window_name: Option<String>,
    pub attach_requested: bool,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub terminal_name: Option<String>,
    pub mode: Option<String>,
    pub cwd: Option<String>,
    pub initial_cols: Option<u16>,
    pub initial_rows: Option<u16>,
}

/// Terminal WebSocket upgrade handler
pub async fn terminal_ws_handler(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<TerminalWsQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let workspace_id = query
        .workspace_id
        .clone()
        .unwrap_or_else(|| "default".to_string());

    let attach = query.attach.unwrap_or(false)
        || query.tmux_window.is_some()
        || query.tmux_window_name.is_some();

    info!(
        "Terminal WebSocket upgrade request for session: {} (workspace: {}, attach: {}, tmux_window: {:?}, cwd: {:?})",
        session_id, workspace_id, attach, query.tmux_window, query.cwd
    );

    let config = TerminalSessionConfig {
        session_id,
        workspace_id,
        shell: query.shell,
        tmux_window: query.tmux_window,
        tmux_window_name: query.tmux_window_name,
        attach_requested: attach,
        project_name: query.project_name,
        workspace_name: query.workspace_name,
        terminal_name: query.terminal_name,
        mode: query.mode,
        cwd: query.cwd,
        initial_cols: query.cols,
        initial_rows: query.rows,
    };

    ws.on_upgrade(move |socket| handle_terminal_socket(socket, config, state))
}

/// Handle the terminal WebSocket connection
async fn handle_terminal_socket(socket: WebSocket, config: TerminalSessionConfig, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let TerminalSessionConfig {
        session_id,
        workspace_id,
        shell,
        tmux_window,
        tmux_window_name,
        attach_requested,
        project_name,
        workspace_name,
        terminal_name,
        mode,
        cwd,
        initial_cols,
        initial_rows,
    } = config;

    let mut actually_attached = false;

    info!(
        "Terminal WebSocket connected for session: {} (workspace: {})",
        session_id, workspace_id
    );

    let terminal_service = state.terminal_service.clone();

    // If this session_id already has a live handle (e.g. from a previous
    // WebSocket that didn't finish cleanup before the new one connected —
    // common during hot-reload), close it first to free the PTY.
    //
    // No sleep is needed after close: each attach_to_tmux_window call
    // generates a unique client session name (via a monotonic counter),
    // so the old PTY thread's deferred kill-session can never collide
    // with the new client session.
    if terminal_service.session_exists(&session_id).await {
        debug!(
            "Session {} already exists — closing stale handle before re-creating",
            session_id
        );
        let _ = terminal_service.close_session(&session_id).await;
    }

    let cwd = if let Some(path) = cwd {
        Some(path)
    } else if let Some(ref ws) = workspace_name {
        let git_engine = GitEngine::new();
        match git_engine.get_worktree_path(ws) {
            Ok(path) => {
                let exists = path.exists();
                info!("Worktree path for {}: {:?}, exists: {}", ws, path, exists);
                if exists {
                    Some(path.to_string_lossy().to_string())
                } else {
                    None
                }
            }
            Err(e) => {
                warn!("Failed to get worktree path for {}: {}", ws, e);
                None
            }
        }
    } else {
        info!("No cwd or workspace_name provided, using default cwd");
        None
    };

    info!("Terminal session cwd: {:?}", cwd);

    let (output_rx, history) = if mode.as_deref() == Some("shell") {
        match terminal_service
            .create_simple_session(CreateSimpleSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                shell,
                cols: initial_cols,
                rows: initial_rows,
                cwd: cwd.clone(),
                project_name: project_name.clone(),
                workspace_name: workspace_name.clone(),
                terminal_name: terminal_name.clone(),
            })
            .await
        {
            Ok(rx) => (rx, None),
            Err(e) => {
                error!("Failed to create simple terminal session: {}", e);
                let error_response = TerminalResponse::TerminalError {
                    session_id: Some(session_id),
                    error: e.to_string(),
                };
                let _ = ws_sender
                    .send(Message::Text(
                        serde_json::to_string(&error_response).unwrap().into(),
                    ))
                    .await;
                return;
            }
        }
    } else if attach_requested && (tmux_window.is_some() || tmux_window_name.is_some()) {
        match terminal_service
            .attach_session(AttachSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                tmux_window_index: tmux_window,
                tmux_window_name,
                cols: initial_cols,
                rows: initial_rows,
                project_name: project_name.clone(),
                workspace_name: workspace_name.clone(),
            })
            .await
        {
            Ok((rx, hist)) => {
                actually_attached = true;
                (rx, hist)
            }
            Err(e) => {
                warn!(
                    "Failed to attach terminal session ({}). Falling back to creating a new one.",
                    e
                );
                match terminal_service
                    .create_session(CreateSessionParams {
                        session_id: session_id.clone(),
                        workspace_id: workspace_id.clone(),
                        shell: shell.clone(),
                        cols: initial_cols,
                        rows: initial_rows,
                        project_name: project_name.clone(),
                        workspace_name: workspace_name.clone(),
                        window_name: terminal_name.clone(),
                        cwd: cwd.clone(),
                    })
                    .await
                {
                    Ok(rx) => {
                        actually_attached = false;
                        (rx, None)
                    }
                    Err(e) => {
                        error!(
                            "Failed to create terminal session after attach failure: {}",
                            e
                        );
                        let error_response = TerminalResponse::TerminalError {
                            session_id: Some(session_id),
                            error: e.to_string(),
                        };
                        let _ = ws_sender
                            .send(Message::Text(
                                serde_json::to_string(&error_response).unwrap().into(),
                            ))
                            .await;
                        return;
                    }
                }
            }
        }
    } else {
        match terminal_service
            .create_session(CreateSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                shell,
                cols: initial_cols,
                rows: initial_rows,
                project_name,
                workspace_name,
                window_name: terminal_name,
                cwd,
            })
            .await
        {
            Ok(rx) => (rx, None),
            Err(e) => {
                error!("Failed to create terminal session: {}", e);
                let error_response = TerminalResponse::TerminalError {
                    session_id: Some(session_id),
                    error: e.to_string(),
                };
                let _ = ws_sender
                    .send(Message::Text(
                        serde_json::to_string(&error_response).unwrap().into(),
                    ))
                    .await;
                return;
            }
        }
    };

    // Send appropriate response based on whether we actually attached or created
    if actually_attached {
        let attached_response = TerminalResponse::TerminalAttached {
            session_id: session_id.clone(),
            workspace_id: workspace_id.clone(),
            history: history.clone(),
        };
        if let Ok(json) = serde_json::to_string(&attached_response) {
            let _ = ws_sender.send(Message::Text(json.into())).await;
        }
    } else {
        let created_response = TerminalResponse::TerminalCreated {
            session_id: session_id.clone(),
            workspace_id: workspace_id.clone(),
        };
        if let Ok(json) = serde_json::to_string(&created_response) {
            let _ = ws_sender.send(Message::Text(json.into())).await;
        }
    }

    // Create channel for WebSocket outgoing messages
    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();

    // Task: Forward PTY output to WebSocket
    // Uses a streaming UTF-8 decoder to avoid splitting multi-byte characters
    // (e.g. emoji, CJK) across chunk boundaries, which would produce ��� via
    // from_utf8_lossy.
    let session_id_output = session_id.clone();
    let ws_tx_clone = ws_tx.clone();
    let output_task = tokio::spawn(async move {
        let mut output_rx = output_rx;
        let mut carry: Vec<u8> = Vec::new();
        while let Some(data) = output_rx.recv().await {
            carry.extend_from_slice(&data);

            let valid_up_to = match std::str::from_utf8(&carry) {
                Ok(_) => carry.len(),
                Err(e) => {
                    let up_to = e.valid_up_to();
                    // Check if the trailing bytes are an incomplete (but
                    // potentially valid) multi-byte sequence rather than truly
                    // invalid bytes. Keep at most 3 trailing bytes (max
                    // continuation length in UTF-8).
                    let remaining = carry.len() - up_to;
                    if remaining <= 3 && e.error_len().is_none() {
                        // Incomplete sequence at the end — keep it for the
                        // next chunk.
                        up_to
                    } else {
                        // Genuinely invalid bytes — skip past the bad byte(s)
                        // so we don't get stuck.
                        up_to + e.error_len().unwrap_or(1)
                    }
                }
            };

            if valid_up_to == 0 {
                continue;
            }

            // SAFETY: we just verified the bytes up to `valid_up_to` are valid
            // UTF-8.
            let text = unsafe { std::str::from_utf8_unchecked(&carry[..valid_up_to]) }.to_owned();
            carry.drain(..valid_up_to);
            let response = TerminalResponse::TerminalOutput {
                session_id: session_id_output.clone(),
                data: text,
            };
            if let Ok(json) = serde_json::to_string(&response) {
                if ws_tx_clone.send(json).is_err() {
                    debug!(
                        "WebSocket channel closed for session: {}",
                        session_id_output
                    );
                    break;
                }
            }
        }
    });

    // Task: Send messages from channel to WebSocket
    let session_id_send = session_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                warn!(
                    "Failed to send to WebSocket for session: {}",
                    session_id_send
                );
                break;
            }
        }
    });

    // Track if user requested destroy
    let destroy_requested = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let destroy_requested_clone = destroy_requested.clone();

    // Main loop: Handle incoming WebSocket messages
    let terminal_service_clone = terminal_service.clone();
    let session_id_recv = session_id.clone();
    let workspace_id_recv = workspace_id.clone();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                let should_continue = handle_terminal_message(
                    msg,
                    &session_id_recv,
                    &workspace_id_recv,
                    &terminal_service_clone,
                    &ws_tx,
                    &destroy_requested_clone,
                )
                .await;
                if !should_continue {
                    break;
                }
            }
            Err(e) => {
                error!("WebSocket error for session {}: {}", session_id_recv, e);
                break;
            }
        }
    }

    // Cleanup
    output_task.abort();
    send_task.abort();

    // Close the terminal session (detach only - keeps tmux window)
    // If destroy was requested, the handler already called destroy_session
    if !destroy_requested.load(std::sync::atomic::Ordering::SeqCst) {
        if let Err(e) = terminal_service.close_session(&session_id).await {
            // Don't warn if session doesn't exist (may have been destroyed)
            debug!("Note: closing terminal session {}: {}", session_id, e);
        }
    }

    info!("Terminal WebSocket closed for session: {}", session_id);
}

/// Handle incoming terminal WebSocket message
async fn handle_terminal_message(
    msg: Message,
    session_id: &str,
    workspace_id: &str,
    terminal_service: &Arc<TerminalService>,
    ws_tx: &mpsc::UnboundedSender<String>,
    destroy_requested: &std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> bool {
    match msg {
        Message::Text(text) => {
            let text_str: &str = text.as_ref();

            // Try to parse as JSON message
            if let Ok(terminal_msg) = serde_json::from_str::<ClientTerminalMessage>(text_str) {
                match terminal_msg {
                    ClientTerminalMessage::TerminalCreate { .. } => {
                        // Session already created on connect, just confirm
                        let created_response = TerminalResponse::TerminalCreated {
                            session_id: session_id.to_string(),
                            workspace_id: workspace_id.to_string(),
                        };
                        if let Ok(json) = serde_json::to_string(&created_response) {
                            let _ = ws_tx.send(json);
                        }
                    }
                    ClientTerminalMessage::TerminalAttach {
                        workspace_id: ws_id,
                        tmux_window,
                    } => {
                        // For mid-session attach requests (rare case)
                        // The primary attach flow is through query params on connect
                        debug!(
                            "Mid-session attach request for workspace {} window {}",
                            ws_id, tmux_window
                        );
                        // Just confirm the current session
                        let attached_response = TerminalResponse::TerminalAttached {
                            session_id: session_id.to_string(),
                            workspace_id: ws_id,
                            history: None,
                        };
                        if let Ok(json) = serde_json::to_string(&attached_response) {
                            let _ = ws_tx.send(json);
                        }
                    }
                    ClientTerminalMessage::TerminalInput { data } => {
                        if let Err(e) = terminal_service.send_input(session_id, &data).await {
                            error!("Failed to send input to session {}: {}", session_id, e);
                            let error_response = TerminalResponse::TerminalError {
                                session_id: Some(session_id.to_string()),
                                error: e.to_string(),
                            };
                            if let Ok(json) = serde_json::to_string(&error_response) {
                                let _ = ws_tx.send(json);
                            }
                        }
                    }
                    ClientTerminalMessage::TerminalResize { cols, rows } => {
                        if let Err(e) = terminal_service.resize(session_id, cols, rows).await {
                            error!("Failed to resize session {}: {}", session_id, e);
                        } else if terminal_service
                            .is_alternate_screen_active(session_id)
                            .await
                        {
                            // Full-screen TUI app is active (alternate screen buffer).
                            // With smcup@:rmcup@ disabled, tmux draws TUI content into the
                            // normal buffer. On resize, old TUI frames leak into xterm.js
                            // scrollback. Send CSI 3J after a short delay to let tmux
                            // finish redrawing before clearing the stale scrollback.
                            let ws_tx_clone = ws_tx.clone();
                            let sid = session_id.to_string();
                            tokio::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                                let clear_msg = TerminalResponse::TerminalOutput {
                                    session_id: sid,
                                    data: "\x1b[3J".to_string(),
                                };
                                if let Ok(json) = serde_json::to_string(&clear_msg) {
                                    let _ = ws_tx_clone.send(json);
                                }
                            });
                        }
                    }
                    ClientTerminalMessage::TerminalClose => {
                        // Client requested close (detach only)
                        let close_response = TerminalResponse::TerminalClosed {
                            session_id: session_id.to_string(),
                        };
                        if let Ok(json) = serde_json::to_string(&close_response) {
                            let _ = ws_tx.send(json);
                        }
                        return false;
                    }
                    ClientTerminalMessage::TerminalDestroy => {
                        // Client requested destroy (kill tmux window)
                        destroy_requested.store(true, std::sync::atomic::Ordering::SeqCst);
                        if let Err(e) = terminal_service.destroy_session(session_id).await {
                            warn!("Failed to destroy session {}: {}", session_id, e);
                        }
                        let destroy_response = TerminalResponse::TerminalDestroyed {
                            session_id: session_id.to_string(),
                        };
                        if let Ok(json) = serde_json::to_string(&destroy_response) {
                            let _ = ws_tx.send(json);
                        }
                        return false;
                    }
                    ClientTerminalMessage::TmuxCancelCopyMode => {
                        // Safely exit tmux copy-mode via `send-keys -X cancel`.
                        // No-op if not in copy-mode — completely safe.
                        if let Err(e) = terminal_service.tmux_cancel_copy_mode(session_id).await {
                            debug!("Failed to cancel copy-mode for {}: {}", session_id, e);
                        }
                    }
                    ClientTerminalMessage::TmuxCheckCopyMode => {
                        // Query tmux for copy-mode status and respond
                        let in_copy_mode = terminal_service
                            .tmux_check_copy_mode(session_id)
                            .await
                            .unwrap_or(false);
                        let response = TerminalResponse::TmuxCopyModeStatus {
                            session_id: session_id.to_string(),
                            in_copy_mode,
                        };
                        if let Ok(json) = serde_json::to_string(&response) {
                            let _ = ws_tx.send(json);
                        }
                    }
                }
            } else {
                // Treat as raw terminal input if not valid JSON
                if let Err(e) = terminal_service.send_input(session_id, text_str).await {
                    error!("Failed to send raw input to session {}: {}", session_id, e);
                }
            }
            true
        }
        Message::Binary(data) => {
            // Handle binary data as raw terminal input
            let text = String::from_utf8_lossy(&data);
            if let Err(e) = terminal_service.send_input(session_id, &text).await {
                error!(
                    "Failed to send binary input to session {}: {}",
                    session_id, e
                );
            }
            true
        }
        Message::Ping(_) => {
            debug!("Received ping from session: {}", session_id);
            true
        }
        Message::Pong(_) => {
            debug!("Received pong from session: {}", session_id);
            true
        }
        Message::Close(_) => {
            info!("Received close frame for session: {}", session_id);
            false
        }
    }
}
