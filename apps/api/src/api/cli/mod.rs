//! APP-058: CLI → Atmos Server product control plane.
//!
//! `POST /api/cli/invoke` dispatches the same `WsAction` handlers used by `/ws`.
//! Auth is the global `require_local_token` middleware.

mod actions;
mod health;
mod invoke;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/invoke", post(invoke::invoke))
        .route("/actions", get(actions::list_actions))
        .route("/health", get(health::health))
}
