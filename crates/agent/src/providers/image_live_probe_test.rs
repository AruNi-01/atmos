//! Live image-generation / image-view protocol probe across Atmos chat hosts.
//!
//! Writes Atmos-mapped tool frames to `tmp/image-probe-<vendor>.jsonl`.
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::image_live_probe_test -- --ignored --nocapture`
//!
//! Optional filter: `IMAGE_PROBE_VENDORS=grok,cursor,codex,claude,opencode,pi`

#![cfg(test)]

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::time::{timeout, Instant};

use crate::acp_client::AcpToolHandler;
use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntime, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, AgentTool, TurnStop,
};
use crate::models::AgentLaunchSpec;
use crate::providers::acp::{AcpAgentProvider, AcpProviderParams};
use crate::providers::claude::ClaudeNativeProvider;
use crate::providers::codex::CodexNativeProvider;
use crate::providers::grok::GrokNativeProvider;
use crate::providers::opencode::OpenCodeNativeProvider;
use crate::providers::pi::PiNativeProvider;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root")
}

fn vendors_enabled() -> Vec<&'static str> {
    match std::env::var("IMAGE_PROBE_VENDORS") {
        Ok(raw) if !raw.trim().is_empty() => {
            let wanted: Vec<String> = raw
                .split(',')
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .collect();
            ["grok", "cursor", "codex", "claude", "opencode", "pi"]
                .into_iter()
                .filter(|v| wanted.iter().any(|w| w == *v))
                .collect()
        }
        _ => vec!["grok", "cursor", "codex", "claude", "opencode", "pi"],
    }
}

fn which(bin: &str) -> Option<String> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths).find_map(|dir| {
            let candidate = dir.join(bin);
            candidate
                .is_file()
                .then(|| candidate.to_string_lossy().into_owned())
        })
    })
}

fn ensure_probe_png(cwd: &Path) -> PathBuf {
    let png = cwd.join("tmp/image-probe-view.png");
    if !png.exists() {
        let bytes: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, 0x00, 0x05, 0xFE, 0x02, 0xFE, 0xA7, 0x35, 0x81,
            0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png, bytes).expect("write probe png");
    }
    png
}

fn jsonl_path(vendor: &str) -> PathBuf {
    repo_root().join(format!("tmp/image-probe-{vendor}.jsonl"))
}

fn append_jsonl(vendor: &str, row: Value) {
    let path = jsonl_path(vendor);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .expect("open jsonl");
    writeln!(file, "{}", row).expect("write jsonl");
}

fn tool_row(phase: &str, tool: &AgentTool) -> Value {
    json!({
        "phase": phase,
        "tool_call_id": tool.tool_call_id,
        "name": tool.name,
        "title": tool.title,
        "kind": format!("{:?}", tool.kind),
        "status": format!("{:?}", tool.status),
        "params": tool.params,
        "result": tool.result,
    })
}

struct LiveFsHandler;

#[async_trait]
impl AcpToolHandler for LiveFsHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
        let path_buf = PathBuf::from(path);
        let candidate = if path_buf.is_absolute() {
            path_buf
        } else {
            session_cwd.join(path)
        };
        let Ok(session_cwd) = session_cwd.canonicalize() else {
            return candidate;
        };
        let Ok(resolved) = candidate.canonicalize() else {
            if let Some(parent) = candidate.parent() {
                if let Ok(parent) = parent.canonicalize() {
                    if parent.starts_with(&session_cwd) {
                        return parent.join(
                            candidate
                                .file_name()
                                .unwrap_or_else(|| std::ffi::OsStr::new("denied")),
                        );
                    }
                }
            }
            return session_cwd.join("denied");
        };
        if resolved.starts_with(&session_cwd) {
            resolved
        } else {
            session_cwd.join(
                resolved
                    .file_name()
                    .unwrap_or_else(|| std::ffi::OsStr::new("denied")),
            )
        }
    }

    async fn read_text_file(&self, path: &Path) -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }

    async fn write_text_file(&self, path: &Path, content: &str) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(path, content).map_err(|e| e.to_string())
    }
}

async fn drain_turn(
    vendor: &str,
    runtime: &mut Box<dyn AgentRuntime>,
    control: &crate::contract::AgentRuntimeControl,
    turn_id: &str,
    budget: Duration,
) -> (String, Option<TurnStop>, Vec<String>) {
    let deadline = Instant::now() + budget;
    let mut text = String::new();
    let mut stop = None;
    let mut names = Vec::new();
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
            | AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallFailed { tool_call, .. } => {
                let phase = match &event.payload {
                    AgentEvent::ToolCallStarted { .. } => "started",
                    AgentEvent::ToolCallUpdated { .. } => "updated",
                    AgentEvent::ToolCallCompleted { .. } => "completed",
                    AgentEvent::ToolCallFailed { .. } => "failed",
                    _ => "?",
                };
                append_jsonl(vendor, tool_row(phase, tool_call));
                eprintln!(
                    "[{vendor}] TOOL {phase} kind={:?} name={} params={:?} result={:?}",
                    tool_call.kind, tool_call.name, tool_call.params, tool_call.result
                );
                if matches!(
                    &event.payload,
                    AgentEvent::ToolCallCompleted { .. } | AgentEvent::ToolCallFailed { .. }
                ) {
                    names.push(tool_call.name.clone());
                }
            }
            AgentEvent::PermissionRequested { request } => {
                append_jsonl(
                    vendor,
                    json!({
                        "phase": "permission",
                        "request_id": request.request_id,
                        "description": request.description,
                        "tool": request.tool,
                        "options": request.options.iter().map(|o| &o.option_id).collect::<Vec<_>>(),
                        "questions": request.questions,
                    }),
                );
                let option_id = if !request.questions.is_empty() {
                    let label = request
                        .questions
                        .first()
                        .and_then(|q| q.options.first())
                        .cloned()
                        .unwrap_or_else(|| "yes".into());
                    let qid = request
                        .questions
                        .first()
                        .map(|q| q.id.as_str())
                        .unwrap_or("0");
                    format!(r#"answers:{{"{qid}":"{label}"}}"#)
                } else {
                    request
                        .options
                        .iter()
                        .find(|option| {
                            let id = option.option_id.to_ascii_lowercase();
                            (id.contains("allow")
                                || id.contains("accept")
                                || id.contains("approve"))
                                && !id.contains("reject")
                                && !id.contains("cancel")
                        })
                        .or_else(|| request.options.first())
                        .map(|o| o.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                };
                eprintln!(
                    "[{vendor}] permission {} -> {option_id}",
                    request.request_id
                );
                let _ = control
                    .respond_permission(&request.request_id, &option_id)
                    .await;
            }
            AgentEvent::TurnCompleted {
                turn_id: completed,
                stop: completed_stop,
            } if *completed == turn_id => {
                stop = Some(completed_stop.clone());
                break;
            }
            AgentEvent::TurnFailed { error, .. } => {
                append_jsonl(vendor, json!({"phase":"turn_failed","error": error}));
                eprintln!("[{vendor}] turn failed: {error}");
                break;
            }
            other => {
                append_jsonl(
                    vendor,
                    json!({"phase":"other_event","debug": format!("{other:?}")}),
                );
            }
        }
    }
    append_jsonl(
        vendor,
        json!({
            "phase": "turn_end",
            "turn_id": turn_id,
            "stop": stop.as_ref().map(|s| format!("{s:?}")),
            "assistant_text": text.chars().take(2000).collect::<String>(),
            "completed_tool_names": names,
        }),
    );
    (text, stop, names)
}

async fn send_and_drain(
    vendor: &str,
    runtime: &mut Box<dyn AgentRuntime>,
    control: &crate::contract::AgentRuntimeControl,
    prompt: &str,
    budget: Duration,
) -> Vec<String> {
    let sent = control
        .send(AgentPrompt {
            text: prompt.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");
    eprintln!("[{vendor}] turn_id={}", sent.turn_id);
    append_jsonl(
        vendor,
        json!({"phase":"prompt","turn_id": sent.turn_id, "text": prompt}),
    );
    let (_text, _stop, names) = drain_turn(vendor, runtime, control, &sent.turn_id, budget).await;
    names
}

#[tokio::test]
#[ignore = "live image protocol probe"]
async fn live_image_protocol_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = repo_root();
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");
    let png = ensure_probe_png(&cwd);
    let png_rel = "./tmp/image-probe-view.png";
    let png_abs = png.display().to_string();
    let enabled = vendors_enabled();
    eprintln!("IMAGE_PROBE vendors={enabled:?}");

    if enabled.contains(&"grok") {
        let video_only = std::env::var_os("IMAGE_PROBE_GROK_VIDEO").is_some();
        let out = if video_only { "grok-video" } else { "grok" };
        let _ = std::fs::remove_file(jsonl_path(out));
        eprintln!(
            "\n===== GROK {} =====",
            if video_only {
                "video"
            } else {
                "image_gen / image_edit"
            }
        );
        let provider = GrokNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd: cwd.clone(),
                model: Some("grok-4.5".into()),
                permission_mode: Some("yolo".into()),
                allow_file_access: true,
                extra_config: HashMap::new(),
                ..AgentRuntimeConfig::default()
            })
            .await
            .expect("grok runtime");
        let control = runtime.control();
        let _ = control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                model: Some("grok-4.5".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await;
        if video_only {
            let video_image =
                std::env::var("IMAGE_PROBE_VIDEO_IMAGE").unwrap_or_else(|_| png_rel.to_string());
            let prompt = format!(
                r#"IMAGE PROTOCOL PROBE — video tools only.

1) Call image_to_video once with image="{video_image}" prompt="gentle zoom in" duration=6 resolution_name="480p".
2) If that succeeds, call reference_to_video once with prompt="the subject from <IMAGE_0> blinks once" images=["{video_image}"] duration=6 resolution_name="480p". If step 1 fails (e.g. SuperGrok tier or bad image), report the exact error and STOP — do not invent success.
3) One sentence listing tools actually invoked."#
            );
            let _ = send_and_drain(
                out,
                &mut runtime,
                &control,
                &prompt,
                Duration::from_secs(420),
            )
            .await;
        } else {
            let prompt = format!(
                r#"IMAGE PROTOCOL PROBE — call dedicated media tools only (no shell, no write text files except tool outputs).

1) Call image_gen exactly once with prompt: "tiny red square icon on white background, minimal" and aspect_ratio "1:1" if supported. Prefer saving under ./tmp/.
2) After image_gen returns a local path, call image_edit once using that path (or {png_rel} if gen failed) with prompt: "add a small blue circle".
3) Do NOT call image_to_video or reference_to_video in this turn.
4) End with one sentence listing tool names you actually invoked."#
            );
            let names = send_and_drain(
                out,
                &mut runtime,
                &control,
                &prompt,
                Duration::from_secs(420),
            )
            .await;
            if !names
                .iter()
                .any(|n| n.contains("image_gen") || n.contains("image") || n == "Tool")
            {
                let follow = r#"ONLY call the built-in image_gen tool now. prompt="solid green circle icon", aspect_ratio="1:1". Save under ./tmp if possible. One sentence after."#;
                let _ = send_and_drain(
                    out,
                    &mut runtime,
                    &control,
                    follow,
                    Duration::from_secs(300),
                )
                .await;
            }
        }
    }

    if enabled.contains(&"cursor") {
        let _ = std::fs::remove_file(jsonl_path("cursor"));
        if let Some(program) = which("cursor-agent") {
            eprintln!("\n===== CURSOR generateImage =====");
            let provider = AcpAgentProvider::new(AcpProviderParams {
                provider_id: "cursor".into(),
                launch_spec: AgentLaunchSpec {
                    program,
                    args: vec!["acp".into()],
                    env: None,
                },
                env_overrides: None,
                default_config: None,
                tool_handler: Arc::new(LiveFsHandler),
            });
            let mut runtime = provider
                .create_runtime(AgentRuntimeConfig {
                    cwd: cwd.clone(),
                    model: Some("composer-2.5".into()),
                    permission_mode: Some("yolo".into()),
                    allow_file_access: true,
                    extra_config: HashMap::new(),
                    ..AgentRuntimeConfig::default()
                })
                .await
                .expect("cursor runtime");
            let control = runtime.control();
            let _ = control
                .set_config(AgentRuntimeConfigUpdate {
                    permission_mode: Some("yolo".into()),
                    model: Some("composer-2.5".into()),
                    ..AgentRuntimeConfigUpdate::default()
                })
                .await;
            let prompt = r#"IMAGE PROTOCOL PROBE.

You MUST call the built-in generateImage tool exactly once.
Args:
- description: "minimal solid cyan square icon on white background"
- filename: "cursor-image-probe.png"  (basename only — do NOT include a directory path)
- aspect_ratio: "1:1" if supported

Do not write the PNG with Write/Shell. Do not call Grep/Glob/AskQuestion.
After generateImage completes, one short sentence and stop."#;
            let _ = send_and_drain(
                "cursor",
                &mut runtime,
                &control,
                prompt,
                Duration::from_secs(360),
            )
            .await;
        } else {
            append_jsonl(
                "cursor",
                json!({"phase":"skip","reason":"cursor-agent missing"}),
            );
        }
    }

    if enabled.contains(&"codex") {
        let _ = std::fs::remove_file(jsonl_path("codex"));
        eprintln!("\n===== CODEX view_image / imageGeneration =====");
        let provider = CodexNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd: cwd.clone(),
                model: Some("deepseek-v4-pro".into()),
                permission_mode: Some("yolo".into()),
                allow_file_access: true,
                extra_config: HashMap::new(),
                ..AgentRuntimeConfig::default()
            })
            .await
            .expect("codex runtime");
        let control = runtime.control();
        let _ = control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                model: Some("deepseek-v4-pro".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await;
        let prompt = format!(
            r#"IMAGE PROTOCOL PROBE — use Codex built-in tools only.

1) Call view_image (or imageView) on path "{png_abs}" (or {png_rel}). Do NOT cat/shell.
2) Do NOT invent imageGeneration — only view the existing image with view_image/imageView.
3) One sentence summary of tools used."#
        );
        let names = send_and_drain(
            "codex",
            &mut runtime,
            &control,
            &prompt,
            Duration::from_secs(360),
        )
        .await;
        if !names
            .iter()
            .any(|n| n == "imageView" || n == "view_image" || n.contains("image"))
        {
            let follow = format!(
                "ONLY call view_image / imageView on {png_abs}. No shell. One sentence after."
            );
            let _ = send_and_drain(
                "codex",
                &mut runtime,
                &control,
                &follow,
                Duration::from_secs(180),
            )
            .await;
        }
    }

    if enabled.contains(&"claude") {
        let _ = std::fs::remove_file(jsonl_path("claude"));
        eprintln!("\n===== CLAUDE image tool presence =====");
        let provider = ClaudeNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd: cwd.clone(),
                model: Some("deepseek-v4-pro".into()),
                permission_mode: Some("yolo".into()),
                allow_file_access: true,
                extra_config: HashMap::new(),
                ..AgentRuntimeConfig::default()
            })
            .await
            .expect("claude runtime");
        let control = runtime.control();
        let _ = control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                model: Some("deepseek-v4-pro".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await;
        let prompt = format!(
            r#"IMAGE PROTOCOL PROBE.

List whether you have ANY dedicated image generation or image viewing tools (names matter).
If you have generateImage / image_gen / view_image / ReadImage / similar: call ONE of them now.
- Prefer generate/view tools over shell.
- For view: use {png_rel}.
- For generate: save under ./tmp/ if the tool supports a path.
If you have NO image-specific tools, reply exactly: "NO_IMAGE_TOOLS" and stop. Do not invent tools."#
        );
        let _ = send_and_drain(
            "claude",
            &mut runtime,
            &control,
            &prompt,
            Duration::from_secs(240),
        )
        .await;
    }

    if enabled.contains(&"opencode") {
        let _ = std::fs::remove_file(jsonl_path("opencode"));
        eprintln!("\n===== OPENCODE image tool presence =====");
        let provider = OpenCodeNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd: cwd.clone(),
                model: Some("ds/deepseek-v4-pro".into()),
                permission_mode: Some("yolo".into()),
                allow_file_access: true,
                extra_config: HashMap::new(),
                ..AgentRuntimeConfig::default()
            })
            .await
            .expect("opencode runtime");
        let control = runtime.control();
        let _ = control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                model: Some("ds/deepseek-v4-pro".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await;
        let prompt = format!(
            r#"IMAGE PROTOCOL PROBE.

List whether you have ANY dedicated image generation or image viewing tools (names matter).
If you have generateImage / image_gen / view_image / ReadImage / similar: call ONE of them now.
- Prefer generate/view tools over shell.
- For view: use {png_rel}.
- For generate: save under ./tmp/ if the tool supports a path.
If you have NO image-specific tools, reply exactly: "NO_IMAGE_TOOLS" and stop. Do not invent tools."#
        );
        let _ = send_and_drain(
            "opencode",
            &mut runtime,
            &control,
            &prompt,
            Duration::from_secs(240),
        )
        .await;
    }

    if enabled.contains(&"pi") {
        let _ = std::fs::remove_file(jsonl_path("pi"));
        eprintln!("\n===== PI image tool presence =====");
        let provider = PiNativeProvider::new();
        let mut runtime = provider
            .create_runtime(AgentRuntimeConfig {
                cwd: cwd.clone(),
                model: Some("deepseek/deepseek-v4-pro".into()),
                permission_mode: Some("yolo".into()),
                allow_file_access: true,
                extra_config: HashMap::new(),
                ..AgentRuntimeConfig::default()
            })
            .await
            .expect("pi runtime");
        let control = runtime.control();
        let _ = control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                model: Some("deepseek/deepseek-v4-pro".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await;
        let prompt = format!(
            r#"IMAGE PROTOCOL PROBE.

List whether you have ANY dedicated image generation or image viewing tools (names matter).
If you have generateImage / image_gen / view_image / ReadImage / similar: call ONE of them now.
- Prefer generate/view tools over shell.
- For view: use {png_rel}.
- For generate: save under ./tmp/ if the tool supports a path.
If you have NO image-specific tools, reply exactly: "NO_IMAGE_TOOLS" and stop. Do not invent tools."#
        );
        let _ = send_and_drain(
            "pi",
            &mut runtime,
            &control,
            &prompt,
            Duration::from_secs(240),
        )
        .await;
    }

    eprintln!("\nimage probe jsonl written under tmp/image-probe-*.jsonl");
}
