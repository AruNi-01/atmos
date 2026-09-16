//! Grok `/goal` and workflow (`/deep-research`) chrome.
//!
//! These are Grok-only session surfaces, not a shared orchestrator. Goal and
//! workflow stay independent so clearing one cannot wipe the other.

use serde_json::Value;

use crate::contract::{
    AgentEvent, AgentTool, AgentToolKind, AgentToolParams, AgentToolStatus, GrokGoal,
    GrokGoalChild, GrokWorkflow, GrokWorkflowAgent, GrokWorkflowPhase, GROK_CHROME_SUBAGENT_NAME,
};
use crate::map::extract::first_string;
use crate::map::subagent::{
    apply_xai_subagent_notice, is_xai_session_notification_method, parse_xai_subagent_notification,
    XaiSubagentNotice,
};

pub fn parse_grok_goal_updated(method: &str, params: &Value) -> Option<GrokGoal> {
    let update = session_update(method, params)?;
    if session_tag(update) != "goal_updated" {
        return None;
    }
    let status = first_string(update, &["status"]).unwrap_or_else(|| "active".into());
    let goal_id = chrome_id(update, &["goal_id"], &status)?;
    Some(GrokGoal {
        goal_id,
        objective: first_string(update, &["objective"]).unwrap_or_default(),
        status,
        phase: first_string(update, &["phase"]).unwrap_or_else(|| "idle".into()),
        planning: bool_flag(update, "planning"),
        verifying_completion: bool_flag(update, "verifying_completion"),
        last_event: first_string(update, &["last_event"]),
        children: Vec::new(),
    })
}

pub fn parse_grok_workflow_updated(method: &str, params: &Value) -> Option<GrokWorkflow> {
    let update = session_update(method, params)?;
    if session_tag(update) != "workflow_updated" {
        return None;
    }
    let status = first_string(update, &["status"]).unwrap_or_else(|| "running".into());
    let run_id = chrome_id(update, &["run_id"], &status)?;
    let name = first_string(update, &["name"]).unwrap_or_default();
    let objective = first_string(update, &["objective"])
        .or_else(|| (!name.is_empty()).then(|| name.clone()))
        .unwrap_or_default();
    let phases: Vec<GrokWorkflowPhase> = update
        .get("phases")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let title = first_string(item, &["title"])?;
                    Some(GrokWorkflowPhase {
                        id: phase_id_from_title(&title),
                        state: first_string(item, &["state"]).unwrap_or_else(|| "pending".into()),
                        title,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let agents: Vec<GrokWorkflowAgent> = update
        .get("agents")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = first_string(item, &["agent_id"])?;
                    let label = first_string(item, &["label"]).unwrap_or_else(|| id.clone());
                    let phase_title = first_string(item, &["phase"]);
                    let phase_id = phase_title
                        .as_deref()
                        .map(phase_id_from_title)
                        .or_else(|| {
                            phases.iter().find_map(|phase| {
                                (phase.title.eq_ignore_ascii_case(&label)
                                    || label
                                        .to_ascii_lowercase()
                                        .contains(&phase.id.to_ascii_lowercase()))
                                .then(|| phase.id.clone())
                            })
                        })
                        .unwrap_or_else(|| {
                            phases
                                .first()
                                .map(|phase| phase.id.clone())
                                .unwrap_or_else(|| "plan".into())
                        });
                    Some(GrokWorkflowAgent {
                        id,
                        label,
                        phase_id,
                        agent_type: first_string(item, &["agent_type"]),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(GrokWorkflow {
        run_id,
        name,
        objective,
        status,
        phases,
        agents,
    })
}

pub fn merge_grok_goal(existing: Option<GrokGoal>, incoming: GrokGoal) -> Option<GrokGoal> {
    if incoming.status.eq_ignore_ascii_case("cleared") {
        return None;
    }
    let Some(previous) = existing.filter(|previous| previous.goal_id == incoming.goal_id) else {
        return Some(incoming);
    };
    let mut next = incoming;
    if next.children.is_empty() {
        next.children = previous.children;
    } else {
        for child in previous.children {
            if !next.children.iter().any(|existing| existing.id == child.id) {
                next.children.push(child);
            }
        }
    }
    Some(next)
}

pub fn merge_grok_workflow(
    existing: Option<GrokWorkflow>,
    incoming: GrokWorkflow,
) -> Option<GrokWorkflow> {
    if incoming.status.eq_ignore_ascii_case("cleared") {
        return None;
    }
    let Some(previous) = existing.filter(|previous| previous.run_id == incoming.run_id) else {
        return Some(incoming);
    };
    let mut next = incoming;
    if next.agents.is_empty() {
        next.agents = previous.agents;
    } else {
        for agent in previous.agents {
            if !next.agents.iter().any(|existing| existing.id == agent.id) {
                next.agents.push(agent);
            }
        }
    }
    if next.phases.is_empty() {
        next.phases = previous.phases;
    }
    Some(next)
}

pub fn attach_grok_goal_child(goal: &mut GrokGoal, tool: &AgentTool) -> bool {
    if tool.kind != AgentToolKind::Subagent {
        return false;
    }
    if goal
        .children
        .iter()
        .any(|child| child.id == tool.tool_call_id)
    {
        return false;
    }
    let label = chrome_label(tool);
    goal.children.push(GrokGoalChild {
        id: tool.tool_call_id.clone(),
        role: goal_role_from_label(&label),
        agent_type: match &tool.params {
            AgentToolParams::Subagent { agent_type, .. } => agent_type.clone(),
            _ => None,
        },
        label,
    });
    true
}

pub fn attach_grok_workflow_agent(workflow: &mut GrokWorkflow, tool: &AgentTool) -> bool {
    if tool.kind != AgentToolKind::Subagent {
        return false;
    }
    if workflow
        .agents
        .iter()
        .any(|agent| agent.id == tool.tool_call_id)
    {
        return false;
    }
    let label = chrome_label(tool);
    let phase_id = workflow_phase_for_label(workflow, &label).to_string();
    if !workflow.phases.iter().any(|phase| phase.id == phase_id) {
        workflow.phases.push(GrokWorkflowPhase {
            title: title_case(&phase_id),
            id: phase_id.clone(),
            state: "running".into(),
        });
    }
    workflow.agents.push(GrokWorkflowAgent {
        id: tool.tool_call_id.clone(),
        label,
        phase_id,
        agent_type: match &tool.params {
            AgentToolParams::Subagent { agent_type, .. } => agent_type.clone(),
            _ => None,
        },
    });
    true
}

pub fn is_grok_chrome_tool(tool: &AgentTool) -> bool {
    tool.kind == AgentToolKind::Subagent && tool.name == GROK_CHROME_SUBAGENT_NAME
}

pub fn looks_like_grok_goal_child(tool: &AgentTool) -> bool {
    if tool.kind != AgentToolKind::Subagent {
        return false;
    }
    let label = chrome_label(tool).to_ascii_lowercase();
    label.contains("plan writer")
        || (label.contains("plan") && label.contains("writer"))
        || label.contains("skeptic")
        || label.contains("verifier")
        || label.contains("summar")
}

fn adopt_goal_children(goal: &mut GrokGoal, tools: &std::collections::HashMap<String, AgentTool>) {
    let mut seen = std::collections::HashSet::new();
    for tool in tools.values() {
        if !seen.insert(tool.tool_call_id.clone()) {
            continue;
        }
        if is_grok_chrome_tool(tool) || looks_like_grok_goal_child(tool) {
            attach_grok_goal_child(goal, tool);
        }
    }
}

fn adopt_workflow_agents(
    workflow: &mut GrokWorkflow,
    tools: &std::collections::HashMap<String, AgentTool>,
) {
    let mut seen = std::collections::HashSet::new();
    for tool in tools.values() {
        if !seen.insert(tool.tool_call_id.clone()) {
            continue;
        }
        if is_grok_chrome_tool(tool) {
            attach_grok_workflow_agent(workflow, tool);
        }
    }
}

pub fn map_xai_ext_events(
    tools: &mut std::collections::HashMap<String, AgentTool>,
    grok_goal: &mut Option<GrokGoal>,
    grok_workflow: &mut Option<GrokWorkflow>,
    method: &str,
    params: &Value,
) -> Vec<AgentEvent> {
    if let Some(incoming) = parse_grok_goal_updated(method, params) {
        *grok_goal = merge_grok_goal(grok_goal.take(), incoming);
        if let Some(current) = grok_goal.as_mut() {
            adopt_goal_children(current, tools);
        }
        return vec![AgentEvent::GrokGoalUpdated {
            goal: grok_goal.clone(),
        }];
    }
    if let Some(incoming) = parse_grok_workflow_updated(method, params) {
        *grok_workflow = merge_grok_workflow(grok_workflow.take(), incoming);
        if let Some(current) = grok_workflow.as_mut() {
            adopt_workflow_agents(current, tools);
        }
        return vec![AgentEvent::GrokWorkflowUpdated {
            workflow: grok_workflow.clone(),
        }];
    }
    let Some(notice) = parse_xai_subagent_notification(method, params) else {
        return Vec::new();
    };
    let Some(mut tool) = apply_xai_subagent_notice(tools, &notice) else {
        return Vec::new();
    };
    let mut snapshot_event = None;
    let route_goal = looks_like_grok_goal_child(&tool) || grok_workflow.is_none();
    if route_goal {
        if let Some(current) = grok_goal.as_mut() {
            let changed = attach_grok_goal_child(current, &tool);
            if changed
                || current
                    .children
                    .iter()
                    .any(|child| child.id == tool.tool_call_id)
            {
                stamp_grok_chrome_name(&mut tool, tools);
                if changed {
                    snapshot_event = Some(AgentEvent::GrokGoalUpdated {
                        goal: grok_goal.clone(),
                    });
                }
            }
        }
    } else if let Some(current) = grok_workflow.as_mut() {
        let changed = attach_grok_workflow_agent(current, &tool);
        if changed
            || current
                .agents
                .iter()
                .any(|agent| agent.id == tool.tool_call_id)
        {
            stamp_grok_chrome_name(&mut tool, tools);
            if changed {
                snapshot_event = Some(AgentEvent::GrokWorkflowUpdated {
                    workflow: grok_workflow.clone(),
                });
            }
        }
    }
    let mut events = vec![tool_event_for_notice(&notice, tool)];
    if let Some(event) = snapshot_event {
        events.push(event);
    }
    events
}

fn stamp_grok_chrome_name(
    tool: &mut AgentTool,
    tools: &mut std::collections::HashMap<String, AgentTool>,
) {
    if tool.name == GROK_CHROME_SUBAGENT_NAME {
        return;
    }
    tool.name = GROK_CHROME_SUBAGENT_NAME.into();
    crate::map::subagent::store_subagent_tool(tools, tool);
    tools.insert(tool.tool_call_id.clone(), tool.clone());
}

fn tool_event_for_notice(notice: &XaiSubagentNotice, tool: AgentTool) -> AgentEvent {
    match notice {
        XaiSubagentNotice::Finished {
            status: AgentToolStatus::Failed,
            ..
        } => AgentEvent::ToolCallFailed {
            tool_call: tool,
            error: None,
        },
        XaiSubagentNotice::Finished {
            status: AgentToolStatus::Completed,
            ..
        } => AgentEvent::ToolCallCompleted { tool_call: tool },
        _ => AgentEvent::ToolCallStarted { tool_call: tool },
    }
}

fn session_update<'a>(method: &str, params: &'a Value) -> Option<&'a Value> {
    if !is_xai_session_notification_method(method) {
        return None;
    }
    Some(params.get("update").unwrap_or(params))
}

fn session_tag(update: &Value) -> &str {
    update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("")
}

fn bool_flag(update: &Value, key: &str) -> bool {
    match update.get(key) {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => value.eq_ignore_ascii_case("true"),
        _ => false,
    }
}

fn chrome_id(update: &Value, keys: &[&str], status: &str) -> Option<String> {
    let id = first_string(update, keys).unwrap_or_default();
    if id.is_empty() && !status.eq_ignore_ascii_case("cleared") {
        None
    } else {
        Some(id)
    }
}

fn chrome_label(tool: &AgentTool) -> String {
    match &tool.params {
        AgentToolParams::Subagent { description, .. } if !description.is_empty() => {
            description.clone()
        }
        _ => tool
            .title
            .clone()
            .filter(|title| !title.is_empty())
            .unwrap_or_else(|| tool.tool_call_id.clone()),
    }
}

fn goal_role_from_label(label: &str) -> String {
    let lower = label.to_ascii_lowercase();
    if lower.contains("plan writer") || (lower.contains("plan") && lower.contains("writer")) {
        "planning".into()
    } else if lower.contains("skeptic") || lower.contains("verifier") {
        "verifying".into()
    } else if lower.contains("summar") {
        "summarizing".into()
    } else {
        "planning".into()
    }
}

pub fn phase_id_from_title(title: &str) -> String {
    let mut out = String::new();
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('_') && !out.is_empty() {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "phase".into()
    } else {
        trimmed
    }
}

fn workflow_phase_for_label<'a>(workflow: &'a GrokWorkflow, label: &str) -> &'a str {
    let lower = label.to_ascii_lowercase();
    if let Some(phase) = workflow.phases.iter().find(|phase| {
        lower.contains(&phase.id) || lower.contains(&phase.title.to_ascii_lowercase())
    }) {
        return phase.id.as_str();
    }
    workflow
        .phases
        .iter()
        .find(|phase| phase.state == "running" || phase.state == "active")
        .or_else(|| workflow.phases.first())
        .map(|phase| phase.id.as_str())
        .unwrap_or("plan")
}

fn title_case(id: &str) -> String {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => id.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn goal_tool(id: &str, label: &str) -> AgentTool {
        AgentTool {
            tool_call_id: id.into(),
            parent_tool_call_id: None,
            name: GROK_CHROME_SUBAGENT_NAME.into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: AgentToolStatus::Running,
            params: AgentToolParams::Subagent {
                description: label.into(),
                agent_type: Some("general-purpose".into()),
                task_id: Some(id.into()),
                prompt: None,
            },
            result: None,
        }
    }

    fn active_goal() -> GrokGoal {
        GrokGoal {
            goal_id: "g1".into(),
            objective: "Explore".into(),
            status: "active".into(),
            phase: "executing".into(),
            planning: true,
            verifying_completion: false,
            last_event: Some("goal_created".into()),
            children: Vec::new(),
        }
    }

    fn running_workflow() -> GrokWorkflow {
        GrokWorkflow {
            run_id: "wf-1".into(),
            name: "deep-research".into(),
            objective: "Compare".into(),
            status: "running".into(),
            phases: Vec::new(),
            agents: Vec::new(),
        }
    }

    #[test]
    fn live_goal_planning_fixture_parses() {
        let value: Value =
            serde_json::from_str(include_str!("testdata/goal_updated_planning.json")).unwrap();
        let goal = parse_grok_goal_updated("_x.ai/session/update", &value).expect("goal");
        assert_eq!(goal.goal_id, "776113a2-c79c-467e-892a-aeec5aeb6161");
        assert_eq!(goal.status, "active");
        assert!(goal.planning);
        assert!(!goal.verifying_completion);
    }

    #[test]
    fn workflow_deep_research_fixture_keeps_phase_roster() {
        let value: Value =
            serde_json::from_str(include_str!("testdata/workflow_updated_deep_research.json"))
                .unwrap();
        let workflow =
            parse_grok_workflow_updated("x.ai/session_notification", &value).expect("wf");
        assert_eq!(workflow.run_id, "wf-1");
        assert_eq!(
            workflow
                .phases
                .iter()
                .map(|phase| phase.title.as_str())
                .collect::<Vec<_>>(),
            ["Plan", "Research", "Verify", "Report"]
        );
        assert_eq!(
            workflow
                .agents
                .iter()
                .map(|agent| (agent.id.as_str(), agent.phase_id.as_str()))
                .collect::<Vec<_>>(),
            [
                ("ag-plan", "plan"),
                ("ag-r1", "research"),
                ("ag-r2", "research")
            ]
        );
    }

    #[test]
    fn cleared_goal_drops_snapshot() {
        let cleared = GrokGoal {
            status: "cleared".into(),
            ..active_goal()
        };
        assert!(merge_grok_goal(Some(active_goal()), cleared).is_none());
    }

    #[test]
    fn cleared_goal_does_not_drop_workflow() {
        let params: Value =
            serde_json::from_str(include_str!("testdata/goal_updated_cleared.json")).unwrap();
        let mut tools = std::collections::HashMap::new();
        let mut goal = Some(active_goal());
        let mut workflow = Some(running_workflow());
        map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "_x.ai/session/update",
            &params,
        );
        assert!(goal.is_none());
        assert!(workflow.is_some());
    }

    #[test]
    fn acp_named_goal_child_is_stamped_grok_chrome() {
        let mut tools = std::collections::HashMap::new();
        let acp = AgentTool {
            tool_call_id: "01a0aa73-2fd5-7dd3-82d6-32cd809cc95a".into(),
            parent_tool_call_id: None,
            name: "spawn_subagent".into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: AgentToolStatus::Running,
            params: AgentToolParams::Subagent {
                description: "goal achievement skeptic".into(),
                agent_type: Some("general-purpose".into()),
                task_id: None,
                prompt: None,
            },
            result: None,
        };
        tools.insert(acp.tool_call_id.clone(), acp);
        let mut goal = Some(active_goal());
        let mut workflow = None;
        let spawned: Value =
            serde_json::from_str(include_str!("testdata/subagent_spawned_skeptic_a.json")).unwrap();
        let events = map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "_x.ai/session/update",
            &spawned,
        );
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected started, got {events:?}");
        };
        assert_eq!(tool_call.name, GROK_CHROME_SUBAGENT_NAME);
        assert_eq!(
            goal.as_ref()
                .unwrap()
                .children
                .iter()
                .map(|child| child.id.as_str())
                .collect::<Vec<_>>(),
            ["01a0aa73-2fd5-7dd3-82d6-32cd809cc95a"]
        );
    }

    #[test]
    fn attach_does_not_reuse_description() {
        let mut goal = parse_grok_goal_updated(
            "_x.ai/session/update",
            &json!({
                "update": {
                    "sessionUpdate": "goal_updated",
                    "goal_id": "g1",
                    "objective": "obj",
                    "status": "active",
                    "planning": true
                }
            }),
        )
        .unwrap();
        let a = goal_tool("sa-a", "goal achievement skeptic");
        let b = AgentTool {
            tool_call_id: "sa-b".into(),
            ..a.clone()
        };
        assert!(attach_grok_goal_child(&mut goal, &a));
        assert!(attach_grok_goal_child(&mut goal, &b));
        assert_eq!(
            goal.children
                .iter()
                .map(|child| child.id.as_str())
                .collect::<Vec<_>>(),
            ["sa-a", "sa-b"]
        );
        assert!(goal.children.iter().all(|child| child.role == "verifying"));
    }

    #[test]
    fn grok_build_goal_cleared_empty_id_emits_goal_updated() {
        let params: Value =
            serde_json::from_str(include_str!("testdata/goal_updated_cleared.json")).unwrap();
        let parsed =
            parse_grok_goal_updated("_x.ai/session/update", &params).expect("cleared parses");
        assert_eq!(parsed.status, "cleared");
        assert!(parsed.goal_id.is_empty());

        let mut tools = std::collections::HashMap::new();
        let mut goal = Some(active_goal());
        let mut workflow = None;
        let events = map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "_x.ai/session/update",
            &params,
        );
        assert!(goal.is_none(), "cleared must drop the live goal");
        match events.as_slice() {
            [AgentEvent::GrokGoalUpdated { goal: None }] => {}
            other => panic!("expected GrokGoalUpdated None, got {other:?}"),
        }

        let live = map_xai_ext_events(
            &mut tools,
            &mut Some(active_goal()),
            &mut None,
            "x.ai/session_notification",
            &params,
        );
        assert!(matches!(
            live.as_slice(),
            [AgentEvent::GrokGoalUpdated { goal: None }]
        ));
    }

    #[test]
    fn empty_goal_id_without_cleared_is_skipped() {
        let params = json!({
            "update": {
                "sessionUpdate": "goal_updated",
                "goal_id": "",
                "objective": "",
                "status": "active",
                "phase": "executing"
            }
        });
        assert!(parse_grok_goal_updated("_x.ai/session/update", &params).is_none());
        let mut tools = std::collections::HashMap::new();
        let mut goal = None;
        let mut workflow = None;
        assert!(map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "_x.ai/session/update",
            &params
        )
        .is_empty());
    }

    #[test]
    fn workflow_cleared_emits_workflow_updated() {
        let params: Value =
            serde_json::from_str(include_str!("testdata/workflow_updated_cleared.json")).unwrap();
        let mut tools = std::collections::HashMap::new();
        let mut goal = Some(active_goal());
        let mut workflow = Some(running_workflow());
        let events = map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "x.ai/session_notification",
            &params,
        );
        assert!(workflow.is_none(), "cleared must drop the live workflow");
        assert!(goal.is_some(), "workflow clear must not wipe the goal");
        match events.as_slice() {
            [AgentEvent::GrokWorkflowUpdated { workflow: None }] => {}
            other => panic!("expected GrokWorkflowUpdated None, got {other:?}"),
        }
    }

    #[test]
    fn workflow_cleared_empty_run_id_still_emits() {
        let params = json!({
            "update": {
                "sessionUpdate": "workflow_updated",
                "run_id": "",
                "name": "deep-research",
                "status": "cleared"
            }
        });
        assert!(parse_grok_workflow_updated("x.ai/session_notification", &params).is_some());
        let mut tools = std::collections::HashMap::new();
        let mut goal = None;
        let mut workflow = Some(running_workflow());
        let events = map_xai_ext_events(
            &mut tools,
            &mut goal,
            &mut workflow,
            "x.ai/session_notification",
            &params,
        );
        assert!(workflow.is_none());
        assert!(matches!(
            events.as_slice(),
            [AgentEvent::GrokWorkflowUpdated { workflow: None }]
        ));
    }
}
