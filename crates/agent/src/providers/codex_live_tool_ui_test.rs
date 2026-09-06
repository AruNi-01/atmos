//! Live Codex tool-format probe for UI mapping audit (server-side Atmos events).
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::codex_live_tool_ui_test -- --ignored --nocapture`
//!
//! DeepSeek is not available on native Codex Chat (ChatGPT login + cleared
//! `openai_base_url`). Uses a small Codex catalog model when present.
//! This probe forces tools that prior rounds often skipped: workspace Search,
//! Delete, Skill, imageView/view_image, plus MCP list/call when configured.

#![cfg(test)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntime, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentToolKind, TurnStop,
};
use crate::providers::codex::CodexNativeProvider;

/// Forced tool checklist — prefer dedicated Codex tools over shell fallbacks.
const PROMPT: &str = r#"你在做 Atmos tool UI 映射探测。严格按顺序执行下面每一步，并尽量用 Codex 内置工具（不要用 shell 代替专用工具）：

1) Workspace Search：若有专用 grep/glob/search/listFiles 类工具，用它在 ./tmp 下搜索字符串 codex_probe（禁止只用 shell rg/grep）。若没有专用搜索工具，再退回 shell 并在回复里说明。
2) Delete：用 apply_patch / fileChange 先在 ./tmp/codex_delete_probe.txt 写入一行 probe，再删除该文件（必须产生 delete 变更，不要只用 rm）。
3) Skill：若有可用 skill（例如 screenshot / gh-fix-ci / jupyter-notebook），调用或加载其中一个；没有则跳过并说明。
4) imageView：对已存在的 ./tmp/codex_probe.png 调用 view_image / imageView（不要 cat）。没有该工具则跳过并说明。
5) MCP：若已配置 MCP，调用 list_mcp_resources（或等价 list），再对某个 server 做一次 mcp tool call；没有 MCP 则跳过并说明。

写操作只允许 ./tmp/。完成后用一两句话列出你实际调用过的工具名。"#;

/// Closest DeepSeek model advertised by this machine's Codex catalog.
const MODEL: &str = "deepseek-v4-pro";

#[tokio::test]
#[ignore = "live Codex tool UI probe"]
async fn live_codex_tool_ui_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");
    // Ensure imageView target exists (1x1 PNG written by probe harness if missing).
    let png = cwd.join("tmp/codex_probe.png");
    if !png.exists() {
        // Minimal valid 1x1 PNG.
        let bytes: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, 0x00, 0x05, 0xFE, 0x02, 0xFE, 0xA7, 0x35, 0x81,
            0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png, bytes).expect("write probe png");
    }

    let provider = CodexNativeProvider::new();
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.clone(),
            model: Some(MODEL.into()),
            permission_mode: Some("yolo".into()),
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

    let mut text = String::new();
    let mut tools: Vec<String> = Vec::new();
    let mut kinds: Vec<AgentToolKind> = Vec::new();
    let mut other_names: Vec<String> = Vec::new();
    let mut completed: Vec<(AgentToolKind, String)> = Vec::new();

    let sent = control
        .send(AgentPrompt {
            text: PROMPT.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");
    eprintln!("turn_id={}", sent.turn_id);
    let stop = drain_turn(
        &mut runtime,
        &control,
        Duration::from_secs(360),
        &mut text,
        &mut tools,
        &mut kinds,
        &mut other_names,
        &mut completed,
    )
    .await;

    // Second short turn: force view_image if first turn skipped it.
    if !kinds.contains(&AgentToolKind::Read)
        && !completed
            .iter()
            .any(|(kind, name)| *kind == AgentToolKind::Read || name == "imageView")
    {
        let png_abs = png.display().to_string();
        let follow = format!(
            "只做一件事：立刻调用内置 view_image（或 imageView）工具查看本地文件 {png_abs}。不要 cat，不要 shell。看完后一句话结束。"
        );
        let sent = control
            .send(AgentPrompt {
                text: follow,
                // Do NOT attach as localImage — that would skip view_image.
                ..AgentPrompt::default()
            })
            .await
            .expect("send view_image follow-up");
        eprintln!("followup_turn_id={}", sent.turn_id);
        let follow_stop = drain_turn(
            &mut runtime,
            &control,
            Duration::from_secs(180),
            &mut text,
            &mut tools,
            &mut kinds,
            &mut other_names,
            &mut completed,
        )
        .await;
        if matches!(follow_stop, Some(TurnStop::Failed)) {
            eprintln!("followup turn failed: {follow_stop:?}");
        }
    }

    let has = |kind: AgentToolKind| kinds.contains(&kind);
    eprintln!("assistant_text_len={}", text.len());
    eprintln!("tool_events={}", tools.len());
    eprintln!("completed_kinds={kinds:?}");
    eprintln!("completed_pairs={completed:?}");
    eprintln!("other_names={other_names:?}");
    eprintln!(
        "coverage search={} delete={} skill={} read={} mcp_list={} mcp_call={} execute={} edit={} other={}",
        has(AgentToolKind::Search),
        has(AgentToolKind::Delete),
        has(AgentToolKind::Skill),
        has(AgentToolKind::Read),
        has(AgentToolKind::McpList),
        has(AgentToolKind::McpCall),
        has(AgentToolKind::Execute),
        has(AgentToolKind::Edit),
        !other_names.is_empty()
    );
    eprintln!("stop={stop:?}");
    assert!(
        !tools.is_empty(),
        "expected at least one tool event from Codex"
    );
    assert!(
        !matches!(stop, Some(TurnStop::Failed)),
        "turn failed: {stop:?}"
    );
}

#[allow(clippy::too_many_arguments)]
async fn drain_turn(
    runtime: &mut Box<dyn AgentRuntime>,
    control: &AgentRuntimeControl,
    budget: Duration,
    text: &mut String,
    tools: &mut Vec<String>,
    kinds: &mut Vec<AgentToolKind>,
    other_names: &mut Vec<String>,
    completed: &mut Vec<(AgentToolKind, String)>,
) -> Option<TurnStop> {
    let deadline = Instant::now() + budget;
    let mut stop = None;
    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(20), runtime.next_event()).await {
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
                    kinds.push(tool_call.kind);
                    completed.push((tool_call.kind, tool_call.name.clone()));
                    if tool_call.kind == AgentToolKind::Other {
                        other_names.push(tool_call.name.clone());
                    }
                    if let crate::contract::AgentToolParams::Other { value } = &tool_call.params {
                        assert!(
                            value.get("status").is_none()
                                && value.get("aggregatedOutput").is_none(),
                            "bogus raw item dump in Other params: {value}"
                        );
                    }
                    if tool_call.name == "imageView" || tool_call.name == "view_image" {
                        assert_eq!(
                            tool_call.kind,
                            AgentToolKind::Read,
                            "imageView/view_image must map to Read, got {:?}",
                            tool_call.kind
                        );
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
                        (id.contains("allow") || id.contains("accept"))
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
                eprintln!("turn_failed {error}");
                stop = Some(TurnStop::Failed);
                break;
            }
            other => eprintln!("event {other:?}"),
        }
    }
    stop
}
