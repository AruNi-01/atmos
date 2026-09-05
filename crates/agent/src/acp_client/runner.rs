//! ACP session runner - runs the ACP connection in a dedicated thread.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use agent_client_protocol::schema::v1 as schema;
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{
    self as acp, Agent, ByteStreams, ConnectionTo, JsonRpcMessage, JsonRpcRequest, UntypedMessage,
};
use serde::Serialize;
use serde_json::Value;
use tokio::io::AsyncReadExt;
use tokio::runtime::Builder;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{timeout, Duration};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::{error, info, warn};

use crate::acp_client::client::{map_turn_usage, AcpTurnStop};
use crate::acp_client::logging::append_acp_log;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{
    AgentCapabilitiesSnapshot, AgentCapabilityState, AgentImplementationInfo, AgentLogoutResult,
    AuthMethodSummary, AuthRequiredPayload, NativeAgentSession, NativeAgentSessionList,
    PermissionRequest,
};
use crate::acp_client::usage_normalize::spawn_usage_normalizer;
use crate::acp_client::{AcpSessionEvent, AtmosAcpClient};
use crate::models::AgentLaunchSpec;

use super::process::spawn_agent;

pub(crate) type ExtNotificationPayload = (String, Value);

/// ACP extension JSON-RPC `method` must start with `_`.
pub(crate) fn ensure_ext_wire_method(method: &str) -> String {
    if method.starts_with('_') {
        method.to_string()
    } else {
        format!("_{method}")
    }
}

/// Outbound extension request. Schema `ExtRequest` is not `JsonRpcRequest`.
#[derive(Debug, Clone)]
struct OutboundExtMethod {
    method: String,
    params: Value,
}

impl JsonRpcMessage for OutboundExtMethod {
    fn matches_method(_method: &str) -> bool {
        false
    }

    fn method(&self) -> &str {
        &self.method
    }

    fn to_untyped_message(&self) -> Result<UntypedMessage, acp::Error> {
        UntypedMessage::new(&self.method, &self.params)
    }

    fn parse_message(_method: &str, _params: &impl Serialize) -> Result<Self, acp::Error> {
        Err(acp::Error::method_not_found())
    }
}

impl JsonRpcRequest for OutboundExtMethod {
    type Response = Value;
}

/// Inbound agent → client extension request (`_…` methods, e.g. Grok Ask User).
#[derive(Debug, Clone)]
struct InboundExtMethod {
    method: String,
    params: Value,
}

impl JsonRpcMessage for InboundExtMethod {
    fn matches_method(method: &str) -> bool {
        method.starts_with('_')
    }

    fn method(&self) -> &str {
        &self.method
    }

    fn to_untyped_message(&self) -> Result<UntypedMessage, acp::Error> {
        UntypedMessage::new(&self.method, &self.params)
    }

    fn parse_message(method: &str, params: &impl Serialize) -> Result<Self, acp::Error> {
        let params = serde_json::to_value(params).map_err(acp::Error::into_internal_error)?;
        Ok(Self {
            method: method.to_string(),
            params,
        })
    }
}

impl JsonRpcRequest for InboundExtMethod {
    type Response = Value;
}

async fn send_outbound_ext_method(
    conn: &ConnectionTo<Agent>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let request = OutboundExtMethod {
        method: ensure_ext_wire_method(&method),
        params,
    };
    conn.send_request(request)
        .block_task()
        .await
        .map_err(|error| error.to_string())
}

/// Command sent to the ACP session loop
enum SessionCommand {
    Prompt {
        text: String,
        attachments: Vec<String>,
        /// When set, wait for `session/prompt` to finish and report success/failure.
        /// Used for Grok mid-session slash permission toggles (`/always-approve`, `/auto`).
        /// Does not emit `AcpSessionEvent::TurnEnd` (not a user chat turn).
        reply: Option<oneshot::Sender<Result<(), String>>>,
    },
    Cancel,
    Close,
    SetConfigOption {
        config_id: String,
        value: String,
        reply: oneshot::Sender<Result<Vec<crate::acp_client::types::AgentConfigOption>, String>>,
    },
    ExtMethod {
        method: String,
        params: Value,
        reply: oneshot::Sender<Result<Value, String>>,
    },
}

/// Convert legacy `modes` (from the older Session Modes API) into an AgentConfigOption.
pub(crate) fn map_modes_to_config_option(
    modes: schema::SessionModeState,
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

pub(crate) fn map_config_options(
    opts: Vec<schema::SessionConfigOption>,
) -> Vec<crate::acp_client::types::AgentConfigOption> {
    opts.into_iter()
        .map(|opt| {
            let (current_value, options_vec, option_type) = match opt.kind {
                schema::SessionConfigKind::Select(s) => {
                    let current = Some(s.current_value.to_string());
                    let mut options = Vec::new();
                    match s.options {
                        schema::SessionConfigSelectOptions::Ungrouped(uns) => {
                            for o in uns {
                                options.push(crate::acp_client::types::AgentConfigOptionValue {
                                    value: o.value.to_string(),
                                    name: Some(o.name),
                                    description: o.description,
                                });
                            }
                        }
                        schema::SessionConfigSelectOptions::Grouped(gs) => {
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
                    (current, options, "select")
                }
                schema::SessionConfigKind::Boolean(b) => (
                    Some(if b.current_value {
                        "true".to_string()
                    } else {
                        "false".to_string()
                    }),
                    Vec::new(),
                    "boolean",
                ),
                sc_kind => {
                    tracing::warn!(
                        "Unsupported config option kind for config_id {}: {:?}",
                        opt.id,
                        sc_kind
                    );
                    (None, Vec::new(), "select")
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
                r#type: option_type.to_string(),
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

/// Cursor (and others) opt into bare `model` + separate `effort` / `fast` when the
/// client declares `_meta.parameterizedModelPicker` on initialize.
fn atmos_initialize_request() -> schema::InitializeRequest {
    let mut meta = serde_json::Map::new();
    meta.insert(
        "parameterizedModelPicker".to_string(),
        serde_json::Value::Bool(true),
    );
    schema::InitializeRequest::new(ProtocolVersion::V1)
        .client_info(schema::Implementation::new("atmos", "0.1.0").title("ATMOS"))
        .client_capabilities(schema::ClientCapabilities::new().meta(meta))
}

fn ordered_config_values(values: HashMap<String, String>) -> Vec<(String, String)> {
    let mut remaining = values;
    let mut ordered = Vec::new();
    for config_id in [
        "mode",
        "permissionMode",
        "permission_mode",
        "model",
        "reasoning_effort",
        "effort",
        "thought_level",
        "thinking",
        "fast",
        "fast-mode",
        "fast_mode",
    ] {
        if let Some(value) = remaining.remove(config_id) {
            ordered.push((config_id.to_string(), value));
        }
    }
    let mut rest: Vec<_> = remaining.into_iter().collect();
    rest.sort_by(|a, b| a.0.cmp(&b.0));
    ordered.extend(rest);
    ordered
}

fn error_looks_like_method_not_found(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("method not found") || lower.contains("-32601")
}

/// Internal wait-for-completion `session/prompt` (Grok `/always-approve`, `/auto`).
///
/// Must **not** emit `TurnEnd`: those replies are control RPCs, not user chat turns.
/// Emitting `TurnEnd` races with a following user `send_prompt` and prematurely
/// completes (then drops) the Atmos turn — UI flashes idle after session create
/// and then spins on Streaming forever.
async fn run_prompt_turn(
    conn: &ConnectionTo<Agent>,
    session_id_acp: &schema::SessionId,
    text: &str,
    attachments: &[String],
) -> Result<(), String> {
    append_acp_log(
        &session_id_acp.to_string(),
        "client_to_agent_acp",
        "prompt_request",
        &serde_json::json!({
            "session_id": session_id_acp.to_string(),
            "message": text,
            "attachments": attachments,
            "queued_after_turn": true,
            "internal_control": true,
        }),
    );
    match conn
        .send_request(schema::PromptRequest::new(
            session_id_acp.clone(),
            prompt_content_blocks(text, attachments),
        ))
        .block_task()
        .await
    {
        Ok(_res) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

async fn set_session_mode(
    conn: &ConnectionTo<Agent>,
    session_id_acp: &schema::SessionId,
    value: String,
    event_tx: &mpsc::UnboundedSender<AcpSessionEvent>,
) -> Result<Vec<crate::acp_client::types::AgentConfigOption>, String> {
    conn.send_request(schema::SetSessionModeRequest::new(
        session_id_acp.clone(),
        value.clone(),
    ))
    .block_task()
    .await
    .map_err(|error| error.to_string())?;
    let out = vec![current_value_only_config_option("mode", value)];
    let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out.clone()));
    Ok(out)
}

async fn set_session_config_option(
    conn: &ConnectionTo<Agent>,
    session_id_acp: &schema::SessionId,
    config_id: String,
    value: String,
    uses_legacy_modes: bool,
    event_tx: &mpsc::UnboundedSender<AcpSessionEvent>,
) -> Result<Vec<crate::acp_client::types::AgentConfigOption>, String> {
    if uses_legacy_modes && config_id == "mode" {
        return set_session_mode(conn, session_id_acp, value, event_tx).await;
    }
    let req = schema::SetSessionConfigOptionRequest::new(
        session_id_acp.clone(),
        schema::SessionConfigId::new(config_id.clone()),
        schema::SessionConfigValueId::new(value.clone()),
    );
    match conn.send_request(req).block_task().await {
        Ok(resp) => {
            let out = map_config_options(resp.config_options);
            let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out.clone()));
            Ok(out)
        }
        // Grok stdio has no `session/set_config_option` (-32601). Plan/Normal still
        // work via ACP `session/set_mode` (live probe: modeId plan|default).
        Err(error)
            if config_id == "mode" && error_looks_like_method_not_found(&error.to_string()) =>
        {
            set_session_mode(conn, session_id_acp, value, event_tx).await
        }
        Err(error) => Err(error.to_string()),
    }
}

fn resume_session_id_skips_host_config(resume_session_id: Option<&str>) -> bool {
    resume_session_id.is_some()
}

async fn apply_config_values(
    conn: &ConnectionTo<Agent>,
    session_id_acp: &schema::SessionId,
    values: HashMap<String, String>,
    uses_legacy_modes: bool,
    event_tx: &mpsc::UnboundedSender<AcpSessionEvent>,
    context: &str,
) {
    for (config_id, value) in ordered_config_values(values) {
        let session_id_text = session_id_acp.to_string();
        info!(
            "Applying {} config for {}: {}",
            context, &session_id_text, config_id
        );
        if let Err(error) = set_session_config_option(
            conn,
            session_id_acp,
            config_id,
            value,
            uses_legacy_modes,
            event_tx,
        )
        .await
        {
            warn!(
                "Failed to apply {} config for {}: {}",
                context, &session_id_text, error
            );
        }
    }
}

pub(crate) fn map_implementation_info(
    info: Option<schema::Implementation>,
) -> Option<AgentImplementationInfo> {
    info.map(|info| AgentImplementationInfo {
        name: info.name,
        title: info.title,
        version: info.version,
    })
}

pub(crate) fn map_agent_capabilities(
    capabilities: &schema::AgentCapabilities,
) -> AgentCapabilitiesSnapshot {
    let session = &capabilities.session_capabilities;
    AgentCapabilitiesSnapshot {
        session_list: if session.list.is_some() {
            AgentCapabilityState::supported()
        } else {
            AgentCapabilityState::unsupported(Some(
                "Agent does not advertise ACP session/list".to_string(),
            ))
        },
        session_resume: if session.resume.is_some() {
            AgentCapabilityState::supported()
        } else {
            AgentCapabilityState::unsupported(Some(
                "Agent does not advertise ACP session/resume".to_string(),
            ))
        },
        session_close: if session.close.is_some() {
            AgentCapabilityState::supported()
        } else {
            AgentCapabilityState::unsupported(Some(
                "Agent does not advertise ACP session/close".to_string(),
            ))
        },
        logout: if capabilities.auth.logout.is_some() {
            AgentCapabilityState::supported()
        } else {
            AgentCapabilityState::unsupported(Some(
                "Agent does not advertise ACP logout".to_string(),
            ))
        },
        config_options: AgentCapabilityState::supported(),
        session_info_update: AgentCapabilityState::supported(),
        load_session: if capabilities.load_session {
            AgentCapabilityState::supported()
        } else {
            AgentCapabilityState::unsupported(Some(
                "Agent does not advertise legacy ACP session/load".to_string(),
            ))
        },
    }
}

fn auth_methods_from_initialize(
    init_response: &schema::InitializeResponse,
) -> Vec<AuthMethodSummary> {
    init_response
        .auth_methods
        .iter()
        .map(|m| AuthMethodSummary {
            id: m.id().to_string(),
            name: m.name().to_string(),
            description: m.description().map(ToOwned::to_owned),
        })
        .collect()
}

fn internal_error(message: impl Into<String>) -> acp::Error {
    acp::Error::new(-32603, message.into())
}

fn prompt_content_blocks(text: &str, attachments: &[String]) -> Vec<schema::ContentBlock> {
    let mut blocks = Vec::new();
    if !text.trim().is_empty() {
        blocks.push(schema::ContentBlock::Text(schema::TextContent::new(
            text.to_string(),
        )));
    }
    for path in attachments {
        let name = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("attachment");
        let uri = if path.starts_with("file:") {
            path.clone()
        } else {
            format!("file://{path}")
        };
        blocks.push(schema::ContentBlock::ResourceLink(
            schema::ResourceLink::new(name, uri),
        ));
    }
    if blocks.is_empty() {
        blocks.push(schema::ContentBlock::Text(schema::TextContent::new(
            String::new(),
        )));
    }
    blocks
}

pub(crate) fn map_prompt_stop(cancel_requested: bool, reason: schema::StopReason) -> AcpTurnStop {
    if cancel_requested || matches!(reason, schema::StopReason::Cancelled) {
        AcpTurnStop::Canceled
    } else if matches!(reason, schema::StopReason::Refusal) {
        AcpTurnStop::Failed
    } else {
        AcpTurnStop::Completed
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionRestoreMethod {
    LoadWithHistory,
    ResumeContextOnly,
}

#[derive(Debug, Clone, Default)]
struct SessionConfigEmitResult {
    uses_legacy_modes: bool,
}

struct MergedSessionConfig {
    options: Vec<crate::acp_client::types::AgentConfigOption>,
    uses_legacy_modes: bool,
}

fn config_id_looks_like_mode(id: &str) -> bool {
    let compact = id.to_ascii_lowercase().replace('_', "");
    matches!(
        compact.as_str(),
        "mode" | "modes" | "agent" | "agents" | "sessionmode" | "agentmode"
    )
}

fn merge_session_config_options(
    config_options: Option<Vec<schema::SessionConfigOption>>,
    modes: Option<schema::SessionModeState>,
) -> MergedSessionConfig {
    let mut options = config_options.map(map_config_options).unwrap_or_default();
    let has_mode = options
        .iter()
        .any(|option| config_id_looks_like_mode(&option.id));
    let mut uses_legacy_modes = false;
    if !has_mode {
        if let Some(modes) = modes {
            if !modes.available_modes.is_empty() {
                options.push(map_modes_to_config_option(modes));
                uses_legacy_modes = true;
            }
        }
    }
    MergedSessionConfig {
        options,
        uses_legacy_modes,
    }
}

fn select_session_restore_method(
    supports_load_session: bool,
    supports_session_resume: bool,
) -> Option<SessionRestoreMethod> {
    if supports_load_session {
        Some(SessionRestoreMethod::LoadWithHistory)
    } else if supports_session_resume {
        Some(SessionRestoreMethod::ResumeContextOnly)
    } else {
        None
    }
}

fn auth_required_message(auth_methods: Vec<AuthMethodSummary>) -> Result<String, String> {
    if auth_methods.is_empty() {
        return Err(
            "Agent requires authentication, but no auth methods were advertised".to_string(),
        );
    }

    let auth_payload = AuthRequiredPayload {
        request_id: uuid::Uuid::new_v4().to_string(),
        methods: auth_methods,
        message: "Authentication required by agent".to_string(),
    };
    let payload = serde_json::to_string(&auth_payload)
        .map_err(|e| format!("Serialize auth payload failed: {}", e))?;
    Ok(format!("{}{}", AUTH_REQUIRED_ERROR_PREFIX, payload))
}

fn send_auth_required_error(
    ready_tx: &mut Option<oneshot::Sender<Result<String, String>>>,
    auth_methods: Vec<AuthMethodSummary>,
) -> Result<(), String> {
    let msg = match auth_required_message(auth_methods) {
        Ok(message) => message,
        Err(error) => error,
    };
    if let Some(tx) = ready_tx.take() {
        let _ = tx.send(Err(msg.clone()));
    }
    Err(msg)
}

/// Handle to an active ACP session - used to send prompts, receive events, and handle permissions
pub struct AcpSessionHandle {
    pub session_id: String,
    cmd_tx: mpsc::UnboundedSender<SessionCommand>,
    event_rx: mpsc::UnboundedReceiver<AcpSessionEvent>,
    permission_rx: mpsc::UnboundedReceiver<(PermissionRequest, oneshot::Sender<String>)>,
    ext_notify: broadcast::Sender<ExtNotificationPayload>,
}

pub const AUTH_REQUIRED_ERROR_PREFIX: &str = "ACP_AUTH_REQUIRED::";

#[derive(Clone)]
pub struct AcpSessionControl {
    cmd_tx: mpsc::UnboundedSender<SessionCommand>,
    ext_notify: broadcast::Sender<ExtNotificationPayload>,
}

impl AcpSessionControl {
    pub fn send_prompt(&self, message: String, attachments: Vec<String>) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Prompt {
                text: message,
                attachments,
                reply: None,
            })
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    /// Run a `session/prompt` and wait for the JSON-RPC result (Grok slash toggles).
    ///
    /// Does **not** emit `AcpSessionEvent::TurnEnd` — callers must not treat this as a
    /// user chat turn. Use [`Self::send_prompt`] for turns that should complete in the UI.
    pub async fn prompt_turn(
        &self,
        message: String,
        attachments: Vec<String>,
    ) -> Result<(), String> {
        let (reply, rx) = oneshot::channel();
        self.cmd_tx
            .send(SessionCommand::Prompt {
                text: message,
                attachments,
                reply: Some(reply),
            })
            .map_err(|_| "ACP session is no longer running".to_string())?;
        rx.await
            .map_err(|_| "ACP session is no longer running".to_string())?
    }

    pub fn send_cancel(&self) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Cancel)
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    pub fn send_close(&self) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Close)
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    pub async fn set_config_option(
        &self,
        config_id: String,
        value: String,
    ) -> Result<Vec<crate::acp_client::types::AgentConfigOption>, String> {
        let (reply, rx) = oneshot::channel();
        self.cmd_tx
            .send(SessionCommand::SetConfigOption {
                config_id,
                value,
                reply,
            })
            .map_err(|_| "ACP session is no longer running".to_string())?;
        rx.await
            .map_err(|_| "ACP session is no longer running".to_string())?
    }

    /// Outbound ACP extension JSON-RPC request. Wire `method` is forced to `_…`.
    pub async fn send_ext_method(&self, method: String, params: Value) -> Result<Value, String> {
        let (reply, rx) = oneshot::channel();
        self.cmd_tx
            .send(SessionCommand::ExtMethod {
                method,
                params,
                reply,
            })
            .map_err(|_| "ACP session is no longer running".to_string())?;
        rx.await
            .map_err(|_| "ACP session is no longer running".to_string())?
    }

    pub fn subscribe_ext_notifications(&self) -> broadcast::Receiver<ExtNotificationPayload> {
        self.ext_notify.subscribe()
    }

    pub async fn wait_ext_notification(
        &self,
        logical: &str,
        wait: Duration,
    ) -> Result<ExtNotificationPayload, String> {
        let want = logical.strip_prefix('_').unwrap_or(logical);
        let mut rx = self.ext_notify.subscribe();
        timeout(wait, async {
            loop {
                match rx.recv().await {
                    Ok((method, params)) => {
                        let got = method.strip_prefix('_').unwrap_or(method.as_str());
                        if got == want {
                            return Ok((method, params));
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => {
                        return Err("ACP session is no longer running".to_string());
                    }
                }
            }
        })
        .await
        .map_err(|_| format!("{want} timed out"))?
    }
}

impl AcpSessionHandle {
    pub fn control(&self) -> AcpSessionControl {
        AcpSessionControl {
            cmd_tx: self.cmd_tx.clone(),
            ext_notify: self.ext_notify.clone(),
        }
    }

    pub fn subscribe_ext_notifications(&self) -> broadcast::Receiver<ExtNotificationPayload> {
        self.ext_notify.subscribe()
    }

    pub fn send_prompt(&self, message: String, attachments: Vec<String>) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Prompt {
                text: message,
                attachments,
                reply: None,
            })
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    /// Send a session/cancel notification to interrupt the current turn
    pub fn send_cancel(&self) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Cancel)
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    /// Send ACP session/close when the active agent advertises support.
    pub fn send_close(&self) -> Result<(), String> {
        self.cmd_tx
            .send(SessionCommand::Close)
            .map_err(|_| "ACP session is no longer running".to_string())
    }

    pub async fn set_config_option(
        &self,
        config_id: String,
        value: String,
    ) -> Result<Vec<crate::acp_client::types::AgentConfigOption>, String> {
        self.control().set_config_option(config_id, value).await
    }

    pub async fn recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.recv().await
    }

    pub fn try_recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.try_recv().ok()
    }

    /// Receive pending permission request (non-blocking)
    pub fn try_recv_permission(&mut self) -> Option<(PermissionRequest, oneshot::Sender<String>)> {
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
    session_config_snapshot: Option<HashMap<String, String>>,
) -> Result<AcpSessionHandle, String> {
    let session_id_for_thread = session_id_hint.clone();
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<SessionCommand>();
    let (event_tx, event_rx) = mpsc::unbounded_channel::<AcpSessionEvent>();
    let (permission_tx, permission_rx) = mpsc::unbounded_channel();
    let (ready_tx, ready_rx) = oneshot::channel::<Result<String, String>>();
    let (ext_notify, _) = broadcast::channel(32);
    let ext_notify_thread = ext_notify.clone();
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

            let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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
                        session_config_snapshot,
                        ext_notify_thread,
                    )
                    .await
                    {
                        Ok(()) => {
                            info!("ACP session {} ended normally", session_id_for_thread)
                        }
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
        ext_notify,
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_session_inner(
    _session_id: &str,
    launch_spec: AgentLaunchSpec,
    cwd: &Path,
    handler: Arc<dyn AcpToolHandler>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    resume_session_id: Option<String>,
    auth_method_id: Option<String>,
    cmd_rx: &mut mpsc::UnboundedReceiver<SessionCommand>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<String>)>,
    mut ready_tx: Option<oneshot::Sender<Result<String, String>>>,
    default_config: Option<std::collections::HashMap<String, String>>,
    session_config_snapshot: Option<HashMap<String, String>>,
    ext_notify: broadcast::Sender<ExtNotificationPayload>,
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

    let client = Arc::new(AtmosAcpClient::new(
        handler,
        cwd.to_path_buf(),
        permission_tx,
        event_tx.clone(),
        ext_notify,
    ));
    let transport = ByteStreams::new(
        stdin.compat_write(),
        spawn_usage_normalizer(stdout).compat(),
    );
    let cwd = cwd.to_path_buf();

    let permission_client = client.clone();
    let read_client = client.clone();
    let write_client = client.clone();
    let create_terminal_client = client.clone();
    let terminal_output_client = client.clone();
    let release_terminal_client = client.clone();
    let wait_terminal_client = client.clone();
    let kill_terminal_client = client.clone();
    let ext_method_client = client.clone();
    let notification_client = client.clone();

    acp::Client
        .builder()
        .name("atmos")
        .on_receive_request(
            async move |request: schema::RequestPermissionRequest, responder, _cx| {
                responder.respond_with_result(permission_client.request_permission(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::ReadTextFileRequest, responder, _cx| {
                responder.respond_with_result(read_client.read_text_file(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::WriteTextFileRequest, responder, _cx| {
                responder.respond_with_result(write_client.write_text_file(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::CreateTerminalRequest, responder, _cx| {
                responder.respond_with_result(create_terminal_client.create_terminal(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::TerminalOutputRequest, responder, _cx| {
                responder.respond_with_result(terminal_output_client.terminal_output(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::ReleaseTerminalRequest, responder, _cx| {
                responder
                    .respond_with_result(release_terminal_client.release_terminal(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::WaitForTerminalExitRequest, responder, _cx| {
                responder
                    .respond_with_result(wait_terminal_client.wait_for_terminal_exit(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: schema::KillTerminalRequest, responder, _cx| {
                responder.respond_with_result(kill_terminal_client.kill_terminal(request).await)
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: InboundExtMethod, responder, _cx| {
                responder.respond_with_result(
                    ext_method_client
                        .ext_method(&request.method, request.params)
                        .await,
                )
            },
            acp::on_receive_request!(),
        )
        .on_receive_notification(
            async move |notification: schema::AgentNotification, _cx| match notification {
                schema::AgentNotification::SessionNotification(update) => {
                    notification_client.session_notification(update).await
                }
                schema::AgentNotification::ExtNotification(ext) => {
                    notification_client.ext_notification(ext).await
                }
                _ => Ok(()),
            },
            acp::on_receive_notification!(),
        )
        .connect_with(transport, async move |conn: ConnectionTo<Agent>| {
            let init_response = match conn
                .send_request(atmos_initialize_request())
                .block_task()
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
                    return Err(internal_error(msg));
                }
            };

            let agent_info = map_implementation_info(init_response.agent_info.clone());
            let capabilities = map_agent_capabilities(&init_response.agent_capabilities);
            let _ = event_tx.send(AcpSessionEvent::AgentInfoUpdate(agent_info.clone()));
            let _ = event_tx.send(AcpSessionEvent::CapabilitiesUpdate(capabilities.clone()));

            let auth_methods = auth_methods_from_initialize(&init_response);

            if let Some(method_id) = auth_method_id {
                conn.send_request(schema::AuthenticateRequest::new(method_id))
                    .block_task()
                    .await
                    .map_err(|e| {
                        let msg = format!("Authenticate failed: {}", e);
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(Err(msg.clone()));
                        }
                        internal_error(msg)
                    })?;
            }

            // Track whether the agent uses legacy APIs so we can translate
            // SetConfigOption("mode"/"model", ..) → set_session_mode/set_session_model.
            let mut uses_legacy_modes = false;

            /// Helper: emit config options from a session response, checking
            /// the new `config_options` and the legacy `modes` field.
            fn emit_session_config(
                config_options: Option<Vec<schema::SessionConfigOption>>,
                modes: Option<schema::SessionModeState>,
                event_tx: &mpsc::UnboundedSender<AcpSessionEvent>,
            ) -> SessionConfigEmitResult {
                let merged = merge_session_config_options(config_options, modes);
                if merged.options.is_empty() {
                    info!("Session returned NO config options or modes");
                } else {
                    info!("Session returned {} config options", merged.options.len());
                    let _ = event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(merged.options));
                }
                SessionConfigEmitResult {
                    uses_legacy_modes: merged.uses_legacy_modes,
                }
            }

            let mut replayed_loaded_history = false;
            let create_or_load_result: acp::Result<schema::SessionId> = if let Some(resume_id) =
                resume_session_id.clone()
            {
                let requested = schema::SessionId::new(resume_id.clone());
                let restore_method = select_session_restore_method(
                    init_response.agent_capabilities.load_session,
                    init_response
                        .agent_capabilities
                        .session_capabilities
                        .resume
                        .is_some(),
                );
                if restore_method == Some(SessionRestoreMethod::LoadWithHistory) {
                    match conn
                        .send_request(schema::LoadSessionRequest::new(
                            requested.clone(),
                            cwd.clone(),
                        ))
                        .block_task()
                        .await
                    {
                        Ok(response) => {
                            info!("Loaded ACP session via legacy session/load: {}", resume_id);
                            replayed_loaded_history = true;
                            let emitted = emit_session_config(
                                response.config_options,
                                response.modes,
                                &event_tx,
                            );
                            uses_legacy_modes = emitted.uses_legacy_modes;
                            Ok(requested)
                        }
                        Err(err) => Err(err),
                    }
                } else if restore_method == Some(SessionRestoreMethod::ResumeContextOnly) {
                    conn.send_request(schema::ResumeSessionRequest::new(
                        requested.clone(),
                        cwd.clone(),
                    ))
                    .block_task()
                    .await
                    .map(|response| {
                        info!("Resumed ACP session without history replay: {}", resume_id);
                        replayed_loaded_history = false;
                        let emitted =
                            emit_session_config(response.config_options, response.modes, &event_tx);
                        uses_legacy_modes = emitted.uses_legacy_modes;
                        requested
                    })
                } else {
                    let msg = format!(
                        "Agent does not support ACP session/resume or legacy session/load for {}",
                        resume_id
                    );
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(msg.clone()));
                    }
                    return Err(internal_error(msg));
                }
            } else {
                conn.send_request(schema::NewSessionRequest::new(cwd.clone()))
                    .block_task()
                    .await
                    .map(|response| {
                        let emitted =
                            emit_session_config(response.config_options, response.modes, &event_tx);
                        uses_legacy_modes = emitted.uses_legacy_modes;
                        response.session_id
                    })
            };

            let session_id_acp = match create_or_load_result {
                Ok(session_id) => session_id,
                Err(err) if err.code == acp::ErrorCode::AuthRequired => {
                    if let Err(msg) = send_auth_required_error(&mut ready_tx, auth_methods) {
                        return Err(internal_error(msg));
                    }
                    unreachable!("auth_required_error always returns Err");
                }
                Err(err) => {
                    let msg = err.to_string();
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(msg.clone()));
                    }
                    return Err(internal_error(msg));
                }
            };

            if resume_session_id_skips_host_config(resume_session_id.as_deref()) {
                // Restored sessions already have their model/mode. Re-applying
                // host default_config here (e.g. after a page refresh) would
                // silently switch Factory Droid and similar agents.
            } else if let Some(snapshot) = session_config_snapshot {
                apply_config_values(
                    &conn,
                    &session_id_acp,
                    snapshot,
                    uses_legacy_modes,
                    &event_tx,
                    "session snapshot",
                )
                .await;
            } else if let Some(defaults) = default_config {
                apply_config_values(
                    &conn,
                    &session_id_acp,
                    defaults,
                    uses_legacy_modes,
                    &event_tx,
                    "default",
                )
                .await;
            }

            // Per ACP spec, the session/load response means all history has been
            // replayed. However, the SDK dispatches notifications as spawned tasks
            // on this single-threaded runtime, so some may still be pending when
            // load_session() returns. Yield repeatedly to let them flush before
            // emitting the completion signal.
            if replayed_loaded_history {
                for _ in 0..20 {
                    tokio::task::yield_now().await;
                }
            }
            let _ = event_tx.send(AcpSessionEvent::LoadCompleted);

            let _ = event_tx.send(AcpSessionEvent::SessionReady {
                acp_session_id: session_id_acp.to_string(),
            });

            if let Some(tx) = ready_tx.take() {
                let _ = tx.send(Ok(session_id_acp.to_string()));
            }

            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    SessionCommand::Prompt {
                        text,
                        attachments,
                        reply,
                    } => {
                        if text.trim().is_empty() && attachments.is_empty() {
                            if let Some(reply) = reply {
                                let _ = reply.send(Ok(()));
                            }
                            continue;
                        }
                        append_acp_log(
                            &session_id_acp.to_string(),
                            "client_to_agent_acp",
                            "prompt_request",
                            &serde_json::json!({
                                "session_id": session_id_acp.to_string(),
                                "message": text.clone(),
                                "attachments": attachments,
                            }),
                        );
                        let prompt_fut = conn
                            .send_request(schema::PromptRequest::new(
                                session_id_acp.clone(),
                                prompt_content_blocks(&text, &attachments),
                            ))
                            .block_task();
                        tokio::pin!(prompt_fut);
                        let mut cancel_requested = false;
                        let mut pending_close = false;
                        let mut pending_configs = Vec::new();
                        let mut pending_prompts = Vec::new();
                        let prompt_result = loop {
                            tokio::select! {
                                res = &mut prompt_fut => break res,
                                next = cmd_rx.recv() => {
                                    match next {
                                        Some(SessionCommand::Cancel) => {
                                            cancel_requested = true;
                                            if let Err(e) = conn.send_notification(
                                                schema::CancelNotification::new(
                                                    session_id_acp.clone(),
                                                ),
                                            ) {
                                                warn!("Cancel failed: {}", e);
                                            }
                                        }
                                        Some(SessionCommand::Close) => {
                                            cancel_requested = true;
                                            pending_close = true;
                                            if let Err(e) = conn.send_notification(
                                                schema::CancelNotification::new(
                                                    session_id_acp.clone(),
                                                ),
                                            ) {
                                                warn!("Cancel failed: {}", e);
                                            }
                                        }
                                        Some(SessionCommand::SetConfigOption {
                                            config_id,
                                            value,
                                            reply,
                                        }) => {
                                            pending_configs.push((config_id, value, reply));
                                        }
                                        Some(SessionCommand::ExtMethod {
                                            method,
                                            params,
                                            reply,
                                        }) => {
                                            // Grok steer (`_x.ai/interject`) must go out while
                                            // session/prompt is in flight. Buffering until TurnEnd
                                            // makes mid-turn inject too late.
                                            append_acp_log(
                                                &session_id_acp.to_string(),
                                                "client_to_agent_acp",
                                                "ext_method_request",
                                                &serde_json::json!({
                                                    "session_id": session_id_acp.to_string(),
                                                    "method": ensure_ext_wire_method(&method),
                                                    "params": params,
                                                    "during_prompt": true,
                                                }),
                                            );
                                            let result =
                                                send_outbound_ext_method(&conn, method, params)
                                                    .await;
                                            if let Err(error) = &result {
                                                warn!("Ext method failed during prompt: {}", error);
                                            }
                                            let _ = reply.send(result);
                                        }
                                        Some(SessionCommand::Prompt {
                                            text,
                                            attachments,
                                            reply: Some(reply),
                                        }) => {
                                            // Wait-for-completion prompts (Grok slash toggles)
                                            // must not be dropped mid-turn. They run after this
                                            // user turn without emitting another TurnEnd.
                                            pending_prompts.push((text, attachments, reply));
                                        }
                                        Some(SessionCommand::Prompt { reply: None, .. }) => {}
                                        None => {
                                            break Err(internal_error(
                                                "ACP command channel closed",
                                            ));
                                        }
                                    }
                                }
                            }
                        };
                        let prompt_ok = prompt_result.is_ok();
                        let prompt_err = prompt_result.as_ref().err().map(|e| e.to_string());
                        // User chat turns (`reply: None`) own TurnEnd. Internal
                        // `prompt_turn` waits (`reply: Some`) must not — see run_prompt_turn.
                        let emit_turn_end = reply.is_none();
                        match prompt_result {
                            Ok(res) => {
                                if emit_turn_end {
                                    if let Some(usage) = res.usage {
                                        let _ = event_tx.send(AcpSessionEvent::TurnUsage(
                                            map_turn_usage(usage),
                                        ));
                                    }
                                    let _ = event_tx.send(AcpSessionEvent::TurnEnd(
                                        map_prompt_stop(cancel_requested, res.stop_reason),
                                    ));
                                }
                            }
                            Err(e) => {
                                warn!("Prompt failed: {}", e);
                                if emit_turn_end {
                                    let _ = event_tx.send(AcpSessionEvent::Error {
                                        code: "PROMPT_FAILED".to_string(),
                                        message: e.to_string(),
                                        recoverable: true,
                                    });
                                    let _ = event_tx.send(AcpSessionEvent::TurnEnd(
                                        if cancel_requested {
                                            AcpTurnStop::Canceled
                                        } else {
                                            AcpTurnStop::Failed
                                        },
                                    ));
                                }
                            }
                        }
                        if let Some(reply) = reply {
                            let _ = reply.send(if prompt_ok {
                                Ok(())
                            } else {
                                Err(prompt_err.unwrap_or_else(|| "prompt failed".into()))
                            });
                        }
                        for (config_id, value, reply) in pending_configs {
                            let result = set_session_config_option(
                                &conn,
                                &session_id_acp,
                                config_id,
                                value,
                                uses_legacy_modes,
                                &event_tx,
                            )
                            .await;
                            let _ = reply.send(result);
                        }
                        for (text, attachments, reply) in pending_prompts {
                            let result =
                                run_prompt_turn(&conn, &session_id_acp, &text, &attachments).await;
                            let _ = reply.send(result);
                        }
                        if pending_close {
                            if init_response
                                .agent_capabilities
                                .session_capabilities
                                .close
                                .is_none()
                            {
                                let _ = event_tx.send(AcpSessionEvent::SessionClosed {
                                    reason: Some(
                                        "Agent does not advertise ACP session/close".to_string(),
                                    ),
                                });
                                break;
                            }
                            let _ = conn
                                .send_request(schema::CloseSessionRequest::new(
                                    session_id_acp.clone(),
                                ))
                                .block_task()
                                .await;
                            let _ = event_tx.send(AcpSessionEvent::SessionClosed { reason: None });
                            break;
                        }
                    }
                    SessionCommand::Cancel => {
                        if let Err(e) = conn.send_notification(schema::CancelNotification::new(
                            session_id_acp.clone(),
                        )) {
                            warn!("Cancel failed: {}", e);
                        }
                    }
                    SessionCommand::Close => {
                        if init_response
                            .agent_capabilities
                            .session_capabilities
                            .close
                            .is_none()
                        {
                            let _ = event_tx.send(AcpSessionEvent::SessionClosed {
                                reason: Some(
                                    "Agent does not advertise ACP session/close".to_string(),
                                ),
                            });
                            break;
                        }
                        match conn
                            .send_request(schema::CloseSessionRequest::new(session_id_acp.clone()))
                            .block_task()
                            .await
                        {
                            Ok(_) => {
                                let _ =
                                    event_tx.send(AcpSessionEvent::SessionClosed { reason: None });
                                break;
                            }
                            Err(e) => {
                                warn!("Close session failed: {}", e);
                                let _ = event_tx.send(AcpSessionEvent::Error {
                                    code: "CLOSE_FAILED".to_string(),
                                    message: e.to_string(),
                                    recoverable: true,
                                });
                            }
                        }
                    }
                    SessionCommand::SetConfigOption {
                        config_id,
                        value,
                        reply,
                    } => {
                        let result = set_session_config_option(
                            &conn,
                            &session_id_acp,
                            config_id,
                            value,
                            uses_legacy_modes,
                            &event_tx,
                        )
                        .await;
                        if let Err(error) = &result {
                            warn!("Set config option failed: {}", error);
                        }
                        let _ = reply.send(result);
                    }
                    SessionCommand::ExtMethod {
                        method,
                        params,
                        reply,
                    } => {
                        append_acp_log(
                            &session_id_acp.to_string(),
                            "client_to_agent_acp",
                            "ext_method_request",
                            &serde_json::json!({
                                "session_id": session_id_acp.to_string(),
                                "method": ensure_ext_wire_method(&method),
                                "params": params,
                            }),
                        );
                        let result = send_outbound_ext_method(&conn, method, params).await;
                        if let Err(error) = &result {
                            warn!("Ext method failed: {}", error);
                        }
                        let _ = reply.send(result);
                    }
                }
            }

            Ok(())
        })
        .await
        .map_err(|e| e.to_string())
}

pub async fn list_acp_sessions(
    launch_spec: AgentLaunchSpec,
    cwd: Option<PathBuf>,
    cursor: Option<String>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    auth_method_id: Option<String>,
) -> Result<NativeAgentSessionList, String> {
    let (stdin, stdout, stderr, child_guard) =
        spawn_agent(&launch_spec, cwd.clone(), env_overrides)
            .map_err(|e| format!("Failed to spawn agent: {}", e))?;
    let _child_guard = child_guard;

    let (stderr_tx, stderr_rx) = oneshot::channel::<String>();
    tokio::spawn(async move {
        let mut buf = Vec::new();
        let mut stderr = stderr;
        let _ = stderr.read_to_end(&mut buf).await;
        let text = String::from_utf8_lossy(&buf).trim().to_string();
        let _ = stderr_tx.send(text);
    });

    let transport = ByteStreams::new(
        stdin.compat_write(),
        spawn_usage_normalizer(stdout).compat(),
    );
    acp::Client
        .builder()
        .name("atmos")
        .connect_with(transport, async move |conn: ConnectionTo<Agent>| {
            let init_response = match conn
                .send_request(atmos_initialize_request())
                .block_task()
                .await
            {
                Ok(response) => response,
                Err(e) => {
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
                    return Err(internal_error(msg));
                }
            };

            let agent_info = map_implementation_info(init_response.agent_info.clone());
            let capabilities = map_agent_capabilities(&init_response.agent_capabilities);
            let auth_methods = auth_methods_from_initialize(&init_response);

            if let Some(method_id) = auth_method_id {
                conn.send_request(schema::AuthenticateRequest::new(method_id))
                    .block_task()
                    .await
                    .map_err(|e| internal_error(format!("Authenticate failed: {}", e)))?;
            }

            if !capabilities.session_list.supported {
                return Ok(NativeAgentSessionList {
                    agent_info,
                    capabilities: capabilities.clone(),
                    sessions: Vec::new(),
                    next_cursor: None,
                    unsupported_reason: capabilities.session_list.reason.clone(),
                });
            }

            let response = match conn
                .send_request(schema::ListSessionsRequest::new().cwd(cwd).cursor(cursor))
                .block_task()
                .await
            {
                Ok(response) => response,
                Err(err) if err.code == acp::ErrorCode::AuthRequired => {
                    let msg = auth_required_message(auth_methods).map_err(internal_error)?;
                    return Err(internal_error(msg));
                }
                Err(err) => return Err(err),
            };

            let sessions = response
                .sessions
                .into_iter()
                .map(|session| NativeAgentSession {
                    acp_session_id: session.session_id.to_string(),
                    cwd: session.cwd.display().to_string(),
                    title: session.title,
                    updated_at: session.updated_at,
                })
                .collect();

            Ok(NativeAgentSessionList {
                agent_info,
                capabilities,
                sessions,
                next_cursor: response.next_cursor,
                unsupported_reason: None,
            })
        })
        .await
        .map_err(|e| e.to_string())
}

pub async fn logout_acp_agent(
    launch_spec: AgentLaunchSpec,
    cwd: Option<PathBuf>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    auth_method_id: Option<String>,
) -> Result<AgentLogoutResult, String> {
    let (stdin, stdout, stderr, child_guard) = spawn_agent(&launch_spec, cwd, env_overrides)
        .map_err(|e| format!("Failed to spawn agent: {}", e))?;
    let _child_guard = child_guard;

    let (stderr_tx, stderr_rx) = oneshot::channel::<String>();
    tokio::spawn(async move {
        let mut buf = Vec::new();
        let mut stderr = stderr;
        let _ = stderr.read_to_end(&mut buf).await;
        let text = String::from_utf8_lossy(&buf).trim().to_string();
        let _ = stderr_tx.send(text);
    });

    let transport = ByteStreams::new(
        stdin.compat_write(),
        spawn_usage_normalizer(stdout).compat(),
    );
    acp::Client
        .builder()
        .name("atmos")
        .connect_with(transport, async move |conn: ConnectionTo<Agent>| {
            let init_response = match conn
                .send_request(atmos_initialize_request())
                .block_task()
                .await
            {
                Ok(response) => response,
                Err(e) => {
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
                    return Err(internal_error(msg));
                }
            };

            let agent_info = map_implementation_info(init_response.agent_info.clone());
            let capabilities = map_agent_capabilities(&init_response.agent_capabilities);
            let auth_methods = auth_methods_from_initialize(&init_response);

            if let Some(method_id) = auth_method_id {
                conn.send_request(schema::AuthenticateRequest::new(method_id))
                    .block_task()
                    .await
                    .map_err(|e| internal_error(format!("Authenticate failed: {}", e)))?;
            }

            if !capabilities.logout.supported {
                return Ok(AgentLogoutResult {
                    agent_info,
                    capabilities: capabilities.clone(),
                    logged_out: false,
                    unsupported_reason: capabilities.logout.reason.clone(),
                });
            }

            match conn
                .send_request(schema::LogoutRequest::new())
                .block_task()
                .await
            {
                Ok(_) => Ok(AgentLogoutResult {
                    agent_info,
                    capabilities,
                    logged_out: true,
                    unsupported_reason: None,
                }),
                Err(err) if err.code == acp::ErrorCode::AuthRequired => {
                    let msg = auth_required_message(auth_methods).map_err(internal_error)?;
                    Err(internal_error(msg))
                }
                Err(err) => Err(err),
            }
        })
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        map_prompt_stop, ordered_config_values, select_session_restore_method, SessionRestoreMethod,
    };
    use crate::acp_client::client::AcpTurnStop;
    use agent_client_protocol::schema::v1 as schema;
    use agent_client_protocol::JsonRpcMessage;
    use std::collections::HashMap;

    #[test]
    fn session_restore_prefers_load_when_history_replay_is_available() {
        assert_eq!(
            select_session_restore_method(true, true),
            Some(SessionRestoreMethod::LoadWithHistory)
        );
        assert_eq!(
            select_session_restore_method(true, false),
            Some(SessionRestoreMethod::LoadWithHistory)
        );
    }

    #[test]
    fn session_restore_falls_back_to_resume_without_history() {
        assert_eq!(
            select_session_restore_method(false, true),
            Some(SessionRestoreMethod::ResumeContextOnly)
        );
        assert_eq!(select_session_restore_method(false, false), None);
    }

    #[test]
    fn restored_sessions_skip_host_default_config() {
        assert!(super::resume_session_id_skips_host_config(Some("sess-1")));
        assert!(!super::resume_session_id_skips_host_config(None));
    }

    #[test]
    fn merge_keeps_session_modes_when_config_options_are_present_without_mode() {
        let modes: schema::SessionModeState = serde_json::from_value(serde_json::json!({
            "currentModeId": "ask",
            "availableModes": [
                {"id": "ask", "name": "Ask"},
                {"id": "code", "name": "Code"}
            ]
        }))
        .expect("session modes");
        let merged = super::merge_session_config_options(Some(Vec::new()), Some(modes));
        assert!(merged.uses_legacy_modes);
        assert_eq!(merged.options.len(), 1);
        assert_eq!(merged.options[0].id, "mode");
        assert_eq!(merged.options[0].options.len(), 2);
        assert_eq!(merged.options[0].current_value.as_deref(), Some("ask"));
    }

    #[test]
    fn merge_skips_legacy_modes_when_config_options_already_have_mode() {
        let config: Vec<schema::SessionConfigOption> = serde_json::from_value(serde_json::json!([{
            "id": "mode",
            "name": "Mode",
            "type": "select",
            "currentValue": "build",
            "options": [{"value": "build", "name": "Build"}]
        }]))
        .expect("config options");
        let modes: schema::SessionModeState = serde_json::from_value(serde_json::json!({
            "currentModeId": "ask",
            "availableModes": [{"id": "ask", "name": "Ask"}]
        }))
        .expect("session modes");
        let merged = super::merge_session_config_options(Some(config), Some(modes));
        assert!(!merged.uses_legacy_modes);
        assert_eq!(merged.options.len(), 1);
        assert_eq!(merged.options[0].current_value.as_deref(), Some("build"));
    }

    #[test]
    fn ordered_config_values_applies_model_before_effort() {
        let values = HashMap::from([
            ("reasoning_effort".to_string(), "low".to_string()),
            ("custom".to_string(), "value".to_string()),
            ("model".to_string(), "gpt-5.3-codex-spark".to_string()),
            ("mode".to_string(), "agent-full-access".to_string()),
            ("fast-mode".to_string(), "on".to_string()),
        ]);

        let ordered: Vec<_> = ordered_config_values(values)
            .into_iter()
            .map(|(id, _)| id)
            .collect();

        assert_eq!(
            ordered,
            vec!["mode", "model", "reasoning_effort", "fast-mode", "custom"]
        );
    }

    #[test]
    fn prompt_stop_maps_cancel_and_refusal() {
        assert_eq!(
            map_prompt_stop(true, schema::StopReason::EndTurn),
            AcpTurnStop::Canceled
        );
        assert_eq!(
            map_prompt_stop(false, schema::StopReason::Cancelled),
            AcpTurnStop::Canceled
        );
        assert_eq!(
            map_prompt_stop(false, schema::StopReason::Refusal),
            AcpTurnStop::Failed
        );
        assert_eq!(
            map_prompt_stop(false, schema::StopReason::EndTurn),
            AcpTurnStop::Completed
        );
    }

    #[test]
    fn internal_prompt_turn_docs_forbid_turn_end() {
        // Regression lock: wait-reply prompts are Grok permission slashes. Emitting
        // TurnEnd for them races with the next user send (premature + missing end).
        let runner = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/acp_client/runner.rs"
        ));
        let production = runner.split("#[cfg(test)]").next().unwrap_or(runner);
        assert!(
            production.contains("let emit_turn_end = reply.is_none();"),
            "user prompts (reply: None) must gate TurnEnd"
        );
        assert!(
            production.contains("internal_control")
                && production.contains("async fn run_prompt_turn"),
            "queued slash prompt_turn must stay internal (no TurnEnd)"
        );
        let run_prompt = production
            .split("async fn run_prompt_turn")
            .nth(1)
            .and_then(|rest| rest.split("async fn set_session_mode").next())
            .unwrap_or("");
        assert!(
            !run_prompt.contains("AcpSessionEvent::TurnEnd"),
            "run_prompt_turn must not emit TurnEnd"
        );
    }

    #[test]
    fn outbound_ext_method_wire_name_starts_with_underscore() {
        assert_eq!(
            super::ensure_ext_wire_method("x.ai/session/fork"),
            "_x.ai/session/fork"
        );
        assert_eq!(
            super::ensure_ext_wire_method("_x.ai/rewind/execute"),
            "_x.ai/rewind/execute"
        );
        let request = super::OutboundExtMethod {
            method: super::ensure_ext_wire_method("x.ai/git/worktree/create"),
            params: serde_json::json!({ "sessionId": "s", "sourcePath": "/tmp" }),
        };
        assert_eq!(request.method(), "_x.ai/git/worktree/create");
        assert!(request.method().starts_with('_'));
    }

    #[test]
    fn inbound_ext_method_matches_underscore_prefix() {
        use agent_client_protocol::JsonRpcMessage;
        assert!(super::InboundExtMethod::matches_method(
            "_x.ai/ask_user_question"
        ));
        assert!(!super::InboundExtMethod::matches_method(
            "session/request_permission"
        ));
        let parsed = super::InboundExtMethod::parse_message(
            "_x.ai/ask_user_question",
            &serde_json::json!({
                "sessionId": "s",
                "toolCallId": "call_1",
                "questions": [{"question": "Color?", "options": [{"label": "Blue"}]}],
                "mode": "default"
            }),
        )
        .expect("parse");
        assert_eq!(parsed.method, "_x.ai/ask_user_question");
        assert_eq!(parsed.params["toolCallId"], "call_1");
    }
}
