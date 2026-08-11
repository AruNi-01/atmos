use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use core_service::service::agent_hooks::AtmosContext;
use serde::Deserialize;
use serde_json::Value;

use crate::app_state::AppState;

fn extract_atmos_context(headers: &HeaderMap) -> AtmosContext {
    AtmosContext {
        context_id: headers
            .get("x-atmos-context")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(String::from),
        pane_id: headers
            .get("x-atmos-pane")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(String::from),
        terminal_kind: headers
            .get("x-atmos-terminal-kind")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(String::from),
        side_chat_id: headers
            .get("x-atmos-side-chat-id")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(String::from),
        source_pane_id: headers
            .get("x-atmos-source-pane")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(String::from),
        hook_version: headers
            .get("x-atmos-hook-version")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u32>().ok()),
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/claude-code", post(handle_claude_code_hook))
        .route("/codex", post(handle_codex_hook))
        .route("/cursor", post(handle_cursor_hook))
        .route("/gemini", post(handle_gemini_hook))
        .route("/antigravity", post(handle_antigravity_hook))
        .route("/factory-droid", post(handle_factory_droid_hook))
        .route("/kiro", post(handle_kiro_hook))
        .route("/opencode", post(handle_opencode_hook))
        .route("/ampcode", post(handle_ampcode_hook))
        .route("/pi", post(handle_pi_hook))
        .route("/hermes", post(handle_hermes_hook))
        .route("/grok-build", post(handle_grok_build_hook))
        .route("/cli-identity", get(cli_identity))
        .route("/sessions", get(list_hook_sessions))
        .route("/sessions/clear-idle", post(clear_idle_sessions))
        .route(
            "/sessions/{session_id}/force-idle",
            post(force_session_idle),
        )
        .route("/sessions/{session_id}", delete(remove_hook_session))
        // Attention routes before `/{tool}/…` so "attention" is not parsed as a tool name.
        // REST (not WS): same pre-connection bootstrap as GET /attention — used to hydrate
        // sticky latch/summary state on browser refresh before the WS session is ready.
        .route("/attention", get(list_attention))
        .route("/attention/clear", post(clear_attention))
        .route("/attention/summaries", get(list_attention_summaries))
        .route("/install", post(install_hooks))
        .route("/uninstall", post(uninstall_hooks))
        .route("/status", get(hooks_status))
        .route("/{tool}/install", post(install_hook))
        .route("/{tool}/uninstall", post(uninstall_hook))
        .route("/refresh-projects", post(refresh_project_paths))
}

async fn handle_claude_code_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_claude_code_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_codex_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state.agent_hooks_service.handle_codex_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_opencode_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_opencode_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_ampcode_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_ampcode_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_pi_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state.agent_hooks_service.handle_pi_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_hermes_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_hermes_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_grok_build_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_grok_build_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn cli_identity(
    axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<Value> {
    let command = query
        .get("command")
        .cloned()
        .unwrap_or_else(|| "agent".to_string());
    let probe_command = command.clone();
    let (owner, resolved_path) = match tokio::task::spawn_blocking(move || {
        core_service::service::cli_identity::resolve_command_identity(&probe_command)
    })
    .await
    {
        Ok(result) => (result.owner.as_str(), result.resolved_path),
        Err(_) => ("unknown", None),
    };
    Json(serde_json::json!({
        "command": command,
        "owner": owner,
        "resolved_path": resolved_path,
    }))
}

async fn handle_cursor_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_cursor_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_gemini_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_gemini_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_antigravity_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_antigravity_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_factory_droid_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state
        .agent_hooks_service
        .handle_factory_droid_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_kiro_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let ctx = extract_atmos_context(&headers);
    state.agent_hooks_service.handle_kiro_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn list_hook_sessions(State(state): State<AppState>) -> Json<Value> {
    let sessions = state.agent_hooks_service.get_all_sessions();
    Json(serde_json::json!({ "sessions": sessions }))
}

async fn list_attention(State(state): State<AppState>) -> Json<Value> {
    let attention = state.agent_hooks_service.get_all_attention();
    Json(serde_json::json!({ "attention": attention }))
}

async fn list_attention_summaries(State(state): State<AppState>) -> Json<Value> {
    let summaries = state.agent_hooks_service.get_all_attention_summaries();
    Json(serde_json::json!({ "summaries": summaries }))
}

#[derive(Debug, Deserialize)]
struct ClearAttentionBody {
    /// Prefer the stable pane id (`{context}:{tmux_window}`) the client focuses.
    #[serde(default)]
    stable_pane_id: Option<String>,
    #[serde(default)]
    stable_pane_ids: Option<Vec<String>>,
    /// When set (RFC3339), only clear latches raised at or before this time so a
    /// late dismiss cannot wipe a newer turn that landed after the client acted.
    #[serde(default)]
    not_after: Option<String>,
}

async fn clear_attention(
    State(state): State<AppState>,
    Json(body): Json<ClearAttentionBody>,
) -> Json<Value> {
    let mut ids: Vec<String> = body.stable_pane_ids.unwrap_or_default();
    if let Some(id) = body.stable_pane_id {
        if !id.trim().is_empty() {
            ids.push(id);
        }
    }
    let not_after = body
        .not_after
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let cleared = if let Some(cutoff) = not_after {
        if ids.len() == 1 {
            state
                .agent_hooks_service
                .clear_attention_for_pane_not_after(ids[0].as_str(), cutoff)
        } else {
            // Multi-id guarded clear: reuse single-id path per id.
            let mut all = Vec::new();
            for id in &ids {
                all.extend(
                    state
                        .agent_hooks_service
                        .clear_attention_for_pane_not_after(id.as_str(), cutoff),
                );
            }
            all
        }
    } else if ids.len() == 1 {
        state
            .agent_hooks_service
            .clear_attention_for_pane(ids[0].as_str())
    } else {
        state.agent_hooks_service.clear_attention_matching_ids(&ids)
    };
    Json(serde_json::json!({ "cleared": cleared }))
}

async fn clear_idle_sessions(State(state): State<AppState>) -> Json<Value> {
    let cleared = state.agent_hooks_service.clear_idle_sessions();
    Json(serde_json::json!({ "cleared": cleared }))
}

async fn force_session_idle(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    match state.agent_hooks_service.force_session_idle(&session_id) {
        Some(session) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "session": session })),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "ok": false,
                "error": "Agent hook session not found"
            })),
        ),
    }
}

async fn remove_hook_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    if state.agent_hooks_service.remove_session(&session_id) {
        (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "removed": session_id })),
        )
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "ok": false,
                "error": "Agent hook session not found"
            })),
        )
    }
}

async fn install_hooks(State(state): State<AppState>) -> Json<Value> {
    let port = state.api_port.load(std::sync::atomic::Ordering::SeqCst);
    let report = core_engine::agent_hooks::install_all_hooks(port);
    Json(serde_json::to_value(report).unwrap_or_default())
}

async fn uninstall_hooks() -> Json<Value> {
    let report = core_engine::agent_hooks::uninstall_all_hooks();
    Json(serde_json::to_value(report).unwrap_or_default())
}

async fn install_hook(
    State(state): State<AppState>,
    Path(tool): Path<String>,
) -> impl IntoResponse {
    let port = state.api_port.load(std::sync::atomic::Ordering::SeqCst);
    match core_engine::agent_hooks::install_hook(&tool, port) {
        Some(status) => (
            StatusCode::OK,
            Json(serde_json::to_value(status).unwrap_or_default()),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "unknown tool" })),
        ),
    }
}

async fn uninstall_hook(Path(tool): Path<String>) -> impl IntoResponse {
    match core_engine::agent_hooks::uninstall_hook(&tool) {
        Some(status) => (
            StatusCode::OK,
            Json(serde_json::to_value(status).unwrap_or_default()),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "unknown tool" })),
        ),
    }
}

async fn hooks_status() -> Json<Value> {
    let report = core_engine::agent_hooks::check_all_hooks();
    Json(serde_json::to_value(report).unwrap_or_default())
}

async fn refresh_project_paths(State(state): State<AppState>) -> Json<Value> {
    match state.project_service.list_projects().await {
        Ok(projects) => {
            let paths: Vec<String> = projects.into_iter().map(|p| p.main_file_path).collect();
            let count = paths.len();
            state.agent_hooks_service.set_known_project_paths(paths);
            Json(serde_json::json!({ "ok": true, "count": count }))
        }
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_hook_version_and_side_chat_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("x-atmos-hook-version", "2".parse().unwrap());
        headers.insert("x-atmos-terminal-kind", "side_chat".parse().unwrap());
        headers.insert("x-atmos-side-chat-id", "side-123".parse().unwrap());
        headers.insert("x-atmos-source-pane", "pane-123".parse().unwrap());

        let ctx = extract_atmos_context(&headers);

        assert_eq!(ctx.hook_version, Some(2));
        assert_eq!(ctx.terminal_kind.as_deref(), Some("side_chat"));
        assert_eq!(ctx.side_chat_id.as_deref(), Some("side-123"));
        assert_eq!(ctx.source_pane_id.as_deref(), Some("pane-123"));
    }

    #[test]
    fn ignores_invalid_hook_version_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-atmos-hook-version", "not-a-version".parse().unwrap());

        let ctx = extract_atmos_context(&headers);

        assert_eq!(ctx.hook_version, None);
    }

    #[tokio::test]
    async fn s11_cli_identity_endpoint_returns_unknown_for_uncontested_command() {
        let query = std::collections::HashMap::from([(
            "command".to_string(),
            "not-a-contested-command".to_string(),
        )]);
        let Json(body) = cli_identity(axum::extract::Query(query)).await;

        assert_eq!(body["command"], "not-a-contested-command");
        assert_eq!(body["owner"], "unknown");
        assert!(body["resolved_path"].is_null());
    }
}
