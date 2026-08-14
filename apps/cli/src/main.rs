mod api_client;
mod commands;
mod output;

use api_client::ApiClientArgs;
use clap::{Parser, Subcommand};
use commands::browser_use::{execute_cmd as execute_browser_use, BrowserUseCommand};
use commands::canvas::{execute as execute_canvas, CanvasCommand, CanvasOpts};
use commands::computer::{execute as execute_computer, ComputerCommand};
use commands::desktop_use::{execute as execute_desktop_use, DesktopUseCommand};
use commands::review::{execute as execute_review, ReviewCommand};
use commands::runtime::{execute as execute_runtime, RuntimeCommand};
use commands::update::{execute as execute_update, update_hint_if_needed, UpdateArgs};
use output::{render_error, render_output, CommandKind};

#[derive(Debug, Parser)]
#[command(
    name = "atmos",
    about = "ATMOS command-line interface",
    version = env!("CARGO_PKG_VERSION")
)]
struct Cli {
    #[command(flatten)]
    api: ApiClientArgs,
    /// Print machine-readable JSON output.
    #[arg(long, global = true, default_value_t = false)]
    json: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Manage code review sessions, comments, and agent runs (via Atmos Server).
    Review {
        #[command(subcommand)]
        command: ReviewCommand,
    },
    /// Ensure / stop / status for the local Atmos Server (`runtime_manifest.json`).
    Runtime {
        #[command(subcommand)]
        command: RuntimeCommand,
    },
    /// Drive the open Atmos Canvas from an agent.
    Canvas {
        #[command(flatten)]
        canvas: CanvasOpts,
        #[command(subcommand)]
        command: CanvasCommand,
    },
    /// Register this machine on the relay and run it as a remote Computer (APP-016).
    Computer {
        #[command(subcommand)]
        command: ComputerCommand,
    },
    /// Local Desktop Use: capture and optional desktop control (not Atmos Computer / Relay).
    #[command(name = "desktop-use")]
    DesktopUse {
        #[command(subcommand)]
        command: DesktopUseCommand,
    },
    /// Browser Use: page CDP control (separate from Desktop Use; no MCP).
    #[command(name = "browser-use")]
    BrowserUse {
        #[command(subcommand)]
        command: BrowserUseCommand,
    },
    /// Check for or install CLI updates.
    Update(UpdateArgs),
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("{}", render_error(&err));
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let cli = Cli::parse();
    let should_check_for_updates = !matches!(cli.command, Commands::Update(_));
    let command_kind = CommandKind::from_command(&cli.command);
    let is_browser_use = matches!(cli.command, Commands::BrowserUse { .. });

    let output = match cli.command {
        Commands::Review { command } => execute_review(cli.api, command).await,
        Commands::Runtime { command } => execute_runtime(command).await,
        Commands::Computer { command } => execute_computer(command).await,
        Commands::DesktopUse { command } => execute_desktop_use(command).await,
        Commands::BrowserUse { command } => execute_browser_use(command).await,
        Commands::Canvas { canvas, command } => execute_canvas(cli.api, canvas, command).await,
        Commands::Update(args) => execute_update(args).await,
    }
    .map_err(|err| err.to_string())?;

    if cli.json || !command_kind.supports_human_output() {
        println!(
            "{}",
            serde_json::to_string_pretty(&output)
                .map_err(|err| format!("Failed to serialize command output: {err}"))?
        );
    } else if let Some(rendered) = render_output(command_kind, &output) {
        println!("{rendered}");
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(&output)
                .map_err(|err| format!("Failed to serialize command output: {err}"))?
        );
    }

    if should_check_for_updates {
        if let Some(hint) = update_hint_if_needed().await {
            eprintln!("{}", hint);
        }
    }

    // Print JSON first, then fail the process so agents still see the structured error.
    if is_browser_use && output.get("ok") == Some(&serde_json::Value::Bool(false)) {
        std::process::exit(1);
    }
    Ok(())
}
