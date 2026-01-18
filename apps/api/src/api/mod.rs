pub mod dto;
pub mod test;
pub mod ws;

use axum::Router;

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .nest("/api/test", test::routes())
        .nest("/ws", ws::routes())
}
