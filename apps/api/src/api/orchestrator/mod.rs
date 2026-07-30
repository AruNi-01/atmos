//! APP-048 Orchestrator HTTP API: `/api/orchestrator/v1/*`

mod handlers;

use axum::{
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().nest(
        "/v1",
        Router::new()
            .route("/status", get(handlers::status))
            .route("/agents", get(handlers::agents_list))
            .route("/runs", get(handlers::list_runs).post(handlers::create_run))
            .route("/runs/{id}", get(handlers::get_run))
            .route("/runs/{id}/start", post(handlers::start_run))
            .route("/runs/{id}/cancel", post(handlers::cancel_run))
            .route("/runs/{id}/context", get(handlers::context_get))
            .route("/runs/{id}/tick", post(handlers::tick_loop))
            .route("/runs/{id}/graph/step", post(handlers::step_graph))
            .route("/runs/{id}/spec/draft", post(handlers::spec_draft))
            .route(
                "/runs/{id}/spec",
                get(handlers::spec_get).patch(handlers::spec_update),
            )
            .route("/runs/{id}/spec/confirm", post(handlers::spec_confirm))
            .route(
                "/runs/{id}/mode-proposal",
                post(handlers::write_mode_proposal),
            )
            .route(
                "/runs/{id}/evidence",
                get(handlers::evidence_list).post(handlers::evidence_attach),
            )
            .route("/runs/{id}/graph/compile", post(handlers::graph_compile))
            .route("/runs/{id}/graph", get(handlers::graph_get))
            .route("/runs/{id}/workspace", get(handlers::workspace_get))
            .route(
                "/runs/{id}/workspaces",
                get(handlers::workspace_list).post(handlers::workspace_create),
            )
            .route("/runs/{id}/workspace/use", post(handlers::workspace_use))
            .route(
                "/runs/{id}/workspaces/{ws}/merge",
                post(handlers::workspace_merge),
            )
            .route(
                "/runs/{id}/workspaces/{ws}/abandon",
                post(handlers::workspace_abandon),
            )
            .route("/skill-dir", get(handlers::skill_dir)),
    )
}
