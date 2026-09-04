//! initialize / thread / turn / model/list write helpers and the JSONL IO loop.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};

use crate::contract::{AgentCurrentConfig, AgentSupportedOptions};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
use crate::contract::{AgentPrompt, AgentRuntimeConfig, AgentRuntimeConfigUpdate};
use crate::contract::{AgentProviderError, AgentResult};

use super::codec::{
    classify, encode_error, encode_notification, encode_request, encode_result, parse_line,
    InboundFrame, RpcId, METHOD_NOT_FOUND,
};
use super::event_map::{map_notification, EventMapState};
use super::ids::IdMaps;
use super::permission::{cancel_result, dialect_for_method, permission_request, result_json};

const RPC_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Default)]
pub struct StickyConfig {
    pub model: Option<String>,
    pub effort: Option<String>,
    pub mode: Option<String>,
    pub permission_mode: Option<String>,
    pub fast: Option<String>,
}

impl StickyConfig {
    pub fn from_runtime(cfg: &AgentRuntimeConfig) -> Self {
        Self {
            model: cfg.model.clone(),
            effort: cfg.thinking.clone(),
            mode: cfg.mode.clone(),
            permission_mode: cfg.permission_mode.clone(),
            fast: cfg.fast.clone(),
        }
    }

    pub fn apply(&mut self, update: &AgentRuntimeConfigUpdate) {
        if let Some(model) = &update.model {
            self.model = Some(model.clone());
        }
        if let Some(thinking) = &update.thinking {
            self.effort = Some(thinking.clone());
        }
        if let Some(mode) = &update.mode {
            self.mode = Some(mode.clone());
        }
        if let Some(permission_mode) = &update.permission_mode {
            self.permission_mode = Some(permission_mode.clone());
        }
        if let Some(fast) = &update.fast {
            self.fast = Some(fast.clone());
        }
    }
}

/// Codex model catalog names this tier "Fast" (`additionalSpeedTiers` still lists `"fast"`).
pub const FAST_SERVICE_TIER: &str = "priority";

pub struct PendingServerReq {
    pub id: RpcId,
    pub method: String,
    pub params: Value,
}

pub enum ClientRpcOutcome {
    Result(Value),
    Error { message: String },
}

pub struct CodexShared {
    pub stdin: Mutex<Option<Box<dyn AsyncWrite + Unpin + Send>>>,
    pub next_id: AtomicI64,
    pub client_rpc: Mutex<HashMap<String, oneshot::Sender<ClientRpcOutcome>>>,
    pub server_rpc: Mutex<HashMap<String, PendingServerReq>>,
    pub ids: Mutex<IdMaps>,
    pub sticky: Mutex<StickyConfig>,
    pub running_turn: Mutex<Option<String>>,
    pub closed: AtomicBool,
    pub events_tx: mpsc::UnboundedSender<AgentEventEnvelope>,
    pub map: Mutex<EventMapState>,
    pub initialize: Mutex<Value>,
    pub thread_paginated: AtomicBool,
}

pub fn initialize_params() -> Value {
    json!({
        "clientInfo": {
            "name": "atmos",
            "title": "Atmos Chat",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "capabilities": {
            "experimentalApi": true
        }
    })
}

pub fn thread_start_params(cwd: &Path, sticky: &StickyConfig) -> Value {
    let approval = crate::policy::vendor_permission_for_spawn(
        "codex",
        None,
        sticky.permission_mode.as_deref(),
    )
    .unwrap_or_else(|| "on-request".into());
    let reviewer =
        crate::policy::permission::codex_approvals_reviewer(sticky.permission_mode.as_deref());
    let mut params = json!({
        "cwd": cwd.display().to_string(),
        "approvalPolicy": approval,
        "approvalsReviewer": reviewer,
        "sandbox": "workspace-write",
    });
    if let Some(model) = sticky_model(sticky) {
        params["model"] = json!(model);
    }
    // Fast/serviceTier is per-turn (see turn_start_params), not thread/start|resume.
    params
}

pub fn thread_resume_params(thread_id: &str, cwd: &Path, sticky: &StickyConfig) -> Value {
    let mut params = thread_start_params(cwd, sticky);
    params["threadId"] = json!(thread_id);
    params
}

pub fn turn_start_params(thread_id: &str, prompt: &AgentPrompt, sticky: &StickyConfig) -> Value {
    let mut params = json!({
        "threadId": thread_id,
        "input": prompt_input(prompt),
    });
    if let Some(model) = sticky_model(sticky) {
        params["model"] = json!(model);
    }
    if let Some(effort) = &sticky.effort {
        params["effort"] = json!(effort);
    }
    if let Some(fast) = sticky.fast.as_deref() {
        if crate::policy::is_fast_on(Some(fast)) {
            params["serviceTier"] = json!(FAST_SERVICE_TIER);
        } else {
            // Explicit null clears a previously sticky Fast tier for this turn.
            params["serviceTier"] = Value::Null;
        }
    }
    if let Some(mode) = collaboration_mode_params(sticky) {
        params["collaborationMode"] = mode;
    }
    params
}

/// Live 0.153 `TurnStartParams.collaborationMode`. `settings.model` is required
/// (serde `missing field 'model'` otherwise). `developer_instructions: null`
/// means use the built-in instructions for `plan` / `default`. Omit the whole
/// object when sticky mode or model is empty — top-level `model` / `effort`
/// still apply, and older CLIs that reject the field retry without it.
pub fn collaboration_mode_params(sticky: &StickyConfig) -> Option<Value> {
    let mode = sticky
        .mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let model = sticky_model(sticky)?;
    let mut settings = json!({
        "model": model,
        "developer_instructions": null
    });
    if let Some(effort) = sticky
        .effort
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        settings["reasoning_effort"] = json!(effort);
    }
    Some(json!({
        "mode": mode,
        "settings": settings
    }))
}

pub fn collaboration_mode_rejected(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    if !lower.contains("collaborationmode") && !lower.contains("collaboration_mode") {
        return false;
    }
    lower.contains("unknown")
        || lower.contains("unexpected")
        || lower.contains("unsupported")
        || lower.contains("not found")
        || lower.contains("did not match")
        || lower.contains("invalid")
}

pub fn turn_steer_params(thread_id: &str, vendor_turn_id: &str, prompt: &AgentPrompt) -> Value {
    json!({
        "threadId": thread_id,
        "input": prompt_input(prompt),
        "expectedTurnId": vendor_turn_id,
    })
}

pub fn turn_interrupt_params(thread_id: &str, vendor_turn_id: &str) -> Value {
    json!({
        "threadId": thread_id,
        "turnId": vendor_turn_id,
    })
}

pub fn thread_fork_params(thread_id: &str, last_turn_id: Option<&str>) -> Value {
    let mut params = json!({
        "threadId": thread_id,
        "ephemeral": false,
    });
    if let Some(last_turn_id) = last_turn_id.filter(|id| !id.is_empty()) {
        params["lastTurnId"] = json!(last_turn_id);
    }
    params
}

pub fn thread_revert_params(thread_id: &str, before_turn_id: &str) -> Value {
    json!({
        "threadId": thread_id,
        "beforeTurnId": before_turn_id,
    })
}

pub fn thread_rollback_params(thread_id: &str, num_turns: u64) -> Value {
    json!({
        "threadId": thread_id,
        "numTurns": num_turns,
    })
}

/// 0.150 defaults to `historyMode: "paginated"` and only those threads speak `thread/revert`.
/// 0.144.5 live threads are `legacy` and reject `thread/revert` as an unknown method.
#[cfg(test)]
pub fn thread_uses_revert(thread_result: &Value) -> bool {
    thread_is_paginated(thread_result)
}

pub fn thread_is_paginated(thread_result: &Value) -> bool {
    let thread = thread_result.get("thread").unwrap_or(thread_result);
    thread.get("historyMode").and_then(Value::as_str) == Some("paginated")
        || thread.get("nextCursor").is_some()
        || thread.get("cursors").is_some()
        || thread.get("hasMore") == Some(&json!(true))
        || thread.pointer("/turns/nextCursor").is_some()
}

pub fn notification_thread_id(params: &Value) -> Option<&str> {
    params
        .get("threadId")
        .and_then(Value::as_str)
        .or_else(|| params.pointer("/thread/id").and_then(Value::as_str))
        .or_else(|| params.pointer("/turn/threadId").and_then(Value::as_str))
}

pub fn prompt_input(prompt: &AgentPrompt) -> Vec<Value> {
    let mut input = vec![json!({ "type": "text", "text": prompt.text })];
    for attachment in &prompt.attachments {
        if let Some(item) = map_attachment(attachment) {
            input.push(item);
        }
    }
    input
}

fn map_attachment(attachment: &str) -> Option<Value> {
    let text = attachment.trim();
    if text.is_empty() {
        return None;
    }
    if text.starts_with("http://")
        || text.starts_with("https://")
        || text.starts_with("data:image/")
    {
        return Some(json!({ "type": "image", "url": text }));
    }
    if let Some(path) = text.strip_prefix("file://") {
        return Some(json!({ "type": "localImage", "path": path }));
    }
    if Path::new(text).is_absolute() || text.contains('/') || text.contains('\\') {
        return Some(json!({ "type": "localImage", "path": text }));
    }
    None
}

impl CodexShared {
    pub fn new(
        stdin: Box<dyn AsyncWrite + Unpin + Send>,
        events_tx: mpsc::UnboundedSender<AgentEventEnvelope>,
        current_config: AgentCurrentConfig,
        sticky: StickyConfig,
    ) -> Arc<Self> {
        Arc::new(Self {
            stdin: Mutex::new(Some(stdin)),
            next_id: AtomicI64::new(0),
            client_rpc: Mutex::new(HashMap::new()),
            server_rpc: Mutex::new(HashMap::new()),
            ids: Mutex::new(IdMaps::default()),
            sticky: Mutex::new(sticky),
            running_turn: Mutex::new(None),
            closed: AtomicBool::new(false),
            events_tx,
            map: Mutex::new(EventMapState::new(current_config)),
            initialize: Mutex::new(Value::Null),
            thread_paginated: AtomicBool::new(false),
        })
    }

    pub async fn write_line(&self, line: String) -> AgentResult<()> {
        let mut guard = self.stdin.lock().await;
        let Some(stdin) = guard.as_mut() else {
            return Err(AgentProviderError::message("codex stdin closed"));
        };
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|error| AgentProviderError::message(format!("codex write failed: {error}")))?;
        stdin
            .flush()
            .await
            .map_err(|error| AgentProviderError::message(format!("codex flush failed: {error}")))
    }

    pub async fn request(&self, method: &str, params: Value) -> AgentResult<Value> {
        let id = RpcId::Number(self.next_id.fetch_add(1, Ordering::SeqCst));
        let (tx, rx) = oneshot::channel();
        self.client_rpc.lock().await.insert(id.key(), tx);
        self.write_line(encode_request(&id, method, params)).await?;
        match timeout(RPC_TIMEOUT, rx).await {
            Ok(Ok(ClientRpcOutcome::Result(value))) => Ok(value),
            Ok(Ok(ClientRpcOutcome::Error { message })) => {
                Err(AgentProviderError::message(message))
            }
            Ok(Err(_)) => Err(AgentProviderError::message(format!("{method} cancelled"))),
            Err(_) => Err(AgentProviderError::message(format!("{method} timed out"))),
        }
    }

    pub async fn notify(&self, method: &str, params: Value) -> AgentResult<()> {
        self.write_line(encode_notification(method, params)).await
    }

    pub async fn handshake(&self, cwd: &Path, resume: Option<&str>) -> AgentResult<String> {
        let initialize = self.request("initialize", initialize_params()).await?;
        if initialize.get("error").is_some() {
            return Err(AgentProviderError::message(format!(
                "codex initialize failed: {initialize}"
            )));
        }
        *self.initialize.lock().await = initialize;
        self.notify("initialized", json!({})).await?;
        if let Ok(models) = self
            .request("model/list", json!({ "includeHidden": false }))
            .await
        {
            overlay_models(self, models).await;
        }
        let modes = match self.request("collaborationMode/list", json!({})).await {
            Ok(result) => {
                let parsed = super::options::parse_collaboration_modes(&result);
                if parsed.is_empty() {
                    super::options::codex_modes()
                } else {
                    parsed
                }
            }
            Err(_) => super::options::codex_modes(),
        };
        overlay_modes(self, modes).await;
        overlay_permission_modes(self).await;
        {
            let (models, thinking) = {
                let map = self.map.lock().await;
                (
                    map.supported_options.models.clone(),
                    map.supported_options.thinking.clone(),
                )
            };
            let mut sticky = self.sticky.lock().await;
            apply_listed_defaults_to_sticky(&mut sticky, &models, &thinking);
        }
        let sticky = self.sticky.lock().await.clone();
        if resume.is_none() && sticky_unset(&sticky.model) {
            return Err(AgentProviderError::message(
                "codex requires a model before thread/start",
            ));
        }
        let result = if let Some(thread_id) = resume {
            self.request(
                "thread/resume",
                thread_resume_params(thread_id, cwd, &sticky),
            )
            .await?
        } else {
            self.request("thread/start", thread_start_params(cwd, &sticky))
                .await?
        };
        let thread_id = result
            .get("thread")
            .and_then(|thread| thread.get("id"))
            .and_then(Value::as_str)
            .ok_or_else(|| AgentProviderError::message("codex thread id missing"))?
            .to_string();
        self.thread_paginated
            .store(thread_is_paginated(&result), Ordering::SeqCst);
        let handle = self.ids.lock().await.set_thread(thread_id.clone());
        {
            let mut map = self.map.lock().await;
            map.persistence = Some(handle.clone());
        }
        let _ = self.events_tx.send(AgentEventEnvelope::new(
            None,
            AgentEvent::SessionStarted {
                persistence_handle: Some(thread_id.clone()),
            },
        ));
        Ok(thread_id)
    }

    pub async fn fail_outstanding(&self) {
        let pending: Vec<PendingServerReq> = self
            .server_rpc
            .lock()
            .await
            .drain()
            .map(|(_, req)| req)
            .collect();
        for req in pending {
            let body = if dialect_for_method(&req.method).is_some() {
                encode_result(&req.id, cancel_result(&req.method, &req.params))
            } else {
                encode_error(&req.id, METHOD_NOT_FOUND, "Method not found")
            };
            let _ = self.write_line(body).await;
        }
        let mut client = self.client_rpc.lock().await;
        for (_, tx) in client.drain() {
            let _ = tx.send(ClientRpcOutcome::Error {
                message: "closed".into(),
            });
        }
    }

    pub fn emit_closed(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = self
            .events_tx
            .send(AgentEventEnvelope::new(None, AgentEvent::SessionClosed));
    }
}

pub async fn reader_loop<R>(stdout: R, shared: Arc<CodexShared>)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(stdout).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if let Err(error) = handle_line(&shared, &line).await {
                    tracing::debug!(error = %error, "codex frame skipped");
                }
            }
            Ok(None) => break,
            Err(error) => {
                tracing::debug!(error = %error, "codex stdout closed");
                break;
            }
        }
    }
    shared.emit_closed();
}

pub async fn stderr_loop<R>(stderr: R)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        tracing::debug!(target: "codex-app-server", "{line}");
    }
}

async fn handle_line(shared: &Arc<CodexShared>, line: &str) -> Result<(), String> {
    if line.trim().is_empty() {
        return Ok(());
    }
    let value = parse_line(line).map_err(|error| error.to_string())?;
    match classify(&value) {
        InboundFrame::Response { id, result, error } => {
            if let Some(tx) = shared.client_rpc.lock().await.remove(&id.key()) {
                let outcome = if let Some(error) = error {
                    ClientRpcOutcome::Error {
                        message: error_message(&error),
                    }
                } else {
                    ClientRpcOutcome::Result(result.unwrap_or(Value::Null))
                };
                let _ = tx.send(outcome);
            }
        }
        InboundFrame::ServerRequest { id, method, params } => {
            handle_server_request(shared, id, method, params).await?;
        }
        InboundFrame::Notification { method, params } => {
            handle_notification(shared, method, params).await;
        }
        InboundFrame::Malformed(value) => {
            tracing::debug!(frame = %value, "codex malformed frame");
        }
    }
    Ok(())
}

async fn handle_server_request(
    shared: &Arc<CodexShared>,
    id: RpcId,
    method: String,
    params: Value,
) -> Result<(), String> {
    if dialect_for_method(&method).is_some() {
        let request_id = id.key();
        let request = permission_request(request_id.clone(), &method, &params);
        shared
            .server_rpc
            .lock()
            .await
            .insert(request_id, PendingServerReq { id, method, params });
        let turn_id = shared.running_turn.lock().await.clone();
        let _ = shared.events_tx.send(AgentEventEnvelope::new(
            turn_id,
            AgentEvent::PermissionRequested { request },
        ));
        return Ok(());
    }
    shared
        .write_line(encode_error(&id, METHOD_NOT_FOUND, "Method not found"))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn handle_notification(shared: &Arc<CodexShared>, method: String, params: Value) {
    let parent = shared.ids.lock().await.thread_id.clone();
    if let (Some(parent), Some(thread_id)) = (parent.as_deref(), notification_thread_id(&params)) {
        if thread_id != parent {
            return;
        }
    }
    if method == "turn/started" {
        if let Some(vendor) = params
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            if let Some(atmos) = shared.running_turn.lock().await.clone() {
                shared.ids.lock().await.bind_turn(atmos, vendor);
            }
        }
    }
    let turn_id = shared.running_turn.lock().await.clone();
    let events = {
        let mut map = shared.map.lock().await;
        map_notification(&mut map, turn_id, &method, &params)
    };
    for event in events {
        let _ = shared.events_tx.send(event);
    }
    if method == "turn/completed" {
        *shared.running_turn.lock().await = None;
        let mut map = shared.map.lock().await;
        map.turn_failed_emitted = false;
        map.last_error = None;
    }
}

async fn overlay_models(shared: &CodexShared, result: Value) {
    let (models, thinking) = super::options::parse_model_list(&result);
    if models.is_empty() {
        return;
    }
    {
        let mut sticky = shared.sticky.lock().await;
        apply_listed_defaults_to_sticky(&mut sticky, &models, &thinking);
    }
    let mut map = shared.map.lock().await;
    let modes = map.supported_options.modes.clone();
    let permission_modes = map.supported_options.permission_modes.clone();
    map.supported_options = AgentSupportedOptions {
        models,
        thinking,
        modes,
        permission_modes,
        fast: crate::policy::boolean_fast_modes(crate::policy::is_fast_on(
            map.current_config.fast.as_deref(),
        )),
    };
    emit_supported_options(shared, &map.supported_options);
}

/// 0.152.1 `thread/start` and `turn/start` reject a missing `model`. Composer can
/// display the catalog default while spawn `cfg.model` is still empty.
pub(crate) fn apply_listed_defaults_to_sticky(
    sticky: &mut StickyConfig,
    models: &[AgentModel],
    thinking: &AgentThinkingSupport,
) {
    if sticky_unset(&sticky.model) {
        sticky.model = models
            .iter()
            .find(|model| model.is_default)
            .or_else(|| models.first())
            .map(|model| model.id.clone());
    }
    if sticky_unset(&sticky.effort) {
        sticky.effort = default_effort_for_model(models, sticky.model.as_deref(), thinking);
    }
}

fn sticky_unset(value: &Option<String>) -> bool {
    value
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .is_none()
}

fn sticky_model(sticky: &StickyConfig) -> Option<&str> {
    sticky
        .model
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

async fn overlay_permission_modes(shared: &CodexShared) {
    let mut map = shared.map.lock().await;
    if !map.supported_options.permission_modes.is_empty() {
        return;
    }
    map.supported_options.permission_modes = crate::policy::advertised_permission_modes("codex");
    emit_supported_options(shared, &map.supported_options);
}

fn default_effort_for_model(
    models: &[AgentModel],
    model_id: Option<&str>,
    thinking: &AgentThinkingSupport,
) -> Option<String> {
    if let Some(model) = models
        .iter()
        .find(|model| Some(model.id.as_str()) == model_id)
    {
        if let Some(AgentThinkingSupport::Enum { options, .. }) = &model.thinking {
            if let Some(effort) = options
                .iter()
                .map(|item| item.trim())
                .find(|item| !item.is_empty())
            {
                return Some(effort.to_string());
            }
        }
    }
    match thinking {
        AgentThinkingSupport::Enum { options, .. } => options
            .iter()
            .map(|item| item.trim())
            .find(|item| !item.is_empty())
            .map(str::to_string),
        _ => None,
    }
}

async fn overlay_modes(shared: &CodexShared, modes: Vec<AgentMode>) {
    if modes.is_empty() {
        return;
    }
    let mut map = shared.map.lock().await;
    map.supported_options.modes = modes;
    emit_supported_options(shared, &map.supported_options);
}

fn emit_supported_options(shared: &CodexShared, options: &AgentSupportedOptions) {
    let config = serde_json::to_value(options).unwrap_or(Value::Null);
    let _ = shared.events_tx.send(AgentEventEnvelope::new(
        None,
        AgentEvent::ConfigChanged { config },
    ));
}

fn error_message(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| error.to_string())
}

pub async fn answer_permission(
    shared: &CodexShared,
    request_id: &str,
    option_id: &str,
) -> Result<(), crate::contract::AgentActionError> {
    use crate::contract::AgentActionError;
    let req = shared
        .server_rpc
        .lock()
        .await
        .remove(request_id)
        .ok_or_else(|| AgentActionError::NotFound(request_id.to_string()))?;
    let result = result_json(&req.method, option_id, &req.params);
    shared
        .write_line(encode_result(&req.id, result))
        .await
        .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::codex::codec::encode_request;
    use std::path::PathBuf;

    #[test]
    fn listed_model_defaults_fill_thread_and_turn_start() {
        let (models, thinking) = crate::providers::codex::options::parse_model_list(&json!({
            "data": [{
                "id": "gpt-5.6-luna",
                "displayName": "GPT-5.6-Luna",
                "isDefault": true,
                "supportedReasoningEfforts": [
                    {"reasoningEffort": "low"},
                    {"reasoningEffort": "high"}
                ]
            }]
        }));
        let mut sticky = StickyConfig::default();
        apply_listed_defaults_to_sticky(&mut sticky, &models, &thinking);
        assert_eq!(sticky.model.as_deref(), Some("gpt-5.6-luna"));
        assert_eq!(sticky.effort.as_deref(), Some("low"));
        let thread = thread_start_params(&PathBuf::from("/abs/project"), &sticky);
        assert_eq!(thread["model"], "gpt-5.6-luna");
        let prompt = AgentPrompt {
            text: "who are you".into(),
            ..AgentPrompt::default()
        };
        let turn = turn_start_params("thr_123", &prompt, &sticky);
        assert_eq!(turn["model"], "gpt-5.6-luna");
        assert_eq!(turn["effort"], "low");
    }

    #[test]
    fn listed_model_defaults_do_not_override_explicit_sticky() {
        let (models, thinking) = crate::providers::codex::options::parse_model_list(&json!({
            "data": [{
                "id": "gpt-5.6-luna",
                "isDefault": true,
                "supportedReasoningEfforts": [{"reasoningEffort": "low"}]
            }]
        }));
        let mut sticky = StickyConfig {
            model: Some("gpt-5.6-sol".into()),
            effort: Some("high".into()),
            ..StickyConfig::default()
        };
        apply_listed_defaults_to_sticky(&mut sticky, &models, &thinking);
        assert_eq!(sticky.model.as_deref(), Some("gpt-5.6-sol"));
        assert_eq!(sticky.effort.as_deref(), Some("high"));
    }

    #[test]
    fn handshake_fixture_includes_experimental_api_and_sets_user_reviewer() {
        let init = encode_request(&RpcId::Number(0), "initialize", initialize_params());
        assert!(init.contains("\"name\":\"atmos\""));
        assert!(init.contains("experimentalApi"));
        assert!(!init.contains("jsonrpc"));
        let params = thread_start_params(
            &PathBuf::from("/abs/project"),
            &StickyConfig {
                model: Some("gpt-5.6-sol".into()),
                ..StickyConfig::default()
            },
        );
        assert_eq!(params["approvalsReviewer"], "user");
        assert_eq!(params["approvalPolicy"], "on-request");
        assert_eq!(params["sandbox"], "workspace-write");
        assert!(params.get("collaborationMode").is_none());
        let line = encode_request(&RpcId::Number(1), "thread/start", params);
        assert!(!line.contains("jsonrpc"));
        let yolo = thread_start_params(
            &PathBuf::from("/abs/project"),
            &StickyConfig {
                model: Some("gpt-5.6-sol".into()),
                permission_mode: Some("yolo".into()),
                ..StickyConfig::default()
            },
        );
        assert_eq!(yolo["approvalPolicy"], "never");
        assert_eq!(yolo["approvalsReviewer"], "user");
        let auto = thread_start_params(
            &PathBuf::from("/abs/project"),
            &StickyConfig {
                model: Some("gpt-5.6-sol".into()),
                permission_mode: Some("auto".into()),
                ..StickyConfig::default()
            },
        );
        assert_eq!(auto["approvalPolicy"], "on-request");
        assert_eq!(auto["approvalsReviewer"], "auto_review");
        let ask = thread_start_params(
            &PathBuf::from("/abs/project"),
            &StickyConfig {
                model: Some("gpt-5.6-sol".into()),
                permission_mode: Some("ask_always".into()),
                ..StickyConfig::default()
            },
        );
        assert_eq!(ask["approvalPolicy"], "on-request");
        assert_eq!(ask["approvalsReviewer"], "user");
    }

    #[test]
    fn steer_params_use_vendor_turn_id_not_atmos_uuid() {
        let atmos = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        let prompt = AgentPrompt {
            text: "Focus on failures.".into(),
            ..AgentPrompt::default()
        };
        let params = turn_steer_params("thr_123", "turn_456", &prompt);
        assert_eq!(params["expectedTurnId"], "turn_456");
        assert_ne!(params["expectedTurnId"], atmos);
        let line = encode_request(&RpcId::Number(32), "turn/steer", params);
        assert!(line.contains("\"expectedTurnId\":\"turn_456\""));
        assert!(!line.contains(atmos));
        assert!(!line.contains("jsonrpc"));
        let fixture: Value = serde_json::from_str(
            include_str!("testdata/steer.jsonl")
                .lines()
                .next()
                .expect("steer fixture"),
        )
        .expect("json");
        assert_eq!(
            fixture["params"]["expectedTurnId"],
            "01a05dc0-1e2e-7d51-a095-9f6293195520"
        );
    }

    #[test]
    fn set_config_is_sticky_on_next_turn_start() {
        let mut sticky = StickyConfig::default();
        sticky.apply(&AgentRuntimeConfigUpdate {
            model: Some("gpt-5.6-sol".into()),
            thinking: Some("high".into()),
            mode: Some("plan".into()),
            fast: Some("true".into()),
            ..AgentRuntimeConfigUpdate::default()
        });
        let prompt = AgentPrompt {
            text: "Run tests".into(),
            ..AgentPrompt::default()
        };
        let params = turn_start_params("thr_123", &prompt, &sticky);
        assert_eq!(params["model"], "gpt-5.6-sol");
        assert_eq!(params["effort"], "high");
        assert_eq!(params["serviceTier"], FAST_SERVICE_TIER);
        assert_eq!(params["collaborationMode"]["mode"], "plan");
        assert_eq!(
            params["collaborationMode"]["settings"]["model"],
            "gpt-5.6-sol"
        );
        assert_eq!(
            params["collaborationMode"]["settings"]["reasoning_effort"],
            "high"
        );
        assert!(params["collaborationMode"]["settings"]["developer_instructions"].is_null());
        sticky.apply(&AgentRuntimeConfigUpdate {
            mode: Some("default".into()),
            fast: Some("false".into()),
            ..AgentRuntimeConfigUpdate::default()
        });
        let back = turn_start_params("thr_123", &prompt, &sticky);
        assert_eq!(back["collaborationMode"]["mode"], "default");
        assert_eq!(
            back["collaborationMode"]["settings"]["model"],
            "gpt-5.6-sol"
        );
        assert!(back["serviceTier"].is_null());
        assert!(collaboration_mode_rejected(
            "collaborationMode did not match schema"
        ));
        assert!(!collaboration_mode_rejected("turn timed out"));
    }

    #[test]
    fn collaboration_mode_omits_when_sticky_model_is_empty() {
        let sticky = StickyConfig {
            mode: Some("plan".into()),
            ..StickyConfig::default()
        };
        assert!(collaboration_mode_params(&sticky).is_none());
        let prompt = AgentPrompt {
            text: "Run tests".into(),
            ..AgentPrompt::default()
        };
        let params = turn_start_params("thr_123", &prompt, &sticky);
        assert!(params.get("collaborationMode").is_none());
    }

    #[test]
    fn prompt_input_maps_text_and_image_kinds() {
        let prompt = AgentPrompt {
            text: "see this".into(),
            attachments: vec![
                "https://example.com/a.png".into(),
                "/tmp/shot.png".into(),
                "not-an-attachment".into(),
            ],
            ..AgentPrompt::default()
        };
        let input = prompt_input(&prompt);
        assert_eq!(input[0]["type"], "text");
        assert_eq!(input[1]["type"], "image");
        assert_eq!(input[2]["type"], "localImage");
        assert_eq!(input.len(), 3);
    }

    #[test]
    fn fork_never_defaults_ephemeral_true() {
        let params = thread_fork_params("thr_123", None);
        assert_eq!(params["threadId"], "thr_123");
        assert_eq!(params["ephemeral"], false);
        assert!(params.get("lastTurnId").is_none());
        let with_turn = thread_fork_params("thr_123", Some("turn_456"));
        assert_eq!(with_turn["lastTurnId"], "turn_456");
        assert_eq!(with_turn["ephemeral"], false);
        let revert = thread_revert_params("thr_123", "turn_789");
        assert_eq!(revert["threadId"], "thr_123");
        assert_eq!(revert["beforeTurnId"], "turn_789");
        let rollback = thread_rollback_params("thr_123", 2);
        assert_eq!(rollback["threadId"], "thr_123");
        assert_eq!(rollback["numTurns"], 2);
        assert!(thread_uses_revert(&json!({
            "thread": { "id": "t", "historyMode": "paginated" }
        })));
        assert!(!thread_uses_revert(&json!({
            "thread": { "id": "t", "historyMode": "legacy" }
        })));
        assert!(thread_is_paginated(
            &json!({ "thread": { "id": "t", "nextCursor": "abc" } })
        ));
        assert!(!thread_is_paginated(&json!({ "thread": { "id": "t" } })));
    }
}
