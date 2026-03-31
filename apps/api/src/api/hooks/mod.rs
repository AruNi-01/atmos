use axum::{
    extract::State,
    routing::{get, post, put},
    Json, Router,
};
use core_service::service::notification::NotificationSettings;
use serde_json::Value;

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/claude-code", post(handle_claude_code_hook))
        .route("/codex", post(handle_codex_hook))
        .route("/opencode", post(handle_opencode_hook))
        .route("/sessions", get(list_hook_sessions))
        .route("/sessions/clear-idle", post(clear_idle_sessions))
        .route("/notification/settings", get(get_notification_settings))
        .route("/notification/settings", put(update_notification_settings))
        .route("/notification/test", post(test_push_notification))
}

async fn handle_claude_code_hook(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    state.agent_hooks_service.handle_claude_code_event(&payload);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_codex_hook(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    state.agent_hooks_service.handle_codex_event(&payload);
    Json(serde_json::json!({ "ok": true }))
}

async fn handle_opencode_hook(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    state.agent_hooks_service.handle_opencode_event(&payload);
    Json(serde_json::json!({ "ok": true }))
}

async fn list_hook_sessions(
    State(state): State<AppState>,
) -> Json<Value> {
    let sessions = state.agent_hooks_service.get_all_sessions();
    Json(serde_json::json!({ "sessions": sessions }))
}

async fn clear_idle_sessions(
    State(state): State<AppState>,
) -> Json<Value> {
    let cleared = state.agent_hooks_service.clear_idle_sessions();
    Json(serde_json::json!({ "cleared": cleared }))
}

async fn get_notification_settings(
    State(state): State<AppState>,
) -> Json<Value> {
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
