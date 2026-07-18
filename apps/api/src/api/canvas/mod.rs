mod agent;
mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        // Legacy default-board routes: old web/desktop still call these (APP-037).
        .route(
            "/default",
            get(handlers::get_default_board_compat).put(handlers::update_default_board_compat),
        )
        .route("/documents", get(handlers::list_documents))
        .route("/documents/new", post(handlers::create_new_document))
        .route("/documents/sanitize-name", post(handlers::sanitize_name))
        .route(
            "/documents/{file_name}",
            get(handlers::get_document)
                .put(handlers::put_document)
                .delete(handlers::delete_document),
        )
        .route(
            "/documents/{file_name}/rename",
            post(handlers::rename_document),
        )
        .route(
            "/documents/{file_name}/duplicate",
            post(handlers::duplicate_document),
        )
        .route("/agent/invoke", post(agent::invoke))
        .route("/agent/status", get(agent::status))
}
