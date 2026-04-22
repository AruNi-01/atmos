mod commands;

use std::sync::Arc;

use clap::{Parser, Subcommand};
use commands::local::{execute as execute_local, LocalCommand};
use commands::review::{execute as execute_review, ReviewCommand};
use core_service::ReviewService;
use infra::{DbConnection, Migrator};
use infra::db::migration::MigratorTrait;

#[derive(Debug, Parser)]
#[command(name = "atmos", about = "ATMOS command-line interface")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Review {
        #[command(subcommand)]
        command: ReviewCommand,
    },
    Local {
        #[command(subcommand)]
        command: LocalCommand,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let output = match cli.command {
        Commands::Review { command } => {
            let db_connection = DbConnection::new().await?;
            Migrator::clean_stale_migrations(db_connection.connection()).await?;
            Migrator::up(db_connection.connection(), None).await?;
            let db = Arc::new(db_connection.connection().clone());
            let review_service = Arc::new(ReviewService::new(Arc::clone(&db)));
            execute_review(review_service, command).await
        }
        Commands::Local { command } => execute_local(command).await,
    }
    .map_err(std::io::Error::other)?;

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
