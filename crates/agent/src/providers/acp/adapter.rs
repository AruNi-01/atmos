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
    AgentResult, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentRuntimeControl, AgentToolCall, AgentTurnHandle, TurnStop,
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
    pending_permissions: Mutex<HashMap<String, oneshot::Sender<String>>>,
}

#[async_trait]
impl AgentRuntimeCommands for AcpCommands {
    async fn prompt(&self, input: AgentPrompt) -> AgentResult<AgentTurnHandle> {
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

    async fn steer(&self, input: AgentPrompt) -> AgentResult<()> {
        if !self.supports_steer.load(Ordering::SeqCst) {
            return Err(AgentProviderError::unsupported(
                "this agent does not support steer",
            ));
        }
        if self.running_turn.lock().await.is_none() {
            return Err(AgentProviderError::SteerTurnMismatch);
        }
        self.control
            .send_prompt(input.text, input.attachments)
            .map_err(AgentProviderError::message)?;
        Ok(())
    }

    async fn cancel(&self) -> AgentResult<()> {
        self.control
            .send_cancel()
            .map_err(AgentProviderError::message)?;
        Ok(())
    }

    async fn close(&self) -> AgentResult<()> {
        self.control
            .send_close()
            .map_err(AgentProviderError::message)?;
        Ok(())
    }

    async fn set_config(&self, update: AgentRuntimeConfigUpdate) -> AgentResult<()> {
        let mut writes = Vec::new();
        if let Some(model) = update.model {
            writes.push((vec!["model".to_string(), "models".to_string()], model));
        }
        if let Some(thinking) = update.thinking {
            writes.push((
                vec![
                    "thought_level".to_string(),
                    "thinking".to_string(),
                    "think".to_string(),
                ],
                thinking,
            ));
        }
        if let Some(mode) = update.mode {
            writes.push((vec!["mode".to_string(), "modes".to_string()], mode));
        }
        writes.extend(
            update
                .extra_config
                .into_iter()
                .map(|(id, value)| (vec![id], value)),
        );
        for (ids, value) in writes {
            write_config_option(&self.control, &ids, &value).await?;
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
        let _ = tx.send(option_id.to_string());
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
impl AgentRuntime for AcpMappedSession {
    fn control(&self) -> AgentRuntimeControl {
        AgentRuntimeControl::new(self.commands.clone())
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
        if should_drop_replay(self.replaying, &event) {
            return None;
        }
        match event {
            AcpSessionEvent::SessionReady { acp_session_id } => {
                self.replaying = false;
                self.persistence = Some(AgentPersistenceHandle::new(acp_session_id.clone()));
                Some(AgentEvent::SessionStarted {
                    persistence_handle: Some(acp_session_id),
                })
            }
            AcpSessionEvent::Stream(delta) => {
                if delta.kind == "thinking" {
                    let event = map_thinking_stream(
                        &mut self.thinking_message_id,
                        &mut self.pending,
                        delta,
                    );
                    Some(complete_stream_before(
                        &mut self.assistant_message_id,
                        &mut self.pending,
                        |message_id| AgentEvent::AssistantMessageCompleted { message_id },
                        event,
                    ))
                } else if delta.role == "assistant" {
                    let event = map_assistant_stream(
                        &mut self.assistant_message_id,
                        &mut self.pending,
                        delta,
                    );
                    Some(complete_stream_before(
                        &mut self.thinking_message_id,
                        &mut self.pending,
                        |message_id| AgentEvent::ThinkingCompleted { message_id },
                        event,
                    ))
                } else {
                    None
                }
            }
            AcpSessionEvent::ToolCall(update) => Some(complete_stream_before(
                &mut self.thinking_message_id,
                &mut self.pending,
                |message_id| AgentEvent::ThinkingCompleted { message_id },
                map_tool_call(update),
            )),
            AcpSessionEvent::PermissionRequest(request) => Some(complete_stream_before(
                &mut self.thinking_message_id,
                &mut self.pending,
                |message_id| AgentEvent::ThinkingCompleted { message_id },
                AgentEvent::PermissionRequested {
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
                },
            )),
            AcpSessionEvent::TurnEnd(stop) => {
                let turn_id = self.commands.running_turn.lock().await.take();
                let completed = turn_id.map(|turn_id| match stop {
                    crate::acp_client::client::AcpTurnStop::Canceled => {
                        AgentEvent::TurnCanceled { turn_id }
                    }
                    crate::acp_client::client::AcpTurnStop::Failed => AgentEvent::TurnFailed {
                        turn_id,
                        error: "turn failed".into(),
                    },
                    crate::acp_client::client::AcpTurnStop::Completed => {
                        AgentEvent::TurnCompleted {
                            turn_id,
                            stop: TurnStop::Completed,
                        }
                    }
                });
                completed.map(|event| {
                    complete_stream_before(
                        &mut self.thinking_message_id,
                        &mut self.pending,
                        |message_id| AgentEvent::ThinkingCompleted { message_id },
                        event,
                    )
                })
            }
            AcpSessionEvent::Error { message, .. } => {
                let turn_id = self.commands.running_turn.lock().await.take();
                turn_id.map(|turn_id| AgentEvent::TurnFailed {
                    turn_id,
                    error: message,
                })
            }
            AcpSessionEvent::Plan(plan) => Some(complete_stream_before(
                &mut self.thinking_message_id,
                &mut self.pending,
                |message_id| AgentEvent::ThinkingCompleted { message_id },
                AgentEvent::PlanUpdated {
                    plan: serde_json::to_value(plan).unwrap_or(serde_json::Value::Null),
                },
            )),
            AcpSessionEvent::Usage(usage) => Some(AgentEvent::UsageUpdated {
                usage: serde_json::to_value(usage).unwrap_or(serde_json::Value::Null),
            }),
            AcpSessionEvent::TurnUsage(usage) => Some(AgentEvent::UsageUpdated {
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
            AcpSessionEvent::SessionInfoUpdate(update) => match update.title {
                Some(Some(title)) => {
                    let title = title.trim().to_string();
                    if title.is_empty() {
                        None
                    } else {
                        Some(AgentEvent::SessionTitleUpdated { title })
                    }
                }
                _ => None,
            },
            AcpSessionEvent::AvailableCommandsUpdate(commands) => {
                Some(AgentEvent::AvailableCommandsUpdated { commands })
            }
            _ => None,
        }
    }
}

fn complete_stream_before(
    open_id: &mut Option<String>,
    pending: &mut VecDeque<AgentEvent>,
    completed: impl FnOnce(String) -> AgentEvent,
    next: AgentEvent,
) -> AgentEvent {
    if let Some(message_id) = open_id.take() {
        pending.push_back(next);
        completed(message_id)
    } else {
        next
    }
}

fn map_thinking_stream(
    thinking_message_id: &mut Option<String>,
    pending: &mut VecDeque<AgentEvent>,
    delta: crate::acp_client::types::StreamDelta,
) -> AgentEvent {
    let message_id = thinking_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    if delta.done {
        *thinking_message_id = None;
        if !delta.delta.is_empty() {
            pending.push_back(AgentEvent::ThinkingCompleted {
                message_id: message_id.clone(),
            });
            return AgentEvent::ThinkingDelta {
                message_id,
                delta: delta.delta,
            };
        }
        return AgentEvent::ThinkingCompleted { message_id };
    }
    AgentEvent::ThinkingDelta {
        message_id,
        delta: delta.delta,
    }
}

fn map_assistant_stream(
    assistant_message_id: &mut Option<String>,
    pending: &mut VecDeque<AgentEvent>,
    delta: crate::acp_client::types::StreamDelta,
) -> AgentEvent {
    let message_id = assistant_message_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    if delta.done {
        *assistant_message_id = None;
        if !delta.delta.is_empty() {
            pending.push_back(AgentEvent::AssistantMessageCompleted {
                message_id: message_id.clone(),
            });
            return AgentEvent::AssistantMessageDelta {
                message_id,
                delta: delta.delta,
            };
        }
        return AgentEvent::AssistantMessageCompleted { message_id };
    }
    AgentEvent::AssistantMessageDelta {
        message_id,
        delta: delta.delta,
    }
}

fn should_drop_replay(replaying: bool, event: &AcpSessionEvent) -> bool {
    replaying
        && !matches!(
            event,
            AcpSessionEvent::LoadCompleted
                | AcpSessionEvent::SessionReady { .. }
                | AcpSessionEvent::SessionClosed { .. }
                | AcpSessionEvent::SessionEnded
                | AcpSessionEvent::AvailableCommandsUpdate(_)
        )
}

fn map_tool_call(update: ToolCallUpdate) -> AgentEvent {
    let status = update.status;
    let tool_call = AgentToolCall {
        tool_call_id: update.tool_call_id,
        name: update.tool.clone(),
        title: Some(update.description.clone()).filter(|s| !s.is_empty()),
        kind: match crate::domain::classify_tool(
            &update.tool,
            Some(update.description.as_str()).filter(|value| !value.is_empty()),
            update.raw_input.as_ref(),
        ) {
            crate::domain::ClassifiedTool::Call(kind) => kind,
            _ => crate::domain::AgentToolKind::Other,
        },
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

/// ACP: JSON-RPC success is the success signal. The returned `configOptions`
/// replace client state via `ConfigChanged`; do not second-guess `currentValue`.
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

async fn open_acp_session(
    params: &AcpProviderParams,
    cfg: AgentRuntimeConfig,
    resume: Option<String>,
) -> AgentResult<Box<dyn AgentRuntime>> {
    let default_config = if resume.is_some() {
        None
    } else {
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
        if default_config.is_empty() {
            None
        } else {
            Some(default_config)
        }
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
    use super::{complete_stream_before, should_drop_replay};
    use crate::acp_client::AcpSessionEvent;
    use crate::domain::AgentEvent;
    use std::collections::VecDeque;

    #[test]
    fn tool_call_closes_open_thinking_stream() {
        let mut thinking_id = Some("think-1".into());
        let mut pending = VecDeque::new();
        let next = AgentEvent::SessionClosed;
        let first = complete_stream_before(
            &mut thinking_id,
            &mut pending,
            |message_id| AgentEvent::ThinkingCompleted { message_id },
            next,
        );
        assert!(matches!(
            first,
            AgentEvent::ThinkingCompleted { message_id } if message_id == "think-1"
        ));
        assert!(thinking_id.is_none());
        assert!(matches!(
            pending.pop_front(),
            Some(AgentEvent::SessionClosed)
        ));
    }

    #[test]
    fn no_open_thinking_passes_the_next_event_through() {
        let mut thinking_id = None;
        let mut pending = VecDeque::new();
        let first = complete_stream_before(
            &mut thinking_id,
            &mut pending,
            |message_id| AgentEvent::ThinkingCompleted { message_id },
            AgentEvent::SessionClosed,
        );
        assert!(matches!(first, AgentEvent::SessionClosed));
        assert!(pending.is_empty());
    }

    #[test]
    fn session_ready_is_not_dropped_during_replay() {
        assert!(!should_drop_replay(
            true,
            &AcpSessionEvent::SessionReady {
                acp_session_id: "s".into(),
            }
        ));
        assert!(should_drop_replay(
            true,
            &AcpSessionEvent::Stream(crate::acp_client::types::StreamDelta {
                role: "assistant".into(),
                kind: "message".into(),
                delta: "x".into(),
                done: false,
                usage: None,
            })
        ));
        assert!(!should_drop_replay(false, &AcpSessionEvent::LoadCompleted));
        assert!(!should_drop_replay(
            true,
            &AcpSessionEvent::AvailableCommandsUpdate(vec![crate::domain::AgentAvailableCommand {
                name: "plan".into(),
                description: "Create a plan".into(),
                hint: None,
            }])
        ));
    }
}
