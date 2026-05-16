mod agent;
mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/default",
            get(handlers::get_default_board).put(handlers::update_default_board),
        )
        .route("/agent/invoke", post(agent::invoke))
        .route("/agent/status", get(agent::status))
}
