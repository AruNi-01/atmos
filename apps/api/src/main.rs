mod api;
mod app_state;
mod config;
mod error;
mod middleware;
mod service;
mod utils;

use std::sync::Arc;

use app_state::AppState;
use core_engine::TestEngine;
use core_service::{MessagePushService, TestService, WsMessageService};
use infra::{DbConnection, Migrator, WsServiceConfig};
use sea_orm_migration::MigratorTrait;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Vibe Habitat API Server...");

    let db_connection = DbConnection::new().await?;
    info!("Database connected");

    Migrator::up(&db_connection.conn, None).await?;
    info!("Database migrations completed");

    let db = db_connection.conn.clone();

    let test_engine = Arc::new(TestEngine::new());
    let message_push_service = Arc::new(MessagePushService::new());

    // Create services
    let test_service = Arc::new(TestService::new(Arc::clone(&test_engine), db.clone()));
    let project_service = Arc::new(ProjectService::new(db.clone()));
    let ws_message_service = Arc::new(WsMessageService::new(
        Arc::clone(&test_engine),
        db.clone(),
        Arc::clone(&message_push_service),
    ));

    // Configure WebSocket service
    let ws_config = WsServiceConfig {
        heartbeat_interval_secs: 10,
        connection_timeout_secs: 30,
    };

    // Create AppState with dependency injection
    let app_state = AppState::new(
        test_service,
        project_service,
        ws_message_service,
        message_push_service,
        ws_config,
    );

    // Start heartbeat monitor
    let _heartbeat_task = app_state.ws_service.start_heartbeat();
    info!("WebSocket service started with heartbeat (timeout: 30s)");

    let app = api::routes()
        .with_state(app_state)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    info!("Server listening on http://0.0.0.0:8080");

    axum::serve(listener, app).await?;

    Ok(())
}
