mod handlers;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/overview", get(handlers::get_token_usage_overview))
}
