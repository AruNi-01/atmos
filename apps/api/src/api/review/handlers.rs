//! REST surface for code review — shared by CLI, agents, and future clients.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use core_service::service::review::{
    AddReviewMessageInput, CreateReviewAgentRunInput, CreateReviewCommentByFilePathInput,
    SetReviewAgentRunStatusInput, UpdateReviewCommentStatusInput,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    api::dto::ApiResponse,
    app_state::AppState,
    error::{ApiError, ApiResult},
};

#[derive(Debug, Deserialize)]
pub struct SessionListQuery {
    #[serde(alias = "workspace")]
    pub workspace_guid: Option<String>,
    #[serde(alias = "project")]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Debug, Deserialize)]
pub struct CommentListQuery {
    #[serde(alias = "session")]
    pub session_guid: String,
    #[serde(alias = "revision")]
    pub revision_guid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddMessageBody {
    pub body: String,
    #[serde(default = "default_author_type")]
    pub author_type: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub agent_run_guid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCommentStatusBody {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct SummarizeRunBody {
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct FinalizeRunBody {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
}

fn default_author_type() -> String {
    "agent".to_string()
}

fn default_kind() -> String {
    "reply".to_string()
}

fn parse_session_target(
    workspace_guid: Option<String>,
    project_guid: Option<String>,
) -> Result<(Option<String>, Option<String>), ApiError> {
    match (workspace_guid, project_guid) {
        (Some(_), Some(_)) => Err(ApiError::BadRequest(
            "Specify exactly one of workspace_guid or project_guid".into(),
        )),
        (None, None) => Err(ApiError::BadRequest(
            "workspace_guid or project_guid is required".into(),
        )),
        other => Ok(other),
    }
}

pub async fn list_sessions(
    State(state): State<AppState>,
    Query(query): Query<SessionListQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let (workspace_guid, project_guid) =
        parse_session_target(query.workspace_guid, query.project_guid)?;
    let data = match (workspace_guid, project_guid) {
        (Some(workspace_guid), None) => {
            state
                .review_service
                .list_sessions_by_workspace(workspace_guid, query.include_archived)
                .await?
        }
        (None, Some(project_guid)) => {
            state
                .review_service
                .list_sessions_by_project(project_guid, query.include_archived)
                .await?
        }
        _ => unreachable!(),
    };
    Ok(Json(ApiResponse::success(json!(data))))
}

pub async fn get_session(
    State(state): State<AppState>,
    Path(session_guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session = state.review_service.get_session(session_guid).await?;
    Ok(Json(ApiResponse::success(json!(session))))
}

pub async fn list_comments(
    State(state): State<AppState>,
    Query(query): Query<CommentListQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let comments = state
        .review_service
        .list_comments(query.session_guid, query.revision_guid)
        .await?;
    Ok(Json(ApiResponse::success(json!(comments))))
}

pub async fn get_comment_context(
    State(state): State<AppState>,
    Path(comment_guid): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let context = state
        .review_service
        .get_comment_context(comment_guid)
        .await?;
    Ok(Json(ApiResponse::success(json!(context))))
}

pub async fn create_comment(
    State(state): State<AppState>,
    Json(input): Json<CreateReviewCommentByFilePathInput>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let comment = state
        .review_service
        .create_comment_by_file_path(input)
        .await?;
    Ok(Json(ApiResponse::success(json!(comment))))
}

pub async fn add_message(
    State(state): State<AppState>,
    Path(comment_guid): Path<String>,
    Json(body): Json<AddMessageBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let message = state
        .review_service
        .create_message(AddReviewMessageInput {
            comment_guid,
            author_type: body.author_type,
            kind: body.kind,
            body: body.body,
            agent_run_guid: body.agent_run_guid,
        })
        .await?;
    Ok(Json(ApiResponse::success(json!(message))))
}

pub async fn update_comment_status(
    State(state): State<AppState>,
    Path(comment_guid): Path<String>,
    Json(body): Json<UpdateCommentStatusBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .review_service
        .update_comment_status(UpdateReviewCommentStatusInput {
            comment_guid: comment_guid.clone(),
            status: body.status.clone(),
        })
        .await?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "comment_guid": comment_guid,
        "status": body.status,
    }))))
}

pub async fn create_agent_run(
    State(state): State<AppState>,
    Json(input): Json<CreateReviewAgentRunInput>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = state.review_service.create_agent_run(input).await?;
    Ok(Json(ApiResponse::success(json!(run))))
}

pub async fn summarize_run(
    State(state): State<AppState>,
    Path(run_guid): Path<String>,
    Json(body): Json<SummarizeRunBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    state
        .review_service
        .write_run_summary(run_guid.clone(), body.body)
        .await?;
    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "run_guid": run_guid,
    }))))
}

pub async fn finalize_run(
    State(state): State<AppState>,
    Path(run_guid): Path<String>,
    Json(body): Json<FinalizeRunBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if let Some(summary) = body.summary {
        state
            .review_service
            .write_run_summary(run_guid.clone(), summary)
            .await?;
    }
    let finalized = state
        .review_service
        .finalize_agent_run(run_guid, body.title)
        .await?;
    Ok(Json(ApiResponse::success(json!(finalized))))
}

pub async fn set_agent_run_status(
    State(state): State<AppState>,
    Path(run_guid): Path<String>,
    Json(mut input): Json<SetReviewAgentRunStatusInput>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    input.run_guid = run_guid;
    let result = state.review_service.set_agent_run_status(input).await?;
    Ok(Json(ApiResponse::success(json!(result))))
}
