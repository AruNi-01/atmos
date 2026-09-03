//! Native app-server catalog probe: initialize + model/list + collaborationMode/list.
//! No thread/start.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::catalog::engine::NativeProbeResult;
use crate::catalog::parse::{agent_modes_from_named_keys, commands_from_value};
use crate::contract::AgentCurrentConfig;
use crate::contract::{AgentAvailableCommand, AgentRuntimeConfig};
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};

use super::rpc::{initialize_params, reader_loop, stderr_loop, CodexShared, StickyConfig};
use super::spawn::spawn_app_server;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native Codex catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    let program = super::spawn::resolve_program("codex").map_err(|error| error.to_string())?;
    let spawned =
        spawn_app_server(&program, isolated_cwd, None).map_err(|error| error.to_string())?;
    let mut child = spawned.child;
    let (events_tx, mut events_rx) = mpsc::unbounded_channel();
    tokio::spawn(async move { while events_rx.recv().await.is_some() {} });
    let shared = CodexShared::new(
        Box::new(spawned.stdin),
        events_tx,
        AgentCurrentConfig::default(),
        StickyConfig::from_runtime(&AgentRuntimeConfig {
            cwd: isolated_cwd.to_path_buf(),
            ..AgentRuntimeConfig::default()
        }),
    );
    tokio::spawn(reader_loop(spawned.stdout, shared.clone()));
    tokio::spawn(stderr_loop(spawned.stderr));

    let initialize = shared
        .request("initialize", initialize_params())
        .await
        .map_err(|error| error.to_string());
    let initialize = match initialize {
        Ok(value) => value,
        Err(error) => {
            let closed = close_shared(&shared, &mut child).await;
            let _ = closed;
            return Err(error);
        }
    };
    let _ = shared.notify("initialized", json!({})).await;
    let listed = shared
        .request("model/list", json!({ "includeHidden": false }))
        .await
        .ok();
    let skills = shared
        .request(
            "skills/list",
            json!({ "cwds": [isolated_cwd.to_string_lossy()], "forceReload": false }),
        )
        .await
        .ok();
    let features = shared
        .request("experimentalFeature/list", json!({}))
        .await
        .ok();
    let collaboration = shared
        .request("collaborationMode/list", json!({}))
        .await
        .ok();
    let closed = close_shared(&shared, &mut child).await;

    let (models, thinking) = listed
        .as_ref()
        .map(parse_model_list)
        .unwrap_or((Vec::new(), AgentThinkingSupport::None));
    let mut modes = collaboration
        .as_ref()
        .map(parse_collaboration_modes)
        .unwrap_or_default();
    if modes.is_empty() {
        modes = agent_modes_from_named_keys(&initialize, &["modes", "mode", "agents"]);
    }
    if modes.is_empty() {
        modes = codex_modes();
    }
    let permission_modes = agent_modes_from_named_keys(
        &initialize,
        &[
            "permission_modes",
            "permissionModes",
            "permission",
            "permission_mode",
            "approval",
            "approvals",
            "approvalPolicies",
        ],
    );
    let permission_modes = if permission_modes.is_empty() {
        crate::policy::advertised_permission_modes("codex")
    } else {
        crate::policy::fold_vendor_permission_modes(&permission_modes)
    };
    let mut commands = host_slash_commands();
    if let Some(skills) = skills.as_ref() {
        for command in commands_from_value(skills) {
            push_command(&mut commands, command);
        }
    }
    if let Some(features) = features.as_ref() {
        for command in commands_from_experimental_features(features) {
            push_command(&mut commands, command);
        }
    }
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

async fn close_shared(shared: &Arc<CodexShared>, child: &mut tokio::process::Child) -> bool {
    let _ = shared.fail_outstanding().await;
    {
        let mut stdin = shared.stdin.lock().await;
        *stdin = None;
    }
    shared.emit_closed();
    let _ = child.start_kill();
    timeout(Duration::from_secs(2), child.wait()).await.is_ok()
}

pub(crate) fn parse_model_list(result: &Value) -> (Vec<AgentModel>, AgentThinkingSupport) {
    let items = result
        .get("data")
        .or_else(|| result.get("models"))
        .or_else(|| result.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut models = Vec::new();
    let mut efforts: Vec<String> = Vec::new();
    for item in items {
        let id = item
            .get("id")
            .or_else(|| item.get("model"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let label = item
            .get("displayName")
            .or_else(|| item.get("label"))
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string();
        let is_default = item
            .get("isDefault")
            .or_else(|| item.get("is_default"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let model_efforts: Vec<String> = item
            .get("supportedReasoningEfforts")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(effort_id).collect())
            .unwrap_or_default();
        for effort in &model_efforts {
            if !efforts.iter().any(|existing| existing == effort) {
                efforts.push(effort.clone());
            }
        }
        let thinking = if model_efforts.is_empty() {
            None
        } else {
            Some(AgentThinkingSupport::Enum {
                arg: Some("effort".into()),
                options: model_efforts,
            })
        };
        models.push(AgentModel {
            id,
            label,
            group: None,
            is_default,
            thinking,
        });
    }
    let thinking = if efforts.is_empty() {
        AgentThinkingSupport::None
    } else {
        AgentThinkingSupport::Enum {
            arg: Some("effort".into()),
            options: efforts,
        }
    };
    (models, thinking)
}

pub(crate) fn parse_collaboration_modes(result: &Value) -> Vec<AgentMode> {
    let items = result
        .get("data")
        .or_else(|| result.get("modes"))
        .or_else(|| result.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut modes = Vec::new();
    for item in items {
        let Some(id) = item
            .get("mode")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
        else {
            continue;
        };
        if modes.iter().any(|existing: &AgentMode| existing.id == id) {
            continue;
        }
        let label = item
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(id.as_str())
            .to_string();
        let is_default = id.eq_ignore_ascii_case("default");
        modes.push(AgentMode {
            id,
            label,
            is_default,
        });
    }
    modes.sort_by_key(|mode| !mode.is_default);
    modes
}

fn effort_id(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string).or_else(|| {
        value
            .get("reasoningEffort")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

pub(crate) fn codex_modes() -> Vec<AgentMode> {
    vec![
        AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        },
        AgentMode {
            id: "plan".into(),
            label: "Plan".into(),
            is_default: false,
        },
    ]
}

pub(crate) fn host_slash_commands() -> Vec<AgentAvailableCommand> {
    vec![
        AgentAvailableCommand {
            name: "fast".into(),
            description: "Toggle Codex Fast mode".into(),
            hint: None,
        },
        AgentAvailableCommand {
            name: "goal".into(),
            description: "Set or update this thread's goal".into(),
            hint: None,
        },
        AgentAvailableCommand {
            name: "compact".into(),
            description: "Compact this conversation".into(),
            hint: None,
        },
        AgentAvailableCommand {
            name: "review".into(),
            description: "Start a code review".into(),
            hint: None,
        },
        AgentAvailableCommand {
            name: "permissions".into(),
            description: "Open Codex permissions".into(),
            hint: None,
        },
    ]
}

fn commands_from_experimental_features(value: &Value) -> Vec<AgentAvailableCommand> {
    let items = value
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    items
        .iter()
        .filter_map(|item| {
            let name = item.get("name").and_then(Value::as_str)?;
            if !name.to_ascii_lowercase().contains("fast") {
                return None;
            }
            let description = item
                .get("displayName")
                .or_else(|| item.get("description"))
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .unwrap_or("Toggle Codex Fast mode");
            Some(AgentAvailableCommand {
                name: "fast".into(),
                description: description.to_string(),
                hint: None,
            })
        })
        .collect()
}

fn push_command(commands: &mut Vec<AgentAvailableCommand>, command: AgentAvailableCommand) {
    if commands
        .iter()
        .any(|existing| existing.name.eq_ignore_ascii_case(&command.name))
    {
        if let Some(existing) = commands
            .iter_mut()
            .find(|existing| existing.name.eq_ignore_ascii_case(&command.name))
        {
            if existing.description.len() < command.description.len() {
                existing.description = command.description;
            }
        }
        return;
    }
    commands.push(command);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_list_fills_thinking_when_present_and_leaves_modes_empty() {
        let result = json!({
            "data": [{
                "id": "gpt-5.6-sol",
                "displayName": "GPT-5.6",
                "isDefault": true,
                "supportedReasoningEfforts": [
                    {"reasoningEffort": "low", "description": "Fast responses with lighter reasoning"},
                    {"reasoningEffort": "medium", "description": "Balances speed and reasoning depth for everyday tasks"},
                    {"reasoningEffort": "high", "description": "Greater reasoning depth for complex problems"}
                ]
            }]
        });
        let (models, thinking) = parse_model_list(&result);
        assert_eq!(models[0].id, "gpt-5.6-sol");
        match thinking {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(options, vec!["low", "medium", "high"]);
            }
            other => panic!("expected thinking, got {other:?}"),
        }
        let handshake: Value = serde_json::from_str(
            include_str!("testdata/handshake.jsonl")
                .lines()
                .nth(1)
                .unwrap(),
        )
        .expect("initialize result");
        let result = handshake.get("result").cloned().unwrap_or(handshake);
        assert!(agent_modes_from_named_keys(&result, &["modes", "agents"]).is_empty());
        assert!(agent_modes_from_named_keys(&result, &["approval", "permission_modes"]).is_empty());
        let stamped =
            if agent_modes_from_named_keys(&result, &["modes", "mode", "agents"]).is_empty() {
                codex_modes()
            } else {
                Vec::new()
            };
        assert_eq!(stamped[0].id, "default");
        assert_eq!(stamped[1].id, "plan");
        assert!(stamped[0].is_default);
    }

    #[test]
    fn model_list_keeps_per_model_efforts_instead_of_union() {
        let result = json!({
            "data": [
                {
                    "id": "gpt-5.5",
                    "displayName": "GPT-5.5",
                    "supportedReasoningEfforts": [
                        {"reasoningEffort": "low"},
                        {"reasoningEffort": "medium"},
                        {"reasoningEffort": "high"},
                        {"reasoningEffort": "xhigh"}
                    ]
                },
                {
                    "id": "gpt-5.6-sol",
                    "displayName": "GPT-5.6-Sol",
                    "isDefault": true,
                    "supportedReasoningEfforts": [
                        {"reasoningEffort": "low"},
                        {"reasoningEffort": "medium"},
                        {"reasoningEffort": "high"},
                        {"reasoningEffort": "xhigh"},
                        {"reasoningEffort": "max"},
                        {"reasoningEffort": "ultra"}
                    ]
                }
            ]
        });
        let (models, thinking) = parse_model_list(&result);
        match thinking {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(
                    options,
                    vec!["low", "medium", "high", "xhigh", "max", "ultra"]
                );
            }
            other => panic!("expected union, got {other:?}"),
        }
        let gpt55 = models.iter().find(|model| model.id == "gpt-5.5").unwrap();
        match &gpt55.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected 5.5 efforts, got {other:?}"),
        }
        let sol = models
            .iter()
            .find(|model| model.id == "gpt-5.6-sol")
            .unwrap();
        match &sol.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh", "max", "ultra"]);
            }
            other => panic!("expected 5.6 efforts, got {other:?}"),
        }
    }

    #[test]
    fn collaboration_mode_list_uses_mode_id_and_puts_default_first() {
        let result: Value =
            serde_json::from_str(include_str!("testdata/collaboration-mode-list.json"))
                .expect("fixture");
        let modes = parse_collaboration_modes(&result);
        assert_eq!(modes.len(), 2);
        assert_eq!(modes[0].id, "default");
        assert_eq!(modes[0].label, "Default");
        assert!(modes[0].is_default);
        assert_eq!(modes[1].id, "plan");
        assert_eq!(modes[1].label, "Plan");
        assert!(!modes[1].is_default);
        assert!(parse_collaboration_modes(&json!({})).is_empty());
    }

    #[test]
    fn host_slash_includes_fast_goal_and_merges_skills() {
        let names: Vec<String> = host_slash_commands()
            .into_iter()
            .map(|command| command.name)
            .collect();
        assert_eq!(names, ["fast", "goal", "compact", "review", "permissions"]);
        let mut commands = host_slash_commands();
        for command in commands_from_value(&json!({
            "data": [{
                "skills": [
                    {"name": "gh-cli", "description": "GitHub CLI", "enabled": true},
                    {"name": "off", "description": "no", "enabled": false}
                ]
            }]
        })) {
            push_command(&mut commands, command);
        }
        assert!(commands.iter().any(|command| command.name == "gh-cli"));
        assert!(commands.iter().all(|command| command.name != "off"));
    }
}
