use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(list_sessions))
        .route("/sessions/clear-idle", post(clear_idle_sessions))
        .route(
            "/sessions/{session_id}/force-idle",
            post(force_session_idle),
        )
        .route("/sessions/{session_id}", delete(remove_session))
        .route("/workspace-agent-groups", get(list_workspace_agent_groups))
        .route("/attention", get(list_attention))
        .route("/attention/clear", post(clear_attention))
        .route("/attention/summaries", get(list_attention_summaries))
}

async fn list_sessions(State(state): State<AppState>) -> Json<Value> {
    let sessions = state.agent_status_service.get_all_sessions();
    Json(serde_json::json!({ "sessions": sessions }))
}

async fn list_workspace_agent_groups(State(state): State<AppState>) -> Json<Value> {
    let groups = state.agent_status_service.list_workspace_agent_groups();
    Json(serde_json::json!({ "groups": groups }))
}

async fn list_attention(State(state): State<AppState>) -> Json<Value> {
    let attention = state.agent_status_service.get_all_attention();
    Json(serde_json::json!({ "attention": attention }))
}

async fn list_attention_summaries(State(state): State<AppState>) -> Json<Value> {
    let summaries = state.agent_status_service.get_all_attention_summaries();
    Json(serde_json::json!({ "summaries": summaries }))
}

#[derive(Debug, Deserialize)]
struct ClearAttentionBody {
    #[serde(default)]
    stable_pane_id: Option<String>,
    #[serde(default)]
    stable_pane_ids: Option<Vec<String>>,
    #[serde(default)]
    not_after: Option<String>,
    #[serde(default)]
    dismiss_summary: bool,
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
    let cleared = state
        .agent_status_service
        .clear_attention_matching_ids_not_after(&ids, not_after, body.dismiss_summary);
    Json(serde_json::json!({ "cleared": cleared }))
}

async fn clear_idle_sessions(State(state): State<AppState>) -> Json<Value> {
    let cleared = state.agent_status_service.clear_idle_sessions();
    Json(serde_json::json!({ "cleared": cleared }))
}

async fn force_session_idle(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    match state.agent_status_service.force_session_idle(&session_id) {
        Some(session) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "session": session })),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "ok": false,
                "error": "Agent status session not found"
            })),
        ),
    }
}

async fn remove_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    if state.agent_status_service.remove_session(&session_id) {
        (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "removed": session_id })),
        )
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "ok": false,
                "error": "Agent status session not found"
            })),
        )
    }
}
