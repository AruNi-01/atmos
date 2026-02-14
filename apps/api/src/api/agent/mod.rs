pub mod handlers;

use axum::{routing::post, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/session", post(handlers::create_agent_session))
}
