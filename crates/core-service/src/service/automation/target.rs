use std::path::PathBuf;

use infra::db::entities::automation;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::runner::ResolvedAutomationTarget;
use super::{artifacts, AutomationService};

impl AutomationService {
    pub(super) async fn resolve_target(
        &self,
        automation: &automation::Model,
    ) -> Result<ResolvedAutomationTarget> {
        match automation.target_kind.as_str() {
            "project" => {
                let project_guid = automation.project_guid.clone().ok_or_else(|| {
                    ServiceError::Validation(
                        "project_guid is required for project automation target.".to_string(),
                    )
                })?;
                let project = self
                    .project_service
                    .get_project(project_guid.clone())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Project {project_guid} not found"))
                    })?;
                Ok(ResolvedAutomationTarget {
                    target_kind: automation.target_kind.clone(),
                    project_guid: Some(project.guid),
                    workspace_guid: None,
                    created_workspace_guid: None,
                    cwd: PathBuf::from(project.main_file_path),
                    project_name: Some(project.name),
                    workspace_name: None,
                })
            }
            "workspace" => {
                let workspace_guid = automation.workspace_guid.clone().ok_or_else(|| {
                    ServiceError::Validation(
                        "workspace_guid is required for workspace automation target.".to_string(),
                    )
                })?;
                self.workspace_service
                    .ensure_worktree_ready(workspace_guid.clone())
                    .await?;
                let workspace = self
                    .workspace_service
                    .get_workspace(workspace_guid.clone())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Workspace {workspace_guid} not found"))
                    })?;
                let project = self
                    .project_service
                    .get_project(workspace.model.project_guid.clone())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!(
                            "Project {} not found",
                            workspace.model.project_guid
                        ))
                    })?;
                Ok(ResolvedAutomationTarget {
                    target_kind: automation.target_kind.clone(),
                    project_guid: Some(workspace.model.project_guid),
                    workspace_guid: Some(workspace.model.guid),
                    created_workspace_guid: None,
                    cwd: PathBuf::from(workspace.local_path),
                    project_name: Some(project.name),
                    workspace_name: Some(workspace.model.name),
                })
            }
            "new_workspace" => {
                let project_guid = automation.project_guid.clone().ok_or_else(|| {
                    ServiceError::Validation(
                        "project_guid is required for new-workspace automation target.".to_string(),
                    )
                })?;
                let branch = format!(
                    "automation/{}-{}",
                    branch_slug(&automation.display_name),
                    Uuid::new_v4()
                        .to_string()
                        .chars()
                        .take(8)
                        .collect::<String>()
                );
                let workspace = self
                    .workspace_service
                    .create_automation_workspace(
                        project_guid.clone(),
                        Some(automation.display_name.clone()),
                        branch,
                        None,
                        0,
                        None,
                        None,
                        false,
                        None,
                        None,
                        None,
                    )
                    .await?;
                self.workspace_service
                    .ensure_worktree_ready(workspace.model.guid.clone())
                    .await?;
                let workspace = self
                    .workspace_service
                    .get_workspace(workspace.model.guid.clone())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound("Automation-created workspace not found".to_string())
                    })?;
                let project = self
                    .project_service
                    .get_project(project_guid.clone())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Project {project_guid} not found"))
                    })?;
                Ok(ResolvedAutomationTarget {
                    target_kind: automation.target_kind.clone(),
                    project_guid: Some(project_guid),
                    workspace_guid: Some(workspace.model.guid.clone()),
                    created_workspace_guid: Some(workspace.model.guid),
                    cwd: PathBuf::from(workspace.local_path),
                    project_name: Some(project.name),
                    workspace_name: Some(workspace.model.name),
                })
            }
            "standalone" => Ok(ResolvedAutomationTarget {
                target_kind: automation.target_kind.clone(),
                project_guid: None,
                workspace_guid: None,
                created_workspace_guid: None,
                cwd: artifacts::runs_root()?,
                project_name: None,
                workspace_name: None,
            }),
            other => Err(ServiceError::Validation(format!(
                "Unsupported automation target kind: {other}"
            ))),
        }
    }

    pub(super) fn tmux_session_name_for_target(&self, target: &ResolvedAutomationTarget) -> String {
        let tmux_engine = self.terminal_service.tmux_engine();
        if let (Some(project_name), Some(workspace_name)) = (
            target.project_name.as_deref(),
            target.workspace_name.as_deref(),
        ) {
            tmux_engine.get_session_name_from_names(project_name, workspace_name)
        } else if let Some(project_guid) = target.project_guid.as_deref() {
            tmux_engine.get_session_name(project_guid)
        } else {
            "automations".to_string()
        }
    }
}

fn branch_slug(raw: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= 48 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "automation".to_string()
    } else {
        slug.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automation_workspace_branch_uses_display_name_slug() {
        assert_eq!(branch_slug("Daily Repo Health"), "daily-repo-health");
        assert_eq!(branch_slug("  ***  "), "automation");
    }
}
