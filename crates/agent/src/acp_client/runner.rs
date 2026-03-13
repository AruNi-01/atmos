//! ACP session runner - runs the ACP connection in a dedicated thread.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use agent_client_protocol::{self as acp, Agent};
use tokio::io::AsyncReadExt;
use tokio::runtime::Builder;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{timeout, Duration};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::{error, info, warn};

use crate::acp_client::logging::append_acp_log;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{
    AgentTurnUsage, AuthMethodSummary, AuthRequiredPayload, PermissionRequest,
};
use crate::acp_client::{AcpSessionEvent, AtmosAcpClient};
use crate::models::AgentLaunchSpec;

use super::process::spawn_agent;

/// Command sent to the ACP session loop
enum SessionCommand {
    Prompt(String),
    Cancel,
    SetConfigOption(String, String),
}

/// Convert legacy `modes` (from the older Session Modes API) into an AgentConfigOption.
pub(crate) fn map_modes_to_config_option(
    modes: acp::SessionModeState,
) -> crate::acp_client::types::AgentConfigOption {
    let options = modes
        .available_modes
        .into_iter()
        .map(|m| crate::acp_client::types::AgentConfigOptionValue {
            value: m.id.to_string(),
            name: Some(m.name),
            description: m.description,
        })
        .collect();
    crate::acp_client::types::AgentConfigOption {
        id: "mode".to_string(),
        name: Some("Mode".to_string()),
        description: None,
        category: Some("mode".to_string()),
        r#type: "select".to_string(),
        current_value: Some(modes.current_mode_id.to_string()),
        options,
    }
}

/// Convert legacy `models` (from the unstable Session Models API) into an AgentConfigOption.
pub(crate) fn map_models_to_config_option(
    models: acp::SessionModelState,
) -> crate::acp_client::types::AgentConfigOption {
    let options = models
        .available_models
        .into_iter()
        .map(|m| crate::acp_client::types::AgentConfigOptionValue {
            value: m.model_id.to_string(),
            name: Some(m.name),
            description: m.description,
        })
        .collect();
    crate::acp_client::types::AgentConfigOption {
        id: "model".to_string(),
        name: Some("Model".to_string()),
        description: None,
        category: Some("model".to_string()),
        r#type: "select".to_string(),
        current_value: Some(models.current_model_id.to_string()),
        options,
    }
}

pub(crate) fn map_config_options(
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
                                    options.push(
                                        crate::acp_client::types::AgentConfigOptionValue {
                                            value: o.value.to_string(),
                                            name: Some(o.name),
                                            description: o.description,
                                        },
                                    );
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

fn current_value_only_config_option(
    id: &str,
    value: String,
) -> crate::acp_client::types::AgentConfigOption {
    crate::acp_client::types::AgentConfigOption {
        id: id.to_string(),
        name: None,
        description: None,
        category: None,
        r#type: "select".to_string(),
        current_value: Some(value),
        options: Vec::new(),
    }
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
        let _ = self
            .cmd_tx
            .send(SessionCommand::SetConfigOption(config_id, value));
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
#[allow(clippy::too_many_arguments)]
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
    let event_tx_panic = event_tx.clone();

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

            let panic_result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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
                            Ok(()) => {
                                info!("ACP session {} ended normally", session_id_for_thread)
                            }
                            Err(e) => {
                                error!(
                                    "ACP session {} error: {}",
                                    session_id_for_thread, e
                                );
                                let _ = event_tx_end.send(AcpSessionEvent::Error {
                                    code: "SESSION_ERROR".to_string(),
                                    message: e,
                                    recoverable: false,
                                });
                            }
                        }
                        let _ = event_tx_end.send(AcpSessionEvent::SessionEnded);
                    });
                }));
            if let Err(panic_info) = panic_result {
                error!("ACP session thread panicked: {:?}", panic_info);
                let _ = event_tx_panic.send(AcpSessionEvent::Error {
                    code: "SESSION_PANIC".to_string(),
                    message: "ACP session thread panicked".to_string(),
                    recoverable: false,
                });
                let _ = event_tx_panic.send(AcpSessionEvent::SessionEnded);
            }
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

#[allow(clippy::too_many_arguments)]
async fn run_session_inner(
    session_id: &str,
    launch_spec: AgentLaunchSpec,
    cwd: &Path,
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
    // Must be held alive for the session duration; dropping triggers kill_on_drop
    let (stdin, stdout, stderr, child_guard) =
        spawn_agent(&launch_spec, Some(cwd.to_path_buf()), env_overrides).map_err(|e| {
            let msg = format!("Failed to spawn agent: {}", e);
            if let Some(tx) = ready_tx.take() {
                let _ = tx.send(Err(msg.clone()));
            }
            msg
        })?;
    let _child_guard = child_guard;

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

    let client = AtmosAcpClient::new(handler, cwd.to_path_buf(), permission_tx, event_tx.clone());

    let outgoing = stdin.compat_write();
    let incoming = stdout.compat();
    let cwd = cwd.to_path_buf();

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

            // Track whether the agent uses legacy APIs so we can translate
            // SetConfigOption("mode"/"model", ..) → set_session_mode/set_session_model.
            let mut uses_legacy_modes = false;
            let mut uses_legacy_models = false;

            /// Helper: emit config options from a session response, checking
            /// the new `config_options` and the legacy `modes`/`models` fields.
            /// Returns (uses_legacy_modes, uses_legacy_models).
            fn emit_session_config(
                config_options: Option<Vec<acp::SessionConfigOption>>,
                modes: Option<acp::SessionModeState>,
                models: Option<acp::SessionModelState>,
                event_tx: &mpsc::UnboundedSender<AcpSessionEvent>,
            ) -> (bool, bool) {
                if let Some(opts) = config_options {
                    info!("Session returned {} config options", opts.len());
                    let out = map_config_options(opts);
                    let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                    (false, false)
                } else {
                    let mut legacy_opts = Vec::new();
                    let mut leg_modes = false;
                    let mut leg_models = false;
                    if let Some(modes) = modes {
                        info!(
                            "Session returned legacy modes ({} available)",
                            modes.available_modes.len()
                        );
                        legacy_opts.push(map_modes_to_config_option(modes));
                        leg_modes = true;
                    }
                    if let Some(models) = models {
                        info!(
                            "Session returned legacy models ({} available)",
                            models.available_models.len()
                        );
                        legacy_opts.push(map_models_to_config_option(models));
                        leg_models = true;
                    }
                    if legacy_opts.is_empty() {
                        info!("Session returned NO config options, modes, or models");
                    } else {
                        let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(legacy_opts));
                    }
                    (leg_modes, leg_models)
                }
            }

            let mut loaded_existing_session = false;
            let create_or_load_result: acp::Result<acp::SessionId> =
                if let Some(resume_id) = resume_session_id.clone() {
                    let requested = acp::SessionId::new(resume_id.clone());
                    match conn
                        .load_session(acp::LoadSessionRequest::new(requested.clone(), cwd.clone()))
                        .await
                    {
                        Ok(response) => {
                            info!("Loaded ACP session: {}", resume_id);
                            loaded_existing_session = true;
                            (uses_legacy_modes, uses_legacy_models) = emit_session_config(
                                response.config_options,
                                response.modes,
                                response.models,
                                &event_tx,
                            );
                            Ok(requested)
                        }
                        Err(e) => {
                            warn!(
                                "ACP load_session failed for {}: {}, fallback to new_session",
                                resume_id, e
                            );
                            conn.new_session(acp::NewSessionRequest::new(cwd.clone()))
                                .await
                                .map(|response| {
                                    (uses_legacy_modes, uses_legacy_models) = emit_session_config(
                                        response.config_options,
                                        response.modes,
                                        response.models,
                                        &event_tx,
                                    );
                                    response.session_id
                                })
                        }
                    }
                } else {
                    conn.new_session(acp::NewSessionRequest::new(cwd))
                        .await
                        .map(|response| {
                            (uses_legacy_modes, uses_legacy_models) = emit_session_config(
                                response.config_options,
                                response.modes,
                                response.models,
                                &event_tx,
                            );
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

            // Apply default configurations for newly created sessions only.
            // When resuming an existing ACP session, applying defaults again can
            // overwrite the live session config (for example, model selection).
            if !loaded_existing_session {
                if let Some(defaults) = default_config {
                    for (config_id, value) in defaults {
                        info!(
                            "Applying default config for {}: {}={}",
                            session_id, config_id, value
                        );
                        if uses_legacy_modes && config_id == "mode" {
                            match conn
                                .set_session_mode(acp::SetSessionModeRequest::new(
                                    session_id_acp.clone(),
                                    value.clone(),
                                ))
                                .await
                            {
                                Ok(_) => {
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(vec![
                                            current_value_only_config_option("mode", value),
                                        ]));
                                }
                                Err(e) => {
                                    warn!(
                                        "Failed to apply default mode for {}: {}",
                                        session_id, e
                                    );
                                }
                            }
                        } else if uses_legacy_models && config_id == "model" {
                            match conn
                                .set_session_model(acp::SetSessionModelRequest::new(
                                    session_id_acp.clone(),
                                    value.clone(),
                                ))
                                .await
                            {
                                Ok(_) => {
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(vec![
                                            current_value_only_config_option("model", value),
                                        ]));
                                }
                                Err(e) => {
                                    warn!(
                                        "Failed to apply default model for {}: {}",
                                        session_id, e
                                    );
                                }
                            }
                        } else {
                            let req = acp::SetSessionConfigOptionRequest::new(
                                session_id_acp.clone(),
                                acp::SessionConfigId::new(config_id),
                                acp::SessionConfigValueId::new(value),
                            );
                            match conn.set_session_config_option(req).await {
                                Ok(resp) => {
                                    let out = map_config_options(resp.config_options);
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                                }
                                Err(e) => {
                                    warn!(
                                        "Failed to apply default config for {}: {}",
                                        session_id, e
                                    );
                                }
                            }
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
                        append_acp_log(
                            &session_id_acp.to_string(),
                            "client_to_agent_acp",
                            "prompt_request",
                            &serde_json::json!({
                                "session_id": session_id_acp.to_string(),
                                "message": msg.clone(),
                            }),
                        );
                        match conn
                            .prompt(acp::PromptRequest::new(
                                session_id_acp.clone(),
                                vec![msg.into()],
                            ))
                            .await
                        {
                            Ok(res) => {
                                let usage = res.usage.map(|u| AgentTurnUsage {
                                    total_tokens: Some(u.total_tokens),
                                    input_tokens: Some(u.input_tokens),
                                    output_tokens: Some(u.output_tokens),
                                    thought_tokens: u.thought_tokens,
                                    cached_read_tokens: u.cached_read_tokens,
                                    cached_write_tokens: u.cached_write_tokens,
                                });
                                let _ = event_tx.send(AcpSessionEvent::TurnEnd(usage));
                            }
                            Err(e) => {
                                warn!("Prompt failed: {}", e);
                                let _ = event_tx.send(AcpSessionEvent::Error {
                                    code: "PROMPT_FAILED".to_string(),
                                    message: e.to_string(),
                                    recoverable: true,
                                });
                                let _ = event_tx.send(AcpSessionEvent::TurnEnd(None));
                            }
                        }
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
                        if uses_legacy_modes && config_id == "mode" {
                            info!("Using legacy set_session_mode: {}", value);
                            match conn
                                .set_session_mode(acp::SetSessionModeRequest::new(
                                    session_id_acp.clone(),
                                    value.clone(),
                                ))
                                .await
                            {
                                Ok(_) => {
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(vec![
                                            current_value_only_config_option("mode", value),
                                        ]));
                                }
                                Err(e) => warn!("Set session mode failed: {}", e),
                            }
                        } else if uses_legacy_models && config_id == "model" {
                            info!("Using legacy set_session_model: {}", value);
                            match conn
                                .set_session_model(acp::SetSessionModelRequest::new(
                                    session_id_acp.clone(),
                                    value.clone(),
                                ))
                                .await
                            {
                                Ok(_) => {
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(vec![
                                            current_value_only_config_option("model", value),
                                        ]));
                                }
                                Err(e) => warn!("Set session model failed: {}", e),
                            }
                        } else {
                            match conn
                                .set_session_config_option(acp::SetSessionConfigOptionRequest::new(
                                    session_id_acp.clone(),
                                    acp::SessionConfigId::new(config_id),
                                    acp::SessionConfigValueId::new(value),
                                ))
                                .await
                            {
                                Ok(resp) => {
                                    let out = map_config_options(resp.config_options);
                                    let _ =
                                        event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
                                }
                                Err(e) => warn!("Set config option failed: {}", e),
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .await
}
