use std::collections::HashMap;

use serde_json::Value;

use crate::acp_client::types::{AgentToolCallContentItem, ToolCallStatus, ToolCallUpdate};
use crate::contract::AgentToolKind;
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::is_generic_tool_label;
use crate::map::{classify_tool, plan_from_tool_input, thinking_text, ClassifiedTool};
use crate::map::{
    extract_background, extract_command, extract_cwd, extract_links, extract_path, extract_query,
    extract_search_hits, extract_skill, extract_subagent, extract_task_id, extract_url,
};

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
    update: &ToolCallUpdate,
    grok_tasks: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    if is_task_output(update) {
        return map_grok_task_output(update, grok_tasks);
    }

    let input = update.raw_input.as_ref();
    let envelope_name = envelope_type(input)
        .or_else(|| envelope_type(update.raw_output.as_ref()))
        .filter(|ty| !is_generic_tool_label(ty));
    let title = nonempty_title(update);
    let name = envelope_name
        .as_deref()
        .or(title.filter(|value| !is_generic_tool_label(value)))
        .unwrap_or(update.tool.as_str());
    let classified = classify_tool(name, nonempty_title(update), input);
    let acp_hint = protocol_kind(update).or_else(|| acp_kind_hint(name));

    if matches!(acp_hint, Some(AcpKindHint::Think)) || classified == ClassifiedTool::Thinking {
        return ToolMapOut::FoldThinking {
            text: thinking_text(nonempty_title(update), input, update.raw_output.as_ref()),
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
        ClassifiedTool::Hide => return ToolMapOut::Hide,
        ClassifiedTool::Thinking | ClassifiedTool::Call(_) => {}
    }

    let payload = effective_payload(input);
    let output = effective_payload(update.raw_output.as_ref());
    let mut kind = kind_from_hint_or_class(acp_hint, classified);
    kind = apply_name_overlay(kind, &update.tool, nonempty_title(update), payload);

    if looks_like_grok_execute(update, payload, output) {
        kind = Some(AgentToolKind::Execute);
    }
    if looks_like_grok_edit(update, payload, output) {
        kind = Some(AgentToolKind::Edit);
    }

    let Some(kind) = kind else {
        return ToolMapOut::Tool(other_tool(update));
    };
    match build_typed_tool(update, kind, payload, output) {
        Some(tool) => {
            remember_grok_execute(&tool, grok_tasks);
            ToolMapOut::Tool(tool)
        }
        None => ToolMapOut::Tool(other_tool(update)),
    }
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
        raw_input: incoming
            .raw_input
            .filter(|value| !is_empty_json(value))
            .or_else(|| prev.raw_input.clone()),
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
        raw_output: incoming
            .raw_output
            .filter(|value| !is_empty_json(value))
            .or_else(|| prev.raw_output.clone()),
        detail: incoming.detail.or_else(|| prev.detail.clone()),
    }
}

fn merge_acp_kind(prev: Option<&str>, incoming: Option<String>) -> Option<String> {
    match incoming {
        Some(kind) if !is_generic_kind_slug(&kind) => Some(kind),
        other => prev
            .filter(|kind| !is_generic_kind_slug(kind))
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

fn map_grok_task_output(
    update: &ToolCallUpdate,
    grok_tasks: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    let output = effective_payload(update.raw_output.as_ref())
        .or_else(|| effective_payload(update.raw_input.as_ref()));
    let task_id = task_id_of(update.raw_output.as_ref()).or_else(|| task_id_of(output));
    let Some(task_id) = task_id else {
        return ToolMapOut::Tool(other_tool(update));
    };
    let Some(mut original) = grok_tasks.get(&task_id).cloned() else {
        return ToolMapOut::Tool(other_tool(update));
    };
    original.status = grok_task_status(output).unwrap_or_else(|| map_status(&update.status));
    original.result = Some(execute_result(output, Some(update)));
    if let AgentToolParams::Execute {
        task_id: stored_task,
        ..
    } = &mut original.params
    {
        if stored_task.is_none() {
            *stored_task = Some(task_id.clone());
        }
    }
    grok_tasks.insert(task_id, original.clone());
    ToolMapOut::Replace {
        tool_call_id: original.tool_call_id.clone(),
        tool: original,
    }
}

fn remember_grok_execute(tool: &AgentTool, grok_tasks: &mut HashMap<String, AgentTool>) {
    let AgentToolParams::Execute {
        background,
        task_id,
        ..
    } = &tool.params
    else {
        return;
    };
    if let Some(task_id) = task_id {
        grok_tasks.insert(task_id.clone(), tool.clone());
    } else if *background {
        grok_tasks.insert(tool.tool_call_id.clone(), tool.clone());
    }
}

fn build_typed_tool(
    update: &ToolCallUpdate,
    kind: AgentToolKind,
    payload: Option<&Value>,
    output: Option<&Value>,
) -> Option<AgentTool> {
    let params = typed_params(kind, payload, output, update)?;
    let status = map_status(&update.status);
    let result = match &update.status {
        ToolCallStatus::Running => None,
        ToolCallStatus::Failed => Some(mapped_result(kind, payload, output, update, true)),
        ToolCallStatus::Completed => Some(mapped_result(kind, payload, output, update, false)),
    };
    Some(AgentTool {
        tool_call_id: update.tool_call_id.clone(),
        name: update.tool.clone(),
        title: nonempty_title(update).map(str::to_string),
        kind,
        status,
        params,
        result,
    })
}

fn typed_params(
    kind: AgentToolKind,
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> Option<AgentToolParams> {
    let fallback = update.raw_input.as_ref();
    let value = payload.or(fallback);
    match kind {
        AgentToolKind::Read => {
            let path = value.and_then(extract_path)?;
            Some(AgentToolParams::Read {
                path,
                offset: value.and_then(|value| extract_i64(value, &["offset", "start_line"])),
                limit: value.and_then(|value| extract_i64(value, &["limit", "count", "num_lines"])),
            })
        }
        AgentToolKind::Edit => Some(AgentToolParams::Edit {
            path: value
                .and_then(extract_path)
                .or_else(|| output.and_then(extract_path))
                .or_else(|| first_location(update))?,
        }),
        AgentToolKind::Delete => Some(AgentToolParams::Delete {
            path: value.and_then(extract_path)?,
        }),
        AgentToolKind::Move => {
            let value = value?;
            Some(AgentToolParams::Move {
                from: first_string(value, &["from", "source", "old_path"])
                    .or_else(|| extract_path(value))?,
                to: first_string(value, &["to", "destination", "new_path"])?,
            })
        }
        AgentToolKind::Search => {
            let value = value?;
            let query = extract_query(value)?;
            let glob = first_string(value, &["glob"]).filter(|glob| glob != &query);
            Some(AgentToolParams::Search {
                query,
                path: extract_path(value),
                glob,
            })
        }
        AgentToolKind::WebSearch => Some(AgentToolParams::WebSearch {
            query: value.and_then(extract_query)?,
        }),
        AgentToolKind::Execute => {
            let value = value?;
            let command = extract_command(value)?;
            let background = extract_background(value)
                || fallback.is_some_and(extract_background)
                || title_is_background(nonempty_title(update))
                || is_background_task_started(payload)
                || is_background_task_started(update.raw_output.as_ref());
            Some(AgentToolParams::Execute {
                command,
                cwd: extract_cwd(value),
                background,
                task_id: task_id_of(update.raw_output.as_ref()).or_else(|| task_id_of(Some(value))),
            })
        }
        AgentToolKind::Fetch => Some(AgentToolParams::Fetch {
            url: value.and_then(extract_url)?,
        }),
        AgentToolKind::Skill => Some(AgentToolParams::Skill {
            skill: value.and_then(extract_skill)?,
        }),
        AgentToolKind::Subagent => {
            let (description, agent_type) = value.and_then(extract_subagent).unwrap_or_else(|| {
                (
                    value
                        .and_then(|value| first_string(value, &["description", "prompt"]))
                        .unwrap_or_else(|| update.description.clone()),
                    value.and_then(|value| first_string(value, &["subagent_type", "agent_type"])),
                )
            });
            Some(AgentToolParams::Subagent {
                description,
                agent_type,
            })
        }
        AgentToolKind::Other => Some(AgentToolParams::Other {
            value: update.raw_input.clone().unwrap_or_else(empty_object),
        }),
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
            let query = payload.and_then(extract_query).unwrap_or_default();
            let links = output
                .map(extract_links)
                .filter(|links| !links.is_empty())
                .unwrap_or_else(|| payload.map(extract_links).unwrap_or_default());
            if links.is_empty() {
                AgentToolResult::Text {
                    text: value_text(output).unwrap_or_default(),
                }
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        AgentToolKind::Fetch => fetch_result(payload, output),
        AgentToolKind::Read => read_result(payload, output),
        AgentToolKind::Edit => diff_or_text(payload, output, update),
        AgentToolKind::Search => search_result(payload, output),
        AgentToolKind::Delete
        | AgentToolKind::Move
        | AgentToolKind::Skill
        | AgentToolKind::Subagent => AgentToolResult::Text {
            text: value_text(output).unwrap_or_default(),
        },
        AgentToolKind::Other => match update.raw_output.clone() {
            Some(value) => AgentToolResult::Other { value },
            None => AgentToolResult::Empty,
        },
    }
}

fn search_result(payload: Option<&Value>, output: Option<&Value>) -> AgentToolResult {
    let query = payload.and_then(extract_query).unwrap_or_default();
    let hits = output.map(extract_search_hits).unwrap_or_default();
    if hits.is_empty() {
        AgentToolResult::Text {
            text: value_text(output).unwrap_or_default(),
        }
    } else {
        AgentToolResult::SearchHits { query, hits }
    }
}

fn execute_result(output: Option<&Value>, update: Option<&ToolCallUpdate>) -> AgentToolResult {
    let mut text = value_text(output)
        .or_else(|| update.and_then(|update| content_text(&update.content)))
        .unwrap_or_default();
    text = strip_grok_poll_footer(&text);
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

fn fetch_result(payload: Option<&Value>, output: Option<&Value>) -> AgentToolResult {
    let url = payload
        .and_then(extract_url)
        .or_else(|| output.and_then(extract_url))
        .unwrap_or_default();
    let title = output.and_then(|value| first_string(value, &["title"]));
    let markdown = output.and_then(|value| first_string(value, &["markdown", "md"]));
    let text = output.and_then(|value| first_string(value, &["text", "content", "body"]));
    if title.is_some() || markdown.is_some() || text.is_some() {
        AgentToolResult::WebFetch {
            url,
            title,
            markdown,
            text,
        }
    } else {
        AgentToolResult::Text {
            text: value_text(output).unwrap_or_default(),
        }
    }
}

fn read_result(payload: Option<&Value>, output: Option<&Value>) -> AgentToolResult {
    let path = payload
        .and_then(extract_path)
        .or_else(|| output.and_then(extract_path))
        .unwrap_or_default();
    if let Some(text) =
        output.and_then(|value| first_string(value, &["text", "content", "raw_output"]))
    {
        return AgentToolResult::FileContent { path, text };
    }
    AgentToolResult::Text {
        text: value_text(output).unwrap_or_default(),
    }
}

fn diff_or_text(
    payload: Option<&Value>,
    output: Option<&Value>,
    update: &ToolCallUpdate,
) -> AgentToolResult {
    let path = payload
        .and_then(extract_path)
        .or_else(|| output.and_then(extract_path))
        .unwrap_or_default();
    if let Some(stats) = diff_stats_from_content(&update.content, &path) {
        return stats;
    }
    if let Some((additions, deletions)) = output.and_then(extract_diff_counts) {
        return AgentToolResult::DiffStats {
            path,
            additions,
            deletions,
        };
    }
    AgentToolResult::Text {
        text: value_text(output).unwrap_or_default(),
    }
}

fn other_tool(update: &ToolCallUpdate) -> AgentTool {
    let status = map_status(&update.status);
    let result = match &update.status {
        ToolCallStatus::Running => None,
        ToolCallStatus::Completed | ToolCallStatus::Failed => match update.raw_output.clone() {
            Some(value) => Some(AgentToolResult::Other { value }),
            None => Some(AgentToolResult::Empty),
        },
    };
    AgentTool {
        tool_call_id: update.tool_call_id.clone(),
        name: update.tool.clone(),
        title: nonempty_title(update).map(str::to_string),
        kind: AgentToolKind::Other,
        status,
        params: AgentToolParams::Other {
            value: update.raw_input.clone().unwrap_or_else(empty_object),
        },
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
    if labels
        .into_iter()
        .flatten()
        .any(|label| is_web_search_label(label))
        || payload.is_some_and(action_type_is_search)
    {
        return Some(AgentToolKind::WebSearch);
    }
    if labels
        .into_iter()
        .flatten()
        .any(|label| is_web_fetch_label(label))
        || payload.is_some_and(action_type_is_open_page)
    {
        return Some(AgentToolKind::Fetch);
    }
    if labels
        .into_iter()
        .flatten()
        .any(|label| is_workspace_search_label(label))
    {
        return Some(AgentToolKind::Search);
    }
    kind
}

fn looks_like_grok_edit(
    update: &ToolCallUpdate,
    payload: Option<&Value>,
    output: Option<&Value>,
) -> bool {
    if matches!(protocol_kind(update), Some(AcpKindHint::Edit)) {
        return true;
    }
    let input_ty = envelope_type(payload);
    let output_ty = envelope_type(output);
    let raw_output_ty = envelope_type(update.raw_output.as_ref());
    let labels = [
        Some(update.tool.as_str()),
        nonempty_title(update),
        input_ty.as_deref(),
        output_ty.as_deref(),
        raw_output_ty.as_deref(),
    ];
    if labels.into_iter().flatten().any(is_edit_label) {
        return true;
    }
    write_payload(payload) || write_payload(update.raw_input.as_ref()) || edits_applied(output)
}

fn is_edit_label(value: &str) -> bool {
    matches!(
        normalize(value).as_str(),
        "write"
            | "write_file"
            | "edit"
            | "searchreplace"
            | "search_replace"
            | "str_replace"
            | "strreplace"
    )
}

fn write_payload(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };
    extract_path(value).is_some()
        && first_string(value, &["content", "contents", "new_string"]).is_some()
}

fn edits_applied(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };
    value.get("EditsApplied").is_some()
        || value.get("edits_applied").is_some()
        || envelope_type(Some(value)).is_some_and(|ty| is_edit_label(&ty))
}

fn looks_like_grok_execute(
    update: &ToolCallUpdate,
    payload: Option<&Value>,
    output: Option<&Value>,
) -> bool {
    if acp_kind_hint(&update.tool) == Some(AcpKindHint::Execute) {
        return true;
    }
    if extract_command(payload.unwrap_or(&Value::Null)).is_some()
        && matches!(
            classify_tool(&update.tool, nonempty_title(update), payload),
            ClassifiedTool::Call(AgentToolKind::Execute | AgentToolKind::Other)
        )
    {
        return envelope_type(payload)
            .or_else(|| envelope_type(output))
            .is_some_and(|ty| {
                matches!(
                    ty.as_str(),
                    "execute" | "bash" | "shell" | "backgroundtaskstarted"
                )
            })
            || is_background_task_started(payload)
            || is_background_task_started(output)
            || extract_command(payload.unwrap_or(&Value::Null)).is_some();
    }
    envelope_type(payload)
        .or_else(|| envelope_type(output))
        .is_some_and(|ty| {
            matches!(
                ty.as_str(),
                "execute" | "bash" | "shell" | "backgroundtaskstarted"
            )
        })
        || is_background_task_started(payload)
        || is_background_task_started(output)
}

fn is_task_output(update: &ToolCallUpdate) -> bool {
    matches!(
        normalize(&update.tool).as_str(),
        "taskoutput" | "task_output"
    ) || envelope_type(update.raw_input.as_ref())
        .or_else(|| envelope_type(update.raw_output.as_ref()))
        .is_some_and(|ty| ty == "taskoutput" || ty == "task_output")
}

fn grok_task_status(output: Option<&Value>) -> Option<AgentToolStatus> {
    let status = first_string(output?, &["status"])
        .or_else(|| {
            output?
                .get("Result")
                .and_then(|value| first_string(value, &["status"]))
        })?
        .to_ascii_lowercase();
    Some(match status.as_str() {
        "completed" => AgentToolStatus::Completed,
        "failed" | "not_found" => AgentToolStatus::Failed,
        "running" => AgentToolStatus::Running,
        _ => return None,
    })
}

fn nonempty_title(update: &ToolCallUpdate) -> Option<&str> {
    Some(update.description.as_str()).filter(|value| !value.is_empty())
}

fn first_location(update: &ToolCallUpdate) -> Option<String> {
    update
        .locations
        .iter()
        .map(|path| path.trim())
        .find(|path| !path.is_empty())
        .map(str::to_string)
}

fn is_generic_kind_slug(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "other" | "tool" | "unknown"
    )
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

fn map_status(status: &ToolCallStatus) -> AgentToolStatus {
    match status {
        ToolCallStatus::Running => AgentToolStatus::Running,
        ToolCallStatus::Completed => AgentToolStatus::Completed,
        ToolCallStatus::Failed => AgentToolStatus::Failed,
    }
}

fn effective_payload(value: Option<&Value>) -> Option<&Value> {
    let value = value?;
    value
        .get("FileContent")
        .or_else(|| value.get("file_content"))
        .or_else(|| value.get("Result"))
        .or_else(|| value.get("EditsApplied"))
        .or_else(|| value.get("edits_applied"))
        .or_else(|| value.get("content").filter(|item| item.is_object()))
        .or(Some(value))
}

fn task_id_of(value: Option<&Value>) -> Option<String> {
    let value = value?;
    extract_task_id(value)
        .or_else(|| value.get("Result").and_then(extract_task_id))
        .or_else(|| value.get("FileContent").and_then(extract_task_id))
}

fn envelope_type(value: Option<&Value>) -> Option<String> {
    let value = value?;
    first_string(value, &["type", "variant"]).map(|text| text.to_ascii_lowercase())
}

fn is_background_task_started(value: Option<&Value>) -> bool {
    envelope_type(value).is_some_and(|ty| ty == "backgroundtaskstarted")
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
    extract_i64(value, &["exit_code", "exitCode", "status_code"])
        .map(|value| value as i32)
        .or_else(|| {
            value
                .get("Result")
                .and_then(|nested| extract_i64(nested, &["exit_code", "exitCode"]))
                .map(|value| value as i32)
        })
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
    first_string(value, &["output", "text", "content", "body", "raw_output"]).or_else(|| {
        value
            .get("Result")
            .and_then(|nested| first_string(nested, &["output", "text", "content"]))
    })
}

fn content_text(content: &[AgentToolCallContentItem]) -> Option<String> {
    let mut text = String::new();
    for item in content {
        if let AgentToolCallContentItem::Text { text: chunk } = item {
            text.push_str(chunk);
        }
    }
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

fn diff_stats_from_content(
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
            let old = old_content.as_deref().unwrap_or("");
            let (additions, deletions) = line_diff_counts(old, new_content);
            return Some(AgentToolResult::DiffStats {
                path: path.clone().unwrap_or_else(|| fallback_path.to_string()),
                additions,
                deletions,
            });
        }
    }
    None
}

fn line_diff_counts(old: &str, new: &str) -> (u32, u32) {
    let old_lines = old.lines().count() as u32;
    let new_lines = new.lines().count() as u32;
    if old.is_empty() {
        return (new_lines, 0);
    }
    if new.is_empty() {
        return (0, old_lines);
    }
    let additions = new_lines.saturating_sub(old_lines.min(new_lines));
    let deletions = old_lines.saturating_sub(new_lines.min(old_lines));
    let changed = old
        .lines()
        .zip(new.lines())
        .filter(|(left, right)| left != right)
        .count() as u32;
    (additions + changed, deletions + changed)
}

fn error_message(output: Option<&Value>, update: &ToolCallUpdate) -> Option<String> {
    value_text(output)
        .or_else(|| nonempty_title(update).map(str::to_string))
        .filter(|text| !text.is_empty())
}

fn strip_grok_poll_footer(text: &str) -> String {
    match text.find("Use timeout_ms to wait") {
        Some(index) => text[..index].trim_end().to_string(),
        None => text.to_string(),
    }
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
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
    use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, SearchHit};

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

    fn mapped(update: ToolCallUpdate) -> AgentTool {
        let mut grok_tasks = HashMap::new();
        match map_tool_call(&update, &mut grok_tasks) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        }
    }

    #[test]
    fn grok_write_envelope_from_session_update_fixture_is_edit() {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/tool_call_write.json")).expect("fixture");
        let update_json = &fixture["params"]["update"];
        let tool = mapped(ToolCallUpdate {
            tool_call_id: update_json["toolCallId"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: "Tool".into(),
            description: update_json["title"].as_str().unwrap_or("").into(),
            acp_kind: update_json["kind"].as_str().map(str::to_string),
            status: ToolCallStatus::Running,
            raw_input: Some(update_json["rawInput"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        });
        assert_eq!(tool.kind, AgentToolKind::Edit);
        match tool.params {
            AgentToolParams::Edit { path, .. } => {
                assert_eq!(path, "atmos-probe.txt");
            }
            other => panic!("expected edit params, got {other:?}"),
        }
    }

    fn live_write_frame(key: &str, status: ToolCallStatus) -> ToolCallUpdate {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/tool_call_write_live.json")).expect("live");
        let frame = &fixture[key];
        ToolCallUpdate {
            tool_call_id: frame["toolCallId"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: if frame["kind"].as_str() == Some("edit") {
                "Edit".into()
            } else {
                "Tool".into()
            },
            description: frame["title"].as_str().unwrap_or("").into(),
            acp_kind: frame["kind"].as_str().map(str::to_string),
            status,
            raw_input: frame.get("rawInput").cloned(),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: frame.get("rawOutput").cloned(),
            detail: None,
        }
    }

    fn assert_edit_path(tool: &AgentTool, expected: &str) {
        assert_eq!(tool.kind, AgentToolKind::Edit);
        match &tool.params {
            AgentToolParams::Edit { path } => assert_eq!(path, expected),
            other => panic!("expected edit params, got {other:?}"),
        }
    }

    #[test]
    fn grok_live_write_started_file_path_content_is_edit() {
        let tool = mapped(live_write_frame("started", ToolCallStatus::Running));
        assert_edit_path(&tool, "/tmp/atmos-grok-perm.txt");
    }

    #[test]
    fn grok_live_write_completed_search_replace_is_edit() {
        let tool = mapped(live_write_frame("completed", ToolCallStatus::Completed));
        assert_edit_path(&tool, "/tmp/atmos-grok-perm.txt");
    }

    #[test]
    fn grok_live_write_patch_stays_edit_with_path() {
        let started = live_write_frame("started", ToolCallStatus::Running);
        let updated = live_write_frame("updated", ToolCallStatus::Running);
        let completed = live_write_frame("completed", ToolCallStatus::Completed);
        let merged = merge_tool_call_patch(&started, updated);
        assert_edit_path(&mapped(merged.clone()), "/tmp/atmos-grok-perm.txt");
        let done = merge_tool_call_patch(&merged, completed);
        let tool = mapped(done.clone());
        assert_edit_path(&tool, "/tmp/atmos-grok-perm.txt");
        assert_eq!(tool.status, crate::contract::AgentToolStatus::Completed);
        assert_eq!(done.acp_kind.as_deref(), Some("edit"));
        assert_eq!(
            done.raw_input.as_ref().and_then(extract_path).as_deref(),
            Some("/tmp/atmos-grok-perm.txt")
        );
    }

    #[test]
    fn grok_execute_envelope_from_session_update_fixture_is_execute() {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/tool_call_execute.json")).expect("fixture");
        let update_json = &fixture["params"]["update"];
        let tool = mapped(ToolCallUpdate {
            tool_call_id: update_json["toolCallId"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: "Tool".into(),
            description: update_json["title"].as_str().unwrap_or("").into(),
            acp_kind: update_json["kind"].as_str().map(str::to_string),
            status: ToolCallStatus::Running,
            raw_input: Some(update_json["rawInput"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        });
        assert_eq!(tool.kind, AgentToolKind::Execute);
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
    fn grok_bash_envelope_is_execute() {
        let tool = mapped(update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({"type": "Bash", "command": "ls -la"}),
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
    fn grok_search_hits_from_grep_lines() {
        let tool = mapped(update(
            "Grep",
            ToolCallStatus::Completed,
            serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some(serde_json::json!(
                "crates/agent/src/lib.rs:12: pub struct AgentTool\ncrates/agent/src/tool.rs:40:"
            )),
        ));
        assert_eq!(tool.kind, AgentToolKind::Search);
        match tool.result {
            Some(AgentToolResult::SearchHits { query, hits }) => {
                assert_eq!(query, "AgentTool");
                assert_eq!(
                    hits,
                    vec![
                        SearchHit {
                            path: "crates/agent/src/lib.rs".into(),
                            line: Some(12),
                            snippet: Some(" pub struct AgentTool".into()),
                        },
                        SearchHit {
                            path: "crates/agent/src/tool.rs".into(),
                            line: Some(40),
                            snippet: None,
                        },
                    ]
                );
            }
            other => panic!("expected search_hits, got {other:?}"),
        }
    }

    #[test]
    fn grok_search_zero_hits_keeps_text() {
        let tool = mapped(update(
            "Grep",
            ToolCallStatus::Completed,
            serde_json::json!({"pattern": "none"}),
            Some(serde_json::json!("")),
        ));
        assert_eq!(tool.kind, AgentToolKind::Search);
        assert!(matches!(tool.result, Some(AgentToolResult::Text { .. })));
        assert!(!matches!(
            tool.result,
            Some(AgentToolResult::SearchHits { .. })
        ));
    }

    #[test]
    fn grok_web_search_is_not_workspace_hits() {
        let tool = mapped(update(
            "web_search",
            ToolCallStatus::Completed,
            serde_json::json!({"query": "atmos acp"}),
            Some(serde_json::json!({
                "links": [{ "url": "https://example.com", "title": "Example" }],
                "text": "src/lib.rs:1:should not become a workspace hit"
            })),
        ));
        assert_eq!(tool.kind, AgentToolKind::WebSearch);
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::WebSearch { .. })
        ));
    }

    #[test]
    fn grok_background_execute_and_taskoutput_replace() {
        let mut grok_tasks = HashMap::new();
        let started = update(
            "Tool",
            ToolCallStatus::Running,
            serde_json::json!({"type": "Bash", "command": "count", "is_background": true}),
            Some(serde_json::json!({
                "type": "backgroundtaskstarted",
                "Result": { "task_id": "t1", "status": "running" }
            })),
        );
        let ToolMapOut::Tool(tool) = map_tool_call(&started, &mut grok_tasks) else {
            panic!("expected execute tool");
        };
        assert_eq!(tool.kind, AgentToolKind::Execute);
        match &tool.params {
            AgentToolParams::Execute {
                background: true,
                task_id: Some(task_id),
                command,
                ..
            } => {
                assert_eq!(command, "count");
                assert_eq!(task_id, "t1");
            }
            other => panic!("expected background execute, got {other:?}"),
        }

        let fixture: Value = serde_json::from_str(include_str!("testdata/grok_background.json"))
            .expect("grok_background fixture");
        let poll = ToolCallUpdate {
            tool_call_id: fixture["taskoutput"]["tool_call_id"]
                .as_str()
                .unwrap()
                .into(),
            parent_tool_call_id: None,
            tool: fixture["taskoutput"]["name"].as_str().unwrap().into(),
            description: String::new(),
            acp_kind: None,
            status: ToolCallStatus::Completed,
            raw_input: Some(fixture["taskoutput"]["raw_input"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: Some(fixture["taskoutput"]["raw_output"].clone()),
            detail: None,
        };
        let ToolMapOut::Replace { tool_call_id, tool } = map_tool_call(&poll, &mut grok_tasks)
        else {
            panic!("expected replace");
        };
        assert_eq!(tool_call_id, "tc_1");
        match tool.result {
            Some(AgentToolResult::Execute { output, .. }) => {
                assert_eq!(output, "hello");
                assert!(!output.contains("timeout_ms"));
            }
            other => panic!("expected execute result, got {other:?}"),
        }
    }
}
