mod handlers;

use axum::{
    routing::{get, patch, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(handlers::list_sessions))
        .route("/sessions/{session_guid}", get(handlers::get_session))
        .route(
            "/comments",
            get(handlers::list_comments).post(handlers::create_comment),
        )
        .route(
            "/comments/{comment_guid}/context",
            get(handlers::get_comment_context),
        )
        .route(
            "/comments/{comment_guid}/messages",
            post(handlers::add_message),
        )
        .route(
            "/comments/{comment_guid}",
            patch(handlers::update_comment_status),
        )
        .route("/agent-runs", post(handlers::create_agent_run))
        .route(
            "/agent-runs/{run_guid}/summary",
            post(handlers::summarize_run),
        )
        .route(
            "/agent-runs/{run_guid}/finalize",
            post(handlers::finalize_run),
        )
        .route(
            "/agent-runs/{run_guid}/status",
            post(handlers::set_agent_run_status),
        )
}
