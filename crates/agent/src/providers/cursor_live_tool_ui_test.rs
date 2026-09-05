//! Forced live Cursor ACP gap probe (AskUser / MCP / Grep+Glob+Delete).
//!
//! Skips generateImage (no Media kind this phase).
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::cursor_live_tool_ui_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::time::{timeout, Instant};

use crate::acp_client::AcpToolHandler;
use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntime, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, AgentToolKind, TurnStop,
};
use crate::models::AgentLaunchSpec;
use crate::providers::acp::{AcpAgentProvider, AcpProviderParams};

/// Turn A — must invoke AskQuestion tool (never prose-only questions).
const PROMPT_ASK: &str = r#"MAPPING AUDIT — AskQuestion tool only.

You MUST call the built-in AskQuestion tool (also known as AskUserQuestion / request_user_input if that is the name in your schema).
Do NOT ask in assistant text. Do NOT write files. Do NOT call Grep/Glob/Delete/Shell/MCP/generateImage.

AskQuestion payload:
- prompt: "Pick a probe color?"
- options: ["Blue", "Red"]

Call AskQuestion once, then stop and wait for the tool result."#;

/// Turn B — MCP (if any) + Grep/Glob/Delete under ./tmp. No generateImage.
const PROMPT_FS_MCP: &str = r#"MAPPING AUDIT — continue. Answer to the color question is Blue if still pending.

Do ONLY these steps. Do NOT call generateImage. Do NOT ask more questions.

1) If MCP tools exist: call ListMcpResources once OR CallMcpTool once on any available MCP tool. If no MCP is available, write one short sentence "MCP unavailable" and continue.
2) Under ./tmp/ only (use built-in tools, NOT shell find/rg/rm):
   - Write `./tmp/cursor-probe-seed.txt` with content exactly: cursor-probe
   - Glob pattern `cursor-probe*` targeting `./tmp`
   - Grep pattern `cursor-probe` under `./tmp`
   - Delete `./tmp/cursor-probe-seed.txt`
3) Stop."#;

/// Valid Cursor ACP model id (`cursor-agent --list-models`).
const MODEL: &str = "composer-2.5";

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
            if candidate
                .symlink_metadata()
                .map(|meta| meta.file_type().is_symlink())
                .unwrap_or(false)
            {
                return session_cwd.join("denied");
            }
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

#[derive(Default)]
struct TurnStats {
    text: String,
    tools: Vec<String>,
    kinds: Vec<AgentToolKind>,
    other_names: Vec<String>,
    plans: usize,
    ask_user: usize,
    permissions: usize,
    stop: Option<TurnStop>,
}

async fn drain_turn(
    runtime: &mut Box<dyn AgentRuntime>,
    control: &crate::contract::AgentRuntimeControl,
    turn_id: &str,
    budget: Duration,
) -> TurnStats {
    let deadline = Instant::now() + budget;
    let mut stats = TurnStats::default();
    while Instant::now() < deadline {
        let event = match timeout(Duration::from_secs(30), runtime.next_event()).await {
            Err(_) => continue,
            Ok(None) => break,
            Ok(Some(event)) => event,
        };
        match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => stats.text.push_str(delta),
            AgentEvent::ThinkingDelta { delta, .. } => {
                eprintln!("thinking_delta len={}", delta.chars().count());
            }
            AgentEvent::PlanUpdated { plan } => {
                stats.plans += 1;
                eprintln!("PLAN {plan}");
            }
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
                    stats.kinds.push(tool_call.kind);
                    if tool_call.kind == AgentToolKind::Other {
                        stats.other_names.push(tool_call.name.clone());
                    }
                }
                stats.tools.push(line);
            }
            AgentEvent::PermissionRequested { request } => {
                stats.permissions += 1;
                if !request.questions.is_empty() {
                    stats.ask_user += 1;
                    eprintln!(
                        "ASK_USER {} questions={:?} desc={}",
                        request.request_id, request.questions, request.description
                    );
                } else {
                    eprintln!(
                        "permission {} tool={:?} options={:?} ({})",
                        request.request_id,
                        request.tool,
                        request
                            .options
                            .iter()
                            .map(|o| o.option_id.as_str())
                            .collect::<Vec<_>>(),
                        request.description
                    );
                }
                let option_id = if !request.questions.is_empty() {
                    // Prefer first question's first option via answers:{json}.
                    let label = request
                        .questions
                        .first()
                        .and_then(|q| q.options.first())
                        .cloned()
                        .unwrap_or_else(|| "Blue".into());
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
                                && !id.contains("decline")
                        })
                        .or_else(|| {
                            request
                                .options
                                .iter()
                                .find(|option| !crate::map::is_ask_reject_option(&option.option_id))
                        })
                        .or_else(|| request.options.first())
                        .map(|option| option.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into())
                };
                eprintln!("permission {} -> {option_id}", request.request_id);
                control
                    .respond_permission(&request.request_id, &option_id)
                    .await
                    .expect("respond_permission");
            }
            AgentEvent::TurnCompleted {
                turn_id: completed,
                stop: completed_stop,
            } if *completed == turn_id => {
                stats.stop = Some(*completed_stop);
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
    stats
}

#[tokio::test]
#[ignore = "live Cursor ACP tool UI probe"]
async fn live_cursor_acp_tool_ui_probe() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let Some(program) = which("cursor-agent") else {
        eprintln!("skip: cursor-agent missing");
        return;
    };

    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    std::fs::create_dir_all(cwd.join("tmp")).expect("tmp");

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

    eprintln!("===== TURN A: AskQuestion =====");
    let sent_a = control
        .send(AgentPrompt {
            text: PROMPT_ASK.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send ask");
    eprintln!("turn_id_a={}", sent_a.turn_id);
    let a = drain_turn(
        &mut runtime,
        &control,
        &sent_a.turn_id,
        Duration::from_secs(240),
    )
    .await;
    eprintln!(
        "TURN_A stop={:?} tools={} ask_user={} permissions={} kinds={:?} other={:?} snippet={:?}",
        a.stop,
        a.tools.len(),
        a.ask_user,
        a.permissions,
        a.kinds,
        a.other_names,
        a.text.chars().take(200).collect::<String>()
    );

    eprintln!("===== TURN B: MCP + Grep/Glob/Delete =====");
    let sent_b = control
        .send(AgentPrompt {
            text: PROMPT_FS_MCP.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send fs/mcp");
    eprintln!("turn_id_b={}", sent_b.turn_id);
    let b = drain_turn(
        &mut runtime,
        &control,
        &sent_b.turn_id,
        Duration::from_secs(360),
    )
    .await;
    let _ = control.close().await;

    let mut kinds = a.kinds.clone();
    kinds.extend(b.kinds.iter().copied());
    let mut other_names = a.other_names.clone();
    other_names.extend(b.other_names.iter().cloned());
    let ask_user = a.ask_user + b.ask_user;
    let permissions = a.permissions + b.permissions;
    let tools = a.tools.len() + b.tools.len();
    let plans = a.plans + b.plans;

    eprintln!(
        "DONE ask_user={ask_user} permissions={permissions} tools={tools} plans={plans} completed_kinds={kinds:?} other_names={other_names:?} turn_b_stop={:?} snippet_b={:?}",
        b.stop,
        b.text.chars().take(240).collect::<String>()
    );

    let has_search = kinds.iter().any(|k| matches!(k, AgentToolKind::Search));
    let has_delete = kinds.iter().any(|k| matches!(k, AgentToolKind::Delete));
    let has_mcp = kinds
        .iter()
        .any(|k| matches!(k, AgentToolKind::McpList | AgentToolKind::McpCall));
    eprintln!(
        "COVERAGE ask_user={} search={} delete={} mcp={} (mcp may be unavailable)",
        ask_user > 0,
        has_search,
        has_delete,
        has_mcp
    );

    assert!(
        tools > 0 || !a.text.trim().is_empty() || !b.text.trim().is_empty() || plans > 0,
        "expected tools, plan, or text"
    );
    assert!(
        matches!(b.stop, Some(TurnStop::Completed) | Some(TurnStop::Canceled))
            || matches!(a.stop, Some(TurnStop::Completed) | Some(TurnStop::Canceled)),
        "unexpected stop a={:?} b={:?}",
        a.stop,
        b.stop
    );
}
