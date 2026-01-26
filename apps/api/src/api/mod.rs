pub mod dto;
pub mod project;
pub mod system;
pub mod test;
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
        .nest("/ws", ws::routes())
}
