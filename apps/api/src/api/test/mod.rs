pub mod dto;
pub mod handlers;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/hello", get(handlers::hello))
}
