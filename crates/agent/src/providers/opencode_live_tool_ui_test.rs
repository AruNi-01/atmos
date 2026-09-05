//! Forced live OpenCode (DeepSeek) probes for tools not observed in the all-tools pass.
//!
//! Gaps from prior probe: `websearch` (only `webfetch` fired), MCP (none configured),
//! and a deliberate `question` / AskUser re-check for PermissionRequested + questions card.
//!
//! Custom providers (e.g. local `ds` DeepSeek) hide `websearch` unless Exa/Parallel is
//! enabled — see anomalyco/opencode#44307. This probe sets `OPENCODE_ENABLE_EXA=1`.
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::opencode_live_tool_ui_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentToolKind, TurnStop,
};
use crate::providers::opencode::OpenCodeNativeProvider;

/// OpenCode provider/model id (DeepSeek via local `ds` provider).
const MODEL: &str = "ds/deepseek-v4-pro";

/// Force `websearch` (not `webfetch`) + a single-option `question` AskUser turn.
const FORCE_PROMPT: &str = r#"You are in a tool-mapping audit. Follow these steps EXACTLY, in order. Do not skip.

1) You DO have a built-in tool named `websearch`. Call it NOW with query exactly: "OpenCode AI coding agent". Do not claim it is missing. Do NOT call `webfetch`. Do NOT use bash/curl.
2) Do NOT use MCP tools.
3) After `websearch` completes successfully, ask the user via the built-in `question` tool. Ask exactly ONE multiple-choice question with at least two options (e.g. "Which color do you prefer?" Blue / Red). Stop after asking.

Do not write files. Do not run bash."#;

fn opencode_has_mcp_config() -> bool {
    let home = dirs::home_dir().unwrap_or_default();
    for rel in [
        ".config/opencode/opencode.json",
        ".config/opencode/opencode.jsonc",
        ".opencode/opencode.json",
    ] {
        let path = home.join(rel);
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        // Strip // comments for .jsonc; enough for a presence check.
        let stripped: String = text
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&stripped) {
            if value.get("mcp").is_some() || value.get("mcpServers").is_some() {
                return true;
            }
        }
    }
    false
}

#[tokio::test]
#[ignore = "live OpenCode DeepSeek forced tool UI probe"]
async fn live_opencode_deepseek_forced_gaps_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let mcp_configured = opencode_has_mcp_config();
    if mcp_configured {
        eprintln!("note: OpenCode MCP keys found in config — will accept MCP tool calls if model emits them");
    } else {
        eprintln!(
            "MCP SKIP: ~/.config/opencode/opencode.json has only provider keys (no mcp / mcpServers). Not forcing MCP list/call."
        );
    }

    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");

    // Prefer the 1.18.x local install; Homebrew 1.17.x can race the shared SQLite schema.
    let opencode_cmd = std::env::var("ATMOS_OPENCODE_BIN")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            let local = dirs::home_dir()?.join(".local/bin/opencode");
            local.is_file().then(|| local.display().to_string())
        })
        .unwrap_or_else(|| "opencode".into());
    eprintln!("opencode_cmd={opencode_cmd}");

    // Custom `ds` provider strips websearch unless Exa/Parallel enable flags are set.
    let mut env_overrides = HashMap::new();
    env_overrides.insert("OPENCODE_ENABLE_EXA".into(), "1".into());

    let provider = OpenCodeNativeProvider::with_cmd(opencode_cmd);
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.clone(),
            model: Some(MODEL.into()),
            permission_mode: Some("auto".into()),
            allow_file_access: true,
            extra_config: HashMap::new(),
            env_overrides: Some(env_overrides),
            ..AgentRuntimeConfig::default()
        })
        .await
        .expect("create_runtime");
    let control = runtime.control();
    match control
        .set_config(AgentRuntimeConfigUpdate {
            permission_mode: Some("auto".into()),
            model: Some(MODEL.into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await
    {
        Ok(()) => eprintln!("set_config ok (auto + {MODEL})"),
        Err(error) => eprintln!("set_config soft-fail: {error}"),
    }

    let sent = control
        .send(AgentPrompt {
            text: FORCE_PROMPT.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");
    eprintln!("turn_id={}", sent.turn_id);

    let deadline = Instant::now() + Duration::from_secs(300);
    let mut text = String::new();
    let mut tools: Vec<String> = Vec::new();
    let mut completed_kinds: Vec<AgentToolKind> = Vec::new();
    let mut completed_names: Vec<String> = Vec::new();
    let mut other_names: Vec<String> = Vec::new();
    let mut saw_web_search = false;
    let mut saw_web_fetch = false;
    let mut saw_mcp = false;
    let mut permission_events = 0usize;
    let mut ask_user_with_questions = 0usize;
    let mut stop = None;
    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(45), runtime.next_event()).await {
            Err(_) => continue,
            Ok(None) => break,
            Ok(Some(event)) => event,
        };
        match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(delta),
            AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call }
            | AgentEvent::ToolCallCompleted { tool_call } => {
                let phase = match &event.payload {
                    AgentEvent::ToolCallStarted { .. } => "started",
                    AgentEvent::ToolCallUpdated { .. } => "updated",
                    AgentEvent::ToolCallCompleted { .. } => "completed",
                    _ => "?",
                };
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
                if matches!(&event.payload, AgentEvent::ToolCallCompleted { .. }) {
                    completed_kinds.push(tool_call.kind);
                    completed_names.push(tool_call.name.clone());
                    if tool_call.kind == AgentToolKind::WebSearch
                        || tool_call.name.eq_ignore_ascii_case("websearch")
                        || tool_call.name.eq_ignore_ascii_case("web_search")
                    {
                        saw_web_search = true;
                    }
                    if tool_call.kind == AgentToolKind::Fetch
                        || tool_call.name.eq_ignore_ascii_case("webfetch")
                        || tool_call.name.eq_ignore_ascii_case("web_fetch")
                    {
                        saw_web_fetch = true;
                    }
                    if matches!(
                        tool_call.kind,
                        AgentToolKind::McpList | AgentToolKind::McpCall
                    ) || tool_call.name.to_ascii_lowercase().contains("mcp")
                    {
                        saw_mcp = true;
                    }
                    if tool_call.kind == AgentToolKind::Other {
                        other_names.push(tool_call.name.clone());
                    }
                }
                tools.push(line);
            }
            AgentEvent::PermissionRequested { request } => {
                permission_events += 1;
                let has_questions = !request.questions.is_empty();
                if has_questions {
                    ask_user_with_questions += 1;
                    eprintln!(
                        "ASK_USER request_id={} tool={} questions={:?} desc={} options={:?}",
                        request.request_id,
                        request.tool,
                        request.questions,
                        request.description,
                        request
                            .options
                            .iter()
                            .map(|o| (&o.option_id, &o.name))
                            .collect::<Vec<_>>()
                    );
                } else {
                    eprintln!(
                        "permission tool={} id={} desc={} options={:?}",
                        request.tool,
                        request.request_id,
                        request.description,
                        request
                            .options
                            .iter()
                            .map(|o| (&o.option_id, &o.name))
                            .collect::<Vec<_>>()
                    );
                }
                // AskUser: pick first non-reject option (question choice label).
                // Tool permission: prefer allow/accept/once.
                let option_id = if has_questions {
                    request
                        .options
                        .iter()
                        .find(|option| {
                            let id = option.option_id.to_ascii_lowercase();
                            !id.contains("reject")
                                && !id.contains("cancel")
                                && !id.contains("decline")
                        })
                        .or_else(|| request.options.first())
                        .map(|option| option.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                } else {
                    request
                        .options
                        .iter()
                        .find(|option| {
                            let id = option.option_id.to_ascii_lowercase();
                            (id.contains("allow") || id.contains("accept") || id.contains("once"))
                                && !id.contains("reject")
                                && !id.contains("cancel")
                                && !id.contains("decline")
                        })
                        .or_else(|| request.options.first())
                        .map(|option| option.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                };
                eprintln!("respond_permission -> {option_id}");
                control
                    .respond_permission(&request.request_id, &option_id)
                    .await
                    .expect("respond_permission");
            }
            AgentEvent::TurnCompleted {
                turn_id: completed,
                stop: completed_stop,
            } if *completed == sent.turn_id => {
                stop = Some(completed_stop.clone());
                break;
            }
            AgentEvent::TurnFailed { error, .. } => {
                panic!("turn failed: {error}");
            }
            other => {
                eprintln!("event: {other:?}");
            }
        }
    }
    let _ = control.close().await;
    eprintln!(
        "DONE stop={stop:?} text_len={} tools={} completed_kinds={completed_kinds:?} completed_names={completed_names:?} other_names={other_names:?} websearch={saw_web_search} webfetch={saw_web_fetch} mcp={saw_mcp} mcp_configured={mcp_configured} permission={permission_events} ask_user_questions={ask_user_with_questions} snippet={:?}",
        text.chars().count(),
        tools.len(),
        text.chars().take(200).collect::<String>()
    );

    assert!(
        !tools.is_empty() || !text.trim().is_empty() || ask_user_with_questions > 0,
        "expected tools, text, or AskUser"
    );
    assert!(
        saw_web_search,
        "expected websearch tool (kind WebSearch); got names={completed_names:?} kinds={completed_kinds:?}"
    );
    assert!(
        !saw_web_fetch,
        "prompt forbade webfetch; got Fetch anyway (names={completed_names:?})"
    );
    if !mcp_configured {
        assert!(
            !saw_mcp,
            "MCP not configured but saw MCP tool: {completed_names:?}"
        );
    }
    assert!(
        ask_user_with_questions > 0,
        "expected PermissionRequested with non-empty questions (AskUser / question card path)"
    );
    if stop.is_none() {
        eprintln!("note: stop=None (likely timed out after question reply)");
    } else {
        assert!(
            matches!(stop, Some(TurnStop::Completed) | Some(TurnStop::Canceled)),
            "unexpected stop {stop:?}"
        );
    }
}
