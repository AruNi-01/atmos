use std::fs;
use std::sync::Arc;

use clap::{Args, Subcommand};
use core_service::service::review::{
    AddReviewMessageInput, CreateReviewFixRunInput, UpdateReviewThreadStatusInput,
};
use core_service::ReviewService;
use serde_json::Value;

pub async fn execute(service: Arc<ReviewService>, command: ReviewCommand) -> Result<Value, String> {
    match command {
        ReviewCommand::SessionList(args) => service
            .list_sessions_by_workspace(args.workspace, args.include_archived)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::SessionShow(args) => service
            .get_session(args.session)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::ThreadList(args) => service
            .list_threads(args.session, args.revision)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::ThreadContext(args) => service
            .get_thread_context(args.thread)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::ReplyThread(args) => {
            let body = fs::read_to_string(&args.body_file)
                .map_err(|error| format!("Failed to read {}: {}", args.body_file, error))?;
            service
                .create_message(AddReviewMessageInput {
                    thread_guid: args.thread,
                    author_type: args.author,
                    kind: args.kind,
                    body,
                    fix_run_guid: args.run,
                })
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::UpdateThreadStatus(args) => {
            let thread_guid = args.thread.clone();
            let status = args.status.clone();
            service
                .update_thread_status(UpdateReviewThreadStatusInput {
                    thread_guid,
                    status: status.clone(),
                })
                .await
                .map_err(|error| error.to_string())?;
            Ok(serde_json::json!({
                "ok": true,
                "thread_guid": args.thread,
                "status": status,
            }))
        }
        ReviewCommand::CreateFixRun(args) => service
            .create_fix_run(CreateReviewFixRunInput {
                session_guid: args.session,
                base_revision_guid: args.base_revision,
                execution_mode: args.execution_mode,
                selected_thread_guids: args.thread,
                created_by: args.created_by,
            })
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::SummarizeRun(args) => {
            let body = fs::read_to_string(&args.body_file)
                .map_err(|error| format!("Failed to read {}: {}", args.body_file, error))?;
            service
                .write_run_summary(args.run, body)
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::FinalizeRun(args) => service
            .finalize_fix_run(args.run, args.title)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
    }
}

#[derive(Debug, Subcommand)]
pub enum ReviewCommand {
    SessionList(SessionListArgs),
    SessionShow(SessionShowArgs),
    ThreadList(ThreadListArgs),
    ThreadContext(ThreadContextArgs),
    ReplyThread(ReplyThreadArgs),
    UpdateThreadStatus(UpdateThreadStatusArgs),
    CreateFixRun(CreateFixRunArgs),
    SummarizeRun(SummarizeRunArgs),
    FinalizeRun(FinalizeRunArgs),
}

#[derive(Debug, Args)]
pub struct SessionListArgs {
    #[arg(long)]
    pub workspace: String,
    #[arg(long, default_value_t = false)]
    pub include_archived: bool,
}

#[derive(Debug, Args)]
pub struct SessionShowArgs {
    #[arg(long)]
    pub session: String,
}

#[derive(Debug, Args)]
pub struct ThreadListArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long)]
    pub revision: Option<String>,
}

#[derive(Debug, Args)]
pub struct ThreadContextArgs {
    #[arg(long)]
    pub thread: String,
}

#[derive(Debug, Args)]
pub struct ReplyThreadArgs {
    #[arg(long)]
    pub thread: String,
    #[arg(long)]
    pub body_file: String,
    #[arg(long)]
    pub run: Option<String>,
    #[arg(long, default_value = "agent")]
    pub author: String,
    #[arg(long, default_value = "reply")]
    pub kind: String,
}

#[derive(Debug, Args)]
pub struct UpdateThreadStatusArgs {
    #[arg(long)]
    pub thread: String,
    #[arg(long)]
    pub status: String,
}

#[derive(Debug, Args)]
pub struct CreateFixRunArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long)]
    pub base_revision: String,
    #[arg(long, default_value = "copy_prompt")]
    pub execution_mode: String,
    #[arg(long = "thread")]
    pub thread: Vec<String>,
    #[arg(long)]
    pub created_by: Option<String>,
}

#[derive(Debug, Args)]
pub struct SummarizeRunArgs {
    #[arg(long)]
    pub run: String,
    #[arg(long)]
    pub body_file: String,
}

#[derive(Debug, Args)]
pub struct FinalizeRunArgs {
    #[arg(long)]
    pub run: String,
    #[arg(long)]
    pub title: Option<String>,
}
