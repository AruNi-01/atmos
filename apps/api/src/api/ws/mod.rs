pub mod agent_handler;
pub mod handlers;
pub mod terminal_handler;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::ws_handler))
        .route(
            "/terminal/{session_id}",
            get(terminal_handler::terminal_ws_handler),
        )
        .route("/agent/{session_id}", get(agent_handler::agent_ws_handler))
}
