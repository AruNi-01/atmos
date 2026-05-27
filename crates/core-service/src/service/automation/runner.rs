use std::path::{Path, PathBuf};

use chrono::{NaiveDateTime, Utc};
use infra::db::entities::{automation, automation_run};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::artifacts;

pub const PROMPT_FILE: &str = "prompt.md";
pub const OUTPUT_FILE: &str = "output.log";
pub const FINAL_FILE: &str = "final.md";
pub const RUN_JSON_FILE: &str = "run.json";
pub const TERMINAL_DISPLAY_NAME: &str = "Automations";

#[derive(Debug, Clone)]
pub struct ResolvedAutomationTarget {
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub created_workspace_guid: Option<String>,
    pub cwd: PathBuf,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PreparedAutomationRun {
    pub run_guid: String,
    pub run_dir: PathBuf,
    pub prompt_path: PathBuf,
    pub output_path: PathBuf,
    pub result_path: PathBuf,
    pub run_json_path: PathBuf,
    pub tmux_window_name: String,
    pub started_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunJson {
    pub run_guid: String,
    pub automation_guid: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub exit_code: Option<i32>,
    pub run_dir: String,
    pub prompt_path: String,
    pub output_path: String,
    pub result_path: String,
    pub run_json_path: String,
    pub tmux_session_name: Option<String>,
    pub tmux_window_name: Option<String>,
    pub tmux_window_index: Option<u32>,
}

impl AutomationRunJson {
    pub fn from_run_model(run: &automation_run::Model) -> Self {
        Self {
            run_guid: run.guid.clone(),
            automation_guid: run.automation_guid.clone(),
            status: run.status.clone(),
            started_at: run.started_at.to_string(),
            completed_at: run.completed_at.map(|value| value.to_string()),
            exit_code: run.exit_code,
            run_dir: run.run_dir.clone(),
            prompt_path: run.prompt_path.clone(),
            output_path: run.output_path.clone(),
            result_path: run.result_path.clone(),
            run_json_path: run.run_json_path.clone(),
            tmux_session_name: run.tmux_session_name.clone(),
            tmux_window_name: run.tmux_window_name.clone(),
            tmux_window_index: run
                .tmux_window_index
                .and_then(|value| value.try_into().ok()),
        }
    }
}

pub fn prepare_run_files(
    automation: &automation::Model,
    instructions: &str,
    target: &ResolvedAutomationTarget,
    trigger_kind: &str,
    trigger_context: Option<&str>,
) -> Result<PreparedAutomationRun> {
    let run_guid = Uuid::new_v4().to_string();
    let started_at = Utc::now().naive_utc();
    let run_short = short_guid(&run_guid);
    let run_dir = run_dir_for(automation, started_at, &run_short)?;
    artifacts::ensure_user_private_dir(&run_dir)?;

    let prompt_path = run_dir.join(PROMPT_FILE);
    let output_path = run_dir.join(OUTPUT_FILE);
    let result_path = run_dir.join(FINAL_FILE);
    let run_json_path = run_dir.join(RUN_JSON_FILE);

    let mut prompt_target = target.clone();
    if prompt_target.target_kind == "standalone" {
        prompt_target.cwd = run_dir.clone();
    }
    let prompt = build_prompt(
        automation,
        instructions,
        &prompt_target,
        trigger_kind,
        trigger_context,
        started_at,
    );
    artifacts::write_user_private_file(&prompt_path, &prompt)?;
    artifacts::write_user_private_file(&output_path, "")?;
    artifacts::write_user_private_file(&result_path, "")?;

    Ok(PreparedAutomationRun {
        run_guid,
        run_dir,
        prompt_path,
        output_path,
        result_path,
        run_json_path,
        tmux_window_name: TERMINAL_DISPLAY_NAME.to_string(),
        started_at,
    })
}

pub fn prepare_start_failure_files(
    automation: &automation::Model,
    error_message: &str,
) -> Result<PreparedAutomationRun> {
    let run_guid = Uuid::new_v4().to_string();
    let started_at = Utc::now().naive_utc();
    let run_short = short_guid(&run_guid);
    let run_dir = run_dir_for(automation, started_at, &run_short)?;
    artifacts::ensure_user_private_dir(&run_dir)?;

    let prompt_path = run_dir.join(PROMPT_FILE);
    let output_path = run_dir.join(OUTPUT_FILE);
    let result_path = run_dir.join(FINAL_FILE);
    let run_json_path = run_dir.join(RUN_JSON_FILE);
    let content = format!(
        "Automation failed before agent execution.\n\nAutomation: {display_name}\nAutomation ID: {automation_guid}\nTarget: {target_kind}\nReason: {error_message}\n",
        display_name = automation.display_name,
        automation_guid = automation.guid,
        target_kind = automation.target_kind,
    );

    artifacts::write_user_private_file(&prompt_path, &content)?;
    artifacts::write_user_private_file(&output_path, &content)?;
    artifacts::write_user_private_file(&result_path, &content)?;

    Ok(PreparedAutomationRun {
        run_guid,
        run_dir,
        prompt_path,
        output_path,
        result_path,
        run_json_path,
        tmux_window_name: TERMINAL_DISPLAY_NAME.to_string(),
        started_at,
    })
}

pub fn write_run_json(path: &Path, value: &AutomationRunJson) -> Result<()> {
    let content = serde_json::to_string_pretty(value).map_err(|error| {
        ServiceError::Validation(format!(
            "Failed to serialize automation run status: {error}"
        ))
    })?;
    let tmp = path.with_extension("json.tmp");
    artifacts::write_user_private_file(&tmp, &content)?;
    std::fs::rename(&tmp, path).map_err(|error| {
        ServiceError::Validation(format!("Failed to update automation run status: {error}"))
    })?;
    Ok(())
}

pub fn read_run_json(path: &str) -> Result<AutomationRunJson> {
    let content = artifacts::read_artifact(path)?;
    serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse automation run status: {error}"))
    })
}

pub fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled" | "interrupted")
}

pub fn completed_at_from_run_json(run_json: &AutomationRunJson) -> Option<NaiveDateTime> {
    let raw = run_json.completed_at.as_deref()?;
    chrono::DateTime::parse_from_rfc3339(raw)
        .map(|value| value.naive_utc())
        .ok()
        .or_else(|| NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S%.f").ok())
}

pub fn run_json_for_status(
    run: &automation_run::Model,
    status: &str,
    completed_at: Option<NaiveDateTime>,
    exit_code: Option<i32>,
) -> AutomationRunJson {
    let mut value = AutomationRunJson::from_run_model(run);
    value.status = status.to_string();
    value.completed_at = completed_at.map(|time| time.to_string());
    value.exit_code = exit_code;
    value
}

fn build_prompt(
    automation: &automation::Model,
    instructions: &str,
    target: &ResolvedAutomationTarget,
    trigger_kind: &str,
    trigger_context: Option<&str>,
    started_at: NaiveDateTime,
) -> String {
    let target_label = match target.target_kind.as_str() {
        "project" => "Project",
        "workspace" => "Workspace",
        "new_workspace" => "New Workspace",
        _ => "Standalone",
    };

    let trigger_context = trigger_context
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("{value}\n\n"))
        .unwrap_or_default();

    format!(
        r#"# Atmos Automation Run

Automation: {display_name}
Automation ID: {automation_guid}
Trigger: {trigger_kind}
Started at: {started_at}

Target: {target_label}
Project ID: {project_guid}
Workspace ID: {workspace_guid}
Created Workspace ID: {created_workspace_guid}
Working directory: {cwd}

{trigger_context}
## Agent Instructions

{instructions}

## Output

Run non-interactively and print the final result to stdout. Atmos captures terminal output into output.log and final.md for this run.
"#,
        display_name = automation.display_name,
        automation_guid = automation.guid,
        trigger_kind = trigger_kind,
        started_at = started_at,
        target_label = target_label,
        project_guid = target.project_guid.as_deref().unwrap_or("none"),
        workspace_guid = target.workspace_guid.as_deref().unwrap_or("none"),
        created_workspace_guid = target.created_workspace_guid.as_deref().unwrap_or("none"),
        cwd = target.cwd.display(),
        trigger_context = trigger_context,
        instructions = instructions.trim()
    )
}

fn short_guid(guid: &str) -> String {
    guid.chars().take(8).collect()
}

fn run_dir_for(
    automation: &automation::Model,
    started_at: NaiveDateTime,
    run_short: &str,
) -> Result<PathBuf> {
    let date_prefix = started_at.format("%Y-%m-%d-%H-%M-%S").to_string();
    let run_dir = artifacts::runs_root()?
        .join(&date_prefix)
        .join(&automation.guid);
    if !run_dir.exists() {
        return Ok(run_dir);
    }

    Ok(artifacts::runs_root()?
        .join(format!("{date_prefix}-{run_short}"))
        .join(&automation.guid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s22_terminal_statuses_are_limited_to_m1_outcomes() {
        assert!(!is_terminal_status("running"));
        assert!(is_terminal_status("completed"));
        assert!(is_terminal_status("failed"));
        assert!(is_terminal_status("cancelled"));
        assert!(is_terminal_status("interrupted"));
        assert!(!is_terminal_status("queued"));
        assert!(!is_terminal_status("needs_attention"));
    }

    #[test]
    fn s24_completed_at_accepts_wrapper_rfc3339_timestamp() {
        let run_json = AutomationRunJson {
            run_guid: "run-123".to_string(),
            automation_guid: "automation-123".to_string(),
            status: "completed".to_string(),
            started_at: "2026-05-26 08:00:00".to_string(),
            completed_at: Some("2026-05-26T08:01:02Z".to_string()),
            exit_code: Some(0),
            run_dir: "/tmp/run".to_string(),
            prompt_path: "/tmp/run/prompt.md".to_string(),
            output_path: "/tmp/run/output.log".to_string(),
            result_path: "/tmp/run/final.md".to_string(),
            run_json_path: "/tmp/run/run.json".to_string(),
            tmux_session_name: Some("automations".to_string()),
            tmux_window_name: Some("automation-run".to_string()),
            tmux_window_index: Some(1),
        };

        assert_eq!(
            completed_at_from_run_json(&run_json).map(|value| value.to_string()),
            Some("2026-05-26 08:01:02".to_string())
        );
    }
}
