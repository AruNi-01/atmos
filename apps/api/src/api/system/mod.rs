mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/tmux-status", get(handlers::get_tmux_status))
        .route("/tmux-sessions", get(handlers::list_tmux_sessions))
        .route(
            "/tmux-windows/{workspace_id}",
            get(handlers::list_tmux_windows),
        )
        .route(
            "/project-wiki-window/{workspace_id}",
            get(handlers::check_project_wiki_window),
        )
        .route(
            "/project-wiki-window/{workspace_id}",
            post(handlers::kill_project_wiki_window),
        )
        .route(
            "/code-review-window/{workspace_id}",
            get(handlers::check_code_review_window),
        )
        .route(
            "/code-review-window/{workspace_id}",
            post(handlers::kill_code_review_window),
        )
        .route("/terminal-overview", get(handlers::get_terminal_overview))
        .route("/terminal-cleanup", post(handlers::cleanup_terminals))
        .route("/tmux-kill-server", post(handlers::kill_tmux_server))
        .route("/tmux-kill-session", post(handlers::kill_tmux_session))
        .route(
            "/kill-orphaned-processes",
            post(handlers::kill_orphaned_processes),
        )
        .route("/sync-skills", post(handlers::sync_skills))
        .route("/ws-connections", get(handlers::list_ws_connections))
}
