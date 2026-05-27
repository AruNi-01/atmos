//! ACP Client implementation - implements the Client trait to communicate with Agent via stdio.

use std::path::PathBuf;
use std::sync::Arc;

use agent_client_protocol::{self as acp, schema};
use serde::Serialize;

fn format_tool_kind(kind: Option<&schema::ToolKind>) -> String {
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

fn format_description(
    title: Option<&str>,
    tool: &str,
    locations: Option<&[schema::ToolCallLocation]>,
    raw_input: Option<&serde_json::Value>,
) -> String {
    if let Some(t) = title.filter(|s| !s.is_empty()) {
        return t.to_string();
    }
    // Fallback: use first location path (e.g. for Read: "path/to/file.rs")
    if let Some(locs) = locations {
        if let Some(loc) = locs.first() {
            let path = loc.path.to_string_lossy();
            if !path.is_empty() {
                return format!("{tool}: {path}");
            }
        }
    }
    // Fallback: extract from raw_input
    if let Some(input) = raw_input {
        if let Some(path) = input.get("path").and_then(|v| v.as_str()) {
            if !path.is_empty() {
                return format!("{tool}: {path}");
            }
        }
        if let Some(path) = input.get("file_path").and_then(|v| v.as_str()) {
            if !path.is_empty() {
                return format!("{tool}: {path}");
            }
        }
        if let Some(url) = input.get("url").and_then(|v| v.as_str()) {
            if !url.is_empty() {
                return format!("{tool}: {url}");
            }
        }
        if let Some(description) = input.get("description").and_then(|v| v.as_str()) {
            if !description.is_empty() {
                return description.to_string();
            }
        }
        if let Some(skill) = input.get("skill").and_then(|v| v.as_str()) {
            if !skill.is_empty() {
                return format!("Skill: {skill}");
            }
        }
        if let Some(cmd) = input.get("command").and_then(|v| v.as_str()) {
            if !cmd.is_empty() {
                let short = if cmd.len() > 80 { &cmd[..77] } else { cmd };
                return format!("Execute: {short}");
            }
        }
        for key in ["tool", "name", "method", "action"] {
            if let Some(v) = input.get(key).and_then(|v| v.as_str()) {
                if !v.is_empty() {
                    return v.to_string();
                }
            }
        }
    }
    tool.to_string()
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

fn build_tool_call_detail(
    claude_code_meta: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<serde_json::Value> {
    let claude_code_meta = claude_code_meta?;
    let mut detail = serde_json::Map::new();
    detail.insert(
        "claudeCode".to_string(),
        serde_json::Value::Object(claude_code_meta.clone()),
    );
    Some(serde_json::Value::Object(detail))
}

fn extract_markdown_from_tool_call_content(content: &[schema::ToolCallContent]) -> Option<String> {
    let parts: Vec<String> = content
        .iter()
        .filter_map(|item| match item {
            schema::ToolCallContent::Content(c) => match &c.content {
                schema::ContentBlock::Text(text) if !text.text.trim().is_empty() => {
                    Some(text.text.clone())
                }
                _ => None,
            },
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
            schema::ToolCallContent::Content(c) => match &c.content {
                schema::ContentBlock::Text(text) if !text.text.trim().is_empty() => {
                    Some(crate::acp_client::types::AgentToolCallContentItem::Text {
                        text: text.text.clone(),
                    })
                }
                _ => None,
            },
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

use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::acp_client::logging::append_acp_log;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{
    AgentCapabilitiesSnapshot, AgentConfigOption, AgentImplementationInfo, AgentPlan,
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
    Stream(StreamDelta),
    ToolCall(ToolCallUpdate),
    PermissionRequest(PermissionRequest),
    Error {
        code: String,
        message: String,
        recoverable: bool,
    },
    TurnEnd(Option<AgentTurnUsage>),
    SessionClosed {
        reason: Option<String>,
    },
    SessionEnded,
    LoadCompleted,
    ConfigOptionsUpdate(Vec<AgentConfigOption>),
    Plan(AgentPlan),
    Usage(AgentUsage),
}

/// Atmos ACP Client - implements the Client trait, routes tool calls to handler
pub struct AtmosAcpClient {
    handler: Arc<dyn AcpToolHandler>,
    cwd: PathBuf,
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<bool>)>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
}

impl AtmosAcpClient {
    pub fn new(
        handler: Arc<dyn AcpToolHandler>,
        cwd: PathBuf,
        permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<bool>)>,
        event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
    ) -> Self {
        Self {
            handler,
            cwd,
            permission_tx,
            event_tx,
        }
    }
}

impl AtmosAcpClient {
    pub async fn request_permission(
        &self,
        args: schema::RequestPermissionRequest,
    ) -> acp::Result<schema::RequestPermissionResponse> {
        let tool_name = args
            .tool_call
            .fields
            .kind
            .as_ref()
            .map(|k| {
                let s = format!("{k:?}");
                if s.is_empty() || s == "None" {
                    "Tool".to_string()
                } else {
                    s
                }
            })
            .unwrap_or_else(|| "Tool".to_string());
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

        let allowed = response_rx.await.unwrap_or(false);

        // Pick option_id from args.options - first for allow, last for deny (common pattern)
        let option_id = if allowed {
            args.options
                .first()
                .map(|o| o.option_id.clone())
                .unwrap_or_else(|| schema::PermissionOptionId::from("allow"))
        } else {
            args.options
                .last()
                .map(|o| o.option_id.clone())
                .unwrap_or_else(|| schema::PermissionOptionId::from("deny"))
        };

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
                let tool_call_id = tool_call.tool_call_id.to_string();
                let claude_code_meta = extract_claude_code_meta(&tool_call);
                let parent_tool_call_id = extract_parent_tool_use_id(claude_code_meta.as_ref());
                let status = match tool_call.status {
                    schema::ToolCallStatus::InProgress => ToolCallStatus::Running,
                    schema::ToolCallStatus::Completed => ToolCallStatus::Completed,
                    schema::ToolCallStatus::Failed => ToolCallStatus::Failed,
                    _ => ToolCallStatus::Running,
                };
                let tool = extract_claude_tool_name(claude_code_meta.as_ref())
                    .unwrap_or_else(|| format_tool_kind(Some(&tool_call.kind)));
                let description = format_description(
                    Some(tool_call.title.as_str()),
                    &tool,
                    Some(tool_call.locations.as_slice()),
                    tool_call.raw_input.as_ref(),
                );
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(ToolCallUpdate {
                        tool_call_id,
                        parent_tool_call_id,
                        tool,
                        description,
                        status,
                        raw_input: tool_call.raw_input.clone(),
                        content: map_tool_call_content(&tool_call.content),
                        raw_output: tool_call.raw_output.clone(),
                        detail: build_tool_call_detail(claude_code_meta.as_ref()),
                    }));
            }
            schema::SessionUpdate::ToolCallUpdate(update) => {
                let tool_call_id = update.tool_call_id.to_string();
                let claude_code_meta = extract_claude_code_meta(&update);
                let parent_tool_call_id = extract_parent_tool_use_id(claude_code_meta.as_ref());
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
                let tool = extract_claude_tool_name(claude_code_meta.as_ref())
                    .unwrap_or_else(|| format_tool_kind(update.fields.kind.as_ref()));
                let description = format_description(
                    update.fields.title.as_deref(),
                    &tool,
                    update.fields.locations.as_deref(),
                    update.fields.raw_input.as_ref(),
                );
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(ToolCallUpdate {
                        tool_call_id,
                        parent_tool_call_id,
                        tool,
                        description,
                        status,
                        raw_input: update.fields.raw_input.clone(),
                        content: update
                            .fields
                            .content
                            .as_ref()
                            .map(|content| map_tool_call_content(content))
                            .unwrap_or_default(),
                        raw_output: update.fields.raw_output.clone(),
                        detail: build_tool_call_detail(claude_code_meta.as_ref()),
                    }));
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
            schema::SessionUpdate::SessionInfoUpdate(update) => {
                fn maybe_update<T>(value: schema::MaybeUndefined<T>) -> Option<Option<T>> {
                    match value {
                        schema::MaybeUndefined::Undefined => None,
                        schema::MaybeUndefined::Null => Some(None),
                        schema::MaybeUndefined::Value(value) => Some(Some(value)),
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
                let usage = AgentUsage {
                    used: update.used,
                    size: update.size,
                    cost: update.cost.map(|c| crate::acp_client::types::AgentCost {
                        amount: Some(c.amount),
                        currency: Some(c.currency),
                    }),
                };
                let _ = self.event_tx.send(AcpSessionEvent::Usage(usage));
            }
            _ => {}
        }
        Ok(())
    }

    pub async fn ext_method(&self, _args: schema::ExtRequest) -> acp::Result<schema::ExtResponse> {
        Err(acp::Error::method_not_found())
    }

    pub async fn ext_notification(&self, _args: schema::ExtNotification) -> acp::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use agent_client_protocol::schema;
    use serde_json::json;

    #[test]
    fn usage_update_allows_null_usage_fields() {
        let notification: schema::SessionNotification = serde_json::from_value(json!({
            "sessionId": "session-1",
            "update": {
                "sessionUpdate": "usage_update",
                "used": null,
                "size": null
            }
        }))
        .expect("nullable usage_update should deserialize");

        match notification.update {
            schema::SessionUpdate::UsageUpdate(update) => {
                assert_eq!(update.used, None);
                assert_eq!(update.size, None);
            }
            other => panic!("expected usage_update, got {other:?}"),
        }
    }

    #[test]
    fn usage_update_allows_missing_usage_fields() {
        let notification: schema::SessionNotification = serde_json::from_value(json!({
            "sessionId": "session-1",
            "update": {
                "sessionUpdate": "usage_update"
            }
        }))
        .expect("missing usage_update counters should deserialize");

        match notification.update {
            schema::SessionUpdate::UsageUpdate(update) => {
                assert_eq!(update.used, None);
                assert_eq!(update.size, None);
            }
            other => panic!("expected usage_update, got {other:?}"),
        }
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
}
