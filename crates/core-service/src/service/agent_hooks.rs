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

use super::agent_status::{AgentStatusContext, AgentStatusService, AgentSurface, AgentToolType};

pub(crate) use child_agent::{extract_child_agent_id, is_child_start_event, is_child_stop_event};
use to_event::hook_payload_to_events;

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
        for event in hook_payload_to_events(payload) {
            self.status.observe_host(&session_id, tool, &event, ctx);
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
