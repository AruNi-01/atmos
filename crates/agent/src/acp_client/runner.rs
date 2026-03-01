//! ACP session runner - runs the ACP connection in a dedicated thread.

use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use agent_client_protocol::{self as acp, Agent};
use tokio::io::AsyncReadExt;
use tokio::runtime::Builder;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{timeout, Duration};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::{error, info, warn};

use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{AuthMethodSummary, AuthRequiredPayload, PermissionRequest};
use crate::acp_client::{AcpSessionEvent, AtmosAcpClient};
use crate::models::AgentLaunchSpec;

use super::process::spawn_agent;

/// Command sent to the ACP session loop
enum SessionCommand {
    Prompt(String),
    Cancel,
    SetConfigOption(String, String),
}

fn map_config_options(
    opts: Vec<acp::SessionConfigOption>,
) -> Vec<crate::acp_client::types::AgentConfigOption> {
    opts.into_iter()
        .map(|opt| {
            let (current_value, options_vec) = match opt.kind {
                acp::SessionConfigKind::Select(s) => {
                    let current = Some(s.current_value.to_string());
                    let mut options = Vec::new();
                    match s.options {
                        acp::SessionConfigSelectOptions::Ungrouped(uns) => {
                            for o in uns {
                                options.push(crate::acp_client::types::AgentConfigOptionValue {
                                    value: o.value.to_string(),
                                    name: Some(o.name),
                                    description: o.description,
                                });
                            }
                        }
                        acp::SessionConfigSelectOptions::Grouped(gs) => {
                            for g in gs {
                                for o in g.options {
                                    options.push(crate::acp_client::types::AgentConfigOptionValue {
                                        value: o.value.to_string(),
                                        name: Some(o.name),
                                        description: o.description,
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                    (current, options)
                }
                sc_kind => {
                    tracing::warn!(
                        "Unsupported config option kind for config_id {}: {:?}",
                        opt.id,
                        sc_kind
                    );
                    (None, Vec::new())
                }
            };

            crate::acp_client::types::AgentConfigOption {
                id: opt.id.to_string(),
                name: Some(opt.name),
                description: opt.description,
                category: opt.category.map(|c| {
                    let json = serde_json::to_value(&c).unwrap_or(serde_json::Value::Null);
                    json.as_str().unwrap_or("").to_string()
                }),
                r#type: "select".to_string(),
                current_value,
                options: options_vec,
            }
        })
        .collect()
}

/// Handle to an active ACP session - used to send prompts, receive events, and handle permissions
pub struct AcpSessionHandle {
    pub session_id: String,
    cmd_tx: mpsc::UnboundedSender<SessionCommand>,
    event_rx: mpsc::UnboundedReceiver<AcpSessionEvent>,
    permission_rx: mpsc::UnboundedReceiver<(PermissionRequest, oneshot::Sender<bool>)>,
}

pub const AUTH_REQUIRED_ERROR_PREFIX: &str = "ACP_AUTH_REQUIRED::";

impl AcpSessionHandle {
    pub fn send_prompt(&self, message: String) {
        let _ = self.cmd_tx.send(SessionCommand::Prompt(message));
    }

    /// Send a session/cancel notification to interrupt the current turn
    pub fn send_cancel(&self) {
        let _ = self.cmd_tx.send(SessionCommand::Cancel);
    }

    pub fn send_set_config_option(&self, config_id: String, value: String) {
        let _ = self.cmd_tx.send(SessionCommand::SetConfigOption(config_id, value));
    }

    pub async fn recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.recv().await
    }

    pub fn try_recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.try_recv().ok()
    }

    /// Receive pending permission request (non-blocking)
    pub fn try_recv_permission(&mut self) -> Option<(PermissionRequest, oneshot::Sender<bool>)> {
        self.permission_rx.try_recv().ok()
    }
}

/// Run an ACP session in a dedicated thread with current_thread runtime.
/// Returns a handle for sending prompts and receiving events.
pub async fn run_acp_session(
    session_id_hint: String,
    launch_spec: AgentLaunchSpec,
    cwd: PathBuf,
    handler: Arc<dyn AcpToolHandler>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    resume_session_id: Option<String>,
    auth_method_id: Option<String>,
    default_config: Option<std::collections::HashMap<String, String>>,
) -> Result<AcpSessionHandle, String> {
    let session_id_for_thread = session_id_hint.clone();
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<SessionCommand>();
    let (event_tx, event_rx) = mpsc::unbounded_channel::<AcpSessionEvent>();
    let (permission_tx, permission_rx) = mpsc::unbounded_channel();
    let (ready_tx, ready_rx) = oneshot::channel::<Result<String, String>>();
    let event_tx_end = event_tx.clone();

    thread::Builder::new()
        .name(format!(
            "acp-session-{}",
            &session_id_for_thread[..session_id_for_thread.len().min(8)]
        ))
        .spawn(move || {
            let rt = Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create ACP runtime");

            rt.block_on(async move {
                match run_session_inner(
                    &session_id_for_thread,
                    launch_spec,
                    &cwd,
                    handler,
                    env_overrides,
                    resume_session_id,
                    auth_method_id,
                    &mut cmd_rx,
                    event_tx.clone(),
                    permission_tx,
                    Some(ready_tx),
                    default_config,
                )
                .await
                {
                    Ok(()) => info!("ACP session {} ended normally", session_id_for_thread),
                    Err(e) => {
                        error!("ACP session {} error: {}", session_id_for_thread, e);
                        let _ = event_tx_end.send(AcpSessionEvent::Error {
                            code: "SESSION_ERROR".to_string(),
                            message: e,
                            recoverable: false,
                        });
                    }
                }
                let _ = event_tx_end.send(AcpSessionEvent::SessionEnded);
            });
        })
        .map_err(|e| format!("Failed to spawn ACP thread: {}", e))?;

    let session_id = ready_rx
        .await
        .map_err(|_| "ACP session setup channel closed".to_string())??;

    Ok(AcpSessionHandle {
        session_id,
        cmd_tx,
        event_rx,
        permission_rx,
    })
}

async fn run_session_inner(
    _session_id: &str,
    launch_spec: AgentLaunchSpec,
    cwd: &PathBuf,
    handler: Arc<dyn AcpToolHandler>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    resume_session_id: Option<String>,
    auth_method_id: Option<String>,
    cmd_rx: &mut mpsc::UnboundedReceiver<SessionCommand>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<bool>)>,
    mut ready_tx: Option<oneshot::Sender<Result<String, String>>>,
    default_config: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let (stdin, stdout, stderr, mut _child) =
        spawn_agent(&launch_spec, Some(cwd.clone()), env_overrides).map_err(|e| {
            let msg = format!("Failed to spawn agent: {}", e);
            if let Some(tx) = ready_tx.take() {
                let _ = tx.send(Err(msg.clone()));
            }
            msg
        })?;

    // Collect stderr in background. When the agent exits (pipe closes), send
    // the collected output via a oneshot so the main task can await it.
    let (stderr_tx, stderr_rx) = oneshot::channel::<String>();
    tokio::spawn(async move {
        let mut buf = Vec::new();
        let mut stderr = stderr;
        let _ = stderr.read_to_end(&mut buf).await;
        let text = String::from_utf8_lossy(&buf).trim().to_string();
        let _ = stderr_tx.send(text);
    });

    let client = AtmosAcpClient::new(handler, cwd.clone(), permission_tx, event_tx.clone());

    let outgoing = stdin.compat_write();
    let incoming = stdout.compat();
    let cwd = cwd.clone();

    // Per agent-client-protocol rust-sdk docs: ClientSideConnection spawns futures via spawn_local.
    // spawn_local requires LocalSet context. Create conn and run everything INSIDE run_until.
    let local_set = tokio::task::LocalSet::new();
    local_set
        .run_until(async move {
            let (conn, handle_io) =
                acp::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                    tokio::task::spawn_local(fut);
                });

            tokio::task::spawn_local(handle_io);

            // Use match instead of map_err so we can async-await stderr on failure.
            let init_response = match conn
                .initialize(
                    acp::InitializeRequest::new(acp::ProtocolVersion::V1)
                        .client_info(acp::Implementation::new("atmos", "0.1.0").title("ATMOS")),
                )
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    // Wait up to 1 s for the agent process to flush its stderr so we
                    // can show the real error (e.g. "You are not logged in") instead of
                    // the generic protocol-level message.
                    let stderr_text = timeout(Duration::from_secs(1), stderr_rx)
                        .await
                        .ok()
                        .and_then(|r| r.ok())
                        .filter(|s| !s.is_empty());
                    let msg = if let Some(stderr) = stderr_text {
                        format!("Agent error: {}", stderr)
                    } else {
                        format!("Initialize failed: {}", e)
                    };
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(msg.clone()));
                    }
                    return Err(msg);
                }
            };

            let auth_methods: Vec<AuthMethodSummary> = init_response
                .auth_methods
                .iter()
                .map(|m| AuthMethodSummary {
                    id: m.id.to_string(),
                    name: m.name.clone(),
                    description: m.description.clone(),
                })
                .collect();

            if let Some(method_id) = auth_method_id {
                conn.authenticate(acp::AuthenticateRequest::new(method_id))
                    .await
                    .map_err(|e| {
                        let msg = format!("Authenticate failed: {}", e);
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(Err(msg.clone()));
                        }
                        msg
                    })?;
            }

            let create_or_load_result: acp::Result<acp::SessionId> =
                if let Some(resume_id) = resume_session_id.clone() {
                    let requested = acp::SessionId::new(resume_id.clone());
                    match conn
                        .load_session(acp::LoadSessionRequest::new(requested.clone(), cwd.clone()))
                        .await
                    {
                        Ok(response) => {
                            info!("Loaded ACP session: {}", resume_id);
                            if let Some(opts) = response.config_options {
                                let out = map_config_options(opts);
                                let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                            }
                            Ok(requested)
                        }
                        Err(e) => {
                            warn!(
                                "ACP load_session failed for {}: {}, fallback to new_session",
                                resume_id,
                                e
                            );
                            conn.new_session(acp::NewSessionRequest::new(cwd.clone()))
                                .await
                                .map(|response| {
                                    if let Some(opts) = response.config_options {
                                        let out = map_config_options(opts);
                                        let _ = event_tx
                                            .send(AcpSessionEvent::ConfigOptionsUpdate(out));
                                    }
                                    response.session_id
                                })
                        }
                    }
                } else {
                    conn.new_session(acp::NewSessionRequest::new(cwd))
                        .await
                        .map(|response| {
                            if let Some(opts) = response.config_options {
                                let out = map_config_options(opts);
                                let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                            }
                            response.session_id
                        })
                };

            let session_id_acp = match create_or_load_result {
                Ok(session_id) => session_id,
                Err(err) if err.code == acp::ErrorCode::AuthRequired => {
                    if auth_methods.is_empty() {
                        let msg =
                            "Agent requires authentication, but no auth methods were advertised"
                                .to_string();
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(Err(msg.clone()));
                        }
                        return Err(msg);
                    }
                    let auth_payload = AuthRequiredPayload {
                        request_id: uuid::Uuid::new_v4().to_string(),
                        methods: auth_methods,
                        message: "Authentication required by agent".to_string(),
                    };
                    let payload = serde_json::to_string(&auth_payload)
                        .map_err(|e| format!("Serialize auth payload failed: {}", e))?;
                    let msg = format!("{}{}", AUTH_REQUIRED_ERROR_PREFIX, payload);
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(msg.clone()));
                    }
                    return Err(msg);
                }
                Err(err) => {
                    let msg = err.to_string();
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(msg.clone()));
                    }
                    return Err(msg);
                }
            };

            // Apply default configurations if any
            if let Some(defaults) = default_config {
                for (config_id, value) in defaults {
                    info!("Applying default config for {}: {}={}", _session_id, config_id, value);
                    let req = acp::SetSessionConfigOptionRequest::new(
                        session_id_acp.clone(),
                        acp::SessionConfigId::new(config_id),
                        acp::SessionConfigValueId::new(value),
                    );
                    match conn.set_session_config_option(req).await {
                        Ok(resp) => {
                            let out = map_config_options(resp.config_options);
                            let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                        }
                        Err(e) => {
                            warn!("Failed to apply default config for {}: {}", _session_id, e);
                        }
                    }
                }
            }

            // Per ACP spec, the session/load response means all history has been
            // replayed. However, the SDK dispatches notifications as spawned tasks
            // on this single-threaded runtime, so some may still be pending when
            // load_session() returns. Yield repeatedly to let them flush before
            // emitting the completion signal.
            if resume_session_id.is_some() {
                for _ in 0..20 {
                    tokio::task::yield_now().await;
                }
                let _ = event_tx.send(AcpSessionEvent::LoadCompleted);
            }

            if let Some(tx) = ready_tx.take() {
                let _ = tx.send(Ok(session_id_acp.to_string()));
            }

            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    SessionCommand::Prompt(msg) => {
                        if msg.is_empty() {
                            break;
                        }
                        if let Err(e) = conn
                            .prompt(acp::PromptRequest::new(
                                session_id_acp.clone(),
                                vec![msg.into()],
                            ))
                            .await
                        {
                            warn!("Prompt failed: {}", e);
                            let _ = event_tx.send(AcpSessionEvent::Error {
                                code: "PROMPT_FAILED".to_string(),
                                message: e.to_string(),
                                recoverable: true,
                            });
                        }
                        let _ = event_tx.send(AcpSessionEvent::TurnEnd);
                    }
                    SessionCommand::Cancel => {
                        if let Err(e) = conn
                            .cancel(acp::CancelNotification::new(session_id_acp.clone()))
                            .await
                        {
                            warn!("Cancel failed: {}", e);
                        }
                    }
                    SessionCommand::SetConfigOption(config_id, value) => {
                        if let Err(e) = conn
                            .set_session_config_option(acp::SetSessionConfigOptionRequest::new(
                                session_id_acp.clone(),
                                acp::SessionConfigId::new(config_id),
                                acp::SessionConfigValueId::new(value),
                            ))
                            .await
                        {
                            warn!("Set config option failed: {}", e);
                        }
                    }
                }
            }

            Ok(())
        })
        .await
}
