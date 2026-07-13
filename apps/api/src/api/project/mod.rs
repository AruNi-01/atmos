mod handlers;

use axum::{
    routing::{get, put},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/{guid}/terminal-layout",
            get(handlers::get_terminal_layout).put(handlers::update_terminal_layout),
        )
        .route(
            "/{guid}/maximized-terminal-id",
            put(handlers::update_maximized_terminal_id),
        )
}
