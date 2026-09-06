use chrono::Utc;

use crate::contract::{AgentAvailableCommand, AgentMode, AgentModel, AgentThinkingSupport};
use crate::options::probe::cli::cursor::{
    cursor_model_display_label, cursor_model_has_brackets, fill_cursor_thinking_by_base,
    models_look_like_cursor_acp,
};
use crate::options::{AgentOptionsSnapshot, OptionsProbeStrategy, OptionsSource, OptionsStatus};
use crate::policy::{canonicalize_chat_provider_id, expand_sparse_permission_modes};

use crate::options::probe::cli::parse::dedupe_models;

#[derive(Debug, Clone, Default)]
pub struct OptionsFragment {
    pub models: Vec<AgentModel>,
    pub modes: Vec<AgentMode>,
    pub permission_modes: Vec<AgentMode>,
    pub thinking: AgentThinkingSupport,
    pub commands: Vec<AgentAvailableCommand>,
    pub status: Option<OptionsStatus>,
    pub message: Option<String>,
    pub strategy: Option<OptionsProbeStrategy>,
}

/// Merge Config → CLI → ACP → Native. Live model ids win; config fills thinking
/// when live omits it, and is the fallback when the live list is empty.
/// Later non-empty `modes` / `permission_modes` lists win; an empty list does not wipe.
pub fn merge_options_snapshots(
    agent_id: &str,
    fragments: &[OptionsFragment],
) -> AgentOptionsSnapshot {
    let mut models: Vec<AgentModel> = Vec::new();
    let mut modes = Vec::new();
    let mut permission_modes = Vec::new();
    let mut commands = Vec::new();
    let mut thinking = AgentThinkingSupport::None;
    let mut strategies_used = Vec::new();
    let mut status = OptionsStatus::Unsupported;
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
            Some(
                OptionsProbeStrategy::Cli
                    | OptionsProbeStrategy::Acp
                    | OptionsProbeStrategy::Native
            )
        );
        if !fragment.models.is_empty() {
            let incoming = decorate_cursor_acp_labels(agent_id, fragment.models.clone());
            if is_live {
                if !saw_live_models {
                    models = incoming;
                    saw_live_models = true;
                } else if should_replace_models_with_acp(
                    agent_id,
                    fragment.strategy,
                    &models,
                    &incoming,
                ) {
                    // Cursor Chat: ACP bracket/bare wire values replace CLI ids.
                    // Keep per-model effort ladders collapsed from CLI --list-models.
                    let previous = models;
                    models = incoming;
                    if canonicalize_chat_provider_id(agent_id) == "cursor" {
                        fill_cursor_thinking_by_base(&mut models, &previous);
                    }
                } else {
                    overlay_models(&mut models, &incoming);
                }
            } else if !saw_live_models {
                overlay_models(&mut models, &incoming);
            } else {
                fill_thinking_on_models(&mut models, &incoming);
            }
        }
        if !fragment.modes.is_empty() {
            modes = fragment.modes.clone();
        }
        if !fragment.permission_modes.is_empty() {
            permission_modes = fragment.permission_modes.clone();
        }
        if !fragment.commands.is_empty() {
            commands = fragment.commands.clone();
        }
        if !fragment.thinking.is_none() && (thinking.is_none() || is_live) {
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
        .find(|f| f.strategy == Some(OptionsProbeStrategy::Config))
    {
        if thinking.is_none() {
            thinking = config.thinking.clone();
        }
    }
    for fragment in fragments {
        fill_thinking_on_models(&mut models, &fragment.models);
        if canonicalize_chat_provider_id(agent_id) == "cursor" {
            fill_cursor_thinking_by_base(&mut models, &fragment.models);
        }
    }

    // Cursor: per-model ladders from CLI collapse are authoritative. Drop the
    // session-scoped ACP enum so every model does not inherit one probe's effort.
    if canonicalize_chat_provider_id(agent_id) == "cursor"
        && models
            .iter()
            .any(|model| model.thinking.as_ref().is_some_and(|item| !item.is_none()))
    {
        thinking = AgentThinkingSupport::None;
    }

    if canonicalize_chat_provider_id(agent_id) == "cursor" {
        permission_modes = expand_sparse_permission_modes("cursor", permission_modes);
    }

    if !models.is_empty()
        && matches!(
            status,
            OptionsStatus::Unsupported
                | OptionsStatus::Probing
                | OptionsStatus::Error
                | OptionsStatus::AuthRequired
        )
    {
        status = OptionsStatus::Ok;
        message = None;
    }

    AgentOptionsSnapshot {
        agent_id: agent_id.to_string(),
        status,
        models: dedupe_models(models),
        modes,
        permission_modes,
        commands,
        thinking,
        strategies_used,
        fetched_at: Utc::now(),
        source: OptionsSource::Live,
        message,
    }
}

fn should_replace_models_with_acp(
    agent_id: &str,
    strategy: Option<OptionsProbeStrategy>,
    existing: &[AgentModel],
    incoming: &[AgentModel],
) -> bool {
    if strategy != Some(OptionsProbeStrategy::Acp) || incoming.is_empty() {
        return false;
    }
    // Cursor-only: do not infer from wire shape — other ACP agents (e.g. DeepSeek)
    // may use `[...]` JSON-array ids that are not Cursor bracket params.
    if canonicalize_chat_provider_id(agent_id) != "cursor" {
        return false;
    }
    let incoming_bracket =
        models_look_like_cursor_acp(incoming.iter().map(|item| item.id.as_str()));
    let existing_encoded = existing
        .iter()
        .any(|item| !cursor_model_has_brackets(&item.id));
    existing_encoded || incoming_bracket
}

fn decorate_cursor_acp_labels(agent_id: &str, mut models: Vec<AgentModel>) -> Vec<AgentModel> {
    if canonicalize_chat_provider_id(agent_id) != "cursor" {
        return models;
    }
    for model in &mut models {
        if cursor_model_has_brackets(&model.id) {
            model.label = cursor_model_display_label(&model.id, Some(&model.label));
        }
    }
    models
}

fn overlay_models(target: &mut Vec<AgentModel>, incoming: &[AgentModel]) {
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
        let config = OptionsFragment {
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
            strategy: Some(OptionsProbeStrategy::Config),
            ..Default::default()
        };
        let cli = OptionsFragment {
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
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let merged = merge_options_snapshots("claude", &[config, cli]);
        assert_eq!(merged.models.len(), 2);
        assert!(merged.models.iter().any(|m| m.id == "sonnet"));
        assert!(matches!(merged.thinking, AgentThinkingSupport::Enum { .. }));
        let opus = merged.models.iter().find(|m| m.id == "opus").unwrap();
        assert!(matches!(
            opus.thinking,
            Some(AgentThinkingSupport::Enum { .. })
        ));
        assert_eq!(merged.source, OptionsSource::Live);
    }

    #[test]
    fn deepseek_json_array_ids_are_not_decorated_as_cursor_brackets() {
        let id = r#"["deepseek-official","deepseek-v4-flash"]"#;
        let acp = OptionsFragment {
            models: vec![AgentModel {
                id: id.into(),
                label: "DeepSeek-V4-Flash".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("deepseek-harness", &[acp]);
        assert_eq!(merged.models.len(), 1);
        assert_eq!(merged.models[0].label, "DeepSeek-V4-Flash");
        assert!(!merged.models[0].label.contains("deepseek-official"));
    }

    #[test]
    fn acp_models_keep_cli_per_model_thinking() {
        let cli = OptionsFragment {
            models: vec![AgentModel {
                id: "claude-opus-5".into(),
                label: "Opus 5".into(),
                group: None,
                is_default: true,
                thinking: Some(AgentThinkingSupport::Enum {
                    arg: Some("--reasoning-effort".into()),
                    options: vec![
                        "off".into(),
                        "low".into(),
                        "medium".into(),
                        "high".into(),
                        "xhigh".into(),
                        "max".into(),
                    ],
                }),
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let acp = OptionsFragment {
            models: vec![AgentModel {
                id: "claude-opus-5".into(),
                label: "Opus 5".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            thinking: AgentThinkingSupport::Manual {
                arg: "--reasoning-effort".into(),
                placeholder: None,
            },
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("factory-droid", &[cli, acp]);
        let opus = merged
            .models
            .iter()
            .find(|model| model.id == "claude-opus-5")
            .unwrap();
        match &opus.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options.len(), 6);
            }
            other => panic!("expected per-model enum thinking, got {other:?}"),
        }
    }

    #[test]
    fn live_enum_overrides_config_manual() {
        let config = OptionsFragment {
            thinking: AgentThinkingSupport::Manual {
                arg: "--reasoning-effort".into(),
                placeholder: Some("e.g. high".into()),
            },
            strategy: Some(OptionsProbeStrategy::Config),
            status: Some(OptionsStatus::Ok),
            ..Default::default()
        };
        let acp = OptionsFragment {
            models: vec![AgentModel {
                id: "gpt-5.3-codex".into(),
                label: "GPT-5.3-Codex".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            thinking: AgentThinkingSupport::Enum {
                arg: Some("thought_level".into()),
                options: vec!["off".into(), "low".into(), "medium".into(), "high".into()],
            },
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("factory-droid", &[config, acp]);
        match merged.thinking {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(options, vec!["off", "low", "medium", "high"]);
            }
            other => panic!("expected ACP enum thinking, got {other:?}"),
        }
    }

    #[test]
    fn live_none_keeps_config_manual() {
        let config = OptionsFragment {
            thinking: AgentThinkingSupport::Manual {
                arg: "--reasoning-effort".into(),
                placeholder: None,
            },
            strategy: Some(OptionsProbeStrategy::Config),
            status: Some(OptionsStatus::Ok),
            ..Default::default()
        };
        let acp = OptionsFragment {
            models: vec![AgentModel {
                id: "gpt-5.3-codex".into(),
                label: "GPT-5.3-Codex".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            thinking: AgentThinkingSupport::None,
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("factory-droid", &[config, acp]);
        assert!(matches!(
            merged.thinking,
            AgentThinkingSupport::Manual { .. }
        ));
    }

    #[test]
    fn unsupported_thinking_stays_none() {
        let merged = merge_options_snapshots(
            "droid",
            &[OptionsFragment {
                strategy: Some(OptionsProbeStrategy::Config),
                thinking: AgentThinkingSupport::None,
                status: Some(OptionsStatus::Ok),
                ..Default::default()
            }],
        );
        assert!(matches!(merged.thinking, AgentThinkingSupport::None));
    }

    #[test]
    fn live_models_keep_ok_when_later_acp_errors() {
        let cli = OptionsFragment {
            models: vec![AgentModel {
                id: "opencode/big-pickle".into(),
                label: "big-pickle".into(),
                group: None,
                is_default: false,
                thinking: None,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let acp = OptionsFragment {
            status: Some(OptionsStatus::Error),
            message: Some("agent not found".into()),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("opencode", &[cli, acp]);
        assert_eq!(merged.status, OptionsStatus::Ok);
        assert_eq!(merged.models.len(), 1);
        assert!(merged.message.is_none());
    }

    #[test]
    fn later_non_empty_permission_modes_win_and_copy_into_supported_options() {
        use crate::supported_options_from_snapshot;
        let config = OptionsFragment {
            strategy: Some(OptionsProbeStrategy::Config),
            ..Default::default()
        };
        let native = OptionsFragment {
            models: vec![AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            permission_modes: vec![AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Native),
            ..Default::default()
        };
        let merged = merge_options_snapshots("claude", &[config, native]);
        assert!(merged.modes.is_empty());
        assert_eq!(merged.permission_modes.len(), 1);
        assert_eq!(merged.permission_modes[0].id, "default");
        let options = supported_options_from_snapshot(&merged);
        assert!(options.modes.is_empty());
        assert_eq!(options.permission_modes.len(), 1);
        assert_eq!(options.permission_modes[0].id, "default");
    }

    #[test]
    fn empty_later_permission_modes_do_not_wipe_earlier() {
        let cli = OptionsFragment {
            permission_modes: vec![AgentMode {
                id: "ask".into(),
                label: "Ask".into(),
                is_default: true,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let acp = OptionsFragment {
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("gemini", &[cli, acp]);
        assert_eq!(merged.permission_modes[0].id, "ask");
    }

    #[test]
    fn later_non_empty_permission_modes_replace_earlier() {
        let first = OptionsFragment {
            permission_modes: vec![AgentMode {
                id: "ask".into(),
                label: "Ask".into(),
                is_default: true,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let second = OptionsFragment {
            permission_modes: vec![AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Native),
            ..Default::default()
        };
        let merged = merge_options_snapshots("opencode", &[first, second]);
        assert_eq!(merged.permission_modes[0].id, "default");
    }

    #[test]
    fn later_non_empty_commands_win() {
        let cli = OptionsFragment {
            commands: vec![AgentAvailableCommand {
                name: "init".into(),
                description: "setup".into(),
                hint: None,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let native = OptionsFragment {
            commands: vec![AgentAvailableCommand {
                name: "review".into(),
                description: "review changes".into(),
                hint: None,
            }],
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Native),
            ..Default::default()
        };
        let merged = merge_options_snapshots("opencode", &[cli, native]);
        assert_eq!(merged.commands.len(), 1);
        assert_eq!(merged.commands[0].name, "review");
    }

    #[test]
    fn cursor_acp_bracket_models_replace_cli_encoded_ids() {
        use crate::options::probe::cli::collapse_cursor_cli_models;

        // CLI strategy collapses encoded variants before merge sees them.
        let cli = OptionsFragment {
            models: collapse_cursor_cli_models(vec![
                AgentModel {
                    id: "gpt-5.3-codex-low".into(),
                    label: "Codex 5.3 Low".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "gpt-5.3-codex-high-fast".into(),
                    label: "Codex 5.3 High Fast".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "composer-2.5-fast".into(),
                    label: "Composer 2.5 Fast".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                },
            ]),
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let acp = OptionsFragment {
            models: vec![
                AgentModel {
                    id: "gpt-5.3-codex[reasoning=medium,fast=false]".into(),
                    label: "gpt-5.3-codex".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "composer-2.5[fast=true]".into(),
                    label: "composer-2.5".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                },
            ],
            thinking: AgentThinkingSupport::Enum {
                arg: Some("effort".into()),
                options: vec![
                    "low".into(),
                    "medium".into(),
                    "high".into(),
                    "xhigh".into(),
                    "max".into(),
                ],
            },
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let merged = merge_options_snapshots("cursor", &[cli, acp]);
        assert_eq!(
            merged
                .models
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            [
                "gpt-5.3-codex[reasoning=medium,fast=false]",
                "composer-2.5[fast=true]"
            ]
        );
        assert!(merged
            .models
            .iter()
            .any(|item| item.label.contains("reasoning=medium")));
        // Agent-level ACP effort must not become a shared ladder.
        assert!(merged.thinking.is_none());
        let codex = merged
            .models
            .iter()
            .find(|item| item.id.starts_with("gpt-5.3-codex"))
            .unwrap();
        match &codex.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high"]);
            }
            other => panic!("expected CLI-collapsed codex effort, got {other:?}"),
        }
        let composer = merged
            .models
            .iter()
            .find(|item| item.id.starts_with("composer-2.5"))
            .unwrap();
        assert!(matches!(
            composer.thinking,
            Some(AgentThinkingSupport::None)
        ));
    }

    #[test]
    fn cursor_live_cli_collapse_fills_acp_bare_ids() {
        use crate::options::probe::cli::collapse_cursor_cli_models;
        use crate::options::probe::cli::parse::parse_line_list;
        use std::process::Command;

        let output = Command::new("cursor-agent").arg("--list-models").output();
        let Ok(output) = output else {
            eprintln!("skip: cursor-agent missing");
            return;
        };
        if !output.status.success() {
            eprintln!("skip: cursor-agent --list-models failed");
            return;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let collapsed = collapse_cursor_cli_models(parse_line_list(&stdout));
        assert!(
            collapsed.iter().any(|model| {
                model.id == "gpt-5.3-codex"
                    && model.thinking.as_ref().is_some_and(|item| !item.is_none())
            }),
            "CLI collapse should stamp gpt-5.3-codex effort"
        );

        let acp = OptionsFragment {
            models: vec![
                AgentModel {
                    id: "grok-4.6".into(),
                    label: "grok-4.6".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "gpt-5.3-codex".into(),
                    label: "gpt-5.3-codex".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "claude-sonnet-4-6".into(),
                    label: "claude-sonnet-4-6".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "composer-2.5".into(),
                    label: "composer-2.5".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                },
            ],
            thinking: AgentThinkingSupport::Enum {
                arg: Some("effort".into()),
                options: vec!["low".into(), "medium".into(), "high".into()],
            },
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Acp),
            ..Default::default()
        };
        let cli = OptionsFragment {
            models: collapsed,
            status: Some(OptionsStatus::Ok),
            strategy: Some(OptionsProbeStrategy::Cli),
            ..Default::default()
        };
        let merged = merge_options_snapshots("cursor", &[cli, acp]);
        assert!(merged.thinking.is_none(), "agent-level effort must drop");
        let grok = merged.models.iter().find(|m| m.id == "grok-4.6").unwrap();
        assert!(
            matches!(grok.thinking, Some(AgentThinkingSupport::Enum { .. })),
            "grok-4.6 should inherit cursor-grok-4.6 ladder, got {:?}",
            grok.thinking
        );
        let codex = merged
            .models
            .iter()
            .find(|m| m.id == "gpt-5.3-codex")
            .unwrap();
        assert!(
            matches!(codex.thinking, Some(AgentThinkingSupport::Enum { .. })),
            "codex ladder missing: {:?}",
            codex.thinking
        );
        let sonnet = merged
            .models
            .iter()
            .find(|m| m.id == "claude-sonnet-4-6")
            .unwrap();
        assert!(
            matches!(sonnet.thinking, Some(AgentThinkingSupport::Enum { .. })),
            "claude-sonnet-4-6 should match claude-4.6-sonnet, got {:?}",
            sonnet.thinking
        );
        let composer = merged
            .models
            .iter()
            .find(|m| m.id == "composer-2.5")
            .unwrap();
        assert!(
            matches!(composer.thinking, Some(AgentThinkingSupport::None)),
            "composer has no effort variants"
        );
    }
}
