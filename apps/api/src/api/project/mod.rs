use axum::{
    routing::{get, post, delete, put},
    Router,
};

use crate::app_state::AppState;
use super::handlers;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_projects).post(handlers::create_project))
        .route("/:guid", delete(handlers::delete_project))
        .route("/:guid/color", put(handlers::update_color))
        .route("/validate-git", post(handlers::validate_git))
}
