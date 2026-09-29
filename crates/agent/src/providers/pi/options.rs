//! `--mode rpc` short session: documented list methods only. Not ACP.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::contract::AgentRuntimeConfig;
use crate::contract::{AgentModel, AgentThinkingSupport};
use crate::options::effort::sort_thinking_levels;
use crate::options::probe::cli::parse::{agent_modes_from_named_keys, commands_from_value};
use crate::options::probe::native::NativeOptionsProbeResult;

use super::codec::{self, FrameClass};
use super::rpc::{
    cmd_get_available_models, cmd_get_available_thinking_levels, cmd_get_commands, cmd_get_state,
    PiTransport, HANDSHAKE_TIMEOUT,
};
use super::spawn::spawn_chat;

const PROBE_TIMEOUT: Duration = Duration::from_secs(30);

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeOptionsProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native Pi catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeOptionsProbeResult, String> {
    let cfg = AgentRuntimeConfig {
        cwd: isolated_cwd.to_path_buf(),
        ..AgentRuntimeConfig::default()
    };
    let spawned = spawn_chat("pi", &cfg, None).map_err(|error| error.to_string())?;
    let mut child = spawned.child;
    let transport = Arc::new(PiTransport::new(Box::new(spawned.stdin)));
    let (event_tx, mut event_rx) = mpsc::unbounded_channel();
    tokio::spawn(async move { while event_rx.recv().await.is_some() {} });
    tokio::spawn(read_loop(spawned.stdout, transport.clone(), event_tx));
    tokio::spawn(async move {
        let mut reader = BufReader::new(spawned.stderr);
        let mut line = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line).await.unwrap_or(0) == 0 {
                break;
            }
        }
    });

    let models_response = transport
        .call(cmd_get_available_models(), HANDSHAKE_TIMEOUT)
        .await;
    let levels_response = transport
        .call(cmd_get_available_thinking_levels(), HANDSHAKE_TIMEOUT)
        .await;
    let state_response = transport.call(cmd_get_state(), HANDSHAKE_TIMEOUT).await;
    let commands_response = transport.call(cmd_get_commands(), HANDSHAKE_TIMEOUT).await;
    transport.shutdown_writer().await;
    let _ = child.start_kill();
    let closed = timeout(Duration::from_secs(2), child.wait()).await.is_ok();

    let models = models_response
        .ok()
        .and_then(|response| response.require_ok().ok().cloned())
        .map(|response| models_from_data(response.data()))
        .unwrap_or_default();
    let thinking = levels_response
        .ok()
        .and_then(|response| response.require_ok().ok().cloned())
        .map(|response| thinking_from_data(response.data()))
        .unwrap_or(AgentThinkingSupport::None);
    let state = state_response
        .ok()
        .and_then(|response| response.require_ok().ok().cloned());
    let modes = state
        .as_ref()
        .map(|response| agent_modes_from_named_keys(response.data(), &["modes", "mode", "agents"]))
        .unwrap_or_default();
    let permission_modes = state
        .as_ref()
        .map(|response| {
            agent_modes_from_named_keys(
                response.data(),
                &[
                    "permission_modes",
                    "permissionModes",
                    "permission",
                    "permission_mode",
                    "approval",
                    "approvals",
                ],
            )
        })
        .unwrap_or_default();
    let commands = commands_response
        .ok()
        .and_then(|response| response.require_ok().ok().cloned())
        .map(|response| commands_from_value(response.data()))
        .unwrap_or_default();
    Ok(NativeOptionsProbeResult {
        models,
        modes,
        permission_modes,
        thinking,
        commands,
        cwd: isolated_cwd.to_path_buf(),
        closed,
    })
}

async fn read_loop(
    stdout: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    transport: Arc<PiTransport>,
    event_tx: mpsc::UnboundedSender<Value>,
) {
    let mut reader = BufReader::new(stdout);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                let Some(record) = codec::trim_record(&buf) else {
                    continue;
                };
                let Ok(value) = serde_json::from_slice::<Value>(record) else {
                    continue;
                };
                match codec::classify_frame(&value) {
                    FrameClass::Response => {
                        let _ = transport.complete_response(&value).await;
                    }
                    FrameClass::Event => {
                        let _ = event_tx.send(value);
                    }
                }
            }
            Err(_) => break,
        }
    }
}

fn model_list_items(data: &Value) -> &[Value] {
    data.get("models")
        .and_then(Value::as_array)
        .or_else(|| data.as_array())
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

pub(crate) fn models_from_data(data: &Value) -> Vec<AgentModel> {
    model_list_items(data)
        .iter()
        .filter_map(|model| {
            let id = model.get("id").and_then(Value::as_str)?;
            let provider = model.get("provider").and_then(Value::as_str);
            let name = model.get("name").and_then(Value::as_str).unwrap_or(id);
            let catalog_id = match provider {
                Some(provider) if !provider.is_empty() => format!("{provider}/{id}"),
                _ => id.to_string(),
            };
            Some(AgentModel {
                id: catalog_id,
                label: name.to_string(),
                group: provider.map(str::to_string),
                is_default: false,
                thinking: thinking_from_pi_model(model),
                context: Vec::new(),
                fast: false,
                multiplier: None,
                fast_multiplier: None,
            })
        })
        .collect()
}

/// Live Pi `Model.reasoning` + `thinkingLevelMap`, matching
/// `getSupportedThinkingLevels`: non-reasoning → off only; `xhigh`/`max` are
/// opt-in map keys; JSON null disables a level. Do not invent ladders from ids.
fn thinking_from_pi_model(model: &Value) -> Option<AgentThinkingSupport> {
    let reasoning = model.get("reasoning").and_then(Value::as_bool);
    let has_map = model.get("thinkingLevelMap").is_some();
    if reasoning.is_none() && !has_map {
        return None;
    }
    let options = supported_pi_thinking_levels(model);
    if options.iter().any(|level| level != "off") {
        Some(AgentThinkingSupport::Enum { arg: None, options })
    } else {
        Some(AgentThinkingSupport::None)
    }
}

const PI_THINKING_LEVELS: [&str; 7] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

fn supported_pi_thinking_levels(model: &Value) -> Vec<String> {
    if model.get("reasoning").and_then(Value::as_bool) == Some(false) {
        return vec!["off".into()];
    }
    let map = model.get("thinkingLevelMap");
    let mut options: Vec<String> = PI_THINKING_LEVELS
        .iter()
        .copied()
        .filter(|level| match map.and_then(|value| value.get(*level)) {
            Some(Value::Null) => false,
            Some(_) => true,
            None => *level != "xhigh" && *level != "max",
        })
        .map(str::to_string)
        .collect();
    sort_thinking_levels(&mut options);
    options
}

fn thinking_level_id(value: &Value) -> Option<String> {
    value
        .as_str()
        .or_else(|| {
            value
                .get("level")
                .or_else(|| value.get("id"))
                .or_else(|| value.get("value"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|level| !level.is_empty())
        .map(str::to_string)
}

pub(crate) fn thinking_from_data(data: &Value) -> AgentThinkingSupport {
    let mut levels: Vec<String> = data
        .get("levels")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(thinking_level_id).collect())
        .unwrap_or_default();
    sort_thinking_levels(&mut levels);
    if levels.iter().any(|level| level != "off") {
        AgentThinkingSupport::Enum {
            arg: None,
            options: levels,
        }
    } else {
        AgentThinkingSupport::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn documented_list_methods_fill_models_and_thinking() {
        let models = models_from_data(&json!({
            "models": [{
                "id": "claude-sonnet-4-20250514",
                "provider": "anthropic",
                "name": "Claude Sonnet 4"
            }]
        }));
        assert_eq!(models[0].id, "anthropic/claude-sonnet-4-20250514");
        match thinking_from_data(&json!({ "levels": ["off", "low", "high"] })) {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(options, vec!["off", "low", "high"]);
            }
            other => panic!("expected levels, got {other:?}"),
        }
        let state = json!({
            "model": {"id": "claude-sonnet-4-20250514", "provider": "anthropic"},
            "thinkingLevel": "medium",
            "sessionFile": "/tmp/pi.jsonl"
        });
        assert!(agent_modes_from_named_keys(&state, &["modes", "agents"]).is_empty());
        assert!(agent_modes_from_named_keys(&state, &["permission_modes", "approval"]).is_empty());
    }

    #[test]
    fn models_stamp_live_reasoning_map_not_id_tables() {
        let models = models_from_data(&json!({
            "models": [
                {
                    "id": "claude-sonnet-4",
                    "provider": "anthropic",
                    "name": "Sonnet",
                    "reasoning": true,
                    "thinkingLevelMap": { "xhigh": "max", "minimal": null }
                },
                {
                    "id": "flash",
                    "provider": "google",
                    "name": "Flash",
                    "reasoning": false
                },
                {
                    "id": "gpt-oss",
                    "provider": "ollama",
                    "name": "OSS",
                    "reasoning": true
                }
            ]
        }));
        let sonnet = models
            .iter()
            .find(|model| model.id == "anthropic/claude-sonnet-4")
            .unwrap();
        match &sonnet.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["off", "low", "medium", "high", "xhigh"]);
                assert!(!options.iter().any(|level| level == "minimal"));
            }
            other => panic!("expected mapped levels, got {other:?}"),
        }
        let flash = models
            .iter()
            .find(|model| model.id == "google/flash")
            .unwrap();
        assert!(matches!(flash.thinking, Some(AgentThinkingSupport::None)));
        let oss = models
            .iter()
            .find(|model| model.id == "ollama/gpt-oss")
            .unwrap();
        match &oss.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["off", "minimal", "low", "medium", "high"]);
            }
            other => panic!("expected default reasoning levels, got {other:?}"),
        }
    }

    #[test]
    fn thinking_levels_accept_object_entries() {
        match thinking_from_data(&json!({
            "levels": [{ "level": "high" }, { "id": "low" }, "off"]
        })) {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(options, vec!["off", "low", "high"]);
            }
            other => panic!("expected object levels, got {other:?}"),
        }
    }
}
