mod handlers;

use axum::{
    routing::{get, put},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/project/{project_guid}",
            get(handlers::list_workspaces_by_project),
        )
        .route(
            "/{guid}",
            get(handlers::get_workspace).delete(handlers::delete_workspace),
        )
        .route("/{guid}/name", put(handlers::update_name))
        .route("/{guid}/branch", put(handlers::update_branch))
        .route("/{guid}/order", put(handlers::update_order))
        .route(
            "/{guid}/terminal-layout",
            get(handlers::get_terminal_layout).put(handlers::update_terminal_layout),
        )
        .route(
            "/{guid}/maximized-terminal-id",
            put(handlers::update_maximized_terminal_id),
        )
}
