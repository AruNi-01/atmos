use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{oneshot, Mutex};

use crate::acp_client::types::{ToolCallStatus, ToolCallUpdate};
use crate::acp_client::{
    run_acp_session, AcpSessionControl, AcpSessionEvent, AcpSessionHandle, AcpToolHandler,
};
use crate::domain::{
    AgentCapabilities, AgentCatalogContext, AgentEvent, AgentPermissionOption,
    AgentPermissionRequest, AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError,
    AgentResult, AgentSession, AgentSessionCommands, AgentSessionConfig, AgentSessionConfigUpdate,
    AgentSessionControl, AgentToolCall, AgentTurnHandle, TurnStop,
};
use crate::models::AgentLaunchSpec;

pub struct AcpProviderParams {
    pub provider_id: String,
    pub launch_spec: AgentLaunchSpec,
    pub env_overrides: Option<std::collections::HashMap<String, String>>,
    pub default_config: Option<std::collections::HashMap<String, String>>,
    pub tool_handler: Arc<dyn AcpToolHandler>,
    pub supports_steer: bool,
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
    supports_steer: AtomicBool,
    running_turn: Mutex<Option<String>>,
    pending_permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

#[async_trait]
impl AgentSessionCommands for AcpCommands {
    async fn prompt(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
        let turn_id = uuid::Uuid::new_v4().to_string();
        *self.running_turn.lock().await = Some(turn_id.clone());
        self.control.send_prompt(input.text);
        Ok(AgentTurnHandle { turn_id })
    }

    async fn steer(&self, input: AgentPrompt) -> AgentResult<()> {
        if !self.supports_steer.load(Ordering::SeqCst) {
            return Err(AgentProviderError::unsupported(
                "this agent does not support steer",
            ));
        }
        if self.running_turn.lock().await.is_none() {
            return Err(AgentProviderError::SteerTurnMismatch);
        }
        self.control.send_prompt(input.text);
        Ok(())
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.control.send_cancel();
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.control.send_close();
        Ok(())
    }

    async fn set_config(&self, update: AgentSessionConfigUpdate) -> AgentResult<()> {
        if let Some(model) = update.model {
            self.control.send_set_config_option("model".into(), model);
        }
        if let Some(thinking) = update.thinking {
            self.control
                .send_set_config_option("thought_level".into(), thinking);
        }
        if let Some(mode) = update.mode {
            self.control.send_set_config_option("mode".into(), mode);
        }
        for (id, value) in update.extra_config {
            self.control.send_set_config_option(id, value);
        }
        Ok(())
    }

    async fn respond_permission(&self, request_id: &str, option_id: &str) -> AgentResult<()> {
        let tx = self
            .pending_permissions
            .lock()
            .await
            .remove(request_id)
            .ok_or_else(|| AgentProviderError::NotFound(request_id.to_string()))?;
        let allowed = !option_id.to_ascii_lowercase().contains("reject");
        let _ = tx.send(allowed);
        Ok(())
    }
}

struct AcpMappedSession {
    commands: Arc<AcpCommands>,
    handle: AcpSessionHandle,
    persistence: Option<AgentPersistenceHandle>,
    capabilities: AgentCapabilities,
    pending: VecDeque<AgentEvent>,
    assistant_message_id: Option<String>,
    thinking_message_id: Option<String>,
    replaying: bool,
}

#[async_trait]
impl AgentSession for AcpMappedSession {
    fn control(&self) -> AgentSessionControl {
        AgentSessionControl::new(self.commands.clone())
    }

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle> {
        self.persistence.clone()
    }

    fn capabilities(&self) -> AgentCapabilities {
        self.capabilities.clone()
    }

    async fn next_event(&mut self) -> Option<AgentEvent> {
        if let Some(event) = self.pending.pop_front() {
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
            if let Some(event) = self.map_event(acp).await {
                return Some(event);
            }
        }
    }
}

impl AcpMappedSession {
    async fn map_event(&mut self, event: AcpSessionEvent) -> Option<AgentEvent> {
        if self.replaying
            && !matches!(
                event,
                AcpSessionEvent::LoadCompleted
                    | AcpSessionEvent::SessionReady { .. }
                    | AcpSessionEvent::SessionClosed { .. }
                    | AcpSessionEvent::SessionEnded
            )
        {
            return None;
        }
        match event {
            AcpSessionEvent::SessionReady { acp_session_id } => {
                self.persistence = Some(AgentPersistenceHandle::new(acp_session_id.clone()));
                Some(AgentEvent::SessionStarted {
                    persistence_handle: Some(acp_session_id),
                })
            }
            AcpSessionEvent::Stream(delta) => {
                let done = delta.done;
                if delta.kind == "thinking" {
                    let message_id = self
                        .thinking_message_id
                        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
                        .clone();
                    if done {
                        self.thinking_message_id = None;
                        if !delta.delta.is_empty() {
                            self.pending.push_back(AgentEvent::ThinkingCompleted {
                                message_id: message_id.clone(),
                            });
                            return Some(AgentEvent::ThinkingDelta {
                                message_id,
                                delta: delta.delta,
                            });
                        }
                        return Some(AgentEvent::ThinkingCompleted { message_id });
                    }
                    Some(AgentEvent::ThinkingDelta {
                        message_id,
                        delta: delta.delta,
                    })
                } else if delta.role == "assistant" || delta.kind == "message" {
                    let message_id = self
                        .assistant_message_id
                        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
                        .clone();
                    if done {
                        self.assistant_message_id = None;
                        if !delta.delta.is_empty() {
                            self.pending
                                .push_back(AgentEvent::AssistantMessageCompleted {
                                    message_id: message_id.clone(),
                                });
                            return Some(AgentEvent::AssistantMessageDelta {
                                message_id,
                                delta: delta.delta,
                            });
                        }
                        return Some(AgentEvent::AssistantMessageCompleted { message_id });
                    }
                    Some(AgentEvent::AssistantMessageDelta {
                        message_id,
                        delta: delta.delta,
                    })
                } else {
                    None
                }
            }
            AcpSessionEvent::ToolCall(update) => Some(map_tool_call(update)),
            AcpSessionEvent::PermissionRequest(request) => Some(AgentEvent::PermissionRequested {
                request: AgentPermissionRequest {
                    request_id: request.request_id,
                    tool: request.tool,
                    description: request.description,
                    content_markdown: request.content_markdown,
                    options: request
                        .options
                        .into_iter()
                        .map(|option| AgentPermissionOption {
                            option_id: option.option_id,
                            name: option.name,
                            kind: option.kind,
                        })
                        .collect(),
                },
            }),
            AcpSessionEvent::TurnEnd(_) => {
                let turn_id = self.commands.running_turn.lock().await.take();
                turn_id.map(|turn_id| AgentEvent::TurnCompleted {
                    turn_id,
                    stop: TurnStop::Completed,
                })
            }
            AcpSessionEvent::Error { message, .. } => {
                let turn_id = self.commands.running_turn.lock().await.take();
                turn_id.map(|turn_id| AgentEvent::TurnFailed {
                    turn_id,
                    error: message,
                })
            }
            AcpSessionEvent::Plan(plan) => Some(AgentEvent::PlanUpdated {
                plan: serde_json::to_value(plan).unwrap_or(serde_json::Value::Null),
            }),
            AcpSessionEvent::Usage(usage) => Some(AgentEvent::UsageUpdated {
                usage: serde_json::to_value(usage).unwrap_or(serde_json::Value::Null),
            }),
            AcpSessionEvent::ConfigOptionsUpdate(options) => Some(AgentEvent::ConfigChanged {
                config: serde_json::to_value(options).unwrap_or(serde_json::Value::Null),
            }),
            AcpSessionEvent::LoadCompleted => {
                self.replaying = false;
                None
            }
            AcpSessionEvent::SessionClosed { .. } | AcpSessionEvent::SessionEnded => {
                Some(AgentEvent::SessionClosed)
            }
            _ => None,
        }
    }
}

fn map_tool_call(update: ToolCallUpdate) -> AgentEvent {
    let status = update.status;
    let tool_call = AgentToolCall {
        tool_call_id: update.tool_call_id,
        name: update.tool,
        title: Some(update.description).filter(|s| !s.is_empty()),
        kind: None,
        status: Some(
            match status {
                ToolCallStatus::Running => "running",
                ToolCallStatus::Completed => "completed",
                ToolCallStatus::Failed => "failed",
            }
            .to_string(),
        ),
        input: update.raw_input,
        output: update.raw_output,
        content: if update.content.is_empty() {
            None
        } else {
            serde_json::to_value(update.content).ok()
        },
    };
    match status {
        ToolCallStatus::Running => AgentEvent::ToolCallStarted { tool_call },
        ToolCallStatus::Completed => AgentEvent::ToolCallCompleted { tool_call },
        ToolCallStatus::Failed => AgentEvent::ToolCallFailed {
            tool_call,
            error: None,
        },
    }
}

async fn open_acp_session(
    params: &AcpProviderParams,
    cfg: AgentSessionConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentSession>> {
    let mut extra = cfg.extra_config.clone();
    if let Some(model) = cfg.model {
        extra.insert("model".into(), model);
    }
    if let Some(thinking) = cfg.thinking {
        extra.insert("thought_level".into(), thinking);
    }
    if let Some(mode) = cfg.mode {
        extra.insert("mode".into(), mode);
    }
    let mut default_config = params.default_config.clone().unwrap_or_default();
    default_config.extend(extra);
    let default_config = if default_config.is_empty() {
        None
    } else {
        Some(default_config)
    };
    let env = match (params.env_overrides.clone(), cfg.env_overrides) {
        (Some(mut a), Some(b)) => {
            a.extend(b);
            Some(a)
        }
        (a, b) => a.or(b),
    };
    let handle = run_acp_session(
        uuid::Uuid::new_v4().to_string(),
        params.launch_spec.clone(),
        cfg.cwd,
        Arc::clone(&params.tool_handler),
        env,
        resume.clone(),
        cfg.auth_method_id,
        default_config,
        None,
    )
    .await
    .map_err(AgentProviderError::message)?;
    let commands = Arc::new(AcpCommands {
        control: handle.control(),
        supports_steer: AtomicBool::new(params.supports_steer),
        running_turn: Mutex::new(None),
        pending_permissions: Mutex::new(HashMap::new()),
    });
    Ok(Box::new(AcpMappedSession {
        commands,
        handle,
        persistence: None,
        capabilities: AgentCapabilities {
            supports_steer: params.supports_steer,
            supports_resume: true,
            thinking: crate::domain::AgentThinkingSupport::None,
        },
        pending: VecDeque::new(),
        assistant_message_id: None,
        thinking_message_id: None,
        replaying: resume.is_some(),
    }))
}

#[async_trait]
impl AgentProvider for AcpAgentProvider {
    fn id(&self) -> &str {
        &self.params.provider_id
    }

    async fn capabilities(&self, _ctx: &AgentCatalogContext) -> AgentResult<AgentCapabilities> {
        Ok(AgentCapabilities {
            supports_steer: self.params.supports_steer,
            supports_resume: true,
            thinking: crate::domain::AgentThinkingSupport::None,
        })
    }

    async fn create_session(&self, cfg: AgentSessionConfig) -> AgentResult<Box<dyn AgentSession>> {
        open_acp_session(&self.params, cfg, None).await
    }

    async fn resume_session(
        &self,
        handle: AgentPersistenceHandle,
        cfg: AgentSessionConfig,
    ) -> AgentResult<Box<dyn AgentSession>> {
        open_acp_session(&self.params, cfg, Some(handle.0)).await
    }
}
