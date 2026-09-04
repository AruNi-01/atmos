//! Live AgentProvider chat smoke: create session → optional permission SetConfig →
//! send the tool-format probe prompt → assert a non-empty assistant reply (or tools).
//!
//! Run:
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::live_chat_tests -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::process::Command;
use tokio::time::{timeout, Instant};

use crate::acp_client::AcpToolHandler;
use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntime, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, TurnStop,
};
use crate::models::AgentLaunchSpec;
use crate::providers::acp::{AcpAgentProvider, AcpProviderParams};
use crate::providers::claude::ClaudeNativeProvider;
use crate::providers::codex::CodexNativeProvider;
use crate::providers::grok::GrokNativeProvider;
use crate::providers::opencode::OpenCodeNativeProvider;
use crate::providers::pi::PiNativeProvider;

const TOOL_FORMAT_PROMPT: &str = "运行你所有的 tool，我正在做测试，看看你的 tool 格式长什么样。";

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
            // Dangling / leaf symlinks must not fall through to parent+name —
            // `write` would follow the link outside the workspace.
            if candidate
                .symlink_metadata()
                .map(|meta| meta.file_type().is_symlink())
                .unwrap_or(false)
            {
                return session_cwd.join("denied");
            }
            // Still-uncreated paths: require a canonical parent under cwd.
            let Some(parent) = candidate.parent() else {
                return session_cwd.join("denied");
            };
            let Ok(parent) = parent.canonicalize() else {
                return session_cwd.join("denied");
            };
            if parent.starts_with(&session_cwd) {
                return parent.join(
                    candidate
                        .file_name()
                        .unwrap_or_else(|| std::ffi::OsStr::new("denied")),
                );
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
        std::fs::read_to_string(path).map_err(|error| error.to_string())
    }

    async fn write_text_file(&self, path: &Path, content: &str) -> Result<(), String> {
        if path
            .symlink_metadata()
            .map(|meta| meta.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("refusing to write through a symlink".into());
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(path, content).map_err(|error| error.to_string())
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

fn live_enabled() -> bool {
    std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_some()
}

fn base_cfg(cwd: PathBuf) -> AgentRuntimeConfig {
    AgentRuntimeConfig {
        cwd,
        model: None,
        thinking: None,
        mode: None,
        permission_mode: Some("ask_always".into()),
        fast: None,
        extra_config: HashMap::new(),
        env_overrides: None,
        auth_method_id: None,
        allow_file_access: true,
        checkpoints: Vec::new(),
    }
}

async fn drain_until_complete(
    runtime: &mut Box<dyn AgentRuntime>,
    turn_id: &str,
    deadline: Instant,
) -> Result<(String, Vec<String>, TurnStop), String> {
    let control = runtime.control();
    let mut text = String::new();
    let mut tools = Vec::new();
    let mut stop = None;
    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(12), runtime.next_event()).await {
            Err(_) => continue,
            Ok(None) => {
                return Err("agent session closed before turn completed".into());
            }
            Ok(Some(event)) => event,
        };

        match event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(&delta),
            AgentEvent::ToolCallStarted { tool_call, .. } => {
                tools.push(format!("{:?}:{}", tool_call.kind, tool_call.name));
            }
            AgentEvent::PermissionRequested { request } => {
                let option_id = request
                    .options
                    .iter()
                    .find(|option| {
                        let id = option.option_id.to_ascii_lowercase();
                        id.contains("allow") && !id.contains("reject")
                    })
                    .or_else(|| request.options.first())
                    .map(|option| option.option_id.clone())
                    .unwrap_or_else(|| "allow_once".into());
                eprintln!(
                    "  permission {} -> {option_id} ({})",
                    request.request_id, request.description
                );
                control
                    .respond_permission(&request.request_id, &option_id)
                    .await
                    .map_err(|error| error.to_string())?;
            }
            AgentEvent::TurnCompleted {
                turn_id: completed,
                stop: completed_stop,
            } if completed == turn_id => {
                stop = Some(completed_stop);
                break;
            }
            AgentEvent::TurnFailed { error, .. } => {
                return Err(format!("turn failed: {error}"));
            }
            other => {
                eprintln!("  event: {other:?}");
            }
        }
    }
    let stop = stop.ok_or_else(|| "turn did not complete before deadline".to_string())?;
    Ok((text, tools, stop))
}

async fn run_provider_chat(
    label: &str,
    provider: Arc<dyn AgentProvider>,
    mut cfg: AgentRuntimeConfig,
    permission_mode: PermissionApply,
) -> Result<(), String> {
    eprintln!("=== live chat: {label} ===");
    let mut runtime = match provider.create_runtime(cfg.clone()).await {
        Ok(runtime) => runtime,
        Err(error) => return classify_env_issue(label, &format!("create_runtime: {error}")),
    };
    let control = runtime.control();
    match permission_mode {
        PermissionApply::Skip => {}
        PermissionApply::Required | PermissionApply::BestEffort => {
            match control
                .set_config(AgentRuntimeConfigUpdate {
                    permission_mode: Some("yolo".into()),
                    ..AgentRuntimeConfigUpdate::default()
                })
                .await
            {
                Ok(()) => eprintln!("  set_config(permission_mode=yolo) ok"),
                Err(error) if matches!(permission_mode, PermissionApply::Required) => {
                    return Err(format!("set_config permission_mode=yolo: {error}"));
                }
                Err(error) => {
                    eprintln!("  set_config(permission_mode=yolo) soft-fail: {error}");
                }
            }
        }
    }
    let sent = match control
        .send(AgentPrompt {
            text: TOOL_FORMAT_PROMPT.into(),
            ..AgentPrompt::default()
        })
        .await
    {
        Ok(sent) => sent,
        Err(error) => return classify_env_issue(label, &format!("send: {error}")),
    };
    let deadline = Instant::now() + Duration::from_secs(180);
    let (text, tools, stop) =
        match drain_until_complete(&mut runtime, &sent.turn_id, deadline).await {
            Ok(result) => result,
            Err(error) => {
                let _ = control.close().await;
                return classify_env_issue(label, &error);
            }
        };
    let _ = control.close().await;
    eprintln!(
        "  stop={stop:?} text_len={} tools={tools:?} snippet={:?}",
        text.chars().count(),
        text.chars().take(160).collect::<String>()
    );
    if text.trim().is_empty() && tools.is_empty() {
        return Err("expected assistant text or tool calls".into());
    }
    if stop != TurnStop::Completed && stop != TurnStop::Canceled {
        return Err(format!("unexpected stop {stop:?}"));
    }
    let _ = cfg.permission_mode.take();
    Ok(())
}

/// Auth / billing / plan gates are environment skips, not Atmos path failures.
fn classify_env_issue(label: &str, error: &str) -> Result<(), String> {
    let lower = error.to_ascii_lowercase();
    let skip = lower.contains("auth_required")
        || lower.contains("authentication required")
        || lower.contains("api key")
        || lower.contains("套餐已到期")
        || lower.contains("upgrade your plan")
        || lower.contains("rate limit")
        || lower.contains("quota")
        || lower.contains("billing");
    if skip {
        eprintln!("  env-skip {label}: {error}");
        Err(format!("SKIP:{error}"))
    } else {
        Err(error.to_string())
    }
}

fn record_result(
    label: &'static str,
    result: Result<(), String>,
    passed: &mut Vec<&'static str>,
    skipped: &mut Vec<String>,
    failures: &mut Vec<String>,
) {
    match result {
        Ok(()) => passed.push(label),
        Err(error) if error.starts_with("SKIP:") => {
            skipped.push(format!("{label} ({})", error.trim_start_matches("SKIP:")));
        }
        Err(error) => failures.push(format!("{label}: {error}")),
    }
}

#[derive(Clone, Copy)]
enum PermissionApply {
    Skip,
    BestEffort,
    Required,
}

#[tokio::test]
#[ignore = "live multi-agent chat"]
async fn live_multi_agent_chat_tool_format_prompt() {
    if !live_enabled() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1 to run");
        return;
    }

    let dir = tempfile::tempdir().expect("tempdir");
    let cwd = dir.path().to_path_buf();
    let mut failures = Vec::new();
    let mut skipped = Vec::new();
    let mut passed = Vec::new();

    // --- Cursor ACP (permission must not guess unknown configIds) ---
    if which("cursor-agent").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(AcpAgentProvider::new(AcpProviderParams {
            provider_id: "cursor".into(),
            launch_spec: AgentLaunchSpec {
                program: which("cursor-agent").unwrap(),
                args: vec!["acp".into()],
                env: None,
            },
            env_overrides: None,
            default_config: None,
            tool_handler: Arc::new(LiveFsHandler),
        }));
        record_result(
            "cursor",
            run_provider_chat(
                "cursor",
                provider,
                base_cfg(cwd.clone()),
                PermissionApply::Required,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("cursor (missing cursor-agent)".into());
    }

    // --- Native hosts ---
    if which("claude").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(ClaudeNativeProvider::new());
        record_result(
            "claude",
            run_provider_chat(
                "claude",
                provider,
                base_cfg(cwd.clone()),
                PermissionApply::Required,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("claude (missing binary)".into());
    }

    if which("codex").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(CodexNativeProvider::new());
        record_result(
            "codex",
            run_provider_chat(
                "codex",
                provider,
                base_cfg(cwd.clone()),
                PermissionApply::BestEffort,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("codex (missing binary)".into());
    }

    if which("opencode").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(OpenCodeNativeProvider::new());
        record_result(
            "opencode",
            run_provider_chat(
                "opencode",
                provider,
                base_cfg(cwd.clone()),
                PermissionApply::Skip,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("opencode (missing binary)".into());
    }

    if which("pi").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(PiNativeProvider::new());
        record_result(
            "pi",
            run_provider_chat("pi", provider, base_cfg(cwd.clone()), PermissionApply::Skip).await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("pi (missing binary)".into());
    }

    if which("grok").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(GrokNativeProvider::new());
        record_result(
            "grok",
            run_provider_chat(
                "grok",
                provider,
                base_cfg(cwd.clone()),
                PermissionApply::Required,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("grok (missing binary)".into());
    }

    // --- Gemini ACP ---
    if which("gemini").is_some() {
        let provider: Arc<dyn AgentProvider> = Arc::new(AcpAgentProvider::new(AcpProviderParams {
            provider_id: "gemini".into(),
            launch_spec: AgentLaunchSpec {
                program: which("gemini").unwrap(),
                args: vec!["--acp".into()],
                env: None,
            },
            env_overrides: None,
            default_config: None,
            tool_handler: Arc::new(LiveFsHandler),
        }));
        record_result(
            "gemini",
            run_provider_chat(
                "gemini",
                provider,
                base_cfg(cwd),
                PermissionApply::BestEffort,
            )
            .await,
            &mut passed,
            &mut skipped,
            &mut failures,
        );
    } else {
        skipped.push("gemini (missing binary)".into());
    }

    eprintln!("passed={passed:?}");
    eprintln!("skipped={skipped:?}");
    eprintln!("failures={failures:?}");
    assert!(
        failures.is_empty(),
        "live agent chat failures: {failures:?}; skipped={skipped:?}; passed={passed:?}"
    );
    assert!(!passed.is_empty(), "no agents ran; skipped={skipped:?}");
}

#[tokio::test]
#[ignore = "live cursor ACP permission"]
async fn live_cursor_permission_set_config_is_ok() {
    if !live_enabled() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1 to run");
        return;
    }
    let Some(program) = which("cursor-agent") else {
        eprintln!("skip: cursor-agent missing");
        return;
    };
    let dir = tempfile::tempdir().expect("tempdir");
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
    let runtime = provider
        .create_runtime(base_cfg(dir.path().to_path_buf()))
        .await
        .expect("create_runtime");
    let control = runtime.control();
    control
        .set_config(AgentRuntimeConfigUpdate {
            permission_mode: Some("auto".into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await
        .expect("cursor permission set_config must no-op successfully");
    control
        .set_config(AgentRuntimeConfigUpdate {
            mode: Some("plan".into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await
        .expect("cursor mode=plan");
    let _ = control.close().await;
}

#[tokio::test]
#[ignore = "live claude/grok permission SetConfig"]
async fn live_claude_grok_permission_set_config_is_ok() {
    if !live_enabled() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1 to run");
        return;
    }
    let dir = tempfile::tempdir().expect("tempdir");
    let cwd = dir.path().to_path_buf();
    let mut checked = 0usize;

    if which("claude").is_some() {
        checked += 1;
        let provider = ClaudeNativeProvider::new();
        let runtime = provider
            .create_runtime(base_cfg(cwd.clone()))
            .await
            .expect("claude create_runtime");
        let control = runtime.control();
        control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("claude permission set_config must succeed (soft no-op ok)");
        let _ = control.close().await;
        eprintln!("claude permission set_config ok");
    } else {
        eprintln!("skip: claude missing");
    }

    if which("grok").is_some() {
        checked += 1;
        let provider = GrokNativeProvider::new();
        let runtime = provider
            .create_runtime(base_cfg(cwd))
            .await
            .expect("grok create_runtime");
        let control = runtime.control();
        control
            .set_config(AgentRuntimeConfigUpdate {
                permission_mode: Some("yolo".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("grok permission set_config must apply /always-approve slash");
        control
            .set_config(AgentRuntimeConfigUpdate {
                mode: Some("plan".into()),
                ..AgentRuntimeConfigUpdate::default()
            })
            .await
            .expect("grok mode=plan via session/set_mode");
        let _ = control.close().await;
        eprintln!("grok permission/mode set_config ok");
    } else {
        eprintln!("skip: grok missing");
    }

    assert!(checked > 0, "no claude/grok binary available");
}

#[tokio::test]
#[ignore = "live CLI probe; run with ATMOS_LIVE_AGENT_CHAT=1 -- --ignored"]
async fn cursor_agent_acp_help_mentions_acp_when_binary_present() {
    if !live_enabled() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1 to run");
        return;
    }
    let Some(program) = which("cursor-agent") else {
        eprintln!("skip: cursor-agent missing");
        return;
    };
    let output = Command::new(program)
        .args(["acp", "--help"])
        .output()
        .await
        .expect("cursor-agent acp --help");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.to_ascii_lowercase().contains("acp"),
        "unexpected help: {stdout}"
    );
}
