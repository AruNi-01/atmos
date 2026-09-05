//! ACP Client implementation - implements the Client trait to communicate with Agent via stdio.

use std::path::PathBuf;
use std::sync::Arc;

use agent_client_protocol::schema::v1 as schema;
use agent_client_protocol::{self as acp, schema as acp_schema};
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

fn is_generic_tool_label(value: &str) -> bool {
    crate::domain::is_generic_tool_label(value)
}

const INPUT_PATH_KEYS: &[&str] = &[
    "absolute_path",
    "absolute_root_path",
    "target_file",
    "targetFile",
    "target_directory",
    "file_path",
    "filePath",
    "path",
    "dir_path",
    "directory",
    "file",
    "uri",
];

fn map_has_path(map: &serde_json::Map<String, serde_json::Value>) -> bool {
    INPUT_PATH_KEYS.iter().any(|key| {
        map.get(*key)
            .and_then(|item| item.as_str())
            .is_some_and(|path| !path.is_empty())
    })
}

/// Cursor-style ACP calls often put the file on `locations` and leave `rawInput` empty.
fn enrich_tool_input(
    raw_input: Option<serde_json::Value>,
    locations: Option<&[schema::ToolCallLocation]>,
) -> Option<serde_json::Value> {
    let location = locations.and_then(|locs| locs.first());
    let path = location
        .map(|loc| loc.path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty());
    let line = location.and_then(|loc| loc.line);

    match raw_input {
        None if path.is_none() && line.is_none() => None,
        Some(value) if !value.is_object() => Some(value),
        value => {
            let mut map = match value {
                Some(serde_json::Value::Object(map)) => map,
                _ => serde_json::Map::new(),
            };
            if let Some(path) = path {
                if !map_has_path(&map) {
                    map.insert("path".into(), serde_json::Value::String(path));
                }
            }
            if let Some(line) = line {
                if !map.contains_key("line") && !map.contains_key("offset") {
                    map.insert("line".into(), serde_json::json!(line));
                }
            }
            if map.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(map))
            }
        }
    }
}

fn extract_vendor_tool_type(input: Option<&serde_json::Value>) -> Option<String> {
    let input = input?;
    let ty = input
        .get("type")
        .and_then(|value| value.as_str())
        .or_else(|| input.get("variant").and_then(|value| value.as_str()))
        .map(str::trim)?;
    if ty.is_empty() || is_generic_tool_label(ty) {
        return None;
    }
    Some(ty.to_string())
}

fn vendor_payload(input: Option<&serde_json::Value>) -> Option<&serde_json::Value> {
    let input = input?;
    input
        .get("FileContent")
        .or_else(|| input.get("file_content"))
        .or_else(|| input.get("Content"))
        .or_else(|| input.get("content").filter(|value| value.is_object()))
        .or_else(|| input.get("result").filter(|value| value.is_object()))
        .or(Some(input))
}

fn vendor_nested_path(input: Option<&serde_json::Value>) -> Option<String> {
    let payload = vendor_payload(input)?;
    for key in [
        "absolute_path",
        "absolute_root_path",
        "target_file",
        "target_directory",
        "file_path",
        "path",
        "dir_path",
        "directory",
    ] {
        if let Some(path) = payload
            .get(key)
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
        {
            return Some(path.to_string());
        }
    }
    None
}

fn format_description(
    title: Option<&str>,
    tool: &str,
    locations: Option<&[schema::ToolCallLocation]>,
    raw_input: Option<&serde_json::Value>,
    raw_output: Option<&serde_json::Value>,
) -> String {
    let vendor_type =
        extract_vendor_tool_type(raw_input).or_else(|| extract_vendor_tool_type(raw_output));
    let tool_label = vendor_type.as_deref().unwrap_or(tool);
    if let Some(t) = title.filter(|s| !s.is_empty() && !is_generic_tool_label(s)) {
        return t.to_string();
    }
    // Fallback: use first location path (e.g. for Read: "path/to/file.rs")
    if let Some(locs) = locations {
        if let Some(loc) = locs.first() {
            let path = loc.path.to_string_lossy();
            if !path.is_empty() {
                return format!("{tool_label}: {path}");
            }
        }
    }
    if let Some(path) = vendor_nested_path(raw_input).or_else(|| vendor_nested_path(raw_output)) {
        return format!("{tool_label}: {path}");
    }
    // Fallback: extract from raw_input
    if let Some(input) = raw_input {
        if let Some(path) = input.get("path").and_then(|v| v.as_str()) {
            if !path.is_empty() {
                return format!("{tool_label}: {path}");
            }
        }
        if let Some(path) = input.get("file_path").and_then(|v| v.as_str()) {
            if !path.is_empty() {
                return format!("{tool_label}: {path}");
            }
        }
        if let Some(url) = input.get("url").and_then(|v| v.as_str()) {
            if !url.is_empty() {
                return format!("{tool_label}: {url}");
            }
        }
        if let Some(pattern) = input.get("pattern").and_then(|v| v.as_str()) {
            if !pattern.is_empty() {
                let short = if pattern.len() > 80 {
                    &pattern[..77]
                } else {
                    pattern
                };
                return format!("{tool_label}: {short}");
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
    tool_label.to_string()
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
    AgentCapabilitiesSnapshot, AgentConfigOption, AgentCost, AgentImplementationInfo, AgentPlan,
    AgentPlanEntry, AgentSessionInfoUpdate, AgentTurnUsage, AgentUsage, StreamDelta,
    ToolCallStatus, ToolCallUpdate,
};
use crate::acp_client::types::{
    PermissionDecision, PermissionOption, PermissionRequest, RiskLevel,
};

/// Events sent from ACP session to the session manager (for WebSocket forwarding)
#[derive(Debug)]
pub enum AcpSessionEvent {
    AgentInfoUpdate(Option<AgentImplementationInfo>),
    CapabilitiesUpdate(AgentCapabilitiesSnapshot),
    SessionReady {
        acp_session_id: String,
    },
    SessionInfoUpdate(AgentSessionInfoUpdate),
    AvailableCommandsUpdate(Vec<crate::domain::AgentAvailableCommand>),
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
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<PermissionDecision>)>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
}

impl AtmosAcpClient {
    pub fn new(
        handler: Arc<dyn AcpToolHandler>,
        cwd: PathBuf,
        permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<PermissionDecision>)>,
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
        let claude_meta = extract_claude_code_meta(&args.tool_call);
        let raw_input = args.tool_call.fields.raw_input.clone();
        let tool_name = extract_claude_tool_name(claude_meta.as_ref())
            .or_else(|| extract_vendor_tool_type(raw_input.as_ref()))
            .or_else(|| {
                args.tool_call
                    .fields
                    .title
                    .as_deref()
                    .map(str::trim)
                    .filter(|title| !title.is_empty() && !is_generic_tool_label(title))
                    .map(ToOwned::to_owned)
            })
            .or_else(|| {
                args.meta
                    .as_ref()
                    .and_then(|meta| meta.get("permission"))
                    .and_then(|perm| perm.get("title"))
                    .and_then(|title| title.as_str())
                    .map(str::trim)
                    .filter(|title| !title.is_empty())
                    .map(ToOwned::to_owned)
            })
            .or_else(|| {
                args.tool_call.fields.kind.as_ref().map(|k| {
                    let s = format!("{k:?}");
                    if s.is_empty() || s == "None" {
                        "Tool".to_string()
                    } else {
                        s
                    }
                })
            })
            .unwrap_or_else(|| "Tool".to_string());
        let description = args
            .meta
            .as_ref()
            .and_then(|meta| meta.get("permission"))
            .and_then(|perm| perm.get("title"))
            .and_then(|title| title.as_str())
            .map(str::trim)
            .filter(|title| !title.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                args.tool_call
                    .fields
                    .title
                    .clone()
                    .filter(|s| !s.is_empty())
            })
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
            .and_then(|content| extract_markdown_from_tool_call_content(content))
            .or_else(|| {
                raw_input
                    .as_ref()
                    .and_then(|input| input.get("plan"))
                    .and_then(|plan| plan.as_str())
                    .map(str::trim)
                    .filter(|plan| !plan.is_empty())
                    .map(ToOwned::to_owned)
            });
        let questions = crate::domain::questions_from_tool_input(raw_input.as_ref());

        let (response_tx, response_rx) = oneshot::channel();
        let request = PermissionRequest {
            request_id: format!("perm_{}", uuid::Uuid::new_v4().simple()),
            tool: tool_name,
            description,
            content_markdown,
            questions,
            raw_input,
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

        let decision = response_rx
            .await
            .unwrap_or_else(|_| crate::acp_client::types::PermissionDecision {
                option_id: "reject".to_string(),
                answers: None,
                updated_input: None,
            });
        let option_id = args
            .options
            .iter()
            .find(|option| option.option_id.0.as_ref() == decision.option_id)
            .map(|option| option.option_id.clone())
            .unwrap_or_else(|| schema::PermissionOptionId::new(decision.option_id.clone()));

        let mut selected = schema::SelectedPermissionOutcome::new(option_id);
        if decision.answers.is_some() || decision.updated_input.is_some() {
            let mut meta = serde_json::Map::new();
            let mut atmos = serde_json::Map::new();
            if let Some(answers) = decision.answers {
                atmos.insert("answers".into(), answers);
            }
            if let Some(updated_input) = decision.updated_input {
                atmos.insert("updatedInput".into(), updated_input);
            }
            meta.insert("atmos".into(), serde_json::Value::Object(atmos));
            selected = selected.meta(meta);
        }

        Ok(schema::RequestPermissionResponse::new(
            schema::RequestPermissionOutcome::Selected(selected),
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
                    .or_else(|| extract_vendor_tool_type(tool_call.raw_input.as_ref()))
                    .or_else(|| extract_vendor_tool_type(tool_call.raw_output.as_ref()))
                    .unwrap_or_else(|| format_tool_kind(Some(&tool_call.kind)));
                let raw_input = enrich_tool_input(
                    tool_call.raw_input.clone(),
                    Some(tool_call.locations.as_slice()),
                );
                let description = format_description(
                    Some(tool_call.title.as_str()),
                    &tool,
                    Some(tool_call.locations.as_slice()),
                    raw_input.as_ref(),
                    tool_call.raw_output.as_ref(),
                );
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(ToolCallUpdate {
                        tool_call_id,
                        parent_tool_call_id,
                        tool,
                        description,
                        status,
                        raw_input,
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
                    .or_else(|| extract_vendor_tool_type(update.fields.raw_input.as_ref()))
                    .or_else(|| extract_vendor_tool_type(update.fields.raw_output.as_ref()))
                    .unwrap_or_else(|| format_tool_kind(update.fields.kind.as_ref()));
                let raw_input = enrich_tool_input(
                    update.fields.raw_input.clone(),
                    update.fields.locations.as_deref(),
                );
                let description = format_description(
                    update.fields.title.as_deref(),
                    &tool,
                    update.fields.locations.as_deref(),
                    raw_input.as_ref(),
                    update.fields.raw_output.as_ref(),
                );
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ToolCall(ToolCallUpdate {
                        tool_call_id,
                        parent_tool_call_id,
                        tool,
                        description,
                        status,
                        raw_input,
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
            schema::SessionUpdate::AvailableCommandsUpdate(update) => {
                let commands = update
                    .available_commands
                    .into_iter()
                    .map(|command| crate::domain::AgentAvailableCommand {
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

    pub async fn ext_notification(&self, _args: schema::ExtNotification) -> acp::Result<()> {
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
    fn grok_listdir_envelope_becomes_a_concrete_title() {
        let input = json!({
            "type": "ListDir",
            "Content": {
                "content": "- /tmp/app/\n - README.md",
                "absolute_root_path": "/tmp/app"
            }
        });
        assert_eq!(
            super::extract_vendor_tool_type(Some(&input)).as_deref(),
            Some("ListDir")
        );
        assert_eq!(
            super::format_description(Some("Tool"), "Tool", None, Some(&input), None),
            "ListDir: /tmp/app"
        );
    }

    #[test]
    fn grok_readfile_envelope_uses_absolute_path() {
        let output = json!({
            "type": "ReadFile",
            "FileContent": {
                "absolute_path": "/tmp/app/README.md",
                "raw_output": "# hi\n",
                "limit": 40,
                "total_lines": 80
            }
        });
        assert_eq!(
            super::extract_vendor_tool_type(Some(&output)).as_deref(),
            Some("ReadFile")
        );
        assert_eq!(
            super::format_description(Some("Tool"), "Tool", None, None, Some(&output)),
            "ReadFile: /tmp/app/README.md"
        );
    }

    #[test]
    fn cursor_kind_title_does_not_hide_location_path() {
        let loc = schema::ToolCallLocation::new("/tmp/app/README.md");
        assert_eq!(
            super::format_description(
                Some("Read"),
                "Read",
                Some(std::slice::from_ref(&loc)),
                None,
                None,
            ),
            "Read: /tmp/app/README.md"
        );
        let input = super::enrich_tool_input(None, Some(std::slice::from_ref(&loc))).unwrap();
        assert_eq!(
            input.get("path").and_then(|v| v.as_str()),
            Some("/tmp/app/README.md")
        );
    }

    #[test]
    fn cursor_execute_title_does_not_hide_command() {
        let input = json!({ "command": "echo hello" });
        assert_eq!(
            super::format_description(Some("Run Script"), "Execute", None, Some(&input), None),
            "Execute: echo hello"
        );
    }
}
