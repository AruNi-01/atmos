mod handlers;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/default",
        get(handlers::get_default_board).put(handlers::update_default_board),
    )
}
