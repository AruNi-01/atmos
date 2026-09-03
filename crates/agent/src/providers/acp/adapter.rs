use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{oneshot, Mutex};

use crate::acp_client::{run_acp_session, AcpSessionControl, AcpSessionHandle, AcpToolHandler};
use crate::contract::AgentEventEnvelope;
use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
use crate::contract::{
    AgentCatalogContext, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentRuntimeControl, AgentTurnHandle,
};
use crate::contract::{AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentSupportedOptions};
use crate::models::AgentLaunchSpec;
use crate::policy::{capabilities_for_provider, option_support_for_provider};

use super::event_map::{map_event, EventMapState};

pub struct AcpProviderParams {
    pub provider_id: String,
    pub launch_spec: AgentLaunchSpec,
    pub env_overrides: Option<std::collections::HashMap<String, String>>,
    pub default_config: Option<std::collections::HashMap<String, String>>,
    pub tool_handler: Arc<dyn AcpToolHandler>,
}

pub struct AcpAgentProvider {
    params: AcpProviderParams,
}

impl AcpAgentProvider {
    pub fn new(params: AcpProviderParams) -> Self {
        Self { params }
    }
}

struct AcpCommands {
    control: AcpSessionControl,
    running_turn: Mutex<Option<String>>,
    pending_permissions: Mutex<HashMap<String, oneshot::Sender<String>>>,
}

pub(crate) enum AcpDispatchedAction {
    RespondPermission {
        request_id: String,
        option_id: String,
    },
    SetConfig {
        update: AgentRuntimeConfigUpdate,
    },
}

/// Session-independent ACP `action` dispatch. Steer is rejected here so it
/// cannot become a second `session/prompt`.
pub(crate) fn dispatch_acp_action(
    action: AgentAction,
) -> Result<AcpDispatchedAction, AgentActionError> {
    match action {
        AgentAction::Steer { .. } => Err(AgentActionError::Unsupported {
            action: AgentActionKind::Steer,
        }),
        AgentAction::RespondPermission {
            request_id,
            option_id,
        } => Ok(AcpDispatchedAction::RespondPermission {
            request_id,
            option_id,
        }),
        AgentAction::SetConfig { update } => Ok(AcpDispatchedAction::SetConfig { update }),
        AgentAction::PrepareSessionOp { .. } => Err(AgentActionError::Unsupported {
            action: AgentActionKind::PrepareSessionOp,
        }),
        AgentAction::RespondSessionOp { .. } => Err(AgentActionError::Unsupported {
            action: AgentActionKind::RespondSessionOp,
        }),
    }
}

#[async_trait]
impl AgentRuntimeCommands for AcpCommands {
    async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        let turn_id = input
            .turn_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
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
        match dispatch_acp_action(action)? {
            AcpDispatchedAction::RespondPermission {
                request_id,
                option_id,
            } => {
                let tx = self
                    .pending_permissions
                    .lock()
                    .await
                    .remove(&request_id)
                    .ok_or_else(|| AgentActionError::NotFound(request_id))?;
                let _ = tx.send(option_id);
                Ok(AgentActionResult::unit())
            }
            AcpDispatchedAction::SetConfig { update } => apply_set_config(&self.control, update)
                .await
                .map(|()| AgentActionResult::unit())
                .map_err(|_| AgentActionError::Unsupported {
                    action: AgentActionKind::SetConfig,
                }),
        }
    }
}

impl AcpCommands {
    async fn fail_pending_permissions(&self) {
        self.pending_permissions.lock().await.clear();
    }
}

struct AcpMappedSession {
    commands: Arc<AcpCommands>,
    handle: AcpSessionHandle,
    map: EventMapState,
}

#[async_trait]
impl AgentRuntime for AcpMappedSession {
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
            let acp = self.handle.recv_event().await?;
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
    }
}

/// ACP: JSON-RPC success is the success signal. The returned `configOptions`
/// replace client state via `ConfigChanged`; do not second-guess `currentValue`.
async fn apply_set_config(
    control: &AcpSessionControl,
    update: AgentRuntimeConfigUpdate,
) -> AgentResult<()> {
    let mut writes = Vec::new();
    if let Some(model) = update.model {
        writes.push((config_alias_ids("model"), model));
    }
    if let Some(thinking) = update.thinking {
        writes.push((config_alias_ids("thinking"), thinking));
    }
    if let Some(mode) = update.mode.clone() {
        writes.push((config_alias_ids("mode"), mode.clone()));
        if crate::policy::is_plan_mode(Some(&mode)) {
            writes.push((config_alias_ids("permission_mode"), "plan".into()));
        }
    }
    if let Some(permission_mode) = update.permission_mode {
        if !crate::policy::is_plan_mode(Some(&permission_mode))
            && !crate::policy::is_plan_mode(update.mode.as_deref())
        {
            let vendor = crate::policy::atmos_permission_to_vendor("acp", &permission_mode)
                .unwrap_or(permission_mode);
            writes.push((config_alias_ids("permission_mode"), vendor));
        }
    }
    writes.extend(update.extra_config.into_iter().map(|(id, value)| {
        let value = if crate::catalog::is_permission_mode_config_id(&id) {
            if crate::policy::is_plan_mode(Some(&value)) {
                value
            } else {
                crate::policy::atmos_permission_to_vendor("acp", &value).unwrap_or(value)
            }
        } else {
            value
        };
        (vec![id], value)
    }));
    for (ids, value) in writes {
        write_config_option(control, &ids, &value).await?;
    }
    Ok(())
}

pub(crate) fn config_alias_ids(field: &str) -> Vec<String> {
    match field {
        "model" => vec!["model".into(), "models".into()],
        "thinking" => vec![
            "reasoning_effort".into(),
            "thought_level".into(),
            "thinking".into(),
            "think".into(),
        ],
        "mode" => vec![
            "mode".into(),
            "modes".into(),
            "agent".into(),
            "agents".into(),
        ],
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

fn current_config_from_maps(
    defaults: Option<&HashMap<String, String>>,
    cfg: &AgentRuntimeConfig,
) -> AgentCurrentConfig {
    let mut current = AgentCurrentConfig {
        model: cfg.model.clone(),
        thinking: cfg.thinking.clone(),
        mode: cfg.mode.clone(),
        permission_mode: cfg
            .permission_mode
            .as_deref()
            .and_then(crate::policy::normalize_stored_permission)
            .or_else(|| cfg.permission_mode.clone()),
        ..AgentCurrentConfig::default()
    };
    if let Some(defaults) = defaults {
        if current.model.is_none() {
            current.model = first_alias(defaults, &["model", "models"]);
        }
        if current.thinking.is_none() {
            current.thinking = first_alias(
                defaults,
                &["reasoning_effort", "thought_level", "thinking", "think"],
            );
        }
        if current.mode.is_none() {
            current.mode = first_alias(defaults, &["mode", "modes"]);
        }
        if current.permission_mode.is_none() {
            let raw = first_alias(
                defaults,
                &[
                    "permissionMode",
                    "permission_mode",
                    "permission",
                    "approval",
                ],
            );
            if crate::policy::is_plan_mode(raw.as_deref()) {
                if current.mode.is_none() {
                    current.mode = Some("plan".into());
                }
            } else {
                current.permission_mode = raw
                    .as_deref()
                    .and_then(crate::policy::normalize_stored_permission)
                    .or(raw);
            }
        }
    }
    current
}

fn first_alias(map: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| map.get(*key).cloned())
        .filter(|value| !value.is_empty())
}

fn provider_descriptor(params: &AcpProviderParams) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: params.provider_id.clone(),
            name: params.provider_id.clone(),
            version: None,
        },
        capabilities: capabilities_for_provider(&params.provider_id),
        support: option_support_for_provider(&params.provider_id),
        supported_options: AgentSupportedOptions::default(),
        current_config: current_config_from_maps(
            params.default_config.as_ref(),
            &AgentRuntimeConfig::default(),
        ),
    }
}

async fn open_acp_session(
    params: &AcpProviderParams,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let default_config = if resume.is_some() {
        None
    } else {
        let mut extra = cfg.extra_config.clone();
        if let Some(model) = cfg.model.clone() {
            extra.insert("model".into(), model);
        }
        if let Some(thinking) = cfg.thinking.clone() {
            extra.insert("reasoning_effort".into(), thinking.clone());
            extra.insert("thought_level".into(), thinking);
        }
        if let Some(mode) = cfg.mode.clone() {
            extra.insert("mode".into(), mode.clone());
            extra.insert("agent".into(), mode);
        }
        let vendor = crate::policy::vendor_permission_for_spawn(
            &params.provider_id,
            cfg.mode.as_deref(),
            cfg.permission_mode.as_deref(),
        )
        .or_else(|| {
            cfg.permission_mode
                .as_deref()
                .and_then(|raw| crate::policy::atmos_permission_to_vendor(&params.provider_id, raw))
        });
        if let Some(permission_mode) = vendor {
            extra.insert("permissionMode".into(), permission_mode.clone());
            extra.insert("permission_mode".into(), permission_mode);
        }
        let mut default_config = params.default_config.clone().unwrap_or_default();
        default_config.extend(extra);
        if default_config.is_empty() {
            None
        } else {
            Some(default_config)
        }
    };
    let env = match (params.env_overrides.clone(), cfg.env_overrides.clone()) {
        (Some(mut a), Some(b)) => {
            a.extend(b);
            Some(a)
        }
        (a, b) => a.or(b),
    };
    let handle = run_acp_session(
        uuid::Uuid::new_v4().to_string(),
        params.launch_spec.clone(),
        cfg.cwd.clone(),
        Arc::clone(&params.tool_handler),
        env,
        resume.clone(),
        cfg.auth_method_id.clone(),
        default_config,
        None,
    )
    .await
    .map_err(AgentProviderError::message)?;
    let commands = Arc::new(AcpCommands {
        control: handle.control(),
        running_turn: Mutex::new(None),
        pending_permissions: Mutex::new(HashMap::new()),
    });
    Ok(Box::new(AcpMappedSession {
        commands,
        handle,
        map: EventMapState::new(
            params.provider_id.clone(),
            current_config_from_maps(params.default_config.as_ref(), &cfg),
            resume.is_some(),
        ),
    }))
}

#[async_trait]
impl AgentProvider for AcpAgentProvider {
    fn id(&self) -> &str {
        &self.params.provider_id
    }

    async fn descriptor(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor> {
        Ok(provider_descriptor(&self.params))
    }

    async fn create_runtime(&self, cfg: AgentRuntimeConfig) -> AgentResult<Box<dyn AgentRuntime>> {
        open_acp_session(&self.params, cfg, None).await
    }

    async fn resume_runtime(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentRuntimeConfig,
    ) -> AgentResult<Box<dyn AgentRuntime>> {
        open_acp_session(&self.params, cfg, Some(handle.0)).await
    }
}

#[cfg(test)]
mod tests {
    use super::{
        config_alias_ids, dispatch_acp_action, provider_descriptor, AcpDispatchedAction,
        AcpProviderParams,
    };
    use crate::acp_client::tools::AcpToolHandler;
    use crate::contract::Capability;
    use crate::contract::{AgentAction, AgentActionError, AgentActionKind, AgentActionResult};
    use crate::contract::{
        AgentPrompt, AgentResult, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeControl,
        AgentTurnHandle,
    };
    use crate::models::AgentLaunchSpec;
    use async_trait::async_trait;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    struct NoopTools;

    #[async_trait]
    impl AcpToolHandler for NoopTools {
        fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
            session_cwd.join(path)
        }

        async fn read_text_file(&self, _path: &Path) -> Result<String, String> {
            Err("noop".into())
        }

        async fn write_text_file(&self, _path: &Path, _content: &str) -> Result<(), String> {
            Err("noop".into())
        }
    }

    #[test]
    fn set_config_tries_model_then_models() {
        assert_eq!(config_alias_ids("model"), vec!["model", "models"]);
        assert_eq!(
            config_alias_ids("thinking"),
            vec!["reasoning_effort", "thought_level", "thinking", "think"]
        );
        assert_eq!(
            config_alias_ids("mode"),
            vec!["mode", "modes", "agent", "agents"]
        );
    }

    #[test]
    fn acp_descriptor_uses_honesty_matrix() {
        let params = AcpProviderParams {
            provider_id: "gemini".into(),
            launch_spec: AgentLaunchSpec {
                program: "gemini".into(),
                args: vec!["acp".into()],
                env: None,
            },
            env_overrides: None,
            default_config: None,
            tool_handler: Arc::new(NoopTools),
        };
        let descriptor = provider_descriptor(&params);
        assert_eq!(descriptor.identity.id, "gemini");
        assert_eq!(descriptor.capabilities.steer, Capability::Unsupported);
        assert_eq!(descriptor.capabilities.resume, Capability::Supported);
        assert_eq!(descriptor.capabilities.permission, Capability::Supported);
        assert_eq!(descriptor.capabilities.configure, Capability::Supported);
        let _ = AgentRuntimeConfig::default();
    }

    #[derive(Default)]
    struct AcpCommandsProbe {
        send: AtomicUsize,
        send_prompt: AtomicUsize,
    }

    #[async_trait]
    impl AgentRuntimeCommands for AcpCommandsProbe {
        async fn send(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
            self.send.fetch_add(1, Ordering::SeqCst);
            self.send_prompt.fetch_add(1, Ordering::SeqCst);
            let turn_id = input
                .turn_id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            Ok(AgentTurnHandle { turn_id })
        }

        async fn cancel(&self) -> AgentResult<()> {
            Ok(())
        }

        async fn close(&self) -> AgentResult<()> {
            Ok(())
        }

        async fn action(&self, action: AgentAction) -> Result<AgentActionResult, AgentActionError> {
            match dispatch_acp_action(action)? {
                AcpDispatchedAction::RespondPermission { .. }
                | AcpDispatchedAction::SetConfig { .. } => Ok(AgentActionResult::unit()),
            }
        }
    }

    #[tokio::test]
    async fn steer_action_is_unsupported_without_second_prompt() {
        let probe = Arc::new(AcpCommandsProbe::default());
        let commands = AgentRuntimeControl::new(probe.clone());
        let error = commands
            .action(AgentAction::Steer {
                input: AgentPrompt {
                    text: "nudge".into(),
                    ..AgentPrompt::default()
                },
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
        assert_eq!(probe.send_prompt.load(Ordering::SeqCst), 0);
    }
}
