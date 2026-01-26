mod handlers;

use axum::{
    routing::get,
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/tmux-status", get(handlers::get_tmux_status))
        .route("/tmux-sessions", get(handlers::list_tmux_sessions))
        .route("/tmux-windows/{workspace_id}", get(handlers::list_tmux_windows))
}
