use std::collections::HashMap;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use core_engine::GitEngine;
use core_service::{
    AttachSessionParams, CreateSessionParams, CreateSimpleSessionParams, TerminalResponse,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, warn};

use crate::app_state::AppState;

pub type TerminalRelaySessions = RwLock<HashMap<String, RelayTerminalSession>>;

pub struct RelayTerminalSession {
    pub session_id: String,
    pub output_task: tokio::task::JoinHandle<()>,
    pub destroy_requested: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::enum_variant_names)]
enum RelayTerminalClientMessage {
    TerminalOpen {
        session_id: String,
        workspace_id: String,
        attach: Option<bool>,
        tmux_window_name: Option<String>,
        tmux_window_index: Option<u32>,
        cwd: Option<String>,
        project_name: Option<String>,
        workspace_name: Option<String>,
        terminal_name: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        mode: Option<String>,
        shell: Option<String>,
    },
    TerminalInput {
        session_id: String,
        data: String,
    },
    TerminalEnter {
        session_id: String,
    },
    TerminalReport {
        session_id: String,
        data: String,
    },
    TerminalResize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    TerminalClose {
        session_id: String,
    },
    TerminalDestroy {
        session_id: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RelayTerminalServerMessage {
    TerminalOutput {
        session_id: String,
        data_b64: String,
    },
}

pub async fn handle_terminal_frame(
    state: &AppState,
    sessions: &TerminalRelaySessions,
    sid: &str,
    body: &str,
    relay_out: &mpsc::UnboundedSender<Message>,
) {
    let parsed = match serde_json::from_str::<RelayTerminalClientMessage>(body) {
        Ok(message) => message,
        Err(error) => {
            warn!(target: "atmos_relay", error = %error, "terminal relay frame decode failed");
            send_terminal_response(
                relay_out,
                sid,
                &TerminalResponse::TerminalError {
                    session_id: None,
                    error: "invalid_terminal_frame".to_string(),
                },
            );
            return;
        }
    };

    match parsed {
        RelayTerminalClientMessage::TerminalOpen {
            session_id,
            workspace_id,
            attach,
            tmux_window_name,
            tmux_window_index,
            cwd,
            project_name,
            workspace_name,
            terminal_name,
            cols,
            rows,
            mode,
            shell,
        } => {
            open_terminal(
                state,
                sessions,
                sid,
                relay_out,
                TerminalOpenConfig {
                    session_id,
                    workspace_id,
                    attach: attach.unwrap_or(false),
                    tmux_window_name,
                    tmux_window_index,
                    cwd,
                    project_name,
                    workspace_name,
                    terminal_name,
                    cols,
                    rows,
                    mode,
                    shell,
                },
            )
            .await;
        }
        RelayTerminalClientMessage::TerminalInput { session_id, data } => {
            if let Err(error) = state.terminal_service.send_input(&session_id, &data).await {
                send_terminal_error(relay_out, sid, Some(session_id), error.to_string());
            }
        }
        RelayTerminalClientMessage::TerminalEnter { session_id } => {
            if let Err(error) = state.terminal_service.send_enter(&session_id).await {
                send_terminal_error(relay_out, sid, Some(session_id), error.to_string());
            }
        }
        RelayTerminalClientMessage::TerminalReport { session_id, data } => {
            if let Err(error) = state
                .terminal_service
                .send_terminal_report(&session_id, &data)
                .await
            {
                send_terminal_error(relay_out, sid, Some(session_id), error.to_string());
            }
        }
        RelayTerminalClientMessage::TerminalResize {
            session_id,
            cols,
            rows,
        } => {
            if let Err(error) = state.terminal_service.resize(&session_id, cols, rows).await {
                send_terminal_error(relay_out, sid, Some(session_id), error.to_string());
            }
        }
        RelayTerminalClientMessage::TerminalClose { session_id } => {
            close_terminal(state, sessions, sid, relay_out, &session_id, false).await;
        }
        RelayTerminalClientMessage::TerminalDestroy { session_id } => {
            close_terminal(state, sessions, sid, relay_out, &session_id, true).await;
        }
    }
}

pub async fn handle_terminal_client_close(
    state: &AppState,
    sessions: &TerminalRelaySessions,
    sid: &str,
) {
    let removed = {
        let mut locked = sessions.write().await;
        locked.remove(sid)
    };

    if let Some(session) = removed {
        session.output_task.abort();
        if !session.destroy_requested {
            if let Err(error) = state
                .terminal_service
                .close_session(&session.session_id)
                .await
            {
                debug!(
                    target: "atmos_relay",
                    session_id = %session.session_id,
                    error = %error,
                    "terminal relay close_session after client close failed"
                );
            }
        }
    }
}

struct TerminalOpenConfig {
    session_id: String,
    workspace_id: String,
    attach: bool,
    tmux_window_name: Option<String>,
    tmux_window_index: Option<u32>,
    cwd: Option<String>,
    project_name: Option<String>,
    workspace_name: Option<String>,
    terminal_name: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    mode: Option<String>,
    shell: Option<String>,
}

async fn open_terminal(
    state: &AppState,
    sessions: &TerminalRelaySessions,
    sid: &str,
    relay_out: &mpsc::UnboundedSender<Message>,
    config: TerminalOpenConfig,
) {
    handle_terminal_client_close(state, sessions, sid).await;

    let TerminalOpenConfig {
        session_id,
        workspace_id,
        attach,
        tmux_window_name,
        tmux_window_index,
        cwd,
        project_name,
        workspace_name,
        terminal_name,
        cols,
        rows,
        mode,
        shell,
    } = config;

    let cwd = cwd.or_else(|| {
        workspace_name.as_ref().and_then(|workspace| {
            let git_engine = GitEngine::new();
            git_engine
                .get_worktree_path(workspace)
                .ok()
                .filter(|path| path.exists())
                .map(|path| path.to_string_lossy().to_string())
        })
    });

    let terminal_service = state.terminal_service.clone();

    let result = if mode.as_deref() == Some("shell") {
        terminal_service
            .create_simple_session(CreateSimpleSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                shell,
                cols,
                rows,
                cwd,
                project_name,
                workspace_name,
                terminal_name,
            })
            .await
            .map(|rx| (rx, None, false))
    } else if attach && (tmux_window_index.is_some() || tmux_window_name.is_some()) {
        terminal_service
            .attach_session(AttachSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                tmux_window_index,
                tmux_window_name,
                cols,
                rows,
                project_name: project_name.clone(),
                workspace_name: workspace_name.clone(),
            })
            .await
            .map(|(rx, snapshot)| (rx, snapshot, true))
    } else {
        terminal_service
            .create_session(CreateSessionParams {
                session_id: session_id.clone(),
                workspace_id: workspace_id.clone(),
                shell,
                cols,
                rows,
                project_name,
                workspace_name,
                window_name: terminal_name,
                cwd,
            })
            .await
            .map(|(rx, snapshot)| (rx, snapshot, false))
    };

    let (mut output_rx, snapshot, attached) = match result {
        Ok(value) => value,
        Err(error) => {
            error!(target: "atmos_relay", error = %error, "terminal relay open failed");
            send_terminal_error(relay_out, sid, Some(session_id), error.to_string());
            return;
        }
    };

    let opened = if attached {
        TerminalResponse::TerminalAttached {
            session_id: session_id.clone(),
            workspace_id: workspace_id.clone(),
            snapshot,
        }
    } else {
        TerminalResponse::TerminalCreated {
            session_id: session_id.clone(),
            workspace_id: workspace_id.clone(),
            snapshot,
        }
    };
    send_terminal_response(relay_out, sid, &opened);

    let relay_out_clone = relay_out.clone();
    let sid_for_task = sid.to_string();
    let session_id_for_task = session_id.clone();
    let output_task = tokio::spawn(async move {
        while let Some(data) = output_rx.recv().await {
            if data.is_empty() {
                continue;
            }
            let response = relay_terminal_output(&session_id_for_task, &data);
            send_terminal_response_to_sid(&relay_out_clone, &sid_for_task, &response);
        }
    });

    let mut locked = sessions.write().await;
    locked.insert(
        sid.to_string(),
        RelayTerminalSession {
            session_id,
            output_task,
            destroy_requested: false,
        },
    );
}

async fn close_terminal(
    state: &AppState,
    sessions: &TerminalRelaySessions,
    sid: &str,
    relay_out: &mpsc::UnboundedSender<Message>,
    session_id: &str,
    destroy: bool,
) {
    let mut removed = {
        let mut locked = sessions.write().await;
        locked.remove(sid)
    };

    if let Some(session) = removed.as_mut() {
        session.destroy_requested = destroy;
        session.output_task.abort();
    }

    let result = if destroy {
        state.terminal_service.destroy_session(session_id).await
    } else {
        state.terminal_service.close_session(session_id).await
    };

    if let Err(error) = result {
        send_terminal_error(
            relay_out,
            sid,
            Some(session_id.to_string()),
            error.to_string(),
        );
        return;
    }

    let response = if destroy {
        TerminalResponse::TerminalDestroyed {
            session_id: session_id.to_string(),
        }
    } else {
        TerminalResponse::TerminalClosed {
            session_id: session_id.to_string(),
        }
    };
    send_terminal_response(relay_out, sid, &response);
}

fn send_terminal_error(
    relay_out: &mpsc::UnboundedSender<Message>,
    sid: &str,
    session_id: Option<String>,
    error: String,
) {
    send_terminal_response(
        relay_out,
        sid,
        &TerminalResponse::TerminalError { session_id, error },
    );
}

fn send_terminal_response<T: Serialize>(
    relay_out: &mpsc::UnboundedSender<Message>,
    sid: &str,
    response: &T,
) {
    send_terminal_response_to_sid(relay_out, sid, response);
}

fn send_terminal_response_to_sid<T: Serialize>(
    relay_out: &mpsc::UnboundedSender<Message>,
    sid: &str,
    response: &T,
) {
    let Ok(body) = serde_json::to_string(response) else {
        return;
    };
    let outbound = serde_json::json!({
        "v": 1_u32,
        "stream": "terminal",
        "kind": "frame",
        "from": "server",
        "to": format!("client:{sid}"),
        "body": body,
    })
    .to_string();
    let _ = relay_out.send(Message::Text(outbound));
}

fn relay_terminal_output(session_id: &str, data: &[u8]) -> RelayTerminalServerMessage {
    RelayTerminalServerMessage::TerminalOutput {
        session_id: session_id.to_string(),
        data_b64: BASE64_STANDARD.encode(data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn terminal_output_payload_is_base64_encoded() {
        let response = relay_terminal_output("session-1", &[0, b'a', 255]);
        let value = serde_json::to_value(response).expect("serialize terminal output");

        assert_eq!(value["type"], "terminal_output");
        assert_eq!(value["session_id"], "session-1");
        assert_eq!(value["data_b64"], "AGH/");
    }

    #[test]
    fn terminal_response_envelope_targets_one_relay_client() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        send_terminal_response_to_sid(
            &tx,
            "client-sid",
            &TerminalResponse::TerminalClosed {
                session_id: "session-1".to_string(),
            },
        );

        let message = rx.try_recv().expect("terminal envelope");
        let Message::Text(text) = message else {
            panic!("expected text relay envelope");
        };
        let envelope: Value = serde_json::from_str(&text).expect("parse relay envelope");
        let body: Value = serde_json::from_str(envelope["body"].as_str().expect("body string"))
            .expect("parse terminal body");

        assert_eq!(envelope["v"], 1);
        assert_eq!(envelope["stream"], "terminal");
        assert_eq!(envelope["kind"], "frame");
        assert_eq!(envelope["from"], "server");
        assert_eq!(envelope["to"], "client:client-sid");
        assert_eq!(body["type"], "terminal_closed");
        assert_eq!(body["session_id"], "session-1");
    }
}
