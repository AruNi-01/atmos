mod api;
mod app_state;
mod config;
mod error;
mod middleware;
mod relay;
mod simulator;

use std::sync::Arc;

use crate::api::ws::{
    automation_event_to_ws_message, WsEvent, WsManager, WsMessage, WsMessageService,
};
use crate::middleware::{require_allowed_origin, require_local_token, require_loopback_or_token};
use app_state::{AppServices, AppState};
use axum::{
    http::{
        header::{CACHE_CONTROL, EXPIRES, PRAGMA},
        HeaderName, HeaderValue, Response as HttpResponse, StatusCode,
    },
    middleware::{from_fn, map_response},
    response::Response,
    routing::get,
    Router,
};
use clap::{ArgAction, Parser};
use config::ServerConfig;
use core_engine::TestEngine;
use core_service::{
    AgentHooksService, AgentService, AgentStatusEvent, AgentStatusService, AutomationEvent,
    AutomationService, CanvasAgentRelay, CanvasDocumentService, GroupService, MessagePushService,
    NotificationService, ProjectService, ReviewService, ServiceError, TerminalService, TestService,
    WorkspaceService,
};
use infra::jobs::{IntervalSpec, JobError, JobId, LocalScheduler, RetryPolicy};
use infra::queue::{topics, LocalPersistentQueue, QueueError, Topic};
use infra::{DbConnection, Migrator};
use quota_usage::QuotaUsageService;
use sea_orm_migration::MigratorTrait;
use serde_json::json;
use token_usage::TokenUsageService;
use tower::ServiceBuilder;
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

fn spawn_agent_status_forwarder(
    mut rx: tokio::sync::broadcast::Receiver<AgentStatusEvent>,
    ws_manager: Arc<WsManager>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let (ws_event, data) = match event {
                        AgentStatusEvent::StateChanged(update) => {
                            (WsEvent::AgentStatusChanged, json!(update))
                        }
                        AgentStatusEvent::SessionsCleared { session_ids } => (
                            WsEvent::AgentStatusCleared,
                            json!({ "session_ids": session_ids }),
                        ),
                        AgentStatusEvent::AttentionRaised(latch) => {
                            (WsEvent::AgentAttentionRaised, json!(latch))
                        }
                        AgentStatusEvent::AttentionCleared { stable_pane_ids } => (
                            WsEvent::AgentAttentionCleared,
                            json!({ "stable_pane_ids": stable_pane_ids }),
                        ),
                        AgentStatusEvent::AttentionSummaryUpdated(summary) => {
                            (WsEvent::AgentAttentionSummaryUpdated, json!(summary))
                        }
                        AgentStatusEvent::AttentionSummaryCleared { stable_pane_ids } => (
                            WsEvent::AgentAttentionSummaryCleared,
                            json!({ "stable_pane_ids": stable_pane_ids }),
                        ),
                    };
                    if let Err(error) = ws_manager
                        .broadcast(&WsMessage::notification(ws_event, data))
                        .await
                    {
                        warn!("Failed to broadcast agent status event: {}", error);
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(
                        "Lagged on agent status events, skipped {} messages",
                        skipped
                    );
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    })
}

fn spawn_disk_analyzer_forwarder(
    mut rx: tokio::sync::broadcast::Receiver<core_service::DiskAnalyzerScanEvent>,
    ws_manager: Arc<WsManager>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let message =
                        WsMessage::notification(WsEvent::DiskAnalyzerScanProgress, event.payload);
                    if let Err(error) = ws_manager.send_to(&event.owner_conn_id, &message).await {
                        warn!(
                            "Failed to unicast disk analyzer progress to {}: {}",
                            event.owner_conn_id, error
                        );
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(
                        "Lagged on disk analyzer events, skipped {} messages",
                        skipped
                    );
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    })
}

fn spawn_automation_forwarder(
    mut rx: tokio::sync::broadcast::Receiver<AutomationEvent>,
    ws_manager: Arc<WsManager>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if let Some(message) = automation_event_to_ws_message(event) {
                        if let Err(error) = ws_manager.broadcast(&message).await {
                            warn!("Failed to broadcast automation event: {}", error);
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!("Lagged on automation events, skipped {} messages", skipped);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    })
}

fn spawn_non_critical_startup_tasks(
    agent_service: Arc<AgentService>,
    project_service: Arc<ProjectService>,
    agent_status_service: Arc<core_service::AgentStatusService>,
    api_port: u16,
) {
    tokio::task::spawn_blocking(|| {
        infra::utils::system_skill_sync::sync_system_skills_on_startup();
    });

    tokio::task::spawn_blocking(move || {
        // Auto-install detected agent hooks (unless user uninstalled) and refresh
        // port/version for anything already installed.
        let report = core_engine::agent_hooks::sync_installed_hooks(api_port);
        let label = |status: &core_engine::agent_hooks::AgentHookToolStatus| {
            if !status.detected {
                "not_detected"
            } else if status.installed {
                if status.outdated {
                    "outdated"
                } else {
                    "installed"
                }
            } else if status.error.is_some() {
                "failed"
            } else {
                // Detected but not installed: user opted out, or install skipped.
                "opted_out_or_skipped"
            }
        };
        tracing::info!(
            "Agent hooks auto-sync: claude_code={}, codex={}, cursor={}, gemini={}, antigravity={}, factory_droid={}, kiro={}, opencode={}, ampcode={}, pi={}, hermes={}, grok_build={}",
            label(&report.claude_code),
            label(&report.codex),
            label(&report.cursor),
            label(&report.gemini),
            label(&report.antigravity),
            label(&report.factory_droid),
            label(&report.kiro),
            label(&report.opencode),
            label(&report.ampcode),
            label(&report.pi),
            label(&report.hermes),
            label(&report.grok_build),
        );
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

    tokio::spawn(async move {
        match project_service.list_projects().await {
            Ok(projects) => {
                let paths: Vec<String> = projects.into_iter().map(|p| p.main_file_path).collect();
                agent_status_service.set_known_project_paths(paths);
            }
            Err(e) => {
                warn!(
                    "Failed to load project paths for agent hook filtering: {}",
                    e
                );
            }
        }
    });
}

/// Product job id for agent-hooks idle session cleanup (APP-051).
const AGENT_HOOKS_IDLE_CLEANUP_JOB_ID: &str = "agent-hooks.idle_session_cleanup";
/// Product job id for unattended need-attention auto-summary.
const AGENT_HOOKS_ATTENTION_SUMMARY_JOB_ID: &str = "agent-hooks.attention_auto_summary";

/// Register the agent-hook session cleanup interval job (every 5 minutes).
async fn register_idle_session_cleanup_job(
    jobs: Arc<LocalScheduler>,
    agent_status_service: Arc<core_service::AgentStatusService>,
) {
    if let Err(error) = jobs
        .set_interval_job(
            JobId::new(AGENT_HOOKS_IDLE_CLEANUP_JOB_ID),
            IntervalSpec {
                every: std::time::Duration::from_secs(5 * 60),
                skip_if_running: true,
                fire_immediately: false,
            },
            RetryPolicy::none(),
            move || {
                let agent_status_service = Arc::clone(&agent_status_service);
                async move {
                    let timeouts = read_agent_hook_session_timeouts();
                    agent_status_service.clear_idle_older_than(timeouts.idle_mins);
                    // Force stuck running / permission sessions idle when hooks never
                    // reported a terminal event after interrupt or process death.
                    agent_status_service.clear_stale_active_older_than(timeouts.active_stale_mins);
                    Ok(())
                }
            },
        )
        .await
    {
        warn!(
            "Failed to register agent-hooks idle session cleanup job: {}",
            error
        );
    }
}

/// Poll sticky task-complete attention and spawn headless auto-summaries.
async fn register_attention_summary_job(
    jobs: Arc<LocalScheduler>,
    agent_status_service: Arc<core_service::AgentStatusService>,
    terminal_service: Arc<core_service::TerminalService>,
) {
    if let Err(error) = jobs
        .set_interval_job(
            JobId::new(AGENT_HOOKS_ATTENTION_SUMMARY_JOB_ID),
            IntervalSpec {
                // 30s keeps the configurable delay responsive without busy-looping.
                every: std::time::Duration::from_secs(30),
                skip_if_running: true,
                fire_immediately: false,
            },
            RetryPolicy::none(),
            move || {
                let agent_status_service = Arc::clone(&agent_status_service);
                let terminal_service = Arc::clone(&terminal_service);
                async move {
                    tick_attention_auto_summary(agent_status_service, terminal_service).await;
                    Ok(())
                }
            },
        )
        .await
    {
        warn!(
            "Failed to register agent-hooks attention auto-summary job: {}",
            error
        );
    }
}

async fn tick_attention_auto_summary(
    agent_status_service: Arc<core_service::AgentStatusService>,
    terminal_service: Arc<core_service::TerminalService>,
) {
    let settings = read_attention_summary_settings();
    if !settings.enabled {
        return;
    }
    // Bound concurrent headless summaries so one idle burst cannot spawn
    // an agent-cli process per pane in a single tick.
    const MAX_SUMMARIES_PER_TICK: usize = 3;
    let due = agent_status_service.attention_due_for_summary(settings.delay());
    for latch in due.into_iter().take(MAX_SUMMARIES_PER_TICK) {
        let Some((latch, _row, generation)) =
            agent_status_service.begin_attention_summary(&latch.stable_pane_id)
        else {
            continue;
        };
        let service = Arc::clone(&agent_status_service);
        let terminal = Arc::clone(&terminal_service);
        let settings = settings.clone();
        tokio::spawn(async move {
            match core_service::generate_attention_summary(
                &latch,
                &settings,
                Some(terminal.as_ref()),
            )
            .await
            {
                Ok(payload) => {
                    let _ = service.complete_attention_summary(
                        &latch.stable_pane_id,
                        generation,
                        payload,
                    );
                }
                Err(error) => {
                    warn!(
                        pane = %latch.stable_pane_id,
                        "Attention auto-summary failed: {error}"
                    );
                    let _ = service.fail_attention_summary(
                        &latch.stable_pane_id,
                        generation,
                        error.to_string(),
                    );
                }
            }
        });
    }
}

struct AgentStatusSessionTimeouts {
    idle_mins: u64,
    active_stale_mins: u64,
}

fn terminal_code_agent_settings_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("terminal_code_agent.json")
}

fn read_agent_hook_session_timeouts() -> AgentStatusSessionTimeouts {
    const DEFAULT_IDLE: u64 = 30;
    const DEFAULT_ACTIVE_STALE: u64 = 30;
    let path = terminal_code_agent_settings_path();
    let Ok(content) = std::fs::read_to_string(&path) else {
        return AgentStatusSessionTimeouts {
            idle_mins: DEFAULT_IDLE,
            active_stale_mins: DEFAULT_ACTIVE_STALE,
        };
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) else {
        return AgentStatusSessionTimeouts {
            idle_mins: DEFAULT_IDLE,
            active_stale_mins: DEFAULT_ACTIVE_STALE,
        };
    };
    AgentStatusSessionTimeouts {
        idle_mins: val
            .get("idle_session_timeout_mins")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_IDLE),
        active_stale_mins: val
            .get("active_session_stale_mins")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_ACTIVE_STALE),
    }
}

fn read_attention_summary_settings() -> core_service::AttentionSummarySettings {
    let path = terminal_code_agent_settings_path();
    let Ok(content) = std::fs::read_to_string(&path) else {
        return core_service::AttentionSummarySettings::default();
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) else {
        return core_service::AttentionSummarySettings::default();
    };
    core_service::AttentionSummarySettings::from_json(&val)
}

/// rustls 0.23+ requires an explicit process-wide provider before TLS (relay WSS, reqwest, etc.).
fn install_rustls_crypto_provider() {
    use rustls::crypto::CryptoProvider;
    if CryptoProvider::get_default().is_none() {
        rustls::crypto::ring::default_provider()
            .install_default()
            .expect("failed to install rustls ring CryptoProvider");
    }
}

async fn add_private_network_header(mut response: Response) -> Response {
    response.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );
    response
}

fn add_static_no_store_headers<B>(mut response: HttpResponse<B>) -> HttpResponse<B> {
    let headers = response.headers_mut();
    headers.insert(
        CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0, must-revalidate"),
    );
    headers.insert(PRAGMA, HeaderValue::from_static("no-cache"));
    headers.insert(EXPIRES, HeaderValue::from_static("0"));
    response
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    install_rustls_crypto_provider();

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

    // GUI / Electron launches often omit Homebrew and other user bin dirs from
    // PATH. Merge login-shell PATH + common bins before any CLI probes (tmux/gh/git).
    if let Err(error) = infra::utils::user_path::ensure_user_cli_path_on_startup() {
        warn!(
            "Non-critical startup task failed: user CLI PATH augmentation: {}",
            error
        );
    }
    if let Err(error) = infra::utils::atmos_cli::ensure_atmos_cli_on_startup() {
        warn!(
            "Non-critical startup task failed: Atmos CLI PATH setup: {}",
            error
        );
    }
    // Download/install of standalone CLI must not block API readiness (network can be slow).
    // Settings > About can still install/update CLI on demand; this is best-effort background ensure.
    tokio::spawn(async move {
        match runtime_manager::ensure_standalone_cli_on_startup().await {
            Ok(Some(version)) => {
                info!("Standalone Atmos CLI ready: {}", version);
            }
            Ok(None) => {
                debug!("Standalone Atmos CLI ensure finished with no version reported");
            }
            Err(error) => {
                warn!(
                    "Non-critical background task failed: standalone Atmos CLI install: {}",
                    error
                );
            }
        }
    });

    let db_connection = DbConnection::new().await?;
    info!("Database connected");

    Migrator::clean_stale_migrations(db_connection.connection()).await?;
    Migrator::up(db_connection.connection(), None).await?;
    info!("Database migrations completed");

    let db = Arc::new(db_connection.connection().clone());

    let test_engine = Arc::new(TestEngine::new());
    let message_push_service = Arc::new(MessagePushService::new());

    // Create services
    let test_service = Arc::new(TestService::new(Arc::clone(&test_engine), (*db).clone()));
    let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
    let workspace_service = Arc::new(WorkspaceService::new(Arc::clone(&db)));
    let group_service = Arc::new(GroupService::new(Arc::clone(&db)));
    let canvas_service = Arc::new(CanvasDocumentService::new());
    let review_service = Arc::new(ReviewService::new(Arc::clone(&db)));
    let agent_service = Arc::new(AgentService::new());
    let agent_service_for_startup = Arc::clone(&agent_service);

    // APP-051: process-local jobs + durable SQLite event queue for third-party triggers.
    let jobs = Arc::new(LocalScheduler::new());
    let event_queue = Arc::new(LocalPersistentQueue::new(db.as_ref().clone()).with_max_attempts(5));

    let quota_usage_service = Arc::new(QuotaUsageService::default());
    quota_usage_service.attach_jobs(Arc::clone(&jobs)).await;
    let token_usage_service = Arc::new(TokenUsageService::default());
    token_usage::import_legacy_cookie_consents();
    let terminal_service = Arc::new(TerminalService::new_with_db(Arc::clone(&db)));
    let agent_status_service = Arc::new(AgentStatusService::new());
    let agent_hooks_service = Arc::new(AgentHooksService::new(Arc::clone(&agent_status_service)));
    let notification_service = Arc::new(NotificationService::new());
    let automation_service = Arc::new(AutomationService::new(
        Arc::clone(&db),
        Arc::clone(&project_service),
        Arc::clone(&workspace_service),
        Arc::clone(&terminal_service),
        Arc::clone(&notification_service),
    ));

    // APP-015: in-memory bridge registry + pending-dispatch waiters for the
    // Canvas terminal-agent relay. Shared between WsMessageService (browser
    // uplink) and the HTTP invoke handler (CLI ingress).
    let canvas_agent_relay = Arc::new(CanvasAgentRelay::new());
    let pt_design_agent_relay = Arc::new(CanvasAgentRelay::new());

    // WsMessageService handles all WebSocket-based operations
    let ws_message_service = Arc::new(WsMessageService::new(
        Arc::clone(&project_service),
        Arc::clone(&workspace_service),
        Arc::clone(&group_service),
        Arc::clone(&terminal_service),
        Arc::clone(&agent_service),
        Arc::clone(&automation_service),
        Arc::clone(&review_service),
        Arc::clone(&quota_usage_service),
        Arc::clone(&canvas_agent_relay),
        Arc::clone(&pt_design_agent_relay),
        Arc::clone(&notification_service),
        Arc::clone(&token_usage_service),
        Arc::clone(&db),
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

    let mut server_config = ServerConfig::from_env();
    if let Some(port) = cli.port {
        server_config.port = port;
    }
    let cors = server_config.cors_layer();
    let static_cors = cors.clone();

    // Keep a reference for shutdown cleanup (must clone before moving into AppState)
    let terminal_service_shutdown = terminal_service.clone();

    // Create AppState with dependency injection
    let app_state = AppState::new(
        AppServices {
            test_service,
            project_service,
            canvas_service,
            workspace_service,
            agent_service,
            automation_service: Arc::clone(&automation_service),
            ws_message_service: ws_message_service.clone(),
            message_push_service,
            terminal_service,
            token_usage_service: Arc::clone(&token_usage_service),
            agent_status_service: Arc::clone(&agent_status_service),
            agent_hooks_service: Arc::clone(&agent_hooks_service),
            notification_service: Arc::clone(&notification_service),
            canvas_agent_relay: Arc::clone(&canvas_agent_relay),
            pt_design_agent_relay: Arc::clone(&pt_design_agent_relay),
            review_service: Arc::clone(&review_service),
        },
        server_config.port,
        Arc::clone(&event_queue),
    );

    // APP-051: GitHub events — durable queue worker (internal process + retry).
    // Startup-critical: without a worker we would ACK+persist events that never run.
    {
        let automation_for_queue = Arc::clone(&automation_service);
        event_queue
            .subscribe_worker(Topic::new(topics::AUTOMATION_GITHUB_DELIVERY), move |msg| {
                let automation_for_queue = Arc::clone(&automation_for_queue);
                async move {
                    let payload = serde_json::from_slice::<
                        crate::relay::external_events::GithubQueuePayload,
                    >(&msg.payload)
                    .map_err(|error| {
                        // Corrupt / unsupported payload will not fix itself on retry.
                        QueueError::Permanent(format!("invalid github queue payload: {error}"))
                    })?;
                    match automation_for_queue
                        .handle_external_trigger(payload.event)
                        .await
                    {
                        // Domain outcomes (accepted run or local reject) complete the event.
                        Ok(outcome) => {
                            debug!(
                                queue_event_id = %msg.id,
                                "github queue event processed: {:?}",
                                outcome
                            );
                            Ok(())
                        }
                        // Validation / not-found are permanent domain outcomes.
                        Err(error @ ServiceError::Validation(_))
                        | Err(error @ ServiceError::NotFound(_)) => Err(QueueError::Permanent(
                            format!("github delivery rejected: {error}"),
                        )),
                        // Transient / infra errors → persistent queue retries.
                        Err(error) => Err(QueueError::Handler(format!(
                            "github delivery processing failed: {error}"
                        ))),
                    }
                }
            })
            .await
            .map_err(|error| format!("failed to start github delivery queue worker: {error}"))?;
    }

    // Retention: drop succeeded/failed queue events older than 30 days.
    // fire_immediately: desktop sessions often restart before 24h elapses.
    {
        let queue_for_cleanup = Arc::clone(&event_queue);
        jobs.set_interval_job(
            JobId::new("queue.event_cleanup"),
            IntervalSpec {
                every: std::time::Duration::from_secs(24 * 60 * 60),
                skip_if_running: true,
                fire_immediately: true,
            },
            RetryPolicy::none(),
            move || {
                let queue_for_cleanup = Arc::clone(&queue_for_cleanup);
                async move {
                    let retention = std::time::Duration::from_secs(30 * 24 * 60 * 60);
                    match queue_for_cleanup.cleanup_older_than(retention).await {
                        Ok(deleted) => {
                            if deleted > 0 {
                                info!(deleted, "queue event cleanup removed old rows");
                            }
                            Ok(())
                        }
                        // RetryPolicy::none — Fatal logs once until the next daily tick.
                        Err(error) => Err(JobError::Fatal(format!(
                            "queue event cleanup failed: {error}"
                        ))),
                    }
                }
            },
        )
        .await
        .map_err(|error| format!("failed to register queue event cleanup job: {error}"))?;
    }

    // Inject WsManager into WsMessageService for server-to-client notifications
    ws_message_service
        .set_ws_manager(app_state.ws_service.manager())
        .map_err(|e| e.to_string())?;

    let ws_manager = app_state.ws_service.manager();

    agent_status_service.set_notification_service(Arc::clone(&notification_service));
    ws_message_service
        .agent_chat()
        .set_status_service(Arc::clone(&agent_status_service));
    app_state
        .terminal_service
        .set_agent_status_service(Arc::clone(&agent_status_service));

    spawn_agent_status_forwarder(
        agent_status_service.subscribe_events(),
        Arc::clone(&ws_manager),
    );

    spawn_automation_forwarder(
        automation_service.subscribe_events(),
        Arc::clone(&ws_manager),
    );
    Arc::clone(&automation_service)
        .start_scheduler(Arc::clone(&jobs))
        .await;

    spawn_disk_analyzer_forwarder(
        ws_message_service
            .disk_analyzer_service()
            .subscribe_events(),
        Arc::clone(&ws_manager),
    );

    spawn_ws_forwarder(
        ws_message_service
            .local_services_service()
            .subscribe_updates(),
        Arc::clone(&ws_manager),
        WsEvent::LocalServicesUpdated,
        "local services",
    );
    ws_message_service
        .local_services_service()
        .start_auto_refresh(Arc::clone(&jobs))
        .await;

    spawn_ws_forwarder(
        notification_service.subscribe_client_notifications(),
        Arc::clone(&ws_manager),
        WsEvent::AgentNotification,
        "agent notification",
    );

    spawn_ws_forwarder(
        quota_usage_service.subscribe_updates(),
        Arc::clone(&ws_manager),
        WsEvent::QuotaOverviewUpdated,
        "usage overview",
    );

    spawn_ws_forwarder(
        token_usage_service.subscribe_updates(),
        Arc::clone(&ws_manager),
        WsEvent::TokenUsageUpdated,
        "token usage",
    );

    // No app-level heartbeat monitor: WebSocket protocol-level PING/PONG handles
    // liveness for daemon ↔ relay (see `relay/ingest.rs`); local browser ↔ apps/api
    // runs over loopback which never silently stalls.

    if std::env::var("ATMOS_RELAY_DISABLE").unwrap_or_default() != "1" {
        if let Err(err) = relay::try_consume_register_token().await {
            warn!(target: "atmos_relay", error = %err, "register token consumption failed");
        }

        if let Err(err) = app_state
            .relay_supervisor
            .start_if_identity_on_disk(app_state.clone())
            .await
        {
            warn!(
                target: "atmos_relay",
                error = %err,
                "relay supervisor could not start from disk identity",
            );
        }
    }

    let token = server_config.local_api_token.clone();
    let token_for_destructive = server_config.local_api_token.clone();
    let allow_lan_without_token = server_config.allow_lan_without_token;

    let protected = api::routes().route_layer(from_fn(move |ci, headers, req, next| {
        require_local_token(
            ci,
            headers,
            req,
            next,
            token.clone(),
            allow_lan_without_token,
        )
    }));

    let destructive =
        api::destructive_system_routes().route_layer(from_fn(move |ci, headers, req, next| {
            require_loopback_or_token(ci, headers, req, next, token_for_destructive.clone())
        }));

    let project_service_for_startup = Arc::clone(&app_state.project_service);
    let agent_status_for_startup = Arc::clone(&app_state.agent_status_service);
    let terminal_service_for_startup = Arc::clone(&app_state.terminal_service);

    // Outermost layer: a WebSocket handshake bypasses CORS entirely, so untrusted
    // browser origins have to be rejected before routing reaches /ws.
    let origin_guard_config = Arc::new(server_config.clone());

    let mut app = Router::new()
        .route("/healthz", get(|| async { StatusCode::OK }))
        .merge(destructive)
        .merge(protected)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(map_response(add_private_network_header))
        .layer(cors)
        .layer(from_fn(move |headers, req, next| {
            require_allowed_origin(headers, req, next, origin_guard_config.clone())
        }));

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
            let serve_static = ServiceBuilder::new()
                .layer(static_cors)
                .map_response(add_static_no_store_headers)
                .service(serve_dir);
            app = app.fallback_service(serve_static);
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

    let manifest = runtime_manager::RuntimeManifest::new(
        &server_config.host,
        actual_addr.port(),
        Some(std::process::id()),
        "api",
    );
    match runtime_manager::write_runtime_manifest(&manifest) {
        Ok(path) => info!(
            target: "atmos_runtime",
            path = %path.display(),
            url = %manifest.api.url,
            "wrote runtime manifest"
        ),
        Err(err) => warn!(
            target: "atmos_runtime",
            error = %err,
            "failed to write runtime manifest"
        ),
    }
    spawn_non_critical_startup_tasks(
        agent_service_for_startup,
        project_service_for_startup,
        Arc::clone(&agent_status_for_startup),
        actual_addr.port(),
    );
    register_idle_session_cleanup_job(Arc::clone(&jobs), Arc::clone(&agent_status_for_startup))
        .await;
    register_attention_summary_job(
        Arc::clone(&jobs),
        agent_status_for_startup,
        terminal_service_for_startup,
    )
    .await;

    // Serve with graceful shutdown — ensures PTY resources are cleaned up
    // when the process receives SIGTERM/SIGINT (e.g., during hot-reload).
    // Without this, each restart leaks PTY devices until the system runs out.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    // Graceful shutdown: stop jobs/queue, then clean up terminal sessions / PTY resources.
    info!("Shutdown signal received, cleaning up jobs, queue, and terminal sessions...");
    if let Err(err) = jobs.shutdown().await {
        warn!(error = %err, "jobs shutdown failed");
    }
    if let Err(err) = event_queue.shutdown().await {
        warn!(error = %err, "event queue shutdown failed");
    }
    if let Err(err) = runtime_manager::remove_runtime_manifest() {
        warn!(target: "atmos_runtime", error = %err, "failed to remove runtime manifest");
    }
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
