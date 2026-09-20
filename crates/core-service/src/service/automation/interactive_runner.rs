use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use infra::db::entities::{automation, automation_run};
use infra::db::repo::AutomationRepo;
use regex::Regex;
use serde::Deserialize;
use tracing::warn;
use uuid::Uuid;

use crate::error::{Result, ServiceError};
use crate::service::agent_chat::{AgentChatOrigin, CreateAgentChatRequest};
use crate::service::terminal::{CapturePanePlainTextParams, CreateSessionParams, TerminalKind};

use super::execute_mode::{
    build_interactive_prompt, parse_standalone_scope, standalone_scope_id,
    AutomationChatAgentConfig, AutomationExecuteMode, AutomationSurfaceKind,
    AUTOMATION_CHAT_PERMISSION_MODE, AUTOMATION_ORIGIN,
};
use super::tui_interrupt::{automation_tui_window_name, tui_interrupt_for_agent};
use super::{agents, artifacts, AutomationRunStatus, AutomationService, AutomationTargetKind};

const TUI_WAIT_CAP: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct TuiFollowUpFile {
    agents: Vec<TuiFollowUpAgent>,
}

#[derive(Debug, Deserialize)]
struct TuiFollowUpAgent {
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "readyPattern")]
    ready_pattern: String,
}

impl AutomationService {
    pub(super) async fn start_interactive_surface(
        &self,
        automation: &automation::Model,
        run: automation_run::Model,
        mode: AutomationExecuteMode,
        cwd: &str,
    ) -> Result<automation_run::Model> {
        match mode {
            AutomationExecuteMode::Terminal => {
                self.start_terminal_surface(automation, run, cwd).await
            }
            AutomationExecuteMode::Chat => self.start_chat_surface(automation, run, cwd).await,
            AutomationExecuteMode::Headless => Ok(run),
        }
    }

    async fn start_terminal_surface(
        &self,
        automation: &automation::Model,
        run: automation_run::Model,
        cwd: &str,
    ) -> Result<automation_run::Model> {
        let terminal = &self.terminal_service;
        let run_config = run
            .agent_config_json
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok());
        let mut agent = agents::resolve_interactive_automation_agent_with_config(
            automation.agent_id.as_str(),
            run_config.as_ref(),
        )?;
        agent
            .args
            .extend(interactive_trust_args(&agent.agent_id, cwd));
        let scope_id = interactive_scope_id(automation, &run);
        let session_id = Uuid::new_v4().to_string();
        let window_name = automation_tui_window_name(&run.guid);
        let launch = agent.build_terminal_launch_command();
        let prompt = std::fs::read_to_string(&run.prompt_path).unwrap_or_else(|_| {
            build_interactive_prompt(&automation.display_name, &automation.guid, &run.guid, cwd)
        });

        let (_rx, _snapshot) = terminal
            .create_session(CreateSessionParams {
                session_id: session_id.clone(),
                workspace_id: scope_id.clone(),
                shell: None,
                cols: Some(120),
                rows: Some(32),
                project_name: None,
                workspace_name: Some(automation.display_name.clone()),
                window_name: Some(window_name.clone()),
                cwd: Some(cwd.to_string()),
                terminal_kind: TerminalKind::Standard,
                side_chat_id: None,
                source_pane_id: None,
                source_tmux_window_name: None,
                origin: Some(AUTOMATION_ORIGIN.to_string()),
                run_guid: Some(run.guid.clone()),
                automation_guid: Some(automation.guid.clone()),
                initial_input: None,
            })
            .await?;

        terminal.send_input(&session_id, &launch).await?;
        terminal.send_enter(&session_id).await?;

        let repo = AutomationRepo::new(&self.db);
        let updated = repo
            .update_run_surface(
                &run.guid,
                Some(AutomationSurfaceKind::Terminal.as_str().to_string()),
                Some(session_id.clone()),
                Some(scope_id.clone()),
            )
            .await?;

        let terminal = self.terminal_service.clone();
        let db = self.db.clone();
        let run_guid = run.guid.clone();
        let agent_id = agent.agent_id.clone();
        tokio::spawn(async move {
            if !wait_for_tui_ready(terminal.as_ref(), &scope_id, &window_name, &agent_id).await {
                warn!("automation tui prompt skipped: directory trust dialog still open");
                return;
            }
            let still_running = matches!(
                AutomationRepo::new(db.as_ref())
                    .find_run_by_guid(&run_guid)
                    .await,
                Ok(Some(current)) if current.status == AutomationRunStatus::Running.as_str()
            );
            if !still_running {
                let _ = terminal.close_session(&session_id).await;
                return;
            }
            if let Err(error) = terminal.send_input(&session_id, &prompt).await {
                warn!("automation tui prompt send failed: {error}");
                return;
            }
            if let Err(error) = terminal.send_enter(&session_id).await {
                warn!("automation tui prompt enter failed: {error}");
                return;
            }
            let _ = terminal.close_session(&session_id).await;
        });

        Ok(updated)
    }

    async fn start_chat_surface(
        &self,
        automation: &automation::Model,
        run: automation_run::Model,
        cwd: &str,
    ) -> Result<automation_run::Model> {
        let chat = {
            let guard = self
                .agent_chat
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            guard.clone().ok_or_else(|| {
                ServiceError::Validation("Agent chat service is not available".to_string())
            })?
        };
        let config = spawn_chat_config(run.agent_config_json.as_deref(), &automation.agent_id);
        let scope_id = interactive_scope_id(automation, &run);
        let (workspace_id, project_id) = chat_scope_ids(automation, &run, &scope_id);
        let prompt = std::fs::read_to_string(&run.prompt_path).unwrap_or_else(|_| {
            build_interactive_prompt(&automation.display_name, &automation.guid, &run.guid, cwd)
        });
        let meta = chat.create(CreateAgentChatRequest {
            workspace_id,
            project_id,
            space_id: None,
            cwd: cwd.to_string(),
            origin: AgentChatOrigin::Normal,
            provider_id: config.provider_id,
            model: config.model,
            thinking: config.thinking,
            mode: config.mode,
            permission_mode: config.permission_mode,
            fast: config.fast,
            context: config.context,
            title: Some(automation.display_name.clone()),
            source: Some(AUTOMATION_ORIGIN.to_string()),
            automation_run_guid: Some(run.guid.clone()),
        })?;
        chat.send(&meta.id, &prompt, Vec::new()).await?;

        let repo = AutomationRepo::new(&self.db);
        repo.update_run_surface(
            &run.guid,
            Some(AutomationSurfaceKind::Chat.as_str().to_string()),
            Some(meta.id),
            Some(scope_id),
        )
        .await
        .map_err(Into::into)
    }

    /// Stop the live interactive turn without destroying the tab/window.
    pub(super) async fn interrupt_interactive_surface(&self, run: &automation_run::Model) {
        match AutomationExecuteMode::parse(&run.execute_mode) {
            Ok(AutomationExecuteMode::Chat) => self.interrupt_chat_surface(run).await,
            Ok(AutomationExecuteMode::Terminal) => self.interrupt_terminal_surface(run).await,
            _ => {}
        }
    }

    async fn interrupt_chat_surface(&self, run: &automation_run::Model) {
        let Some(chat_id) = run
            .surface_session_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            warn!(
                run_guid = %run.guid,
                "automation cancel: chat surface has no session id"
            );
            return;
        };
        let chat = {
            let guard = self
                .agent_chat
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            guard.clone()
        };
        let Some(chat) = chat else {
            warn!(
                run_guid = %run.guid,
                "automation cancel: agent chat service is not attached"
            );
            return;
        };
        if let Err(error) = chat.cancel(chat_id).await {
            warn!(
                run_guid = %run.guid,
                chat_id,
                "automation cancel: chat cancel failed: {error}"
            );
        }
    }

    async fn interrupt_terminal_surface(&self, run: &automation_run::Model) {
        let Some(scope_id) = terminal_interrupt_scope(run) else {
            warn!(
                run_guid = %run.guid,
                "automation cancel: terminal surface has no tmux scope"
            );
            return;
        };
        let window_name = automation_tui_window_name(&run.guid);
        let agent_id = run.agent_id.as_deref().unwrap_or("");
        let keys = tui_interrupt_for_agent(agent_id).tmux_key_names();
        match self
            .terminal_service
            .send_named_keys_to_named_window(&scope_id, &window_name, &keys)
            .await
        {
            Ok(true) => {}
            Ok(false) => warn!(
                run_guid = %run.guid,
                scope_id,
                window_name,
                "automation cancel: tmux window not found"
            ),
            Err(error) => warn!(
                run_guid = %run.guid,
                scope_id,
                window_name,
                "automation cancel: tmux send-keys failed: {error}"
            ),
        }
    }
}

fn interactive_scope_id(automation: &automation::Model, run: &automation_run::Model) -> String {
    if run.target_kind == AutomationTargetKind::Standalone.as_str()
        || automation.target_kind == AutomationTargetKind::Standalone.as_str()
    {
        return standalone_scope_id(&automation.guid);
    }
    if run.target_kind == AutomationTargetKind::Project.as_str() {
        if let Some(project_guid) = run
            .project_guid
            .as_deref()
            .or(automation.project_guid.as_deref())
        {
            return project_guid.to_string();
        }
    }
    run.created_workspace_guid
        .clone()
        .or(run.workspace_guid.clone())
        .or(automation.workspace_guid.clone())
        .or(run.project_guid.clone())
        .unwrap_or_else(|| standalone_scope_id(&automation.guid))
}

fn chat_scope_ids(
    automation: &automation::Model,
    run: &automation_run::Model,
    scope_id: &str,
) -> (Option<String>, Option<String>) {
    if parse_standalone_scope(scope_id).is_some()
        || run.target_kind == AutomationTargetKind::Standalone.as_str()
    {
        return (Some(scope_id.to_string()), None);
    }
    if run.target_kind == AutomationTargetKind::Project.as_str() {
        return (None, Some(scope_id.to_string()));
    }
    (
        Some(scope_id.to_string()),
        run.project_guid.clone().or(automation.project_guid.clone()),
    )
}

fn spawn_chat_config(raw: Option<&str>, agent_id: &str) -> AutomationChatAgentConfig {
    let mut config = parse_chat_config(raw, agent_id);
    config.permission_mode = Some(AUTOMATION_CHAT_PERMISSION_MODE.to_string());
    config
}

fn parse_chat_config(raw: Option<&str>, agent_id: &str) -> AutomationChatAgentConfig {
    if let Some(raw) = raw {
        if let Ok(config) = serde_json::from_str::<AutomationChatAgentConfig>(raw) {
            return config;
        }
    }
    AutomationChatAgentConfig {
        kind: "chat".to_string(),
        provider_id: agent_id.to_string(),
        model: None,
        thinking: None,
        mode: None,
        permission_mode: None,
        fast: None,
        context: None,
    }
}

fn terminal_interrupt_scope(run: &automation_run::Model) -> Option<String> {
    run.surface_scope_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .or_else(|| {
            run.created_workspace_guid
                .clone()
                .or(run.workspace_guid.clone())
                .or(run.project_guid.clone())
        })
        .filter(|id| !id.trim().is_empty())
}

fn tui_ready_pattern(agent_id: &str) -> Option<String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../resources/terminal-agents/tui_follow_up_agents.json");
    let contents = std::fs::read_to_string(path).ok()?;
    let file: TuiFollowUpFile = serde_json::from_str(&contents).ok()?;
    file.agents
        .into_iter()
        .find(|agent| agent.agent_id == agent_id)
        .map(|agent| agent.ready_pattern)
}

fn looks_like_directory_trust_prompt(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("do you trust this directory")
        || lower.contains("do you trust the files in this folder")
        || lower.contains("do you trust this folder")
        || lower.contains("workspace trust")
}

fn pane_is_tui_ready(text: &str, ready_regex: Option<&Regex>) -> bool {
    if looks_like_directory_trust_prompt(text) {
        return false;
    }
    match ready_regex {
        Some(regex) => regex.is_match(text),
        None => !text.trim().is_empty(),
    }
}

pub fn interactive_trust_args(agent_id: &str, cwd: &str) -> Vec<String> {
    match agent_id {
        "codex" => vec![
            "-c".to_string(),
            format!("projects.\"{}\".trust_level=\"trusted\"", absolute_cwd(cwd)),
        ],
        _ => Vec::new(),
    }
}

fn absolute_cwd(cwd: &str) -> String {
    let trimmed = cwd.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }
    let expanded = expand_home_dir(trimmed);
    let path = Path::new(&expanded);
    if path.is_absolute() {
        return path.to_string_lossy().replace('\\', "/");
    }
    std::env::current_dir()
        .map(|base| base.join(path).to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| expanded.replace('\\', "/"))
}

fn expand_home_dir(cwd: &str) -> String {
    if cwd == "~" {
        return dirs::home_dir()
            .map(|home| home.to_string_lossy().into_owned())
            .unwrap_or_else(|| cwd.to_string());
    }
    if let Some(rest) = cwd.strip_prefix("~/") {
        return dirs::home_dir()
            .map(|home| home.join(rest).to_string_lossy().into_owned())
            .unwrap_or_else(|| cwd.to_string());
    }
    cwd.to_string()
}

async fn wait_for_tui_ready(
    terminal: &crate::service::terminal::TerminalService,
    workspace_id: &str,
    window_name: &str,
    agent_id: &str,
) -> bool {
    let pattern = tui_ready_pattern(agent_id);
    let ready_regex = pattern.as_deref().and_then(|raw| Regex::new(raw).ok());
    let has_pattern = ready_regex.is_some();
    let deadline = Instant::now() + TUI_WAIT_CAP;
    let started = Instant::now();
    let mut last_text = String::new();
    while Instant::now() < deadline {
        match terminal
            .capture_pane_plain_text(CapturePanePlainTextParams {
                workspace_id: workspace_id.to_string(),
                source_tmux_window_name: window_name.to_string(),
                source_session_id: None,
                project_name: None,
                workspace_name: None,
                max_text_bytes: Some(4096),
                approx_lines: Some(80),
                max_raw_bytes: None,
                head_prefix_bytes: None,
            })
            .await
        {
            Ok(captured) if pane_is_tui_ready(&captured.text, ready_regex.as_ref()) => {
                if has_pattern || started.elapsed() >= Duration::from_millis(800) {
                    return true;
                }
                last_text = captured.text;
            }
            Ok(captured) => {
                last_text = captured.text;
            }
            Err(error) => {
                warn!("automation tui wait capture failed: {error}");
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    if looks_like_directory_trust_prompt(&last_text) {
        return false;
    }
    true
}

pub fn interactive_cwd(
    automation: &automation::Model,
    target_kind: &str,
    prepared_run_dir: &std::path::Path,
    target_cwd: &std::path::Path,
    mode: AutomationExecuteMode,
) -> Result<PathBuf> {
    if target_kind == AutomationTargetKind::Standalone.as_str() {
        if mode.is_interactive() {
            let dir = artifacts::definition_dir(&automation.guid)?;
            artifacts::ensure_user_private_dir(&dir)?;
            return Ok(dir);
        }
        return Ok(prepared_run_dir.to_path_buf());
    }
    Ok(target_cwd.to_path_buf())
}

pub fn write_interactive_prompt(
    automation: &automation::Model,
    run_guid: &str,
    prompt_path: &std::path::Path,
    cwd: &str,
) -> Result<()> {
    let prompt =
        build_interactive_prompt(&automation.display_name, &automation.guid, run_guid, cwd);
    artifacts::write_user_private_file(prompt_path, &prompt)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standalone_scope_is_synthetic() {
        let automation = sample_automation("standalone");
        let run = sample_run("standalone", None, None);
        assert_eq!(interactive_scope_id(&automation, &run), "automation:auto-1");
    }

    #[test]
    fn s14_new_workspace_scope_uses_created_workspace_guid() {
        let automation = sample_automation("new_workspace");
        let mut run = sample_run(
            "new_workspace",
            Some("proj-1".into()),
            Some("ws-old".into()),
        );
        run.created_workspace_guid = Some("ws-created".into());
        assert_eq!(interactive_scope_id(&automation, &run), "ws-created");
        assert_eq!(
            chat_scope_ids(&automation, &run, "ws-created"),
            (Some("ws-created".into()), Some("proj-1".into()))
        );
    }

    #[test]
    fn terminal_tui_wait_is_spawned_after_surface_persist() {
        let source = include_str!("interactive_runner.rs");
        let persist_at = source
            .find(".update_run_surface(")
            .expect("persist surface");
        let spawn_at = source
            .find("tokio::spawn(async move")
            .expect("spawn tui wait");
        let wait_at = source
            .find("wait_for_tui_ready(terminal.as_ref()")
            .expect("wait for tui");
        assert!(persist_at < spawn_at, "persist must happen before spawn");
        assert!(spawn_at < wait_at, "tui wait must run inside the spawn");
        assert!(source.contains("interactive_trust_args(&agent.agent_id, cwd)"));
        assert!(source.contains("looks_like_directory_trust_prompt"));
        assert!(source.contains("directory trust dialog still open"));
        assert!(include_str!("lifecycle.rs").contains("interactive_trust_args("));
        assert!(source.contains("automation_tui_window_name(&run.guid)"));
        assert!(source.contains("still_running"));
    }

    #[test]
    fn interrupt_uses_tmux_named_keys_and_chat_cancel_without_killing_the_tab() {
        let source = include_str!("interactive_runner.rs");
        let start = source
            .find("pub(super) async fn interrupt_interactive_surface")
            .expect("interrupt_interactive_surface");
        let end = source
            .find("fn interactive_scope_id")
            .expect("interactive_scope_id");
        let block = &source[start..end];
        assert!(block.contains("chat.cancel(chat_id)"));
        assert!(block.contains("send_named_keys_to_named_window"));
        assert!(block.contains("tui_interrupt_for_agent"));
        assert!(block.contains("automation_tui_window_name"));
        assert!(!block.contains("kill_window"));
        assert!(!block.contains("destroy_session"));
    }

    #[test]
    fn terminal_interrupt_scope_prefers_surface_then_created_workspace() {
        let mut run = sample_run("workspace", Some("proj-1".into()), Some("ws-old".into()));
        run.created_workspace_guid = Some("ws-created".into());
        run.surface_scope_id = Some("ws-from-surface".into());
        assert_eq!(
            terminal_interrupt_scope(&run).as_deref(),
            Some("ws-from-surface")
        );
        run.surface_scope_id = None;
        assert_eq!(
            terminal_interrupt_scope(&run).as_deref(),
            Some("ws-created")
        );
    }

    #[test]
    fn codex_interactive_trust_args_mark_cwd_trusted() {
        let args = interactive_trust_args("codex", "/tmp/definitions/job-1");
        assert_eq!(args[0], "-c");
        assert_eq!(
            args[1],
            "projects.\"/tmp/definitions/job-1\".trust_level=\"trusted\""
        );
        assert!(interactive_trust_args("gemini", "/tmp").is_empty());
    }

    #[test]
    fn directory_trust_prompt_is_not_tui_ready() {
        assert!(looks_like_directory_trust_prompt(
            "Do you trust this directory?\n1. Yes\n2. No"
        ));
        assert!(looks_like_directory_trust_prompt(
            "Do you trust the files in this folder?"
        ));
        let ready = Regex::new("Ask Codex|Shift\\+Enter").unwrap();
        assert!(!pane_is_tui_ready(
            "Do you trust this directory?\nAsk Codex",
            Some(&ready)
        ));
        assert!(pane_is_tui_ready(
            "Ask Codex to do anything\nShift+Enter for newline",
            Some(&ready)
        ));
    }

    #[test]
    fn s16_s17_chat_create_then_send_uses_standalone_scope_without_workspace_row() {
        let source = include_str!("interactive_runner.rs");
        let create_at = source
            .find("chat.create(CreateAgentChatRequest")
            .expect("chat create");
        let send_at = source
            .find("chat.send(&meta.id, &prompt")
            .expect("chat send");
        assert!(create_at < send_at, "create must happen before send");

        let automation = sample_automation("standalone");
        let run = sample_run("standalone", None, None);
        let scope = interactive_scope_id(&automation, &run);
        assert_eq!(scope, "automation:auto-1");
        assert_eq!(
            chat_scope_ids(&automation, &run, &scope),
            (Some("automation:auto-1".into()), None)
        );
        assert_eq!(parse_chat_config(None, "claude").kind, "chat");
        assert_eq!(parse_chat_config(None, "claude").provider_id, "claude");
        let asked = spawn_chat_config(
            Some(r#"{"kind":"chat","provider_id":"claude","permission_mode":"ask_always"}"#),
            "claude",
        );
        assert_eq!(asked.permission_mode.as_deref(), Some("yolo"));
        assert_eq!(
            spawn_chat_config(None, "claude").permission_mode.as_deref(),
            Some("yolo")
        );
    }

    #[test]
    fn project_scope_uses_project_guid() {
        let automation = sample_automation("project");
        let run = sample_run("project", Some("proj-1".into()), None);
        assert_eq!(interactive_scope_id(&automation, &run), "proj-1");
        assert_eq!(
            chat_scope_ids(&automation, &run, "proj-1"),
            (None, Some("proj-1".into()))
        );
    }

    fn sample_automation(target_kind: &str) -> automation::Model {
        let now = chrono::Utc::now().naive_utc();
        automation::Model {
            guid: "auto-1".into(),
            created_at: now,
            updated_at: now,
            is_deleted: false,
            display_name: "Job".into(),
            agent_id: "codex".into(),
            agent_config_json: None,
            target_kind: target_kind.into(),
            project_guid: Some("proj-1".into()),
            workspace_guid: None,
            schedule_enabled: false,
            schedule_paused: false,
            schedule_kind: None,
            schedule_expr: None,
            schedule_timezone: "UTC".into(),
            next_run_at: None,
            trigger_kind: "manual".into(),
            trigger_enabled: false,
            trigger_status: "active".into(),
            trigger_config_json: None,
            instructions_path: "/tmp/i.md".into(),
            artifact_root: "/tmp".into(),
            last_run_guid: None,
            last_status: None,
            run_count: 0,
            execute_mode: "terminal".into(),
        }
    }

    fn sample_run(
        target_kind: &str,
        project_guid: Option<String>,
        workspace_guid: Option<String>,
    ) -> automation_run::Model {
        let now = chrono::Utc::now().naive_utc();
        automation_run::Model {
            guid: "run-1".into(),
            created_at: now,
            updated_at: now,
            is_deleted: false,
            automation_guid: "auto-1".into(),
            agent_id: Some("codex".into()),
            agent_label: Some("Codex".into()),
            agent_config_json: None,
            trigger_kind: "manual".into(),
            trigger_source_json: None,
            status: "running".into(),
            failure_kind: None,
            error_message: None,
            target_kind: target_kind.into(),
            project_guid,
            workspace_guid,
            created_workspace_guid: None,
            cwd: "/tmp".into(),
            run_dir: "/tmp".into(),
            prompt_path: "/tmp/p.md".into(),
            result_path: "/tmp/f.md".into(),
            run_json_path: "/tmp/r.json".into(),
            terminal_display_name: "Automations".into(),
            tmux_session_name: None,
            tmux_window_name: None,
            tmux_window_index: None,
            started_at: now,
            completed_at: None,
            exit_code: None,
            cancellation_requested: false,
            execute_mode: "terminal".into(),
            surface_kind: None,
            surface_session_id: None,
            surface_scope_id: None,
            stale_prompted_at: None,
            stale_prompt_dismissed: false,
        }
    }
}
