use std::fs;
use std::io::{self, Read};
use std::sync::Arc;

use clap::{Args, Subcommand};
use core_service::service::review::{
    AddReviewMessageInput, CreateReviewAgentRunInput, CreateReviewCommentByFilePathInput, SetReviewAgentRunStatusInput,
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
            let body = read_required_body_input(
                "reply body",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            service
                .create_message(AddReviewMessageInput {
                    comment_guid: args.comment,
                    author_type: args.author,
                    kind: args.kind,
                    body,
                    agent_run_guid: args.run,
                })
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::CreateComment(args) => {
            let body = read_required_body_input(
                "comment body",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            service
                .create_comment_by_file_path(CreateReviewCommentByFilePathInput {
                    session_guid: args.session,
                    revision_guid: args.revision,
                    file_path: args.file,
                    side: args.side,
                    start_line: args.start_line,
                    end_line: args.end_line,
                    body,
                    title: args.title,
                    author_type: args.author,
                    agent_run_guid: args.run,
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
        ReviewCommand::CreateAgentRun(args) => service
            .create_agent_run(CreateReviewAgentRunInput {
                session_guid: args.session,
                base_revision_guid: args.base_revision,
                run_kind: args.run_kind,
                execution_mode: args.execution_mode,
                skill_id: args.skill_id,
                selected_comment_guids: args.comment,
                created_by: args.created_by,
            })
            .await
            .map(serde_json::to_value)
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string()),
        ReviewCommand::SummarizeRun(args) => {
            let body = read_required_body_input(
                "run summary",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            service
                .write_run_summary(args.run, body)
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::FinalizeRun(args) => {
            if let Some(summary) = read_optional_body_input(
                "run summary",
                args.summary.as_deref(),
                args.summary_file.as_deref(),
                args.summary_stdin,
            )? {
                service
                    .write_run_summary(args.run.clone(), summary)
                    .await
                    .map_err(|error| error.to_string())?;
            }
            service
                .finalize_agent_run(args.run, args.title)
                .await
                .map(serde_json::to_value)
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        }
        ReviewCommand::SetStatus(args) => {
            let summary = read_optional_body_input(
                "run summary",
                args.summary.as_deref(),
                args.summary_file.as_deref(),
                args.summary_stdin,
            )?;
            service
                .set_agent_run_status(SetReviewAgentRunStatusInput {
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
    if path == "-" {
        return read_stdin();
    }
    fs::read_to_string(path).map_err(|error| format!("Failed to read {}: {}", path, error))
}

fn read_stdin() -> Result<String, String> {
    let mut body = String::new();
    io::stdin()
        .read_to_string(&mut body)
        .map_err(|error| format!("Failed to read stdin: {}", error))?;
    Ok(body)
}

fn read_required_body_input(
    label: &str,
    inline: Option<&str>,
    file: Option<&str>,
    stdin: bool,
) -> Result<String, String> {
    read_optional_body_input(label, inline, file, stdin)?
        .ok_or_else(|| format!("Missing {label}: pass inline text, a file, or stdin"))
}

fn read_optional_body_input(
    label: &str,
    inline: Option<&str>,
    file: Option<&str>,
    stdin: bool,
) -> Result<Option<String>, String> {
    let provided = usize::from(inline.is_some()) + usize::from(file.is_some()) + usize::from(stdin);
    if provided > 1 {
        return Err(format!(
            "Multiple {label} inputs provided; use only one of inline text, file, or stdin"
        ));
    }
    if let Some(value) = inline {
        return Ok(Some(value.to_string()));
    }
    if let Some(path) = file {
        return read_body_file(path).map(Some);
    }
    if stdin {
        return read_stdin().map(Some);
    }
    Ok(None)
}

#[derive(Debug, Subcommand)]
pub enum ReviewCommand {
    SessionList(SessionListArgs),
    SessionShow(SessionShowArgs),
    CommentList(CommentListArgs),
    CommentContext(CommentContextArgs),
    ReplyComment(ReplyCommentArgs),
    UpdateCommentStatus(UpdateCommentStatusArgs),
    CreateComment(CreateCommentArgs),
    CreateAgentRun(CreateAgentRunArgs),
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
    pub body: Option<String>,
    #[arg(long)]
    pub body_file: Option<String>,
    #[arg(long)]
    pub body_stdin: bool,
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
pub struct CreateCommentArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long)]
    pub revision: String,
    #[arg(long)]
    pub file: String,
    #[arg(long)]
    pub side: String,
    #[arg(long)]
    pub start_line: i32,
    #[arg(long)]
    pub end_line: i32,
    #[arg(long)]
    pub body: Option<String>,
    #[arg(long)]
    pub body_file: Option<String>,
    #[arg(long)]
    pub body_stdin: bool,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long, default_value = "agent")]
    pub author: String,
    #[arg(long)]
    pub run: Option<String>,
}

#[derive(Debug, Args)]
pub struct CreateAgentRunArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long)]
    pub base_revision: String,
    #[arg(long)]
    pub run_kind: String,
    #[arg(long, default_value = "copy_prompt")]
    pub execution_mode: String,
    #[arg(long)]
    pub skill_id: Option<String>,
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
    pub body: Option<String>,
    #[arg(long)]
    pub body_file: Option<String>,
    #[arg(long)]
    pub body_stdin: bool,
}

#[derive(Debug, Args)]
#[command(
    after_help = "Tip: pass --summary, --summary-file <path>, or --summary-stdin to write the run summary before finalizing."
)]
pub struct FinalizeRunArgs {
    #[arg(long)]
    pub run: String,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long)]
    pub summary: Option<String>,
    #[arg(long = "summary-file")]
    pub summary_file: Option<String>,
    #[arg(long)]
    pub summary_stdin: bool,
}

#[derive(Debug, Args)]
#[command(
    after_help = "Statuses: running, succeeded, failed. For succeeded, pass --summary, --summary-file <path>, or --summary-stdin to write the summary and finalize in one command."
)]
pub struct SetStatusArgs {
    #[arg(long)]
    pub run: String,
    pub status: String,
    #[arg(long)]
    pub message: Option<String>,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long)]
    pub summary: Option<String>,
    #[arg(long = "summary-file")]
    pub summary_file: Option<String>,
    #[arg(long)]
    pub summary_stdin: bool,
}
