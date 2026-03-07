mod handlers;

use axum::{routing::{get, post}, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/overview", get(handlers::get_usage_overview))
        .route(
            "/providers/{provider_id}/switch",
            post(handlers::set_provider_switch),
        )
}
