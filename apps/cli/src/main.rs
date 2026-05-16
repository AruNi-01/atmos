mod api_client;
mod commands;

use clap::{Parser, Subcommand};
use api_client::ApiClientArgs;
use commands::canvas::{execute as execute_canvas, CanvasCommand, CanvasOpts};
use commands::computer::{execute as execute_computer, ComputerCommand};
use commands::local::{execute as execute_local, LocalCommand};
use commands::runtime::{execute as execute_runtime, RuntimeCommand};
use commands::review::{execute as execute_review, ReviewCommand};
use commands::update::{execute as execute_update, update_hint_if_needed, UpdateArgs};

#[derive(Debug, Parser)]
#[command(
    name = "atmos",
    about = "ATMOS command-line interface",
    version = env!("CARGO_PKG_VERSION")
)]
struct Cli {
    #[command(flatten)]
    api: ApiClientArgs,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Manage code review sessions, comments, and agent runs (via the Atmos API).
    Review {
        #[command(subcommand)]
        command: ReviewCommand,
    },
    /// Start, stop, and inspect the local Atmos API runtime.
    Local {
        #[command(subcommand)]
        command: LocalCommand,
    },
    /// Ensure / stop / status for the local API (`runtime_manifest.json`).
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
    /// Check for or install CLI updates.
    Update(UpdateArgs),
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let should_check_for_updates = !matches!(cli.command, Commands::Update(_));

    let output = match cli.command {
        Commands::Review { command } => execute_review(cli.api, command).await,
        Commands::Local { command } => execute_local(command).await,
        Commands::Runtime { command } => execute_runtime(command).await,
        Commands::Computer { command } => execute_computer(command).await,
        Commands::Canvas { canvas, command } => execute_canvas(cli.api, canvas, command).await,
        Commands::Update(args) => execute_update(args).await,
    }
    .map_err(std::io::Error::other)?;

    println!("{}", serde_json::to_string_pretty(&output)?);
    if should_check_for_updates {
        if let Some(hint) = update_hint_if_needed().await {
            eprintln!("{}", hint);
        }
    }
    Ok(())
}
