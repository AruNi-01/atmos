mod handlers;

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/project/{project_guid}", get(handlers::list_workspaces_by_project))
        .route("/", post(handlers::create_workspace))
        .route("/{guid}", get(handlers::get_workspace).delete(handlers::delete_workspace))
        .route("/{guid}/name", put(handlers::update_name))
        .route("/{guid}/branch", put(handlers::update_branch))
        .route("/{guid}/order", put(handlers::update_order))
}
