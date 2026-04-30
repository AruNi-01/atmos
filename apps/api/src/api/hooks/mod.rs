use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use core_service::service::agent_hooks::AtmosContext;
use core_service::service::notification::NotificationSettings;
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
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/claude-code", post(handle_claude_code_hook))
        .route("/codex", post(handle_codex_hook))
        .route("/cursor", post(handle_cursor_hook))
        .route("/gemini", post(handle_gemini_hook))
        .route("/factory-droid", post(handle_factory_droid_hook))
        .route("/kiro", post(handle_kiro_hook))
        .route("/opencode", post(handle_opencode_hook))
        .route("/sessions", get(list_hook_sessions))
        .route("/sessions/clear-idle", post(clear_idle_sessions))
        .route(
            "/sessions/{session_id}/force-idle",
            post(force_session_idle),
        )
        .route("/sessions/{session_id}", delete(remove_hook_session))
        .route("/notification/settings", get(get_notification_settings))
        .route("/notification/settings", put(update_notification_settings))
        .route("/notification/test", post(test_push_notification))
        .route("/install", post(install_hooks))
        .route("/uninstall", post(uninstall_hooks))
        .route("/status", get(hooks_status))
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
    state
        .agent_hooks_service
        .handle_kiro_event(&payload, &ctx);
    Json(serde_json::json!({ "ok": true }))
}

async fn list_hook_sessions(State(state): State<AppState>) -> Json<Value> {
    let sessions = state.agent_hooks_service.get_all_sessions();
    Json(serde_json::json!({ "sessions": sessions }))
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

async fn get_notification_settings(State(state): State<AppState>) -> Json<Value> {
    let settings = state.notification_service.get_settings();
    Json(serde_json::to_value(settings).unwrap_or_default())
}

async fn update_notification_settings(
    State(state): State<AppState>,
    Json(settings): Json<NotificationSettings>,
) -> Json<Value> {
    match state.notification_service.update_settings(settings) {
        Ok(()) => Json(serde_json::json!({ "ok": true })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e })),
    }
}

async fn test_push_notification(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let Some(raw) = payload.get("server_index") else {
        return Json(serde_json::json!({
            "ok": false,
            "error": "server_index is required",
        }));
    };
    let Some(idx_u64) = raw.as_u64() else {
        return Json(serde_json::json!({
            "ok": false,
            "error": "server_index must be a non-negative integer",
        }));
    };
    let Ok(server_index) = usize::try_from(idx_u64) else {
        return Json(serde_json::json!({
            "ok": false,
            "error": "server_index is out of range",
        }));
    };

    let settings = state.notification_service.get_settings();
    if server_index >= settings.push_servers.len() {
        return Json(serde_json::json!({ "ok": false, "error": "Invalid server index" }));
    }

    let test_payload = core_service::service::notification::NotificationPayload {
        title: "Atmos Test Notification".to_string(),
        body: "This is a test notification from Atmos.".to_string(),
        tool: "test".to_string(),
        state: "test".to_string(),
        session_id: "test".to_string(),
        project_path: None,
    };

    let server = &settings.push_servers[server_index];
    match state
        .notification_service
        .test_push(server, &test_payload)
        .await
    {
        Ok(()) => Json(serde_json::json!({ "ok": true })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e })),
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
