mod handlers;

use axum::{
    routing::{delete, get, post, put},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::list_projects).post(handlers::create_project),
        )
        .route("/{guid}", delete(handlers::delete_project))
        .route("/{guid}/color", put(handlers::update_color))
        .route("/validate-git", post(handlers::validate_git))
        .route(
            "/{guid}/terminal-layout",
            get(handlers::get_terminal_layout).put(handlers::update_terminal_layout),
        )
        .route(
            "/{guid}/maximized-terminal-id",
            put(handlers::update_maximized_terminal_id),
        )
}
