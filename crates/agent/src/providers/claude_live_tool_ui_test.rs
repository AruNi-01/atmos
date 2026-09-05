//! Forced live Claude (DeepSeek) probes for tools that are weak / rarely exercised
//! by the generic “run all tools” prompt.
//!
//! Targets: Grep+Glob (not bash rg/find) when present, WebSearch, AskUserQuestion,
//! TaskCreate/TodoWrite plan fold, EnterPlanMode/ExitPlanMode, Skill, plus Bash
//! exit_code via a deliberate failing command.
//!
//! Note (live DeepSeek×Claude 2.1.259): Grep / Glob / TodoWrite are often **absent**
//! from the host tool list — TaskCreate/TaskUpdate/TaskList replace TodoWrite.
//! Prompts still request Grep/Glob; the probe logs whether they fired.
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::claude_live_tool_ui_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentToolKind, TurnStop,
};
use crate::providers::claude::ClaudeNativeProvider;

const MODEL: &str = "deepseek-v4-pro";

/// Session A — workspace search + web + plan tasks + ask-user.
const PROMPT_SEARCH_WEB_ASK: &str = r#"You are in a tool-mapping audit. Follow these steps EXACTLY, in order. Do not skip.

1) If the Grep tool exists, call Grep (NOT Bash, NOT shell rg/grep) with pattern "AgentTool" and path "./tmp". If Grep does not exist, write exactly: "Grep unavailable" and continue.
2) If the Glob tool exists, call Glob (NOT Bash, NOT find) with pattern "*.md" and path "./tmp". If Glob does not exist, write exactly: "Glob unavailable" and continue.
3) Call WebSearch with query "Atmos agent chat ACP". Wait for it.
4) Call TaskCreate (preferred) or TodoWrite if that is what you have, with content "claude-probe-todo" and status pending/in_progress. Wait for it.
5) You MUST call AskUserQuestion: ask exactly ONE multiple-choice question with at least two short options (e.g. "Next?" options: Plan / Skill). Stop after asking.

Forbidden: using Bash/shell to search or list files for steps 1–2."#;

/// Session B — plan mode enter/exit.
const PROMPT_PLAN_MODE: &str = r#"You are in a tool-mapping audit for plan-mode tools only.

1) If EnterPlanMode is available, call it. If not available, say so in one short sentence and stop.
2) After EnterPlanMode succeeds (or if already in plan), if ExitPlanMode is available, call ExitPlanMode.
3) Do not call Grep/Glob/Bash/WebSearch/Skill in this turn. Do not write files."#;

/// Session C — Skill only (keep short; skill bodies can hijack the turn).
const PROMPT_SKILL: &str = r#"Tool-mapping audit. Call the Skill tool once with skill name "code-review" OR any other installed skill if code-review is missing. After the Skill tool returns, reply with one short sentence and STOP. Do not call Bash, Read, Grep, or any other tool after Skill."#;

/// Session D — failing Bash only (exit_code text prefix).
const PROMPT_BASH_EXIT: &str = r#"Tool-mapping audit. Call Bash exactly once with this exact command and nothing else:

ls /nonexistent-atmos-probe-path-xyz

Do not add echo, do not chain commands, do not call any other tool. After the Bash result, stop."#;

async fn run_forced_prompt(label: &str, prompt: &str, cwd: &Path) -> Vec<String> {
    eprintln!("\n===== LIVE SESSION: {label} =====");
    let provider = ClaudeNativeProvider::new();
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.to_path_buf(),
            model: Some(MODEL.into()),
            permission_mode: Some("ask_always".into()),
            allow_file_access: true,
            extra_config: HashMap::new(),
            ..AgentRuntimeConfig::default()
        })
        .await
        .expect("create_runtime");
    let control = runtime.control();
    match control
        .set_config(AgentRuntimeConfigUpdate {
            permission_mode: Some("yolo".into()),
            model: Some(MODEL.into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await
    {
        Ok(()) => eprintln!("set_config ok (yolo + {MODEL})"),
        Err(error) => eprintln!("set_config soft-fail: {error}"),
    }

    let sent = control
        .send(AgentPrompt {
            text: prompt.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");
    eprintln!("turn_id={}", sent.turn_id);

    let deadline = Instant::now() + Duration::from_secs(180);
    let mut text = String::new();
    let mut tools: Vec<String> = Vec::new();
    let mut kinds: Vec<AgentToolKind> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut plan_events = 0usize;
    let mut permission_events = 0usize;
    let mut permission_with_questions = 0usize;
    let mut config_mode: Option<String> = None;
    let mut stop = None;

    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(25), runtime.next_event()).await {
            Err(_) => continue,
            Ok(None) => break,
            Ok(Some(event)) => event,
        };
        match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(delta),
            AgentEvent::ThinkingDelta { .. } | AgentEvent::ThinkingCompleted { .. } => {}
            AgentEvent::PlanUpdated { .. } => {
                plan_events += 1;
                eprintln!("PLAN updated");
            }
            AgentEvent::ConfigChanged { config } => {
                if let Some(mode) = config.get("mode").and_then(|v| v.as_str()) {
                    config_mode = Some(mode.to_string());
                    eprintln!("CONFIG mode={mode}");
                }
                if let Some(permission) = config.get("permission_mode").and_then(|v| v.as_str()) {
                    eprintln!("CONFIG permission_mode={permission}");
                }
            }
            AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call }
            | AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallFailed { tool_call, .. } => {
                let phase = match &event.payload {
                    AgentEvent::ToolCallStarted { .. } => "started",
                    AgentEvent::ToolCallUpdated { .. } => "updated",
                    AgentEvent::ToolCallCompleted { .. } => "completed",
                    AgentEvent::ToolCallFailed { .. } => "failed",
                    _ => "?",
                };
                if matches!(&event.payload, AgentEvent::ToolCallStarted { .. }) {
                    kinds.push(tool_call.kind);
                    names.push(tool_call.name.clone());
                }
                let line = format!(
                    "{phase} kind={:?} name={} title={:?} status={:?} params={:?} result={:?}",
                    tool_call.kind,
                    tool_call.name,
                    tool_call.title,
                    tool_call.status,
                    tool_call.params,
                    tool_call.result
                );
                eprintln!("TOOL {line}");
                tools.push(line);
            }
            AgentEvent::PermissionRequested { request } => {
                permission_events += 1;
                if !request.questions.is_empty() {
                    permission_with_questions += 1;
                }
                let option_id = if !request.questions.is_empty() {
                    request
                        .options
                        .iter()
                        .find(|option| option.option_id.contains(':'))
                        .or_else(|| request.options.first())
                        .map(|option| option.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                } else {
                    request
                        .options
                        .iter()
                        .find(|option| {
                            let id = option.option_id.to_ascii_lowercase();
                            id.contains("allow") && !id.contains("reject")
                        })
                        .or_else(|| request.options.first())
                        .map(|option| option.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                };
                eprintln!(
                    "permission {} tool={} questions={} -> {option_id} ({})",
                    request.request_id,
                    request.tool,
                    request.questions.len(),
                    request.description
                );
                control
                    .respond_permission(&request.request_id, &option_id)
                    .await
                    .expect("respond_permission");
            }
            AgentEvent::TurnCompleted {
                turn_id: completed,
                stop: completed_stop,
            } if *completed == sent.turn_id => {
                stop = Some(*completed_stop);
                break;
            }
            AgentEvent::TurnFailed { error, .. } => {
                panic!("turn failed: {error}");
            }
            AgentEvent::UserCheckpoint { .. }
            | AgentEvent::SessionStarted { .. }
            | AgentEvent::AssistantMessageCompleted { .. } => {}
            other => {
                eprintln!("event: {other:?}");
            }
        }
    }
    let _ = control.close().await;
    eprintln!(
        "DONE [{label}] stop={stop:?} text_len={} tools={} plan={plan_events} perm={permission_events} ask_q={permission_with_questions} mode={config_mode:?} names={names:?} kinds={kinds:?} snippet={:?}",
        text.chars().count(),
        tools.len(),
        text.chars().take(200).collect::<String>()
    );
    assert!(
        !tools.is_empty() || !text.trim().is_empty() || plan_events > 0 || permission_events > 0,
        "[{label}] expected tools, plan, permission, or text"
    );
    assert!(
        matches!(
            stop,
            Some(TurnStop::Completed) | Some(TurnStop::Canceled) | None
        ),
        "[{label}] unexpected stop {stop:?}"
    );
    tools
}

#[tokio::test]
#[ignore = "live Claude DeepSeek forced tool UI probe"]
async fn live_claude_deepseek_forced_gaps_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");
    std::fs::write(
        cwd.join("tmp/claude-probe-note.md"),
        "# Claude probe\nAgentTool marker line for Grep.\n",
    )
    .expect("seed tmp");

    let _ = run_forced_prompt("search_web_ask", PROMPT_SEARCH_WEB_ASK, &cwd).await;
    let _ = run_forced_prompt("plan_mode", PROMPT_PLAN_MODE, &cwd).await;
    let _ = run_forced_prompt("skill", PROMPT_SKILL, &cwd).await;
    let bash_tools = run_forced_prompt("bash_exit", PROMPT_BASH_EXIT, &cwd).await;
    let saw_exit = bash_tools
        .iter()
        .any(|line| line.contains("exit_code: Some("));
    eprintln!("bash_exit saw structured exit_code={saw_exit}");
}
