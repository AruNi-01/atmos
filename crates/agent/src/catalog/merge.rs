use chrono::Utc;

use crate::domain::{
    AgentModel, AgentModelCatalog, AgentThinkingSupport, CatalogSource, CatalogStatus,
    CatalogStrategyKind,
};

use super::parse::dedupe_models;

#[derive(Debug, Clone, Default)]
pub struct CatalogFragment {
    pub models: Vec<AgentModel>,
    pub modes: Vec<crate::domain::AgentMode>,
    pub thinking: AgentThinkingSupport,
    pub status: Option<CatalogStatus>,
    pub message: Option<String>,
    pub strategy: Option<CatalogStrategyKind>,
}

/// Merge Config → CLI → ACP. Live (CLI/ACP) model ids win; config fills thinking
/// when live omits it, and is the fallback when the live list is empty.
pub fn merge_catalogs(agent_id: &str, fragments: &[CatalogFragment]) -> AgentModelCatalog {
    let mut models: Vec<AgentModel> = Vec::new();
    let mut modes = Vec::new();
    let mut thinking = AgentThinkingSupport::None;
    let mut strategies_used = Vec::new();
    let mut status = CatalogStatus::Unsupported;
    let mut message = None;
    let mut saw_live_models = false;

    for fragment in fragments {
        if let Some(kind) = fragment.strategy {
            if !strategies_used.contains(&kind) {
                strategies_used.push(kind);
            }
        }
        let is_live = matches!(
            fragment.strategy,
            Some(CatalogStrategyKind::Cli | CatalogStrategyKind::Acp)
        );
        if !fragment.models.is_empty() {
            if is_live {
                if !saw_live_models {
                    models = fragment.models.clone();
                    saw_live_models = true;
                } else {
                    overlay_models(&mut models, &fragment.models);
                }
            } else if !saw_live_models {
                overlay_models(&mut models, &fragment.models);
            } else {
                fill_thinking_on_models(&mut models, &fragment.models);
            }
        }
        if !fragment.modes.is_empty() {
            modes = fragment.modes.clone();
        }
        if thinking.is_none() && !fragment.thinking.is_none() {
            thinking = fragment.thinking.clone();
        }
        if let Some(next_status) = fragment.status {
            status = next_status;
        }
        if fragment.message.is_some() {
            message = fragment.message.clone();
        }
    }

    if let Some(config) = fragments
        .iter()
        .find(|f| f.strategy == Some(CatalogStrategyKind::Config))
    {
        if thinking.is_none() {
            thinking = config.thinking.clone();
        }
        fill_thinking_on_models(&mut models, &config.models);
        if thinking.is_none() {
            thinking = config.thinking.clone();
        }
    }

    if !models.is_empty() && matches!(status, CatalogStatus::Unsupported | CatalogStatus::Probing) {
        status = CatalogStatus::Ok;
        message = None;
    }

    AgentModelCatalog {
        agent_id: agent_id.to_string(),
        status,
        models: dedupe_models(models),
        modes,
        thinking,
        strategies_used,
        fetched_at: Utc::now(),
        source: CatalogSource::Live,
        message,
    }
}

fn overlay_models(target: &mut Vec<AgentModel>, incoming: &[AgentModel]) {
    for model in incoming {
        if let Some(existing) = target.iter_mut().find(|item| item.id == model.id) {
            *existing = model.clone();
        } else {
            target.push(model.clone());
        }
    }
}

fn fill_thinking_on_models(target: &mut [AgentModel], config_models: &[AgentModel]) {
    for model in target.iter_mut() {
        if model.thinking.as_ref().is_none_or(|t| t.is_none()) {
            if let Some(config) = config_models.iter().find(|item| item.id == model.id) {
                if config.thinking.is_some() {
                    model.thinking = config.thinking.clone();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_ids_win_config_thinking_fills() {
        let config = CatalogFragment {
            models: vec![AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: false,
                thinking: Some(AgentThinkingSupport::Enum {
                    arg: Some("--effort".into()),
                    options: vec!["low".into(), "high".into()],
                }),
            }],
            thinking: AgentThinkingSupport::Enum {
                arg: Some("--effort".into()),
                options: vec!["low".into(), "high".into()],
            },
            strategy: Some(CatalogStrategyKind::Config),
            ..Default::default()
        };
        let cli = CatalogFragment {
            models: vec![
                AgentModel {
                    id: "opus".into(),
                    label: "Opus".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                },
                AgentModel {
                    id: "sonnet".into(),
                    label: "Sonnet".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
            ],
            status: Some(CatalogStatus::Ok),
            strategy: Some(CatalogStrategyKind::Cli),
            ..Default::default()
        };
        let merged = merge_catalogs("claude", &[config, cli]);
        assert_eq!(merged.models.len(), 2);
        assert!(merged.models.iter().any(|m| m.id == "sonnet"));
        assert!(matches!(merged.thinking, AgentThinkingSupport::Enum { .. }));
        let opus = merged.models.iter().find(|m| m.id == "opus").unwrap();
        assert!(matches!(
            opus.thinking,
            Some(AgentThinkingSupport::Enum { .. })
        ));
        assert_eq!(merged.source, CatalogSource::Live);
    }

    #[test]
    fn unsupported_thinking_stays_none() {
        let merged = merge_catalogs(
            "droid",
            &[CatalogFragment {
                strategy: Some(CatalogStrategyKind::Config),
                thinking: AgentThinkingSupport::None,
                status: Some(CatalogStatus::Ok),
                ..Default::default()
            }],
        );
        assert!(matches!(merged.thinking, AgentThinkingSupport::None));
    }
}
