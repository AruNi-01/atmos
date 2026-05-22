use crate::error::{Result, ServiceError};
use infra::db::entities::{workspace, workspace_label};
use infra::{GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload};
use serde::Serialize;

pub const WORKSPACE_WORKFLOW_STATUSES: &[&str] = &[
    "backlog",
    "todo",
    "in_progress",
    "in_review",
    "blocked",
    "completed",
    "canceled",
];
pub const WORKSPACE_PRIORITIES: &[&str] = &["no_priority", "urgent", "high", "medium", "low"];

#[derive(Serialize)]
pub struct WorkspaceLabelDto {
    pub guid: String,
    pub name: String,
    pub color: String,
    pub source: String,
    pub created_at: String,
}

impl From<workspace_label::Model> for WorkspaceLabelDto {
    fn from(model: workspace_label::Model) -> Self {
        Self {
            guid: model.guid,
            name: model.name,
            color: model.color,
            source: model.source,
            created_at: model.created_at.to_string(),
        }
    }
}

#[derive(Serialize)]
pub struct WorkspaceDto {
    #[serde(flatten)]
    pub model: workspace::Model,
    pub local_path: String,
    pub github_issue: Option<GithubIssuePayload>,
    pub github_pr: Option<GithubPrPayload>,
    pub labels: Vec<WorkspaceLabelDto>,
}

pub(super) fn validate_workspace_workflow_status(value: Option<String>) -> Result<Option<String>> {
    match value {
        Some(status) if is_valid_workspace_workflow_status(&status) => Ok(Some(status)),
        Some(status) => Err(ServiceError::Validation(format!(
            "Unsupported workspace workflow status: {status}"
        ))),
        None => Ok(None),
    }
}

pub(super) fn validate_workspace_priority(value: Option<String>) -> Result<Option<String>> {
    match value {
        Some(priority) if is_valid_workspace_priority(&priority) => Ok(Some(priority)),
        Some(priority) => Err(ServiceError::Validation(format!(
            "Unsupported workspace priority: {priority}"
        ))),
        None => Ok(None),
    }
}

pub(super) fn is_valid_workspace_workflow_status(value: &str) -> bool {
    WORKSPACE_WORKFLOW_STATUSES
        .iter()
        .any(|candidate| *candidate == value)
}

pub(super) fn is_valid_workspace_priority(value: &str) -> bool {
    WORKSPACE_PRIORITIES
        .iter()
        .any(|candidate| *candidate == value)
}

/// Synthesize a GithubIssuePayload from a PR so the existing requirement/TODO
/// pipeline (which is keyed on issue title/body/labels) can ingest PR content.
pub(super) fn pr_as_issue_payload(pr: &GithubPrPayload) -> GithubIssuePayload {
    GithubIssuePayload {
        owner: pr.owner.clone(),
        repo: pr.repo.clone(),
        number: pr.number,
        title: pr.title.clone(),
        body: pr.body.clone(),
        url: pr.url.clone(),
        state: pr.state.clone(),
        created_at: None,
        updated_at: None,
        labels: pr
            .labels
            .iter()
            .map(|label| GithubIssueLabelPayload {
                name: label.name.clone(),
                color: label.color.clone(),
                description: label.description.clone(),
            })
            .collect(),
    }
}

pub(super) fn sanitize_workspace_handle(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut previous_dash = false;

    for ch in value.chars() {
        let next = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            '-'
        };

        if next == '-' {
            if previous_dash {
                continue;
            }
            previous_dash = true;
        } else {
            previous_dash = false;
        }

        sanitized.push(next);
        if sanitized.len() >= 48 {
            break;
        }
    }

    let sanitized = sanitized.trim_matches('-').to_string();
    if sanitized.is_empty() {
        "workspace".to_string()
    } else {
        sanitized
    }
}

pub(super) fn with_project_scope(project_scope: &str, workspace_name: &str) -> String {
    let scoped_prefix = format!("{project_scope}/");
    if workspace_name.starts_with(&scoped_prefix) {
        workspace_name.to_string()
    } else {
        format!("{project_scope}/{workspace_name}")
    }
}
