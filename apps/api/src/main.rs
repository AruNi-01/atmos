mod api;
mod app_state;
mod config;
mod error;
mod middleware;

use std::sync::Arc;

use crate::middleware::{require_local_token, require_loopback_or_token};
use ai_usage::UsageService;
use app_state::{AppServices, AppState};
use axum::{http::StatusCode, middleware::from_fn, routing::get, Router};
use clap::{ArgAction, Parser};
use config::ServerConfig;
use core_engine::TestEngine;
use core_service::{
    AgentHooksService, AgentService, MessagePushService, NotificationService, ProjectService,
    TerminalService, TestService, WorkspaceService, WsMessageService,
};
use infra::{DbConnection, Migrator, WsEvent, WsManager, WsMessage, WsServiceConfig};
use sea_orm_migration::MigratorTrait;
use serde_json::json;
use token_usage::TokenUsageService;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{debug, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser)]
#[command(name = "atmos-api", about = "ATMOS API Server")]
struct Cli {
    /// Port to listen on (overrides ATMOS_PORT env var)
    #[arg(short, long)]
    port: Option<u16>,

    /// Whether to clean up stale tmux client sessions on startup
    #[arg(long, default_value_t = true, action = ArgAction::Set)]
    cleanup_stale_clients: bool,
}

fn spawn_ws_forwarder<T: serde::Serialize + Clone + Send + 'static>(
    mut rx: tokio::sync::broadcast::Receiver<T>,
    ws_manager: Arc<WsManager>,
    event: WsEvent,
    label: &'static str,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(data) => {
                    debug!("Broadcasting {} update to all websocket clients", label);
                    if let Err(error) = ws_manager
                        .broadcast(&WsMessage::notification(event.clone(), json!(data)))
                        .await
                    {
                        warn!("Failed to broadcast {} update: {}", label, error);
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!("Lagged on {} updates, skipped {} messages", label, skipped);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    })
}

fn spawn_non_critical_startup_tasks(agent_service: Arc<AgentService>) {
    tokio::task::spawn_blocking(|| {
        infra::utils::system_skill_sync::sync_system_skills_on_startup();
    });

    tokio::spawn(async move {
        if let Err(error) = agent_service.refresh_acp_registry_cache().await {
            warn!(
                "Non-critical startup task failed: ACP registry refresh: {}",
                error
            );
        } else {
            info!("ACP registry cache refreshed");
        }
    });
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    dotenvy::from_filename("apps/api/.env").ok();
    dotenvy::dotenv().ok();

    let default_log_level = option_env!("ATMOS_LOG_LEVEL").unwrap_or("debug");
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!(
                    "api={default_log_level},infra={default_log_level},core_service={default_log_level},core_engine={default_log_level},agent={default_log_level},llm={default_log_level},tower_http={default_log_level}"
                )
                .into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting ATMOS API Server...");

    let db_connection = DbConnection::new().await?;
    info!("Database connected");

    Migrator::up(db_connection.connection(), None).await?;
    info!("Database migrations completed");

    let db = Arc::new(db_connection.connection().clone());

    let test_engine = Arc::new(TestEngine::new());
    let message_push_service = Arc::new(MessagePushService::new());

    // Create services
    let test_service = Arc::new(TestService::new(Arc::clone(&test_engine), (*db).clone()));
    let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
    let workspace_service = Arc::new(WorkspaceService::new(Arc::clone(&db)));
    let agent_service = Arc::new(AgentService::new());
    let agent_service_for_startup = Arc::clone(&agent_service);
    let usage_service = Arc::new(UsageService::default());
    let token_usage_service = Arc::new(TokenUsageService::default());
    let terminal_service = Arc::new(TerminalService::new());
    let agent_hooks_service = Arc::new(AgentHooksService::new());
    let notification_service = Arc::new(NotificationService::new());

    // WsMessageService handles all WebSocket-based operations
    let ws_message_service = Arc::new(WsMessageService::new(
        Arc::clone(&project_service),
        Arc::clone(&workspace_service),
        Arc::clone(&terminal_service),
        Arc::clone(&agent_service),
        Arc::clone(&usage_service),
    ));

    // CRITICAL: Clean up stale tmux client sessions from previous crashes/hot-reloads.
    // During development with hot-reload, the process may be killed before cleanup.
    // This leaves orphaned tmux "grouped sessions" (atmos_client_*) that each hold
    // a PTY device. Without this cleanup, PTY devices accumulate and eventually
    // cause "unable to allocate pty: Device not configured" system-wide.
    if cli.cleanup_stale_clients {
        terminal_service.cleanup_stale_client_sessions();
    } else {
        info!("Skipping stale tmux client cleanup on startup");
    }
    info!("Terminal service initialized");

    // Configure WebSocket service
    let ws_config = WsServiceConfig {
        heartbeat_interval_secs: 10,
        connection_timeout_secs: 30,
    };

    let mut server_config = ServerConfig::from_env();
    if let Some(port) = cli.port {
        server_config.port = port;
    }
    let cors = server_config.cors_layer();

    // Keep a reference for shutdown cleanup (must clone before moving into AppState)
    let terminal_service_shutdown = terminal_service.clone();

    // Create AppState with dependency injection
    let app_state = AppState::new(
        AppServices {
            test_service,
            project_service,
            workspace_service,
            agent_service,
            ws_message_service: ws_message_service.clone(),
            message_push_service,
            terminal_service,
            token_usage_service: Arc::clone(&token_usage_service),
            agent_hooks_service: Arc::clone(&agent_hooks_service),
            notification_service: Arc::clone(&notification_service),
        },
        ws_config,
        db,
    );

    // Inject WsManager into WsMessageService for server-to-client notifications
    ws_message_service
        .set_ws_manager(app_state.ws_service.manager())
        .map_err(|e| e.to_string())?;

    let ws_manager = app_state.ws_service.manager();

    agent_hooks_service.set_ws_manager(Arc::clone(&ws_manager));
    agent_hooks_service.set_notification_service(Arc::clone(&notification_service));
    notification_service.set_ws_manager(Arc::clone(&ws_manager));

    spawn_ws_forwarder(
        usage_service.subscribe_updates(),
        Arc::clone(&ws_manager),
        WsEvent::UsageOverviewUpdated,
        "usage overview",
    );

    spawn_ws_forwarder(
        token_usage_service.subscribe_updates(),
        Arc::clone(&ws_manager),
        WsEvent::TokenUsageUpdated,
        "token usage",
    );

    // Start heartbeat monitor
    let _heartbeat_task = app_state.ws_service.start_heartbeat();
    info!("WebSocket service started with heartbeat (timeout: 30s)");

    let token = server_config.local_api_token.clone();
    let token_for_destructive = server_config.local_api_token.clone();

    let protected = api::routes().route_layer(from_fn(move |ci, headers, req, next| {
        require_local_token(ci, headers, req, next, token.clone())
    }));

    let destructive =
        api::destructive_system_routes().route_layer(from_fn(move |ci, headers, req, next| {
            require_loopback_or_token(ci, headers, req, next, token_for_destructive.clone())
        }));

    let mut app = Router::new()
        .route("/healthz", get(|| async { StatusCode::OK }))
        .merge(destructive)
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
            let fallback_file = if fallback.is_file() {
                &fallback
            } else {
                &index
            };
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
    spawn_non_critical_startup_tasks(agent_service_for_startup);

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
