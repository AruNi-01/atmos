mod api;
mod app_state;
mod config;
mod error;
mod middleware;
mod service;
mod utils;

use std::sync::Arc;

use app_state::AppState;
use config::ServerConfig;
use core_engine::TestEngine;
use core_service::{AgentService, MessagePushService, ProjectService, TerminalService, TestService, WorkspaceService, WsMessageService};
use infra::{DbConnection, Migrator, WsServiceConfig};
use sea_orm_migration::MigratorTrait;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::from_filename("apps/api/.env").ok();
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting ATMOS API Server...");

    // Sync project-wiki skill to ~/.atmos/skills/.system/ on startup (from project or GitHub)
    tokio::task::spawn_blocking(utils::wiki_skill_sync::sync_project_wiki_skill_on_startup);

    let db_connection = DbConnection::new().await?;
    info!("Database connected");

    Migrator::up(&db_connection.conn, None).await?;
    info!("Database migrations completed");

    let db = Arc::new(db_connection.conn.clone());

    let test_engine = Arc::new(TestEngine::new());
    let message_push_service = Arc::new(MessagePushService::new());

    // Create services
    let test_service = Arc::new(TestService::new(
        Arc::clone(&test_engine),
        (*db).clone()
    ));
    let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
    let workspace_service = Arc::new(WorkspaceService::new(Arc::clone(&db)));
    let agent_service = Arc::new(AgentService::new());
    tokio::spawn({
        let agent = Arc::clone(&agent_service);
        async move {
            if let Err(e) = agent.refresh_acp_registry_cache().await {
                warn!("Failed to refresh ACP registry cache: {}", e);
            } else {
                info!("ACP registry cache refreshed");
            }
        }
    });

    // WsMessageService handles all WebSocket-based operations
    let ws_message_service = Arc::new(WsMessageService::new(
        Arc::clone(&project_service),
        Arc::clone(&workspace_service),
        Arc::clone(&agent_service),
    ));

    // Terminal service for PTY management
    let terminal_service = Arc::new(TerminalService::new());

    // CRITICAL: Clean up stale tmux client sessions from previous crashes/hot-reloads.
    // During development with hot-reload, the process may be killed before cleanup.
    // This leaves orphaned tmux "grouped sessions" (atmos_client_*) that each hold
    // a PTY device. Without this cleanup, PTY devices accumulate and eventually
    // cause "unable to allocate pty: Device not configured" system-wide.
    terminal_service.cleanup_stale_client_sessions();
    info!("Terminal service initialized");

    // Configure WebSocket service
    let ws_config = WsServiceConfig {
        heartbeat_interval_secs: 10,
        connection_timeout_secs: 30,
    };

    // Keep a reference for shutdown cleanup (must clone before moving into AppState)
    let terminal_service_shutdown = terminal_service.clone();

    // Create AppState with dependency injection
    let app_state = AppState::new(
        test_service,
        project_service,
        workspace_service,
        ws_message_service.clone(),
        message_push_service,
        terminal_service,
        ws_config,
    );

    // Inject WsManager into WsMessageService for server-to-client notifications
    ws_message_service.set_ws_manager(app_state.ws_service.manager()).map_err(|e| e.to_string())?;

    // Start heartbeat monitor
    let _heartbeat_task = app_state.ws_service.start_heartbeat();
    info!("WebSocket service started with heartbeat (timeout: 30s)");

    let server_config = ServerConfig::from_env();
    let cors = server_config.cors_layer();

    let app = api::routes()
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = server_config.socket_addr();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("Server listening on http://{}", addr);

    // Serve with graceful shutdown — ensures PTY resources are cleaned up
    // when the process receives SIGTERM/SIGINT (e.g., during hot-reload).
    // Without this, each restart leaks PTY devices until the system runs out.
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    // Graceful shutdown: clean up all terminal sessions and PTY resources
    info!("Shutdown signal received, cleaning up terminal sessions...");
    terminal_service_shutdown.shutdown().await;
    info!("Server shutdown complete");

    Ok(())
}

/// Wait for a shutdown signal (Ctrl+C or SIGTERM).
/// Used by axum's graceful shutdown to stop accepting new connections
/// before cleaning up PTY resources.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            warn!("Received Ctrl+C, initiating graceful shutdown...");
        }
        _ = terminate => {
            warn!("Received SIGTERM, initiating graceful shutdown...");
        }
    }
}
