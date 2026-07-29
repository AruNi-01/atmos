pub(crate) mod cli;
mod client_session;
mod computer;
mod debug_log;
mod diagnostics;
mod files;
mod handlers;
pub(crate) mod skills;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/tmux-status", get(handlers::get_tmux_status))
        .route("/gh-cli-status", get(handlers::get_gh_cli_status))
        .route("/git-status", get(handlers::get_git_status))
        .route(
            "/terminal-agents-status",
            get(handlers::get_terminal_agents_status),
        )
        .route("/tmux-install-plan", get(handlers::get_tmux_install_plan))
        .route("/tmux-sessions", get(handlers::list_tmux_sessions))
        .route(
            "/tmux-windows/{workspace_id}",
            get(handlers::list_tmux_windows),
        )
        .route(
            "/tmux-window/{workspace_id}",
            post(handlers::kill_tmux_window),
        )
        .route(
            "/tmux-capture/{workspace_id}",
            get(handlers::capture_tmux_window),
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
        .route("/cli-version-check", get(cli::check_cli_version))
        .route("/cli-install", post(cli::install_cli))
        .route("/ws-connections", get(handlers::list_ws_connections))
        .route("/file", get(files::serve_file))
        .route("/git-blob", get(files::serve_git_blob))
        .route("/debug-log", post(debug_log::ingest_frontend_debug_log))
        .route(
            "/client-session",
            get(client_session::get_client_session).put(client_session::put_client_session),
        )
        .route(
            "/computer-client-settings",
            get(computer::get_computer_client_settings).put(computer::put_computer_client_settings),
        )
        .route("/computer", get(computer::get_computer_status))
        .route("/runtime-info", get(computer::get_runtime_info))
}

/// Destructive system routes that require loopback or token authentication.
pub fn destructive_routes() -> Router<AppState> {
    Router::new()
        .route("/tmux-kill-server", post(handlers::kill_tmux_server))
        .route("/tmux-kill-session", post(handlers::kill_tmux_session))
        .route(
            "/kill-orphaned-processes",
            post(handlers::kill_orphaned_processes),
        )
        .route(
            "/computer/register",
            post(computer::register_local_computer),
        )
        .route(
            "/computer/unregister",
            post(computer::unregister_local_computer),
        )
        .route(
            "/computer/relay-sync",
            post(computer::sync_relay_connection),
        )
        .route("/computer/relay", post(computer::proxy_relay))
}
