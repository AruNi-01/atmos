pub mod automation_events;
pub mod connection;
pub mod error;
pub mod handler;
pub mod handlers;
pub mod manager;
pub mod message;
pub mod pt_design;
pub mod router;
pub mod service;
pub mod subscription;
pub mod terminal_handler;

use axum::{routing::get, Router};

use crate::app_state::AppState;

pub use automation_events::automation_event_to_ws_message;
pub use connection::ClientType;
pub use handler::WsMessageHandler;
pub use manager::WsManager;
pub use message::*;
pub use pt_design::PtDesignHub;
pub use router::WsMessageService;
pub use service::WsService;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::ws_handler))
        .route(
            "/terminal/{session_id}",
            get(terminal_handler::terminal_ws_handler),
        )
        .route("/pt-design", get(pt_design::health))
        .route("/pt-design/{room_id}", get(pt_design::ws_handler))
}

#[cfg(test)]
mod tests {
    #[test]
    fn s17_dedicated_agent_ws_removed() {
        let routes = include_str!("mod.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("routes");
        assert!(
            !routes.contains("agent_ws_handler"),
            "dedicated /ws/agent chat handler must be gone"
        );
        assert!(!routes.contains("/agent/{session_id}"));
        assert!(routes.contains("terminal_ws_handler"));
    }

    #[test]
    fn s20_options_probe_uses_temp_acp_probe() {
        let router = include_str!("router/mod.rs");
        assert!(router.contains("StdioAcpOptionsProbe"));
        assert!(router.contains("OptionsProbe::with_acp_probe"));
        assert!(router.contains("options_probe_dir"));
    }
}
