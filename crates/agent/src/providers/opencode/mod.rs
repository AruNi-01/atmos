//! Native OpenCode Chat adapter: one `serve` process per live chat, HTTP/1.1 + SSE.

mod codec;
mod event_map;
mod http;
pub(crate) mod options;
mod rpc;
mod spawn;
mod tool_map;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot, watch, Mutex};

use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::contract::{AgentEvent, AgentEventEnvelope};
use crate::contract::{
    AgentOptionsContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeControl,
    AgentTurnHandle,
};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use event_map::{map_event, EventMapState, MapOut, PendingAsk};
use http::OpenCodeHttp;
use rpc::{
    last_user_message_id, models_from_providers, permission_legacy_body, permission_path,
    permission_response_body, prompt_async_body, prompt_async_body_with_delivery,
    question_answers_body, question_reject_path, question_reply_path, routes_from_doc,
    session_create_body, session_fork_body, session_fork_path, session_id_from_create,
    session_revert_body, session_revert_path, session_unrevert_path, user_message_id_matching,
    OpenApiRoutes,
};
use spawn::{spawn_serve, ServeChild};

pub struct OpenCodeNativeProvider {
    cmd: String,
}

impl Default for OpenCodeNativeProvider {
    fn default() -> Self {
        Self {
            cmd: "opencode".into(),
        }
    }
}

impl OpenCodeNativeProvider {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cmd(cmd: impl Into<String>) -> Self {
        Self { cmd: cmd.into() }
    }
}

struct OpenCodeCommands {
    http: OpenCodeHttp,
    session_id: String,
    routes: OpenApiRoutes,
    child: Mutex<Option<tokio::process::Child>>,
    shutdown: watch::Sender<bool>,
    running_turn: tokio::sync::Mutex<Option<String>>,
    current_config: std::sync::Mutex<AgentCurrentConfig>,
    pending_asks: std::sync::Mutex<HashMap<String, PendingAsk>>,
    advertised_variants: std::sync::Mutex<Vec<String>>,
    turn_to_message: std::sync::Mutex<HashMap<String, String>>,
    cancel_requested: AtomicBool,
    idle_armed: Arc<AtomicBool>,
    sse_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

pub(crate) fn dispatch_opencode_action(action: &AgentAction) -> Result<(), AgentActionError> {
    match action {
        AgentAction::Steer { .. }
        | AgentAction::RespondPermission { .. }
        | AgentAction::SetConfig { .. }
        | AgentAction::RespondSessionOp { .. } => Ok(()),
        AgentAction::PrepareSessionOp { .. } => Err(AgentActionError::Unsupported {
            action: AgentActionKind::PrepareSessionOp,
        }),
    }
}

#[async_trait]
impl AgentRuntimeCommands for OpenCodeCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.cancel_requested.store(false, Ordering::SeqCst);
        self.idle_armed.store(false, Ordering::SeqCst);
        *self.running_turn.lock().await = Some(turn_id.clone());
        let config = self
            .current_config
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let variants = self
            .advertised_variants
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let body = prompt_async_body(&input.text, &input.attachments, &config, &variants);
        let path = format!("/session/{}/prompt_async", self.session_id);
        let status = match self.http.post_no_content(&path, &body).await {
            Ok(status) => status,
            Err(error) => {
                *self.running_turn.lock().await = None;
                return Err(error);
            }
        };
        if !status.is_success() {
            *self.running_turn.lock().await = None;
            return Err(AgentProviderError::message(format!(
                "prompt_async status {status}"
            )));
        }
        self.idle_armed.store(true, Ordering::SeqCst);
        self.bind_last_user_message(&turn_id).await;
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.cancel_requested.store(true, Ordering::SeqCst);
        self.reject_open_questions().await;
        let path = format!("/session/{}/abort", self.session_id);
        let _ = self.http.post_empty(&path).await;
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.cancel_requested.store(true, Ordering::SeqCst);
        self.reject_open_questions().await;
        if self.running_turn.lock().await.is_some() {
            let path = format!("/session/{}/abort", self.session_id);
            let _ = self.http.post_empty(&path).await;
        }
        let _ = self.shutdown.send(true);
        if let Some(task) = self.sse_task.lock().await.take() {
            task.abort();
        }
        let _ = self.http.post_empty("/instance/dispose").await;
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
        }
        Ok(())
    }

    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        dispatch_opencode_action(&action)?;
        match action {
            AgentAction::Steer { input } => {
                self.steer(input).await.map(|()| AgentActionResult::unit())
            }
            AgentAction::SetConfig { update } => {
                let mut config = self
                    .current_config
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                if let Some(model) = update.model {
                    config.model = Some(model);
                }
                if let Some(thinking) = update.thinking {
                    config.thinking = Some(thinking);
                }
                if let Some(mode) = update.mode {
                    config.mode = Some(mode);
                }
                if let Some(permission_mode) = update.permission_mode {
                    config.permission_mode =
                        crate::policy::normalize_stored_permission(&permission_mode)
                            .or(Some(permission_mode));
                }
                Ok(AgentActionResult::unit())
            }
            AgentAction::RespondPermission {
                request_id,
                option_id,
            } => self
                .respond_permission(request_id, option_id)
                .await
                .map(|()| AgentActionResult::unit()),
            AgentAction::PrepareSessionOp { .. } => unreachable!("prepare rejected"),
            AgentAction::RespondSessionOp {
                option_id, target, ..
            } => self.respond_session_op(&option_id, target.as_deref()).await,
        }
    }
}

impl OpenCodeCommands {
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
        let config = self
            .current_config
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let variants = self
            .advertised_variants
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let body = prompt_async_body_with_delivery(
            &input.text,
            &input.attachments,
            &config,
            &variants,
            Some("steer"),
        );
        let path = format!("/session/{}/prompt_async", self.session_id);
        let status = self
            .http
            .post_no_content(&path, &body)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        if !status.is_success() {
            return Err(AgentActionError::NotFound(format!(
                "prompt_async steer status {status}"
            )));
        }
        Ok(())
    }

    async fn bind_last_user_message(&self, turn_id: &str) {
        let path = format!("/session/{}/message", self.session_id);
        let Ok((status, body)) = self.http.get_json(&path).await else {
            return;
        };
        if !status.is_success() {
            return;
        }
        if let Some(id) = last_user_message_id(&body) {
            self.turn_to_message
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .insert(turn_id.to_string(), id);
        }
    }

    async fn resolve_message_id(&self, target: Option<&str>) -> Result<String, AgentActionError> {
        if let Some(token) = target.filter(|value| !value.is_empty()) {
            if let Some(mapped) = self
                .turn_to_message
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .get(token)
                .cloned()
            {
                return Ok(mapped);
            }
            let path = format!("/session/{}/message", self.session_id);
            if let Ok((status, body)) = self.http.get_json(&path).await {
                if status.is_success() {
                    if let Some(id) = user_message_id_matching(&body, token) {
                        return Ok(id);
                    }
                    if let Some(id) = last_user_message_id(&body) {
                        if token.starts_with("turn:") {
                            return Ok(id);
                        }
                    }
                    return Ok(token.to_string());
                }
            }
            return Ok(token.to_string());
        }
        let path = format!("/session/{}/message", self.session_id);
        let (status, body) = self
            .http
            .get_json(&path)
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        if !status.is_success() {
            return Err(AgentActionError::NotFound("opencode messages".into()));
        }
        last_user_message_id(&body).ok_or_else(|| AgentActionError::NotFound("user message".into()))
    }

    async fn respond_session_op(
        &self,
        option_id: &str,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        match option_id {
            "fork" | "fork_no_worktree" | "fork_worktree" => {
                let message_id = match target {
                    Some(token) if !token.is_empty() => {
                        Some(self.resolve_message_id(Some(token)).await?)
                    }
                    _ => None,
                };
                let (status, body) = self
                    .http
                    .post_json(
                        &session_fork_path(&self.session_id),
                        &session_fork_body(message_id.as_deref()),
                    )
                    .await
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                if !status.is_success() {
                    return Err(AgentActionError::NotFound(format!("fork status {status}")));
                }
                let child = session_id_from_create(&body)
                    .ok_or_else(|| AgentActionError::NotFound("fork missing session id".into()))?;
                Ok(AgentActionResult::forked(child, None))
            }
            "redo" => {
                let status = self
                    .http
                    .post_empty(&session_unrevert_path(&self.session_id))
                    .await
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
                if !status.is_success() {
                    return Err(AgentActionError::NotFound(format!(
                        "unrevert status {status}"
                    )));
                }
                Ok(AgentActionResult::unit())
            }
            "rewind" | "rewind_conversation" | "rewind_both" | "rewind_code" => {
                let message_id = self.resolve_message_id(target).await?;
                self.post_revert(&message_id).await
            }
            other if other.starts_with("turn:") => {
                let token = other.trim_start_matches("turn:");
                let message_id = self.resolve_message_id(Some(token)).await?;
                self.post_revert(&message_id).await
            }
            other => Err(AgentActionError::NotFound(other.to_string())),
        }
    }

    async fn post_revert(&self, message_id: &str) -> Result<AgentActionResult, AgentActionError> {
        let (status, _) = self
            .http
            .post_json(
                &session_revert_path(&self.session_id),
                &session_revert_body(message_id),
            )
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        if !status.is_success() {
            return Err(AgentActionError::NotFound(format!(
                "revert status {status}"
            )));
        }
        Ok(AgentActionResult::unit())
    }

    async fn respond_permission(
        &self,
        request_id: String,
        option_id: String,
    ) -> Result<(), AgentActionError> {
        let kind = self
            .pending_asks
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&request_id)
            .ok_or_else(|| AgentActionError::NotFound(request_id.clone()))?;
        let result = match kind {
            PendingAsk::Permission => {
                let body = if self.routes.permission_session_scoped {
                    permission_response_body(&option_id)?
                } else {
                    permission_legacy_body(&option_id)?
                };
                let path = permission_path(&self.routes, &self.session_id, &request_id);
                self.http
                    .post_json(&path, &body)
                    .await
                    .map(|_| ())
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))
            }
            PendingAsk::Question => {
                let path = question_reply_path(&self.routes, &self.session_id, &request_id);
                let body = question_answers_body(&option_id);
                self.http
                    .post_no_content(&path, &body)
                    .await
                    .map(|_| ())
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))
            }
        };
        if result.is_err() {
            self.pending_asks
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .insert(request_id, kind);
        }
        result
    }

    async fn reject_open_questions(&self) {
        let ids: Vec<String> = self
            .pending_asks
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .iter()
            .filter(|(_, kind)| **kind == PendingAsk::Question)
            .map(|(id, _)| id.clone())
            .collect();
        for request_id in ids {
            let path = question_reject_path(&self.routes, &self.session_id, &request_id);
            let _ = self.http.post_empty(&path).await;
            self.pending_asks
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&request_id);
        }
        self.pending_asks
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clear();
    }

    async fn reject_question(&self, request_id: &str) {
        let path = question_reject_path(&self.routes, &self.session_id, request_id);
        let _ = self.http.post_empty(&path).await;
        self.pending_asks
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(request_id);
    }
}

struct OpenCodeRuntime {
    commands: Arc<OpenCodeCommands>,
    event_rx: mpsc::UnboundedReceiver<codec::BusEvent>,
    map: EventMapState,
    closed: bool,
}

#[async_trait]
impl AgentRuntime for OpenCodeRuntime {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.map.persistence.clone()
    }

    fn descriptor(&self) -> AgentDescriptor {
        let mut descriptor = self.map.descriptor();
        descriptor.current_config = self
            .commands
            .current_config
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        descriptor
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        loop {
            if let Some(event) = self.map.pending.pop_front() {
                self.disarm_if_turn_end(&event).await;
                return Some(event);
            }
            if self.closed {
                return None;
            }
            let Some(bus) = self.event_rx.recv().await else {
                self.closed = true;
                return Some(AgentEventEnvelope::new(None, AgentEvent::SessionClosed));
            };
            let turn_id = self.commands.running_turn.lock().await.clone();
            self.map.cancel_requested = self.commands.cancel_requested.load(Ordering::SeqCst);
            self.map.sync_turn(
                turn_id.clone(),
                self.commands.idle_armed.load(Ordering::SeqCst),
            );
            if let Ok(config) = self.commands.current_config.lock() {
                self.map.current_config = config.clone();
            }
            match map_event(&mut self.map, turn_id.clone(), bus) {
                MapOut::Skip | MapOut::Ready => {}
                MapOut::Event(event) => {
                    sync_pending_asks(&self.commands, &self.map);
                    self.disarm_if_turn_end(&event).await;
                    return Some(event);
                }
                MapOut::AutoRejectQuestion { request_id } => {
                    self.commands.reject_question(&request_id).await;
                    if let Some(event) = self.map.pending.pop_front() {
                        return Some(event);
                    }
                }
                MapOut::AutoApprovePermission { request_id } => {
                    let _ = self
                        .commands
                        .respond_permission(request_id, "once".into())
                        .await;
                    if let Some(event) = self.map.pending.pop_front() {
                        sync_pending_asks(&self.commands, &self.map);
                        self.disarm_if_turn_end(&event).await;
                        return Some(event);
                    }
                }
            }
        }
    }
}

impl OpenCodeRuntime {
    async fn disarm_if_turn_end(&self, event: &AgentEventEnvelope) {
        if matches!(
            event.payload,
            AgentEvent::TurnCompleted { .. }
                | AgentEvent::TurnFailed { .. }
                | AgentEvent::TurnCanceled { .. }
        ) {
            *self.commands.running_turn.lock().await = None;
            self.commands.idle_armed.store(false, Ordering::SeqCst);
        }
    }
}

fn sync_pending_asks(commands: &OpenCodeCommands, map: &EventMapState) {
    *commands
        .pending_asks
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = map.pending_asks.clone();
}

fn provider_descriptor() -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: "opencode".into(),
            name: "OpenCode".into(),
            version: None,
        },
        capabilities: capabilities_for_provider("opencode"),
        support: option_support_for_provider("opencode"),
        supported_options: AgentSupportedOptions::default(),
        current_config: AgentCurrentConfig::default(),
    }
}

#[async_trait]
impl AgentProvider for OpenCodeNativeProvider {
    fn id(&self) -> &str {
        "opencode"
    }

    async fn descriptor(&self, _ctx: &AgentOptionsContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor())
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        open_runtime(&self.cmd, cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        open_runtime(&self.cmd, cfg, Some(handle.0)).await
    }
}

async fn open_runtime(
    cmd: &str,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let mut serve: ServeChild = spawn_serve(
        cmd,
        &cfg.cwd,
        cfg.permission_mode.as_deref(),
        cfg.env_overrides.as_ref(),
    )
    .await?;
    let http = OpenCodeHttp::new(
        serve.base_url.clone(),
        serve.password().to_string(),
        &cfg.cwd,
    )?;
    tracing::debug!(base_url = %http.base_url(), "opencode serve ready");
    let doc = http.wait_for_doc().await?;
    let routes = routes_from_doc(&doc);

    let mut current_config = AgentCurrentConfig {
        model: cfg.model.clone(),
        thinking: cfg.thinking.clone(),
        mode: cfg.mode.clone(),
        permission_mode: cfg.permission_mode.clone(),
        fast: None,
    };

    if let Ok((status, health)) = http.get_json("/global/health").await {
        if status.as_u16() == 200 {
            tracing::debug!(healthy = ?health.get("healthy"), "opencode health");
        }
    }

    let session_id = if let Some(existing) = resume {
        let path = format!("/session/{existing}");
        let (status, body) = http.get_json(&path).await?;
        if status.as_u16() == 404 {
            return Err(AgentProviderError::NotFound(existing));
        }
        if !status.is_success() {
            return Err(AgentProviderError::message(format!(
                "GET {path} status {status}"
            )));
        }
        session_id_from_create(&body).unwrap_or(existing)
    } else {
        let create_body = session_create_body(&current_config);
        let (status, body) = http.post_json("/session", &create_body).await?;
        let (status, body) = if !status.is_success() && create_body.get("agent").is_some() {
            http.post_json("/session", &json!({})).await?
        } else {
            (status, body)
        };
        if !status.is_success() {
            return Err(AgentProviderError::message(format!(
                "POST /session status {status}"
            )));
        }
        session_id_from_create(&body)
            .ok_or_else(|| AgentProviderError::message("POST /session missing id"))?
    };

    let (event_tx, event_rx) = mpsc::unbounded_channel();
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let (ready_tx, ready_rx) = oneshot::channel();
    let idle_armed = Arc::new(AtomicBool::new(false));
    let sse_task = tokio::spawn(sse_loop(
        http.clone(),
        session_id.clone(),
        event_tx,
        shutdown_rx,
        Arc::clone(&idle_armed),
        Some(ready_tx),
    ));

    if tokio::time::timeout(Duration::from_secs(10), ready_rx)
        .await
        .map_err(|_| AgentProviderError::message("timeout waiting for server.connected"))?
        .is_err()
    {
        let _ = shutdown_tx.send(true);
        sse_task.abort();
        let _ = serve.child.start_kill();
        return Err(AgentProviderError::message(
            "sse closed before server.connected",
        ));
    }

    let mut map = EventMapState::with_auto_locked(
        session_id.clone(),
        current_config.clone(),
        serve.auto_locked,
    );
    if let Ok((status, health)) = http.get_json("/global/health").await {
        if status.as_u16() == 200 {
            if let Some(version) = health.get("version").and_then(Value::as_str) {
                map.identity.version = Some(version.to_string());
            }
        }
    }
    if let Ok((status, providers)) = http.get_json("/config/providers").await {
        if status.is_success() {
            let (options, default_model) = models_from_providers(&providers);
            map.supported_options = options;
            if current_config.model.is_none() {
                current_config.model = default_model;
                map.current_config.model = current_config.model.clone();
            }
            map.pending.push_back(AgentEventEnvelope::new(
                None,
                AgentEvent::ConfigChanged {
                    config: serde_json::to_value(&map.current_config).unwrap_or(Value::Null),
                },
            ));
        }
    }
    map.pending.push_front(AgentEventEnvelope::new(
        None,
        AgentEvent::SessionStarted {
            persistence_handle: Some(session_id.clone()),
        },
    ));

    let commands = Arc::new(OpenCodeCommands {
        http,
        session_id,
        routes,
        child: Mutex::new(Some(serve.child)),
        shutdown: shutdown_tx,
        running_turn: tokio::sync::Mutex::new(None),
        current_config: std::sync::Mutex::new(current_config),
        pending_asks: std::sync::Mutex::new(HashMap::new()),
        advertised_variants: std::sync::Mutex::new(Vec::new()),
        turn_to_message: std::sync::Mutex::new(HashMap::new()),
        cancel_requested: AtomicBool::new(false),
        idle_armed,
        sse_task: Mutex::new(Some(sse_task)),
    });

    Ok(Box::new(OpenCodeRuntime {
        commands,
        event_rx,
        map,
        closed: false,
    }))
}

async fn sse_loop(
    http: OpenCodeHttp,
    session_id: String,
    tx: mpsc::UnboundedSender<codec::BusEvent>,
    mut shutdown: watch::Receiver<bool>,
    idle_armed: Arc<AtomicBool>,
    mut handshake: Option<oneshot::Sender<()>>,
) {
    let mut saw_busy = false;
    loop {
        if *shutdown.borrow() {
            return;
        }
        match http.get_sse().await {
            Ok(mut response) => {
                let mut decoder = codec::SseDecoder::new();
                let mut utf8 = codec::Utf8Buf::new();
                loop {
                    tokio::select! {
                        _ = shutdown.changed() => {
                            if *shutdown.borrow() {
                                return;
                            }
                        }
                        chunk = response.chunk() => {
                            match chunk {
                                Ok(Some(bytes)) => {
                                    let text = utf8.push(&bytes);
                                    for sse in decoder.push(&text) {
                                        let Some(bus) = codec::bus_from_sse(&sse) else {
                                            continue;
                                        };
                                        if bus.event_type == "server.connected" {
                                            if let Some(ready) = handshake.take() {
                                                let _ = ready.send(());
                                            }
                                        }
                                        if bus.event_type == "session.status"
                                            && status_type_of(&bus.properties) == "busy"
                                        {
                                            saw_busy = true;
                                        }
                                        if tx.send(bus).is_err() {
                                            return;
                                        }
                                    }
                                }
                                Ok(None) | Err(_) => {
                                    for sse in decoder.finish() {
                                        let Some(bus) = codec::bus_from_sse(&sse) else {
                                            continue;
                                        };
                                        if tx.send(bus).is_err() {
                                            return;
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        _ = tokio::time::sleep(Duration::from_millis(500)) => {
                            if idle_armed.load(Ordering::SeqCst) {
                                poll_turn(&http, &session_id, &tx, &mut saw_busy).await;
                            }
                        }
                    }
                }
            }
            Err(_) => {
                if *shutdown.borrow() {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(400)).await;
                continue;
            }
        }
        if *shutdown.borrow() {
            return;
        }
        poll_turn(&http, &session_id, &tx, &mut saw_busy).await;
        if handshake.is_some() {
            if let Some(ready) = handshake.take() {
                let _ = ready.send(());
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

fn status_type_of(properties: &Value) -> &str {
    properties
        .pointer("/status/type")
        .and_then(Value::as_str)
        .or_else(|| properties.get("type").and_then(Value::as_str))
        .unwrap_or("")
}

async fn poll_turn(
    http: &OpenCodeHttp,
    session_id: &str,
    tx: &mpsc::UnboundedSender<codec::BusEvent>,
    saw_busy: &mut bool,
) {
    if let Ok((status, body)) = http.get_json("/session/status").await {
        if !status.is_success() {
            return;
        }
        let ty = body
            .get(session_id)
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str);
        match ty {
            Some("busy") | Some("retry") | Some("busy-generation") => {
                *saw_busy = true;
            }
            Some("idle") => {
                reconcile_messages(http, session_id, tx).await;
                let _ = tx.send(codec::BusEvent {
                    id: None,
                    event_type: "session.status".into(),
                    properties: json!({
                        "sessionID": session_id,
                        "status": { "type": "idle" }
                    }),
                });
            }
            None if *saw_busy => {
                reconcile_messages(http, session_id, tx).await;
                let _ = tx.send(codec::BusEvent {
                    id: None,
                    event_type: "session.status".into(),
                    properties: json!({
                        "sessionID": session_id,
                        "status": { "type": "idle" }
                    }),
                });
            }
            _ => {}
        }
    }
}

async fn reconcile_messages(
    http: &OpenCodeHttp,
    session_id: &str,
    tx: &mpsc::UnboundedSender<codec::BusEvent>,
) {
    let Ok((status, body)) = http
        .get_json(&format!("/session/{session_id}/message"))
        .await
    else {
        return;
    };
    if !status.is_success() {
        return;
    }
    let messages = if let Some(array) = body.as_array() {
        array.clone()
    } else {
        body.get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    for message in messages {
        if let Some(info) = message.get("info") {
            let _ = tx.send(codec::BusEvent {
                id: None,
                event_type: "message.updated".into(),
                properties: json!({ "sessionID": session_id, "info": info }),
            });
        }
        if let Some(parts) = message.get("parts").and_then(Value::as_array) {
            for part in parts {
                let _ = tx.send(codec::BusEvent {
                    id: None,
                    event_type: "message.part.updated".into(),
                    properties: json!({ "sessionID": session_id, "part": part }),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::Capability;
    use crate::contract::TurnStop;
    use std::path::PathBuf;

    #[test]
    fn steer_is_dispatched_without_unsupported() {
        dispatch_opencode_action(&AgentAction::Steer {
            input: AgentPrompt::default(),
        })
        .expect("steer");
    }

    #[test]
    fn capabilities_match_honesty_matrix() {
        let descriptor = provider_descriptor();
        assert_eq!(descriptor.identity.id, "opencode");
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
    }

    #[test]
    fn persistence_handle_is_vendor_session_not_chat_id() {
        let handle = AgentPersistenceHandle::new("ses_live");
        assert!(handle.as_str().starts_with("ses_"));
        assert_ne!(handle.as_str(), "chat_id");
    }

    /// Live OpenCode CLI: spawn serve → prompt_async → assistant text → idle complete.
    /// Run: `cargo test -p agent --lib providers::opencode::tests::live_prompt_completes -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "live OpenCode CLI"]
    async fn live_prompt_completes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let model = std::env::var("ATMOS_OPENCODE_MODEL")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let cwd = std::env::var("ATMOS_OPENCODE_CWD")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| dir.path().to_path_buf());
        let provider = OpenCodeNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd,
                model,
                thinking: None,
                mode: None,
                permission_mode: None,
                fast: None,
                extra_config: HashMap::new(),
                env_overrides: None,
                auth_method_id: None,
                allow_file_access: false,
                checkpoints: Vec::new(),
            })
            .await
            .expect("create_runtime");
        let control = runtime.control();
        let sent = control
            .send(AgentPrompt {
                text: "Reply with exactly one word: pong".into(),
                ..Default::default()
            })
            .await
            .expect("prompt_async");
        let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
        let mut text = String::new();
        let mut completed: Option<(String, TurnStop)> = None;
        while tokio::time::Instant::now() < deadline {
            let Ok(Some(event)) =
                tokio::time::timeout(Duration::from_secs(8), runtime.next_event()).await
            else {
                continue;
            };
            eprintln!("live event: {:?}", event.payload);
            match event.payload {
                AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(&delta),
                AgentEvent::TurnCompleted { turn_id, stop } => {
                    completed = Some((turn_id, stop));
                    break;
                }
                AgentEvent::TurnFailed { error, .. } => {
                    let _ = control.close().await;
                    panic!("turn failed: {error}");
                }
                _ => {}
            }
        }
        let _ = control.close().await;
        let (turn_id, stop) = completed.expect("turn did not complete in 90s");
        assert_eq!(turn_id, sent.turn_id);
        assert_eq!(stop, TurnStop::Completed);
        assert!(
            !text.trim().is_empty(),
            "expected assistant text, got {text:?}"
        );
    }
}
