pub mod handlers;

use axum::{routing::get, routing::post, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/session", post(handlers::create_agent_session))
        .route("/session/resume", post(handlers::resume_agent_session))
        .route("/sessions", get(handlers::list_agent_sessions))
        .route("/logout", post(handlers::logout_agent))
        .route("/upload-attachments", post(handlers::upload_attachments))
}
