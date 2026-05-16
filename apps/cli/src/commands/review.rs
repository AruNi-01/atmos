use std::fs;
use std::io::{self, Read};

use clap::{Args, Subcommand};
use reqwest::Method;
use serde_json::{json, Value};

use crate::api_client::{request_json, ApiClientArgs};

pub async fn execute(api: ApiClientArgs, command: ReviewCommand) -> Result<Value, String> {
    match command {
        ReviewCommand::SessionList(args) => {
            let SessionListArgs {
                workspace,
                project,
                include_archived,
            } = args;
            let has_workspace = workspace
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty());
            let has_project = project
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty());
            if has_workspace == has_project {
                return Err(
                    "session-list requires exactly one of --workspace or --project".into(),
                );
            }
            let mut query = Vec::new();
            if let Some(w) = workspace {
                query.push(("workspace_guid", w));
            }
            if let Some(p) = project {
                query.push(("project_guid", p));
            }
            if include_archived {
                query.push(("include_archived", "true".to_string()));
            }
            request_json(
                &api,
                Method::GET,
                "/api/review/sessions",
                Some(&query),
                None,
            )
            .await
        }
        ReviewCommand::SessionShow(args) => {
            request_json(
                &api,
                Method::GET,
                &format!("/api/review/sessions/{}", args.session),
                None,
                None,
            )
            .await
        }
        ReviewCommand::CommentList(args) => {
            let mut query = vec![("session_guid", args.session)];
            if let Some(revision) = args.revision {
                query.push(("revision_guid", revision));
            }
            request_json(
                &api,
                Method::GET,
                "/api/review/comments",
                Some(&query),
                None,
            )
            .await
        }
        ReviewCommand::CommentContext(args) => {
            request_json(
                &api,
                Method::GET,
                &format!(
                    "/api/review/comments/{}/context",
                    args.comment
                ),
                None,
                None,
            )
            .await
        }
        ReviewCommand::ReplyComment(args) => {
            let body = read_required_body_input(
                "reply body",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            request_json(
                &api,
                Method::POST,
                &format!("/api/review/comments/{}/messages", args.comment),
                None,
                Some(json!({
                    "body": body,
                    "author_type": args.author,
                    "kind": args.kind,
                    "agent_run_guid": args.run,
                })),
            )
            .await
        }
        ReviewCommand::CreateComment(args) => {
            let body = read_required_body_input(
                "comment body",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            request_json(
                &api,
                Method::POST,
                "/api/review/comments",
                None,
                Some(json!({
                    "session_guid": args.session,
                    "revision_guid": args.revision,
                    "file_path": args.file,
                    "side": args.side,
                    "start_line": args.start_line,
                    "end_line": args.end_line,
                    "body": body,
                    "title": args.title,
                    "author_type": args.author,
                    "agent_run_guid": args.run,
                })),
            )
            .await
        }
        ReviewCommand::UpdateCommentStatus(args) => {
            request_json(
                &api,
                Method::PATCH,
                &format!("/api/review/comments/{}", args.comment),
                None,
                Some(json!({ "status": args.status })),
            )
            .await
        }
        ReviewCommand::CreateAgentRun(args) => {
            request_json(
                &api,
                Method::POST,
                "/api/review/agent-runs",
                None,
                Some(json!({
                    "session_guid": args.session,
                    "base_revision_guid": args.base_revision,
                    "run_kind": args.run_kind,
                    "execution_mode": args.execution_mode,
                    "skill_id": args.skill_id,
                    "selected_comment_guids": args.comment,
                    "created_by": args.created_by,
                })),
            )
            .await
        }
        ReviewCommand::SummarizeRun(args) => {
            let body = read_required_body_input(
                "run summary",
                args.body.as_deref(),
                args.body_file.as_deref(),
                args.body_stdin,
            )?;
            request_json(
                &api,
                Method::POST,
                &format!("/api/review/agent-runs/{}/summary", args.run),
                None,
                Some(json!({ "body": body })),
            )
            .await
        }
        ReviewCommand::FinalizeRun(args) => {
            let summary = read_optional_body_input(
                "run summary",
                args.summary.as_deref(),
                args.summary_file.as_deref(),
                args.summary_stdin,
            )?;
            request_json(
                &api,
                Method::POST,
                &format!("/api/review/agent-runs/{}/finalize", args.run),
                None,
                Some(json!({
                    "title": args.title,
                    "summary": summary,
                })),
            )
            .await
        }
        ReviewCommand::SetStatus(args) => {
            let summary = read_optional_body_input(
                "run summary",
                args.summary.as_deref(),
                args.summary_file.as_deref(),
                args.summary_stdin,
            )?;
            request_json(
                &api,
                Method::POST,
                &format!("/api/review/agent-runs/{}/status", args.run),
                None,
                Some(json!({
                    "status": args.status,
                    "message": args.message,
                    "title": args.title,
                    "summary": summary,
                })),
            )
            .await
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
    /// List review sessions for a workspace or project.
    SessionList(SessionListArgs),
    /// Show one review session by id.
    SessionShow(SessionShowArgs),
    /// List comments in a review session.
    CommentList(CommentListArgs),
    /// Fetch file context around a review comment.
    CommentContext(CommentContextArgs),
    /// Post a reply to a review comment.
    ReplyComment(ReplyCommentArgs),
    /// Update the status of a review comment.
    UpdateCommentStatus(UpdateCommentStatusArgs),
    /// Create a new review comment.
    CreateComment(CreateCommentArgs),
    /// Start a review agent run.
    CreateAgentRun(CreateAgentRunArgs),
    /// Summarize a review agent run.
    SummarizeRun(SummarizeRunArgs),
    /// Finalize a review agent run.
    FinalizeRun(FinalizeRunArgs),
    /// Set the status of a review session.
    SetStatus(SetStatusArgs),
}

#[derive(Debug, Args)]
#[group(id = "target", required = true)]
#[command(
    after_help = "Pass exactly one of --workspace <workspace_guid> or --project <project_guid>.\n\nTargets the Atmos API (see --api-url, ATMOS_API_URL, ~/.atmos/runtime_manifest.json)."
)]
pub struct SessionListArgs {
    #[arg(long, group = "target")]
    pub workspace: Option<String>,
    #[arg(long, group = "target")]
    pub project: Option<String>,
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
