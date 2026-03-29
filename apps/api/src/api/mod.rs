pub mod agent;
pub mod dto;
pub mod hooks;
pub mod project;
pub mod system;
pub mod test;
pub mod token_usage;
pub mod workspace;
pub mod ws;

use axum::Router;

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .nest("/api/test", test::routes())
        .nest("/api/project", project::routes())
        .nest("/api/workspace", workspace::routes())
        .nest("/api/system", system::routes())
        .nest("/api/agent", agent::routes())
        .nest("/api/token-usage", token_usage::routes())
        .nest("/hooks", hooks::routes())
        .nest("/ws", ws::routes())
}

/// Destructive system routes requiring stricter auth (loopback or token).
pub fn destructive_system_routes() -> Router<AppState> {
    Router::new().nest("/api/system", system::destructive_routes())
}
