//! Native Grok Chat adapter (`grok agent stdio` ACP JSON-RPC + `_x.ai/*`).

mod event_map;
pub(crate) mod options;
mod rpc;
mod spawn;
mod tool_map;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio::time::timeout;

use crate::acp_client::{run_acp_session, AcpSessionControl, AcpSessionHandle, AcpToolHandler};
use crate::contract::AgentEventEnvelope;
use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::contract::{
    AgentOptionsContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentRuntimeControl, AgentTurnHandle,
};
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use event_map::{map_event, EventMapState};
use rpc::{
    fork_session_params, forked_session_id, interject_params, map_xai_notification,
    resolve_target_prompt_index, rewind_execute_failed, rewind_execute_params,
    rewind_mode_for_option, rewind_point_has_file_changes, rewind_points_params, wire_method,
    worktree_create_is_pending, worktree_create_params, worktree_path, METHOD_INTERJECT,
    METHOD_REWIND_EXECUTE, METHOD_REWIND_POINTS, METHOD_SESSION_FORK, METHOD_WORKTREE_CREATE,
    METHOD_WORKTREE_STATUS,
};
use spawn::{launch_spec, merge_env, program_from_launch_spec};

const EXT_TIMEOUT: Duration = Duration::from_secs(60);

pub struct GrokNativeProvider {
    program: String,
    env: Option<HashMap<String, String>>,
}

impl Default for GrokNativeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl GrokNativeProvider {
    pub fn new() -> Self {
        Self {
            program: "grok".into(),
            env: None,
        }
    }

    pub fn with_program(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            env: None,
        }
    }

    pub fn from_launch_spec(spec: &crate::models::AgentLaunchSpec) -> Self {
        Self {
            program: program_from_launch_spec(spec),
            env: spec.env.clone(),
        }
    }

    pub fn program(&self) -> &str {
        &self.program
    }

    pub fn chat_argv(model: Option<&str>) -> Vec<String> {
        spawn::chat_argv(model, None)
    }
}

struct GrokFsHandler {
    allow_file_access: bool,
}

#[async_trait]
impl AcpToolHandler for GrokFsHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
        let path_buf = PathBuf::from(path);
        if path_buf.is_absolute() {
            path_buf
        } else {
            session_cwd.join(path)
        }
    }

    async fn read_text_file(&self, path: &Path) -> Result<String, String> {
        if !self.allow_file_access {
            return Err("File access disabled.".to_string());
        }
        std::fs::read_to_string(path).map_err(|error| error.to_string())
    }

    async fn write_text_file(&self, path: &Path, content: &str) -> Result<(), String> {
        if !self.allow_file_access {
            return Err("File access disabled.".to_string());
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(path, content).map_err(|error| error.to_string())
    }
}

struct GrokCommands {
    control: AcpSessionControl,
    session_id: String,
    cwd: PathBuf,
    running_turn: Mutex<Option<String>>,
    pending_permissions: Mutex<HashMap<String, oneshot::Sender<String>>>,
    turn_prompt_index: Mutex<HashMap<String, u64>>,
    prompt_n: Mutex<u64>,
}

#[derive(Debug)]
enum GrokDispatchedAction {
    Steer {
        input: AgentPrompt,
    },
    RespondPermission {
        request_id: String,
        option_id: String,
    },
    SetConfig {
        update: Box<AgentRuntimeConfigUpdate>,
    },
    RespondSessionOp {
        option_id: String,
        target: Option<String>,
    },
    PrepareRewind {
        rest: String,
    },
}

fn dispatch_grok_action(action: AgentAction) -> Result<GrokDispatchedAction, AgentActionError> {
    match action {
        AgentAction::Steer { input } => Ok(GrokDispatchedAction::Steer { input }),
        AgentAction::RespondPermission {
            request_id,
            option_id,
        } => Ok(GrokDispatchedAction::RespondPermission {
            request_id,
            option_id,
        }),
        AgentAction::SetConfig { update } => Ok(GrokDispatchedAction::SetConfig { update }),
        AgentAction::PrepareSessionOp { kind, rest } => {
            if kind != crate::contract::SessionOpKind::Rewind || rest.trim().is_empty() {
                return Err(AgentActionError::Unsupported {
                    action: AgentActionKind::PrepareSessionOp,
                });
            }
            Ok(GrokDispatchedAction::PrepareRewind { rest })
        }
        AgentAction::RespondSessionOp {
            option_id, target, ..
        } => Ok(GrokDispatchedAction::RespondSessionOp { option_id, target }),
    }
}

#[async_trait]
impl AgentRuntimeCommands for GrokCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let index = {
            let mut n = self.prompt_n.lock().await;
            let index = *n;
            *n += 1;
            index
        };
        self.turn_prompt_index
            .lock()
            .await
            .insert(turn_id.clone(), index);
        *self.running_turn.lock().await = Some(turn_id.clone());
        self.control
            .send_prompt(input.text, input.attachments)
            .map_err(AgentProviderError::message)?;
        Ok(AgentTurnHandle { turn_id })
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.fail_pending_permissions().await;
        self.control
            .send_cancel()
            .map_err(AgentProviderError::message)?;
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.fail_pending_permissions().await;
        self.control
            .send_close()
            .map_err(AgentProviderError::message)?;
        Ok(())
    }

    async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
        match dispatch_grok_action(action)? {
            GrokDispatchedAction::Steer { input } => {
                self.steer(input).await.map(|()| AgentActionResult::unit())
            }
            GrokDispatchedAction::RespondPermission {
                request_id,
                option_id,
            } => {
                let tx = self
                    .pending_permissions
                    .lock()
                    .await
                    .remove(&request_id)
                    .ok_or(AgentActionError::NotFound(request_id))?;
                let _ = tx.send(option_id);
                Ok(AgentActionResult::unit())
            }
            GrokDispatchedAction::SetConfig { update } => apply_set_config(&self.control, *update)
                .await
                .map(|()| AgentActionResult::unit())
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                }),
            GrokDispatchedAction::RespondSessionOp { option_id, target } => {
                self.respond_session_op(&option_id, target.as_deref()).await
            }
            GrokDispatchedAction::PrepareRewind { rest } => self.preview_rewind(&rest).await,
        }
    }
}

impl GrokCommands {
    async fn fail_pending_permissions(&self) {
        self.pending_permissions.lock().await.clear();
    }

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
        self.ext_method(
            METHOD_INTERJECT,
            interject_params(&self.session_id, &input.text),
        )
        .await?;
        Ok(())
    }

    fn ext_err(error: impl std::fmt::Display) -> AgentActionError {
        AgentActionError::NotFound(error.to_string())
    }

    async fn ext_method(&self, logical: &str, params: Value) -> Result<Value, AgentActionError> {
        timeout(
            EXT_TIMEOUT,
            self.control.send_ext_method(wire_method(logical), params),
        )
        .await
        .map_err(|_| Self::ext_err(format!("{logical} timed out")))?
        .map_err(Self::ext_err)
    }

    fn cwd_string(&self) -> String {
        self.cwd.to_string_lossy().into_owned()
    }

    async fn respond_session_op(
        &self,
        option_id: &str,
        target: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        match option_id {
            "fork" | "fork_no_worktree" => self.fork_session(self.cwd_string(), None).await,
            "fork_worktree" => self.fork_worktree().await,
            "rewind_conversation" | "rewind_code" | "rewind_both" => {
                let mode = rewind_mode_for_option(option_id)
                    .ok_or_else(|| AgentActionError::NotFound(option_id.to_string()))?;
                self.rewind_execute(target, mode).await?;
                Ok(AgentActionResult::unit())
            }
            other => Err(AgentActionError::NotFound(other.to_string())),
        }
    }

    async fn fork_session(
        &self,
        new_cwd: String,
        session_kind: Option<&str>,
    ) -> Result<AgentActionResult, AgentActionError> {
        let source_cwd = self.cwd_string();
        let result = self
            .ext_method(
                METHOD_SESSION_FORK,
                fork_session_params(&self.session_id, &source_cwd, &new_cwd, session_kind),
            )
            .await?;
        let child = forked_session_id(&result)
            .ok_or_else(|| Self::ext_err("session/fork missing newSessionId"))?;
        Ok(AgentActionResult::forked(child, Some(new_cwd)))
    }

    async fn fork_worktree(&self) -> Result<AgentActionResult, AgentActionError> {
        let mut waiter = self.control.subscribe_ext_notifications();
        let created = self
            .ext_method(
                METHOD_WORKTREE_CREATE,
                worktree_create_params(&self.session_id, &self.cwd_string()),
            )
            .await?;
        let from_create = worktree_path(&created);
        let path = if worktree_create_is_pending(&created) {
            match self.wait_worktree_path(&mut waiter).await {
                Ok(path) => path,
                Err(error) => from_create.ok_or(error)?,
            }
        } else {
            from_create.ok_or_else(|| Self::ext_err("worktree/create missing path"))?
        };
        self.fork_session(path, Some("worktree")).await
    }

    async fn wait_worktree_path(
        &self,
        rx: &mut broadcast::Receiver<(String, Value)>,
    ) -> Result<String, AgentActionError> {
        let want = METHOD_WORKTREE_STATUS;
        timeout(EXT_TIMEOUT, async {
            loop {
                match rx.recv().await {
                    Ok((method, params)) => {
                        let got = method.strip_prefix('_').unwrap_or(method.as_str());
                        if got != want {
                            continue;
                        }
                        if params.get("status").and_then(Value::as_str) == Some("progress") {
                            continue;
                        }
                        if let Some(path) = worktree_path(&params) {
                            return Ok(path);
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => {
                        return Err(Self::ext_err("worktree/status closed"));
                    }
                }
            }
        })
        .await
        .map_err(|_| Self::ext_err("worktree/status timed out"))?
    }

    async fn preview_rewind(&self, rest: &str) -> Result<AgentActionResult, AgentActionError> {
        let points = self
            .ext_method(METHOD_REWIND_POINTS, rewind_points_params(&self.session_id))
            .await?;
        Ok(AgentActionResult::rewind_preview(
            rewind_point_has_file_changes(&points, rest).unwrap_or(false),
        ))
    }

    async fn rewind_execute(
        &self,
        target: Option<&str>,
        mode: &str,
    ) -> Result<(), AgentActionError> {
        let index = self.resolve_prompt_index(target).await?;
        let result = self
            .ext_method(
                METHOD_REWIND_EXECUTE,
                rewind_execute_params(&self.session_id, index, true, mode),
            )
            .await?;
        if let Some(message) = rewind_execute_failed(&result) {
            return Err(Self::ext_err(message));
        }
        Ok(())
    }

    async fn resolve_prompt_index(&self, target: Option<&str>) -> Result<u64, AgentActionError> {
        let token = target
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AgentActionError::NotFound("rewind target".into()))?;
        let points = self
            .ext_method(METHOD_REWIND_POINTS, rewind_points_params(&self.session_id))
            .await?;
        if let Some(index) = resolve_target_prompt_index(token, &points) {
            return Ok(index);
        }
        if let Some(index) = self.turn_prompt_index.lock().await.get(token).copied() {
            if let Some(resolved) = resolve_target_prompt_index(&index.to_string(), &points) {
                return Ok(resolved);
            }
            return Ok(index);
        }
        Err(AgentActionError::NotFound(token.to_string()))
    }
}

struct GrokMappedSession {
    commands: Arc<GrokCommands>,
    handle: AcpSessionHandle,
    map: EventMapState,
    ext_rx: Option<broadcast::Receiver<(String, Value)>>,
}

#[async_trait]
impl AgentRuntime for GrokMappedSession {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.map.persistence.clone()
    }

    fn descriptor(&self) -> AgentDescriptor {
        self.map.descriptor()
    }

    async fn next_event(&mut self) -> Option<AgentEventEnvelope> {
        if let Some(event) = self.map.pending.pop_front() {
            return Some(event);
        }
        loop {
            tokio::select! {
                acp = self.handle.recv_event() => {
                    let acp = acp?;
                    while let Some((req, tx)) = self.handle.try_recv_permission() {
                        self.commands
                            .pending_permissions
                            .lock()
                            .await
                            .insert(req.request_id.clone(), tx);
                    }
                    let mut turn_id = self.commands.running_turn.lock().await.clone();
                    if matches!(
                        acp,
                        crate::acp_client::AcpSessionEvent::TurnEnd(_)
                            | crate::acp_client::AcpSessionEvent::Error { .. }
                    ) {
                        turn_id = self.commands.running_turn.lock().await.take();
                    }
                    if let Some(event) = map_event(&mut self.map, turn_id, acp) {
                        return Some(event);
                    }
                }
                ext = recv_ext_notification(&mut self.ext_rx) => {
                    let Some((method, params)) = ext else {
                        continue;
                    };
                    // Live catalog: `_x.ai/models/update` carries
                    // `availableModels[]._meta.totalContextTokens` (window).
                    if is_grok_models_update(&method) {
                        self.map.load_model_context_windows(&params);
                    }
                    if self.map.replaying {
                        continue;
                    }
                    let turn_id = self.commands.running_turn.lock().await.clone();
                    if let Some(payload) = map_xai_notification(&method, params) {
                        return Some(AgentEventEnvelope::new(turn_id, payload));
                    }
                }
            }
        }
    }
}

fn is_grok_models_update(method: &str) -> bool {
    let method = method.strip_prefix('_').unwrap_or(method);
    method == "x.ai/models/update" || method.ends_with("/models/update")
}

async fn recv_ext_notification(
    rx: &mut Option<broadcast::Receiver<(String, Value)>>,
) -> Option<(String, Value)> {
    loop {
        let Some(inner) = rx.as_mut() else {
            std::future::pending::<()>().await;
            return None;
        };
        match inner.recv().await {
            Ok(payload) => return Some(payload),
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => {
                *rx = None;
            }
        }
    }
}

/// Build Grok `set_config_option` attempts. Permission is NOT an ACP configId
/// (`session/set_config_option` is Method not found). Mid-session permission uses
/// slash prompts (`/always-approve`, `/auto`); Plan/Normal uses `session/set_mode`
/// via the mode write path (runner falls back when set_config is missing).
fn plan_set_config_writes(update: AgentRuntimeConfigUpdate) -> Vec<(Vec<String>, String)> {
    let mut writes = Vec::new();
    if let Some(model) = update.model {
        writes.push((config_alias_ids("model"), model));
    }
    if let Some(thinking) = update.thinking {
        writes.push((config_alias_ids("thinking"), thinking));
    }
    if let Some(mode) = update.mode.clone() {
        // Plan ↔ Normal: ACP `session/set_mode` (modeId plan|default).
        let mode_id = if crate::policy::is_plan_mode(Some(&mode)) {
            "plan".into()
        } else {
            "default".into()
        };
        writes.push((vec!["mode".into()], mode_id));
    }
    // Permission mode is applied via slash in `apply_set_config`, not config aliases.
    writes.extend(update.extra_config.into_iter().filter_map(|(id, value)| {
        if crate::options::is_permission_mode_config_id(&id) {
            return None;
        }
        Some((vec![id], value))
    }));
    writes
}

/// Grok mid-session permission slash (live CLI docs + available_commands).
/// `/always-approve on|off` and `/auto` are real toggles; accept_edits has no slash.
fn grok_permission_slash(permission: &str) -> Option<String> {
    use crate::policy::permission::{classify, AtmosPermission};
    match AtmosPermission::parse(permission).or_else(|| classify(permission)) {
        Some(AtmosPermission::Yolo) => Some("/always-approve on".into()),
        Some(AtmosPermission::AskAlways) => Some("/always-approve off".into()),
        Some(AtmosPermission::Auto) => Some("/auto".into()),
        Some(AtmosPermission::AcceptEdits) | None => None,
    }
}

async fn apply_set_config(
    control: &AcpSessionControl,
    update: AgentRuntimeConfigUpdate,
) -> AgentResult<()> {
    let permission_mode = update.permission_mode.clone();
    let wrote_mode = update.mode.is_some();
    for (ids, value) in plan_set_config_writes(update) {
        write_config_option(control, &ids, &value).await?;
    }
    if let Some(permission) = permission_mode {
        if crate::policy::is_plan_mode(Some(&permission)) {
            if !wrote_mode {
                write_config_option(control, &["mode".into()], "plan").await?;
            }
        } else if let Some(slash) = grok_permission_slash(&permission) {
            control
                .prompt_turn(slash, Vec::new())
                .await
                .map_err(AgentProviderError::message)?;
        }
    }
    Ok(())
}

fn config_alias_ids(field: &str) -> Vec<String> {
    match field {
        "model" => vec!["model".into(), "models".into()],
        "thinking" => vec!["thought_level".into(), "thinking".into(), "think".into()],
        "mode" => vec!["mode".into(), "modes".into()],
        "permission_mode" => vec![
            "permissionMode".into(),
            "permission_mode".into(),
            "permission".into(),
            "approval".into(),
        ],
        other => vec![other.to_string()],
    }
}

async fn write_config_option(
    control: &AcpSessionControl,
    ids: &[String],
    value: &str,
) -> AgentResult<()> {
    let mut last_error = None;
    for config_id in ids {
        match control
            .set_config_option(config_id.clone(), value.to_string())
            .await
        {
            Ok(_) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }
    Err(AgentProviderError::unsupported(
        last_error.unwrap_or_else(|| format!("agent did not apply {value}")),
    ))
}

fn provider_descriptor(current: AgentCurrentConfig) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: "grok".into(),
            name: "Grok".into(),
            version: None,
        },
        capabilities: capabilities_for_provider("grok"),
        support: option_support_for_provider("grok"),
        supported_options: AgentSupportedOptions::default(),
        current_config: current,
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
        fast: None,
    }
}

async fn open_grok_session(
    program: &str,
    provider_env: Option<&HashMap<String, String>>,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let vendor = crate::policy::vendor_permission_for_spawn(
        "grok",
        cfg.mode.as_deref(),
        cfg.permission_mode.as_deref(),
    );
    let default_config = if resume.is_some() {
        None
    } else {
        let mut extra = cfg.extra_config.clone();
        if let Some(model) = cfg.model.clone() {
            extra.insert("model".into(), model);
        }
        if let Some(thinking) = cfg.thinking.clone() {
            extra.insert("thought_level".into(), thinking);
        }
        if let Some(mode) = cfg.mode.clone() {
            extra.insert("mode".into(), mode);
        }
        // Permission is the parent `--permission-mode` flag only. Do not seed
        // permissionMode into default_config (set_config_option WARN / soft-fail).
        if extra.is_empty() {
            None
        } else {
            Some(extra)
        }
    };
    let env = merge_env(provider_env, &cfg);
    let launch = launch_spec(
        program,
        cfg.model.as_deref(),
        vendor.as_deref(),
        env.clone(),
    );
    let handler = Arc::new(GrokFsHandler {
        allow_file_access: cfg.allow_file_access,
    });
    let handle = run_acp_session(
        uuid::Uuid::new_v4().to_string(),
        launch,
        cfg.cwd.clone(),
        handler,
        env,
        resume.clone(),
        cfg.auth_method_id.clone(),
        default_config,
        None,
    )
    .await
    .map_err(AgentProviderError::message)?;
    let commands = Arc::new(GrokCommands {
        control: handle.control(),
        session_id: handle.session_id.clone(),
        cwd: cfg.cwd.clone(),
        running_turn: Mutex::new(None),
        pending_permissions: Mutex::new(HashMap::new()),
        turn_prompt_index: Mutex::new(HashMap::new()),
        prompt_n: Mutex::new(0),
    });
    let ext_rx = Some(handle.subscribe_ext_notifications());
    Ok(Box::new(GrokMappedSession {
        commands,
        handle,
        map: EventMapState::new("grok".into(), current_config_from(&cfg), resume.is_some()),
        ext_rx,
    }))
}

#[async_trait]
impl AgentProvider for GrokNativeProvider {
    fn id(&self) -> &str {
        "grok"
    }

    async fn descriptor(&self, _ctx: &AgentOptionsContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor(AgentCurrentConfig::default()))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        open_grok_session(&self.program, self.env.as_ref(), cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        open_grok_session(&self.program, self.env.as_ref(), cfg, Some(handle.0)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentEvent;
    use crate::contract::Capability;
    use crate::contract::SessionOpKind;
    use crate::models::AgentLaunchSpec;

    #[tokio::test]
    async fn grok_descriptor_is_native_honesty() {
        let provider = GrokNativeProvider::new();
        let descriptor = provider
            .descriptor(&AgentOptionsContext::default())
            .await
            .unwrap();
        assert_eq!(descriptor.identity.id, "grok");
        assert_eq!(descriptor.capabilities.steer, Capability::Supported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
        assert_eq!(descriptor.capabilities.fork, Capability::Supported);
        assert_eq!(descriptor.capabilities.rewind, Capability::Supported);
        assert_eq!(
            GrokNativeProvider::chat_argv(None),
            vec!["--permission-mode", "default", "agent", "stdio"]
        );
        let argv = GrokNativeProvider::chat_argv(None);
        assert!(!argv
            .iter()
            .any(|arg| arg == "--always-approve" || arg == "--yolo"));
        let runner = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/acp_client/runner.rs"
        ));
        let production = runner.split("#[cfg(test)]").next().unwrap_or(runner);
        assert!(production.contains("NewSessionRequest::new"));
        assert!(
            !production.contains("yoloMode"),
            "generic ACP session/new must not set Grok yoloMode"
        );
        assert_eq!(
            GrokNativeProvider::chat_argv(Some("grok-4.6")),
            vec![
                "--permission-mode",
                "default",
                "agent",
                "--model",
                "grok-4.6",
                "stdio"
            ]
        );
        let spec = AgentLaunchSpec {
            program: "/opt/grok".into(),
            args: vec!["-p".into()],
            env: None,
        };
        assert_eq!(
            GrokNativeProvider::from_launch_spec(&spec).program(),
            "/opt/grok"
        );
    }

    #[tokio::test]
    async fn grok_steer_dispatches_interject() {
        let dispatched = dispatch_grok_action(AgentAction::Steer {
            input: AgentPrompt {
                text: "nudge".into(),
                ..AgentPrompt::default()
            },
        })
        .expect("steer");
        assert!(matches!(
            dispatched,
            GrokDispatchedAction::Steer { input } if input.text == "nudge"
        ));
    }

    #[test]
    fn grok_respond_session_op_is_dispatched() {
        let dispatched = dispatch_grok_action(AgentAction::RespondSessionOp {
            request_id: "op".into(),
            option_id: "fork_no_worktree".into(),
            target: None,
        })
        .expect("dispatch");
        assert!(matches!(
            dispatched,
            GrokDispatchedAction::RespondSessionOp {
                option_id,
                ..
            } if option_id == "fork_no_worktree"
        ));
    }

    #[test]
    fn grok_permission_set_config_uses_mode_not_permission_aliases() {
        let writes = plan_set_config_writes(AgentRuntimeConfigUpdate {
            permission_mode: Some("yolo".into()),
            mode: Some("plan".into()),
            extra_config: [
                ("permissionMode".into(), "bypassPermissions".into()),
                ("model".into(), "grok-4".into()),
            ]
            .into_iter()
            .collect(),
            ..AgentRuntimeConfigUpdate::default()
        });
        let pairs: Vec<(Vec<&str>, &str)> = writes
            .iter()
            .map(|(ids, value)| (ids.iter().map(String::as_str).collect(), value.as_str()))
            .collect();
        assert!(pairs
            .iter()
            .any(|(ids, value)| ids == &["mode"] && *value == "plan"));
        assert!(pairs
            .iter()
            .any(|(ids, value)| ids.contains(&"model") && *value == "grok-4"));
        assert!(
            !pairs.iter().any(|(ids, _)| {
                ids.iter().any(|id| {
                    matches!(
                        *id,
                        "permissionMode" | "permission_mode" | "permission" | "approval"
                    )
                })
            }),
            "unexpected permission writes: {pairs:?}"
        );
        assert_eq!(
            grok_permission_slash("yolo").as_deref(),
            Some("/always-approve on")
        );
        assert_eq!(
            grok_permission_slash("ask_always").as_deref(),
            Some("/always-approve off")
        );
        assert_eq!(grok_permission_slash("auto").as_deref(), Some("/auto"));
        assert!(grok_permission_slash("accept_edits").is_none());
        assert!(!crate::policy::acp_permission_via_config_option("grok"));
    }

    const FAKE_GROK: &str = r#"#!/usr/bin/env python3
import json, os, sys

log = os.environ.get("FAKE_GROK_LOG")

def rec(obj):
    if log:
        with open(log, "a") as f:
            f.write(json.dumps(obj) + "\n")

def write(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def reply(msg, result):
    write({"jsonrpc": "2.0", "id": msg.get("id"), "result": result})

def error(msg, code, message):
    write({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": code, "message": message}})

def notify(method, params):
    write({"jsonrpc": "2.0", "method": method, "params": params})

pending_prompt = None
for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    msg = json.loads(line)
    method = msg.get("method")
    rec({"method": method, "params": msg.get("params")})
    if method == "initialize":
        reply(msg, {"protocolVersion": 1, "agentCapabilities": {"loadSession": True}})
    elif method == "session/new":
        reply(msg, {"sessionId": "sess_grok_1"})
    elif method == "session/load":
        reply(msg, {"sessionId": msg.get("params", {}).get("sessionId") or "sess_grok_1"})
    elif method == "session/prompt":
        rec({"prompt": msg.get("params")})
        text = ""
        for block in (msg.get("params") or {}).get("prompt") or []:
            if isinstance(block, dict) and block.get("type") == "text":
                text += block.get("text") or ""
        if text.startswith("/"):
            reply(msg, {"stopReason": "end_turn"})
        else:
            pending_prompt = msg
    elif method == "session/set_mode":
        params = msg.get("params") or {}
        rec({"set_mode": params})
        mode_id = params.get("modeId") or "default"
        notify("session/update", {
            "sessionId": params.get("sessionId") or "sess_grok_1",
            "update": {"sessionUpdate": "current_mode_update", "currentModeId": mode_id},
        })
        reply(msg, {})
    elif method == "session/set_config_option":
        error(msg, -32601, "Method not found")
    elif method == "_x.ai/interject":
        rec({"interject": msg.get("params")})
        reply(msg, {})
        if pending_prompt is not None:
            reply(pending_prompt, {"stopReason": "end_turn"})
            pending_prompt = None
    elif method == "session/cancel":
        if pending_prompt is not None:
            reply(pending_prompt, {"stopReason": "cancelled"})
            pending_prompt = None
    elif method == "session/close":
        if pending_prompt is not None:
            reply(pending_prompt, {"stopReason": "cancelled"})
            pending_prompt = None
        reply(msg, {})
        break
    elif method == "_x.ai/session/fork":
        params = msg.get("params") or {}
        rec({"fork": params})
        reply(msg, {"newSessionId": "sess_child", "sessionId": "sess_child"})
    elif method == "_x.ai/rewind/points":
        reply(msg, {"rewind_points": [
            {"prompt_index": 1, "id": "turn-b", "has_file_changes": False, "num_file_snapshots": 0, "prompt_preview": "b"},
            {"prompt_index": 2, "id": "turn-a", "has_file_changes": True, "num_file_snapshots": 1, "prompt_preview": "a"}
        ]})
    elif method == "_x.ai/rewind/execute":
        params = msg.get("params") or {}
        rec({"rewind": params})
        reply(msg, {"success": True, "target_prompt_index": params.get("targetPromptIndex"), "mode": params.get("mode"), "reverted_files": [], "error": None})
    elif method == "_x.ai/git/worktree/create":
        params = msg.get("params") or {}
        rec({"worktree": params})
        creating = {
            "status": "creating",
            "sessionId": params.get("sessionId") or "sess_grok_1",
            "worktreePath": "/tmp/wt",
            "sourceGitRoot": "/tmp/project",
        }
        if os.environ.get("FAKE_GROK_WT_CREATING") == "1":
            reply(msg, {"result": creating})
            notify("_x.ai/git/worktree/status", {"status": "progress", "sessionId": creating["sessionId"], "message": "Creating worktree with fast CoW copy..."})
            notify("_x.ai/git/worktree/status", {"status": "created", "sessionId": creating["sessionId"], "worktreePath": "/tmp/wt", "sourceGitRoot": "/tmp/project"})
        else:
            reply(msg, {"result": {"status": "exists", "worktreePath": "/tmp/wt"}})
    elif isinstance(method, str) and method.startswith("x.ai/"):
        error(msg, -32601, "Method not found")
    else:
        error(msg, -32601, "Method not found")
"#;

    struct FakeBin {
        _dir: tempfile::TempDir,
        program: PathBuf,
        log: PathBuf,
    }

    fn write_fake() -> FakeBin {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let program = dir.path().join("grok");
        std::fs::write(&program, FAKE_GROK).expect("write");
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

    fn fake_cfg(fake: &FakeBin, creating: bool) -> AgentRuntimeConfig {
        let mut env = HashMap::new();
        env.insert(
            "FAKE_GROK_LOG".into(),
            fake.log.to_string_lossy().into_owned(),
        );
        env.insert("PYTHONUNBUFFERED".into(), "1".into());
        if creating {
            env.insert("FAKE_GROK_WT_CREATING".into(), "1".into());
        }
        AgentRuntimeConfig {
            cwd: PathBuf::from("/tmp/project"),
            env_overrides: Some(env),
            ..AgentRuntimeConfig::default()
        }
    }

    fn log_entries(log: &PathBuf) -> Vec<Value> {
        std::fs::read_to_string(log)
            .unwrap_or_default()
            .lines()
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect()
    }

    async fn await_session_started(runtime: &mut Box<dyn AgentRuntime>) {
        for _ in 0..40 {
            match timeout(Duration::from_secs(2), runtime.next_event()).await {
                Ok(Some(envelope)) => {
                    if matches!(envelope.payload, AgentEvent::SessionStarted { .. }) {
                        return;
                    }
                }
                Ok(None) => panic!("session closed before SessionStarted"),
                Err(_) => continue,
            }
        }
        panic!("no SessionStarted");
    }

    #[tokio::test]
    async fn fake_runtime_set_config_permission_sends_slash_and_mode_uses_set_mode() {
        let fake = write_fake();
        let provider =
            GrokNativeProvider::with_program(fake.program.to_string_lossy().into_owned());
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, false))
            .await
            .expect("runtime");
        await_session_started(&mut runtime).await;

        runtime
            .control()
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("permission slash");
        runtime
            .control()
            .set_config(AgentRuntimeConfigUpdate {
                mode: Some("plan".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("plan mode");

        let entries = log_entries(&fake.log);
        let slash = entries.iter().find_map(|entry| {
            entry.get("prompt").and_then(|params| {
                let blocks = params.get("prompt")?.as_array()?;
                blocks.first()?.get("text")?.as_str().map(str::to_string)
            })
        });
        assert_eq!(slash.as_deref(), Some("/always-approve on"));
        let set_mode = entries
            .iter()
            .find_map(|entry| entry.get("set_mode").cloned())
            .expect("session/set_mode after set_config_option Method not found");
        assert_eq!(set_mode["modeId"], "plan");
        // Runner may probe set_config_option(mode) first; Grok replies -32601 then set_mode.
        assert!(
            !entries.iter().any(|entry| {
                entry.get("method").and_then(Value::as_str) == Some("session/set_config_option")
                    && entry
                        .get("params")
                        .and_then(|p| p.get("configId"))
                        .and_then(Value::as_str)
                        .is_some_and(|id| {
                            matches!(
                                id,
                                "permissionMode" | "permission_mode" | "permission" | "approval"
                            )
                        })
            }),
            "must not guess permission configIds on Grok"
        );
        runtime.control().close().await.ok();
    }

    #[tokio::test]
    async fn fake_runtime_permission_slash_does_not_emit_turn_completed() {
        // Live bug: apply_pending_session_config → prompt_turn("/always-approve")
        // emitted TurnEnd, which raced with the following user send and completed
        // (then dropped) the Atmos turn. Slash must stay an internal RPC.
        let fake = write_fake();
        let provider =
            GrokNativeProvider::with_program(fake.program.to_string_lossy().into_owned());
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, false))
            .await
            .expect("runtime");
        await_session_started(&mut runtime).await;

        runtime
            .control()
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("permission slash");
        runtime
            .control()
            .send(AgentPrompt {
                text: "hello".into(),
                turn_id: Some("turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");

        for _ in 0..20 {
            match tokio::time::timeout(Duration::from_millis(50), runtime.next_event()).await {
                Ok(Some(event)) => {
                    assert!(
                        !matches!(
                            event.payload,
                            AgentEvent::TurnCompleted { .. }
                                | AgentEvent::TurnFailed { .. }
                                | AgentEvent::TurnCanceled { .. }
                        ),
                        "permission slash must not complete the user turn early: {:?}",
                        event.payload
                    );
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }

        runtime.control().cancel().await.expect("cancel");
        let mut saw_stop = false;
        for _ in 0..40 {
            match tokio::time::timeout(Duration::from_millis(200), runtime.next_event()).await {
                Ok(Some(event)) => {
                    if matches!(
                        event.payload,
                        AgentEvent::TurnCompleted { .. }
                            | AgentEvent::TurnFailed { .. }
                            | AgentEvent::TurnCanceled { .. }
                    ) {
                        saw_stop = true;
                        break;
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
        assert!(
            saw_stop,
            "user turn should still end via real session/prompt result"
        );
        runtime.control().close().await.ok();
    }

    #[tokio::test]
    async fn fake_runtime_steer_sends_interject_not_second_prompt() {
        let fake = write_fake();
        let provider =
            GrokNativeProvider::with_program(fake.program.to_string_lossy().into_owned());
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, false))
            .await
            .expect("runtime");
        await_session_started(&mut runtime).await;

        runtime
            .control()
            .send(AgentPrompt {
                text: "hello".into(),
                turn_id: Some("turn-1".into()),
                ..AgentPrompt::default()
            })
            .await
            .expect("send");

        for _ in 0..40 {
            if log_entries(&fake.log)
                .iter()
                .any(|entry| entry.get("method").and_then(Value::as_str) == Some("session/prompt"))
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        runtime
            .control()
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "nudge".into(),
                    turn_id: Some("turn-1".into()),
                    ..AgentPrompt::default()
                },
            })
            .await
            .expect("steer");

        let entries = log_entries(&fake.log);
        let prompt_count = entries
            .iter()
            .filter(|entry| entry.get("method").and_then(Value::as_str) == Some("session/prompt"))
            .count();
        assert_eq!(prompt_count, 1);
        let interject = entries
            .iter()
            .find_map(|entry| entry.get("interject").cloned())
            .expect("interject");
        assert_eq!(interject["sessionId"], "sess_grok_1");
        assert_eq!(interject["text"], "nudge");
        runtime.control().close().await.ok();
    }

    #[tokio::test]
    async fn app069_s17_s19_grok_session_ops_send_underscored_xai_methods() {
        let fake = write_fake();
        let provider =
            GrokNativeProvider::with_program(fake.program.to_string_lossy().into_owned());
        let mut runtime = provider
            .create_runtime(fake_cfg(&fake, true))
            .await
            .expect("runtime");
        await_session_started(&mut runtime).await;

        let no_files = runtime
            .control()
            .action(AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Rewind,
                rest: "turn-b".into(),
            })
            .await
            .expect("prepare rewind without files");
        assert_eq!(no_files.has_file_changes, Some(false));
        let with_files = runtime
            .control()
            .action(AgentAction::PrepareSessionOp {
                kind: SessionOpKind::Rewind,
                rest: "turn-a".into(),
            })
            .await
            .expect("prepare rewind with files");
        assert_eq!(with_files.has_file_changes, Some(true));

        let forked = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op".into(),
                option_id: "fork_no_worktree".into(),
                target: None,
            })
            .await
            .expect("fork");
        assert_eq!(forked.new_session_id.as_deref(), Some("sess_child"));
        assert_eq!(forked.new_cwd.as_deref(), Some("/tmp/project"));

        runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op2".into(),
                option_id: "rewind_conversation".into(),
                target: Some("2".into()),
            })
            .await
            .expect("rewind");

        let worktree = runtime
            .control()
            .action(AgentAction::RespondSessionOp {
                request_id: "op3".into(),
                option_id: "fork_worktree".into(),
                target: None,
            })
            .await
            .expect("worktree");
        assert_eq!(worktree.new_session_id.as_deref(), Some("sess_child"));
        assert_eq!(worktree.new_cwd.as_deref(), Some("/tmp/wt"));

        let methods: Vec<String> = log_entries(&fake.log)
            .into_iter()
            .filter_map(|entry| {
                entry
                    .get("method")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect();
        assert!(
            methods.iter().any(|method| method == "_x.ai/session/fork"),
            "missing underscored fork, got {methods:?}"
        );
        assert!(methods.iter().any(|method| method == "_x.ai/rewind/points"));
        assert!(methods
            .iter()
            .any(|method| method == "_x.ai/rewind/execute"));
        assert!(methods
            .iter()
            .any(|method| method == "_x.ai/git/worktree/create"));
        assert!(!methods.iter().any(|method| method == "x.ai/session/fork"));
        assert!(!methods.iter().any(|method| method == "x.ai/rewind/execute"));
        assert!(
            !methods
                .iter()
                .any(|method| method.contains("git worktree") || method == "git"),
            "Atmos must not invoke git worktree, got {methods:?}"
        );
        let create_at = methods
            .iter()
            .position(|method| method == "_x.ai/git/worktree/create")
            .expect("worktree create");
        let worktree_fork_at =
            log_entries(&fake.log)
                .iter()
                .enumerate()
                .find_map(|(idx, entry)| {
                    entry
                        .get("fork")
                        .and_then(|params| params.get("sessionKind"))
                        .and_then(Value::as_str)
                        .filter(|kind| *kind == "worktree")
                        .map(|_| idx)
                });
        let method_fork_after = methods
            .iter()
            .enumerate()
            .filter(|(_, method)| method.as_str() == "_x.ai/session/fork")
            .map(|(idx, _)| idx)
            .find(|idx| *idx > create_at)
            .expect("fork after worktree create");
        assert!(
            create_at < method_fork_after,
            "worktree create must precede fork, create={create_at} fork={method_fork_after}"
        );
        let _ = worktree_fork_at;
        let rewind = log_entries(&fake.log)
            .into_iter()
            .find_map(|entry| entry.get("rewind").cloned())
            .expect("rewind params");
        assert_eq!(rewind["force"], true);
        assert_eq!(rewind["mode"], "conversation_only");
        assert_eq!(rewind["targetPromptIndex"], 2);
        let wt = log_entries(&fake.log)
            .into_iter()
            .find_map(|entry| entry.get("worktree").cloned())
            .expect("worktree params");
        assert_eq!(wt["sourcePath"], "/tmp/project");
        assert!(wt.get("label").is_none());
        assert!(wt.get("name").is_none());
        assert!(wt.get("branch").is_none());
        let fork_wt = log_entries(&fake.log)
            .into_iter()
            .filter_map(|entry| entry.get("fork").cloned())
            .find(|params| params.get("sessionKind").and_then(Value::as_str) == Some("worktree"))
            .expect("worktree fork");
        assert_eq!(fork_wt["newCwd"], "/tmp/wt");
        let grok_rpc = include_str!("rpc.rs");
        let grok_mod = include_str!("mod.rs");
        let grok_spawn = include_str!("spawn.rs");
        for src in [grok_rpc, grok_mod, grok_spawn] {
            let production = src.split("#[cfg(test)]").next().unwrap_or(src);
            assert!(
                !production.contains("git worktree"),
                "Grok adapter must not run git worktree"
            );
            assert!(!production.contains("Command::new(\"git\")"));
            assert!(!production.contains("git checkout"));
        }
        runtime.control().close().await.ok();
    }
}
