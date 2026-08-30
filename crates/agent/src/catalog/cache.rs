use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::domain::{AgentModelCatalog, CatalogSource, CatalogStatus};

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
    pub fn should_skip_probe(&self, agent_id: &str, now: DateTime<Utc>) -> bool {
        self.get(agent_id, now)
            .is_some_and(|catalog| catalog.status == CatalogStatus::Ok)
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

fn cache_fresh(catalog: &AgentModelCatalog, now: DateTime<Utc>) -> bool {
    if catalog.models.is_empty() {
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
    use crate::domain::AgentThinkingSupport;

    #[test]
    fn ok_cache_younger_than_4h_skips_probe() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CatalogCache::new(dir.path().to_path_buf());
        let now = Utc::now();
        let catalog = AgentModelCatalog {
            agent_id: "claude".into(),
            status: CatalogStatus::Ok,
            models: vec![crate::domain::AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
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
}
