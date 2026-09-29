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

pub(crate) use child_agent::{extract_child_agent_id, is_child_start_event, is_child_stop_event};
use to_event::{
    codex_defers_permission, hook_event_key, hook_payload_is_permission, hook_payload_to_events,
    hook_permission_request_id, hook_tool_input, permission_request_from_hook,
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
        for event in hook_payload_to_events(payload) {
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
