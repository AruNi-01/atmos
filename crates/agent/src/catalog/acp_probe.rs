use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::time::timeout;

use crate::acp_client::client::AcpSessionEvent;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::{AgentConfigOption, AgentConfigOptionValue};
use crate::acp_client::{run_acp_session, AcpSessionHandle};
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
use crate::models::AgentLaunchSpec;

use super::engine::{AcpCatalogProbe, AcpProbeResult};

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const NPX_PROBE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct AcpLaunchResolved {
    pub launch_spec: AgentLaunchSpec,
    pub env_overrides: Option<std::collections::HashMap<String, String>>,
}

#[async_trait]
pub trait AcpLaunchResolver: Send + Sync {
    async fn resolve(&self, agent_id: &str) -> Result<AcpLaunchResolved, String>;
}

pub struct StdioAcpCatalogProbe {
    resolver: Arc<dyn AcpLaunchResolver>,
}

impl StdioAcpCatalogProbe {
    pub fn new(resolver: Arc<dyn AcpLaunchResolver>) -> Self {
        Self { resolver }
    }
}

struct CatalogProbeToolHandler;

#[async_trait]
impl AcpToolHandler for CatalogProbeToolHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
        session_cwd.join(path)
    }

    async fn read_text_file(&self, _path: &Path) -> Result<String, String> {
        Err("catalog probe does not read files".into())
    }

    async fn write_text_file(&self, _path: &Path, _content: &str) -> Result<(), String> {
        Err("catalog probe does not write files".into())
    }
}

fn is_model_config_id(id: &str) -> bool {
    let id = id.to_ascii_lowercase();
    id == "model" || id == "models"
}

fn is_thinking_config_id(id: &str) -> bool {
    let id = id.to_ascii_lowercase();
    id == "thinking"
        || id == "think"
        || id == "thought_level"
        || id == "effort"
        || id.contains("reason")
}

pub(crate) fn is_mode_config_id(id: &str) -> bool {
    let compact = id.to_ascii_lowercase().replace('_', "");
    compact == "mode"
        || compact == "modes"
        || compact == "agent"
        || compact == "agents"
        || compact == "sessionmode"
        || compact == "agentmode"
}

pub(crate) fn is_permission_mode_config_id(id: &str) -> bool {
    let compact = id.to_ascii_lowercase().replace('_', "");
    compact == "permission"
        || compact == "permissionmode"
        || compact == "permissionmodes"
        || compact == "approval"
        || compact == "approvals"
}

pub fn config_options_from_session_payload(payload: &serde_json::Value) -> Vec<AgentConfigOption> {
    let items = payload
        .get("configOptions")
        .or_else(|| payload.get("config_options"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut options: Vec<AgentConfigOption> = items
        .into_iter()
        .filter_map(agent_config_option_from_value)
        .collect();
    if !options.iter().any(|option| is_mode_config_id(&option.id)) {
        if let Some(mode) = session_mode_option_from_payload(payload) {
            options.push(mode);
        }
    }
    options
}

fn session_mode_option_from_payload(payload: &serde_json::Value) -> Option<AgentConfigOption> {
    let modes = payload.get("modes")?;
    let available = modes
        .get("availableModes")
        .or_else(|| modes.get("available_modes"))
        .and_then(serde_json::Value::as_array)?;
    let options: Vec<AgentConfigOptionValue> = available
        .iter()
        .filter_map(|item| {
            let value = item
                .get("id")
                .or_else(|| item.get("value"))
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|id| !id.is_empty())?
                .to_string();
            Some(AgentConfigOptionValue {
                value,
                name: item
                    .get("name")
                    .or_else(|| item.get("label"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                description: item
                    .get("description")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect();
    if options.is_empty() {
        return None;
    }
    let current_value = modes
        .get("currentModeId")
        .or_else(|| modes.get("current_mode_id"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string);
    Some(AgentConfigOption {
        id: "mode".into(),
        name: Some("Mode".into()),
        description: None,
        category: Some("mode".into()),
        r#type: "select".into(),
        current_value,
        options,
    })
}

fn agent_config_option_from_value(value: serde_json::Value) -> Option<AgentConfigOption> {
    if let Ok(option) = serde_json::from_value::<AgentConfigOption>(value.clone()) {
        if !option.id.is_empty() {
            return Some(option);
        }
    }
    let id = value.get("id")?.as_str()?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let kind = value.get("kind");
    let select = kind
        .and_then(|item| item.get("select"))
        .or(kind)
        .unwrap_or(&value);
    let current_value = select
        .get("currentValue")
        .or_else(|| select.get("current_value"))
        .or_else(|| value.get("currentValue"))
        .or_else(|| value.get("current_value"))
        .and_then(|item| item.as_str().map(str::to_string))
        .filter(|item| !item.is_empty());
    let options = option_values_from(select)
        .or_else(|| option_values_from(&value))
        .unwrap_or_default();
    Some(AgentConfigOption {
        id,
        name: value
            .get("name")
            .and_then(|item| item.as_str().map(str::to_string)),
        description: value
            .get("description")
            .and_then(|item| item.as_str().map(str::to_string)),
        category: value
            .get("category")
            .and_then(|item| item.as_str().map(str::to_string)),
        r#type: value
            .get("type")
            .and_then(|item| item.as_str())
            .unwrap_or("select")
            .to_string(),
        current_value,
        options,
    })
}

fn option_values_from(
    value: &serde_json::Value,
) -> Option<Vec<crate::acp_client::types::AgentConfigOptionValue>> {
    let options = value.get("options")?;
    if let Some(items) = options.as_array() {
        let mut out = Vec::new();
        for item in items {
            if let Some(nested) = item.get("options").and_then(serde_json::Value::as_array) {
                for nested_item in nested {
                    if let Some(parsed) = option_value_from(nested_item) {
                        out.push(parsed);
                    }
                }
                continue;
            }
            if let Some(parsed) = option_value_from(item) {
                out.push(parsed);
            }
        }
        return Some(out);
    }
    None
}

fn option_value_from(
    value: &serde_json::Value,
) -> Option<crate::acp_client::types::AgentConfigOptionValue> {
    let item_value = value
        .get("value")
        .or_else(|| value.get("id"))
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())?
        .to_string();
    Some(crate::acp_client::types::AgentConfigOptionValue {
        value: item_value,
        name: value
            .get("name")
            .or_else(|| value.get("label"))
            .and_then(|item| item.as_str().map(str::to_string)),
        description: value
            .get("description")
            .and_then(|item| item.as_str().map(str::to_string)),
    })
}

pub fn thinking_support_from_options(options: &[AgentConfigOption]) -> AgentThinkingSupport {
    options
        .iter()
        .find(|option| is_thinking_config_id(&option.id))
        .map(|option| {
            let values: Vec<String> = option
                .options
                .iter()
                .map(|value| value.value.clone())
                .filter(|value| !value.is_empty())
                .collect();
            if values.is_empty() {
                AgentThinkingSupport::None
            } else {
                AgentThinkingSupport::Enum {
                    arg: Some(option.id.clone()),
                    options: values,
                }
            }
        })
        .unwrap_or(AgentThinkingSupport::None)
}

fn apply_thinking_to_current_model(models: &mut [AgentModel], thinking: &AgentThinkingSupport) {
    let index = models
        .iter()
        .position(|model| model.is_default)
        .or_else(|| models.first().map(|_| 0));
    let Some(index) = index else {
        return;
    };
    if models[index].thinking.is_some() {
        return;
    }
    models[index].thinking = Some(thinking.clone());
}

pub fn probe_result_from_config_options(
    options: &[AgentConfigOption],
    cwd: PathBuf,
    closed: bool,
) -> AcpProbeResult {
    let mut models = Vec::new();
    let mut modes = Vec::new();
    let mut permission_modes = Vec::new();
    for option in options {
        if is_model_config_id(&option.id) {
            models = option
                .options
                .iter()
                .map(|value| AgentModel {
                    id: value.value.clone(),
                    label: value
                        .name
                        .clone()
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| value.value.clone()),
                    group: None,
                    is_default: option.current_value.as_deref() == Some(value.value.as_str()),
                    thinking: None,
                })
                .collect();
        } else if is_mode_config_id(&option.id) {
            modes = option
                .options
                .iter()
                .map(|value| AgentMode {
                    id: value.value.clone(),
                    label: value
                        .name
                        .clone()
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| value.value.clone()),
                    is_default: option.current_value.as_deref() == Some(value.value.as_str()),
                })
                .collect();
        } else if is_permission_mode_config_id(&option.id) {
            let raw: Vec<AgentMode> = option
                .options
                .iter()
                .map(|value| AgentMode {
                    id: value.value.clone(),
                    label: value
                        .name
                        .clone()
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| value.value.clone()),
                    is_default: option.current_value.as_deref() == Some(value.value.as_str()),
                })
                .collect();
            crate::policy::merge_plan_into_modes(&mut modes, &raw);
            permission_modes = crate::policy::fold_vendor_permission_modes(&raw);
        }
    }
    let thinking = thinking_support_from_options(options);
    apply_thinking_to_current_model(&mut models, &thinking);
    AcpProbeResult {
        models,
        modes,
        permission_modes,
        thinking,
        commands: Vec::new(),
        cwd,
        closed,
    }
}

#[async_trait]
impl AcpCatalogProbe for StdioAcpCatalogProbe {
    async fn probe(&self, agent_id: &str, isolated_cwd: &Path) -> Result<AcpProbeResult, String> {
        std::fs::create_dir_all(isolated_cwd).map_err(|error| error.to_string())?;
        let launch = self.resolver.resolve(agent_id).await?;
        let spawn_timeout = if launch.launch_spec.program == "npx" {
            NPX_PROBE_TIMEOUT
        } else {
            PROBE_TIMEOUT
        };
        let mut handle = timeout(
            spawn_timeout,
            run_acp_session(
                format!("catalog-probe-{agent_id}"),
                launch.launch_spec,
                isolated_cwd.to_path_buf(),
                Arc::new(CatalogProbeToolHandler),
                launch.env_overrides,
                None,
                None,
                None,
                None,
            ),
        )
        .await
        .map_err(|_| "temp ACP catalog probe timed out".to_string())?
        .map_err(|error| error.to_string())?;

        let options = drain_config_options(&mut handle, spawn_timeout).await;
        let _ = handle.send_close();
        let closed = timeout(Duration::from_secs(2), wait_session_end(&mut handle))
            .await
            .is_ok();
        drop(handle);
        Ok(probe_result_from_config_options(
            &options,
            isolated_cwd.to_path_buf(),
            closed,
        ))
    }
}

async fn drain_config_options(
    handle: &mut AcpSessionHandle,
    max: Duration,
) -> Vec<AgentConfigOption> {
    let deadline = Instant::now() + max;
    let mut options = Vec::new();
    while Instant::now() < deadline {
        match timeout(Duration::from_millis(250), handle.recv_event()).await {
            Ok(Some(AcpSessionEvent::ConfigOptionsUpdate(next))) => {
                if !next.is_empty() {
                    options = next;
                    break;
                }
            }
            Ok(Some(AcpSessionEvent::SessionEnded | AcpSessionEvent::SessionClosed { .. })) => {
                break;
            }
            Ok(Some(AcpSessionEvent::Error { message, .. })) => {
                let _ = message;
                break;
            }
            Ok(None) => break,
            Ok(Some(_)) => {}
            Err(_) => {
                if !options.is_empty() {
                    break;
                }
            }
        }
    }
    options
}

async fn wait_session_end(handle: &mut AcpSessionHandle) {
    while let Some(event) = handle.recv_event().await {
        if matches!(
            event,
            AcpSessionEvent::SessionEnded | AcpSessionEvent::SessionClosed { .. }
        ) {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_client::types::AgentConfigOptionValue;

    #[test]
    fn maps_model_mode_and_thinking_from_config_options() {
        let options = vec![
            AgentConfigOption {
                id: "model".into(),
                name: Some("Model".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("opus".into()),
                options: vec![
                    AgentConfigOptionValue {
                        value: "opus".into(),
                        name: Some("Opus".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "sonnet".into(),
                        name: Some("Sonnet".into()),
                        description: None,
                    },
                ],
            },
            AgentConfigOption {
                id: "thought_level".into(),
                name: Some("Thinking".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("high".into()),
                options: vec![AgentConfigOptionValue {
                    value: "high".into(),
                    name: Some("High".into()),
                    description: None,
                }],
            },
        ];
        let result = probe_result_from_config_options(
            &options,
            PathBuf::from("/tmp/catalog-probe/claude"),
            true,
        );
        assert_eq!(result.models.len(), 2);
        assert_eq!(result.models[0].id, "opus");
        assert!(result.models[0].is_default);
        assert!(matches!(
            result.models[0].thinking,
            Some(AgentThinkingSupport::Enum { .. })
        ));
        assert!(matches!(result.thinking, AgentThinkingSupport::Enum { .. }));
        assert!(result.closed);
        assert_eq!(result.cwd, PathBuf::from("/tmp/catalog-probe/claude"));
    }

    #[test]
    fn app069_s7_maps_permission_mode_approval_into_permission_modes() {
        let options = vec![AgentConfigOption {
            id: "permission_mode".into(),
            name: Some("Permission".into()),
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: Some("acceptEdits".into()),
            options: vec![
                AgentConfigOptionValue {
                    value: "default".into(),
                    name: Some("Default".into()),
                    description: None,
                },
                AgentConfigOptionValue {
                    value: "acceptEdits".into(),
                    name: Some("Accept edits".into()),
                    description: None,
                },
            ],
        }];
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        assert!(result.modes.is_empty());
        assert_eq!(result.permission_modes.len(), 2);
        assert_eq!(result.permission_modes[0].id, "accept_edits");
        assert_eq!(result.permission_modes[1].id, "ask_always");
        assert!(result.permission_modes[0].is_default);

        let approval = vec![AgentConfigOption {
            id: "approval".into(),
            name: Some("Approval".into()),
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: Some("on-request".into()),
            options: vec![AgentConfigOptionValue {
                value: "on-request".into(),
                name: Some("On request".into()),
                description: None,
            }],
        }];
        let result = probe_result_from_config_options(&approval, PathBuf::from("/tmp"), true);
        assert_eq!(result.permission_modes[0].id, "ask_always");

        let permission = vec![AgentConfigOption {
            id: "permission".into(),
            name: None,
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: None,
            options: vec![AgentConfigOptionValue {
                value: "ask".into(),
                name: Some("Ask".into()),
                description: None,
            }],
        }];
        let result = probe_result_from_config_options(&permission, PathBuf::from("/tmp"), true);
        assert_eq!(result.permission_modes[0].id, "ask_always");

        let camel = vec![AgentConfigOption {
            id: "permissionMode".into(),
            name: Some("Permission".into()),
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: Some("default".into()),
            options: vec![AgentConfigOptionValue {
                value: "default".into(),
                name: Some("Normal".into()),
                description: None,
            }],
        }];
        let result = probe_result_from_config_options(&camel, PathBuf::from("/tmp"), true);
        assert_eq!(result.permission_modes[0].id, "ask_always");
        assert!(result.modes.is_empty());
    }

    #[test]
    fn reasoning_effort_snapshot_is_thinking_for_current_model_only() {
        let options = vec![
            AgentConfigOption {
                id: "model".into(),
                name: Some("Model".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("kimi-k3".into()),
                options: vec![
                    AgentConfigOptionValue {
                        value: "claude-opus-5".into(),
                        name: Some("Opus 5".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "kimi-k3".into(),
                        name: Some("Kimi K3".into()),
                        description: None,
                    },
                ],
            },
            AgentConfigOption {
                id: "reasoning_effort".into(),
                name: Some("Effort".into()),
                description: None,
                category: None,
                r#type: "select".into(),
                current_value: Some("high".into()),
                options: vec![
                    AgentConfigOptionValue {
                        value: "off".into(),
                        name: Some("Off".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "low".into(),
                        name: Some("Low".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "high".into(),
                        name: Some("High".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "max".into(),
                        name: Some("Maximum".into()),
                        description: None,
                    },
                ],
            },
        ];
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        let kimi = result
            .models
            .iter()
            .find(|model| model.id == "kimi-k3")
            .unwrap();
        match &kimi.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["off", "low", "high", "max"]);
            }
            other => panic!("expected kimi thinking, got {other:?}"),
        }
        let opus = result
            .models
            .iter()
            .find(|model| model.id == "claude-opus-5")
            .unwrap();
        assert!(opus.thinking.is_none());
    }

    #[test]
    fn deepseek_harness_session_new_models_and_reasoning() {
        let flash = "[\"deepseek-official\",\"deepseek-v4-flash\"]";
        let options = vec![
            AgentConfigOption {
                id: "model".into(),
                name: Some("Model".into()),
                description: None,
                category: Some("model".into()),
                r#type: "select".into(),
                current_value: Some(flash.into()),
                options: vec![
                    AgentConfigOptionValue {
                        value: flash.into(),
                        name: Some("DeepSeek-V4-Flash".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "[\"deepseek-official\",\"deepseek-v4-pro\"]".into(),
                        name: Some("DeepSeek-V4-Pro".into()),
                        description: None,
                    },
                ],
            },
            AgentConfigOption {
                id: "reasoning_effort".into(),
                name: Some("Reasoning effort".into()),
                description: None,
                category: Some("thought_level".into()),
                r#type: "select".into(),
                current_value: Some("high".into()),
                options: vec![
                    AgentConfigOptionValue {
                        value: "off".into(),
                        name: Some("Off".into()),
                        description: None,
                    },
                    AgentConfigOptionValue {
                        value: "high".into(),
                        name: Some("High".into()),
                        description: None,
                    },
                ],
            },
        ];
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        assert_eq!(result.models.len(), 2);
        assert_eq!(result.models[0].id, flash);
        assert!(result.models[0].is_default);
        match &result.thinking {
            AgentThinkingSupport::Enum { arg, options } => {
                assert_eq!(arg.as_deref(), Some("reasoning_effort"));
                assert_eq!(options, &["off", "high"]);
            }
            other => panic!("expected reasoning enum, got {other:?}"),
        }
    }

    #[test]
    fn missing_thinking_option_marks_current_model_unsupported() {
        let options = vec![AgentConfigOption {
            id: "model".into(),
            name: Some("Model".into()),
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: Some("auto".into()),
            options: vec![AgentConfigOptionValue {
                value: "auto".into(),
                name: Some("Auto Model".into()),
                description: None,
            }],
        }];
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        assert!(matches!(
            result.models[0].thinking,
            Some(AgentThinkingSupport::None)
        ));
    }

    #[test]
    fn agent_config_option_maps_to_modes() {
        let options = vec![AgentConfigOption {
            id: "agent".into(),
            name: Some("Agent".into()),
            description: None,
            category: None,
            r#type: "select".into(),
            current_value: Some("plan".into()),
            options: vec![
                AgentConfigOptionValue {
                    value: "build".into(),
                    name: Some("Build".into()),
                    description: None,
                },
                AgentConfigOptionValue {
                    value: "plan".into(),
                    name: Some("Plan".into()),
                    description: None,
                },
            ],
        }];
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        assert_eq!(result.modes.len(), 2);
        assert_eq!(result.modes[1].id, "plan");
        assert!(result.modes[1].is_default);
        assert!(result.permission_modes.is_empty());
    }

    #[test]
    fn session_payload_modes_are_probed_not_stamped() {
        let payload = serde_json::json!({
            "configOptions": [{
                "id": "model",
                "name": "Model",
                "type": "select",
                "currentValue": "opus",
                "options": [{"value": "opus", "name": "Opus"}]
            }],
            "modes": {
                "currentModeId": "ask",
                "availableModes": [
                    {"id": "ask", "name": "Ask"},
                    {"id": "code", "name": "Code"}
                ]
            }
        });
        let options = config_options_from_session_payload(&payload);
        let result = probe_result_from_config_options(&options, PathBuf::from("/tmp"), true);
        assert_eq!(result.models[0].id, "opus");
        assert_eq!(result.modes.len(), 2);
        assert_eq!(result.modes[0].id, "ask");
        assert!(result.modes[0].is_default);
        assert_eq!(result.modes[1].id, "code");
    }

    #[test]
    fn session_payload_keeps_config_option_mode_over_legacy_modes() {
        let payload = serde_json::json!({
            "configOptions": [{
                "id": "mode",
                "type": "select",
                "currentValue": "build",
                "options": [{"value": "build", "name": "Build"}]
            }],
            "modes": {
                "currentModeId": "ask",
                "availableModes": [{"id": "ask", "name": "Ask"}]
            }
        });
        let options = config_options_from_session_payload(&payload);
        let mode_options: Vec<_> = options
            .iter()
            .filter(|option| is_mode_config_id(&option.id))
            .collect();
        assert_eq!(mode_options.len(), 1);
        assert_eq!(mode_options[0].current_value.as_deref(), Some("build"));
    }
}
