use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::options::{AgentOptionsSnapshot, OptionsSource, OptionsStatus};
use crate::policy::{advertised_permission_modes, canonicalize_chat_provider_id};

pub const OK_CACHE_TTL: Duration = Duration::from_secs(4 * 60 * 60);
pub const ERROR_CACHE_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone)]
struct CachedEntry {
    catalog: AgentOptionsSnapshot,
}

pub struct OptionsCache {
    memory: Mutex<HashMap<String, CachedEntry>>,
    dir: PathBuf,
}

impl OptionsCache {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            memory: Mutex::new(HashMap::new()),
            dir,
        }
    }

    pub fn get(&self, agent_id: &str, now: DateTime<Utc>) -> Option<AgentOptionsSnapshot> {
        self.get_usable(agent_id, now)
            .and_then(|(catalog, fresh)| fresh.then_some(catalog))
    }

    /// Fresh cache when possible; otherwise a still-displayable stale snapshot.
    /// `fresh == false` means TTL (or completeness) expired — callers should
    /// revalidate in the background without blanking the UI.
    pub fn get_usable(
        &self,
        agent_id: &str,
        now: DateTime<Utc>,
    ) -> Option<(AgentOptionsSnapshot, bool)> {
        if let Some(entry) = self
            .memory
            .lock()
            .ok()
            .and_then(|map| map.get(agent_id).cloned())
        {
            if let Some(result) = usable_cached(entry.catalog, now) {
                return Some(result);
            }
        }
        let path = self.path_for(agent_id);
        let text = fs::read_to_string(path).ok()?;
        let catalog: AgentOptionsSnapshot = serde_json::from_str(&text).ok()?;
        let result = usable_cached(catalog.clone(), now)?;
        if let Ok(mut map) = self.memory.lock() {
            map.insert(agent_id.to_string(), CachedEntry { catalog });
        }
        Some(result)
    }

    /// S19: skip live probe when an `ok` cache is younger than 4 hours.
    /// Slash-capable hosts with an empty command list are not skipped: an older
    /// models-only cache must not hide a later command probe.
    /// Hosts that stamp composer Mode / Permission lists are not skipped when
    /// those lists are empty: an older models+commands cache must not hide the
    /// pickers after switching Agent.
    pub fn should_skip_probe(&self, agent_id: &str, now: DateTime<Utc>) -> bool {
        self.get(agent_id, now).is_some_and(|catalog| {
            catalog.status == OptionsStatus::Ok
                && (!catalog.commands.is_empty() || !host_discovers_slash_commands(agent_id))
                && !host_missing_stamped_composer_options(&catalog)
        })
    }

    pub fn put(&self, catalog: &AgentOptionsSnapshot) -> io::Result<()> {
        if let Ok(mut map) = self.memory.lock() {
            map.insert(
                catalog.agent_id.clone(),
                CachedEntry {
                    catalog: catalog.clone(),
                },
            );
        }
        fs::create_dir_all(&self.dir)?;
        let path = self.path_for(&catalog.agent_id);
        let tmp = path.with_extension("json.tmp");
        let body = serde_json::to_vec_pretty(catalog)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        {
            let mut file = fs::File::create(&tmp)?;
            file.write_all(&body)?;
            file.sync_all()?;
        }
        fs::rename(tmp, path)?;
        Ok(())
    }

    fn path_for(&self, agent_id: &str) -> PathBuf {
        self.dir.join(format!("{agent_id}.json"))
    }
}

fn host_discovers_slash_commands(agent_id: &str) -> bool {
    matches!(
        canonicalize_chat_provider_id(agent_id),
        "claude" | "codex" | "opencode" | "pi" | "amp" | "grok"
    )
}

/// Native probes stamp a non-empty fallback for these lists. Empty means the
/// cache predates that stamp (or the native arm never ran). ACP may legitimately
/// have neither list; those caches stay usable.
fn host_missing_stamped_composer_options(catalog: &AgentOptionsSnapshot) -> bool {
    if catalog.status != OptionsStatus::Ok {
        return false;
    }
    match canonicalize_chat_provider_id(&catalog.agent_id) {
        "claude" | "grok" => catalog.permission_modes.is_empty() || catalog.modes.is_empty(),
        "codex" => {
            catalog.modes.is_empty()
                || catalog.permission_modes.is_empty()
                || advertised_permission_modes("codex").iter().any(|need| {
                    !catalog
                        .permission_modes
                        .iter()
                        .any(|have| have.id == need.id)
                })
        }
        "opencode" => {
            catalog.modes.is_empty()
                || catalog.permission_modes.is_empty()
                || advertised_permission_modes("opencode").iter().any(|need| {
                    !catalog
                        .permission_modes
                        .iter()
                        .any(|have| have.id == need.id)
                })
        }
        _ => false,
    }
}

fn usable_cached(
    mut catalog: AgentOptionsSnapshot,
    now: DateTime<Utc>,
) -> Option<(AgentOptionsSnapshot, bool)> {
    if !usable_for_display(&catalog) {
        return None;
    }
    catalog.source = OptionsSource::Cache;
    let fresh = cache_fresh(&catalog, now);
    Some((catalog, fresh))
}

/// Snapshot is good enough to show in the composer (even if TTL expired).
fn usable_for_display(catalog: &AgentOptionsSnapshot) -> bool {
    if matches!(
        catalog.status,
        OptionsStatus::Probing | OptionsStatus::Unsupported
    ) {
        return false;
    }
    if catalog
        .models
        .iter()
        .any(|model| crate::options::probe::cli::parse::model_id_is_table_noise(&model.id))
    {
        return false;
    }
    !catalog.models.is_empty()
        || !catalog.commands.is_empty()
        || matches!(
            catalog.status,
            OptionsStatus::Error | OptionsStatus::AuthRequired
        )
}

fn cache_fresh(catalog: &AgentOptionsSnapshot, now: DateTime<Utc>) -> bool {
    if !usable_for_display(catalog) {
        return false;
    }
    if catalog.status == OptionsStatus::Ok
        && catalog.commands.is_empty()
        && host_discovers_slash_commands(&catalog.agent_id)
    {
        return false;
    }
    if host_missing_stamped_composer_options(catalog) {
        return false;
    }
    let age = now
        .signed_duration_since(catalog.fetched_at)
        .to_std()
        .unwrap_or(Duration::ZERO);
    match catalog.status {
        OptionsStatus::Ok => age <= OK_CACHE_TTL,
        OptionsStatus::Error | OptionsStatus::AuthRequired => age <= ERROR_CACHE_TTL,
        OptionsStatus::Unsupported | OptionsStatus::Probing => false,
    }
}

pub fn options_cache_dir(root: &Path) -> PathBuf {
    root.join("options")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentThinkingSupport;

    #[test]
    fn ok_cache_younger_than_4h_skips_probe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "claude".into(),
            status: OptionsStatus::Ok,
            models: vec![crate::contract::AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: vec![crate::contract::AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            permission_modes: vec![crate::contract::AgentMode {
                id: "ask_always".into(),
                label: "Ask always".into(),
                is_default: true,
            }],
            commands: vec![crate::contract::AgentAvailableCommand {
                name: "compact".into(),
                description: "Compact conversation".into(),
                hint: None,
            }],
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.should_skip_probe("claude", now));
        let loaded = cache.get("claude", now).unwrap();
        assert_eq!(loaded.source, OptionsSource::Cache);
        let stale = now + chrono::Duration::hours(5);
        assert!(!cache.should_skip_probe("claude", stale));
        let (usable, fresh) = cache.get_usable("claude", stale).unwrap();
        assert!(!fresh);
        assert_eq!(usable.models[0].id, "opus");
        assert_eq!(usable.source, OptionsSource::Cache);
    }

    #[test]
    fn stale_ok_models_remain_usable_for_display() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let mut catalog = ok_models_and_commands("cursor", now);
        catalog.commands.clear();
        catalog.fetched_at = now - chrono::Duration::hours(5);
        cache.put(&catalog).unwrap();
        assert!(cache.get("cursor", now).is_none());
        let (usable, fresh) = cache.get_usable("cursor", now).unwrap();
        assert!(!fresh);
        assert_eq!(usable.models.len(), 1);
    }

    fn ok_models_and_commands(agent_id: &str, now: DateTime<Utc>) -> AgentOptionsSnapshot {
        AgentOptionsSnapshot {
            agent_id: agent_id.into(),
            status: OptionsStatus::Ok,
            models: vec![crate::contract::AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: vec![crate::contract::AgentAvailableCommand {
                name: "compact".into(),
                description: "Compact".into(),
                hint: None,
            }],
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        }
    }

    #[test]
    fn claude_or_grok_cache_without_permission_modes_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        for agent_id in ["claude", "grok"] {
            cache.put(&ok_models_and_commands(agent_id, now)).unwrap();
            assert!(
                cache.get(agent_id, now).is_none(),
                "{agent_id} cache without permission_modes must not be fresh"
            );
            assert!(!cache.should_skip_probe(agent_id, now));
        }
    }

    #[test]
    fn codex_or_opencode_cache_without_modes_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        for agent_id in ["codex", "opencode"] {
            cache.put(&ok_models_and_commands(agent_id, now)).unwrap();
            assert!(
                cache.get(agent_id, now).is_none(),
                "{agent_id} cache without modes must not be fresh"
            );
            assert!(!cache.should_skip_probe(agent_id, now));
        }
    }

    #[test]
    fn claude_or_grok_cache_without_modes_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        for agent_id in ["claude", "grok"] {
            let mut catalog = ok_models_and_commands(agent_id, now);
            catalog.permission_modes = vec![crate::contract::AgentMode {
                id: "ask_always".into(),
                label: "Ask always".into(),
                is_default: true,
            }];
            cache.put(&catalog).unwrap();
            assert!(
                cache.get(agent_id, now).is_none(),
                "{agent_id} cache without modes must not be fresh"
            );
            assert!(!cache.should_skip_probe(agent_id, now));
        }
    }

    #[test]
    fn codex_cache_without_permission_modes_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let mut catalog = ok_models_and_commands("codex", now);
        catalog.modes = vec![crate::contract::AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        }];
        cache.put(&catalog).unwrap();
        assert!(cache.get("codex", now).is_none());
        assert!(!cache.should_skip_probe("codex", now));
    }

    #[test]
    fn codex_cache_without_auto_permission_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let mut catalog = ok_models_and_commands("codex", now);
        catalog.modes = vec![crate::contract::AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        }];
        catalog.permission_modes = vec![
            crate::contract::AgentMode {
                id: "yolo".into(),
                label: "Yolo".into(),
                is_default: false,
            },
            crate::contract::AgentMode {
                id: "ask_always".into(),
                label: "Ask always".into(),
                is_default: true,
            },
        ];
        cache.put(&catalog).unwrap();
        assert!(cache.get("codex", now).is_none());
        assert!(!cache.should_skip_probe("codex", now));
    }

    #[test]
    fn opencode_cache_without_auto_permission_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let mut catalog = ok_models_and_commands("opencode", now);
        catalog.modes = vec![crate::contract::AgentMode {
            id: "build".into(),
            label: "Build".into(),
            is_default: true,
        }];
        catalog.permission_modes = vec![crate::contract::AgentMode {
            id: "ask_always".into(),
            label: "Ask always".into(),
            is_default: true,
        }];
        cache.put(&catalog).unwrap();
        assert!(cache.get("opencode", now).is_none());
        assert!(!cache.should_skip_probe("opencode", now));
    }

    #[test]
    fn acp_cache_without_composer_option_lists_still_skips() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let mut catalog = ok_models_and_commands("factory-droid", now);
        catalog.commands.clear();
        cache.put(&catalog).unwrap();
        assert!(cache.get("factory-droid", now).is_some());
        assert!(cache.should_skip_probe("factory-droid", now));
    }

    #[test]
    fn ok_models_without_commands_do_not_skip_slash_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "claude".into(),
            status: OptionsStatus::Ok,
            models: vec![crate::contract::AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("claude", now).is_none());
        assert!(!cache.should_skip_probe("claude", now));
    }

    #[test]
    fn grok_ok_without_commands_does_not_skip_catalog_probe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "grok".into(),
            status: OptionsStatus::Ok,
            models: vec![crate::contract::AgentModel {
                id: "grok-4".into(),
                label: "Grok 4".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("grok", now).is_none());
        assert!(!cache.should_skip_probe("grok", now));
    }

    #[test]
    fn empty_model_list_is_not_a_usable_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "opencode".into(),
            status: OptionsStatus::Ok,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(!cache.should_skip_probe("opencode", now));
        assert!(cache.get("opencode", now).is_none());
    }

    #[test]
    fn empty_error_catalog_is_cached_so_broken_cli_does_not_reprobe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "codex".into(),
            status: OptionsStatus::Error,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: Some("Codex CLI is broken".into()),
        };
        cache.put(&catalog).unwrap();
        let loaded = cache.get("codex", now).expect("error cache");
        assert_eq!(loaded.status, OptionsStatus::Error);
        assert_eq!(loaded.message.as_deref(), Some("Codex CLI is broken"));
        assert_eq!(loaded.source, OptionsSource::Cache);
        assert!(!cache.should_skip_probe("codex", now));
        let stale = now + chrono::Duration::minutes(16);
        assert!(cache.get("codex", stale).is_none());
    }

    #[test]
    fn ok_commands_without_models_are_a_usable_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "amp".into(),
            status: OptionsStatus::Ok,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: vec![crate::contract::AgentAvailableCommand {
                name: "10x".into(),
                description: "audit".into(),
                hint: None,
            }],
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        let loaded = cache.get("amp", now).expect("command cache");
        assert_eq!(loaded.commands[0].name, "10x");
        assert!(cache.should_skip_probe("amp", now));
    }

    #[test]
    fn table_header_model_ids_are_not_a_usable_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = OptionsCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentOptionsSnapshot {
            agent_id: "pi".into(),
            status: OptionsStatus::Ok,
            models: vec![crate::contract::AgentModel {
                id: "provider  model                         context  max-out  thinking  images"
                    .into(),
                label: "provider  model".into(),
                group: None,
                is_default: false,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: vec![crate::contract::AgentAvailableCommand {
                name: "compact".into(),
                description: "Compact".into(),
                hint: None,
            }],
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: OptionsSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("pi", now).is_none());
        assert!(!cache.should_skip_probe("pi", now));
    }
}
