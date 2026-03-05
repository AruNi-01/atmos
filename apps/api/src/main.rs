mod api;
mod app_state;
mod config;
mod error;
mod middleware;
mod service;
mod utils;

use std::sync::Arc;

use crate::middleware::require_local_token;
use app_state::AppState;
use axum::{http::StatusCode, middleware::from_fn, routing::get, Router};
use clap::Parser;
use config::ServerConfig;
use core_engine::TestEngine;
use core_service::{
    AgentService, MessagePushService, ProjectService, TerminalService, TestService,
    WorkspaceService, WsMessageService,
};
use infra::{DbConnection, Migrator, WsServiceConfig};
use sea_orm_migration::MigratorTrait;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser)]
#[command(name = "atmos-api", about = "ATMOS API Server")]
struct Cli {
    /// Port to listen on (overrides ATMOS_PORT env var)
    #[arg(short, long)]
    port: Option<u16>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    dotenvy::from_filename("apps/api/.env").ok();
    dotenvy::dotenv().ok();

    // CLI --port takes highest priority, then env var
    if let Some(port) = cli.port {
        std::env::set_var("ATMOS_PORT", port.to_string());
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting ATMOS API Server...");

    // Sync system skills (wiki + code review) to ~/.atmos/skills/.system/ on startup
    tokio::task::spawn_blocking(infra::utils::system_skill_sync::sync_system_skills_on_startup);

    let db_connection = DbConnection::new().await?;
    info!("Database connected");

    Migrator::up(&db_connection.conn, None).await?;
    info!("Database migrations completed");

    let db = Arc::new(db_connection.conn.clone());

    let test_engine = Arc::new(TestEngine::new());
    let message_push_service = Arc::new(MessagePushService::new());

    // Create services
    let test_service = Arc::new(TestService::new(Arc::clone(&test_engine), (*db).clone()));
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

    let server_config = ServerConfig::from_env();
    let cors = server_config.cors_layer();

    // Keep a reference for shutdown cleanup (must clone before moving into AppState)
    let terminal_service_shutdown = terminal_service.clone();

    // Create AppState with dependency injection
    let app_state = AppState::new(
        test_service,
        project_service,
        workspace_service,
        agent_service,
        ws_message_service.clone(),
        message_push_service,
        terminal_service,
        ws_config,
        db,
    );

    // Inject WsManager into WsMessageService for server-to-client notifications
    ws_message_service
        .set_ws_manager(app_state.ws_service.manager())
        .map_err(|e| e.to_string())?;

    // Start heartbeat monitor
    let _heartbeat_task = app_state.ws_service.start_heartbeat();
    info!("WebSocket service started with heartbeat (timeout: 30s)");

    let protected = api::routes().route_layer(from_fn(require_local_token));
    let mut app = Router::new()
        .route("/healthz", get(|| async { StatusCode::OK }))
        .merge(protected)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    if let Ok(static_dir) = std::env::var("ATMOS_STATIC_DIR") {
        let static_path = std::path::PathBuf::from(&static_dir);
        let index = static_path.join("index.html");
        if index.is_file() {
            // Serve static files from the exported Next.js build.
            // Dynamic data is passed via query params (/workspace?id=...) so every
            // route maps to a pre-rendered static page. Unmatched URLs fall back
            // to en/index.html (or root index.html) for client-side resolution.
            let fallback = static_path.join("en").join("index.html");
            let fallback_file = if fallback.is_file() { &fallback } else { &index };
            let serve_dir = ServeDir::new(&static_path)
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new(fallback_file));
            app = app.fallback_service(serve_dir);
        }
    }

    let addr = server_config.socket_addr();
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::AddrInUse {
            format!(
                "Port {} is already in use. Either stop the other process or use --port <PORT> / ATMOS_PORT=<PORT> to pick a different port.",
                server_config.port
            )
        } else {
            format!("Failed to bind to {}: {}", addr, e)
        }
    })?;
    let actual_addr = listener.local_addr()?;
    info!("Server listening on http://{}", actual_addr);
    println!("ATMOS_READY port={}", actual_addr.port());

    // Serve with graceful shutdown — ensures PTY resources are cleaned up
    // when the process receives SIGTERM/SIGINT (e.g., during hot-reload).
    // Without this, each restart leaks PTY devices until the system runs out.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
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
