use serde_json::Value;

use crate::acp_client::types::{AgentToolCallContentItem, ToolCallStatus, ToolCallUpdate};
use crate::contract::AgentToolKind;
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus, SearchHit};
use crate::map::is_generic_tool_label;
use crate::map::{
    classify_tool, plan_document_from_tool_input, plan_from_tool_input, thinking_text,
    ClassifiedTool,
};
use crate::map::{
    extract_aspect_ratio, extract_background, extract_command, extract_cwd,
    extract_generated_images, extract_image_prompt, extract_image_size, extract_links,
    extract_path, extract_query, extract_reference_paths, extract_search_hits, extract_skill,
    extract_subagent, extract_task_id, extract_url,
};

use super::overlays::{self, OverlayState};

#[derive(Debug, Clone)]
pub(crate) enum ToolMapOut {
    FoldThinking {
        text: String,
        done: bool,
    },
    FoldPlan {
        plan: Value,
    },
    Hide,
    Tool(AgentTool),
    Replace {
        tool_call_id: String,
        tool: AgentTool,
    },
}

pub(crate) fn map_tool_call(
    provider_id: &str,
    update: &ToolCallUpdate,
    overlay_state: &mut OverlayState,
) -> ToolMapOut {
    if let Some((tool_call_id, tool)) = overlays::task_replace(provider_id, update, overlay_state) {
        return ToolMapOut::Replace { tool_call_id, tool };
    }
    let prepared = overlays::prepare(provider_id, update);
    let update = prepared.as_ref().unwrap_or(update);
    match map_tool_call_shared(update) {
        ToolMapOut::Tool(tool) => {
            overlays::remember(provider_id, &tool, overlay_state);
            ToolMapOut::Tool(overlays::finish(provider_id, tool))
        }
        other => other,
    }
}

fn map_tool_call_shared(update: &ToolCallUpdate) -> ToolMapOut {
    let title = nonempty_title(update);
    let input = update.raw_input.as_ref();
    let classified = classify_tool(&update.tool, title, input);
    let acp_hint = protocol_kind(update);

    if matches!(acp_hint, Some(AcpKindHint::Think)) || classified == ClassifiedTool::Thinking {
        return ToolMapOut::FoldThinking {
            text: thinking_text(title, input, update.raw_output.as_ref()),
            done: !matches!(&update.status, ToolCallStatus::Running),
        };
    }
    if matches!(acp_hint, Some(AcpKindHint::SwitchMode)) {
        if classified == ClassifiedTool::Plan {
            if let Some(plan) = plan_from_tool_input(input) {
                return ToolMapOut::FoldPlan { plan };
            }
        }
        return ToolMapOut::Hide;
    }
    match classified {
        ClassifiedTool::Plan => {
            return match plan_from_tool_input(input) {
                Some(plan) => ToolMapOut::FoldPlan { plan },
                None => ToolMapOut::Hide,
            };
        }
        ClassifiedTool::PlanDocument => {
            return ToolMapOut::Tool(plan_document_tool(update, input));
        }
        ClassifiedTool::Hide => return ToolMapOut::Hide,
        ClassifiedTool::Thinking | ClassifiedTool::Call(_) => {}
    }

    let payload = input.filter(|value| !is_empty_json(value));
    let output = update
        .raw_output
        .as_ref()
        .filter(|value| !is_empty_json(value));
    let mut kind = kind_from_hint_or_class(acp_hint, classified);
    kind = apply_name_overlay(kind, &update.tool, title, payload);

    let Some(kind) = kind else {
        return ToolMapOut::Tool(other_tool(update));
    };
    ToolMapOut::Tool(build_typed_tool(update, kind, payload, output))
}

/// ACP `tool_call_update` is a patch: omitted fields must not wipe the first report.
pub(crate) fn merge_tool_call_patch(
    prev: &ToolCallUpdate,
    incoming: ToolCallUpdate,
) -> ToolCallUpdate {
    ToolCallUpdate {
        tool_call_id: incoming.tool_call_id,
        parent_tool_call_id: incoming
            .parent_tool_call_id
            .or_else(|| prev.parent_tool_call_id.clone()),
        tool: if is_generic_tool_label(&incoming.tool) && !prev.tool.is_empty() {
            prev.tool.clone()
        } else {
            incoming.tool
        },
        description: if incoming.description.is_empty()
            || is_generic_tool_label(&incoming.description)
        {
            prev.description.clone()
        } else {
            incoming.description
        },
        acp_kind: merge_acp_kind(prev.acp_kind.as_deref(), incoming.acp_kind),
        status: incoming.status,
        // Cursor/Grok often re-send a partial rawInput object on later patches
        // (e.g. description only). Shallow-replace would drop filename/file_path.
        raw_input: merge_json_values(prev.raw_input.as_ref(), incoming.raw_input.as_ref()),
        content: if incoming.content.is_empty() {
            prev.content.clone()
        } else {
            incoming.content
        },
        locations: if incoming.locations.is_empty() {
            prev.locations.clone()
        } else {
            incoming.locations
        },
        raw_output: merge_json_values(prev.raw_output.as_ref(), incoming.raw_output.as_ref()),
        detail: incoming.detail.or_else(|| prev.detail.clone()),
    }
}

fn merge_json_values(prev: Option<&Value>, incoming: Option<&Value>) -> Option<Value> {
    match (prev, incoming) {
        (Some(prev), Some(incoming)) if !is_empty_json(incoming) => {
            Some(merge_json_object(prev, incoming))
        }
        (_, Some(incoming)) if !is_empty_json(incoming) => Some(incoming.clone()),
        (Some(prev), _) => Some(prev.clone()),
        _ => None,
    }
}

fn merge_json_object(prev: &Value, incoming: &Value) -> Value {
    match (prev, incoming) {
        (Value::Object(prev_map), Value::Object(incoming_map)) => {
            let mut out = prev_map.clone();
            for (key, value) in incoming_map {
                if is_empty_json(value) {
                    continue;
                }
                out.insert(
                    key.clone(),
                    match (out.get(key), value) {
                        (Some(prev_child), Value::Object(_)) => {
                            merge_json_object(prev_child, value)
                        }
                        _ => value.clone(),
                    },
                );
            }
            Value::Object(out)
        }
        (_, incoming) => incoming.clone(),
    }
}

fn merge_acp_kind(prev: Option<&str>, incoming: Option<String>) -> Option<String> {
    match incoming {
        Some(kind) if !overlays::is_generic_kind_slug(&kind) => Some(kind),
        other => prev
            .filter(|kind| !overlays::is_generic_kind_slug(kind))
            .map(str::to_string)
            .or(other),
    }
}

fn protocol_kind(update: &ToolCallUpdate) -> Option<AcpKindHint> {
    update
        .acp_kind
        .as_deref()
        .and_then(acp_kind_hint)
        .or_else(|| acp_kind_hint(&update.tool))
}

fn kind_from_hint_or_class(
    acp_hint: Option<AcpKindHint>,
    classified: ClassifiedTool,
) -> Option<AgentToolKind> {
    match acp_hint {
        Some(AcpKindHint::Read) => Some(AgentToolKind::Read),
        Some(AcpKindHint::Edit) => Some(AgentToolKind::Edit),
        Some(AcpKindHint::Delete) => Some(AgentToolKind::Delete),
        Some(AcpKindHint::Move) => Some(AgentToolKind::Move),
        Some(AcpKindHint::Search) => Some(AgentToolKind::Search),
        Some(AcpKindHint::Execute) => Some(AgentToolKind::Execute),
        Some(AcpKindHint::Fetch) => Some(AgentToolKind::Fetch),
        Some(AcpKindHint::Think | AcpKindHint::SwitchMode) | None => match classified {
            ClassifiedTool::Call(kind) if kind != AgentToolKind::Other => Some(kind),
            _ => None,
        },
    }
}

fn build_typed_tool(
    update: &ToolCallUpdate,
    kind: AgentToolKind,
    payload: Option<&Value>,
    output: Option<&Value>,
) -> AgentTool {
    let status = map_status(&update.status);
    let result = match &update.status {
        ToolCallStatus::Running => None,
        ToolCallStatus::Failed => Some(mapped_result(kind, payload, output, update, true)),
        ToolCallStatus::Completed => Some(mapped_result(kind, payload, output, update, false)),
    };
    let params = typed_params(kind, payload, update);
    let name = payload
        .and_then(|v| first_string(v, &["_toolName", "toolName"]))
        .filter(|name| !is_generic_tool_label(name))
        .unwrap_or_else(|| update.tool.clone());
    AgentTool {
        tool_call_id: update.tool_call_id.clone(),
        name,
        title: cleaned_title(kind, update, &params),
        kind,
        status,
        params,
        result,
    }
}

fn cleaned_title(
    kind: AgentToolKind,
    update: &ToolCallUpdate,
    params: &AgentToolParams,
) -> Option<String> {
    let title = nonempty_title(update)?;
    if is_generic_tool_label(title) {
        return None;
    }
    let path = match params {
        AgentToolParams::Read { path, .. }
        | AgentToolParams::Edit { path }
        | AgentToolParams::Delete { path } => Some(path.as_str()),
        _ => None,
    };
    if let Some(path) = path {
        if title_is_path_label(title, path) {
            return None;
        }
    }
    if kind == AgentToolKind::Execute {
        if let AgentToolParams::Execute { command, .. } = params {
            if title_is_path_label(title, command) {
                return None;
            }
        }
    }
    Some(title.to_string())
}

fn title_is_path_label(title: &str, path: &str) -> bool {
    let title = title.trim();
    if title == path {
        return true;
    }
    title
        .split_once(':')
        .is_some_and(|(_, rest)| rest.trim() == path)
        || title.ends_with(path)
}

fn typed_params(
    kind: AgentToolKind,
    payload: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolParams {
    let fallback = update.raw_input.as_ref();
    let value = payload.or(fallback);
    let title = title_fallback(update);
    match kind {
        AgentToolKind::Read => AgentToolParams::Read {
            path: value
                .and_then(extract_path)
                .or_else(|| first_location(update))
                .unwrap_or_default(),
            offset: value.and_then(|value| extract_i64(value, &["offset", "start_line"])),
            limit: value.and_then(|value| extract_i64(value, &["limit", "count", "num_lines"])),
        },
        AgentToolKind::Edit => AgentToolParams::Edit {
            path: value
                .and_then(extract_path)
                .or_else(|| first_location(update))
                .unwrap_or_default(),
        },
        AgentToolKind::Delete => AgentToolParams::Delete {
            path: value
                .and_then(extract_path)
                .or_else(|| first_location(update))
                .unwrap_or_default(),
        },
        AgentToolKind::Move => AgentToolParams::Move {
            from: value
                .and_then(|value| {
                    first_string(value, &["from", "source", "old_path"])
                        .or_else(|| extract_path(value))
                })
                .unwrap_or_default(),
            to: value
                .and_then(|value| first_string(value, &["to", "destination", "new_path"]))
                .unwrap_or_default(),
        },
        AgentToolKind::Search => {
            let query = value
                .and_then(extract_query)
                .or_else(|| title.clone())
                .unwrap_or_default();
            let glob = value
                .and_then(|value| first_string(value, &["glob"]))
                .filter(|glob| glob != &query);
            AgentToolParams::Search {
                query,
                path: value.and_then(extract_path),
                glob,
            }
        }
        AgentToolKind::WebSearch => AgentToolParams::WebSearch {
            query: value
                .and_then(extract_query)
                .or_else(|| title.clone())
                .unwrap_or_default(),
        },
        AgentToolKind::Execute => {
            let command = value
                .and_then(extract_command)
                .or_else(|| title.clone())
                .unwrap_or_default();
            let background = value.is_some_and(extract_background)
                || fallback.is_some_and(extract_background)
                || title_is_background(nonempty_title(update));
            AgentToolParams::Execute {
                command,
                cwd: value.and_then(extract_cwd),
                background,
                task_id: task_id_of(update.raw_output.as_ref())
                    .or_else(|| value.and_then(|value| task_id_of(Some(value)))),
            }
        }
        AgentToolKind::Fetch => AgentToolParams::Fetch {
            url: value
                .and_then(extract_url)
                .or_else(|| title.clone().filter(|text| looks_like_http_url(text)))
                .unwrap_or_default(),
        },
        AgentToolKind::Skill => AgentToolParams::Skill {
            skill: value
                .and_then(extract_skill)
                .or_else(|| title.clone())
                .unwrap_or_default(),
        },
        AgentToolKind::Subagent => {
            let (description, agent_type) = value.and_then(extract_subagent).unwrap_or_else(|| {
                (
                    value
                        .and_then(|value| first_string(value, &["description", "prompt"]))
                        .or_else(|| title.clone())
                        .unwrap_or_else(|| update.description.clone()),
                    value.and_then(|value| first_string(value, &["subagent_type", "agent_type"])),
                )
            });
            AgentToolParams::Subagent {
                description,
                agent_type,
            }
        }
        AgentToolKind::McpList => AgentToolParams::McpList {
            server: value.and_then(|v| first_string(v, &["server", "serverName"])),
        },
        AgentToolKind::McpCall => {
            let mcp = value
                .and_then(|v| {
                    let server = first_string(v, &["server", "serverName"]);
                    let tool = first_string(v, &["tool", "toolName", "name"]);
                    if server.is_some() || tool.is_some() {
                        Some(crate::contract::AgentMcpRef { server, tool })
                    } else {
                        None
                    }
                })
                .or_else(|| crate::map::mcp_ref_from_name(&update.tool))
                .or_else(|| crate::map::mcp_ref_from_name(&update.description));
            AgentToolParams::McpCall {
                server: mcp.as_ref().and_then(|item| item.server.clone()),
                tool: mcp.as_ref().and_then(|item| item.tool.clone()),
            }
        }
        AgentToolKind::ImageGen => {
            let prompt = value
                .and_then(extract_image_prompt)
                .or_else(|| title.clone())
                .unwrap_or_default();
            AgentToolParams::ImageGen {
                prompt,
                aspect_ratio: value.and_then(extract_aspect_ratio),
                size: value.and_then(extract_image_size),
                path: value.and_then(|v| {
                    first_string(v, &["filename", "path", "file", "file_path", "output_path"])
                }),
                reference_paths: value.and_then(extract_reference_paths),
            }
        }
        AgentToolKind::PlanDocument => {
            plan_document_from_tool_input(value).unwrap_or(AgentToolParams::PlanDocument {
                name: None,
                overview: None,
                plan: String::new(),
                todos: Vec::new(),
                is_project: None,
                phases: None,
            })
        }
        AgentToolKind::Other => AgentToolParams::Other {
            value: update
                .raw_input
                .clone()
                .filter(|value| !is_empty_json(value))
                .unwrap_or(Value::Null),
        },
    }
}

fn mapped_result(
    kind: AgentToolKind,
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
    failed: bool,
) -> AgentToolResult {
    if failed {
        if let Some(message) = error_message(output, update) {
            return AgentToolResult::Error { message };
        }
    }
    match kind {
        AgentToolKind::Execute => execute_result(output, Some(update)),
        AgentToolKind::WebSearch => {
            let query = payload
                .and_then(extract_query)
                .or_else(|| title_fallback(update))
                .unwrap_or_default();
            let links = output
                .map(extract_links)
                .filter(|links| !links.is_empty())
                .unwrap_or_else(|| payload.map(extract_links).unwrap_or_default());
            if links.is_empty() {
                text_or_empty(result_text(output, update))
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        AgentToolKind::Fetch => fetch_result(payload, output, update),
        AgentToolKind::Read => read_result(payload, output, update),
        AgentToolKind::Edit => diff_or_text(payload, output, update),
        AgentToolKind::Search => search_result(payload, output, update),
        AgentToolKind::ImageGen => images_result(payload, output, update),
        AgentToolKind::Delete
        | AgentToolKind::Move
        | AgentToolKind::Skill
        | AgentToolKind::Subagent
        | AgentToolKind::McpList
        | AgentToolKind::McpCall
        | AgentToolKind::PlanDocument => text_or_empty(result_text(output, update)),
        AgentToolKind::Other => other_result(output, update),
    }
}

fn images_result(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let mut images = output.map(extract_generated_images).unwrap_or_default();
    // Prefer ACP Image content blocks over input-shaped payload fields
    // (payload often carries `filename` which looks like a path).
    if images.is_empty() {
        for item in &update.content {
            if let AgentToolCallContentItem::Image { url, path, mime } = item {
                if url.as_ref().is_some_and(|u| !u.trim().is_empty())
                    || path.as_ref().is_some_and(|p| !p.trim().is_empty())
                {
                    images.push(crate::contract::AgentGeneratedImage {
                        url: url.clone(),
                        path: path.clone(),
                        mime: mime.clone(),
                    });
                }
            }
        }
    }
    if images.is_empty() {
        images = payload.map(extract_generated_images).unwrap_or_default();
    }
    if images.is_empty() {
        for path in &update.locations {
            if path.trim().is_empty() {
                continue;
            }
            images.push(crate::contract::AgentGeneratedImage {
                url: None,
                path: Some(path.clone()),
                mime: None,
            });
        }
    }
    if images.is_empty() {
        if let Some(path) = payload.and_then(|v| {
            first_string(v, &["filename", "path", "file", "file_path", "output_path"])
        }) {
            // Keep the provider-supplied path only — never scan ~/.cursor/projects
            // for a global newest match (cross-session / cross-project leak).
            images.push(crate::contract::AgentGeneratedImage {
                url: None,
                path: Some(path),
                mime: None,
            });
        }
    }
    if images.is_empty() {
        if let Some(text) = content_text(&update.content) {
            images = extract_generated_images(&Value::String(text));
        }
    }
    if images.is_empty() {
        text_or_empty(result_text(output, update))
    } else {
        AgentToolResult::Images { images }
    }
}

fn search_result(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let query = payload
        .and_then(extract_query)
        .or_else(|| title_fallback(update))
        .unwrap_or_default();
    let mut hits = output.map(extract_search_hits).unwrap_or_default();
    if hits.is_empty() {
        if let Some(text) = content_text(&update.content) {
            hits = extract_search_hits(&Value::String(text.clone()));
            if hits.is_empty() && update.locations.is_empty() {
                return AgentToolResult::Text { text };
            }
        }
    }
    if hits.is_empty() {
        hits = update
            .locations
            .iter()
            .filter(|path| !path.is_empty())
            .map(|path| SearchHit {
                path: path.clone(),
                line: None,
                snippet: None,
            })
            .collect();
    }
    if hits.is_empty() {
        text_or_empty(value_text(output))
    } else {
        AgentToolResult::SearchHits { query, hits }
    }
}

fn execute_result(output: Option<&Value>, update: Option<&ToolCallUpdate>) -> AgentToolResult {
    let text = value_text(output)
        .or_else(|| update.and_then(|update| content_text(&update.content)))
        .unwrap_or_default();
    let exit_code = output.and_then(extract_exit_code).or_else(|| {
        update
            .and_then(|update| update.raw_output.as_ref())
            .and_then(extract_exit_code)
    });
    AgentToolResult::Execute {
        output: text,
        exit_code,
    }
}

fn fetch_result(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let url = payload
        .and_then(extract_url)
        .or_else(|| output.and_then(extract_url))
        .unwrap_or_default();
    let title = output.and_then(|value| first_string(value, &["title"]));
    let markdown = output.and_then(|value| first_string(value, &["markdown", "md"]));
    let text = output
        .and_then(|value| first_string(value, &["text", "content", "body"]))
        .or_else(|| content_text(&update.content));
    if title.is_some() || markdown.is_some() || text.is_some() {
        AgentToolResult::WebFetch {
            url,
            title,
            markdown,
            text,
        }
    } else {
        text_or_empty(value_text(output))
    }
}

fn read_result(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let path = payload
        .and_then(extract_path)
        .or_else(|| output.and_then(extract_path))
        .or_else(|| first_location(update))
        .unwrap_or_default();
    if let Some(text) = output
        .and_then(|value| first_string(value, &["text", "content", "raw_output"]))
        .or_else(|| content_text(&update.content))
    {
        if path.is_empty() {
            return AgentToolResult::Text { text };
        }
        return AgentToolResult::FileContent { path, text };
    }
    text_or_empty(value_text(output))
}

fn diff_or_text(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let path = payload
        .and_then(extract_path)
        .or_else(|| output.and_then(extract_path))
        .or_else(|| first_location(update))
        .unwrap_or_default();
    if let Some(diff) = diff_from_content(&update.content, &path) {
        return diff;
    }
    // Prefer reconstructable old/new from Edit/Write input over stats-only.
    // Also dig Grok SearchReplace `EditsApplied` / Cursor rawOutput envelopes.
    if let Some(diff) = diff_from_edit_payload(payload.or(update.raw_input.as_ref()), &path)
        .or_else(|| diff_from_output_edit(output, &path))
    {
        return diff;
    }
    // Prefer a unified-diff text body over DiffStats so the UI can render a patch.
    if let Some(text) = result_text(output, update).filter(|text| looks_like_unified_diff(text)) {
        return AgentToolResult::Text { text };
    }
    if let Some((additions, deletions)) = output.and_then(extract_diff_counts) {
        return AgentToolResult::DiffStats {
            path,
            additions,
            deletions,
        };
    }
    AgentToolResult::Text {
        text: result_text(output, update).unwrap_or_default(),
    }
}

fn looks_like_unified_diff(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("--- ")
        || trimmed.starts_with("diff --git ")
        || trimmed.starts_with("*** ")
        || trimmed.starts_with("@@ ")
}

fn diff_from_edit_payload(payload: Option<&Value>, fallback_path: &str) -> Option<AgentToolResult> {
    let value = payload?;
    if let Some(diff) = diff_from_flat_edit_fields(
        value,
        fallback_path,
        &["new_string", "new_text", "newText", "contents", "content"],
    ) {
        return Some(diff);
    }
    for nested_key in ["EditsApplied", "edits_applied"] {
        if let Some(nested) = value.get(nested_key) {
            if let Some(diff) = diff_from_flat_edit_fields(
                nested,
                fallback_path,
                &["new_string", "new_text", "newText"],
            ) {
                return Some(diff);
            }
        }
    }
    None
}

/// Output envelopes may carry short status prose under `content` — only trust
/// explicit old/new string fields (and nested EditsApplied).
fn diff_from_output_edit(output: Option<&Value>, fallback_path: &str) -> Option<AgentToolResult> {
    let value = output?;
    if let Some(diff) =
        diff_from_flat_edit_fields(value, fallback_path, &["new_string", "new_text", "newText"])
    {
        return Some(diff);
    }
    for nested_key in ["EditsApplied", "edits_applied", "result", "Result"] {
        if let Some(nested) = value.get(nested_key) {
            if let Some(diff) = diff_from_flat_edit_fields(
                nested,
                fallback_path,
                &["new_string", "new_text", "newText"],
            ) {
                return Some(diff);
            }
        }
    }
    None
}

fn diff_from_flat_edit_fields(
    value: &Value,
    fallback_path: &str,
    new_keys: &[&str],
) -> Option<AgentToolResult> {
    let new_content = edit_payload_string(value, new_keys)?;
    // Write-style payloads often omit old_*; treat missing as empty file.
    let old_content =
        edit_payload_string(value, &["old_string", "old_text", "oldText"]).unwrap_or_default();
    let path = extract_path(value)
        .or_else(|| first_string(value, &["absolute_path", "absolutePath"]))
        .unwrap_or_else(|| fallback_path.to_string());
    Some(AgentToolResult::Diff {
        path,
        old_content: Some(old_content),
        new_content,
    })
}

/// Keep trailing newlines — Edit/Write hunks are not display labels.
fn edit_payload_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(text) = object.get(*key).and_then(Value::as_str) {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn other_result(output: Option<&Value>, update: &ToolCallUpdate) -> AgentToolResult {
    if let Some(diff) = diff_from_content(&update.content, "") {
        return diff;
    }
    if let Some(text) = content_text(&update.content) {
        return AgentToolResult::Text { text };
    }
    match output {
        Some(value) if !is_empty_json(value) => {
            if let Some(text) = value_text(Some(value)) {
                AgentToolResult::Text { text }
            } else {
                AgentToolResult::Other {
                    value: value.clone(),
                }
            }
        }
        _ => AgentToolResult::Empty,
    }
}

fn other_tool(update: &ToolCallUpdate) -> AgentTool {
    let status = map_status(&update.status);
    let result = match &update.status {
        ToolCallStatus::Running => None,
        ToolCallStatus::Failed => Some({
            if let Some(message) = error_message(update.raw_output.as_ref(), update) {
                AgentToolResult::Error { message }
            } else {
                other_result(update.raw_output.as_ref(), update)
            }
        }),
        ToolCallStatus::Completed => Some(other_result(update.raw_output.as_ref(), update)),
    };
    AgentTool {
        tool_call_id: update.tool_call_id.clone(),
        name: update.tool.clone(),
        title: nonempty_title(update).map(str::to_string),
        kind: AgentToolKind::Other,
        status,
        params: AgentToolParams::Other {
            value: update
                .raw_input
                .clone()
                .filter(|value| !is_empty_json(value))
                .unwrap_or(Value::Null),
        },
        result,
    }
}

fn plan_document_tool(update: &ToolCallUpdate, input: Option<&Value>) -> AgentTool {
    let status = map_status(&update.status);
    let params = plan_document_from_tool_input(input).unwrap_or(AgentToolParams::PlanDocument {
        name: None,
        overview: None,
        plan: String::new(),
        todos: Vec::new(),
        is_project: None,
        phases: None,
    });
    let title = match &params {
        AgentToolParams::PlanDocument { name, overview, .. } => name
            .clone()
            .or_else(|| overview.clone())
            .or_else(|| nonempty_title(update).map(str::to_string)),
        _ => nonempty_title(update).map(str::to_string),
    };
    let name = input
        .and_then(|v| first_string(v, &["_toolName", "toolName"]))
        .filter(|name| !is_generic_tool_label(name))
        .unwrap_or_else(|| {
            if is_generic_tool_label(&update.tool) {
                "createPlan".into()
            } else {
                update.tool.clone()
            }
        });
    let result = match &update.status {
        ToolCallStatus::Running => None,
        ToolCallStatus::Failed => Some({
            if let Some(message) = error_message(update.raw_output.as_ref(), update) {
                AgentToolResult::Error { message }
            } else {
                text_or_empty(result_text(update.raw_output.as_ref(), update))
            }
        }),
        ToolCallStatus::Completed => Some(text_or_empty(result_text(
            update.raw_output.as_ref(),
            update,
        ))),
    };
    AgentTool {
        tool_call_id: update.tool_call_id.clone(),
        name,
        title,
        kind: AgentToolKind::PlanDocument,
        status,
        params,
        result,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AcpKindHint {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Think,
    Fetch,
    SwitchMode,
}

fn acp_kind_hint(tool: &str) -> Option<AcpKindHint> {
    match normalize(tool).as_str() {
        "read" => Some(AcpKindHint::Read),
        "edit" => Some(AcpKindHint::Edit),
        "delete" => Some(AcpKindHint::Delete),
        "move" => Some(AcpKindHint::Move),
        "search" => Some(AcpKindHint::Search),
        "execute" => Some(AcpKindHint::Execute),
        "think" => Some(AcpKindHint::Think),
        "fetch" => Some(AcpKindHint::Fetch),
        "switchmode" | "switch_mode" => Some(AcpKindHint::SwitchMode),
        _ => None,
    }
}

fn apply_name_overlay(
    kind: Option<AgentToolKind>,
    name: &str,
    title: Option<&str>,
    payload: Option<&Value>,
) -> Option<AgentToolKind> {
    let labels = [Some(name), title];
    if labels.into_iter().flatten().any(is_web_search_label)
        || payload.is_some_and(action_type_is_search)
    {
        return Some(AgentToolKind::WebSearch);
    }
    if labels.into_iter().flatten().any(is_web_fetch_label)
        || payload.is_some_and(action_type_is_open_page)
    {
        return Some(AgentToolKind::Fetch);
    }
    if labels.into_iter().flatten().any(is_workspace_search_label) {
        return Some(AgentToolKind::Search);
    }
    if labels.into_iter().flatten().any(|label| {
        let n = normalize(label);
        n.contains("generate_image")
            || n.contains("generateimage")
            || n.contains("image_gen")
            || n.contains("image_edit")
            || n == "imagine"
    }) {
        return Some(AgentToolKind::ImageGen);
    }
    kind
}

fn nonempty_title(update: &ToolCallUpdate) -> Option<&str> {
    Some(update.description.as_str()).filter(|value| !value.is_empty())
}

fn title_fallback(update: &ToolCallUpdate) -> Option<String> {
    nonempty_title(update)
        .filter(|value| !is_generic_tool_label(value))
        .map(str::to_string)
}

fn first_location(update: &ToolCallUpdate) -> Option<String> {
    update
        .locations
        .iter()
        .map(|path| path.trim())
        .find(|path| !path.is_empty())
        .map(str::to_string)
}

fn looks_like_http_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn map_status(status: &ToolCallStatus) -> AgentToolStatus {
    match status {
        ToolCallStatus::Running => AgentToolStatus::Running,
        ToolCallStatus::Completed => AgentToolStatus::Completed,
        ToolCallStatus::Failed => AgentToolStatus::Failed,
    }
}

fn task_id_of(value: Option<&Value>) -> Option<String> {
    value.and_then(extract_task_id)
}

fn title_is_background(title: Option<&str>) -> bool {
    title.is_some_and(|title| title.trim().to_ascii_lowercase().starts_with("[bg]"))
}

fn is_web_search_label(value: &str) -> bool {
    let normalized = normalize(value);
    normalized == "web_search" || normalized == "websearch" || normalized.contains("web_search")
}

fn is_web_fetch_label(value: &str) -> bool {
    let normalized = normalize(value);
    normalized == "web_fetch"
        || normalized == "webfetch"
        || normalized == "open_page"
        || normalized == "openpage"
        || normalized == "find_in_page"
        || normalized == "findinpage"
}

fn is_workspace_search_label(value: &str) -> bool {
    matches!(
        normalize(value).as_str(),
        "glob" | "grep" | "grepsearch" | "grep_search"
    )
}

fn action_type_is_search(value: &Value) -> bool {
    value
        .get("action")
        .and_then(|action| action.get("type"))
        .and_then(Value::as_str)
        .is_some_and(|ty| normalize(ty) == "search")
}

fn action_type_is_open_page(value: &Value) -> bool {
    value
        .get("action")
        .and_then(|action| action.get("type"))
        .and_then(Value::as_str)
        .is_some_and(|ty| {
            matches!(
                normalize(ty).as_str(),
                "open_page" | "openpage" | "find_in_page" | "findinpage"
            )
        })
}

fn normalize(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
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

fn extract_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(Value::Number(number)) => return number.as_i64(),
            Some(Value::String(text)) => return text.trim().parse().ok(),
            _ => {}
        }
    }
    None
}

fn extract_exit_code(value: &Value) -> Option<i32> {
    extract_i64(value, &["exit_code", "exitCode", "status_code"]).map(|value| value as i32)
}

fn extract_diff_counts(value: &Value) -> Option<(u32, u32)> {
    let additions = extract_i64(value, &["additions", "added"])? as u32;
    let deletions = extract_i64(value, &["deletions", "removed", "deleted"])? as u32;
    Some((additions, deletions))
}

fn value_text(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    first_string(value, &["output", "text", "content", "body", "raw_output"])
}

fn result_text(output: Option<&Value>, update: &ToolCallUpdate) -> Option<String> {
    value_text(output).or_else(|| content_text(&update.content))
}

fn text_or_empty(text: Option<String>) -> AgentToolResult {
    match text.filter(|value| !value.trim().is_empty()) {
        Some(text) => AgentToolResult::Text { text },
        None => AgentToolResult::Empty,
    }
}

fn content_text(content: &[AgentToolCallContentItem]) -> Option<String> {
    let chunks: Vec<&str> = content
        .iter()
        .filter_map(|item| match item {
            AgentToolCallContentItem::Text { text } if !text.trim().is_empty() => {
                Some(text.as_str())
            }
            _ => None,
        })
        .collect();
    if chunks.is_empty() {
        None
    } else {
        Some(chunks.join("\n"))
    }
}

fn diff_from_content(
    content: &[AgentToolCallContentItem],
    fallback_path: &str,
) -> Option<AgentToolResult> {
    for item in content {
        if let AgentToolCallContentItem::Diff {
            path,
            old_content,
            new_content,
        } = item
        {
            return Some(AgentToolResult::Diff {
                path: path.clone().unwrap_or_else(|| fallback_path.to_string()),
                old_content: old_content.clone(),
                new_content: new_content.clone(),
            });
        }
    }
    None
}

fn error_message(output: Option<&Value>, update: &ToolCallUpdate) -> Option<String> {
    result_text(output, update)
        .or_else(|| nonempty_title(update).map(str::to_string))
        .filter(|text| !text.is_empty())
}

fn is_empty_json(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Object(map) => map.is_empty(),
        Value::Array(items) => items.is_empty(),
        Value::String(text) => text.trim().is_empty(),
        _ => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolEventKind {
    Started,
    Updated,
    Completed,
    Failed,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_client::types::ToolCallStatus;

    fn update(
        name: &str,
        status: ToolCallStatus,
        input: Value,
        output: Option<Value>,
    ) -> ToolCallUpdate {
        ToolCallUpdate {
            tool_call_id: "tc_1".into(),
            parent_tool_call_id: None,
            tool: name.into(),
            description: String::new(),
            acp_kind: None,
            status,
            raw_input: Some(input),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: output,
            detail: None,
        }
    }

    fn mapped_for(provider_id: &str, update: ToolCallUpdate) -> AgentTool {
        match map_tool_call(provider_id, &update, &mut OverlayState::default()) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        }
    }

    fn mapped(update: ToolCallUpdate) -> AgentTool {
        mapped_for("gemini", update)
    }

    #[test]
    fn s9_unknown_tool_is_other_with_vendor_value_once() {
        let tool = mapped(update(
            "vendor_mystery",
            ToolCallStatus::Completed,
            serde_json::json!({"opaque": true}),
            Some(serde_json::json!({"n": 1})),
        ));
        let json = serde_json::to_value(&tool).expect("serialize");
        assert_eq!(json["kind"], "other");
        assert_eq!(json["params"]["type"], "other");
        assert_eq!(json["params"]["value"], serde_json::json!({"opaque": true}));
        assert_eq!(json["result"]["type"], "other");
        assert_eq!(json["result"]["value"], serde_json::json!({"n": 1}));
        assert!(json.get("input").is_none());
        assert!(json.get("output").is_none());
        assert!(json.get("content").is_none());
        assert!(json.get("native").is_none());
    }

    #[test]
    fn s10_execute_unifies_bash_shapes() {
        let tool = mapped(update(
            "Bash",
            ToolCallStatus::Completed,
            serde_json::json!({"command": "ls -la"}),
            Some(serde_json::json!({"output": "README.md\n", "exit_code": 0})),
        ));
        match tool.params {
            AgentToolParams::Execute {
                command,
                background: false,
                ..
            } => assert_eq!(command, "ls -la"),
            other => panic!("expected execute params, got {other:?}"),
        }
    }

    #[test]
    fn s16_web_search_is_not_workspace_search() {
        let web = mapped(update(
            "web_search",
            ToolCallStatus::Completed,
            serde_json::json!({"query": "atmos acp"}),
            Some(serde_json::json!({
                "links": [{ "url": "https://example.com", "title": "Example" }]
            })),
        ));
        assert_eq!(web.kind, AgentToolKind::WebSearch);
        assert!(matches!(web.params, AgentToolParams::WebSearch { .. }));
        assert!(matches!(
            web.result,
            Some(AgentToolResult::WebSearch { .. })
        ));

        let grep = mapped(update(
            "Grep",
            ToolCallStatus::Completed,
            serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some(serde_json::json!("tool.rs:12")),
        ));
        assert_eq!(grep.kind, AgentToolKind::Search);
        assert!(matches!(grep.params, AgentToolParams::Search { .. }));
    }

    #[test]
    fn s11_think_and_plan_fold_before_tool_event() {
        let think = update(
            "think",
            ToolCallStatus::Completed,
            serde_json::json!({"thought": "hmm"}),
            None,
        );
        assert!(matches!(
            map_tool_call("gemini", &think, &mut OverlayState::default()),
            ToolMapOut::FoldThinking { .. }
        ));
        let plan = update(
            "TodoWrite",
            ToolCallStatus::Completed,
            serde_json::json!({"todos": [{"content": "Inspect", "status": "pending"}]}),
            None,
        );
        assert!(matches!(
            map_tool_call("gemini", &plan, &mut OverlayState::default()),
            ToolMapOut::FoldPlan { .. }
        ));
        let hide = update(
            "SwitchMode",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        assert!(matches!(
            map_tool_call("gemini", &hide, &mut OverlayState::default()),
            ToolMapOut::Hide
        ));
        // Cursor AskUser is permission chrome only — never a tool card.
        let ask = update(
            "AskQuestion",
            ToolCallStatus::Completed,
            serde_json::json!({
                "questions": [{"prompt": "Color?", "options": ["Blue", "Red"]}]
            }),
            None,
        );
        assert!(matches!(
            map_tool_call("cursor", &ask, &mut OverlayState::default()),
            ToolMapOut::Hide
        ));
    }

    #[test]
    fn acp_search_hits_from_grep_lines() {
        let tool = mapped(update(
            "Grep",
            ToolCallStatus::Completed,
            serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some(serde_json::json!(
                "crates/agent/src/lib.rs:12: pub struct AgentTool"
            )),
        ));
        assert_eq!(tool.kind, AgentToolKind::Search);
        match tool.result {
            Some(AgentToolResult::SearchHits { query, hits }) => {
                assert_eq!(query, "AgentTool");
                assert_eq!(hits[0].path, "crates/agent/src/lib.rs");
                assert_eq!(hits[0].line, Some(12));
            }
            other => panic!("expected search_hits, got {other:?}"),
        }
    }

    #[test]
    fn acp_search_zero_hits_keeps_text() {
        let tool = mapped(update(
            "Grep",
            ToolCallStatus::Completed,
            serde_json::json!({"pattern": "none"}),
            Some(serde_json::json!("")),
        ));
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::Empty) | Some(AgentToolResult::Text { .. })
        ));
    }

    fn load_fixture(name: &str) -> Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/providers/acp/testdata")
            .join(name);
        serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
    }

    #[test]
    fn fixtures_cover_unknown_search_execute_and_fetch() {
        let unknown = load_fixture("unknown_tool.json");
        let tool = mapped(update(
            unknown["name"].as_str().unwrap(),
            ToolCallStatus::Completed,
            unknown["raw_input"].clone(),
            Some(unknown["raw_output"].clone()),
        ));
        assert_eq!(tool.kind, AgentToolKind::Other);

        let web = load_fixture("web_search.json");
        let tool = mapped(update(
            web["name"].as_str().unwrap(),
            ToolCallStatus::Completed,
            web["raw_input"].clone(),
            Some(web["raw_output"].clone()),
        ));
        assert_eq!(tool.kind, AgentToolKind::WebSearch);

        let fetch = load_fixture("web_fetch.json");
        let tool = mapped(update(
            fetch["name"].as_str().unwrap(),
            ToolCallStatus::Completed,
            fetch["raw_input"].clone(),
            Some(fetch["raw_output"].clone()),
        ));
        assert_eq!(tool.kind, AgentToolKind::Fetch);

        let titled = load_fixture("kind_title_content.json");
        let mut call = update(
            titled["name"].as_str().unwrap(),
            ToolCallStatus::Completed,
            titled["raw_input"].clone(),
            None,
        );
        call.description = titled["title"].as_str().unwrap().to_string();
        call.acp_kind = Some("search".into());
        call.content = vec![AgentToolCallContentItem::Text {
            text: titled["content_text"].as_str().unwrap().to_string(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Search);
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::Text { .. }) | Some(AgentToolResult::SearchHits { .. })
        ));
    }

    #[test]
    fn s16_web_fetch_maps_url() {
        let tool = mapped(update(
            "WebFetch",
            ToolCallStatus::Completed,
            serde_json::json!({"url": "https://example.com/page"}),
            Some(serde_json::json!({
                "title": "Example",
                "markdown": "# Hello"
            })),
        ));
        assert_eq!(tool.kind, AgentToolKind::Fetch);
        assert!(matches!(tool.params, AgentToolParams::Fetch { .. }));
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::WebFetch { .. })
        ));
    }

    #[test]
    fn acp_kind_without_raw_input_stays_typed_and_uses_content() {
        let mut call = update(
            "Search",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.acp_kind = Some("search".into());
        call.description = "Check LLM providers, DB backend, app names".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "crates/llm/src/lib.rs:12: pub struct Provider".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Search);
        match tool.params {
            AgentToolParams::Search { query, .. } => {
                assert_eq!(query, "Check LLM providers, DB backend, app names");
            }
            other => panic!("expected search params, got {other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::SearchHits { hits, .. }) => {
                assert_eq!(hits[0].path, "crates/llm/src/lib.rs");
            }
            Some(AgentToolResult::Text { text }) => {
                assert!(text.contains("crates/llm/src/lib.rs"));
            }
            other => panic!("expected search content, got {other:?}"),
        }
    }

    #[test]
    fn acp_other_kind_maps_content_text_instead_of_empty_object() {
        let mut call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.acp_kind = Some("other".into());
        call.description = "Inspect relay/hub client semantics from code".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "relay client uses session tokens".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Other);
        assert_eq!(
            tool.title.as_deref(),
            Some("Inspect relay/hub client semantics from code")
        );
        match tool.params {
            AgentToolParams::Other { value } => assert!(value.is_null()),
            other => panic!("expected other params, got {other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::Text { text }) => {
                assert_eq!(text, "relay client uses session tokens");
            }
            other => panic!("expected text result, got {other:?}"),
        }
    }

    #[test]
    fn acp_read_kind_keeps_read_without_path() {
        let mut call = update(
            "Read",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.acp_kind = Some("read".into());
        call.description = "Read top-of-file comments in core modules".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "//! Core engine".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Read);
        match tool.result {
            Some(AgentToolResult::Text { text }) => assert_eq!(text, "//! Core engine"),
            other => panic!("expected text, got {other:?}"),
        }
    }

    #[test]
    fn acp_read_kind_uses_locations_for_path() {
        let mut call = update(
            "Read",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.acp_kind = Some("read".into());
        call.locations = vec!["/tmp/app/README.md".into()];
        call.content = vec![AgentToolCallContentItem::Text {
            text: "# hi\n".into(),
        }];
        let tool = mapped(call);
        match tool.params {
            AgentToolParams::Read { path, .. } => assert_eq!(path, "/tmp/app/README.md"),
            other => panic!("expected read params, got {other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::FileContent { path, text }) => {
                assert_eq!(path, "/tmp/app/README.md");
                assert_eq!(text, "# hi\n");
            }
            other => panic!("expected file content, got {other:?}"),
        }
    }

    #[test]
    fn acp_edit_diff_content_keeps_old_and_new() {
        let mut call = update(
            "Edit",
            ToolCallStatus::Completed,
            serde_json::json!({"path": "/tmp/app/TECH.md"}),
            None,
        );
        call.acp_kind = Some("edit".into());
        call.content = vec![AgentToolCallContentItem::Diff {
            path: Some("/tmp/app/TECH.md".into()),
            old_content: Some("old\n".into()),
            new_content: "new\n".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Edit);
        match tool.result {
            Some(AgentToolResult::Diff {
                path,
                old_content,
                new_content,
            }) => {
                assert_eq!(path, "/tmp/app/TECH.md");
                assert_eq!(old_content.as_deref(), Some("old\n"));
                assert_eq!(new_content, "new\n");
            }
            other => panic!("expected diff, got {other:?}"),
        }
    }

    #[test]
    fn acp_edit_input_old_new_string_becomes_diff_over_stats() {
        let call = update(
            "Edit",
            ToolCallStatus::Completed,
            serde_json::json!({
                "path": "/tmp/app/TECH.md",
                "old_string": "line a\n",
                "new_string": "line b\n",
            }),
            Some(serde_json::json!({ "additions": 1, "deletions": 1 })),
        );
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Edit);
        match tool.result {
            Some(AgentToolResult::Diff {
                path,
                old_content,
                new_content,
            }) => {
                assert_eq!(path, "/tmp/app/TECH.md");
                assert_eq!(old_content.as_deref(), Some("line a\n"));
                assert_eq!(new_content, "line b\n");
            }
            other => panic!("expected diff from edit input, got {other:?}"),
        }
    }

    #[test]
    fn acp_edit_stats_only_stays_diff_stats() {
        let call = update(
            "Edit",
            ToolCallStatus::Completed,
            serde_json::json!({ "path": "/tmp/app/TECH.md" }),
            Some(serde_json::json!({ "additions": 1, "deletions": 1 })),
        );
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Edit);
        match tool.result {
            Some(AgentToolResult::DiffStats {
                path,
                additions,
                deletions,
            }) => {
                assert_eq!(path, "/tmp/app/TECH.md");
                assert_eq!(additions, 1);
                assert_eq!(deletions, 1);
            }
            other => panic!("expected diff_stats, got {other:?}"),
        }
    }

    #[test]
    fn acp_edit_outside_workspace_diff_content_keeps_old_and_new() {
        let plan = "/Users/me/.cursor/plans/Agent-Chat.plan.md";
        let mut call = update(
            "Edit",
            ToolCallStatus::Completed,
            serde_json::json!({ "path": plan }),
            Some(serde_json::json!({ "additions": 10, "deletions": 10 })),
        );
        call.acp_kind = Some("edit".into());
        call.content = vec![AgentToolCallContentItem::Diff {
            path: Some(plan.into()),
            old_content: Some("# Plan\n- a\n".into()),
            new_content: "# Plan\n- b\n".into(),
        }];
        let tool = mapped(call);
        match tool.result {
            Some(AgentToolResult::Diff {
                path,
                old_content,
                new_content,
            }) => {
                assert_eq!(path, plan);
                assert_eq!(old_content.as_deref(), Some("# Plan\n- a\n"));
                assert_eq!(new_content, "# Plan\n- b\n");
            }
            other => panic!("expected Diff for outside-workspace plan, got {other:?}"),
        }
    }

    #[test]
    fn acp_write_edits_applied_output_becomes_diff() {
        let plan = "/Users/me/.grok/sessions/%2Fproj/01abc/plan.md";
        let call = update(
            "Write",
            ToolCallStatus::Completed,
            serde_json::json!({ "file_path": plan, "content": "# Plan\n" }),
            Some(serde_json::json!({
                "type": "SearchReplace",
                "EditsApplied": {
                    "old_string": "",
                    "new_string": "# Plan\n",
                    "absolute_path": plan,
                }
            })),
        );
        let tool = mapped(call);
        match tool.result {
            Some(AgentToolResult::Diff {
                path,
                old_content,
                new_content,
            }) => {
                assert_eq!(path, plan);
                assert_eq!(old_content.as_deref(), Some(""));
                assert_eq!(new_content, "# Plan\n");
            }
            other => panic!("expected Diff from EditsApplied, got {other:?}"),
        }
    }

    #[test]
    fn shared_other_file_path_maps_to_read() {
        let mut call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({"file_path": "/tmp/app/Cargo.toml"}),
            None,
        );
        call.acp_kind = Some("other".into());
        call.description = "/tmp/app/Cargo.toml".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "[workspace]\n".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Read);
        match tool.params {
            AgentToolParams::Read { path, .. } => {
                assert_eq!(path, "/tmp/app/Cargo.toml");
            }
            other => panic!("expected read params, got {other:?}"),
        }
    }

    #[test]
    fn shared_other_command_maps_to_execute() {
        let tool = mapped(update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({"command": "ls apps crates packages"}),
            None,
        ));
        assert_eq!(tool.kind, AgentToolKind::Execute);
    }

    #[test]
    fn shared_grok_envelope_maps_to_execute() {
        let tool = mapped(update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({
                "type": "Bash",
                "command": "ls -la"
            }),
            Some(serde_json::json!({
                "type": "backgroundtaskstarted",
                "Result": { "task_id": "t1", "status": "running" }
            })),
        ));
        assert_eq!(tool.kind, AgentToolKind::Execute);
    }

    #[test]
    fn acp_search_uses_locations_when_output_is_empty() {
        let mut call = update(
            "glob",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.locations = vec!["/tmp/app/Cargo.toml".into(), "/tmp/app/package.json".into()];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Search);
        match tool.result {
            Some(AgentToolResult::SearchHits { hits, .. }) => {
                assert_eq!(hits.len(), 2);
                assert_eq!(hits[0].path, "/tmp/app/Cargo.toml");
            }
            other => panic!("expected search hits, got {other:?}"),
        }
    }

    #[test]
    fn acp_search_splits_content_paths_into_hits() {
        let mut call = update(
            "glob",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.content = vec![
            AgentToolCallContentItem::Text {
                text: "/tmp/app/Cargo.toml".into(),
            },
            AgentToolCallContentItem::Text {
                text: "/tmp/app/package.json".into(),
            },
        ];
        let tool = mapped(call);
        match tool.result {
            Some(AgentToolResult::SearchHits { hits, .. }) => {
                assert_eq!(hits.len(), 2);
                assert_eq!(hits[1].path, "/tmp/app/package.json");
            }
            other => panic!("expected search hits, got {other:?}"),
        }
    }

    #[test]
    fn acp_tool_call_update_patch_keeps_kind_and_title() {
        let mut first = update(
            "Search",
            ToolCallStatus::Running,
            serde_json::json!({}),
            None,
        );
        first.acp_kind = Some("search".into());
        first.description = "Explore canvas/pt-design/terminal feature UI files".into();
        let mut second = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        second.acp_kind = Some("other".into());
        second.description = String::new();
        second.content = vec![AgentToolCallContentItem::Text {
            text: "apps/web/src/features/canvas/index.ts".into(),
        }];
        let merged = merge_tool_call_patch(&first, second);
        let tool = mapped(merged);
        assert_eq!(tool.kind, AgentToolKind::Search);
        assert_eq!(
            tool.title.as_deref(),
            Some("Explore canvas/pt-design/terminal feature UI files")
        );
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::Text { .. }) | Some(AgentToolResult::SearchHits { .. })
        ));
    }

    #[test]
    fn cursor_generate_image_maps_to_image_gen() {
        let tool = mapped(update(
            "generateImage",
            ToolCallStatus::Completed,
            serde_json::json!({
                "description": "A tiny red square icon",
                "filename": "red-square.png",
                "aspect_ratio": "1:1"
            }),
            Some(serde_json::json!({
                "path": "/tmp/red-square.png"
            })),
        ));
        assert_eq!(tool.kind, AgentToolKind::ImageGen);
        match tool.params {
            AgentToolParams::ImageGen {
                prompt,
                aspect_ratio,
                path,
                ..
            } => {
                assert_eq!(prompt, "A tiny red square icon");
                assert_eq!(aspect_ratio.as_deref(), Some("1:1"));
                assert_eq!(path.as_deref(), Some("red-square.png"));
            }
            other => panic!("expected image_gen params, got {other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::Images { images }) => {
                assert_eq!(images.len(), 1);
                assert_eq!(images[0].path.as_deref(), Some("/tmp/red-square.png"));
            }
            other => panic!("expected images result, got {other:?}"),
        }
    }

    #[test]
    fn cursor_generate_image_content_block_maps_to_images() {
        // Cursor ACP often returns ContentBlock::Image (data URL) with empty raw_output.
        let mut call = update(
            "generateImage",
            ToolCallStatus::Completed,
            serde_json::json!({
                "description": "minimal cyan square",
                "filename": "cursor-image-probe.png",
                "aspect_ratio": "1:1"
            }),
            None,
        );
        call.content = vec![AgentToolCallContentItem::Image {
            url: Some("data:image/png;base64,iVBORw0KGgo=".into()),
            path: None,
            mime: Some("image/png".into()),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::ImageGen);
        match tool.result {
            Some(AgentToolResult::Images { images }) => {
                assert_eq!(images.len(), 1);
                assert!(images[0]
                    .url
                    .as_deref()
                    .unwrap_or("")
                    .starts_with("data:image/png;base64,"));
            }
            other => panic!("expected images from content block, got {other:?}"),
        }
    }

    #[test]
    fn cursor_generate_image_falls_back_to_filename_param() {
        let tool = mapped(update(
            "generateImage",
            ToolCallStatus::Completed,
            serde_json::json!({
                "description": "minimal cyan square",
                "filename": "cursor-image-probe.png"
            }),
            None,
        ));
        match tool.result {
            Some(AgentToolResult::Images { images }) => {
                let path = images[0].path.as_deref().unwrap_or("");
                // Prefer resolved Cursor assets absolute path when the file exists.
                assert!(
                    path.ends_with("cursor-image-probe.png"),
                    "unexpected path {path}"
                );
            }
            other => panic!("expected filename fallback images, got {other:?}"),
        }
    }

    #[test]
    fn merge_preserves_generate_image_filename_across_partial_patches() {
        let first = update(
            "generateImage",
            ToolCallStatus::Running,
            serde_json::json!({
                "description": "minimal cyan square",
                "filename": "cursor-image-probe.png",
                "aspect_ratio": "1:1"
            }),
            None,
        );
        let second = update(
            "generateImage",
            ToolCallStatus::Completed,
            serde_json::json!({
                "description": "minimal cyan square"
            }),
            None,
        );
        let merged = merge_tool_call_patch(&first, second);
        assert_eq!(
            merged.raw_input.as_ref().and_then(|v| v.get("filename")),
            Some(&serde_json::json!("cursor-image-probe.png"))
        );
        assert_eq!(
            merged
                .raw_input
                .as_ref()
                .and_then(|v| v.get("aspect_ratio")),
            Some(&serde_json::json!("1:1"))
        );
        let tool = mapped(merged);
        match tool.result {
            Some(AgentToolResult::Images { images }) => {
                assert!(images[0]
                    .path
                    .as_deref()
                    .unwrap_or("")
                    .ends_with("cursor-image-probe.png"));
            }
            other => panic!("expected images after merge, got {other:?}"),
        }
    }

    #[test]
    fn grok_image_gen_maps_to_image_gen_with_data_url() {
        let tool = mapped(update(
            "image_gen",
            ToolCallStatus::Completed,
            serde_json::json!({
                "prompt": "soft blue gradient",
                "aspect_ratio": "16:9"
            }),
            Some(serde_json::json!({
                "url": "data:image/png;base64,iVBORw0KGgo="
            })),
        ));
        assert_eq!(tool.kind, AgentToolKind::ImageGen);
        match tool.result {
            Some(AgentToolResult::Images { images }) => {
                assert_eq!(images.len(), 1);
                assert!(images[0]
                    .url
                    .as_deref()
                    .unwrap_or("")
                    .starts_with("data:image/png;base64,"));
            }
            other => panic!("expected images result, got {other:?}"),
        }
    }

    #[test]
    fn cursor_create_plan_is_plan_document_not_fold_plan() {
        let raw: Value = serde_json::from_str(include_str!("testdata/cursor_create_plan.json"))
            .expect("fixture");
        let update = ToolCallUpdate {
            tool_call_id: raw["toolCallId"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: "Tool".into(),
            description: raw["title"].as_str().unwrap_or("").into(),
            acp_kind: Some("other".into()),
            status: ToolCallStatus::Completed,
            raw_input: Some(raw["rawInput"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        };
        match map_tool_call("cursor", &update, &mut OverlayState::default()) {
            ToolMapOut::FoldPlan { .. } => panic!("createPlan must not fold into live PlanUpdated"),
            ToolMapOut::Tool(tool) => {
                assert_eq!(tool.kind, AgentToolKind::PlanDocument);
                assert_eq!(tool.name, "createPlan");
                match tool.params {
                    AgentToolParams::PlanDocument {
                        name,
                        overview,
                        plan,
                        todos,
                        is_project,
                        ..
                    } => {
                        assert_eq!(name.as_deref(), Some("Refactor tabs layout"));
                        assert_eq!(
                            overview.as_deref(),
                            Some("Tighten layout behavior and preserve existing UX.")
                        );
                        assert!(plan.contains("Inspect current tab sizing logic"));
                        assert_eq!(todos.len(), 3);
                        assert_eq!(todos[0].content, "Inspect current tab sizing logic");
                        assert_eq!(todos[0].status, "completed");
                        assert_eq!(todos[1].status, "in_progress");
                        assert_eq!(is_project, Some(false));
                    }
                    other => panic!("expected PlanDocument params, got {other:?}"),
                }
            }
            other => panic!("expected PlanDocument tool, got {other:?}"),
        }
    }

    #[test]
    fn cursor_update_todos_still_folds_to_plan() {
        let raw: Value = serde_json::from_str(include_str!("testdata/cursor_update_todos.json"))
            .expect("fixture");
        let update = ToolCallUpdate {
            tool_call_id: raw["toolCallId"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: "Tool".into(),
            description: raw["title"].as_str().unwrap_or("").into(),
            acp_kind: Some("other".into()),
            status: ToolCallStatus::Completed,
            raw_input: Some(raw["rawInput"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        };
        match map_tool_call("cursor", &update, &mut OverlayState::default()) {
            ToolMapOut::FoldPlan { plan } => {
                let entries = plan["entries"].as_array().expect("entries");
                assert_eq!(entries.len(), 2);
                assert_eq!(entries[0]["status"], "completed");
                assert_eq!(entries[1]["status"], "in_progress");
            }
            other => panic!("expected FoldPlan for updateTodos, got {other:?}"),
        }
    }

    #[test]
    fn non_cursor_plan_plus_todos_input_folds_not_plan_document() {
        // Amp/other ACP agents: execution todos must not become PlanDocument just because
        // the payload also carries a `plan` markdown string.
        let update = ToolCallUpdate {
            tool_call_id: "tc_amp_todos".into(),
            parent_tool_call_id: None,
            tool: "Tool".into(),
            description: "Update TODOs".into(),
            acp_kind: Some("other".into()),
            status: ToolCallStatus::Completed,
            raw_input: Some(serde_json::json!({
                "_toolName": "TodoWrite",
                "plan": "# Notes\n\nDo work.",
                "todos": [
                    {"content": "Inspect", "status": "pending"},
                    {"content": "Ship", "status": "in_progress"}
                ]
            })),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        };
        match map_tool_call("amp", &update, &mut OverlayState::default()) {
            ToolMapOut::FoldPlan { plan } => {
                let entries = plan["entries"].as_array().expect("entries");
                assert_eq!(entries.len(), 2);
            }
            ToolMapOut::Tool(tool) if tool.kind == AgentToolKind::PlanDocument => {
                panic!("plan+todos must not become PlanDocument for non-Cursor tools");
            }
            other => panic!("expected FoldPlan, got {other:?}"),
        }
    }
}
