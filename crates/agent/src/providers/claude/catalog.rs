//! Short-lived Chat spawn catalog probe: initialize control, then close. Not ACP.

use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;

use crate::catalog::engine::NativeProbeResult;
use crate::catalog::parse::{agent_modes_from_named_keys, commands_from_value};
use crate::contract::AgentRuntimeConfig;
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};

use super::codec;
use super::rpc::{control_response_is_error, control_response_request_id, initialize_request};
use super::spawn::spawn_claude;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_ID: &str = "req_catalog_1";

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native Claude catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    let cfg = AgentRuntimeConfig {
        cwd: isolated_cwd.to_path_buf(),
        ..AgentRuntimeConfig::default()
    };
    let spawned = spawn_claude(Path::new("claude"), &cfg, None, false)
        .await
        .map_err(|error| error.to_string())?;
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

    let mut line =
        serde_json::to_vec(&initialize_request(REQUEST_ID)).map_err(|error| error.to_string())?;
    line.push(b'\n');
    if let Err(error) = stdin.write_all(&line).await {
        let _ = stdin.shutdown().await;
        let _ = close_child(&mut child).await;
        return Err(error.to_string());
    }
    if let Err(error) = stdin.flush().await {
        let _ = stdin.shutdown().await;
        let _ = close_child(&mut child).await;
        return Err(error.to_string());
    }

    let mut reader = BufReader::new(stdout);
    let mut buf = Vec::new();
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let mut init_payload: Option<Value> = None;
    let mut system_model: Option<AgentModel> = None;
    while Instant::now() < deadline {
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
                let Some(frame) = codec::parse_line(&buf) else {
                    continue;
                };
                if let Some(model) = model_from_system_init(&frame) {
                    system_model = Some(model);
                }
                if frame.get("type").and_then(Value::as_str) != Some("control_response") {
                    continue;
                }
                if control_response_request_id(&frame) != Some(REQUEST_ID) {
                    continue;
                }
                if control_response_is_error(&frame) {
                    let _ = stdin.shutdown().await;
                    let _ = close_child(&mut child).await;
                    return Err("claude initialize control_response error".into());
                }
                init_payload = frame
                    .get("response")
                    .and_then(|response| response.get("response"))
                    .cloned();
                break;
            }
            Ok(Err(error)) => {
                let _ = stdin.shutdown().await;
                let _ = close_child(&mut child).await;
                return Err(error.to_string());
            }
            Err(_) => continue,
        }
    }

    let _ = stdin.shutdown().await;
    let closed = close_child(&mut child).await;
    let Some(payload) = init_payload else {
        return Err("claude initialize did not return a control_response".into());
    };

    let mut models = models_from_initialize(&payload);
    if models.is_empty() {
        if let Some(model) = system_model {
            models.push(model);
        }
    }
    let thinking = thinking_from_initialize(&payload);
    let permission_modes = crate::policy::advertised_permission_modes("claude");
    let modes = crate::policy::default_collaboration_modes();
    let commands = commands_from_value(&payload);
    Ok(NativeProbeResult {
        models,
        modes,
        permission_modes,
        thinking,
        commands,
        cwd: isolated_cwd.to_path_buf(),
        closed,
    })
}

async fn close_child(child: &mut tokio::process::Child) -> bool {
    let _ = child.start_kill();
    timeout(Duration::from_secs(2), child.wait()).await.is_ok()
}

pub(crate) fn claude_permission_modes() -> Vec<AgentMode> {
    crate::policy::advertised_permission_modes("claude")
}

pub(crate) fn claude_modes() -> Vec<AgentMode> {
    crate::policy::default_collaboration_modes()
}

pub(crate) fn models_from_initialize(payload: &Value) -> Vec<AgentModel> {
    let items = payload
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut models = Vec::new();
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = item.as_str() {
            if id.is_empty() {
                continue;
            }
            models.push(AgentModel {
                id: id.to_string(),
                label: id.to_string(),
                group: None,
                is_default: index == 0,
                thinking: None,
            });
            continue;
        }
        let id = item
            .get("id")
            .or_else(|| item.get("value"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let label = item
            .get("displayName")
            .or_else(|| item.get("label"))
            .or_else(|| item.get("name"))
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string();
        let is_default = item
            .get("isDefault")
            .or_else(|| item.get("is_default"))
            .and_then(Value::as_bool)
            .unwrap_or(index == 0);
        models.push(AgentModel {
            id,
            label,
            group: None,
            is_default,
            thinking: thinking_from_supported_effort_levels(item),
        });
    }
    models
}

fn thinking_from_supported_effort_levels(item: &Value) -> Option<AgentThinkingSupport> {
    let levels = item.get("supportedEffortLevels")?.as_array()?;
    let options: Vec<String> = levels
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|level| !level.is_empty())
        .map(str::to_string)
        .collect();
    if options.is_empty() {
        None
    } else {
        Some(AgentThinkingSupport::Enum {
            arg: Some("effort".into()),
            options,
        })
    }
}

pub(crate) fn permission_modes_from_initialize(payload: &Value) -> Vec<AgentMode> {
    agent_modes_from_named_keys(
        payload,
        &[
            "permissionModes",
            "permission_modes",
            "permissionMode",
            "permission_mode",
        ],
    )
}

pub(crate) fn thinking_from_initialize(payload: &Value) -> AgentThinkingSupport {
    let mut options = payload
        .get("effortLevels")
        .or_else(|| payload.get("thinking"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if options.is_empty() {
        if let Some(models) = payload.get("models").and_then(Value::as_array) {
            for model in models {
                let Some(levels) = model.get("supportedEffortLevels").and_then(Value::as_array)
                else {
                    continue;
                };
                for level in levels {
                    let Some(level) = level.as_str() else {
                        continue;
                    };
                    if !options.iter().any(|existing| existing == level) {
                        options.push(level.to_string());
                    }
                }
            }
        }
    }
    if options.is_empty() {
        AgentThinkingSupport::None
    } else {
        AgentThinkingSupport::Enum {
            arg: Some("effort".into()),
            options,
        }
    }
}

fn model_from_system_init(frame: &Value) -> Option<AgentModel> {
    if frame.get("type").and_then(Value::as_str) != Some("system") {
        return None;
    }
    if frame.get("subtype").and_then(Value::as_str) != Some("init") {
        return None;
    }
    let id = frame.get("model").and_then(Value::as_str)?;
    if id.is_empty() {
        return None;
    }
    Some(AgentModel {
        id: id.to_string(),
        label: id.to_string(),
        group: None,
        is_default: true,
        thinking: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn initialize_models_do_not_fill_agent_modes() {
        let payload = json!({
            "commands": [],
            "models": [
                {"id": "opus", "displayName": "Opus", "isDefault": true},
                "sonnet"
            ],
            "permissionModes": ["default", "plan"]
        });
        let models = models_from_initialize(&payload);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "opus");
        assert!(models[0].is_default);
        let permission = permission_modes_from_initialize(&payload);
        assert_eq!(permission[0].id, "default");
        assert_eq!(permission[1].id, "plan");
        assert!(agent_modes_from_named_keys(&payload, &["modes", "mode", "agents"]).is_empty());
        let commands = crate::catalog::parse::commands_from_value(&payload);
        assert!(commands.is_empty());
        let live = crate::catalog::parse::commands_from_value(&json!({
            "commands": [
                {"name": "compact", "description": "Compact history"},
                {"name": "fast", "description": "Toggle Fast mode"},
                {"name": "goal", "description": "Set a goal"}
            ]
        }));
        assert_eq!(
            live.iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            ["compact", "fast", "goal"]
        );
    }

    #[test]
    fn empty_initialize_stamps_documented_permission_modes_not_agent_modes() {
        let payload = json!({"commands": [], "models": [], "agents": [], "account": null});
        assert!(models_from_initialize(&payload).is_empty());
        assert!(permission_modes_from_initialize(&payload).is_empty());
        let modes = claude_permission_modes();
        assert_eq!(
            modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "accept_edits", "auto", "ask_always"]
        );
        assert_eq!(
            claude_modes()
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["default", "plan"]
        );
    }

    #[test]
    fn system_init_fixture_exposes_current_model() {
        let frame: Value =
            serde_json::from_str(include_str!("testdata/init.jsonl").trim()).expect("init");
        let model = model_from_system_init(&frame).expect("model");
        assert_eq!(model.id, "claude-opus-4-6");
        assert!(model.is_default);
    }

    #[test]
    fn thinking_uses_model_supported_effort_levels() {
        let payload = json!({
            "models": [
                {
                    "value": "default",
                    "displayName": "Default (recommended)",
                    "supportsEffort": true,
                    "supportedEffortLevels": ["low", "medium", "high", "xhigh", "max"]
                },
                {
                    "value": "haiku",
                    "displayName": "Haiku"
                }
            ]
        });
        match thinking_from_initialize(&payload) {
            AgentThinkingSupport::Enum { arg, options } => {
                assert_eq!(arg.as_deref(), Some("effort"));
                assert_eq!(options, vec!["low", "medium", "high", "xhigh", "max"]);
            }
            other => panic!("expected effort enum, got {other:?}"),
        }
        let models = models_from_initialize(&payload);
        assert_eq!(models[0].id, "default");
        match &models[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh", "max"]);
            }
            other => panic!("expected per-model effort, got {other:?}"),
        }
        assert!(models[1].thinking.is_none());
    }
}
