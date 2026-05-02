use std::fs;
use std::sync::Arc;

use clap::{Args, Subcommand};
use core_service::service::review::{
    AddReviewMessageInput, CreateReviewFixRunInput, SetReviewFixRunStatusInput,
    UpdateReviewCommentStatusInput,
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
        ReviewCommand::CommentList(args) => service
            .list_comments(args.session, args.revision)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::CommentContext(args) => service
            .get_comment_context(args.comment)
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::ReplyComment(args) => {
            let body = fs::read_to_string(&args.body_file)
                .map_err(|error| format!("Failed to read {}: {}", args.body_file, error))?;
            service
                .create_message(AddReviewMessageInput {
                    comment_guid: args.comment,
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
        ReviewCommand::UpdateCommentStatus(args) => {
            let comment_guid = args.comment.clone();
            let status = args.status.clone();
            service
                .update_comment_status(UpdateReviewCommentStatusInput {
                    comment_guid,
                    status: status.clone(),
                })
                .await
                .map_err(|error| error.to_string())?;
            Ok(serde_json::json!({
                "ok": true,
                "comment_guid": args.comment,
                "status": status,
            }))
        }
        ReviewCommand::CreateFixRun(args) => service
            .create_fix_run(CreateReviewFixRunInput {
                session_guid: args.session,
                base_revision_guid: args.base_revision,
                execution_mode: args.execution_mode,
                selected_comment_guids: args.comment,
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
        ReviewCommand::FinalizeRun(args) => {
            if let Some(summary) = read_optional_body_file(args.summary_file.as_deref())? {
                service
                    .write_run_summary(args.run.clone(), summary)
                    .await
                    .map_err(|error| error.to_string())?;
            }
            service
                .finalize_fix_run(args.run, args.title)
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::SetStatus(args) => {
            let summary = read_optional_body_file(args.summary_file.as_deref())?;
            service
                .set_fix_run_status(SetReviewFixRunStatusInput {
                    run_guid: args.run,
                    status: args.status,
                    message: args.message,
                    title: args.title,
                    summary,
                })
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
    }
}

fn read_body_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Failed to read {}: {}", path, error))
}

fn read_optional_body_file(path: Option<&str>) -> Result<Option<String>, String> {
    path.map(read_body_file).transpose()
}

#[derive(Debug, Subcommand)]
pub enum ReviewCommand {
    SessionList(SessionListArgs),
    SessionShow(SessionShowArgs),
    CommentList(CommentListArgs),
    CommentContext(CommentContextArgs),
    ReplyComment(ReplyCommentArgs),
    UpdateCommentStatus(UpdateCommentStatusArgs),
    CreateFixRun(CreateFixRunArgs),
    SummarizeRun(SummarizeRunArgs),
    FinalizeRun(FinalizeRunArgs),
    SetStatus(SetStatusArgs),
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
pub struct CommentListArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long)]
    pub revision: Option<String>,
}

#[derive(Debug, Args)]
pub struct CommentContextArgs {
    #[arg(long)]
    pub comment: String,
}

#[derive(Debug, Args)]
pub struct ReplyCommentArgs {
    #[arg(long)]
    pub comment: String,
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
pub struct UpdateCommentStatusArgs {
    #[arg(long)]
    pub comment: String,
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
    #[arg(long = "comment")]
    pub comment: Vec<String>,
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
#[command(
    after_help = "Tip: pass --summary-file <path> to write the run summary before finalizing. --summary is accepted as an alias."
)]
pub struct FinalizeRunArgs {
    #[arg(long)]
    pub run: String,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long = "summary-file", alias = "summary")]
    pub summary_file: Option<String>,
}

#[derive(Debug, Args)]
#[command(
    after_help = "Statuses: running, succeeded, failed. For succeeded, pass --summary-file <path> to write the summary and finalize in one command. --summary is accepted as an alias."
)]
pub struct SetStatusArgs {
    #[arg(long)]
    pub run: String,
    pub status: String,
    #[arg(long)]
    pub message: Option<String>,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long = "summary-file", alias = "summary")]
    pub summary_file: Option<String>,
}
