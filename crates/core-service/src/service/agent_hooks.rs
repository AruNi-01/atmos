//! Terminal Agent hook adapter.
//!
//! Vendor JSON is mapped to Atmos `AgentEvent` before Observer activity fold
//! (same contract as Agent Chat). Occupancy adapters stay per-vendor because
//! they encode terminal-idle suppress and child-lifecycle policy.
//! Install/uninstall of hook scripts lives in `core-engine::agent_hooks`.

mod ampcode;
mod antigravity;
mod child_agent;
mod claude_code;
mod codex;
mod cursor;
mod factory_droid;
mod gemini;
mod grok_build;
mod hermes;
mod kiro;
mod opencode;
mod pi;
mod to_event;

use std::sync::Arc;

use serde_json::Value;

use agent::AgentEvent;

use super::agent_status::{
    AgentStatusContext, AgentStatusService, AgentSurface, AgentToolType, HookPermissionOpen,
};

pub(crate) use child_agent::{
    extract_child_agent_id, is_child_start_event, is_child_stop_event, nested_subagent_session_id,
};
use to_event::{
    codex_defers_permission, hook_event_key, hook_payload_is_permission,
    hook_payload_to_events_for, hook_permission_request_id, hook_tool_input,
    permission_request_from_hook,
};

enum HookDecisionGate {
    Ignore,
    Release,
    Hold,
}

fn hook_decision_gate(tool: AgentToolType, payload: &Value) -> HookDecisionGate {
    let event = hook_event_key(payload);
    if tool == AgentToolType::Codex
        && hook_payload_is_permission(payload)
        && codex_defers_permission(payload)
    {
        return HookDecisionGate::Release;
    }
    if hook_payload_is_permission(payload) {
        return HookDecisionGate::Hold;
    }
    let tool_gate = matches!(tool, AgentToolType::Gemini | AgentToolType::Antigravity)
        && matches!(event.as_str(), "pretooluse" | "beforetool");
    if tool_gate {
        HookDecisionGate::Hold
    } else {
        HookDecisionGate::Ignore
    }
}

/// HTTP ingest context from Atmos tmux headers, mapped onto Status location.
pub type AtmosContext = AgentStatusContext;

pub struct AgentHooksService {
    status: Arc<AgentStatusService>,
}

impl AgentHooksService {
    pub fn new(status: Arc<AgentStatusService>) -> Self {
        Self { status }
    }

    pub fn status(&self) -> &AgentStatusService {
        &self.status
    }

    fn observe(&self, payload: &Value, tool: AgentToolType, ctx: &AgentStatusContext) {
        let session_id = resolve_session_id(payload, tool, ctx);
        let gate = hook_decision_gate(tool, payload);
        for event in hook_payload_to_events_for(Some(tool), payload) {
            let permission = match &event {
                AgentEvent::PermissionRequested { request }
                    if ctx.surface != AgentSurface::Chat
                        && matches!(gate, HookDecisionGate::Hold) =>
                {
                    Some((request.request_id.clone(), hook_tool_input(payload)))
                }
                _ => None,
            };
            self.status.observe_host(&session_id, tool, &event, ctx);
            if let Some((request_id, tool_input)) = permission {
                self.status
                    .stash_hook_permission(&session_id, &request_id, tool_input);
            }
        }
        if ctx.surface != AgentSurface::Chat && matches!(gate, HookDecisionGate::Release) {
            self.status.clear_activity_permission(&session_id);
        }
        if ctx.surface != AgentSurface::Chat
            && matches!(gate, HookDecisionGate::Hold)
            && !hook_payload_is_permission(payload)
        {
            let request = permission_request_from_hook(payload);
            self.status.present_hook_permission(&session_id, &request);
            self.status.stash_hook_permission(
                &session_id,
                &request.request_id,
                hook_tool_input(payload),
            );
        }
        if let Some(native) = lead_native_session_id(payload) {
            self.status.note_native_session(
                &session_id,
                native,
                super::agent_status::host_session_provider(tool),
            );
        }
    }

    /// Arm a blocking reply for a permission hook. Call after `handle_*_event`.
    pub fn open_permission_wait(
        &self,
        payload: &Value,
        tool: AgentToolType,
        ctx: &AgentStatusContext,
    ) -> Option<HookPermissionOpen> {
        if ctx.surface == AgentSurface::Chat {
            return None;
        }
        match hook_decision_gate(tool, payload) {
            HookDecisionGate::Ignore => None,
            HookDecisionGate::Release => Some(HookPermissionOpen::Immediate(serde_json::json!({}))),
            HookDecisionGate::Hold => {
                let request_id = hook_permission_request_id(payload);
                self.status
                    .open_permission_wait(&request_id)
                    .map(HookPermissionOpen::Wait)
            }
        }
    }

    pub fn handle_claude_code_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        claude_code::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::ClaudeCode, ctx);
    }

    pub fn handle_codex_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        codex::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Codex, ctx);
    }

    pub fn handle_cursor_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        cursor::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Cursor, ctx);
    }

    pub fn handle_gemini_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        gemini::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Gemini, ctx);
    }

    pub fn handle_antigravity_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        let payload = antigravity::with_inferred_event_name(payload);
        antigravity::handle_event(&self.status, &payload, ctx);
        self.observe(&payload, AgentToolType::Antigravity, ctx);
    }

    pub fn handle_factory_droid_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        factory_droid::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::FactoryDroid, ctx);
    }

    pub fn handle_kiro_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        kiro::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Kiro, ctx);
    }

    pub fn handle_opencode_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        opencode::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Opencode, ctx);
    }

    pub fn handle_ampcode_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        ampcode::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Ampcode, ctx);
    }

    pub fn handle_pi_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        pi::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Pi, ctx);
    }

    pub fn handle_hermes_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        hermes::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::Hermes, ctx);
    }

    pub fn handle_grok_build_event(&self, payload: &Value, ctx: &AgentStatusContext) {
        grok_build::handle_event(&self.status, payload, ctx);
        self.observe(payload, AgentToolType::GrokBuild, ctx);
    }
}

/// Prefer Atmos pane_id (stable, per-terminal-pane) > payload session_id > fallback.
pub(crate) fn resolve_session_id(
    payload: &Value,
    tool: AgentToolType,
    ctx: &AgentStatusContext,
) -> String {
    if let Some(ref pane_id) = ctx.pane_id {
        return pane_id.clone();
    }
    extract_session_id(payload)
        .map(String::from)
        .unwrap_or_else(|| {
            let cwd = extract_cwd(payload).unwrap_or("unknown");
            format!("{tool}:{cwd}")
        })
}

pub(crate) fn extract_cwd(payload: &Value) -> Option<&str> {
    payload
        .get("cwd")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("project_path").and_then(|v| v.as_str()))
        .or_else(|| payload.get("workspaceRoot").and_then(|v| v.as_str()))
        .or_else(|| payload.get("workspace_root").and_then(|v| v.as_str()))
        .or_else(|| {
            payload
                .get("workspace_roots")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
        })
}

/// Lead-session GUID. A Grok child event puts the child session on `sessionId`
/// together with `subagentType`, and an explicit child id that equals the
/// session id is that child, not the lead.
fn lead_native_session_id(payload: &Value) -> Option<&str> {
    let sid = extract_session_id(payload)?.trim();
    if sid.is_empty() {
        return None;
    }
    if nested_subagent_session_id(payload).is_some() {
        return None;
    }
    if extract_child_agent_id(payload).is_some_and(|child| child == sid) {
        return None;
    }
    Some(sid)
}

fn extract_session_id(payload: &Value) -> Option<&str> {
    payload
        .get("session_id")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("sessionId").and_then(|v| v.as_str()))
        .or_else(|| payload.get("chat_id").and_then(|v| v.as_str()))
}

pub fn terminal_hook_context(mut ctx: AgentStatusContext) -> AgentStatusContext {
    ctx.surface = AgentSurface::Terminal;
    if ctx.surface_id.is_none() {
        ctx.surface_id = ctx.pane_id.clone();
    }
    ctx
}

#[cfg(test)]
mod observer_align_tests {
    use super::{terminal_hook_context, AgentHooksService};
    use crate::service::agent_status::{AgentOccupancy, AgentStatusContext, AgentStatusService};
    use serde_json::{json, Value};
    use std::sync::Arc;

    const PATCH: &str = "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";

    struct Spec {
        label: &'static str,
        handle: fn(&AgentHooksService, &Value, &AgentStatusContext),
        prompt_event: &'static str,
        tool_pre: &'static str,
        tool_post: &'static str,
        tool_name: &'static str,
        edit_pre: &'static str,
        edit_post: &'static str,
        as_type: bool,
    }

    fn event(name: &str, as_type: bool, body: Value) -> Value {
        let mut value = body;
        if as_type {
            value["type"] = json!(name);
        } else {
            value["hook_event_name"] = json!(name);
        }
        value
    }

    fn observe(spec: &Spec) {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = terminal_hook_context(AgentStatusContext {
            pane_id: Some(format!("ws-1:{}", spec.label)),
            context_id: Some("ws-1".into()),
            ..AgentStatusContext::default()
        });
        let send = |payload: Value| (spec.handle)(&service, &payload, &ctx);

        send(event(
            spec.prompt_event,
            spec.as_type,
            json!({ "prompt": format!("prompt {}", spec.label) }),
        ));
        let activity = status.get_all_activity();
        assert_eq!(
            activity[0].turns[0].prompt,
            format!("prompt {}", spec.label),
            "{} prompt missing",
            spec.label
        );

        send(event(
            spec.tool_pre,
            spec.as_type,
            json!({
                "tool_name": spec.tool_name,
                "tool_use_id": "tool-1",
                "tool_input": { "command": "ls" },
            }),
        ));
        send(event(
            spec.tool_post,
            spec.as_type,
            json!({
                "tool_name": spec.tool_name,
                "tool_use_id": "tool-1",
                "tool_input": { "command": "ls" },
                "tool_response": "observer-out",
            }),
        ));
        {
            let activity = &status.get_all_activity()[0];
            let tool = activity
                .turns
                .iter()
                .flat_map(|turn| turn.tools.iter())
                .find(|tool| tool.name == spec.tool_name)
                .unwrap_or_else(|| panic!("{} tool {} missing", spec.label, spec.tool_name));
            assert_eq!(tool.kind.as_deref(), Some("execute"), "{}", spec.label);
            assert_eq!(
                tool.output.as_deref(),
                Some("observer-out"),
                "{}",
                spec.label
            );
            assert_ne!(tool.kind.as_deref(), Some("other"), "{}", spec.label);
        }

        send(event(
            spec.edit_pre,
            spec.as_type,
            json!({
                "tool_name": "Edit",
                "tool_use_id": "edit-1",
                "tool_input": { "file_path": "src/b.ts" },
            }),
        ));
        send(event(
            spec.edit_post,
            spec.as_type,
            json!({
                "tool_name": "Edit",
                "tool_use_id": "edit-1",
                "tool_input": { "file_path": "src/b.ts" },
                "diff": PATCH,
            }),
        ));
        {
            let activity = &status.get_all_activity()[0];
            let edit = activity
                .turns
                .iter()
                .flat_map(|turn| turn.tools.iter())
                .find(|tool| tool.name == "Edit")
                .unwrap_or_else(|| panic!("{} edit missing", spec.label));
            assert_eq!(edit.kind.as_deref(), Some("edit"), "{}", spec.label);
            assert_eq!(edit.diff.as_deref(), Some(PATCH), "{}", spec.label);
            assert_ne!(edit.kind.as_deref(), Some("other"), "{}", spec.label);
        }

        send(event(
            "SubagentStart",
            false,
            json!({
                "subagent_id": "child-1",
                "subagent_type": "Explore",
                "description": "scan files",
            }),
        ));
        {
            let child = status.get_all_activity()[0]
                .children
                .iter()
                .find(|child| child.child_id == "child-1")
                .cloned()
                .unwrap_or_else(|| panic!("{} child start missing", spec.label));
            assert_eq!(child.state, AgentOccupancy::Running, "{}", spec.label);
            assert_eq!(
                child.agent_type.as_deref(),
                Some("Explore"),
                "{}",
                spec.label
            );
            assert_eq!(
                child.description.as_deref(),
                Some("scan files"),
                "{}",
                spec.label
            );
        }
        send(event(
            "SubagentStop",
            false,
            json!({ "subagent_id": "child-1" }),
        ));
        {
            let child = status.get_all_activity()[0]
                .children
                .iter()
                .find(|child| child.child_id == "child-1")
                .cloned()
                .unwrap_or_else(|| panic!("{} child vanished on stop", spec.label));
            assert_eq!(child.state, AgentOccupancy::Idle, "{}", spec.label);
        }

        match spec.label {
            "gemini" | "antigravity" => {
                send(event("Notification", false, json!({})));
                assert!(
                    status.get_all_activity()[0].pending_permission.is_some(),
                    "{} notification should be permission",
                    spec.label
                );
            }
            "factory" => {
                let before = status.get_all_activity()[0]
                    .turns
                    .iter()
                    .map(|turn| turn.tools.len())
                    .sum::<usize>();
                send(event(
                    "PreToolUse",
                    false,
                    json!({ "tool_name": "AskUser", "tool_use_id": "ask-1" }),
                ));
                let activity = &status.get_all_activity()[0];
                let after = activity
                    .turns
                    .iter()
                    .map(|turn| turn.tools.len())
                    .sum::<usize>();
                assert_eq!(after, before, "AskUser must not become a generic tool");
                assert!(activity.pending_permission.is_some());
            }
            "grok" => {
                send(event(
                    "Notification",
                    false,
                    json!({ "notification_type": "permission_prompt", "tool_name": "Bash" }),
                ));
                assert!(status.get_all_activity()[0].pending_permission.is_some());
            }
            _ => {}
        }
    }

    #[test]
    fn observer_claude_code_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "claude",
            handle: AgentHooksService::handle_claude_code_event,
            prompt_event: "UserPromptSubmit",
            tool_pre: "PreToolUse",
            tool_post: "PostToolUse",
            tool_name: "Bash",
            edit_pre: "PreToolUse",
            edit_post: "PostToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_codex_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "codex",
            handle: AgentHooksService::handle_codex_event,
            prompt_event: "UserPromptSubmit",
            tool_pre: "PreToolUse",
            tool_post: "PostToolUse",
            tool_name: "Bash",
            edit_pre: "PreToolUse",
            edit_post: "PostToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_cursor_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "cursor",
            handle: AgentHooksService::handle_cursor_event,
            prompt_event: "beforeSubmitPrompt",
            tool_pre: "beforeShellExecution",
            tool_post: "postToolUse",
            tool_name: "Shell",
            edit_pre: "preToolUse",
            edit_post: "postToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_gemini_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "gemini",
            handle: AgentHooksService::handle_gemini_event,
            prompt_event: "BeforeAgent",
            tool_pre: "BeforeTool",
            tool_post: "AfterTool",
            tool_name: "Bash",
            edit_pre: "BeforeTool",
            edit_post: "AfterTool",
            as_type: false,
        });
    }

    #[test]
    fn observer_antigravity_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "antigravity",
            handle: AgentHooksService::handle_antigravity_event,
            prompt_event: "BeforeAgent",
            tool_pre: "PreToolUse",
            tool_post: "AfterTool",
            tool_name: "Bash",
            edit_pre: "PreToolUse",
            edit_post: "AfterTool",
            as_type: false,
        });
    }

    #[test]
    fn observer_factory_droid_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "factory",
            handle: AgentHooksService::handle_factory_droid_event,
            prompt_event: "UserPromptSubmit",
            tool_pre: "PreToolUse",
            tool_post: "PostToolUse",
            tool_name: "Bash",
            edit_pre: "PreToolUse",
            edit_post: "PostToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_kiro_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "kiro",
            handle: AgentHooksService::handle_kiro_event,
            prompt_event: "userPromptSubmit",
            tool_pre: "preToolUse",
            tool_post: "postToolUse",
            tool_name: "Bash",
            edit_pre: "preToolUse",
            edit_post: "postToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_opencode_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "opencode",
            handle: AgentHooksService::handle_opencode_event,
            prompt_event: "chat.message",
            tool_pre: "tool.execute.before",
            tool_post: "tool.execute.after",
            tool_name: "Bash",
            edit_pre: "tool.execute.before",
            edit_post: "tool.execute.after",
            as_type: true,
        });
    }

    #[test]
    fn observer_ampcode_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "amp",
            handle: AgentHooksService::handle_ampcode_event,
            prompt_event: "AgentStart",
            tool_pre: "ToolCall",
            tool_post: "ToolResult",
            tool_name: "Bash",
            edit_pre: "ToolCall",
            edit_post: "ToolResult",
            as_type: false,
        });
    }

    #[test]
    fn observer_pi_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "pi",
            handle: AgentHooksService::handle_pi_event,
            prompt_event: "BeforeAgentStart",
            tool_pre: "ToolCall",
            tool_post: "ToolResult",
            tool_name: "Bash",
            edit_pre: "ToolCall",
            edit_post: "ToolResult",
            as_type: false,
        });
    }

    #[test]
    fn observer_hermes_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "hermes",
            handle: AgentHooksService::handle_hermes_event,
            prompt_event: "pre_llm_call",
            tool_pre: "pre_tool_call",
            tool_post: "post_tool_call",
            tool_name: "Bash",
            edit_pre: "pre_tool_call",
            edit_post: "post_tool_call",
            as_type: false,
        });
    }

    #[test]
    fn observer_grok_build_prompt_tool_edit_and_child() {
        observe(&Spec {
            label: "grok",
            handle: AgentHooksService::handle_grok_build_event,
            prompt_event: "UserPromptSubmit",
            tool_pre: "PreToolUse",
            tool_post: "PostToolUse",
            tool_name: "Bash",
            edit_pre: "PreToolUse",
            edit_post: "PostToolUse",
            as_type: false,
        });
    }

    #[test]
    fn observer_opencode_permission_replied_deny_ends_the_turn() {
        for response in ["reject", "deny"] {
            let status = Arc::new(AgentStatusService::new());
            let service = AgentHooksService::new(status.clone());
            let ctx = terminal_hook_context(AgentStatusContext {
                pane_id: Some(format!("ws-1:oc-{response}")),
                context_id: Some("ws-1".into()),
                ..AgentStatusContext::default()
            });
            service.handle_opencode_event(
                &json!({
                    "type": "chat.message",
                    "prompt": "fix the drawer",
                }),
                &ctx,
            );
            assert!(status.get_all_activity()[0].turns[0].ended_at.is_none());
            service.handle_opencode_event(
                &json!({
                    "type": "permission.replied",
                    "properties": { "response": response },
                }),
                &ctx,
            );
            let activity = &status.get_all_activity()[0];
            assert!(
                activity.turns[0].ended_at.is_some(),
                "{response} should end the turn"
            );
            assert_eq!(activity.turns[0].prompt, "fix the drawer");
        }
    }

    #[test]
    fn observer_gemini_and_antigravity_notification_message_is_permission() {
        let cases: [(&str, fn(&AgentHooksService, &Value, &AgentStatusContext)); 2] = [
            ("gemini", AgentHooksService::handle_gemini_event),
            ("antigravity", AgentHooksService::handle_antigravity_event),
        ];
        for (label, handle) in cases {
            let status = Arc::new(AgentStatusService::new());
            let service = AgentHooksService::new(status.clone());
            let ctx = terminal_hook_context(AgentStatusContext {
                pane_id: Some(format!("ws-1:{label}-hello")),
                context_id: Some("ws-1".into()),
                ..AgentStatusContext::default()
            });
            handle(
                &service,
                &json!({
                    "hook_event_name": "Notification",
                    "message": "hello",
                }),
                &ctx,
            );
            assert!(
                status.get_all_activity()[0].pending_permission.is_some(),
                "{label} notification should be a permission"
            );
        }
    }
}
