mod handlers;

use axum::{routing::put, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/{guid}/maximized-terminal-id",
        put(handlers::update_maximized_terminal_id),
    )
}
