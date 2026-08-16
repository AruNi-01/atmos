use std::path::{Path, PathBuf};

use chrono::{NaiveDateTime, Utc};
use infra::db::entities::{automation, automation_run};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use super::artifacts;

pub const PROMPT_FILE: &str = "prompt.xml";
pub const FINAL_FILE: &str = "final.md";
pub const RUN_JSON_FILE: &str = "run.json";
pub const CONTINUE_PROMPT_FILE: &str = "continue_prompt.xml";

#[derive(Debug, Clone)]
pub struct ResolvedAutomationTarget {
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub created_workspace_guid: Option<String>,
    pub cwd: PathBuf,
}

#[derive(Debug, Clone)]
pub struct PreparedAutomationRun {
    pub run_guid: String,
    pub run_dir: PathBuf,
    pub prompt_path: PathBuf,
    pub result_path: PathBuf,
    pub run_json_path: PathBuf,
    pub started_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunJson {
    pub run_guid: String,
    pub automation_guid: String,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub agent_label: Option<String>,
    pub status: String,
    #[serde(default)]
    pub target_kind: Option<String>,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub workspace_guid: Option<String>,
    #[serde(default)]
    pub created_workspace_guid: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub exit_code: Option<i32>,
    pub run_dir: String,
    pub prompt_path: String,
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
            agent_id: run.agent_id.clone(),
            agent_label: run.agent_label.clone(),
            status: run.status.clone(),
            target_kind: Some(run.target_kind.clone()),
            project_guid: run.project_guid.clone(),
            workspace_guid: run.workspace_guid.clone(),
            created_workspace_guid: run.created_workspace_guid.clone(),
            cwd: Some(run.cwd.clone()),
            started_at: run.started_at.to_string(),
            completed_at: run.completed_at.map(|value| value.to_string()),
            exit_code: run.exit_code,
            run_dir: run.run_dir.clone(),
            prompt_path: run.prompt_path.clone(),
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
    _trigger_kind: &str,
    trigger_context: Option<&str>,
) -> Result<PreparedAutomationRun> {
    let run_guid = Uuid::new_v4().to_string();
    let started_at = Utc::now().naive_utc();
    let run_short = short_guid(&run_guid);
    let run_dir = run_dir_for(automation, started_at, &run_short)?;
    artifacts::ensure_user_private_dir(&run_dir)?;

    let prompt_path = run_dir.join(PROMPT_FILE);
    let result_path = run_dir.join(FINAL_FILE);
    let run_json_path = run_dir.join(RUN_JSON_FILE);

    let mut prompt_target = target.clone();
    if prompt_target.target_kind == "standalone" {
        prompt_target.cwd = run_dir.clone();
    }
    let resolved_instructions = resolve_file_mentions_for_target(instructions, &prompt_target.cwd);
    let memory_path = artifacts::ensure_memory_file(&automation.guid)?;
    let prompt = build_prompt(&resolved_instructions, &memory_path, trigger_context);
    artifacts::write_user_private_file(&prompt_path, &prompt)?;
    artifacts::write_user_private_file(&result_path, "")?;

    Ok(PreparedAutomationRun {
        run_guid,
        run_dir,
        prompt_path,
        result_path,
        run_json_path,
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
    let result_path = run_dir.join(FINAL_FILE);
    let run_json_path = run_dir.join(RUN_JSON_FILE);
    let content = format!(
        "Automation failed before agent execution.\n\nAutomation: {display_name}\nAutomation ID: {automation_guid}\nTarget: {target_kind}\nReason: {error_message}\n",
        display_name = automation.display_name,
        automation_guid = automation.guid,
        target_kind = automation.target_kind,
    );

    artifacts::write_user_private_file(&prompt_path, &content)?;
    artifacts::write_user_private_file(&result_path, &content)?;

    Ok(PreparedAutomationRun {
        run_guid,
        run_dir,
        prompt_path,
        result_path,
        run_json_path,
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

fn build_prompt(instructions: &str, memory_path: &Path, trigger_context: Option<&str>) -> String {
    let mut parts = vec![xml_block("task", instructions.trim())];
    if let Some(context) = trigger_context
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(context.to_string());
    }
    parts.push(memory_section(memory_path));
    format!(
        "<automation_run>\n{}\n</automation_run>\n",
        parts.join("\n\n")
    )
}

fn memory_section(memory_path: &Path) -> String {
    let path = super::xml_escape(&memory_path.display().to_string());
    format!(
        r#"  <memory>
    <path>{path}</path>
    <policy>Read this file at the start of the run. Default: leave it unchanged.</policy>
    <update_when>
      - a decision, convention, or standing constraint
      - the last handled id, sha, timestamp, or cursor
      - a recurring failure and the workaround that actually worked
      - a correction to memory that is now wrong or stale
    </update_when>
    <do_not_write>
      - this run's play-by-play, logs, or one-off success/failure
      - secrets, tokens, credentials, or personal data
      - long dumps, or untrusted GitHub/user text copied wholesale
      - guesses, or anything already stated in the automation task
    </do_not_write>
    <style>Keep memory short, factual, and rewritten in place when it grows stale. Prefer a small edit over appending.</style>
  </memory>"#
    )
}

fn xml_block(tag: &str, text: &str) -> String {
    format!(
        "  <{tag}>\n{}\n  </{tag}>",
        indent_lines(&super::xml_escape(text), 4)
    )
}

fn indent_lines(text: &str, spaces: usize) -> String {
    let pad = " ".repeat(spaces);
    text.lines()
        .map(|line| format!("{pad}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn short_guid(guid: &str) -> String {
    guid.chars().take(8).collect()
}

fn resolve_file_mentions_for_target(instructions: &str, cwd: &Path) -> String {
    let cwd_display = cwd.to_string_lossy().replace('\\', "/");
    let mut output = String::with_capacity(instructions.len());
    let mut cursor = 0usize;

    while let Some(relative_start) = instructions[cursor..].find("@file:") {
        let start = cursor + relative_start;
        output.push_str(&instructions[cursor..start]);

        let path_start = start + "@file:".len();
        let path_end = instructions[path_start..]
            .find(char::is_whitespace)
            .map(|offset| path_start + offset)
            .unwrap_or(instructions.len());
        let relative_path = &instructions[path_start..path_end];
        if relative_path.is_empty() {
            output.push_str("@file:");
            cursor = path_end;
            continue;
        }

        let absolute = if cwd_display.ends_with('/') {
            format!("{cwd_display}{relative_path}")
        } else {
            format!("{cwd_display}/{relative_path}")
        };
        output.push_str(&absolute);
        cursor = path_end;
    }

    output.push_str(&instructions[cursor..]);
    output
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
            agent_id: Some("codex".to_string()),
            agent_label: Some("Codex".to_string()),
            status: "completed".to_string(),
            target_kind: Some("new_workspace".to_string()),
            project_guid: Some("project-123".to_string()),
            workspace_guid: Some("workspace-123".to_string()),
            created_workspace_guid: Some("workspace-123".to_string()),
            cwd: Some("/tmp/workspaces/project/workspace-123".to_string()),
            started_at: "2026-05-26 08:00:00".to_string(),
            completed_at: Some("2026-05-26T08:01:02Z".to_string()),
            exit_code: Some(0),
            run_dir: "/tmp/run".to_string(),
            prompt_path: "/tmp/run/prompt.xml".to_string(),
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

    #[test]
    fn run_json_accepts_legacy_files_without_target_fields() {
        let parsed: AutomationRunJson = serde_json::from_str(
            r#"{
  "run_guid": "run-123",
  "automation_guid": "automation-123",
  "status": "completed",
  "started_at": "2026-05-26 08:00:00",
  "completed_at": null,
  "exit_code": 0,
  "run_dir": "/tmp/run",
  "prompt_path": "/tmp/run/prompt.xml",
  "result_path": "/tmp/run/final.md",
  "run_json_path": "/tmp/run/run.json",
  "tmux_session_name": null,
  "tmux_window_name": null,
  "tmux_window_index": null
}"#,
        )
        .expect("legacy run json should remain readable");

        assert_eq!(parsed.target_kind, None);
        assert_eq!(parsed.cwd, None);
    }

    #[test]
    fn file_mentions_are_resolved_against_target_cwd() {
        let resolved = resolve_file_mentions_for_target(
            "Check @file:src/app.ts and @file:docs/spec.md",
            Path::new("/tmp/workspaces/demo"),
        );

        assert_eq!(
            resolved,
            "Check /tmp/workspaces/demo/src/app.ts and /tmp/workspaces/demo/docs/spec.md"
        );
    }

    #[test]
    fn plain_relative_paths_remain_untouched() {
        let resolved = resolve_file_mentions_for_target(
            "Check src/app.ts and docs/spec.md",
            Path::new("/tmp/workspaces/demo"),
        );

        assert_eq!(resolved, "Check src/app.ts and docs/spec.md");
    }

    #[test]
    fn prompt_starts_with_user_instructions_and_appends_memory_path() {
        let memory_path = Path::new("/tmp/atmos/definitions/demo/memory.md");
        let prompt = build_prompt(
            r#"
帮我总结一下 GitHub 中，AruNi-01/Atmos 的项目
"#,
            memory_path,
            None,
        );

        assert!(prompt.starts_with("<automation_run>"));
        assert!(prompt.contains("<task>"));
        assert!(prompt.contains("帮我总结一下 GitHub 中，AruNi-01/Atmos 的项目"));
        assert!(prompt.contains("<path>/tmp/atmos/definitions/demo/memory.md</path>"));
        assert!(prompt.contains("<memory>"));
        assert!(prompt.contains("Default: leave it unchanged."));
        assert!(prompt.contains("last handled id, sha, timestamp, or cursor"));
        assert!(prompt.contains("<do_not_write>"));
        assert!(prompt.contains("secrets, tokens, credentials, or personal data"));
        assert!(prompt.ends_with("</automation_run>\n"));
        assert!(!prompt.contains("Atmos Automation Run"));
        assert!(!prompt.contains("Agent Instructions"));
        assert!(!prompt.contains("Output"));
    }

    #[test]
    fn prompt_escapes_xml_in_user_task() {
        let memory_path = Path::new("/tmp/atmos/definitions/demo/memory.md");
        let prompt = build_prompt("Use <script> & tags", memory_path, None);

        assert!(prompt.contains("Use &lt;script&gt; &amp; tags"));
        assert!(!prompt.contains("<script>"));
    }

    #[test]
    fn prompt_appends_trigger_context_before_memory() {
        let memory_path = Path::new("/tmp/atmos/definitions/demo/memory.md");
        let prompt = build_prompt(
            "Review the labeled issue.",
            memory_path,
            Some("<trigger type=\"github\">\n    <provider>GitHub</provider>\n  </trigger>"),
        );

        let task_at = prompt.find("<task>").unwrap();
        let trigger_at = prompt.find("<trigger type=\"github\">").unwrap();
        let memory_at = prompt.find("<memory>").unwrap();
        assert!(task_at < trigger_at);
        assert!(trigger_at < memory_at);
        assert!(prompt.contains("Review the labeled issue."));
    }
}
