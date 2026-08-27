use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use agent::{
    catalog_cache_dir, thinking_from_builtin, AgentCatalogSpec, AgentModelCatalog, CatalogCache,
    CatalogEngine, CatalogParserKind, CatalogSource, CatalogStatus, CatalogStrategyKind,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

pub const PREFETCH_POLL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, serde::Serialize)]
pub struct CatalogUpdated {
    pub agent_id: String,
    pub catalog: AgentModelCatalog,
}

pub struct CatalogPrefetchWorker {
    started: AtomicBool,
    cache: CatalogCache,
    engine: Mutex<CatalogEngine>,
    specs: Mutex<Vec<AgentCatalogSpec>>,
    events: broadcast::Sender<CatalogUpdated>,
    poll: Duration,
    web_clients: AtomicUsize,
    probe_count: AtomicUsize,
}

impl CatalogPrefetchWorker {
    pub fn new(agent_data_root: PathBuf, engine: CatalogEngine, poll: Duration) -> Self {
        Self::with_specs(agent_data_root, engine, poll, Vec::new())
    }

    pub fn with_specs(
        agent_data_root: PathBuf,
        engine: CatalogEngine,
        poll: Duration,
        specs: Vec<AgentCatalogSpec>,
    ) -> Self {
        let cache = CatalogCache::new(catalog_cache_dir(&agent_data_root));
        let (events, _) = broadcast::channel(64);
        Self {
            started: AtomicBool::new(false),
            cache,
            engine: Mutex::new(engine),
            specs: Mutex::new(specs),
            events,
            poll,
            web_clients: AtomicUsize::new(0),
            probe_count: AtomicUsize::new(0),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CatalogUpdated> {
        self.events.subscribe()
    }

    pub fn is_started(&self) -> bool {
        self.started.load(Ordering::SeqCst)
    }

    pub fn probe_count(&self) -> usize {
        self.probe_count.load(Ordering::SeqCst)
    }

    pub async fn set_specs(&self, specs: Vec<AgentCatalogSpec>) {
        *self.specs.lock().await = specs;
    }

    pub fn on_web_connect(self: &Arc<Self>) {
        self.web_clients.fetch_add(1, Ordering::SeqCst);
        self.ensure_started();
    }

    pub fn on_web_disconnect(&self) {
        self.web_clients
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |value| {
                Some(value.saturating_sub(1))
            })
            .ok();
    }

    pub fn ensure_started(self: &Arc<Self>) {
        if self
            .started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let worker = Arc::clone(self);
        tokio::spawn(async move {
            worker.run_loop().await;
        });
    }

    async fn run_loop(self: Arc<Self>) {
        loop {
            self.probe_enabled().await;
            tokio::time::sleep(self.poll).await;
            if self.web_clients.load(Ordering::SeqCst) == 0 {
                self.started.store(false, Ordering::SeqCst);
                break;
            }
        }
    }

    async fn probe_enabled(&self) {
        let specs = self.specs.lock().await.clone();
        let now = Utc::now();
        for spec in specs {
            if self.cache.should_skip_probe(&spec.agent_id, now) {
                continue;
            }
            self.probe_count.fetch_add(1, Ordering::SeqCst);
            let catalog = {
                let engine = self.engine.lock().await;
                engine.probe(&spec).await
            };
            if let Err(error) = self.cache.put(&catalog) {
                warn!("failed to cache catalog for {}: {error}", spec.agent_id);
            }
            let _ = self.events.send(CatalogUpdated {
                agent_id: spec.agent_id,
                catalog,
            });
        }
    }

    pub async fn get(&self, spec: &AgentCatalogSpec, refresh: bool) -> AgentModelCatalog {
        let now = Utc::now();
        if !refresh {
            if let Some(cached) = self.cache.get(&spec.agent_id, now) {
                return cached;
            }
        }
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let mut catalog = {
            let engine = self.engine.lock().await;
            engine.probe(spec).await
        };
        catalog.source = CatalogSource::Live;
        let _ = self.cache.put(&catalog);
        catalog
    }

    pub fn cache_get(&self, agent_id: &str) -> Option<AgentModelCatalog> {
        self.cache.get(agent_id, Utc::now())
    }
}

pub fn terminal_catalog_from(catalog: &AgentModelCatalog) -> crate::TerminalAgentModelCatalog {
    use crate::{
        TerminalAgentModelCatalog, TerminalAgentModelCatalogSource,
        TerminalAgentModelCatalogStatus, TerminalAgentModelOption,
    };
    TerminalAgentModelCatalog {
        agent_id: catalog.agent_id.clone(),
        status: match catalog.status {
            CatalogStatus::Ok => TerminalAgentModelCatalogStatus::Ok,
            CatalogStatus::AuthRequired => TerminalAgentModelCatalogStatus::AuthRequired,
            CatalogStatus::Unsupported => TerminalAgentModelCatalogStatus::Unsupported,
            CatalogStatus::Error | CatalogStatus::Probing => TerminalAgentModelCatalogStatus::Error,
        },
        models: catalog
            .models
            .iter()
            .map(|model| TerminalAgentModelOption {
                id: model.id.clone(),
                label: model.label.clone(),
                group: model.group.clone(),
                is_default: model.is_default,
            })
            .collect(),
        message: catalog.message.clone(),
        source: match catalog.source {
            CatalogSource::Cache => TerminalAgentModelCatalogSource::Cache,
            CatalogSource::Live => TerminalAgentModelCatalogSource::Live,
        },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum FollowupPolicy {
    #[default]
    Queue,
    Steer,
}

pub fn parse_followup_policy(value: Option<&str>) -> FollowupPolicy {
    match value.map(str::trim).unwrap_or_default() {
        "steer" => FollowupPolicy::Steer,
        _ => FollowupPolicy::Queue,
    }
}

pub fn builtin_catalog_specs() -> Vec<AgentCatalogSpec> {
    let Ok(agents) = serde_json::from_str::<Vec<serde_json::Value>>(
        crate::service::automation::terminal_agent_manifest::BUILTIN_TERMINAL_AGENTS_JSON,
    ) else {
        return Vec::new();
    };
    agents
        .into_iter()
        .filter_map(|value| {
            let id = value.get("id")?.as_str()?.to_string();
            let model_list = value.get("modelList");
            let cli_command = model_list
                .and_then(|list| list.get("command"))
                .and_then(|command| command.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let parser = match model_list
                .and_then(|list| list.get("parser"))
                .and_then(|parser| parser.as_str())
            {
                Some("grok_line_list") => CatalogParserKind::GrokLineList,
                Some("kiro_json") => CatalogParserKind::KiroJson,
                Some("json") => CatalogParserKind::Json,
                _ => CatalogParserKind::LineList,
            };
            let thinking = thinking_from_builtin(&value);
            Some(AgentCatalogSpec {
                agent_id: id,
                strategies: if cli_command.is_empty() {
                    vec![CatalogStrategyKind::Config, CatalogStrategyKind::Acp]
                } else {
                    vec![
                        CatalogStrategyKind::Config,
                        CatalogStrategyKind::Cli,
                        CatalogStrategyKind::Acp,
                    ]
                },
                cli_command,
                parser,
                thinking,
                static_models: Vec::new(),
                acp: true,
            })
        })
        .collect()
}
