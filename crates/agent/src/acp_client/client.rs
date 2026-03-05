//! ACP Client implementation - implements the Client trait to communicate with Agent via stdio.

use std::path::PathBuf;
use std::sync::Arc;

use agent_client_protocol::{self as acp, Client as AcpClientTrait};

fn format_tool_kind(kind: Option<&acp::ToolKind>) -> String {
    match kind {
        Some(acp::ToolKind::Read) => "Read".to_string(),
        Some(acp::ToolKind::Edit) => "Edit".to_string(),
        Some(acp::ToolKind::Delete) => "Delete".to_string(),
        Some(acp::ToolKind::Move) => "Move".to_string(),
        Some(acp::ToolKind::Search) => "Search".to_string(),
        Some(acp::ToolKind::Execute) => "Execute".to_string(),
        Some(acp::ToolKind::Think) => "Think".to_string(),
        Some(acp::ToolKind::Fetch) => "Fetch".to_string(),
        Some(acp::ToolKind::SwitchMode) => "SwitchMode".to_string(),
        Some(acp::ToolKind::Other) | None => "Tool".to_string(),
        Some(_) => "Tool".to_string(),
    }
}

fn format_description(
    title: Option<&str>,
    tool: &str,
    locations: Option<&[acp::ToolCallLocation]>,
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

use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{
    AgentConfigOption, AgentPlan, AgentPlanEntry, StreamDelta, ToolCallStatus, ToolCallUpdate,
    AgentUsage, AgentTurnUsage,
};
use crate::acp_client::types::{PermissionOption, PermissionRequest, RiskLevel};

/// Events sent from ACP session to the session manager (for WebSocket forwarding)
#[derive(Debug)]
pub enum AcpSessionEvent {
    Stream(StreamDelta),
    ToolCall(ToolCallUpdate),
    PermissionRequest(PermissionRequest),
    Error {
        code: String,
        message: String,
        recoverable: bool,
    },
    TurnEnd(Option<AgentTurnUsage>),
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

#[async_trait::async_trait(?Send)]
impl AcpClientTrait for AtmosAcpClient {
    async fn request_permission(
        &self,
        args: acp::RequestPermissionRequest,
    ) -> acp::Result<acp::RequestPermissionResponse> {
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
                    acp::PermissionOptionKind::AllowOnce => "allow_once".to_string(),
                    acp::PermissionOptionKind::AllowAlways => "allow_always".to_string(),
                    acp::PermissionOptionKind::RejectOnce => "reject_once".to_string(),
                    acp::PermissionOptionKind::RejectAlways => "reject_always".to_string(),
                    _ => "other".to_string(),
                },
            })
            .collect();

        let (response_tx, response_rx) = oneshot::channel();
        let request = PermissionRequest {
            request_id: format!("perm_{}", uuid::Uuid::new_v4().simple()),
            tool: tool_name,
            description,
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
                .unwrap_or_else(|| acp::PermissionOptionId::from("allow"))
        } else {
            args.options
                .last()
                .map(|o| o.option_id.clone())
                .unwrap_or_else(|| acp::PermissionOptionId::from("deny"))
        };

        Ok(acp::RequestPermissionResponse::new(
            acp::RequestPermissionOutcome::Selected(acp::SelectedPermissionOutcome::new(option_id)),
        ))
    }

    async fn read_text_file(
        &self,
        args: acp::ReadTextFileRequest,
    ) -> acp::Result<acp::ReadTextFileResponse> {
        let path_str = args.path.to_string_lossy();
        let path = self.handler.resolve_path(&self.cwd, path_str.as_ref());
        match self.handler.read_text_file(&path).await {
            Ok(content) => Ok(acp::ReadTextFileResponse::new(content)),
            Err(_) => Err(acp::Error::invalid_params()),
        }
    }

    async fn write_text_file(
        &self,
        args: acp::WriteTextFileRequest,
    ) -> acp::Result<acp::WriteTextFileResponse> {
        let path_str = args.path.to_string_lossy();
        let path = self.handler.resolve_path(&self.cwd, path_str.as_ref());
        match self.handler.write_text_file(&path, &args.content).await {
            Ok(()) => Ok(acp::WriteTextFileResponse::new()),
            Err(_) => Err(acp::Error::invalid_params()),
        }
    }

    async fn create_terminal(
        &self,
        _args: acp::CreateTerminalRequest,
    ) -> acp::Result<acp::CreateTerminalResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn terminal_output(
        &self,
        _args: acp::TerminalOutputRequest,
    ) -> acp::Result<acp::TerminalOutputResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn release_terminal(
        &self,
        _args: acp::ReleaseTerminalRequest,
    ) -> acp::Result<acp::ReleaseTerminalResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn wait_for_terminal_exit(
        &self,
        _args: acp::WaitForTerminalExitRequest,
    ) -> acp::Result<acp::WaitForTerminalExitResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn kill_terminal_command(
        &self,
        _args: acp::KillTerminalCommandRequest,
    ) -> acp::Result<acp::KillTerminalCommandResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn session_notification(&self, args: acp::SessionNotification) -> acp::Result<()> {
        match args.update {
            acp::SessionUpdate::UserMessageChunk(acp::ContentChunk { content, .. }) => {
                let text = match content {
                    acp::ContentBlock::Text(t) => t.text,
                    acp::ContentBlock::Image(_) => " ".into(),
                    acp::ContentBlock::Audio(_) => " ".into(),
                    acp::ContentBlock::ResourceLink(r) => r.uri,
                    acp::ContentBlock::Resource(_) => " ".into(),
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
            acp::SessionUpdate::AgentMessageChunk(acp::ContentChunk { content, .. }) => {
                let text = match content {
                    acp::ContentBlock::Text(t) => t.text,
                    acp::ContentBlock::Image(_) => " ".into(),
                    acp::ContentBlock::Audio(_) => " ".into(),
                    acp::ContentBlock::ResourceLink(r) => r.uri,
                    acp::ContentBlock::Resource(_) => " ".into(),
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
            acp::SessionUpdate::AgentThoughtChunk(acp::ContentChunk { content, .. }) => {
                let text = match content {
                    acp::ContentBlock::Text(t) => t.text,
                    acp::ContentBlock::Image(_) => " ".into(),
                    acp::ContentBlock::Audio(_) => " ".into(),
                    acp::ContentBlock::ResourceLink(r) => r.uri,
                    acp::ContentBlock::Resource(_) => " ".into(),
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
            acp::SessionUpdate::ToolCall(tool_call) => {
                let tool_call_id = tool_call.tool_call_id.to_string();
                let status = match tool_call.status {
                    acp::ToolCallStatus::InProgress => ToolCallStatus::Running,
                    acp::ToolCallStatus::Completed => ToolCallStatus::Completed,
                    acp::ToolCallStatus::Failed => ToolCallStatus::Failed,
                    _ => ToolCallStatus::Running,
                };
                let tool = format_tool_kind(Some(&tool_call.kind));
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
                        tool,
                        description,
                        status,
                        raw_input: tool_call.raw_input.clone(),
                        raw_output: tool_call.raw_output.clone(),
                        detail: None,
                    }));
            }
            acp::SessionUpdate::ToolCallUpdate(update) => {
                let tool_call_id = update.tool_call_id.to_string();
                let status = match update
                    .fields
                    .status
                    .unwrap_or(acp::ToolCallStatus::default())
                {
                    acp::ToolCallStatus::InProgress => ToolCallStatus::Running,
                    acp::ToolCallStatus::Completed => ToolCallStatus::Completed,
                    acp::ToolCallStatus::Failed => ToolCallStatus::Failed,
                    _ => ToolCallStatus::Running,
                };
                let tool = format_tool_kind(update.fields.kind.as_ref());
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
                        tool,
                        description,
                        status,
                        raw_input: update.fields.raw_input.clone(),
                        raw_output: update.fields.raw_output.clone(),
                        detail: None,
                    }));
            }
            acp::SessionUpdate::Plan(plan) => {
                let entries = plan
                    .entries
                    .into_iter()
                    .map(|e| AgentPlanEntry {
                        content: e.content,
                        priority: match e.priority {
                            acp::PlanEntryPriority::High => "high".to_string(),
                            acp::PlanEntryPriority::Medium => "medium".to_string(),
                            acp::PlanEntryPriority::Low => "low".to_string(),
                            _ => "medium".to_string(),
                        },
                        status: match e.status {
                            acp::PlanEntryStatus::Pending => "pending".to_string(),
                            acp::PlanEntryStatus::InProgress => "in_progress".to_string(),
                            acp::PlanEntryStatus::Completed => "completed".to_string(),
                            _ => "pending".to_string(),
                        },
                    })
                    .collect();
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::Plan(AgentPlan { entries }));
            }
            acp::SessionUpdate::CurrentModeUpdate(update) => {
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
            acp::SessionUpdate::ConfigOptionUpdate(update) => {
                let out = super::runner::map_config_options(update.config_options);
                let _ = self
                    .event_tx
                    .send(AcpSessionEvent::ConfigOptionsUpdate(out));
            }
            acp::SessionUpdate::UsageUpdate(update) => {
                let usage = AgentUsage {
                    used: Some(update.used),
                    size: Some(update.size),
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

    async fn ext_method(&self, _args: acp::ExtRequest) -> acp::Result<acp::ExtResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn ext_notification(&self, _args: acp::ExtNotification) -> acp::Result<()> {
        Ok(())
    }
}
