use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::catalog::{AgentModelCatalog, CatalogSource, CatalogStatus};
use crate::policy::canonicalize_chat_provider_id;

pub const OK_CACHE_TTL: Duration = Duration::from_secs(4 * 60 * 60);
pub const ERROR_CACHE_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone)]
struct CachedEntry {
    catalog: AgentModelCatalog,
}

pub struct CatalogCache {
    memory: Mutex<HashMap<String, CachedEntry>>,
    dir: PathBuf,
}

impl CatalogCache {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            memory: Mutex::new(HashMap::new()),
            dir,
        }
    }

    pub fn get(&self, agent_id: &str, now: DateTime<Utc>) -> Option<AgentModelCatalog> {
        if let Some(entry) = self
            .memory
            .lock()
            .ok()
            .and_then(|map| map.get(agent_id).cloned())
        {
            if cache_fresh(&entry.catalog, now) {
                let mut catalog = entry.catalog;
                catalog.source = CatalogSource::Cache;
                return Some(catalog);
            }
        }
        let path = self.path_for(agent_id);
        let text = fs::read_to_string(path).ok()?;
        let mut catalog: AgentModelCatalog = serde_json::from_str(&text).ok()?;
        if !cache_fresh(&catalog, now) {
            return None;
        }
        catalog.source = CatalogSource::Cache;
        if let Ok(mut map) = self.memory.lock() {
            map.insert(
                agent_id.to_string(),
                CachedEntry {
                    catalog: catalog.clone(),
                },
            );
        }
        Some(catalog)
    }

    /// S19: skip live probe when an `ok` cache is younger than 4 hours.
    /// Slash-capable hosts with an empty command list are not skipped: an older
    /// models-only cache must not hide a later command probe.
    /// Hosts that stamp composer Mode / Permission lists are not skipped when
    /// those lists are empty: an older models+commands cache must not hide the
    /// pickers after switching Agent.
    pub fn should_skip_probe(&self, agent_id: &str, now: DateTime<Utc>) -> bool {
        self.get(agent_id, now).is_some_and(|catalog| {
            catalog.status == CatalogStatus::Ok
                && (!catalog.commands.is_empty() || !host_discovers_slash_commands(agent_id))
                && !host_missing_stamped_composer_options(&catalog)
        })
    }

    pub fn put(&self, catalog: &AgentModelCatalog) -> io::Result<()> {
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
fn host_missing_stamped_composer_options(catalog: &AgentModelCatalog) -> bool {
    if catalog.status != CatalogStatus::Ok {
        return false;
    }
    match canonicalize_chat_provider_id(&catalog.agent_id) {
        "claude" | "grok" => catalog.permission_modes.is_empty() || catalog.modes.is_empty(),
        "codex" => catalog.modes.is_empty() || catalog.permission_modes.is_empty(),
        "opencode" => catalog.modes.is_empty(),
        _ => false,
    }
}

fn cache_fresh(catalog: &AgentModelCatalog, now: DateTime<Utc>) -> bool {
    if catalog.models.is_empty()
        && catalog.commands.is_empty()
        && !matches!(
            catalog.status,
            CatalogStatus::Error | CatalogStatus::AuthRequired
        )
    {
        return false;
    }
    if catalog.status == CatalogStatus::Ok
        && catalog.commands.is_empty()
        && host_discovers_slash_commands(&catalog.agent_id)
    {
        return false;
    }
    if host_missing_stamped_composer_options(catalog) {
        return false;
    }
    if catalog
        .models
        .iter()
        .any(|model| crate::catalog::parse::model_id_is_table_noise(&model.id))
    {
        return false;
    }
    let age = now
        .signed_duration_since(catalog.fetched_at)
        .to_std()
        .unwrap_or(Duration::ZERO);
    match catalog.status {
        CatalogStatus::Ok => age <= OK_CACHE_TTL,
        CatalogStatus::Error | CatalogStatus::AuthRequired => age <= ERROR_CACHE_TTL,
        CatalogStatus::Unsupported | CatalogStatus::Probing => false,
    }
}

pub fn catalog_cache_dir(root: &Path) -> PathBuf {
    root.join("model_catalog")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentThinkingSupport;

    #[test]
    fn ok_cache_younger_than_4h_skips_probe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "claude".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.should_skip_probe("claude", now));
        let loaded = cache.get("claude", now).unwrap();
        assert_eq!(loaded.source, CatalogSource::Cache);
        let stale = now + chrono::Duration::hours(5);
        assert!(!cache.should_skip_probe("claude", stale));
    }

    fn ok_models_and_commands(agent_id: &str, now: DateTime<Utc>) -> AgentModelCatalog {
        AgentModelCatalog {
            agent_id: agent_id.into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        }
    }

    #[test]
    fn claude_or_grok_cache_without_permission_modes_does_not_skip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
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
        let cache = CatalogCache::new(dir.path().to_path_buf());
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
        let cache = CatalogCache::new(dir.path().to_path_buf());
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
        let cache = CatalogCache::new(dir.path().to_path_buf());
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
    fn acp_cache_without_composer_option_lists_still_skips() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
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
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "claude".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("claude", now).is_none());
        assert!(!cache.should_skip_probe("claude", now));
    }

    #[test]
    fn grok_ok_without_commands_does_not_skip_catalog_probe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "grok".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("grok", now).is_none());
        assert!(!cache.should_skip_probe("grok", now));
    }

    #[test]
    fn empty_model_list_is_not_a_usable_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "opencode".into(),
            status: CatalogStatus::Ok,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: CatalogSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(!cache.should_skip_probe("opencode", now));
        assert!(cache.get("opencode", now).is_none());
    }

    #[test]
    fn empty_error_catalog_is_cached_so_broken_cli_does_not_reprobe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "codex".into(),
            status: CatalogStatus::Error,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: now,
            source: CatalogSource::Live,
            message: Some("Codex CLI is broken".into()),
        };
        cache.put(&catalog).unwrap();
        let loaded = cache.get("codex", now).expect("error cache");
        assert_eq!(loaded.status, CatalogStatus::Error);
        assert_eq!(loaded.message.as_deref(), Some("Codex CLI is broken"));
        assert_eq!(loaded.source, CatalogSource::Cache);
        assert!(!cache.should_skip_probe("codex", now));
        let stale = now + chrono::Duration::minutes(16);
        assert!(cache.get("codex", stale).is_none());
    }

    #[test]
    fn ok_commands_without_models_are_a_usable_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "amp".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
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
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "pi".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        };
        cache.put(&catalog).unwrap();
        assert!(cache.get("pi", now).is_none());
        assert!(!cache.should_skip_probe("pi", now));
    }
}
