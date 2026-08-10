mod api_client;
mod commands;
mod context;
mod envelope;
mod rpc;

use api_client::ApiClientArgs;
use clap::{Parser, Subcommand};
use commands::browser_use::{execute_cmd as execute_browser_use, BrowserUseCommand};
use commands::canvas::{execute as execute_canvas, CanvasCommand, CanvasOpts};
use commands::computer::{execute as execute_computer, ComputerCommand};
use commands::desktop_use::{execute as execute_desktop_use, DesktopUseCommand};
use commands::product::{
    discovery_tree, execute_actions_list, execute_call, execute_context, execute_git,
    execute_group, execute_project, execute_run, execute_settings, execute_status,
    execute_terminal, execute_workspace, ActionsListArgs, CallArgs, ContextCommand, GitCommand,
    GroupCommand, ProjectCommand, RunCommand, SettingsCommand, TerminalCommand, WorkspaceCommand,
};
use commands::review::{execute as execute_review, ReviewCommand};
use commands::runtime::{execute as execute_runtime, RuntimeCommand};
use commands::update::{execute as execute_update, update_hint_if_needed, UpdateArgs};
use envelope::{next, CliEnvelope};
use serde_json::json;

#[derive(Debug, Parser)]
#[command(
    name = "atmos",
    about = "Atmos CLI — agent-first product and host control",
    version = env!("CARGO_PKG_VERSION")
)]
struct Cli {
    #[command(flatten)]
    api: ApiClientArgs,
    #[arg(long, global = true)]
    project: Option<String>,
    #[arg(long, global = true)]
    workspace: Option<String>,
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Server health and identity
    Status,
    /// Sticky project/workspace context
    Context {
        #[command(subcommand)]
        command: ContextCommand,
    },
    /// Manage projects
    Project {
        #[command(subcommand)]
        command: ProjectCommand,
    },
    /// Manage workspaces
    Workspace {
        #[command(subcommand)]
        command: WorkspaceCommand,
    },
    /// Manage groups
    Group {
        #[command(subcommand)]
        command: GroupCommand,
    },
    /// Settings bootstrap / get / set
    Settings {
        #[command(subcommand)]
        command: SettingsCommand,
    },
    /// Terminal sessions (headless create/list/close)
    Terminal {
        #[command(subcommand)]
        command: TerminalCommand,
    },
    /// Run logs (point-in-time)
    Run {
        #[command(subcommand)]
        command: RunCommand,
    },
    /// Git operations via Atmos Server
    Git {
        #[command(subcommand)]
        command: GitCommand,
    },
    /// Escape hatch: invoke a wire WsAction by name
    Call(CallArgs),
    /// List callable wire actions
    Actions {
        #[command(subcommand)]
        command: ActionsCommand,
    },
    /// Manage code review sessions (via Atmos Server)
    Review {
        #[command(subcommand)]
        command: ReviewCommand,
    },
    /// Ensure / stop / status for the local Atmos Server
    Runtime {
        #[command(subcommand)]
        command: RuntimeCommand,
    },
    /// Drive the open Atmos Canvas from an agent
    Canvas {
        #[command(flatten)]
        canvas: CanvasOpts,
        #[command(subcommand)]
        command: CanvasCommand,
    },
    /// Register this machine on the relay (APP-016)
    Computer {
        #[command(subcommand)]
        command: ComputerCommand,
    },
    /// Local Desktop Use capture/control
    #[command(name = "desktop-use")]
    DesktopUse {
        #[command(subcommand)]
        command: DesktopUseCommand,
    },
    /// Browser Use page CDP control
    #[command(name = "browser-use")]
    BrowserUse {
        #[command(subcommand)]
        command: BrowserUseCommand,
    },
    /// Check for or install CLI updates
    Update(UpdateArgs),
}

#[derive(Debug, Subcommand)]
enum ActionsCommand {
    List(ActionsListArgs),
}

#[tokio::main]
async fn main() {
    let code = run().await;
    std::process::exit(code);
}

async fn run() -> i32 {
    let cli = Cli::parse();

    // Optional global context flags seed env for this process resolution.
    if let Some(p) = &cli.project {
        std::env::set_var("ATMOS_PROJECT", p);
    }
    if let Some(w) = &cli.workspace {
        std::env::set_var("ATMOS_WORKSPACE", w);
    }

    let envelope = match cli.command {
        None => {
            let health = crate::rpc::get_json(&cli.api, "/api/cli/health").await.ok();
            discovery_tree(health)
        }
        Some(Commands::Status) => execute_status(cli.api).await,
        Some(Commands::Context { command }) => execute_context(command),
        Some(Commands::Project { command }) => execute_project(cli.api, command).await,
        Some(Commands::Workspace { command }) => execute_workspace(cli.api, command).await,
        Some(Commands::Group { command }) => execute_group(cli.api, command).await,
        Some(Commands::Settings { command }) => execute_settings(cli.api, command).await,
        Some(Commands::Terminal { command }) => execute_terminal(cli.api, command).await,
        Some(Commands::Run { command }) => execute_run(cli.api, command).await,
        Some(Commands::Git { command }) => execute_git(cli.api, command).await,
        Some(Commands::Call(args)) => execute_call(cli.api, args).await,
        Some(Commands::Actions {
            command: ActionsCommand::List(args),
        }) => execute_actions_list(cli.api, args).await,
        Some(Commands::Review { command }) => {
            wrap_legacy("atmos review", execute_review(cli.api, command).await)
        }
        Some(Commands::Runtime { command }) => {
            wrap_legacy("atmos runtime", execute_runtime(command).await)
        }
        Some(Commands::Computer { command }) => {
            wrap_legacy("atmos computer", execute_computer(command).await)
        }
        Some(Commands::DesktopUse { command }) => {
            wrap_legacy("atmos desktop-use", execute_desktop_use(command).await)
        }
        Some(Commands::BrowserUse { command }) => {
            wrap_legacy("atmos browser-use", execute_browser_use(command).await)
        }
        Some(Commands::Canvas { canvas, command }) => wrap_legacy(
            "atmos canvas",
            execute_canvas(cli.api, canvas, command).await,
        ),
        Some(Commands::Update(args)) => wrap_legacy("atmos update", execute_update(args).await),
    };

    // Optional update hint on stderr only for host update path noise avoidance.
    if !matches!(
        // re-parse is not available; skip update hint in JSON-always mode except stderr after success
        false, true
    ) {
        // no-op placeholder
    }
    let _ = update_hint_if_needed().await;

    envelope.print_and_exit_code()
}

fn wrap_legacy(command: &str, result: Result<serde_json::Value, String>) -> CliEnvelope {
    match result {
        Ok(value) => CliEnvelope::success(
            command,
            value,
            vec![next("atmos status", "Check server health")],
        ),
        Err(err) => {
            let lower = err.to_lowercase();
            if lower.contains("401") || lower.contains("unauthorized") {
                return crate::rpc::RpcError::Unauthorized(err).to_envelope(command);
            }
            if lower.contains("connect")
                || lower.contains("refused")
                || lower.contains("resolve")
                || lower.contains("failed to")
                    && (lower.contains("url") || lower.contains("manifest"))
            {
                return crate::rpc::RpcError::Unreachable(err).to_envelope(command);
            }
            CliEnvelope::failure(
                command,
                "ACTION_FAILED",
                err,
                "Inspect the error and retry",
                vec![next("atmos status", "Check server health")],
            )
        }
    }
}

// silence unused json import in some builds
#[allow(dead_code)]
fn _json_use() {
    let _ = json!({});
}
