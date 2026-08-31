use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::time::timeout;

use crate::acp_client::client::AcpSessionEvent;
use crate::acp_client::tools::AcpToolHandler;
use crate::acp_client::types::AgentConfigOption;
use crate::acp_client::{run_acp_session, AcpSessionHandle};
use crate::domain::{AgentMode, AgentModel, AgentThinkingSupport};
use crate::models::AgentLaunchSpec;

use super::engine::{AcpCatalogProbe, AcpProbeResult};

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

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
    for option in options {
        let id = option.id.to_ascii_lowercase();
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
        } else if id == "mode" || id == "modes" {
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
        }
    }
    let thinking = thinking_support_from_options(options);
    apply_thinking_to_current_model(&mut models, &thinking);
    AcpProbeResult {
        models,
        modes,
        thinking,
        cwd,
        closed,
    }
}

#[async_trait]
impl AcpCatalogProbe for StdioAcpCatalogProbe {
    async fn probe(&self, agent_id: &str, isolated_cwd: &Path) -> Result<AcpProbeResult, String> {
        std::fs::create_dir_all(isolated_cwd).map_err(|error| error.to_string())?;
        let launch = self.resolver.resolve(agent_id).await?;
        let mut handle = timeout(
            PROBE_TIMEOUT,
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

        let options = drain_config_options(&mut handle, PROBE_TIMEOUT).await;
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
}
