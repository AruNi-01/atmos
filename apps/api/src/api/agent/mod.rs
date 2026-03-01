pub mod handlers;

use axum::{routing::delete, routing::get, routing::patch, routing::post, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/session", post(handlers::create_agent_session))
        .route("/sessions", get(handlers::list_agent_sessions))
        .route(
            "/sessions/{session_id}/resume",
            post(handlers::resume_agent_session),
        )
        .route(
            "/sessions/{session_id}",
            get(handlers::get_agent_session)
                .patch(handlers::update_agent_session)
                .delete(handlers::delete_agent_session),
        )
        .route("/upload-attachments", post(handlers::upload_attachments))
}
