//! Native Pi Chat adapter (`pi --mode rpc`). JSONL, not JSON-RPC.

mod codec;
mod event_map;
pub(crate) mod options;
mod rpc;
mod spawn;
mod tool_map;

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, BufReader};
use tokio::process::Child;
use tokio::sync::{mpsc, Mutex};

use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentEvent, AgentEventEnvelope, AgentPermissionOption};
use crate::contract::{AgentModel, AgentThinkingSupport};
use crate::contract::{
    AgentOptionsContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeControl,
    AgentTurnHandle,
};
use crate::models::AgentLaunchSpec;
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use codec::FrameClass;
use event_map::{is_dialog_needing_immediate_cancel, map_event, EventMapState, ExtensionUiKind};
use rpc::{
    apply_get_state, cmd_abort, cmd_clone, cmd_fork, cmd_get_available_models,
    cmd_get_available_thinking_levels, cmd_get_fork_messages, cmd_get_state, cmd_prompt,
    cmd_prompt_streaming_steer, cmd_set_model, cmd_set_thinking_level, cmd_steer,
    cmd_switch_session, cmd_ui_cancelled, cmd_ui_confirmed, cmd_ui_value, parse_fork_messages,
    PiTransport, ACCEPT_TIMEOUT, HANDSHAKE_TIMEOUT,
};
use spawn::{chat_argv, program_from_launch_spec, spawn_chat, split_model_id};

pub struct PiNativeProvider {
    program: String,
    env: Option<HashMap<String, String>>,
}

impl Default for PiNativeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PiNativeProvider {
    pub fn new() -> Self {
        Self {
            program: "pi".into(),
            env: None,
        }
    }

    pub fn with_program(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            env: None,
        }
    }

    pub fn from_launch_spec(spec: &AgentLaunchSpec) -> Self {
        Self {
            program: program_from_launch_spec(spec),
            env: spec.env.clone(),
        }
    }

    pub fn program(&self) -> &str {
        &self.program
    }

    pub fn chat_argv(model: Option<&str>) -> Vec<String> {
        chat_argv(model)
    }
}

fn provider_descriptor(current: AgentCurrentConfig) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: "pi".into(),
            name: "Pi".into(),
            version: None,
        },
        capabilities: capabilities_for_provider("pi"),
        support: option_support_for_provider("pi"),
        supported_options: AgentSupportedOptions::default(),
        current_config: current,
    }
}

struct PiCommands {
    transport: Arc<PiTransport>,
    running_turn: Mutex<Option<String>>,
    pending_ui: Mutex<HashMap<String, ExtensionUiKind>>,
    descriptor: Mutex<AgentDescriptor>,
    persistence: Mutex<Option<AgentPersistenceHandle>>,
    child: Arc<Mutex<Option<Child>>>,
}

#[async_trait]
impl AgentRuntimeCommands for PiCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        if self.transport.is_streaming.load(Ordering::SeqCst) {
            return Err(AgentProviderError::message(
                "cannot prompt while agent is streaming",
            ));
        }
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let images = load_images(&input.attachments);
        self.transport
            .steered_this_turn
            .store(false, Ordering::SeqCst);
        *self.running_turn.lock().await = Some(turn_id.clone());
        let response = self
            .transport
            .call(cmd_prompt(&input.text, &images), ACCEPT_TIMEOUT)
            .await?;
        response.require_ok()?;
        self.transport.is_streaming.store(true, Ordering::SeqCst);
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        // 0.84.2 has no `clear_queue` (unknown command). Abort after settle.
        let response = self.transport.call(cmd_abort(), ACCEPT_TIMEOUT).await?;
        response.require_ok()?;
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.pending_ui.lock().await.clear();
        self.transport.shutdown_writer().await;
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.kill().await;
        }
        Ok(())
    }

    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        match action {
            AgentAction::Steer { input } => {
                self.steer(input).await.map(|()| AgentActionResult::unit())
            }
            AgentAction::RespondPermission {
                request_id,
                option_id,
            } => self
                .respond_permission(request_id, option_id)
                .await
                .map(|()| AgentActionResult::unit()),
            AgentAction::SetConfig { update } => self
                .set_config(*update)
                .await
                .map(|()| AgentActionResult::unit()),
            AgentAction::PrepareSessionOp { kind, rest } => {
                let _ = rest;
                if kind != crate::contract::SessionOpKind::Fork {
                    return Err(AgentActionError::Unsupported {
                        action: AgentActionKind::PrepareSessionOp,
                    });
                }
                self.prepare_fork().await
            }
            AgentAction::RespondSessionOp {
                option_id, target, ..
            } => self.respond_session_op(&option_id, target.as_deref()).await,
        }
    }
}

impl PiCommands {
    async fn prepare_fork(&self) -> Result<AgentActionResult, AgentActionError> {
        let fork_messages = self
            .transport
            .call(cmd_get_fork_messages(), ACCEPT_TIMEOUT)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        fork_messages
            .require_ok()
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        let data = fork_messages.data();
        let mut options = vec![AgentPermissionOption {
            option_id: "fork".into(),
            name: "Fork here".into(),
            kind: "fork".into(),
        }];
        for (id, name) in parse_fork_messages(data) {
            options.push(AgentPermissionOption {
                option_id: format!("fork_entry:{id}"),
                name,
                kind: "fork".into(),
            });
        }
        Ok(AgentActionResult::prepared_options(options))
    }

    async fn respond_session_op(
        &self,
        option_id: &str,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        match option_id {
            "fork" | "fork_no_worktree" | "fork_worktree" => self.fork_session(target).await,
            entry if entry.starts_with("fork_entry:") => {
                self.fork_session(Some(entry.trim_start_matches("fork_entry:")))
                    .await
            }
            "rewind" | "rewind_conversation" | "rewind_code" | "rewind_both" | "redo" => {
                Err(AgentActionError::Unsupported {
                    action: AgentActionKind::RespondSessionOp,
                })
            }
            other => Err(AgentActionError::NotFound(other.to_string())),
        }
    }

    async fn fork_session(
        &self,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        let parent = self
            .transport
            .snapshot
            .lock()
            .await
            .session_file
            .clone()
            .or_else(|| {
                self.persistence
                    .try_lock()
                    .ok()
                    .and_then(|guard| guard.as_ref().map(|handle| handle.as_str().to_string()))
            });
        let fork_messages = self
            .transport
            .call(cmd_get_fork_messages(), ACCEPT_TIMEOUT)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        fork_messages
            .require_ok()
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        let response = if let Some(entry_id) = target.filter(|value| !value.is_empty()) {
            self.transport
                .call(cmd_fork(entry_id), ACCEPT_TIMEOUT)
                .await
                .map_err(|error| AgentActionError::NotFound(error.to_string()))?
        } else {
            self.transport
                .call(cmd_clone(), ACCEPT_TIMEOUT)
                .await
                .map_err(|error| AgentActionError::NotFound(error.to_string()))?
        };
        response
            .require_ok()
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        if response
            .data()
            .get("cancelled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Err(AgentActionError::NotFound("fork cancelled".into()));
        }
        let state = self
            .transport
            .call(cmd_get_state(), HANDSHAKE_TIMEOUT)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        state
            .require_ok()
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        {
            let mut snapshot = self.transport.snapshot.lock().await;
            apply_get_state(&mut snapshot, state.data());
        }
        let child = self
            .transport
            .snapshot
            .lock()
            .await
            .session_file
            .clone()
            .ok_or_else(|| AgentActionError::NotFound("fork sessionFile".into()))?;
        if let Some(parent) = parent.as_deref() {
            if child != parent {
                let switched = self
                    .transport
                    .call(cmd_switch_session(parent), HANDSHAKE_TIMEOUT)
                    .await
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                switched
                    .require_ok()
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                if switched
                    .data()
                    .get("cancelled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    return Err(AgentActionError::NotFound(
                        "switch_session cancelled".into(),
                    ));
                }
                let restored = self
                    .transport
                    .call(cmd_get_state(), HANDSHAKE_TIMEOUT)
                    .await
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                restored
                    .require_ok()
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                let mut snapshot = self.transport.snapshot.lock().await;
                apply_get_state(&mut snapshot, restored.data());
            }
        }
        Ok(AgentActionResult::forked(child, None))
    }

    async fn steer(&self, input: AgentPrompt) -> Result<(), AgentActionError> {
        if !self.transport.is_streaming.load(Ordering::SeqCst) {
            return Err(AgentActionError::SteerTurnMismatch);
        }
        let images = load_images(&input.attachments);
        let response = self
            .transport
            .call(cmd_steer(&input.text, &images), ACCEPT_TIMEOUT)
            .await
            .map_err(|_| AgentActionError::SteerTurnMismatch)?;
        if !response.success {
            let not_streaming = response
                .error
                .as_deref()
                .is_some_and(|error| error.to_ascii_lowercase().contains("not streaming"));
            if not_streaming && self.transport.is_streaming.load(Ordering::SeqCst) {
                let retry = self
                    .transport
                    .call(
                        cmd_prompt_streaming_steer(&input.text, &images),
                        ACCEPT_TIMEOUT,
                    )
                    .await
                    .map_err(|_| AgentActionError::SteerTurnMismatch)?;
                retry
                    .require_ok()
                    .map_err(|_| AgentActionError::SteerTurnMismatch)?;
            } else {
                return Err(AgentActionError::SteerTurnMismatch);
            }
        }
        self.transport
            .steered_this_turn
            .store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn respond_permission(
        &self,
        request_id: String,
        option_id: String,
    ) -> Result<(), AgentActionError> {
        let kind = self
            .pending_ui
            .lock()
            .await
            .remove(&request_id)
            .ok_or_else(|| AgentActionError::NotFound(request_id.clone()))?;
        let body = match kind {
            ExtensionUiKind::Confirm => cmd_ui_confirmed(&request_id, confirm_allowed(&option_id)),
            ExtensionUiKind::Select => cmd_ui_value(&request_id, &option_id),
            ExtensionUiKind::Input | ExtensionUiKind::Editor => {
                if confirm_allowed(&option_id) && option_id.eq_ignore_ascii_case("allow") {
                    cmd_ui_value(&request_id, "")
                } else if is_cancel_option(&option_id) {
                    cmd_ui_cancelled(&request_id)
                } else {
                    cmd_ui_value(&request_id, &option_id)
                }
            }
        };
        self.transport
            .write_value(&body)
            .await
            .map_err(|_| AgentActionError::NotFound(request_id))?;
        Ok(())
    }

    async fn set_config(
        &self,
        update: crate::contract::AgentRuntimeConfigUpdate,
    ) -> Result<(), AgentActionError> {
        if let Some(model) = &update.model {
            let snapshot = self.transport.snapshot.lock().await;
            let fallback = snapshot.model_provider.clone();
            drop(snapshot);
            let (provider, model_id) =
                split_model_id(model, fallback.as_deref()).map_err(|_| {
                    AgentActionError::Unsupported {
                        action: AgentActionKind::SetConfig,
                    }
                })?;
            let response = self
                .transport
                .call(cmd_set_model(&provider, &model_id), HANDSHAKE_TIMEOUT)
                .await
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                })?;
            response
                .require_ok()
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                })?;
            let levels = self
                .transport
                .call(cmd_get_available_thinking_levels(), HANDSHAKE_TIMEOUT)
                .await
                .ok();
            let mut descriptor = self.descriptor.lock().await;
            descriptor.current_config.model = Some(format!("{provider}/{model_id}"));
            if let Some(levels) = levels.and_then(|response| response.require_ok().ok().cloned()) {
                descriptor.supported_options.thinking = thinking_from_data(levels.data());
            }
        }
        if let Some(thinking) = &update.thinking {
            let response = self
                .transport
                .call(cmd_set_thinking_level(thinking), HANDSHAKE_TIMEOUT)
                .await
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                })?;
            response
                .require_ok()
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                })?;
            self.descriptor.lock().await.current_config.thinking = Some(thinking.clone());
        }
        let _ = update.mode;
        Ok(())
    }

    async fn write_ui_cancelled(&self, id: &str) -> AgentResult<()> {
        self.transport.write_value(&cmd_ui_cancelled(id)).await
    }
}

struct PiRuntime {
    commands: Arc<PiCommands>,
    events: mpsc::UnboundedReceiver<Value>,
    map: EventMapState,
    closed_emitted: bool,
}

#[async_trait]
impl AgentRuntime for PiRuntime {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.commands
            .persistence
            .try_lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    fn descriptor(&self) -> AgentDescriptor {
        self.commands
            .descriptor
            .try_lock()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        if let Some(event) = self.map.pending.pop_front() {
            return Some(event);
        }
        loop {
            let frame = match self.events.recv().await {
                Some(frame) => frame,
                None => {
                    if !self.closed_emitted {
                        self.closed_emitted = true;
                        return Some(AgentEventEnvelope::new(None, AgentEvent::SessionClosed));
                    }
                    return None;
                }
            };
            apply_stream_flags(&self.commands.transport, &frame);
            if let Some(id) = is_dialog_needing_immediate_cancel(&frame) {
                let _ = self.commands.write_ui_cancelled(&id).await;
                let method = frame
                    .get("method")
                    .and_then(Value::as_str)
                    .unwrap_or("input");
                return Some(AgentEventEnvelope::new(
                    self.commands.running_turn.lock().await.clone(),
                    AgentEvent::Unknown {
                        event_type: method.to_string(),
                        payload: frame,
                    },
                ));
            }
            let turn_id = self.commands.running_turn.lock().await.clone();
            let mut ui = self.commands.pending_ui.lock().await;
            let mapped = map_event(&mut self.map, turn_id.clone(), &frame, &mut ui);
            drop(ui);
            if frame.get("type").and_then(Value::as_str) == Some("agent_settled") {
                *self.commands.running_turn.lock().await = None;
                self.commands
                    .transport
                    .is_streaming
                    .store(false, Ordering::SeqCst);
                self.commands
                    .transport
                    .steered_this_turn
                    .store(false, Ordering::SeqCst);
            }
            if let Some(event) = mapped {
                return Some(event);
            }
            if let Some(event) = self.map.pending.pop_front() {
                return Some(event);
            }
        }
    }
}

fn apply_stream_flags(transport: &PiTransport, frame: &Value) {
    match frame.get("type").and_then(Value::as_str) {
        Some("agent_start") => transport.is_streaming.store(true, Ordering::SeqCst),
        Some("agent_settled") => {
            transport.is_streaming.store(false, Ordering::SeqCst);
            transport.steered_this_turn.store(false, Ordering::SeqCst);
        }
        _ => {}
    }
}

async fn drain_stderr(stderr: impl AsyncRead + Unpin + Send + 'static) {
    let mut reader = BufReader::new(stderr);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                tracing::debug!(target: "pi_rpc", stderr = %line.trim_end());
            }
            Err(_) => break,
        }
    }
}

async fn read_loop(
    stdout: impl AsyncRead + Unpin + Send + 'static,
    transport: Arc<PiTransport>,
    event_tx: mpsc::UnboundedSender<Value>,
) {
    let mut reader = BufReader::new(stdout);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                let Some(record) = codec::trim_record(&buf) else {
                    continue;
                };
                let Ok(value) = serde_json::from_slice::<Value>(record) else {
                    tracing::debug!(target: "pi_rpc", "skip non-json stdout");
                    continue;
                };
                match codec::classify_frame(&value) {
                    FrameClass::Response => {
                        let _ = transport.complete_response(&value).await;
                    }
                    FrameClass::Event => {
                        if event_tx.send(value).is_err() {
                            break;
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }
}

async fn handshake(
    transport: &PiTransport,
    descriptor: &mut AgentDescriptor,
    resume: Option<&str>,
    cfg: &AgentRuntimeConfig,
) -> AgentResult<AgentPersistenceHandle> {
    let state = transport
        .call(cmd_get_state(), HANDSHAKE_TIMEOUT)
        .await?
        .require_ok()?
        .clone();
    {
        let mut snapshot = transport.snapshot.lock().await;
        apply_get_state(&mut snapshot, state.data());
        transport
            .is_streaming
            .store(snapshot.is_streaming, Ordering::SeqCst);
    }
    let models = transport
        .call(cmd_get_available_models(), HANDSHAKE_TIMEOUT)
        .await?
        .require_ok()?
        .clone();
    let levels = transport
        .call(cmd_get_available_thinking_levels(), HANDSHAKE_TIMEOUT)
        .await?
        .require_ok()?
        .clone();
    descriptor.supported_options.models = models_from_data(models.data());
    descriptor.supported_options.thinking = thinking_from_data(levels.data());
    apply_snapshot_to_config(transport, descriptor).await;

    if let Some(path) = resume {
        let switched = transport
            .call(cmd_switch_session(path), HANDSHAKE_TIMEOUT)
            .await?
            .require_ok()?
            .clone();
        if switched
            .data()
            .get("cancelled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Err(AgentProviderError::message("switch_session cancelled"));
        }
        let state = transport
            .call(cmd_get_state(), HANDSHAKE_TIMEOUT)
            .await?
            .require_ok()?
            .clone();
        let mut snapshot = transport.snapshot.lock().await;
        apply_get_state(&mut snapshot, state.data());
        drop(snapshot);
        apply_snapshot_to_config(transport, descriptor).await;
    }

    if let Some(thinking) = &cfg.thinking {
        let _ = transport
            .call(cmd_set_thinking_level(thinking), HANDSHAKE_TIMEOUT)
            .await;
        descriptor.current_config.thinking = Some(thinking.clone());
    }

    let handle = transport
        .snapshot
        .lock()
        .await
        .session_file
        .clone()
        .or_else(|| resume.map(str::to_string))
        .ok_or_else(|| AgentProviderError::message("pi get_state missing sessionFile"))?;
    Ok(AgentPersistenceHandle::new(handle))
}

async fn apply_snapshot_to_config(transport: &PiTransport, descriptor: &mut AgentDescriptor) {
    let snapshot = transport.snapshot.lock().await;
    descriptor.current_config.model = match (
        snapshot.model_provider.as_deref(),
        snapshot.model_id.as_deref(),
    ) {
        (Some(provider), Some(id)) => Some(format!("{provider}/{id}")),
        (_, Some(id)) => Some(id.to_string()),
        _ => None,
    };
    descriptor.current_config.thinking = snapshot.thinking_level.clone();
}

fn models_from_data(data: &Value) -> Vec<AgentModel> {
    let Some(models) = data.get("models").and_then(Value::as_array) else {
        return Vec::new();
    };
    models
        .iter()
        .filter_map(|model| {
            let id = model.get("id").and_then(Value::as_str)?;
            let provider = model.get("provider").and_then(Value::as_str);
            let name = model.get("name").and_then(Value::as_str).unwrap_or(id);
            let catalog_id = match provider {
                Some(provider) if !provider.is_empty() => format!("{provider}/{id}"),
                _ => id.to_string(),
            };
            Some(AgentModel {
                id: catalog_id,
                label: name.to_string(),
                group: provider.map(str::to_string),
                is_default: false,
                thinking: None,
            })
        })
        .collect()
}

fn thinking_from_data(data: &Value) -> AgentThinkingSupport {
    let levels: Vec<String> = data
        .get("levels")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if levels.iter().any(|level| level != "off") {
        AgentThinkingSupport::Enum {
            arg: None,
            options: levels,
        }
    } else {
        AgentThinkingSupport::None
    }
}

async fn open_pi_runtime(
    stdin: Box<dyn AsyncWrite + Unpin + Send>,
    stdout: impl AsyncRead + Unpin + Send + 'static,
    child: Option<Child>,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let transport = Arc::new(PiTransport::new(stdin));
    let (event_tx, event_rx) = mpsc::unbounded_channel();
    tokio::spawn(read_loop(stdout, transport.clone(), event_tx));
    let mut descriptor = provider_descriptor(AgentCurrentConfig {
        model: cfg.model.clone(),
        thinking: cfg.thinking.clone(),
        mode: None,
        ..AgentCurrentConfig::default()
    });
    let child = Arc::new(Mutex::new(child));
    let handle = match handshake(&transport, &mut descriptor, resume.as_deref(), &cfg).await {
        Ok(handle) => handle,
        Err(error) => {
            transport.shutdown_writer().await;
            if let Some(mut child) = child.lock().await.take() {
                let _ = child.kill().await;
            }
            return Err(error);
        }
    };
    let persistence = Some(handle.clone());
    let mut map = EventMapState::new();
    map.queue_session_started(Some(handle.as_str().to_string()));
    let commands = Arc::new(PiCommands {
        transport,
        running_turn: Mutex::new(None),
        pending_ui: Mutex::new(HashMap::new()),
        descriptor: Mutex::new(descriptor),
        persistence: Mutex::new(persistence),
        child,
    });
    Ok(Box::new(PiRuntime {
        commands,
        events: event_rx,
        map,
        closed_emitted: false,
    }))
}

#[async_trait]
impl AgentProvider for PiNativeProvider {
    fn id(&self) -> &str {
        "pi"
    }

    async fn descriptor(&self, _ctx: &AgentOptionsContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        let spawned = spawn_chat(&self.program, &cfg, self.env.as_ref())?;
        tokio::spawn(drain_stderr(spawned.stderr));
        open_pi_runtime(
            Box::new(spawned.stdin),
            spawned.stdout,
            Some(spawned.child),
            cfg,
            None,
        )
        .await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        let spawned = spawn_chat(&self.program, &cfg, self.env.as_ref())?;
        tokio::spawn(drain_stderr(spawned.stderr));
        open_pi_runtime(
            Box::new(spawned.stdin),
            spawned.stdout,
            Some(spawned.child),
            cfg,
            Some(handle.0),
        )
        .await
    }
}

fn confirm_allowed(option_id: &str) -> bool {
    matches!(
        option_id.to_ascii_lowercase().as_str(),
        "allow" | "true" | "yes" | "confirmed"
    )
}

fn is_cancel_option(option_id: &str) -> bool {
    matches!(
        option_id.to_ascii_lowercase().as_str(),
        "deny" | "false" | "no" | "cancel" | "cancelled" | "canceled"
    )
}

fn load_images(paths: &[String]) -> Vec<Value> {
    let mut images = Vec::new();
    for path in paths {
        let ext = Path::new(path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => continue,
        };
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        images.push(json!({
            "type": "image",
            "data": base64_encode(&bytes),
            "mimeType": mime,
        }));
    }
    images
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let n = ((bytes[index] as u32) << 16)
            | ((bytes[index + 1] as u32) << 8)
            | (bytes[index + 2] as u32);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        index += 3;
    }
    match bytes.len() - index {
        1 => {
            let n = (bytes[index] as u32) << 16;
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push('=');
            out.push('=');
        }
        2 => {
            let n = ((bytes[index] as u32) << 16) | ((bytes[index + 1] as u32) << 8);
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
            out.push('=');
        }
        _ => {}
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentEvent;
    use crate::contract::Capability;
    use crate::contract::{AgentAction, SessionOpKind};
    use crate::models::AgentLaunchSpec;
    use std::time::Duration;
    use tokio::io::{duplex, AsyncWriteExt};

    #[derive(Clone)]
    struct MockOpts {
        switch_cancelled: bool,
        emit_confirm: bool,
        session_file: String,
    }

    impl Default for MockOpts {
        fn default() -> Self {
            Self {
                switch_cancelled: false,
                emit_confirm: false,
                session_file: "/tmp/pi-agent/sessions/abc.jsonl".into(),
            }
        }
    }

    fn events_only(jsonl: &str) -> Vec<Value> {
        codec::parse_jsonl(jsonl)
            .into_iter()
            .filter(|frame| frame.get("type").and_then(Value::as_str) != Some("response"))
            .collect()
    }

    async fn run_mock_pi(
        reader: impl AsyncRead + Unpin,
        mut writer: impl AsyncWrite + Unpin,
        received: Arc<Mutex<Vec<Value>>>,
        opts: MockOpts,
    ) {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        let mut session_file = opts.session_file.clone();
        loop {
            buf.clear();
            match tokio::time::timeout(Duration::from_secs(5), reader.read_until(b'\n', &mut buf))
                .await
            {
                Ok(Ok(0)) | Err(_) => break,
                Ok(Err(_)) => break,
                Ok(Ok(_)) => {}
            }
            let Some(record) = codec::trim_record(&buf) else {
                continue;
            };
            let Ok(command) = serde_json::from_slice::<Value>(record) else {
                continue;
            };
            received.lock().await.push(command.clone());
            let ty = command.get("type").and_then(Value::as_str).unwrap_or("");
            let id = command.get("id").cloned().unwrap_or(Value::Null);
            let reply = match ty {
                "get_state" => json!({
                    "id": id,
                    "type": "response",
                    "command": "get_state",
                    "success": true,
                    "data": {
                        "model": {
                            "id": "claude-sonnet-4-20250514",
                            "provider": "anthropic",
                            "name": "Claude Sonnet 4"
                        },
                        "thinkingLevel": "medium",
                        "isStreaming": false,
                        "isCompacting": false,
                        "steeringMode": "one-at-a-time",
                        "followUpMode": "one-at-a-time",
                        "sessionFile": session_file,
                        "sessionId": "abc123",
                        "autoCompactionEnabled": true,
                        "messageCount": 0,
                        "pendingMessageCount": 0
                    }
                }),
                "get_available_models" => json!({
                    "id": id,
                    "type": "response",
                    "command": "get_available_models",
                    "success": true,
                    "data": {
                        "models": [{
                            "id": "claude-sonnet-4-20250514",
                            "provider": "anthropic",
                            "name": "Claude Sonnet 4"
                        }]
                    }
                }),
                "get_available_thinking_levels" => json!({
                    "id": id,
                    "type": "response",
                    "command": "get_available_thinking_levels",
                    "success": true,
                    "data": { "levels": ["off", "minimal", "low", "medium", "high"] }
                }),
                "get_commands" => json!({
                    "id": id,
                    "type": "response",
                    "command": "get_commands",
                    "success": true,
                    "data": {
                        "commands": [{
                            "name": "skill:find-skills",
                            "description": "Find skills",
                            "source": "skill"
                        }]
                    }
                }),
                "switch_session" => {
                    if let Some(path) = command.get("sessionPath").and_then(Value::as_str) {
                        session_file = path.to_string();
                    }
                    json!({
                        "id": id,
                        "type": "response",
                        "command": "switch_session",
                        "success": true,
                        "data": { "cancelled": opts.switch_cancelled }
                    })
                }
                "prompt" => json!({
                    "id": id,
                    "type": "response",
                    "command": "prompt",
                    "success": true
                }),
                "steer" => json!({
                    "id": id,
                    "type": "response",
                    "command": "steer",
                    "success": true
                }),
                "abort" => json!({
                    "id": id,
                    "type": "response",
                    "command": "abort",
                    "success": true
                }),
                "get_fork_messages" => json!({
                    "id": id,
                    "type": "response",
                    "command": "get_fork_messages",
                    "success": true,
                    "data": { "messages": [{ "entryId": "ent_1", "text": "hello there" }] }
                }),
                "clone" | "fork" => {
                    session_file = "/tmp/pi-agent/sessions/fork.jsonl".into();
                    json!({
                        "id": id,
                        "type": "response",
                        "command": ty,
                        "success": true,
                        "data": { "cancelled": false }
                    })
                }
                "set_model" => json!({
                    "id": id,
                    "type": "response",
                    "command": "set_model",
                    "success": true,
                    "data": {
                        "id": command.get("modelId").cloned().unwrap_or(json!("")),
                        "provider": command.get("provider").cloned().unwrap_or(json!(""))
                    }
                }),
                "set_thinking_level" => json!({
                    "id": id,
                    "type": "response",
                    "command": "set_thinking_level",
                    "success": true
                }),
                "extension_ui_response" => continue,
                _ => continue,
            };
            if let Ok(bytes) = codec::encode_line(&reply) {
                if writer.write_all(&bytes).await.is_err() {
                    break;
                }
            }
            let extra: Vec<Value> = match ty {
                "prompt" => {
                    let mut frames = Vec::new();
                    if opts.emit_confirm {
                        frames.extend(codec::parse_jsonl(include_str!(
                            "testdata/extension-ui-confirm.jsonl"
                        )));
                    }
                    frames.extend(events_only(include_str!("testdata/prompt-turn.jsonl")));
                    frames
                }
                "steer" => events_only(include_str!("testdata/steer.jsonl")),
                "abort" => events_only(include_str!("testdata/abort.jsonl")),
                _ => Vec::new(),
            };
            for frame in extra {
                if let Ok(bytes) = codec::encode_line(&frame) {
                    if writer.write_all(&bytes).await.is_err() {
                        return;
                    }
                }
            }
            let _ = writer.flush().await;
        }
    }

    async fn connect(
        resume: Option<String>,
        opts: MockOpts,
    ) -> AgentResult<(Box<dyn AgentRuntime>, Arc<Mutex<Vec<Value>>>)> {
        let (mock_read, rt_write) = duplex(64 * 1024);
        let (rt_read, mock_write) = duplex(64 * 1024);
        let received = Arc::new(Mutex::new(Vec::new()));
        let rec = received.clone();
        let mock_opts = opts.clone();
        tokio::spawn(async move {
            run_mock_pi(mock_read, mock_write, rec, mock_opts).await;
        });
        let runtime = open_pi_runtime(
            Box::new(rt_write),
            rt_read,
            None,
            AgentRuntimeConfig::default(),
            resume,
        )
        .await?;
        Ok((runtime, received))
    }

    fn types_of(received: &[Value]) -> Vec<String> {
        received
            .iter()
            .filter_map(|value| {
                value
                    .get("type")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect()
    }

    #[tokio::test]
    async fn handshake_sets_session_file_without_switch() {
        let (mut runtime, received) = connect(None, MockOpts::default()).await.expect("connect");
        let started = runtime.next_event().await.expect("session started");
        assert!(matches!(
            started.payload,
            AgentEvent::SessionStarted {
                persistence_handle: Some(ref path)
            } if path == "/tmp/pi-agent/sessions/abc.jsonl"
        ));
        assert_eq!(
            runtime.persistence_handle().unwrap().as_str(),
            "/tmp/pi-agent/sessions/abc.jsonl"
        );
        let descriptor = runtime.descriptor();
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
        assert!(!descriptor.supported_options.models.is_empty());
        let types = types_of(&received.lock().await);
        assert_eq!(types[0], "get_state");
        assert_eq!(types[1], "get_available_models");
        assert_eq!(types[2], "get_available_thinking_levels");
        assert!(!types.contains(&"switch_session".into()));
        assert!(!types.contains(&"follow_up".into()));
        runtime.control().close().await.unwrap();
    }

    #[tokio::test]
    async fn resume_switch_session_and_cancelled_fails() {
        let (runtime, received) = connect(
            Some("/tmp/pi-agent/sessions/abc.jsonl".into()),
            MockOpts::default(),
        )
        .await
        .expect("resume");
        let types = types_of(&received.lock().await);
        assert!(types.contains(&"switch_session".into()));
        drop(runtime);

        let error = connect(
            Some("/tmp/pi-agent/sessions/abc.jsonl".into()),
            MockOpts {
                switch_cancelled: true,
                ..MockOpts::default()
            },
        )
        .await
        .err()
        .expect("cancelled resume");
        assert!(error.to_string().contains("cancelled"));
    }

    #[tokio::test]
    async fn send_steer_abort_use_official_commands() {
        let (mut runtime, received) = connect(None, MockOpts::default()).await.expect("connect");
        let _ = runtime.next_event().await;
        let handle = runtime
            .control()
            .send(AgentPrompt {
                text: "list files".into(),
                turn_id: Some("atmos-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        assert_eq!(handle.turn_id, "atmos-1");
        runtime
            .control()
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "only src/".into(),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect("steer");
        runtime.control().cancel().await.expect("cancel");
        let types = types_of(&received.lock().await);
        assert!(types.contains(&"prompt".into()));
        assert!(types.contains(&"steer".into()));
        assert!(types.contains(&"abort".into()));
        assert!(!types.contains(&"clear_queue".into()));
        assert!(!types.contains(&"follow_up".into()));
        assert!(!types.contains(&"bash".into()));
        assert!(!types.contains(&"new_session".into()));
        let prompt = received
            .lock()
            .await
            .iter()
            .find(|value| value["type"] == "prompt")
            .cloned()
            .unwrap();
        assert!(prompt.get("streamingBehavior").is_none());
        assert!(prompt.get("jsonrpc").is_none());
        runtime.control().close().await.unwrap();
    }

    #[tokio::test]
    async fn send_while_streaming_errors() {
        let (runtime, _) = connect(None, MockOpts::default()).await.expect("connect");
        runtime
            .control()
            .send(AgentPrompt {
                text: "one".into(),
                turn_id: Some("t1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("first");
        let error = runtime
            .control()
            .send(AgentPrompt {
                text: "two".into(),
                ..AgentPrompt::default()
            })
            .await
            .expect_err("second");
        assert!(error.to_string().contains("streaming"));
        runtime.control().close().await.unwrap();
    }

    #[tokio::test]
    async fn permission_confirm_writes_extension_ui_response() {
        let (mut runtime, received) = connect(
            None,
            MockOpts {
                emit_confirm: true,
                ..MockOpts::default()
            },
        )
        .await
        .expect("connect");
        let _ = runtime.next_event().await;
        runtime
            .control()
            .send(AgentPrompt {
                text: "ls".into(),
                turn_id: Some("t1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let mut found = false;
        for _ in 0..20 {
            let Some(event) = runtime.next_event().await else {
                break;
            };
            if let AgentEvent::PermissionRequested { request } = event.payload {
                assert_eq!(request.request_id, "uuid-2");
                runtime
                    .control()
                    .action(AgentAction::RespondPermission {
                        request_id: request.request_id,
                        option_id: "allow".into(),
                    })
                    .await
                    .expect("respond");
                found = true;
                break;
            }
        }
        assert!(found, "expected PermissionRequested");
        let reply = {
            let mut reply = None;
            for _ in 0..50 {
                reply = received
                    .lock()
                    .await
                    .iter()
                    .find(|value| value["type"] == "extension_ui_response")
                    .cloned();
                if reply.is_some() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            reply.expect("ui response")
        };
        assert_eq!(reply["id"], "uuid-2");
        assert_eq!(reply["confirmed"], true);
        runtime.control().close().await.unwrap();
    }

    #[tokio::test]
    async fn set_model_splits_catalog_id() {
        let (runtime, received) = connect(None, MockOpts::default()).await.expect("connect");
        runtime
            .control()
            .action(AgentAction::SetConfig {
                update: Box::new(crate::contract::AgentRuntimeConfigUpdate {
                    model: Some("anthropic/claude-sonnet-4-20250514".into()),
                    ..crate::contract::AgentRuntimeConfigUpdate::default()
                }),
            })
            .await
            .expect("set model");
        let set = received
            .lock()
            .await
            .iter()
            .find(|value| value["type"] == "set_model")
            .cloned()
            .expect("set_model");
        assert_eq!(set["provider"], "anthropic");
        assert_eq!(set["modelId"], "claude-sonnet-4-20250514");
        runtime.control().close().await.unwrap();
    }

    #[tokio::test]
    async fn close_yields_session_closed() {
        let (mut runtime, _) = connect(None, MockOpts::default()).await.expect("connect");
        let _ = runtime.next_event().await;
        runtime.control().close().await.unwrap();
        let mut saw_closed = false;
        for _ in 0..8 {
            match runtime.next_event().await {
                Some(event) if matches!(event.payload, AgentEvent::SessionClosed) => {
                    saw_closed = true;
                    break;
                }
                Some(_) => continue,
                None => break,
            }
        }
        assert!(saw_closed);
        assert!(runtime.next_event().await.is_none());
    }

    #[tokio::test]
    async fn provider_descriptor_is_honest() {
        let provider = PiNativeProvider::new();
        let descriptor = provider
            .descriptor(&AgentOptionsContext::default())
            .await
            .unwrap();
        assert_eq!(descriptor.identity.id, "pi");
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        let spec = AgentLaunchSpec {
            program: "/usr/local/bin/pi".into(),
            args: vec!["-p".into()],
            env: None,
        };
        let from_spec = PiNativeProvider::from_launch_spec(&spec);
        assert_eq!(from_spec.program(), "/usr/local/bin/pi");
        assert_eq!(PiNativeProvider::chat_argv(None), vec!["--mode", "rpc"]);
    }

    #[test]
    fn command_encoder_rejects_jsonrpc_shape() {
        let prompt = rpc::cmd_prompt("Hello", &[]);
        let encoded = codec::encode_line(&prompt).unwrap();
        let text = String::from_utf8(encoded).unwrap();
        assert!(!text.contains("\"jsonrpc\""));
        assert!(!text.contains("\"method\""));
        let fake = json!({"jsonrpc":"2.0","method":"prompt","id":"1"});
        assert_ne!(fake.get("type").and_then(Value::as_str), Some("prompt"));
    }

    #[tokio::test]
    async fn fork_clone_detaches_parent_process() {
        let (mut runtime, received) = connect(None, MockOpts::default()).await.expect("connect");
        let _ = runtime.next_event().await;
        let parent = runtime
            .persistence_handle()
            .expect("parent")
            .as_str()
            .to_string();
        let forked = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "fork".into(),
                target: None,
            })
            .await
            .expect("fork");
        assert_eq!(
            forked.new_session_id.as_deref(),
            Some("/tmp/pi-agent/sessions/fork.jsonl")
        );
        assert_eq!(
            runtime.persistence_handle().as_ref().map(|h| h.as_str()),
            Some(parent.as_str())
        );
        let types = types_of(&received.lock().await);
        assert!(types.iter().any(|ty| ty == "get_fork_messages"));
        assert!(types.iter().any(|ty| ty == "clone"));
        assert!(types.iter().any(|ty| ty == "switch_session"));
        assert!(!types.iter().any(|ty| ty == "rewind"));
    }

    #[tokio::test]
    async fn app069_prepare_fork_lists_vendor_entries() {
        let (mut runtime, _received) = connect(None, MockOpts::default()).await.expect("connect");
        let _ = runtime.next_event().await;
        let prepared = runtime
            .control()
            .action(AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Fork,
                rest: String::new(),
            })
            .await
            .expect("prepare");
        let ids: Vec<_> = prepared
            .options
            .iter()
            .map(|option| option.option_id.as_str())
            .collect();
        assert!(ids.contains(&"fork"));
        assert!(ids.iter().any(|id| id.starts_with("fork_entry:")));
    }

    #[tokio::test]
    async fn app069_fork_entry_sends_cmd_fork() {
        let (mut runtime, received) = connect(None, MockOpts::default()).await.expect("connect");
        let _ = runtime.next_event().await;
        let forked = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "fork_entry:ent_1".into(),
                target: None,
            })
            .await
            .expect("fork entry");
        assert_eq!(
            forked.new_session_id.as_deref(),
            Some("/tmp/pi-agent/sessions/fork.jsonl")
        );
        let frames = received.lock().await.clone();
        let types = types_of(&frames);
        assert!(types.iter().any(|ty| ty == "fork"));
        assert!(!types.iter().any(|ty| ty == "clone"));
        assert!(frames.iter().any(|frame| {
            frame.get("type").and_then(Value::as_str) == Some("fork")
                && frame.get("entryId").and_then(Value::as_str) == Some("ent_1")
        }));
    }
}
