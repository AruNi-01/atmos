//! ACP Client implementation - implements the Client trait to communicate with Agent via stdio.

use std::path::PathBuf;
use std::sync::Arc;

use agent_client_protocol::schema::v1 as schema;
use agent_client_protocol::{self as acp, schema as acp_schema};
use serde::Serialize;

fn protocol_kind_slug(kind: Option<&schema::ToolKind>) -> Option<String> {
    kind.map(|kind| {
        match kind {
            schema::ToolKind::Read => "read",
            schema::ToolKind::Edit => "edit",
            schema::ToolKind::Delete => "delete",
            schema::ToolKind::Move => "move",
            schema::ToolKind::Search => "search",
            schema::ToolKind::Execute => "execute",
            schema::ToolKind::Think => "think",
            schema::ToolKind::Fetch => "fetch",
            schema::ToolKind::SwitchMode => "switch_mode",
            _ => "other",
        }
        .to_string()
    })
}

fn protocol_kind_name(kind: Option<&schema::ToolKind>) -> String {
    match kind {
        Some(schema::ToolKind::Read) => "Read".to_string(),
        Some(schema::ToolKind::Edit) => "Edit".to_string(),
        Some(schema::ToolKind::Delete) => "Delete".to_string(),
        Some(schema::ToolKind::Move) => "Move".to_string(),
        Some(schema::ToolKind::Search) => "Search".to_string(),
        Some(schema::ToolKind::Execute) => "Execute".to_string(),
        Some(schema::ToolKind::Think) => "Think".to_string(),
        Some(schema::ToolKind::Fetch) => "Fetch".to_string(),
        Some(schema::ToolKind::SwitchMode) => "SwitchMode".to_string(),
        Some(schema::ToolKind::Other) | None => "Tool".to_string(),
        Some(_) => "Tool".to_string(),
    }
}

fn extract_claude_code_meta<T: Serialize>(
    value: &T,
) -> Option<serde_json::Map<String, serde_json::Value>> {
    let serialized = serde_json::to_value(value).ok()?;
    serialized
        .get("_meta")
        .and_then(|value| value.get("claudeCode"))
        .and_then(|value| value.as_object())
        .cloned()
}

fn extract_parent_tool_use_id(
    claude_code_meta: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<String> {
    claude_code_meta
        .and_then(|value| value.get("parentToolUseId"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

fn extract_claude_tool_name(
    claude_code_meta: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<String> {
    claude_code_meta
        .and_then(|value| value.get("toolName"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[allow(clippy::too_many_arguments)]
fn map_protocol_tool_call(
    tool_call_id: String,
    kind: Option<&schema::ToolKind>,
    title: Option<&str>,
    status: ToolCallStatus,
    raw_input: Option<serde_json::Value>,
    raw_output: Option<serde_json::Value>,
    locations: Option<&[schema::ToolCallLocation]>,
    content: &[schema::ToolCallContent],
    claude_code_meta: Option<&serde_json::Map<String, serde_json::Value>>,
) -> ToolCallUpdate {
    ToolCallUpdate {
        tool_call_id,
        parent_tool_call_id: extract_parent_tool_use_id(claude_code_meta),
        tool: extract_claude_tool_name(claude_code_meta)
            .unwrap_or_else(|| protocol_kind_name(kind)),
        description: title.unwrap_or("").to_string(),
        acp_kind: protocol_kind_slug(kind),
        status,
        raw_input,
        content: map_tool_call_content(content),
        locations: location_paths(locations),
        raw_output,
        detail: None,
    }
}

fn location_paths(locations: Option<&[schema::ToolCallLocation]>) -> Vec<String> {
    let Some(locations) = locations else {
        return Vec::new();
    };
    locations
        .iter()
        .map(|loc| loc.path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .collect()
}

fn content_text_from_block(block: &schema::ContentBlock) -> Option<String> {
    match block {
        schema::ContentBlock::Text(text) if !text.text.trim().is_empty() => Some(text.text.clone()),
        schema::ContentBlock::ResourceLink(link) => {
            let uri = strip_file_uri(&link.uri);
            if uri.is_empty() {
                None
            } else {
                Some(uri)
            }
        }
        schema::ContentBlock::Resource(resource) => match &resource.resource {
            schema::EmbeddedResourceResource::TextResourceContents(text)
                if !text.text.trim().is_empty() =>
            {
                Some(text.text.clone())
            }
            _ => None,
        },
        _ => None,
    }
}

fn strip_file_uri(uri: &str) -> String {
    uri.trim()
        .strip_prefix("file://")
        .unwrap_or(uri)
        .trim()
        .to_string()
}

fn extract_markdown_from_tool_call_content(content: &[schema::ToolCallContent]) -> Option<String> {
    let parts: Vec<String> = content
        .iter()
        .filter_map(|item| match item {
            schema::ToolCallContent::Content(c) => content_text_from_block(&c.content),
            _ => None,
        })
        .collect();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn map_tool_call_content(
    content: &[schema::ToolCallContent],
) -> Vec<crate::acp_client::types::AgentToolCallContentItem> {
    content
        .iter()
        .filter_map(|item| match item {
            schema::ToolCallContent::Content(c) => content_text_from_block(&c.content)
                .map(|text| crate::acp_client::types::AgentToolCallContentItem::Text { text }),
            schema::ToolCallContent::Diff(diff) => {
                Some(crate::acp_client::types::AgentToolCallContentItem::Diff {
                    path: Some(diff.path.display().to_string()),
                    old_content: diff.old_text.clone(),
                    new_content: diff.new_text.clone(),
                })
            }
            schema::ToolCallContent::Terminal(terminal) => Some(
                crate::acp_client::types::AgentToolCallContentItem::Terminal {
                    terminal_id: terminal.terminal_id.to_string(),
                },
            ),
            _ => None,
        })
        .collect()
}

use tokio::sync::{broadcast, mpsc, oneshot};
use tracing::warn;

use crate::acp_client::logging::append_acp_log;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{
    AgentCapabilitiesSnapshot, AgentConfigOption, AgentCost, AgentImplementationInfo, AgentPlan,
    AgentPlanEntry, AgentSessionInfoUpdate, AgentTurnUsage, AgentUsage, StreamDelta,
    ToolCallStatus, ToolCallUpdate,
};
use crate::acp_client::types::{PermissionOption, PermissionRequest, RiskLevel};

/// Events sent from ACP session to the session manager (for WebSocket forwarding)
#[derive(Debug)]
pub enum AcpSessionEvent {
    AgentInfoUpdate(Option<AgentImplementationInfo>),
    CapabilitiesUpdate(AgentCapabilitiesSnapshot),
    SessionReady {
        acp_session_id: String,
    },
    SessionInfoUpdate(AgentSessionInfoUpdate),
    AvailableCommandsUpdate(Vec<crate::contract::AgentAvailableCommand>),
    Stream(StreamDelta),
    ToolCall(ToolCallUpdate),
    PermissionRequest(PermissionRequest),
    Error {
        code: String,
        message: String,
        recoverable: bool,
    },
    TurnEnd(AcpTurnStop),
    SessionClosed {
        reason: Option<String>,
    },
    SessionEnded,
    LoadCompleted,
    ConfigOptionsUpdate(Vec<AgentConfigOption>),
    Plan(AgentPlan),
    Usage(AgentUsage),
    TurnUsage(AgentTurnUsage),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcpTurnStop {
    Completed,
    Canceled,
    Failed,
}

/// Map ACP `usage_update` (context window + cumulative cost). Coerced `used=0,size=0`
/// from Claude null/missing counters is treated as absent, not a real empty window.
pub(crate) fn map_session_usage(update: &schema::UsageUpdate) -> AgentUsage {
    let has_window = update.used > 0 || update.size > 0;
    AgentUsage {
        used: has_window.then_some(update.used),
        size: (update.size > 0).then_some(update.size),
        cost: update.cost.as_ref().map(|cost| AgentCost {
            amount: Some(cost.amount),
            currency: Some(cost.currency.clone()),
        }),
    }
}

pub(crate) fn map_turn_usage(usage: schema::Usage) -> AgentTurnUsage {
    AgentTurnUsage {
        total_tokens: Some(usage.total_tokens),
        input_tokens: Some(usage.input_tokens),
        output_tokens: Some(usage.output_tokens),
        thought_tokens: usage.thought_tokens,
        cached_read_tokens: usage.cached_read_tokens,
        cached_write_tokens: usage.cached_write_tokens,
    }
}

pub(crate) fn session_usage_is_empty(usage: &AgentUsage) -> bool {
    usage.used.is_none() && usage.size.is_none() && usage.cost.is_none()
}

/// Atmos ACP Client - implements the Client trait, routes tool calls to handler
pub struct AtmosAcpClient {
    handler: Arc<dyn AcpToolHandler>,
    cwd: PathBuf,
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<String>)>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
    ext_notify_tx: broadcast::Sender<(String, serde_json::Value)>,
}

impl AtmosAcpClient {
    pub fn new(
        handler: Arc<dyn AcpToolHandler>,
        cwd: PathBuf,
        permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<String>)>,
        event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
        ext_notify_tx: broadcast::Sender<(String, serde_json::Value)>,
    ) -> Self {
        Self {
            handler,
            cwd,
            permission_tx,
            event_tx,
            ext_notify_tx,
        }
    }
}

impl AtmosAcpClient {
    pub async fn request_permission(
        &self,
        args: schema::RequestPermissionRequest,
    ) -> acp::Result<schema::RequestPermissionResponse> {
        let tool_name = protocol_kind_name(args.tool_call.fields.kind.as_ref());
        let description = args
            .tool_call
            .fields
            .title
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| tool_name.clone());
        let risk_level = RiskLevel::High;

        let options: Vec<PermissionOption> = args
            .options
            .iter()
            .map(|o| PermissionOption {
                option_id: o.option_id.0.to_string(),
                name: o.name.clone(),
                kind: match o.kind {
                    schema::PermissionOptionKind::AllowOnce => "allow_once".to_string(),
                    schema::PermissionOptionKind::AllowAlways => "allow_always".to_string(),
                    schema::PermissionOptionKind::RejectOnce => "reject_once".to_string(),
                    schema::PermissionOptionKind::RejectAlways => "reject_always".to_string(),
                    _ => "other".to_string(),
                },
            })
            .collect();
        let content_markdown = args
            .tool_call
            .fields
            .content
            .as_ref()
            .and_then(|content| extract_markdown_from_tool_call_content(content));

        let (response_tx, response_rx) = oneshot::channel();
        let request = PermissionRequest {
            request_id: format!("perm_{}", uuid::Uuid::new_v4().simple()),
            tool: tool_name,
            description,
            content_markdown,
            risk_level,
            options,
        };

        if self
            .permission_tx
            .send((request.clone(), response_tx))
            .is_err()
        {
            return Err(acp::Error::internal_error());
        }

        if let Err(e) = self
            .event_tx
            .send(AcpSessionEvent::PermissionRequest(request))
        {
            warn!("Failed to forward permission request: {}", e);
        }

        let selected = response_rx.await.unwrap_or_else(|_| "reject".to_string());
        let option_id = args
            .options
            .iter()
            .find(|option| option.option_id.0.as_ref() == selected)
            .map(|option| option.option_id.clone())
            .unwrap_or_else(|| schema::PermissionOptionId::new(selected));

        Ok(schema::RequestPermissionResponse::new(
            schema::RequestPermissionOutcome::Selected(schema::SelectedPermissionOutcome::new(
                option_id,
            )),
        ))
    }

    pub async fn read_text_file(
        &self,
        args: schema::ReadTextFileRequest,
    ) -> acp::Result<schema::ReadTextFileResponse> {
        let path_str = args.path.to_string_lossy();
        let path = self.handler.resolve_path(&self.cwd, path_str.as_ref());
        match self.handler.read_text_file(&path).await {
            Ok(content) => Ok(schema::ReadTextFileResponse::new(content)),
            Err(_) => Err(acp::Error::invalid_params()),
        }
    }

    pub async fn write_text_file(
        &self,
        args: schema::WriteTextFileRequest,
    ) -> acp::Result<schema::WriteTextFileResponse> {
        let path_str = args.path.to_string_lossy();
        let path = self.handler.resolve_path(&self.cwd, path_str.as_ref());
        match self.handler.write_text_file(&path, &args.content).await {
            Ok(()) => Ok(schema::WriteTextFileResponse::new()),
            Err(_) => Err(acp::Error::invalid_params()),
        }
    }

    pub async fn create_terminal(
        &self,
        _args: schema::CreateTerminalRequest,
    ) -> acp::Result<schema::CreateTerminalResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn terminal_output(
        &self,
        _args: schema::TerminalOutputRequest,
    ) -> acp::Result<schema::TerminalOutputResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn release_terminal(
        &self,
        _args: schema::ReleaseTerminalRequest,
    ) -> acp::Result<schema::ReleaseTerminalResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn wait_for_terminal_exit(
        &self,
        _args: schema::WaitForTerminalExitRequest,
    ) -> acp::Result<schema::WaitForTerminalExitResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn kill_terminal(
        &self,
        _args: schema::KillTerminalRequest,
    ) -> acp::Result<schema::KillTerminalResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn session_notification(&self, args: schema::SessionNotification) -> acp::Result<()> {
        append_acp_log(
            &args.session_id.to_string(),
            "agent_to_client_acp",
            "session_notification",
            &args,
        );
        match args.update {
            schema::SessionUpdate::UserMessageChunk(schema::ContentChunk { content, .. }) => {
                let text = match content {
                    schema::ContentBlock::Text(t) => t.text,
                    schema::ContentBlock::Image(_) => " ".into(),
                    schema::ContentBlock::Audio(_) => " ".into(),
                    schema::ContentBlock::ResourceLink(r) => r.uri,
                    schema::ContentBlock::Resource(_) => " ".into(),
                    _ => " ".into(),
                };
                let _ = self.event_tx.send(AcpSessionEvent::Stream(StreamDelta {
                    role: "user".to_string(),
                    kind: "message".to_string(),
                    delta: text,
                    done: false,
                    usage: None,
                }));
            }
            schema::SessionUpdate::AgentMessageChunk(schema::ContentChunk { content, .. }) => {
                let text = match content {
                    schema::ContentBlock::Text(t) => t.text,
                    schema::ContentBlock::Image(_) => " ".into(),
                    schema::ContentBlock::Audio(_) => " ".into(),
                    schema::ContentBlock::ResourceLink(r) => r.uri,
                    schema::ContentBlock::Resource(_) => " ".into(),
                    _ => " ".into(),
                };
                let _ = self.event_tx.send(AcpSessionEvent::Stream(StreamDelta {
                    role: "assistant".to_string(),
                    kind: "message".to_string(),
                    delta: text,
                    done: false,
                    usage: None,
                }));
            }
            schema::SessionUpdate::AgentThoughtChunk(schema::ContentChunk { content, .. }) => {
                let text = match content {
                    schema::ContentBlock::Text(t) => t.text,
                    schema::ContentBlock::Image(_) => " ".into(),
                    schema::ContentBlock::Audio(_) => " ".into(),
                    schema::ContentBlock::ResourceLink(r) => r.uri,
                    schema::ContentBlock::Resource(_) => " ".into(),
                    _ => " ".into(),
                };
                let _ = self.event_tx.send(AcpSessionEvent::Stream(StreamDelta {
                    role: "assistant".to_string(),
                    kind: "thinking".to_string(),
                    delta: text,
                    done: false,
                    usage: None,
                }));
            }
            schema::SessionUpdate::ToolCall(tool_call) => {
                let status = match tool_call.status {
                    schema::ToolCallStatus::InProgress => ToolCallStatus::Running,
                    schema::ToolCallStatus::Completed => ToolCallStatus::Completed,
                    schema::ToolCallStatus::Failed => ToolCallStatus::Failed,
                    _ => ToolCallStatus::Running,
                };
                let claude_code_meta = extract_claude_code_meta(&tool_call);
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(map_protocol_tool_call(
                        tool_call.tool_call_id.to_string(),
                        Some(&tool_call.kind),
                        Some(tool_call.title.as_str()),
                        status,
                        tool_call.raw_input.clone(),
                        tool_call.raw_output.clone(),
                        Some(tool_call.locations.as_slice()),
                        &tool_call.content,
                        claude_code_meta.as_ref(),
                    )));
            }
            schema::SessionUpdate::ToolCallUpdate(update) => {
                let status = match update
                    .fields
                    .status
                    .unwrap_or(schema::ToolCallStatus::default())
                {
                    schema::ToolCallStatus::InProgress => ToolCallStatus::Running,
                    schema::ToolCallStatus::Completed => ToolCallStatus::Completed,
                    schema::ToolCallStatus::Failed => ToolCallStatus::Failed,
                    _ => ToolCallStatus::Running,
                };
                let claude_code_meta = extract_claude_code_meta(&update);
                let content = update.fields.content.as_deref().unwrap_or(&[]);
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(map_protocol_tool_call(
                        update.tool_call_id.to_string(),
                        update.fields.kind.as_ref(),
                        update.fields.title.as_deref(),
                        status,
                        update.fields.raw_input.clone(),
                        update.fields.raw_output.clone(),
                        update.fields.locations.as_deref(),
                        content,
                        claude_code_meta.as_ref(),
                    )));
            }
            schema::SessionUpdate::Plan(plan) => {
                let entries = plan
                    .entries
                    .into_iter()
                    .map(|e| AgentPlanEntry {
                        content: e.content,
                        priority: match e.priority {
                            schema::PlanEntryPriority::High => "high".to_string(),
                            schema::PlanEntryPriority::Medium => "medium".to_string(),
                            schema::PlanEntryPriority::Low => "low".to_string(),
                            _ => "medium".to_string(),
                        },
                        status: match e.status {
                            schema::PlanEntryStatus::Pending => "pending".to_string(),
                            schema::PlanEntryStatus::InProgress => "in_progress".to_string(),
                            schema::PlanEntryStatus::Completed => "completed".to_string(),
                            _ => "pending".to_string(),
                        },
                    })
                    .collect();
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::Plan(AgentPlan { entries }));
            }
            schema::SessionUpdate::CurrentModeUpdate(update) => {
                tracing::info!(
                    "Received CurrentModeUpdate notification: mode={}",
                    update.current_mode_id
                );
                // Update the mode config option's current value
                let opt = crate::acp_client::types::AgentConfigOption {
                    id: "mode".to_string(),
                    name: Some("Mode".to_string()),
                    description: None,
                    category: Some("mode".to_string()),
                    r#type: "select".to_string(),
                    current_value: Some(update.current_mode_id.to_string()),
                    options: vec![],
                };
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ConfigOptionsUpdate(vec![opt]));
            }
            schema::SessionUpdate::ConfigOptionUpdate(update) => {
                let out = super::runner::map_config_options(update.config_options);
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ConfigOptionsUpdate(out));
            }
            schema::SessionUpdate::AvailableCommandsUpdate(update) => {
                let commands = update
                    .available_commands
                    .into_iter()
                    .map(|command| crate::contract::AgentAvailableCommand {
                        name: command.name,
                        description: command.description,
                        hint: match command.input {
                            Some(schema::AvailableCommandInput::Unstructured(input)) => {
                                let hint = input.hint.trim().to_string();
                                if hint.is_empty() {
                                    None
                                } else {
                                    Some(hint)
                                }
                            }
                            _ => None,
                        },
                    })
                    .collect();
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::AvailableCommandsUpdate(commands));
            }
            schema::SessionUpdate::SessionInfoUpdate(update) => {
                fn maybe_update<T>(value: acp_schema::MaybeUndefined<T>) -> Option<Option<T>> {
                    match value {
                        acp_schema::MaybeUndefined::Undefined => None,
                        acp_schema::MaybeUndefined::Null => Some(None),
                        acp_schema::MaybeUndefined::Value(value) => Some(Some(value)),
                    }
                }

                let _ = self.event_tx.send(AcpSessionEvent::SessionInfoUpdate(
                    AgentSessionInfoUpdate {
                        acp_session_id: args.session_id.to_string(),
                        title: maybe_update(update.title),
                        updated_at: maybe_update(update.updated_at),
                    },
                ));
            }
            schema::SessionUpdate::UsageUpdate(update) => {
                let usage = map_session_usage(&update);
                if !session_usage_is_empty(&usage) {
                    let _ = self.event_tx.send(AcpSessionEvent::Usage(usage));
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub async fn ext_method(&self, _args: schema::ExtRequest) -> acp::Result<schema::ExtResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn ext_notification(&self, args: schema::ExtNotification) -> acp::Result<()> {
        let params = serde_json::from_str(args.params.get()).unwrap_or(serde_json::Value::Null);
        let _ = self.ext_notify_tx.send((args.method.to_string(), params));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use agent_client_protocol::schema::v1 as schema;
    use serde_json::json;

    use crate::acp_client::usage_normalize::normalize_acp_json_line;

    fn usage_notification(update: serde_json::Value) -> schema::SessionNotification {
        let line = serde_json::to_string(&json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "session-1",
                "update": update
            }
        }))
        .unwrap();
        let normalized: serde_json::Value =
            serde_json::from_str(&normalize_acp_json_line(&line)).unwrap();
        serde_json::from_value(normalized["params"].clone())
            .expect("normalized usage_update should deserialize")
    }

    #[test]
    fn usage_update_allows_null_usage_fields() {
        let notification = usage_notification(json!({
            "sessionUpdate": "usage_update",
            "used": null,
            "size": null
        }));

        match notification.update {
            schema::SessionUpdate::UsageUpdate(update) => {
                assert_eq!(update.used, 0);
                assert_eq!(update.size, 0);
            }
            other => panic!("expected usage_update, got {other:?}"),
        }
    }

    #[test]
    fn usage_update_allows_missing_usage_fields() {
        let notification = usage_notification(json!({
            "sessionUpdate": "usage_update"
        }));

        match notification.update {
            schema::SessionUpdate::UsageUpdate(update) => {
                assert_eq!(update.used, 0);
                assert_eq!(update.size, 0);
            }
            other => panic!("expected usage_update, got {other:?}"),
        }
    }

    #[test]
    fn coerced_empty_usage_update_is_not_a_session_window() {
        let usage = super::map_session_usage(&schema::UsageUpdate::new(0, 0));
        assert!(usage.used.is_none());
        assert!(usage.size.is_none());
        assert!(usage.cost.is_none());
        assert!(super::session_usage_is_empty(&usage));
    }

    #[test]
    fn compaction_usage_keeps_zero_used_with_real_window() {
        let usage = super::map_session_usage(&schema::UsageUpdate::new(0, 200_000));
        assert_eq!(usage.used, Some(0));
        assert_eq!(usage.size, Some(200_000));
    }

    #[test]
    fn session_usage_keeps_cost_when_window_is_absent() {
        let update = schema::UsageUpdate::new(0, 0).cost(schema::Cost::new(0.045, "USD"));
        let usage = super::map_session_usage(&update);
        assert!(usage.used.is_none());
        assert!(usage.size.is_none());
        assert_eq!(
            usage.cost.as_ref().and_then(|cost| cost.amount),
            Some(0.045)
        );
        assert_eq!(
            usage
                .cost
                .as_ref()
                .and_then(|cost| cost.currency.as_deref()),
            Some("USD")
        );
    }

    #[test]
    fn prompt_usage_maps_turn_token_fields() {
        let mapped = super::map_turn_usage(schema::Usage::new(150, 100, 40).thought_tokens(10));
        assert_eq!(mapped.total_tokens, Some(150));
        assert_eq!(mapped.input_tokens, Some(100));
        assert_eq!(mapped.output_tokens, Some(40));
        assert_eq!(mapped.thought_tokens, Some(10));
    }

    #[test]
    fn session_info_update_preserves_null_and_missing_fields() {
        let notification: schema::SessionNotification = serde_json::from_value(json!({
            "sessionId": "session-1",
            "update": {
                "sessionUpdate": "session_info_update",
                "title": null
            }
        }))
        .expect("session_info_update should deserialize");

        match notification.update {
            schema::SessionUpdate::SessionInfoUpdate(update) => {
                assert!(update.title.is_null());
                assert!(update.updated_at.is_undefined());
            }
            other => panic!("expected session_info_update, got {other:?}"),
        }
    }

    #[test]
    fn available_commands_update_deserializes_name_description_and_hint() {
        let notification: schema::SessionNotification = serde_json::from_value(json!({
            "sessionId": "session-1",
            "update": {
                "sessionUpdate": "available_commands_update",
                "availableCommands": [
                    {
                        "name": "plan",
                        "description": "Create a plan",
                        "input": { "hint": "what to plan" }
                    },
                    {
                        "name": "test",
                        "description": "Run tests"
                    }
                ]
            }
        }))
        .expect("available_commands_update should deserialize");

        match notification.update {
            schema::SessionUpdate::AvailableCommandsUpdate(update) => {
                assert_eq!(update.available_commands.len(), 2);
                assert_eq!(update.available_commands[0].name, "plan");
                assert_eq!(update.available_commands[0].description, "Create a plan");
                assert_eq!(update.available_commands[1].name, "test");
            }
            other => panic!("expected available_commands_update, got {other:?}"),
        }
    }

    #[test]
    fn protocol_tool_call_does_not_guess_kind_or_synthesize_title() {
        let loc = schema::ToolCallLocation::new("/tmp/app/README.md");
        let mapped = super::map_protocol_tool_call(
            "tc_1".into(),
            Some(&schema::ToolKind::Read),
            Some("Read"),
            crate::acp_client::types::ToolCallStatus::Completed,
            None,
            None,
            Some(std::slice::from_ref(&loc)),
            &[],
            None,
        );
        assert_eq!(mapped.tool, "Read");
        assert_eq!(mapped.description, "Read");
        assert_eq!(mapped.acp_kind.as_deref(), Some("read"));
        assert_eq!(mapped.locations, vec!["/tmp/app/README.md"]);
        assert!(mapped.raw_input.is_none());
        assert!(mapped.detail.is_none());
    }

    #[test]
    fn protocol_other_keeps_vendor_envelope_untouched() {
        let input = json!({
            "type": "ReadFile",
            "FileContent": {
                "absolute_path": "/tmp/app/README.md",
                "raw_output": "# hi\n"
            }
        });
        let mapped = super::map_protocol_tool_call(
            "tc_1".into(),
            Some(&schema::ToolKind::Other),
            Some("Tool"),
            crate::acp_client::types::ToolCallStatus::Completed,
            Some(input.clone()),
            None,
            None,
            &[],
            None,
        );
        assert_eq!(mapped.tool, "Tool");
        assert_eq!(mapped.description, "Tool");
        assert_eq!(mapped.acp_kind.as_deref(), Some("other"));
        assert_eq!(mapped.raw_input, Some(input));
    }

    #[test]
    fn protocol_execute_passes_title_and_command_as_is() {
        let input = json!({ "command": "echo hello" });
        let mapped = super::map_protocol_tool_call(
            "tc_1".into(),
            Some(&schema::ToolKind::Execute),
            Some("Run Script"),
            crate::acp_client::types::ToolCallStatus::Completed,
            Some(input.clone()),
            None,
            None,
            &[],
            None,
        );
        assert_eq!(mapped.acp_kind.as_deref(), Some("execute"));
        assert_eq!(mapped.description, "Run Script");
        assert_eq!(mapped.raw_input, Some(input));
    }
}
