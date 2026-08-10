//! APP-058: HTTP CLI product control plane.
//!
//! Dispatches the same `WsAction` handlers used by `/ws` so CLI and UI share
//! one business plane. Auth is the global `require_local_token` middleware.

mod actions;
mod health;
mod rpc;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/rpc", post(rpc::rpc))
        .route("/actions", get(actions::list_actions))
        .route("/health", get(health::health))
}
