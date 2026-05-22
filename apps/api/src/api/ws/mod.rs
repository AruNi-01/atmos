pub mod agent_handler;
pub mod connection;
pub mod error;
pub mod handler;
pub mod handlers;
pub mod manager;
pub mod message;
pub mod router;
pub mod service;
pub mod subscription;
pub mod terminal_handler;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub use connection::{generate_conn_id, ClientType, WsConnection};
pub use error::{WsError, WsResult};
pub use handler::WsMessageHandler;
pub use manager::{ConnectionInfo, WsManager};
pub use message::*;
pub use router::WsMessageService;
pub use service::WsService;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::ws_handler))
        .route(
            "/terminal/{session_id}",
            get(terminal_handler::terminal_ws_handler),
        )
        .route("/agent/{session_id}", get(agent_handler::agent_ws_handler))
}
