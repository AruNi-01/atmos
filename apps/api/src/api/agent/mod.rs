pub mod handlers;

use axum::{routing::post, Router};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/logout", post(handlers::logout_agent))
        .route("/upload-attachments", post(handlers::upload_attachments))
}

#[cfg(test)]
mod tests {
    #[test]
    fn s17_rest_session_crud_removed() {
        let routes = include_str!("mod.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("routes");
        let handlers = include_str!("handlers.rs");
        assert!(!routes.contains("create_agent_session"));
        assert!(!handlers.contains("pub async fn create_agent_session"));
        assert!(!handlers.contains("pub async fn resume_agent_session"));
        assert!(!handlers.contains("pub async fn list_agent_sessions"));
        assert!(handlers.contains("upload_attachments"));
    }
}
