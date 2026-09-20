use serde_json::Value;

use crate::acp_client::types::ToolCallUpdate;
use crate::contract::AgentTool;

mod deepseek;
mod grok_acp;

#[derive(Debug, Default)]
pub(crate) struct OverlayState {
    pub grok_tasks: std::collections::HashMap<String, AgentTool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OverlayKind {
    DeepSeek,
    GrokAcp,
}

fn overlay_kind(provider_id: &str) -> Option<OverlayKind> {
    let id = provider_id.trim().to_ascii_lowercase();
    if id == "deepseek-harness" || id == "deepseek" || id.starts_with("deepseek-") {
        return Some(OverlayKind::DeepSeek);
    }
    // Native `grok` never reaches this mapper. ACP `grok-build` / `grok-acp` do.
    if id.contains("grok") {
        return Some(OverlayKind::GrokAcp);
    }
    None
}

pub(crate) fn prepare(provider_id: &str, update: &ToolCallUpdate) -> Option<ToolCallUpdate> {
    match overlay_kind(provider_id) {
        Some(OverlayKind::DeepSeek) => Some(deepseek::prepare(update)),
        Some(OverlayKind::GrokAcp) => Some(grok_acp::prepare(update)),
        None => None,
    }
}

pub(crate) fn task_replace(
    provider_id: &str,
    update: &ToolCallUpdate,
    state: &mut OverlayState,
) -> Option<(String, AgentTool)> {
    if overlay_kind(provider_id) != Some(OverlayKind::GrokAcp) {
        return None;
    }
    grok_acp::task_replace(update, &mut state.grok_tasks)
}

pub(crate) fn remember(provider_id: &str, tool: &AgentTool, state: &mut OverlayState) {
    if overlay_kind(provider_id) != Some(OverlayKind::GrokAcp) {
        return;
    }
    grok_acp::remember(tool, &mut state.grok_tasks);
}

pub(crate) fn finish(provider_id: &str, mut tool: AgentTool) -> AgentTool {
    if overlay_kind(provider_id) == Some(OverlayKind::GrokAcp) {
        grok_acp::strip_execute_footer(&mut tool);
    }
    tool
}

pub(crate) fn is_generic_kind_slug(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "other" | "tool" | "unknown"
    )
}

pub(crate) fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(text) = object
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return Some(text.to_string());
        }
    }
    None
}

pub(crate) fn envelope_type(value: Option<&Value>) -> Option<String> {
    let value = value?;
    first_string(value, &["type", "variant"]).map(|text| text.to_ascii_lowercase())
}

pub(crate) fn unwrap_envelope(value: Option<Value>) -> Option<Value> {
    let value = value?;
    if let Some(inner) = value
        .get("FileContent")
        .cloned()
        .or_else(|| value.get("file_content").cloned())
        .or_else(|| value.get("Result").cloned())
        .or_else(|| {
            value
                .get("content")
                .filter(|item| item.is_object())
                .cloned()
        })
    {
        return Some(inner);
    }
    Some(value)
}

pub(crate) fn looks_untyped(update: &ToolCallUpdate) -> bool {
    if let Some(kind) = update.acp_kind.as_deref() {
        if !is_generic_kind_slug(kind) {
            return false;
        }
    }
    is_generic_kind_slug(&update.tool)
}
