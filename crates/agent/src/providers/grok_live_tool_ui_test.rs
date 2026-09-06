//! One-shot live Grok tool-format probe for Atmos event mapping audit.
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::grok_live_tool_ui_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentToolKind, TurnStop,
};
use crate::providers::grok::GrokNativeProvider;

const PROMPT: &str = r#"Atmos mapping probe — do these steps in order, nothing else (no openrouter_web_search, no image/scheduler):

1) Write ./tmp/hello2.txt with one line containing Hello.
2) grep pattern Hello under ./tmp.
3) spawn_subagent type=explore description exactly: Read hello2.txt
4) Immediately call get_command_or_subagent_output / TaskOutput with that subagent's task_id (timeout_ms 15000) and wait until status=completed. This step is required.
5) web_fetch https://example.com
6) If you have ask-user / AskUserQuestion / clarification, ask one yes/no; else skip.

Short summary after."#;

const MODEL: &str = "grok-4.5";

#[tokio::test]
#[ignore = "live Grok tool UI probe"]
async fn live_grok_tool_ui_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");

    let provider = GrokNativeProvider::new();
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.clone(),
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
            text: PROMPT.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");
    eprintln!("turn_id={}", sent.turn_id);

    let deadline = Instant::now() + Duration::from_secs(420);
    let mut text = String::new();
    let mut tools: Vec<String> = Vec::new();
    let mut kinds: Vec<AgentToolKind> = Vec::new();
    let mut other_names: Vec<String> = Vec::new();
    let mut stop = None;
    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(30), runtime.next_event()).await {
            Err(_) => continue,
            Ok(None) => break,
            Ok(Some(event)) => event,
        };
        match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(delta),
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
                if matches!(
                    &event.payload,
                    AgentEvent::ToolCallCompleted { .. } | AgentEvent::ToolCallFailed { .. }
                ) {
                    kinds.push(tool_call.kind);
                    if tool_call.kind == AgentToolKind::Other {
                        other_names.push(format!(
                            "{} title={:?} params={:?}",
                            tool_call.name, tool_call.title, tool_call.params
                        ));
                    }
                }
                tools.push(line);
            }
            AgentEvent::PermissionRequested { request } => {
                let option_id = request
                    .options
                    .iter()
                    .find(|option| {
                        let id = option.option_id.to_ascii_lowercase();
                        (id.contains("allow") || id.contains("accept") || id.contains("always"))
                            && !id.contains("reject")
                            && !id.contains("cancel")
                            && !id.contains("decline")
                    })
                    .or_else(|| request.options.first())
                    .map(|option| option.option_id.clone())
                    .unwrap_or_else(|| "accept".into());
                eprintln!(
                    "permission {} -> {option_id} ({})",
                    request.request_id, request.description
                );
                control
                    .respond_permission(&request.request_id, &option_id)
                    .await
                    .expect("respond_permission");
            }
            AgentEvent::TurnCompleted { stop: reason, .. } => {
                stop = Some(*reason);
                break;
            }
            AgentEvent::TurnFailed { error, .. } => {
                eprintln!("turn_failed={error}");
                stop = Some(TurnStop::Failed);
                break;
            }
            other => eprintln!("event {other:?}"),
        }
    }

    let report = format!(
        "assistant_text_len={}\ntool_events={}\ncompleted_kinds={:?}\nother_names={:?}\nstop={:?}\n",
        text.len(),
        tools.len(),
        kinds,
        other_names,
        stop
    );
    eprintln!("{report}");
    let _ = std::fs::write(cwd.join("tmp/grok-live-tool-ui-audit.txt"), report);
    let _ = std::fs::write(
        cwd.join("tmp/grok-live-tool-ui-tools.jsonl"),
        tools.join("\n"),
    );

    assert!(
        !tools.is_empty() || !text.trim().is_empty(),
        "expected tools or assistant text from Grok"
    );
}
