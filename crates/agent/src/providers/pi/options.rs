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

pub(crate) fn models_from_data(data: &Value) -> Vec<AgentModel> {
    let Some(models) = data.get("models").and_then(Value::as_array) else {
        return Vec::new();
    };
    models
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
                thinking: None,
            })
        })
        .collect()
}

pub(crate) fn thinking_from_data(data: &Value) -> AgentThinkingSupport {
    let levels: Vec<String> = data
        .get("levels")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
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
}
