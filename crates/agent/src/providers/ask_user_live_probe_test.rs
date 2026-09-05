//! Focused live Ask-User probes (ApprovalCard path).
//!
//! `ATMOS_LIVE_AGENT_CHAT=1 cargo test -p agent --lib providers::ask_user_live_probe_test -- --ignored --nocapture`

#![cfg(test)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::{timeout, Instant};

use crate::contract::{
    AgentEvent, AgentPrompt, AgentProvider, AgentRuntimeConfig, AgentRuntimeConfigUpdate, TurnStop,
};
use crate::providers::codex::CodexNativeProvider;
use crate::providers::grok::GrokNativeProvider;

const GROK_ASK: &str = r#"MAPPING AUDIT — Ask User only.

You MUST call the ask-user tool (`_x.ai/ask_user_question` / ask_user_question).
Ask exactly ONE multiple-choice question:
- question: "Pick a probe color?"
- options: Blue, Red

Do not write files. Do not call other tools. Stop and wait after asking."#;

const CODEX_PLAN_ASK: &str = r#"MAPPING AUDIT — Codex Plan Ask only.

You are in Plan mode. You MUST call the built-in `request_user_input` tool (interactive questioning).
Ask exactly ONE multiple-choice question:
- question: "Pick a probe color?"
- options: Blue (recommended for this probe), Red

Do not write files. Do not call other tools. Do not answer in plain text. Stop and wait after asking."#;

#[tokio::test]
#[ignore = "live Grok AskUser-only probe"]
async fn live_grok_ask_user_only() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    let provider = GrokNativeProvider::new();
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.clone(),
            model: Some("grok-4.5".into()),
            permission_mode: Some("ask_always".into()),
            allow_file_access: true,
            extra_config: HashMap::new(),
            ..AgentRuntimeConfig::default()
        })
        .await
        .expect("create_runtime");
    let control = runtime.control();
    let _ = control
        .set_config(AgentRuntimeConfigUpdate {
            model: Some("grok-4.5".into()),
            permission_mode: Some("ask_always".into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await;
    control
        .send(AgentPrompt {
            text: GROK_ASK.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");

    let deadline = Instant::now() + Duration::from_secs(120);
    let mut ask = 0usize;
    let mut answered = false;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        let Ok(Some(event)) =
            timeout(left.min(Duration::from_secs(30)), runtime.next_event()).await
        else {
            continue;
        };
        match &event.payload {
            AgentEvent::PermissionRequested { request } => {
                eprintln!(
                    "ASK tool={} questions={:?} desc={}",
                    request.tool, request.questions, request.description
                );
                if !request.questions.is_empty() {
                    ask += 1;
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
                    let option_id = format!(r#"answers:{{"{qid}":"{label}"}}"#);
                    eprintln!("ASK reply -> {option_id}");
                    control
                        .respond_permission(&request.request_id, &option_id)
                        .await
                        .expect("respond");
                    answered = true;
                } else {
                    let option_id = request
                        .options
                        .iter()
                        .find(|o| o.option_id.contains("allow"))
                        .map(|o| o.option_id.clone())
                        .unwrap_or_else(|| "allow_once".into());
                    let _ = control
                        .respond_permission(&request.request_id, &option_id)
                        .await;
                }
            }
            AgentEvent::TurnCompleted { stop, .. } => {
                eprintln!("TURN stop={stop:?} ask={ask} answered={answered}");
                if ask > 0 && answered {
                    break;
                }
                if matches!(
                    stop,
                    TurnStop::Completed | TurnStop::Failed | TurnStop::Canceled
                ) && ask == 0
                {
                    break;
                }
            }
            AgentEvent::SessionClosed => break,
            _ => {}
        }
    }
    eprintln!("DONE ask={ask} answered={answered}");
    assert!(
        ask > 0,
        "expected AskUser PermissionRequested with questions"
    );
    assert!(answered, "expected submit answers via respond_permission");
}

#[tokio::test]
#[ignore = "live Codex Plan-mode request_user_input probe"]
async fn live_codex_plan_request_user_input() {
    if std::env::var_os("ATMOS_LIVE_AGENT_CHAT").is_none() {
        eprintln!("skip: set ATMOS_LIVE_AGENT_CHAT=1");
        return;
    }
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    let model = std::env::var("ATMOS_LIVE_CODEX_MODEL").unwrap_or_else(|_| "gpt-5.4-mini".into());
    let provider = CodexNativeProvider::new();
    let mut runtime = provider
        .create_runtime(AgentRuntimeConfig {
            cwd: cwd.clone(),
            model: Some(model.clone()),
            mode: Some("plan".into()),
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
            model: Some(model.clone()),
            mode: Some("plan".into()),
            permission_mode: Some("ask_always".into()),
            ..AgentRuntimeConfigUpdate::default()
        })
        .await
    {
        Ok(()) => eprintln!("set_config ok (plan + {model})"),
        Err(error) => eprintln!("set_config soft-fail: {error}"),
    }
    control
        .send(AgentPrompt {
            text: CODEX_PLAN_ASK.into(),
            ..AgentPrompt::default()
        })
        .await
        .expect("send");

    let deadline = Instant::now() + Duration::from_secs(180);
    let mut ask = 0usize;
    let mut answered = false;
    let mut text = String::new();
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        let Ok(Some(event)) =
            timeout(left.min(Duration::from_secs(30)), runtime.next_event()).await
        else {
            continue;
        };
        match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => text.push_str(delta),
            AgentEvent::PermissionRequested { request } => {
                eprintln!(
                    "ASK tool={} questions={:?} desc={} markdown={:?}",
                    request.tool,
                    request.questions,
                    request.description,
                    request
                        .content_markdown
                        .as_deref()
                        .map(|s| &s[..s.len().min(120)])
                );
                if request.tool == "request_user_input" || !request.questions.is_empty() {
                    ask += 1;
                    let label = request
                        .questions
                        .first()
                        .and_then(|q| {
                            q.options
                                .iter()
                                .find(|opt| opt.to_ascii_lowercase().contains("blue"))
                                .or_else(|| q.options.first())
                        })
                        .cloned()
                        .unwrap_or_else(|| "Blue".into());
                    let qid = request
                        .questions
                        .first()
                        .map(|q| q.id.as_str())
                        .unwrap_or("0");
                    let option_id = format!(
                        r#"answers:{{"{qid}":{}}}"#,
                        serde_json::to_string(&label).unwrap()
                    );
                    eprintln!("ASK reply -> {option_id}");
                    control
                        .respond_permission(&request.request_id, &option_id)
                        .await
                        .expect("respond");
                    answered = true;
                } else {
                    let option_id = request
                        .options
                        .iter()
                        .find(|o| o.option_id == "accept" || o.option_id.contains("allow"))
                        .map(|o| o.option_id.clone())
                        .unwrap_or_else(|| "accept".into());
                    let _ = control
                        .respond_permission(&request.request_id, &option_id)
                        .await;
                }
            }
            AgentEvent::TurnCompleted { stop, .. } => {
                eprintln!(
                    "TURN stop={stop:?} ask={ask} answered={answered} text={}",
                    text.chars().take(200).collect::<String>()
                );
                if ask > 0 && answered {
                    break;
                }
                if matches!(
                    stop,
                    TurnStop::Completed | TurnStop::Failed | TurnStop::Canceled
                ) && ask == 0
                {
                    break;
                }
            }
            AgentEvent::SessionClosed => break,
            _ => {}
        }
    }
    eprintln!("DONE ask={ask} answered={answered}");
    assert!(
        ask > 0,
        "expected Plan-mode request_user_input PermissionRequested with questions"
    );
    assert!(answered, "expected submit answers via respond_permission");
}
