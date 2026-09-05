//! One-shot live Pi (DeepSeek) tool-format probe for UI mapping audit.
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::pi_live_tool_ui_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntimeConfig, AgentRuntimeConfigUpdate,
    AgentToolKind, TurnStop,
};
use crate::providers::pi::PiNativeProvider;

const PROMPT: &str =
    "执行一遍你的所有 tools，我在测试，看看你的 tool 执行过程。对于写操作，可以写在 ./tmp/ 目录下，随便写些东西。";

const MODEL: &str = "deepseek/deepseek-v4-pro";

#[tokio::test]
#[ignore = "live Pi DeepSeek tool UI probe"]
async fn live_pi_deepseek_tool_ui_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");

    let provider = PiNativeProvider::new();
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
                        (id.contains("allow")
                            || id.contains("accept")
                            || id.contains("always")
                            || id.contains("confirm"))
                            && !id.contains("reject")
                            && !id.contains("cancel")
                            && !id.contains("decline")
                    })
                    .or_else(|| request.options.first())
                    .map(|option| option.option_id.clone())
                    .unwrap_or_else(|| "allow_once".into());
                eprintln!(
                    "permission {} -> {option_id} ({})",
                    request.request_id, request.description
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
                stop = Some(completed_stop.clone());
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
    let _ = control.close().await;

    let report = format!(
        "model={MODEL}\nassistant_text_len={}\ntool_events={}\ncompleted_kinds={:?}\nother_names={:?}\nstop={:?}\n",
        text.len(),
        tools.len(),
        kinds,
        other_names,
        stop
    );
    eprintln!("{report}");
    let _ = std::fs::write(cwd.join("tmp/pi-live-tool-ui-audit.txt"), &report);
    let _ = std::fs::write(
        cwd.join("tmp/pi-live-tool-ui-tools.jsonl"),
        tools.join("\n"),
    );

    assert!(
        !tools.is_empty() || !text.trim().is_empty(),
        "expected tools or assistant text from Pi"
    );
}
