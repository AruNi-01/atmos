//! Native Claude Code Chat adapter (stream-json + control, no `--print`).

pub(crate) mod catalog;
mod codec;
mod event_map;
mod rpc;
mod spawn;
mod tool_map;

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::timeout;

use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{
    AgentCatalogContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentRuntimeControl, AgentTurnHandle,
};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use event_map::{map_frame, EventMapState, MappedFrame};
use rpc::{
    apply_flag_settings_request, control_response_error, control_response_is_error,
    control_response_payload, control_response_request_id, deny_control_response,
    error_control_response, initialize_request, interrupt_request, next_request_id,
    pending_from_can_use_tool, permission_control_response, rewind_conversation_request,
    rewind_conversation_steps, rewind_conversation_succeeded, rewind_files_has_changes,
    rewind_files_request, set_max_thinking_tokens_request, set_model_request,
    set_permission_mode_request, user_message, user_prompt_uuid, PendingPermission,
};
use spawn::{spawn_claude, SpawnedClaude};

const INIT_TIMEOUT: Duration = Duration::from_secs(60);
const CONTROL_TIMEOUT: Duration = Duration::from_secs(60);
const EFFORT_LEVELS: &[&str] = &["low", "medium", "high", "xhigh", "max"];

pub struct ClaudeNativeProvider {
    program: PathBuf,
}

impl ClaudeNativeProvider {
    pub fn new() -> Self {
        Self {
            program: PathBuf::from("claude"),
        }
    }

    pub fn with_program(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
        }
    }
}

impl Default for ClaudeNativeProvider {
    fn default() -> Self {
        Self::new()
    }
}

struct ClaudeCommands {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<tokio::process::Child>>,
    running_turn: Mutex<Option<String>>,
    pending_controls: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
    pending_permissions: Mutex<HashMap<String, PendingPermission>>,
    extra_events: Mutex<VecDeque<AgentEventEnvelope>>,
    request_n: AtomicU64,
    session_id: Mutex<Option<String>>,
    current_config: Mutex<AgentCurrentConfig>,
    closed: AtomicBool,
    cancel_requested: AtomicBool,
    program: PathBuf,
    runtime_cfg: AgentRuntimeConfig,
    user_uuids: Mutex<Vec<String>>,
    turn_to_uuid: Mutex<HashMap<String, String>>,
    pending_user_turn: Mutex<Option<String>>,
}

struct ClaudeRuntime {
    commands: Arc<ClaudeCommands>,
    map: EventMapState,
    frames: mpsc::UnboundedReceiver<Option<Value>>,
    closed_emitted: bool,
}

#[async_trait]
impl AgentRuntimeCommands for ClaudeCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(AgentProviderError::message("session closed"));
        }
        let mut running = self.running_turn.lock().await;
        if running.is_some() {
            return Err(AgentProviderError::message("turn in flight"));
        }
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let session_id = self.session_id.lock().await.clone();
        let attachments = attachment_blocks(&input.attachments);
        let frame = user_message(&input.text, session_id.as_deref(), &attachments);
        self.write_json(&frame).await?;
        *self.pending_user_turn.lock().await = Some(turn_id.clone());
        *running = Some(turn_id.clone());
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.cancel_requested.store(true, Ordering::SeqCst);
        self.deny_pending_permissions().await;
        let request_id = self.alloc_request_id();
        let _ = self
            .write_control(interrupt_request(&request_id), &request_id, CONTROL_TIMEOUT)
            .await;
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.closed.store(true, Ordering::SeqCst);
        self.deny_pending_permissions().await;
        {
            let mut stdin = self.stdin.lock().await;
            *stdin = None;
        }
        if let Some(mut child) = self.child.lock().await.take() {
            if timeout(Duration::from_secs(2), child.wait()).await.is_err() {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
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
                .set_config(update)
                .await
                .map(|()| AgentActionResult::unit()),
            AgentAction::PrepareSessionOp { kind, rest } => {
                self.prepare_session_op(kind, &rest).await
            }
            AgentAction::RespondSessionOp {
                option_id, target, ..
            } => self.respond_session_op(option_id, target).await,
        }
    }
}

impl ClaudeCommands {
    async fn steer(&self, input: AgentPrompt) -> Result<(), AgentActionError> {
        let current = self
            .running_turn
            .lock()
            .await
            .clone()
            .ok_or(AgentActionError::SteerTurnMismatch)?;
        if let Some(expected) = input.turn_id.as_deref().filter(|id| !id.is_empty()) {
            if expected != current {
                return Err(AgentActionError::SteerTurnMismatch);
            }
        }
        let session_id = self.session_id.lock().await.clone();
        let attachments = attachment_blocks(&input.attachments);
        let frame = user_message(&input.text, session_id.as_deref(), &attachments);
        self.write_json(&frame)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        Ok(())
    }

    fn alloc_request_id(&self) -> String {
        let n = self.request_n.fetch_add(1, Ordering::SeqCst) + 1;
        let hex = uuid::Uuid::new_v4().simple().to_string();
        next_request_id(n, &hex[..8])
    }

    async fn write_json(&self, value: &Value) -> AgentResult<()> {
        let mut line = serde_json::to_vec(value)
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        line.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        let Some(stdin) = stdin.as_mut() else {
            return Err(AgentProviderError::message("claude stdin closed"));
        };
        stdin
            .write_all(&line)
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        stdin
            .flush()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        Ok(())
    }

    async fn write_control(
        &self,
        frame: Value,
        request_id: &str,
        wait: Duration,
    ) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        self.pending_controls
            .lock()
            .await
            .insert(request_id.to_string(), tx);
        self.write_json(&frame)
            .await
            .map_err(|error| error.to_string())?;
        match timeout(wait, rx).await {
            Ok(Ok(Ok(payload))) => Ok(payload),
            Ok(Ok(Err(error))) => Err(error),
            Ok(Err(_)) => Err("control response dropped".into()),
            Err(_) => {
                self.pending_controls.lock().await.remove(request_id);
                Err("control request timed out".into())
            }
        }
    }

    async fn deny_pending_permissions(&self) {
        let pending: Vec<PendingPermission> = self
            .pending_permissions
            .lock()
            .await
            .drain()
            .map(|(_, pending)| pending)
            .collect();
        for pending in pending {
            let frame = deny_control_response(&pending.request_id, "User denied");
            let _ = self.write_json(&frame).await;
        }
    }

    async fn respond_permission(
        &self,
        request_id: String,
        option_id: String,
    ) -> Result<(), AgentActionError> {
        let pending = self
            .pending_permissions
            .lock()
            .await
            .remove(&request_id)
            .ok_or_else(|| AgentActionError::NotFound(request_id.clone()))?;
        let frame = permission_control_response(&pending, &option_id);
        self.write_json(&frame)
            .await
            .map_err(|_| AgentActionError::Unsupported {
                action: AgentActionKind::RespondPermission,
            })?;
        // WS `permission_resolved` is emitted by AgentChatService::permission_respond.
        Ok(())
    }

    async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> Result<(), AgentActionError> {
        let unsupported = || AgentActionError::Unsupported {
            action: AgentActionKind::SetConfig,
        };
        if let Some(model) = update.model {
            let request_id = self.alloc_request_id();
            let model = if model.is_empty() { None } else { Some(model) };
            self.write_control(
                set_model_request(&request_id, model.as_deref()),
                &request_id,
                CONTROL_TIMEOUT,
            )
            .await
            .map_err(|_| unsupported())?;
            self.current_config.lock().await.model = model;
        }
        if let Some(thinking) = update.thinking {
            let request_id = self.alloc_request_id();
            if EFFORT_LEVELS.iter().any(|level| *level == thinking) {
                self.write_control(
                    apply_flag_settings_request(&request_id, &thinking),
                    &request_id,
                    CONTROL_TIMEOUT,
                )
                .await
                .map_err(|_| unsupported())?;
            } else if let Ok(tokens) = thinking.parse::<i64>() {
                self.write_control(
                    set_max_thinking_tokens_request(&request_id, Some(tokens)),
                    &request_id,
                    CONTROL_TIMEOUT,
                )
                .await
                .map_err(|_| unsupported())?;
            } else {
                return Err(unsupported());
            }
            self.current_config.lock().await.thinking = Some(thinking);
        }
        if update.mode.is_some() || update.permission_mode.is_some() {
            {
                let mut current = self.current_config.lock().await;
                if let Some(mode) = update.mode {
                    current.mode = Some(mode);
                }
                if let Some(permission_mode) = update.permission_mode {
                    current.permission_mode =
                        crate::policy::normalize_stored_permission(&permission_mode)
                            .or(Some(permission_mode));
                }
            }
            let (mode, permission) = {
                let current = self.current_config.lock().await;
                (current.mode.clone(), current.permission_mode.clone())
            };
            if let Some(vendor) = crate::policy::vendor_permission_for_spawn(
                "claude",
                mode.as_deref(),
                permission.as_deref(),
            ) {
                let request_id = self.alloc_request_id();
                self.write_control(
                    set_permission_mode_request(&request_id, &vendor),
                    &request_id,
                    CONTROL_TIMEOUT,
                )
                .await
                .map_err(|_| unsupported())?;
            }
        }
        let config =
            serde_json::to_value(&*self.current_config.lock().await).unwrap_or(Value::Null);
        self.extra_events
            .lock()
            .await
            .push_back(AgentEventEnvelope::new(
                self.running_turn.lock().await.clone(),
                AgentEvent::ConfigChanged { config },
            ));
        Ok(())
    }

    async fn respond_session_op(
        &self,
        option_id: String,
        target: Option<String>,
    ) -> Result<AgentActionResult, AgentActionError> {
        match option_id.as_str() {
            "fork" | "fork_no_worktree" | "fork_worktree" => self.fork_session().await,
            "rewind_conversation" => {
                self.rewind_conversation(target.as_deref()).await?;
                Ok(AgentActionResult::unit())
            }
            "rewind_code" => {
                self.rewind_files(target.as_deref()).await?;
                Ok(AgentActionResult::unit())
            }
            "rewind_both" => {
                self.rewind_files(target.as_deref()).await?;
                self.rewind_conversation(target.as_deref()).await?;
                Ok(AgentActionResult::unit())
            }
            "rewind" => {
                self.rewind_conversation(target.as_deref()).await?;
                Ok(AgentActionResult::unit())
            }
            other => Err(AgentActionError::NotFound(other.to_string())),
        }
    }

    async fn prepare_session_op(
        &self,
        kind: crate::contract::SessionOpKind,
        rest: &str,
    ) -> Result<AgentActionResult, AgentActionError> {
        if kind != crate::contract::SessionOpKind::Rewind || rest.trim().is_empty() {
            return Err(AgentActionError::Unsupported {
                action: AgentActionKind::PrepareSessionOp,
            });
        }
        let checkpoint = self.resolve_checkpoint(Some(rest)).await?;
        let request_id = self.alloc_request_id();
        let preview = self
            .write_control(
                rewind_files_request(&request_id, &checkpoint, true),
                &request_id,
                CONTROL_TIMEOUT,
            )
            .await
            .map_err(AgentActionError::NotFound)?;
        Ok(AgentActionResult::rewind_preview(rewind_files_has_changes(
            &preview,
        )))
    }

    async fn resolve_checkpoint(&self, target: Option<&str>) -> Result<String, AgentActionError> {
        let Some(token) = target.filter(|value| !value.is_empty()) else {
            return Err(AgentActionError::NotFound("rewind target".into()));
        };
        if let Some(uuid) = self.turn_to_uuid.lock().await.get(token).cloned() {
            return Ok(uuid);
        }
        let uuids = self.user_uuids.lock().await;
        if uuids.iter().any(|id| id == token) {
            return Ok(token.to_string());
        }
        Err(AgentActionError::NotFound(token.to_string()))
    }

    async fn rewind_conversation(&self, target: Option<&str>) -> Result<(), AgentActionError> {
        let checkpoint = self.resolve_checkpoint(target).await?;
        let ordered = self.user_uuids.lock().await.clone();
        let steps =
            rewind_conversation_steps(&ordered, &checkpoint).map_err(AgentActionError::NotFound)?;
        for uuid in steps {
            let request_id = self.alloc_request_id();
            let payload = self
                .write_control(
                    rewind_conversation_request(&request_id, &uuid),
                    &request_id,
                    CONTROL_TIMEOUT,
                )
                .await
                .map_err(AgentActionError::NotFound)?;
            if !rewind_conversation_succeeded(&payload) {
                return Err(AgentActionError::NotFound(
                    "rewind_conversation missing rewound".into(),
                ));
            }
            let mut uuids = self.user_uuids.lock().await;
            if let Some(index) = uuids.iter().position(|id| id == &uuid) {
                uuids.truncate(index + 1);
            }
        }
        Ok(())
    }

    async fn rewind_files(&self, target: Option<&str>) -> Result<(), AgentActionError> {
        let checkpoint = self.resolve_checkpoint(target).await?;
        let request_id = self.alloc_request_id();
        let preview = self
            .write_control(
                rewind_files_request(&request_id, &checkpoint, true),
                &request_id,
                CONTROL_TIMEOUT,
            )
            .await
            .map_err(AgentActionError::NotFound)?;
        if !rewind_files_has_changes(&preview) {
            return Ok(());
        }
        let request_id = self.alloc_request_id();
        self.write_control(
            rewind_files_request(&request_id, &checkpoint, false),
            &request_id,
            CONTROL_TIMEOUT,
        )
        .await
        .map_err(AgentActionError::NotFound)?;
        Ok(())
    }

    async fn fork_session(&self) -> Result<AgentActionResult, AgentActionError> {
        let parent = self
            .session_id
            .lock()
            .await
            .clone()
            .ok_or_else(|| AgentActionError::NotFound("parent session".into()))?;
        let child_id = spawn_forked_session(&self.program, &self.runtime_cfg, &parent)
            .await
            .map_err(AgentActionError::NotFound)?;
        Ok(AgentActionResult::forked(child_id, None))
    }
}

#[async_trait]
impl AgentRuntime for ClaudeRuntime {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.map.persistence.clone().or_else(|| {
            self.commands
                .session_id
                .try_lock()
                .ok()
                .and_then(|guard| guard.clone().map(AgentPersistenceHandle::new))
        })
    }

    fn descriptor(&self) -> AgentDescriptor {
        let mut descriptor = self.map.descriptor();
        if let Ok(current) = self.commands.current_config.try_lock() {
            descriptor.current_config = current.clone();
        }
        descriptor
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        if let Some(event) = self.commands.extra_events.lock().await.pop_front() {
            note_delivered_event(&self.commands, &mut self.map, &event).await;
            return Some(event);
        }
        if let Some(event) = self.map.pending.pop_front() {
            note_delivered_event(&self.commands, &mut self.map, &event).await;
            return Some(event);
        }
        loop {
            self.map.cancel_requested = self.commands.cancel_requested.load(Ordering::SeqCst);
            if let Some(session_id) = self.commands.session_id.lock().await.clone() {
                if self.map.persistence.is_none() {
                    self.map.persistence = Some(AgentPersistenceHandle::new(session_id));
                }
            }
            match self.frames.recv().await {
                None | Some(None) => {
                    if !self.closed_emitted {
                        self.closed_emitted = true;
                        return Some(AgentEventEnvelope::new(None, AgentEvent::SessionClosed));
                    }
                    return None;
                }
                Some(Some(frame)) => {
                    if let Some(pending) = pending_from_can_use_tool(&frame) {
                        self.commands
                            .pending_permissions
                            .lock()
                            .await
                            .insert(pending.request_id.clone(), pending);
                    }
                    let turn_id = self.commands.running_turn.lock().await.clone();
                    match map_frame(&mut self.map, turn_id.clone(), &frame) {
                        MappedFrame::Envelope(event) => {
                            note_delivered_event(&self.commands, &mut self.map, &event).await;
                            return Some(event);
                        }
                        MappedFrame::UnmappedControl {
                            request_id,
                            subtype,
                        } => {
                            tracing::debug!(request_id, subtype, "unmapped claude control_request");
                            let _ = self
                                .commands
                                .write_json(&error_control_response(
                                    &request_id,
                                    &format!("unsupported control request subtype: {subtype}"),
                                ))
                                .await;
                        }
                        MappedFrame::Omit => {}
                    }
                    if let Some(event) = self.map.pending.pop_front() {
                        note_delivered_event(&self.commands, &mut self.map, &event).await;
                        return Some(event);
                    }
                }
            }
        }
    }
}

async fn note_delivered_event(
    commands: &ClaudeCommands,
    map: &mut EventMapState,
    event: &AgentEventEnvelope,
) {
    if matches!(
        event.payload,
        AgentEvent::TurnCompleted { .. }
            | AgentEvent::TurnFailed { .. }
            | AgentEvent::TurnCanceled { .. }
    ) {
        *commands.running_turn.lock().await = None;
        commands.cancel_requested.store(false, Ordering::SeqCst);
    }
    if let AgentEvent::SessionStarted {
        persistence_handle: Some(handle),
    } = &event.payload
    {
        *commands.session_id.lock().await = Some(handle.clone());
        map.persistence = Some(AgentPersistenceHandle::new(handle.clone()));
    }
}

fn provider_descriptor(current: AgentCurrentConfig) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: "claude".into(),
            name: "claude".into(),
            version: None,
        },
        capabilities: capabilities_for_provider("claude"),
        support: option_support_for_provider("claude"),
        supported_options: AgentSupportedOptions::default(),
        current_config: current,
    }
}

async fn open_runtime(
    program: &Path,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let current = AgentCurrentConfig {
        model: cfg.model.clone(),
        thinking: cfg.thinking.clone(),
        mode: cfg.mode.clone(),
        permission_mode: cfg
            .permission_mode
            .as_deref()
            .and_then(crate::policy::normalize_stored_permission)
            .or_else(|| cfg.permission_mode.clone()),
    };
    let SpawnedClaude {
        child,
        stdin,
        stdout,
        stderr,
    } = spawn_claude(program, &cfg, resume.as_deref(), false).await?;

    let mut user_uuids = Vec::new();
    let mut turn_to_uuid = HashMap::new();
    for checkpoint in &cfg.checkpoints {
        if checkpoint.checkpoint_id.is_empty() {
            continue;
        }
        if !user_uuids.iter().any(|id| id == &checkpoint.checkpoint_id) {
            user_uuids.push(checkpoint.checkpoint_id.clone());
        }
        if !checkpoint.turn_id.is_empty() {
            turn_to_uuid.insert(checkpoint.turn_id.clone(), checkpoint.checkpoint_id.clone());
        }
    }
    let commands = Arc::new(ClaudeCommands {
        stdin: Mutex::new(Some(stdin)),
        child: Mutex::new(Some(child)),
        running_turn: Mutex::new(None),
        pending_controls: Mutex::new(HashMap::new()),
        pending_permissions: Mutex::new(HashMap::new()),
        extra_events: Mutex::new(VecDeque::new()),
        request_n: AtomicU64::new(0),
        session_id: Mutex::new(resume.clone()),
        current_config: Mutex::new(current.clone()),
        closed: AtomicBool::new(false),
        cancel_requested: AtomicBool::new(false),
        program: program.to_path_buf(),
        runtime_cfg: cfg,
        user_uuids: Mutex::new(user_uuids),
        turn_to_uuid: Mutex::new(turn_to_uuid),
        pending_user_turn: Mutex::new(None),
    });

    spawn_stderr_pump(stderr);
    let (tx, rx) = mpsc::unbounded_channel();
    spawn_stdout_pump(stdout, commands.clone(), tx);

    let request_id = commands.alloc_request_id();
    commands
        .write_control(initialize_request(&request_id), &request_id, INIT_TIMEOUT)
        .await
        .map_err(AgentProviderError::message)?;

    Ok(Box::new(ClaudeRuntime {
        commands,
        map: EventMapState::new(current),
        frames: rx,
        closed_emitted: false,
    }))
}

fn spawn_stderr_pump(stderr: tokio::process::ChildStderr) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = Vec::new();
        loop {
            line.clear();
            match reader.read_until(b'\n', &mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&line);
                    tracing::debug!(target: "agent::claude", stderr = %text.trim_end(), "claude stderr");
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_stdout_pump(
    stdout: tokio::process::ChildStdout,
    commands: Arc<ClaudeCommands>,
    tx: mpsc::UnboundedSender<Option<Value>>,
) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        loop {
            line.clear();
            match reader.read_until(b'\n', &mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    if line.last() == Some(&b'\n') {
                        line.pop();
                    }
                    if line.is_empty() {
                        continue;
                    }
                    let Some(frame) = codec::parse_line(&line) else {
                        tracing::debug!(target: "agent::claude", "skipping invalid claude stdout line");
                        continue;
                    };
                    capture_session_id(&commands, &frame).await;
                    capture_user_checkpoint(&commands, &frame).await;
                    if complete_host_control(&commands, &frame).await {
                        continue;
                    }
                    if tx.send(Some(frame)).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        fail_controls(&commands, "claude stdout closed").await;
        let _ = tx.send(None);
    });
}

async fn capture_session_id(commands: &ClaudeCommands, frame: &Value) {
    if frame.get("type").and_then(Value::as_str) != Some("system") {
        return;
    }
    if frame.get("subtype").and_then(Value::as_str) != Some("init") {
        return;
    }
    if let Some(session_id) = frame.get("session_id").and_then(Value::as_str) {
        if !session_id.is_empty() {
            *commands.session_id.lock().await = Some(session_id.to_string());
        }
    }
}

async fn capture_user_checkpoint(commands: &ClaudeCommands, frame: &Value) {
    let Some(uuid) = user_prompt_uuid(frame) else {
        return;
    };
    {
        let mut uuids = commands.user_uuids.lock().await;
        if !uuids.iter().any(|id| id == uuid) {
            uuids.push(uuid.to_string());
        }
    }
    let turn = commands.pending_user_turn.lock().await.take();
    if let Some(turn) = turn.clone() {
        commands
            .turn_to_uuid
            .lock()
            .await
            .insert(turn, uuid.to_string());
    }
    if let Some(turn_id) = turn {
        commands
            .extra_events
            .lock()
            .await
            .push_back(AgentEventEnvelope::new(
                Some(turn_id.clone()),
                AgentEvent::UserCheckpoint {
                    turn_id,
                    checkpoint_id: uuid.to_string(),
                },
            ));
    }
}

async fn spawn_forked_session(
    program: &Path,
    cfg: &AgentRuntimeConfig,
    parent: &str,
) -> Result<String, String> {
    let spawned = spawn_claude(program, cfg, Some(parent), true)
        .await
        .map_err(|error| error.to_string())?;
    let mut stdout = BufReader::new(spawned.stdout);
    let mut child = spawned.child;
    // Live Claude 2.1.252 `--fork-session` exits on stdin EOF, and may never
    // emit `system/init`. It does emit `SessionStart:fork` hooks with the new
    // `session_id`, then answers the same host `initialize` control the parent
    // Chat session sends. Keep stdin open and drain stderr to avoid pipe deadlock.
    spawn_stderr_pump(spawned.stderr);
    let mut stdin = spawned.stdin;
    let request_id = next_request_id(1, "forkinit");
    let mut init_line =
        serde_json::to_vec(&initialize_request(&request_id)).map_err(|error| error.to_string())?;
    init_line.push(b'\n');
    stdin
        .write_all(&init_line)
        .await
        .map_err(|error| error.to_string())?;
    stdin.flush().await.map_err(|error| error.to_string())?;
    let _stdin = stdin;
    let mut line = Vec::new();
    let mut session_id = None;
    let found = timeout(INIT_TIMEOUT, async {
        loop {
            line.clear();
            match stdout.read_until(b'\n', &mut line).await {
                Ok(0) => return Err("forked claude closed before init".to_string()),
                Ok(_) => {
                    if line.last() == Some(&b'\n') {
                        line.pop();
                    }
                    if line.is_empty() {
                        continue;
                    }
                    let Some(frame) = codec::parse_line(&line) else {
                        continue;
                    };
                    if let Some(id) = frame
                        .get("session_id")
                        .and_then(Value::as_str)
                        .filter(|id| !id.is_empty())
                    {
                        session_id = Some(id.to_string());
                    }
                    let is_init = frame.get("type").and_then(Value::as_str) == Some("system")
                        && frame.get("subtype").and_then(Value::as_str) == Some("init");
                    if is_init {
                        return session_id
                            .clone()
                            .ok_or_else(|| "forked claude init missing session_id".to_string());
                    }
                    if frame.get("type").and_then(Value::as_str) != Some("control_response") {
                        continue;
                    }
                    if control_response_request_id(&frame) != Some(request_id.as_str()) {
                        continue;
                    }
                    if control_response_is_error(&frame) {
                        return Err(control_response_error(&frame)
                            .unwrap_or("forked claude initialize failed")
                            .to_string());
                    }
                    return session_id.clone().ok_or_else(|| {
                        "forked claude initialize succeeded without session_id".to_string()
                    });
                }
                Err(error) => return Err(error.to_string()),
            }
        }
    })
    .await
    .map_err(|_| "forked claude init timed out".to_string())?;
    let _ = child.kill().await;
    let _ = child.wait().await;
    found
}

async fn complete_host_control(commands: &ClaudeCommands, frame: &Value) -> bool {
    if frame.get("type").and_then(Value::as_str) != Some("control_response") {
        return false;
    }
    let Some(request_id) = control_response_request_id(frame) else {
        return true;
    };
    if let Some(tx) = commands.pending_controls.lock().await.remove(request_id) {
        let result = if control_response_is_error(frame) {
            Err(control_response_error(frame)
                .unwrap_or("invalid request format")
                .to_string())
        } else {
            Ok(control_response_payload(frame)
                .cloned()
                .unwrap_or(Value::Null))
        };
        let _ = tx.send(result);
    }
    true
}

async fn fail_controls(commands: &ClaudeCommands, error: &str) {
    let pending: Vec<oneshot::Sender<Result<Value, String>>> = commands
        .pending_controls
        .lock()
        .await
        .drain()
        .map(|(_, tx)| tx)
        .collect();
    for tx in pending {
        let _ = tx.send(Err(error.to_string()));
    }
}

fn attachment_blocks(paths: &[String]) -> Vec<Value> {
    paths
        .iter()
        .map(|path| json!({ "type": "text", "text": path }))
        .collect()
}

#[async_trait]
impl AgentProvider for ClaudeNativeProvider {
    fn id(&self) -> &str {
        "claude"
    }

    async fn descriptor(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        open_runtime(&self.program, cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        open_runtime(&self.program, cfg, Some(handle.0)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::Capability;
    use std::collections::HashMap;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::AtomicUsize;

    const FAKE_CLAUDE: &str = r#"#!/usr/bin/env python3
import json, os, sys

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

if "--help" in sys.argv:
    if os.environ.get("FAKE_CLAUDE_OLD") == "1":
        sys.stdout.write("Usage: claude -p --output-format stream-json\n")
    else:
        sys.stdout.write("Usage: claude\n  --input-format FORMAT\n  --output-format FORMAT\n")
    sys.exit(0)

log = os.environ.get("FAKE_CLAUDE_LOG")
def rec(obj):
    if log:
        with open(log, "a") as f:
            f.write(json.dumps(obj) + "\n")

rec({"argv": sys.argv, "checkpointing": os.environ.get("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING")})
session = "ses_fake_1"
for arg in sys.argv:
    if arg.startswith("--resume="):
        session = arg.split("=", 1)[1]
if "--fork-session" in sys.argv:
    session = "ses_fork_1"
    emit({"type": "system", "subtype": "hook_started", "hook_name": "SessionStart:fork", "session_id": session})
else:
    emit({"type": "system", "subtype": "init", "session_id": session, "cwd": os.getcwd()})

user_n = 0
for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    msg = json.loads(line)
    rec({"stdin": msg})
    if msg.get("type") == "control_request":
        rid = msg.get("request_id")
        req = msg.get("request") or {}
        subtype = req.get("subtype")
        inner = {"commands": [], "models": [], "agents": [], "account": None}
        if subtype == "rewind_files":
            inner = {"canRewind": True, "filesChanged": ["src/lib.rs"]}
        elif subtype == "rewind_conversation":
            inner = {"rewound": True}
        emit({"type": "control_response", "response": {"subtype": "success", "request_id": rid, "response": inner}})
        if subtype == "interrupt":
            emit({"type": "result", "subtype": "error", "is_error": True, "session_id": session})
    elif msg.get("type") == "user":
        user_n += 1
        emit({"type": "user", "uuid": f"uu_user_{user_n}", "session_id": session, "message": msg.get("message")})
        emit({"type": "control_request", "request_id": "req_p", "request": {"subtype": "can_use_tool", "tool_name": "Bash", "input": {"command": "ls"}, "tool_use_id": "tu_1"}})
    elif msg.get("type") == "control_response":
        inner = (msg.get("response") or {}).get("response") or {}
        rec({"permission": inner})
        emit({"type": "assistant", "message": {"id": "msg_1", "role": "assistant", "content": [{"type": "text", "text": "ok"}]}})
        emit({"type": "result", "subtype": "success", "is_error": False, "session_id": session, "total_cost_usd": 0.0, "usage": {"input_tokens": 1, "output_tokens": 1}})
"#;

    struct FakeBin {
        _dir: tempfile::TempDir,
        program: PathBuf,
        log: PathBuf,
    }

    fn write_fake() -> FakeBin {
        let dir = tempfile::tempdir().expect("tempdir");
        let program = dir.path().join("claude");
        std::fs::write(&program, FAKE_CLAUDE).expect("write");
        let mut perms = std::fs::metadata(&program).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&program, perms).unwrap();
        let log = dir.path().join("log.jsonl");
        let _ = std::fs::write(&log, "");
        FakeBin {
            _dir: dir,
            program,
            log,
        }
    }

    fn fake_cfg(fake: &FakeBin, old: bool) -> AgentRuntimeConfig {
        let mut env = HashMap::new();
        env.insert(
            "FAKE_CLAUDE_LOG".into(),
            fake.log.to_string_lossy().into_owned(),
        );
        env.insert("PYTHONUNBUFFERED".into(), "1".into());
        if old {
            env.insert("FAKE_CLAUDE_OLD".into(), "1".into());
        }
        AgentRuntimeConfig {
            cwd: std::env::temp_dir(),
            env_overrides: Some(env),
            ..AgentRuntimeConfig::default()
        }
    }

    fn log_entries(log: &PathBuf) -> Vec<Value> {
        std::fs::read_to_string(log)
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }

    fn user_stdin_count(log: &PathBuf) -> usize {
        log_entries(log)
            .iter()
            .filter(|entry| {
                entry
                    .get("stdin")
                    .and_then(|stdin| stdin.get("type"))
                    .and_then(Value::as_str)
                    == Some("user")
            })
            .count()
    }

    #[tokio::test]
    async fn descriptor_steer_is_supported() {
        let provider = ClaudeNativeProvider::new();
        let descriptor = provider
            .descriptor(&AgentCatalogContext::default())
            .await
            .unwrap();
        assert_eq!(descriptor.identity.id, "claude");
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
    }

    #[tokio::test]
    async fn fake_runtime_handshake_permission_steer_and_turn_inflight() {
        let fake = write_fake();
        let provider = ClaudeNativeProvider::with_program(&fake.program);
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, false))
            .await
            .expect("create_runtime");
        assert_eq!(
            runtime.descriptor().capabilities.steer,
            Capability::Supported
        );
        let started = runtime.next_event().await.expect("init");
        assert!(matches!(
            started.payload,
            AgentEvent::SessionStarted {
                persistence_handle: Some(ref id)
            } if id == "ses_fake_1"
        ));
        assert_eq!(
            runtime.persistence_handle().as_ref().map(|h| h.as_str()),
            Some("ses_fake_1")
        );

        let handle = runtime
            .control()
            .send(AgentPrompt {
                text: "list files".into(),
                turn_id: Some("epoch-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        assert_eq!(handle.turn_id, "epoch-1");

        let permission = runtime.next_event().await.expect("permission");
        assert!(matches!(
            permission.payload,
            AgentEvent::PermissionRequested { ref request }
                if request.request_id == "req_p" && permission.turn_id.as_deref() == Some("epoch-1")
        ));

        let inflight = runtime
            .control()
            .send(AgentPrompt {
                text: "second".into(),
                turn_id: Some("epoch-2".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect_err("turn in flight");
        assert!(inflight.to_string().contains("turn in flight"));

        let steer = runtime
            .control()
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "nudge".into(),
                    turn_id: Some("epoch-1".into()),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect("steer");
        assert_eq!(steer, AgentActionResult::unit());
        for _ in 0..40 {
            if user_stdin_count(&fake.log) >= 2 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        assert_eq!(user_stdin_count(&fake.log), 2);

        runtime
            .control()
            .action(AgentAction::RespondPermission {
                request_id: "req_p".into(),
                option_id: "allow_once".into(),
            })
            .await
            .expect("allow");

        let mut saw_turn = false;
        for _ in 0..12 {
            let Some(event) = runtime.next_event().await else {
                break;
            };
            if let AgentEvent::TurnCompleted { turn_id, .. } = event.payload {
                assert_eq!(turn_id, "epoch-1");
                saw_turn = true;
                break;
            }
        }
        assert!(saw_turn);

        let entries = log_entries(&fake.log);
        let permission_wire = entries
            .iter()
            .find_map(|entry| entry.get("permission").cloned())
            .expect("permission stdin");
        assert_eq!(permission_wire["behavior"], "allow");
        assert!(permission_wire.get("allowed").is_none());
        assert_eq!(permission_wire["updatedInput"], json!({ "command": "ls" }));
        let argv = entries
            .iter()
            .find_map(|entry| entry.get("argv").cloned())
            .expect("argv");
        let argv: Vec<String> = argv
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert!(!argv.iter().any(|arg| arg == "--print" || arg == "-p"));
        assert!(argv.iter().any(|arg| arg == "--input-format"));
        assert!(argv.iter().any(|arg| arg == "--replay-user-messages"));
        assert!(argv.iter().any(|arg| arg == "--permission-prompt-tool"));

        runtime.control().close().await.expect("close");
    }

    #[tokio::test]
    async fn resume_uses_equals_form_on_fake_argv() {
        let fake = write_fake();
        let provider = ClaudeNativeProvider::with_program(&fake.program);
        let mut runtime = provider
            .resume_runtime(
                AgentPersistenceHandle::new("ses_resume"),
                fake_cfg(&fake, false),
            )
            .await
            .expect("resume");
        let _ = runtime.next_event().await;
        let argv = log_entries(&fake.log)
            .iter()
            .find_map(|entry| entry.get("argv").cloned())
            .unwrap();
        let argv: Vec<String> = argv
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert!(argv.iter().any(|arg| arg == "--resume=ses_resume"));
        assert!(!argv.iter().any(|arg| arg == "--resume"));
        runtime.control().close().await.ok();
    }

    #[tokio::test]
    async fn too_old_claude_fails_create_runtime() {
        let fake = write_fake();
        let provider = ClaudeNativeProvider::with_program(&fake.program);
        let error = match provider.create_runtime(fake_cfg(&fake, true)).await {
            Ok(_) => panic!("too old"),
            Err(error) => error,
        };
        assert!(error.to_string().contains("Claude Code too old"));
    }

    #[tokio::test]
    async fn steer_probe_does_not_send() {
        #[derive(Default)]
        struct Probe {
            send: AtomicUsize,
        }
        #[async_trait]
        impl AgentRuntimeCommands for Probe {
            async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
                self.send.fetch_add(1, Ordering::SeqCst);
                Ok(AgentTurnHandle {
                    turn_id: input.turn_id.unwrap_or_default(),
                })
            }
            async fn cancel(&self) -> AgentResult<()> {
                Ok(())
            }
            async fn close(&self) -> AgentResult<()> {
                Ok(())
            }
            async fn action(
                &self,
                action: AgentAction,
            ) -> Result<AgentActionResult, AgentActionError> {
                match action {
                    AgentAction::Steer { .. } => Err(AgentActionError::Unsupported {
                        action: AgentActionKind::Steer,
                    }),
                    _ => Ok(AgentActionResult::unit()),
                }
            }
        }
        let probe = Arc::new(Probe::default());
        let control = AgentRuntimeControl::new(probe.clone());
        let error = control
            .action(AgentAction::Steer {
                input: AgentPrompt::default(),
            })
            .await
            .expect_err("steer");
        assert!(matches!(
            error,
            AgentActionError::Unsupported {
                action: AgentActionKind::Steer
            }
        ));
        assert_eq!(probe.send.load(Ordering::SeqCst), 0);
    }

    async fn drain_until_turn_done(runtime: &mut Box<dyn AgentRuntime>) -> bool {
        let mut saw_checkpoint = false;
        for _ in 0..32 {
            let Some(event) = runtime.next_event().await else {
                panic!("claude runtime closed before turn completed");
            };
            if matches!(event.payload, AgentEvent::UserCheckpoint { .. }) {
                saw_checkpoint = true;
            }
            if matches!(
                event.payload,
                AgentEvent::TurnCompleted { .. }
                    | AgentEvent::TurnFailed { .. }
                    | AgentEvent::TurnCanceled { .. }
            ) {
                return saw_checkpoint;
            }
        }
        panic!("claude turn did not complete");
    }

    async fn await_permission(runtime: &mut Box<dyn AgentRuntime>) -> bool {
        let mut saw_checkpoint = false;
        for _ in 0..16 {
            let event = runtime.next_event().await.expect("permission event");
            if matches!(event.payload, AgentEvent::UserCheckpoint { .. }) {
                saw_checkpoint = true;
            }
            if matches!(event.payload, AgentEvent::PermissionRequested { .. }) {
                return saw_checkpoint;
            }
        }
        panic!("missing permission request");
    }

    #[tokio::test]
    async fn app069_s11_rewind_and_fork_session_ops_are_applied() {
        let fake = write_fake();
        let provider = ClaudeNativeProvider::with_program(&fake.program);
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, false))
            .await
            .expect("create_runtime");
        let _ = runtime.next_event().await;
        let entries = log_entries(&fake.log);
        let checkpointing = entries
            .iter()
            .find_map(|entry| entry.get("checkpointing").and_then(Value::as_str))
            .unwrap_or("");
        assert_eq!(checkpointing, "1");

        runtime
            .control()
            .send(AgentPrompt {
                text: "list files".into(),
                turn_id: Some("epoch-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let mut saw_checkpoint = await_permission(&mut runtime).await;
        runtime
            .control()
            .action(AgentAction::RespondPermission {
                request_id: "req_p".into(),
                option_id: "allow_once".into(),
            })
            .await
            .expect("allow");
        saw_checkpoint |= drain_until_turn_done(&mut runtime).await;
        runtime
            .control()
            .send(AgentPrompt {
                text: "second".into(),
                turn_id: Some("epoch-2".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send2");
        saw_checkpoint |= await_permission(&mut runtime).await;
        runtime
            .control()
            .action(AgentAction::RespondPermission {
                request_id: "req_p".into(),
                option_id: "allow_once".into(),
            })
            .await
            .expect("allow2");
        saw_checkpoint |= drain_until_turn_done(&mut runtime).await;
        assert!(
            saw_checkpoint,
            "user frames must emit UserCheckpoint with vendor uuid"
        );

        runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "rewind_conversation".into(),
                target: Some("epoch-1".into()),
            })
            .await
            .expect("rewind conversation");
        runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op_files".into(),
                option_id: "rewind_code".into(),
                target: Some("epoch-1".into()),
            })
            .await
            .expect("rewind files");

        let parent = runtime
            .persistence_handle()
            .expect("parent")
            .as_str()
            .to_string();
        let forked = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op2".into(),
                option_id: "fork".into(),
                target: None,
            })
            .await
            .expect("fork");
        assert_eq!(forked.new_session_id.as_deref(), Some("ses_fork_1"));
        assert_eq!(
            runtime.persistence_handle().as_ref().map(|h| h.as_str()),
            Some(parent.as_str())
        );

        let stdin = log_entries(&fake.log)
            .iter()
            .filter_map(|entry| entry.get("stdin").cloned())
            .collect::<Vec<_>>();
        assert!(stdin.iter().any(|frame| {
            frame.pointer("/request/subtype").and_then(Value::as_str) == Some("rewind_conversation")
                && frame
                    .pointer("/request/target_message_uuid")
                    .and_then(Value::as_str)
                    == Some("uu_user_1")
        }));
        assert!(stdin.iter().any(|frame| {
            frame.pointer("/request/subtype").and_then(Value::as_str) == Some("rewind_files")
                && frame
                    .pointer("/request/user_message_id")
                    .and_then(Value::as_str)
                    == Some("uu_user_1")
        }));
        assert!(stdin.iter().all(|frame| {
            frame.pointer("/request/subtype").and_then(Value::as_str) != Some("rewind")
        }));
        assert!(stdin.iter().all(|frame| frame.get("summarize").is_none()
            && frame.pointer("/request/summarize").is_none()
            && frame.pointer("/request/subtype").and_then(Value::as_str) != Some("summarize")));
        runtime.control().close().await.ok();
    }
}
