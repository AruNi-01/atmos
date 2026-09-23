//! Short-lived Chat spawn catalog probe: initialize + `session/new`, then close.
//!
//! Model ids stay on `grok models` CLI. Per-model thinking comes from live
//! `availableModels[]._meta.reasoningEfforts` on initialize `modelState`,
//! `session/new`, and `_x.ai/models/update`. Do not invent ladders from model ids.
//! Context windows come from the same `_meta.totalContextTokens`.
//! Slash commands come from initialize `_meta.availableCommands` (builtins)
//! and `session/update` `available_commands_update` (builtins + skills).

use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;

use crate::acp_client::auth_methods_from_json;
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
use crate::options::probe::auth::auth_required_from_methods;
use crate::options::probe::cli::parse::commands_from_value;
use crate::options::probe::native::NativeOptionsProbeResult;
use crate::options::{
    config_options_from_session_payload, probe_result_from_config_options, sort_thinking_levels,
};

use super::rpc::{initialize_request, jsonrpc_request, session_new_params};
use super::spawn::spawn_stdio;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const INIT_ID: u64 = 1;
const SESSION_ID: u64 = 2;

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeOptionsProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native Grok catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeOptionsProbeResult, String> {
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
    let mut models = Vec::new();
    let mut saw_init = false;
    let mut sent_session = false;
    let mut saw_session_commands = false;
    let mut session_new_result: Option<Value> = None;
    let mut session_sent_at: Option<Instant> = None;
    let mut auth_methods = Vec::new();
    let mut session_error: Option<String> = None;

    while Instant::now() < deadline {
        // Commands can arrive before `session/new`. Keep reading until we have a
        // live model catalog (initialize `modelState` / session/new / models/update).
        if !models.is_empty()
            && (saw_session_commands
                || session_sent_at.is_some_and(|sent| sent.elapsed() > Duration::from_secs(4)))
        {
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
                    if let Some(error) = frame.get("error") {
                        let _ = stdin.shutdown().await;
                        let _ = close_child(&mut child).await;
                        return Err(jsonrpc_error_to_probe_error("grok", error, Vec::new()));
                    }
                    if let Some(result) = frame.get("result") {
                        commands = commands_from_initialize_result(result);
                        auth_methods = auth_methods_from_json(result);
                        overlay_grok_models(&mut models, &models_from_grok_catalog(result));
                        saw_init = true;
                    }
                }
                if let Some(session_commands) = commands_from_session_update_frame(&frame) {
                    if !session_commands.is_empty() {
                        commands = session_commands;
                        saw_session_commands = true;
                    }
                }
                if let Some(method) = frame.get("method").and_then(Value::as_str) {
                    if is_models_update_method(method) {
                        if let Some(params) = frame.get("params") {
                            overlay_grok_models(&mut models, &models_from_grok_catalog(params));
                        }
                    }
                }
                if rpc_id_u64(&frame) == Some(SESSION_ID) {
                    if let Some(error) = frame.get("error") {
                        session_error = Some(jsonrpc_error_to_probe_error(
                            "grok",
                            error,
                            auth_methods.clone(),
                        ));
                        break;
                    }
                    if let Some(result) = frame.get("result") {
                        session_new_result = Some(result.clone());
                        overlay_grok_models(&mut models, &models_from_grok_catalog(result));
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
                if saw_session_commands && !models.is_empty() {
                    break;
                }
            }
            Ok(Err(error)) => {
                let _ = stdin.shutdown().await;
                let _ = close_child(&mut child).await;
                return Err(error.to_string());
            }
            Err(_) => {
                if saw_session_commands && !models.is_empty() {
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
    if let Some(error) = session_error {
        let _ = closed;
        return Err(error);
    }
    let options = session_new_result
        .as_ref()
        .map(config_options_from_session_payload)
        .unwrap_or_default();
    let probed = probe_result_from_config_options(&options, isolated_cwd.to_path_buf(), closed);
    let _ = probed;
    if models.is_empty() {
        if let Some(result) = &session_new_result {
            overlay_grok_models(&mut models, &models_from_grok_catalog(result));
        }
    }
    Ok(NativeOptionsProbeResult {
        models,
        modes: grok_modes(),
        permission_modes: grok_permission_modes(),
        thinking: AgentThinkingSupport::None,
        commands,
        cwd: isolated_cwd.to_path_buf(),
        closed,
    })
}

pub(crate) fn models_from_grok_catalog(value: &Value) -> Vec<AgentModel> {
    let current = grok_current_model_id(value);
    let mut out = Vec::new();
    for items in grok_available_model_arrays(value) {
        overlay_grok_models(
            &mut out,
            &models_from_available_items(items, current.as_deref()),
        );
    }
    crate::options::collapse_grok_fast_models(out)
}

pub(crate) fn overlay_grok_models(target: &mut Vec<AgentModel>, incoming: &[AgentModel]) {
    for model in incoming {
        if let Some(existing) = target.iter_mut().find(|item| item.id == model.id) {
            let thinking = if model.thinking.as_ref().is_none_or(|item| item.is_none()) {
                existing.thinking.clone()
            } else {
                model.thinking.clone()
            };
            *existing = model.clone();
            existing.thinking = thinking;
        } else {
            target.push(model.clone());
        }
    }
}

fn grok_current_model_id(value: &Value) -> Option<String> {
    value
        .get("models")
        .and_then(|models| models.get("currentModelId"))
        .and_then(Value::as_str)
        .or_else(|| value.get("currentModelId").and_then(Value::as_str))
        .or_else(|| {
            value
                .get("modelState")
                .and_then(|state| state.get("currentModelId"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            value
                .get("_meta")
                .and_then(|meta| meta.get("modelState"))
                .and_then(|state| state.get("currentModelId"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
}

fn grok_available_model_arrays(value: &Value) -> Vec<&[Value]> {
    let mut out = Vec::new();
    if let Some(items) = value.get("availableModels").and_then(Value::as_array) {
        out.push(items.as_slice());
    }
    if let Some(items) = value
        .get("models")
        .and_then(|models| models.get("availableModels"))
        .and_then(Value::as_array)
    {
        out.push(items.as_slice());
    }
    if let Some(items) = value
        .get("modelState")
        .and_then(|state| state.get("availableModels"))
        .and_then(Value::as_array)
    {
        out.push(items.as_slice());
    }
    if let Some(items) = value
        .get("_meta")
        .and_then(|meta| meta.get("modelState"))
        .and_then(|state| state.get("availableModels"))
        .and_then(Value::as_array)
    {
        out.push(items.as_slice());
    }
    out
}

fn models_from_available_items(items: &[Value], current: Option<&str>) -> Vec<AgentModel> {
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
        let meta = item.get("_meta").unwrap_or(item);
        out.push(AgentModel {
            id: id.clone(),
            label,
            group: None,
            is_default: current == Some(id.as_str()),
            thinking: thinking_from_reasoning_efforts(meta),
            context: Vec::new(),
            fast: false,
            multiplier: None,
            fast_multiplier: None,
        });
    }
    out
}

fn is_models_update_method(method: &str) -> bool {
    let method = method.strip_prefix('_').unwrap_or(method);
    method == "x.ai/models/update" || method.ends_with("/models/update")
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
        // Grok session/new lists extra-high first. Slider index 0 is the left.
        sort_thinking_levels(&mut options);
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

fn jsonrpc_error_message(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| error.to_string())
}

fn jsonrpc_error_to_probe_error(
    agent_id: &str,
    error: &Value,
    advertised_methods: Vec<crate::acp_client::AuthMethodSummary>,
) -> String {
    let message = jsonrpc_error_message(error);
    if !advertised_methods.is_empty() {
        return auth_required_from_methods(agent_id, advertised_methods);
    }
    crate::options::probe::auth::catalog_probe_error(agent_id, message, Vec::new()).1
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
    fn session_new_auth_error_encodes_initialize_methods() {
        let error = serde_json::json!({
            "code": -32000,
            "message": "auth required"
        });
        let methods = crate::acp_client::auth_methods_from_json(&serde_json::json!({
            "authMethods": [{ "id": "oauth", "name": "Browser" }]
        }));
        let encoded = jsonrpc_error_to_probe_error("grok", &error, methods);
        let payload = crate::acp_client::parse_auth_required_error(&encoded).expect("payload");
        assert_eq!(payload.methods[0].id, "oauth");
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
            ["yolo", "auto", "ask_always"]
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
    fn initialize_model_state_reads_live_reasoning_efforts() {
        let result: Value =
            serde_json::from_str(include_str!("testdata/initialize_model_state.json"))
                .expect("fixture");
        let models = models_from_grok_catalog(&result);
        assert_eq!(
            models
                .iter()
                .map(|model| (model.id.as_str(), model.label.as_str(), model.fast))
                .collect::<Vec<_>>(),
            [
                ("grok-4.7", "Grok 4.7", true),
                ("grok-4.6", "Grok 4.6", false),
                ("grok-4.5", "Grok 4.5", false),
            ]
        );
        assert!(models[0].is_default);
        match &models[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected 4.7 efforts, got {other:?}"),
        }
        match &models[2].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high"]);
            }
            other => panic!("expected 4.5 efforts, got {other:?}"),
        }
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
        let models = models_from_grok_catalog(&result);
        assert_eq!(models.len(), 2);
        assert!(!models[0].is_default);
        assert!(models[1].is_default);
        match &models[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected 4.6 efforts, got {other:?}"),
        }
        match &models[1].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high"]);
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
