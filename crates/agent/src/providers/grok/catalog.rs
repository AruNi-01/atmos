//! Short-lived Chat spawn catalog probe: initialize + `session/new`, then close.
//!
//! Model ids stay on `grok models` CLI. Per-model thinking comes from
//! `session/new` `availableModels[]._meta.reasoningEfforts` when present.
//! Slash commands come from initialize `_meta.availableCommands` (builtins)
//! and `session/update` `available_commands_update` (builtins + skills).
//! Live Grok 1.0.13 session/new on this machine.

use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;

use crate::catalog::engine::NativeProbeResult;
use crate::catalog::parse::commands_from_value;
use crate::catalog::{config_options_from_session_payload, probe_result_from_config_options};
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};

use super::rpc::{initialize_request, jsonrpc_request, session_new_params};
use super::spawn::spawn_stdio;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const INIT_ID: u64 = 1;
const SESSION_ID: u64 = 2;

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native Grok catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    let spawned =
        spawn_stdio(Path::new("grok"), isolated_cwd).map_err(|error| error.to_string())?;
    let mut stdin = spawned.stdin;
    let stdout = spawned.stdout;
    let mut child = spawned.child;
    let stderr = spawned.stderr;
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = Vec::new();
        loop {
            line.clear();
            if reader.read_until(b'\n', &mut line).await.unwrap_or(0) == 0 {
                break;
            }
        }
    });

    if let Err(error) = write_json(&mut stdin, &initialize_request(INIT_ID)).await {
        let _ = stdin.shutdown().await;
        let _ = close_child(&mut child).await;
        return Err(error);
    }

    let mut reader = BufReader::new(stdout);
    let mut buf = Vec::new();
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let mut commands = Vec::new();
    let mut saw_init = false;
    let mut sent_session = false;
    let mut saw_session_commands = false;
    let mut session_new_result: Option<Value> = None;
    let mut session_sent_at: Option<Instant> = None;

    while Instant::now() < deadline {
        if session_sent_at.is_some_and(|sent| sent.elapsed() > Duration::from_secs(4)) {
            break;
        }
        buf.clear();
        match timeout(
            Duration::from_millis(250),
            reader.read_until(b'\n', &mut buf),
        )
        .await
        {
            Ok(Ok(0)) => break,
            Ok(Ok(_)) => {
                if buf.last() == Some(&b'\n') {
                    buf.pop();
                }
                if buf.is_empty() {
                    continue;
                }
                let Ok(frame) = serde_json::from_slice::<Value>(&buf) else {
                    continue;
                };
                if !saw_init && rpc_id_u64(&frame) == Some(INIT_ID) {
                    if frame.get("error").is_some() {
                        let _ = stdin.shutdown().await;
                        let _ = close_child(&mut child).await;
                        return Err("grok initialize returned JSON-RPC error".into());
                    }
                    if let Some(result) = frame.get("result") {
                        commands = commands_from_initialize_result(result);
                        saw_init = true;
                    }
                }
                if let Some(session_commands) = commands_from_session_update_frame(&frame) {
                    if !session_commands.is_empty() {
                        commands = session_commands;
                        saw_session_commands = true;
                    }
                }
                if rpc_id_u64(&frame) == Some(SESSION_ID) {
                    if let Some(result) = frame.get("result") {
                        session_new_result = Some(result.clone());
                    }
                }
                if saw_init && !sent_session {
                    sent_session = true;
                    session_sent_at = Some(Instant::now());
                    let cwd = isolated_cwd.to_string_lossy().into_owned();
                    if let Err(_error) = write_json(
                        &mut stdin,
                        &jsonrpc_request(SESSION_ID, "session/new", session_new_params(&cwd)),
                    )
                    .await
                    {
                        break;
                    }
                }
                if saw_session_commands {
                    break;
                }
            }
            Ok(Err(error)) => {
                let _ = stdin.shutdown().await;
                let _ = close_child(&mut child).await;
                return Err(error.to_string());
            }
            Err(_) => {
                if saw_session_commands {
                    break;
                }
            }
        }
    }

    let _ = stdin.shutdown().await;
    let closed = close_child(&mut child).await;
    if !saw_init {
        return Err("grok initialize did not return a result".into());
    }
    let options = session_new_result
        .as_ref()
        .map(config_options_from_session_payload)
        .unwrap_or_default();
    let probed = probe_result_from_config_options(&options, isolated_cwd.to_path_buf(), closed);
    let _ = probed;
    let models = session_new_result
        .as_ref()
        .map(models_from_session_new)
        .unwrap_or_default();
    Ok(NativeProbeResult {
        models,
        modes: grok_modes(),
        permission_modes: grok_permission_modes(),
        thinking: AgentThinkingSupport::None,
        commands,
        cwd: isolated_cwd.to_path_buf(),
        closed,
    })
}

pub(crate) fn models_from_session_new(result: &Value) -> Vec<AgentModel> {
    let Some(models) = result.get("models") else {
        return Vec::new();
    };
    let current = models.get("currentModelId").and_then(Value::as_str);
    let items = models
        .get("availableModels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for item in items {
        let id = item
            .get("modelId")
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let label = item
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| !name.is_empty())
            .unwrap_or(&id)
            .to_string();
        let meta = item.get("_meta").unwrap_or(&item);
        out.push(AgentModel {
            id: id.clone(),
            label,
            group: None,
            is_default: current == Some(id.as_str()),
            thinking: thinking_from_reasoning_efforts(meta),
        });
    }
    out
}

fn thinking_from_reasoning_efforts(meta: &Value) -> Option<AgentThinkingSupport> {
    let efforts = meta.get("reasoningEfforts").and_then(Value::as_array)?;
    let mut options = Vec::new();
    for item in efforts {
        let Some(id) = item
            .get("value")
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            .or_else(|| item.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if !options.iter().any(|existing| existing == id) {
            options.push(id.to_string());
        }
    }
    if options.is_empty() {
        None
    } else {
        Some(AgentThinkingSupport::Enum {
            arg: Some("thinking".into()),
            options,
        })
    }
}

pub(crate) fn grok_permission_modes() -> Vec<AgentMode> {
    crate::policy::advertised_permission_modes("grok")
}

pub(crate) fn grok_modes() -> Vec<AgentMode> {
    crate::policy::default_collaboration_modes()
}

async fn write_json(stdin: &mut tokio::process::ChildStdin, value: &Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .await
        .map_err(|error| error.to_string())?;
    stdin.flush().await.map_err(|error| error.to_string())
}

fn rpc_id_u64(frame: &Value) -> Option<u64> {
    let id = frame.get("id")?;
    id.as_u64()
        .or_else(|| id.as_i64().and_then(|n| u64::try_from(n).ok()))
}

async fn close_child(child: &mut tokio::process::Child) -> bool {
    let _ = child.start_kill();
    timeout(Duration::from_secs(2), child.wait()).await.is_ok()
}

pub(crate) fn commands_from_initialize_result(
    result: &Value,
) -> Vec<crate::contract::AgentAvailableCommand> {
    let meta = result.get("_meta").unwrap_or(result);
    if let Some(commands) = meta
        .get("availableCommands")
        .or_else(|| meta.get("available_commands"))
    {
        return commands_from_value(commands);
    }
    commands_from_value(result)
}

pub(crate) fn commands_from_session_update_frame(
    frame: &Value,
) -> Option<Vec<crate::contract::AgentAvailableCommand>> {
    if frame.get("method").and_then(Value::as_str) != Some("session/update") {
        return None;
    }
    let update = frame.get("params")?.get("update")?;
    let kind = update.get("sessionUpdate").and_then(Value::as_str)?;
    if kind != "available_commands_update" && kind != "available_commands_updated" {
        return None;
    }
    let commands = update
        .get("availableCommands")
        .or_else(|| update.get("available_commands"))?;
    Some(commands_from_value(commands))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_meta_fixture_reads_builtins_and_nested_hint() {
        let result: Value =
            serde_json::from_str(include_str!("testdata/initialize_meta.json")).expect("fixture");
        let commands = commands_from_initialize_result(&result);
        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].name, "compact");
        assert_eq!(
            commands[0].hint.as_deref(),
            Some("optional context about what to preserve")
        );
        assert_eq!(commands[1].name, "goal");
        assert!(commands[1].hint.is_none());
        assert!(!commands.iter().any(|command| command.name == "fork"));
    }

    #[test]
    fn session_update_fixture_replaces_with_skills() {
        let frame: Value =
            serde_json::from_str(include_str!("testdata/available_commands_update.json"))
                .expect("fixture");
        let commands = commands_from_session_update_frame(&frame).expect("commands");
        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].name, "compact");
        assert_eq!(commands[1].name, "wrangler");
        assert_eq!(
            commands[0].hint.as_deref(),
            Some("optional context about what to preserve")
        );
    }

    #[test]
    fn empty_config_options_stamp_documented_permission_modes() {
        let modes = grok_permission_modes();
        assert_eq!(
            modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "accept_edits", "auto", "ask_always"]
        );
        assert_eq!(modes[0].label, "Yolo");
        assert!(modes
            .iter()
            .any(|mode| mode.id == "ask_always" && mode.is_default));
        assert_eq!(
            grok_modes()
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["default", "plan"]
        );
        assert!(
            probe_result_from_config_options(&[], std::path::PathBuf::from("/tmp"), true)
                .permission_modes
                .is_empty()
        );
    }

    #[test]
    fn session_new_attaches_per_model_reasoning_efforts() {
        let result = serde_json::json!({
            "sessionId": "ses_1",
            "models": {
                "currentModelId": "grok-4.5",
                "availableModels": [
                    {
                        "modelId": "grok-4.6",
                        "name": "Grok 4.6",
                        "_meta": {
                            "reasoningEfforts": [
                                { "id": "xhigh", "value": "xhigh" },
                                { "id": "high", "value": "high" },
                                { "id": "medium", "value": "medium" },
                                { "id": "low", "value": "low" }
                            ]
                        }
                    },
                    {
                        "modelId": "grok-4.5",
                        "name": "Grok 4.5",
                        "_meta": {
                            "reasoningEfforts": [
                                { "id": "high", "value": "high" },
                                { "id": "medium", "value": "medium" },
                                { "id": "low", "value": "low" }
                            ]
                        }
                    }
                ]
            }
        });
        let models = models_from_session_new(&result);
        assert_eq!(models.len(), 2);
        assert!(!models[0].is_default);
        assert!(models[1].is_default);
        match &models[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["xhigh", "high", "medium", "low"]);
            }
            other => panic!("expected 4.6 efforts, got {other:?}"),
        }
        match &models[1].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["high", "medium", "low"]);
            }
            other => panic!("expected 4.5 efforts, got {other:?}"),
        }
    }

    #[test]
    fn session_new_config_options_map_permission_mode() {
        let payload = serde_json::json!({
            "sessionId": "ses_1",
            "configOptions": [{
                "id": "permissionMode",
                "name": "Permission",
                "currentValue": "default",
                "options": [
                    { "value": "default", "name": "Normal" },
                    { "value": "plan", "name": "Plan" }
                ]
            }]
        });
        let options = config_options_from_session_payload(&payload);
        let probed =
            probe_result_from_config_options(&options, std::path::PathBuf::from("/tmp"), true);
        assert_eq!(probed.permission_modes.len(), 1);
        assert_eq!(probed.permission_modes[0].id, "ask_always");
        assert_eq!(probed.modes.len(), 1);
        assert_eq!(probed.modes[0].id, "plan");
    }
}
