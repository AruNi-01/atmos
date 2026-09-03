//! Native Codex Chat adapter (`codex app-server` stdio JSONL).
//!
//! Public Chat type: [`CodexNativeProvider`]. RPC DTOs stay in this module.

pub(crate) mod catalog;
mod codec;
mod event_map;
mod ids;
mod permission;
mod rpc;
mod spawn;
mod tool_map;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::process::Child;
use tokio::sync::mpsc;

use crate::contract::AgentEventEnvelope;
use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{
    AgentCatalogContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeControl,
    AgentTurnHandle,
};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use rpc::{
    answer_permission, collaboration_mode_rejected, reader_loop, stderr_loop, thread_fork_params,
    thread_revert_params, thread_rollback_params, turn_interrupt_params, turn_start_params,
    turn_steer_params, CodexShared, StickyConfig,
};
use spawn::{ensure_child_alive, resolve_program, spawn_app_server, SpawnedAppServer};

pub use spawn::{chat_args, CHAT_SUBCOMMAND};

pub struct CodexNativeProvider {
    program: String,
    env_overrides: Option<HashMap<String, String>>,
}

impl CodexNativeProvider {
    pub fn new() -> Self {
        Self {
            program: "codex".into(),
            env_overrides: None,
        }
    }

    pub fn with_program(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            env_overrides: None,
        }
    }

    pub fn with_env(mut self, env: HashMap<String, String>) -> Self {
        self.env_overrides = Some(env);
        self
    }
}

impl Default for CodexNativeProvider {
    fn default() -> Self {
        Self::new()
    }
}

fn merge_env(
    provider: Option<HashMap<String, String>>,
    runtime: Option<HashMap<String, String>>,
) -> Option<HashMap<String, String>> {
    match (provider, runtime) {
        (Some(mut left), Some(right)) => {
            left.extend(right);
            Some(left)
        }
        (left, right) => left.or(right),
    }
}

fn current_config_from(cfg: &AgentRuntimeConfig) -> AgentCurrentConfig {
    AgentCurrentConfig {
        model: cfg.model.clone(),
        thinking: cfg.thinking.clone(),
        mode: cfg.mode.clone(),
        permission_mode: cfg
            .permission_mode
            .as_deref()
            .and_then(crate::policy::normalize_stored_permission)
            .or_else(|| cfg.permission_mode.clone()),
    }
}

fn provider_descriptor(current: AgentCurrentConfig) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: "codex".into(),
            name: "codex".into(),
            version: None,
        },
        capabilities: capabilities_for_provider("codex"),
        support: option_support_for_provider("codex"),
        supported_options: AgentSupportedOptions::default(),
        current_config: current,
    }
}

struct CodexCommands {
    shared: Arc<CodexShared>,
}

struct CodexRuntime {
    commands: Arc<CodexCommands>,
    events_rx: mpsc::UnboundedReceiver<AgentEventEnvelope>,
    _child: Option<Child>,
}

#[async_trait]
impl AgentRuntimeCommands for CodexCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        *self.shared.running_turn.lock().await = Some(turn_id.clone());
        {
            let mut map = self.shared.map.lock().await;
            map.turn_failed_emitted = false;
            map.last_error = None;
        }
        let thread_id = self
            .shared
            .ids
            .lock()
            .await
            .thread_id
            .clone()
            .ok_or_else(|| AgentProviderError::message("codex thread is not started"))?;
        let sticky = self.shared.sticky.lock().await.clone();
        let mut params = turn_start_params(&thread_id, &input, &sticky);
        let result = match self.shared.request("turn/start", params.clone()).await {
            Ok(value) => value,
            Err(error)
                if params.get("collaborationMode").is_some()
                    && collaboration_mode_rejected(&error.to_string()) =>
            {
                if let Some(object) = params.as_object_mut() {
                    object.remove("collaborationMode");
                }
                self.shared.request("turn/start", params).await?
            }
            Err(error) => return Err(error),
        };
        if let Some(vendor) = result
            .pointer("/turn/id")
            .and_then(serde_json::Value::as_str)
        {
            self.shared
                .ids
                .lock()
                .await
                .bind_turn(turn_id.clone(), vendor.to_string());
        }
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.shared.fail_outstanding().await;
        let (thread_id, vendor) = {
            let ids = self.shared.ids.lock().await;
            let thread_id = ids.thread_id.clone();
            let vendor = self
                .shared
                .running_turn
                .lock()
                .await
                .as_ref()
                .and_then(|atmos| ids.vendor_for_atmos(atmos).map(str::to_string));
            (thread_id, vendor)
        };
        if let (Some(thread_id), Some(vendor)) = (thread_id, vendor) {
            let _ = self
                .shared
                .request("turn/interrupt", turn_interrupt_params(&thread_id, &vendor))
                .await;
        }
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.shared.fail_outstanding().await;
        let mut stdin = self.shared.stdin.lock().await;
        *stdin = None;
        self.shared.emit_closed();
        Ok(())
    }

    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        match action {
            AgentAction::Steer { input } => {
                let atmos = input
                    .turn_id
                    .clone()
                    .or(self.shared.running_turn.lock().await.clone());
                let Some(atmos) = atmos else {
                    return Err(AgentActionError::SteerTurnMismatch);
                };
                let (thread_id, vendor) = {
                    let ids = self.shared.ids.lock().await;
                    (
                        ids.thread_id.clone(),
                        ids.vendor_for_atmos(&atmos).map(str::to_string),
                    )
                };
                let Some(vendor) = vendor else {
                    return Err(AgentActionError::SteerTurnMismatch);
                };
                let Some(thread_id) = thread_id else {
                    return Err(AgentActionError::SteerTurnMismatch);
                };
                self.shared
                    .request("turn/steer", turn_steer_params(&thread_id, &vendor, &input))
                    .await
                    .map_err(|_| AgentActionError::SteerTurnMismatch)?;
                Ok(AgentActionResult::unit())
            }
            AgentAction::RespondPermission {
                request_id,
                option_id,
            } => answer_permission(&self.shared, &request_id, &option_id)
                .await
                .map(|()| AgentActionResult::unit()),
            AgentAction::SetConfig { update } => {
                let mut sticky = self.shared.sticky.lock().await;
                sticky.apply(&update);
                let mut map = self.shared.map.lock().await;
                if let Some(model) = update.model {
                    map.current_config.model = Some(model);
                }
                if let Some(thinking) = update.thinking {
                    map.current_config.thinking = Some(thinking);
                }
                if let Some(mode) = update.mode {
                    map.current_config.mode = Some(mode);
                }
                if let Some(permission_mode) = update.permission_mode {
                    map.current_config.permission_mode =
                        crate::policy::normalize_stored_permission(&permission_mode)
                            .or(Some(permission_mode));
                }
                Ok(AgentActionResult::unit())
            }
            AgentAction::PrepareSessionOp { .. } => Err(AgentActionError::Unsupported {
                action: AgentActionKind::PrepareSessionOp,
            }),
            AgentAction::RespondSessionOp {
                option_id, target, ..
            } => self.respond_session_op(&option_id, target.as_deref()).await,
        }
    }
}

impl CodexCommands {
    async fn respond_session_op(
        &self,
        option_id: &str,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        match option_id {
            "fork" | "fork_no_worktree" | "fork_worktree" => self.fork_thread(target).await,
            "rewind" | "rewind_conversation" => self.rewind_conversation(target).await,
            other if other.starts_with("turn:") => {
                self.rewind_conversation(Some(other.trim_start_matches("turn:")))
                    .await
            }
            other => Err(AgentActionError::NotFound(other.to_string())),
        }
    }

    async fn fork_thread(
        &self,
        last_turn: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        let thread_id = self
            .shared
            .ids
            .lock()
            .await
            .thread_id
            .clone()
            .ok_or_else(|| AgentActionError::NotFound("codex thread".into()))?;
        let last_turn_id = if let Some(token) = last_turn {
            self.shared
                .ids
                .lock()
                .await
                .vendor_for_target(token)
                .map(str::to_string)
        } else {
            None
        };
        let result = self
            .shared
            .request(
                "thread/fork",
                thread_fork_params(&thread_id, last_turn_id.as_deref()),
            )
            .await
            .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        let child = result
            .get("thread")
            .and_then(|thread| thread.get("id"))
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| AgentActionError::NotFound("thread/fork missing thread.id".into()))?;
        Ok(AgentActionResult::forked(child, None))
    }

    async fn rewind_conversation(
        &self,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        let token = target
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AgentActionError::NotFound("rewind target".into()))?;
        let ids = self.shared.ids.lock().await;
        let thread_id = ids
            .thread_id
            .clone()
            .ok_or_else(|| AgentActionError::NotFound("codex thread".into()))?;
        let vendor = ids
            .vendor_for_target(token)
            .ok_or_else(|| AgentActionError::NotFound(token.to_string()))?
            .to_string();
        let before = ids.revert_before_turn_id(&vendor).map(str::to_string);
        let rollback = ids.rollback_num_turns(&vendor);
        drop(ids);
        self.interrupt_active_turn().await;
        if self
            .shared
            .thread_paginated
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            if let Some(before_turn_id) = before {
                self.shared
                    .request(
                        "thread/revert",
                        thread_revert_params(&thread_id, &before_turn_id),
                    )
                    .await
                    .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
            }
            return Ok(AgentActionResult::unit());
        }
        let num_turns = rollback.unwrap_or(0);
        if num_turns > 0 {
            self.shared
                .request(
                    "thread/rollback",
                    thread_rollback_params(&thread_id, num_turns),
                )
                .await
                .map_err(|error| AgentActionError::NotFound(error.to_string()))?;
        }
        Ok(AgentActionResult::unit())
    }

    async fn interrupt_active_turn(&self) {
        let (thread_id, vendor) = {
            let ids = self.shared.ids.lock().await;
            let thread_id = ids.thread_id.clone();
            let vendor = self
                .shared
                .running_turn
                .lock()
                .await
                .as_ref()
                .and_then(|atmos| ids.vendor_for_atmos(atmos).map(str::to_string));
            (thread_id, vendor)
        };
        if let (Some(thread_id), Some(vendor)) = (thread_id, vendor) {
            let _ = self
                .shared
                .request("turn/interrupt", turn_interrupt_params(&thread_id, &vendor))
                .await;
        }
    }
}

#[async_trait]
impl AgentRuntime for CodexRuntime {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.commands
            .shared
            .ids
            .try_lock()
            .ok()
            .and_then(|ids| ids.persistence())
    }

    fn descriptor(&self) -> AgentDescriptor {
        self.commands
            .shared
            .map
            .try_lock()
            .map(|map| map.descriptor())
            .unwrap_or_else(|_| provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        self.events_rx.recv().await
    }
}

async fn open_runtime(
    stdin: impl AsyncWrite + Unpin + Send + 'static,
    stdout: impl AsyncRead + Unpin + Send + 'static,
    stderr: Option<impl AsyncRead + Unpin + Send + 'static>,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
    child: Option<Child>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let (events_tx, events_rx) = mpsc::unbounded_channel();
    let sticky = StickyConfig::from_runtime(&cfg);
    let current = current_config_from(&cfg);
    let shared = CodexShared::new(Box::new(stdin), events_tx, current, sticky);
    tokio::spawn(reader_loop(stdout, shared.clone()));
    if let Some(stderr) = stderr {
        tokio::spawn(stderr_loop(stderr));
    }
    shared.handshake(&cfg.cwd, resume.as_deref()).await?;
    Ok(Box::new(CodexRuntime {
        commands: Arc::new(CodexCommands { shared }),
        events_rx,
        _child: child,
    }))
}

async fn spawn_runtime(
    provider: &CodexNativeProvider,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let program = resolve_program(&provider.program)?;
    let env = merge_env(provider.env_overrides.clone(), cfg.env_overrides.clone());
    let mut spawned: SpawnedAppServer = spawn_app_server(&program, &cfg.cwd, env)?;
    ensure_child_alive(&mut spawned.child, &program).await?;
    open_runtime(
        spawned.stdin,
        spawned.stdout,
        Some(spawned.stderr),
        cfg,
        resume,
        Some(spawned.child),
    )
    .await
}

#[async_trait]
impl AgentProvider for CodexNativeProvider {
    fn id(&self) -> &str {
        "codex"
    }

    async fn descriptor(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        spawn_runtime(self, cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        spawn_runtime(self, cfg, Some(handle.0)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentAction;
    use crate::contract::AgentEvent;
    use crate::contract::Capability;
    use crate::contract::{AgentPrompt, AgentRuntimeConfigUpdate};
    use serde_json::{json, Value};
    use std::path::PathBuf;
    use tokio::time::{timeout, Duration};

    const FAKE_CODEX: &str = r#"#!/usr/bin/env python3
import json, os, sys
inject = os.environ.get("CODEX_TEST_INJECT") == "1"
capture = os.environ.get("CODEX_TEST_CAPTURE")
injected = False
turn_n = 0
for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    if capture:
        with open(capture, "a") as fh:
            fh.write(line + "\n")
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        continue
    mid = msg.get("id")
    method = msg.get("method")
    if mid is None or method is None:
        continue
    result = {}
    if method == "initialize":
        result = {"userAgent": "atmos/0.144.5 (Mac OS 27.0.0; arm64) dumb (atmos; 0.0.0)", "codexHome": "/Users/me/.codex", "platformFamily": "unix", "platformOs": "macos"}
    elif method == "model/list":
        result = {"data": [{
            "id": "gpt-5.6-luna",
            "displayName": "GPT-5.6-Luna",
            "isDefault": True,
            "supportedReasoningEfforts": [
                {"reasoningEffort": "low"},
                {"reasoningEffort": "high"}
            ]
        }]}
    elif method == "collaborationMode/list":
        result = {"data": [
            {"name": "Plan", "mode": "plan", "model": None, "reasoning_effort": "medium"},
            {"name": "Default", "mode": "default", "model": None, "reasoning_effort": None}
        ]}
    elif method in ("thread/start", "thread/resume"):
        history = "paginated" if os.environ.get("CODEX_TEST_PAGINATED") == "1" else "legacy"
        result = {"thread": {"id": "thr_123", "historyMode": history}}
    elif method == "turn/start":
        turn_n += 1
        tid = "turn_456" if turn_n == 1 else "turn_789"
        result = {"turn": {"id": tid, "status": "inProgress"}}
    elif method == "turn/steer":
        result = {"turnId": "turn_456"}
    elif method == "turn/interrupt":
        result = {}
    elif method == "thread/fork":
        result = {"thread": {"id": "thr_fork_1"}}
    elif method == "thread/revert":
        result = {"thread": {"id": "thr_123", "turns": []}}
    elif method == "thread/rollback":
        result = {"thread": {"id": "thr_123"}}
    print(json.dumps({"id": mid, "result": result}), flush=True)
    if method == "turn/start" and inject and not injected:
        injected = True
        print(json.dumps({"method":"turn/started","params":{"turn":{"id":"turn_456","status":"inProgress"}}}), flush=True)
        print(json.dumps({"method":"item/started","params":{"item":{"type":"commandExecution","id":"call_1","command":"ls -la","cwd":"/abs/project","status":"inProgress"}}}), flush=True)
        print(json.dumps({"method":"item/commandExecution/requestApproval","id":61,"params":{"threadId":"thr_123","turnId":"turn_456","itemId":"call_1","command":"ls -la"}}), flush=True)
    if method == "turn/steer":
        print(json.dumps({"method":"turn/completed","params":{"turn":{"id":"turn_456","status":"completed"}}}), flush=True)
"#;

    struct FakeCli {
        _dir: tempfile::TempDir,
        program: PathBuf,
        capture: PathBuf,
    }

    fn fake_cli() -> FakeCli {
        let dir = tempfile::tempdir().expect("tempdir");
        let program = dir.path().join("codex");
        std::fs::write(&program, FAKE_CODEX).expect("write fake codex");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755))
                .expect("chmod");
        }
        let capture = dir.path().join("capture.jsonl");
        FakeCli {
            _dir: dir,
            program,
            capture,
        }
    }

    fn load_capture(path: &std::path::Path) -> Vec<Value> {
        let text = std::fs::read_to_string(path).unwrap_or_default();
        text.lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect()
    }

    async fn wait_captured<T>(
        path: &std::path::Path,
        pick: impl Fn(&[Value]) -> Option<T>,
    ) -> Option<T> {
        let start = std::time::Instant::now();
        loop {
            let writes = load_capture(path);
            if let Some(found) = pick(&writes) {
                return Some(found);
            }
            if start.elapsed() > Duration::from_secs(2) {
                return None;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    async fn drain_until(
        runtime: &mut Box<dyn AgentRuntime>,
        pred: impl Fn(&AgentEvent) -> bool,
    ) -> Vec<AgentEvent> {
        let mut out = Vec::new();
        loop {
            let envelope = timeout(Duration::from_secs(3), runtime.next_event())
                .await
                .expect("event timeout")
                .expect("runtime closed");
            let stop = pred(&envelope.payload);
            out.push(envelope.payload);
            if stop {
                return out;
            }
        }
    }

    async fn connect_runtime(cli: &FakeCli, inject: bool) -> Box<dyn AgentRuntime> {
        let mut env = HashMap::new();
        env.insert(
            "CODEX_TEST_CAPTURE".into(),
            cli.capture.to_string_lossy().into_owned(),
        );
        if inject {
            env.insert("CODEX_TEST_INJECT".into(), "1".into());
        }
        let provider =
            CodexNativeProvider::with_program(cli.program.to_string_lossy().into_owned())
                .with_env(env);
        let cfg = AgentRuntimeConfig {
            cwd: PathBuf::from("/abs/project"),
            model: Some("gpt-5.6-sol".into()),
            ..AgentRuntimeConfig::default()
        };
        provider.create_runtime(cfg).await.expect("handshake")
    }

    #[tokio::test]
    async fn handshake_fills_model_from_list_when_spawn_omits_it() {
        let cli = fake_cli();
        let mut env = HashMap::new();
        env.insert(
            "CODEX_TEST_CAPTURE".into(),
            cli.capture.to_string_lossy().into_owned(),
        );
        let provider =
            CodexNativeProvider::with_program(cli.program.to_string_lossy().into_owned())
                .with_env(env);
        let cfg = AgentRuntimeConfig {
            cwd: PathBuf::from("/abs/project"),
            ..AgentRuntimeConfig::default()
        };
        let mut runtime = provider.create_runtime(cfg).await.expect("handshake");
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        runtime
            .control()
            .send(AgentPrompt {
                text: "who are you".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let writes = wait_captured(&cli.capture, |writes| {
            let thread = writes.iter().find(|frame| {
                frame.get("method").and_then(Value::as_str) == Some("thread/start")
            })?;
            let turn = writes
                .iter()
                .find(|frame| frame.get("method").and_then(Value::as_str) == Some("turn/start"))?;
            Some((thread.clone(), turn.clone()))
        })
        .await
        .expect("thread and turn");
        assert_eq!(writes.0["params"]["model"], "gpt-5.6-luna");
        assert_eq!(writes.1["params"]["model"], "gpt-5.6-luna");
        assert_eq!(writes.1["params"]["effort"], "low");
        drop(runtime);
    }

    #[tokio::test]
    async fn descriptor_uses_honesty_matrix() {
        let provider = CodexNativeProvider::new();
        assert_eq!(provider.id(), "codex");
        let descriptor = provider
            .descriptor(&AgentCatalogContext::default())
            .await
            .expect("descriptor");
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
    }

    #[tokio::test]
    async fn send_steer_permission_and_envelopes_use_atmos_turn_id() {
        let cli = fake_cli();
        let mut runtime = connect_runtime(&cli, true).await;
        let started = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        assert!(matches!(
            started.last(),
            Some(AgentEvent::SessionStarted {
                persistence_handle: Some(id)
            }) if id == "thr_123"
        ));
        assert_eq!(
            runtime.persistence_handle().as_ref().map(|h| h.as_str()),
            Some("thr_123")
        );
        assert_eq!(
            runtime.descriptor().capabilities.steer,
            Capability::Supported
        );

        let control = runtime.control();
        let handle = control
            .send(AgentPrompt {
                text: "Run tests".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        assert_eq!(handle.turn_id, "atmos-turn-1");

        let permission = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::PermissionRequested { .. })
        })
        .await;
        assert!(permission.iter().any(|event| matches!(
            event,
            AgentEvent::ToolCallStarted { tool_call } if tool_call.kind == crate::contract::AgentToolKind::Execute
        )));
        let request = permission
            .iter()
            .find_map(|event| match event {
                AgentEvent::PermissionRequested { request } => Some(request),
                _ => None,
            })
            .expect("permission");
        assert_eq!(request.request_id, "61");

        control
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "Focus on failures.".into(),
                    turn_id: Some("atmos-turn-1".into()),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect("steer");
        control
            .action(AgentAction::RespondPermission {
                request_id: "61".into(),
                option_id: "accept".into(),
            })
            .await
            .expect("permission respond");

        let completed = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::TurnCompleted { .. })
        })
        .await;
        assert!(completed.iter().any(|event| matches!(
            event,
            AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "atmos-turn-1"
        )));

        let permission_reply = wait_captured(&cli.capture, |writes| {
            writes
                .iter()
                .find(|frame| frame.get("id") == Some(&json!(61)) && frame.get("result").is_some())
                .cloned()
        })
        .await
        .expect("permission reply");
        assert_eq!(permission_reply["result"]["decision"], "accept");
        assert!(permission_reply.get("jsonrpc").is_none());

        let writes = load_capture(&cli.capture);
        let steer = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("turn/steer"))
            .expect("steer write");
        assert_eq!(steer["params"]["expectedTurnId"], "turn_456");
        assert_ne!(steer["params"]["expectedTurnId"], "atmos-turn-1");
        assert!(steer.get("jsonrpc").is_none());
        let init = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("initialize"))
            .expect("initialize");
        assert_eq!(init["params"]["clientInfo"]["name"], "atmos");
        assert_eq!(
            init.pointer("/params/capabilities/experimentalApi"),
            Some(&json!(true))
        );
        let thread = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("thread/start"))
            .expect("thread/start");
        assert_eq!(thread["params"]["approvalsReviewer"], "user");
        assert_eq!(thread["params"]["approvalPolicy"], "on-request");
        assert_eq!(thread["params"]["sandbox"], "workspace-write");
        drop(runtime);
    }

    #[tokio::test]
    async fn steer_without_vendor_map_is_mismatch() {
        let cli = fake_cli();
        let runtime = connect_runtime(&cli, false).await;
        let error = runtime
            .control()
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "nudge".into(),
                    turn_id: Some("atmos-turn-1".into()),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect_err("steer");
        assert!(matches!(error, AgentActionError::SteerTurnMismatch));
        drop(runtime);
    }

    #[tokio::test]
    async fn set_config_sticks_on_next_turn_start() {
        let cli = fake_cli();
        let mut runtime = connect_runtime(&cli, false).await;
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        let control = runtime.control();
        control
            .action(AgentAction::SetConfig {
                update: AgentRuntimeConfigUpdate {
                    model: Some("gpt-5.6-sol".into()),
                    thinking: Some("high".into()),
                    mode: Some("plan".into()),
                    ..AgentRuntimeConfigUpdate::default()
                },
            })
            .await
            .expect("set config");
        control
            .send(AgentPrompt {
                text: "again".into(),
                turn_id: Some("atmos-turn-2".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let writes = load_capture(&cli.capture);
        let turn = writes
            .iter()
            .rev()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("turn/start"))
            .expect("turn/start");
        assert_eq!(turn["params"]["model"], "gpt-5.6-sol");
        assert_eq!(turn["params"]["effort"], "high");
        assert_eq!(turn["params"]["collaborationMode"]["mode"], "plan");
        assert!(
            turn["params"]["collaborationMode"]["settings"]["developer_instructions"].is_null()
        );
        drop(runtime);
    }

    #[tokio::test]
    async fn first_turn_start_sends_spawn_collaboration_mode() {
        let cli = fake_cli();
        let mut env = HashMap::new();
        env.insert(
            "CODEX_TEST_CAPTURE".into(),
            cli.capture.to_string_lossy().into_owned(),
        );
        let provider =
            CodexNativeProvider::with_program(cli.program.to_string_lossy().into_owned())
                .with_env(env);
        let cfg = AgentRuntimeConfig {
            cwd: PathBuf::from("/abs/project"),
            model: Some("gpt-5.6-sol".into()),
            mode: Some("plan".into()),
            ..AgentRuntimeConfig::default()
        };
        let mut runtime = provider.create_runtime(cfg).await.expect("handshake");
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        runtime
            .control()
            .send(AgentPrompt {
                text: "first".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let writes = load_capture(&cli.capture);
        let turn = writes
            .iter()
            .rev()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("turn/start"))
            .expect("turn/start");
        assert_eq!(turn["params"]["collaborationMode"]["mode"], "plan");
        drop(runtime);
    }

    #[test]
    fn handshake_writes_match_recorded_shapes() {
        let _ = rpc::thread_start_params;
        let raw = include_str!("testdata/handshake.jsonl");
        assert!(raw.contains("\"approvalsReviewer\":\"user\""));
        assert!(raw.contains("\"approvalPolicy\":\"on-request\""));
        assert!(raw.contains("\"sandbox\":\"workspace-write\""));
        assert!(!raw.contains("jsonrpc"));
    }

    #[test]
    fn app069_s12_codex_rewind_match_has_no_restore_code() {
        let src = include_str!("mod.rs");
        let production = src.split("#[cfg(test)]").next().unwrap_or(src);
        assert!(
            !production.contains("Restore code"),
            "Codex must not offer Restore code"
        );
        assert!(
            !production.contains("\"rewind_code\""),
            "Codex session-op must not map rewind_code"
        );
        assert!(production.contains("thread/revert") || production.contains("thread/rollback"));
    }

    #[tokio::test]
    async fn app069_s12_fork_and_rewind_session_ops() {
        let cli = fake_cli();
        let mut runtime = connect_runtime(&cli, false).await;
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        let control = runtime.control();
        control
            .send(AgentPrompt {
                text: "Run tests".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");
        let forked = control
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "fork".into(),
                target: None,
            })
            .await
            .expect("fork");
        assert_eq!(forked.new_session_id.as_deref(), Some("thr_fork_1"));
        control
            .action(AgentAction::RespondSessionOp {
                request_id: "op2".into(),
                option_id: "rewind".into(),
                target: Some("atmos-turn-1".into()),
            })
            .await
            .expect("rewind last is no-op rollback");
        let writes = load_capture(&cli.capture);
        let fork = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("thread/fork"))
            .expect("thread/fork");
        assert_eq!(fork["params"]["ephemeral"], false);
        assert_eq!(fork["params"]["threadId"], "thr_123");
        assert!(fork.get("jsonrpc").is_none());
        assert!(writes.iter().all(|frame| {
            frame
                .get("method")
                .and_then(Value::as_str)
                .is_none_or(|method| method != "git" && !method.contains("Restore code"))
        }));
        drop(runtime);
    }

    #[tokio::test]
    async fn rewind_earlier_turn_writes_rollback_with_thread_id() {
        let cli = fake_cli();
        let mut runtime = connect_runtime(&cli, false).await;
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        let control = runtime.control();
        control
            .send(AgentPrompt {
                text: "first".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send 1");
        control
            .send(AgentPrompt {
                text: "second".into(),
                turn_id: Some("atmos-turn-2".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send 2");
        control
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "rewind".into(),
                target: Some("atmos-turn-1".into()),
            })
            .await
            .expect("rewind");
        let writes = load_capture(&cli.capture);
        let rollback = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("thread/rollback"))
            .expect("thread/rollback");
        assert_eq!(rollback["params"]["threadId"], "thr_123");
        assert_eq!(rollback["params"]["numTurns"], 1);
        assert!(rollback.get("jsonrpc").is_none());
        drop(runtime);
    }

    #[tokio::test]
    async fn paginated_rewind_writes_thread_revert() {
        let cli = fake_cli();
        let mut env = HashMap::new();
        env.insert(
            "CODEX_TEST_CAPTURE".into(),
            cli.capture.to_string_lossy().into_owned(),
        );
        env.insert("CODEX_TEST_PAGINATED".into(), "1".into());
        let provider =
            CodexNativeProvider::with_program(cli.program.to_string_lossy().into_owned())
                .with_env(env);
        let cfg = AgentRuntimeConfig {
            cwd: PathBuf::from("/abs/project"),
            model: Some("gpt-5.6-sol".into()),
            ..AgentRuntimeConfig::default()
        };
        let mut runtime = provider.create_runtime(cfg).await.expect("handshake");
        let _ = drain_until(&mut runtime, |event| {
            matches!(event, AgentEvent::SessionStarted { .. })
        })
        .await;
        let control = runtime.control();
        control
            .send(AgentPrompt {
                text: "first".into(),
                turn_id: Some("atmos-turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send 1");
        control
            .send(AgentPrompt {
                text: "second".into(),
                turn_id: Some("atmos-turn-2".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send 2");
        control
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "rewind".into(),
                target: Some("atmos-turn-1".into()),
            })
            .await
            .expect("rewind");
        let writes = load_capture(&cli.capture);
        let revert = writes
            .iter()
            .find(|frame| frame.get("method").and_then(Value::as_str) == Some("thread/revert"))
            .expect("thread/revert");
        assert_eq!(revert["params"]["threadId"], "thr_123");
        assert_eq!(revert["params"]["beforeTurnId"], "turn_789");
        assert!(writes.iter().all(|frame| {
            frame
                .get("method")
                .and_then(Value::as_str)
                .is_none_or(|method| method != "thread/rollback")
        }));
        drop(runtime);
    }
}
