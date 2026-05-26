use crate::error::{Result, ServiceError};

use super::agents::resolve_automation_agent;
use super::{AutomationService, AutomationTargetInput, AutomationTargetKind};

impl AutomationService {
    pub(super) fn validate_agent(&self, agent_id: &str) -> Result<()> {
        resolve_automation_agent(agent_id).map(|_| ())
    }

    pub(super) async fn validate_target(&self, target: &AutomationTargetInput) -> Result<()> {
        match target.target_kind {
            AutomationTargetKind::Project => {
                let project_guid = target
                    .project_guid
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        ServiceError::Validation(
                            "project_guid is required for project automation target.".to_string(),
                        )
                    })?;
                if target.workspace_guid.is_some() {
                    return Err(ServiceError::Validation(
                        "workspace_guid must be empty for project automation target.".to_string(),
                    ));
                }
                self.project_service
                    .get_project(project_guid.to_string())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Project {project_guid} not found"))
                    })?;
            }
            AutomationTargetKind::Workspace => {
                let workspace_guid = target
                    .workspace_guid
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        ServiceError::Validation(
                            "workspace_guid is required for workspace automation target."
                                .to_string(),
                        )
                    })?;
                if target.project_guid.is_some() {
                    return Err(ServiceError::Validation(
                        "project_guid must be empty for workspace automation target.".to_string(),
                    ));
                }
                self.workspace_service
                    .get_workspace(workspace_guid.to_string())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Workspace {workspace_guid} not found"))
                    })?;
            }
            AutomationTargetKind::NewWorkspace => {
                let project_guid = target
                    .project_guid
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        ServiceError::Validation(
                            "project_guid is required for new-workspace automation target."
                                .to_string(),
                        )
                    })?;
                if target.workspace_guid.is_some() {
                    return Err(ServiceError::Validation(
                        "workspace_guid must be empty for new-workspace automation target."
                            .to_string(),
                    ));
                }
                self.project_service
                    .get_project(project_guid.to_string())
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NotFound(format!("Project {project_guid} not found"))
                    })?;
            }
            AutomationTargetKind::Standalone => {
                if target.project_guid.is_some() || target.workspace_guid.is_some() {
                    return Err(ServiceError::Validation(
                        "Standalone automation target must not include project_guid or workspace_guid."
                            .to_string(),
                    ));
                }
            }
        }
        Ok(())
    }
}

pub(super) fn validate_display_name(raw: String) -> Result<String> {
    let value = raw.trim().to_string();
    if value.is_empty() {
        return Err(ServiceError::Validation(
            "Automation display name is required.".to_string(),
        ));
    }
    if value.chars().count() > 80 {
        return Err(ServiceError::Validation(
            "Automation display name must be 80 characters or fewer.".to_string(),
        ));
    }
    Ok(value)
}

pub(super) fn validate_instructions(raw: String) -> Result<String> {
    let value = raw.trim().to_string();
    if value.is_empty() {
        return Err(ServiceError::Validation(
            "Agent Instructions are required.".to_string(),
        ));
    }
    Ok(value)
}

pub(super) fn parse_run_page_token(page_token: Option<&str>) -> Result<u64> {
    let Some(token) = page_token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(0);
    };
    token
        .parse::<u64>()
        .map_err(|_| ServiceError::Validation("Invalid automation run page token.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_page_token_defaults_to_first_page() {
        assert_eq!(parse_run_page_token(None).unwrap(), 0);
        assert_eq!(parse_run_page_token(Some("")).unwrap(), 0);
        assert_eq!(parse_run_page_token(Some("50")).unwrap(), 50);
    }

    #[test]
    fn run_page_token_rejects_invalid_values() {
        assert!(parse_run_page_token(Some("abc")).is_err());
        assert!(parse_run_page_token(Some("-1")).is_err());
    }
}
