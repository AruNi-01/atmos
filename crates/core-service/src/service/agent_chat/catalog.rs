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

use crate::service::agent::AgentService;

pub const PREFETCH_POLL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, serde::Serialize)]
pub struct CatalogUpdated {
    pub agent_id: String,
    pub catalog: AgentModelCatalog,
}

pub struct CatalogPrefetchWorker {
    started: AtomicBool,
    cache: CatalogCache,
    engine: Arc<CatalogEngine>,
    specs: Mutex<Vec<AgentCatalogSpec>>,
    events: broadcast::Sender<CatalogUpdated>,
    poll: Duration,
    web_clients: AtomicUsize,
    probe_count: AtomicUsize,
    agent_service: Option<Arc<AgentService>>,
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
            engine: Arc::new(engine),
            specs: Mutex::new(specs),
            events,
            poll,
            web_clients: AtomicUsize::new(0),
            probe_count: AtomicUsize::new(0),
            agent_service: None,
        }
    }

    pub fn attach_agent_service(mut self, service: Arc<AgentService>) -> Self {
        self.agent_service = Some(service);
        self
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
            Arc::clone(&self).probe_enabled().await;
            tokio::time::sleep(self.poll).await;
            if self.web_clients.load(Ordering::SeqCst) == 0 {
                self.started.store(false, Ordering::SeqCst);
                break;
            }
        }
    }

    async fn probe_enabled(self: Arc<Self>) {
        let mut specs = self.specs.lock().await.clone();
        if let Some(service) = &self.agent_service {
            let mut installed = std::collections::HashSet::new();
            for agent in service.list_agents() {
                if agent.installed {
                    installed.insert(agent.registry_id);
                }
            }
            if let Ok(custom) = service.list_custom_agents() {
                for agent in custom {
                    if !specs.iter().any(|spec| spec.agent_id == agent.name) {
                        specs.push(AgentCatalogSpec {
                            agent_id: agent.name.clone(),
                            acp: true,
                            strategies: vec![CatalogStrategyKind::Acp],
                            ..Default::default()
                        });
                    }
                    installed.insert(agent.name);
                }
            }
            if installed.is_empty() {
                for spec in &mut specs {
                    spec.acp = false;
                }
            } else {
                specs.retain(|spec| installed.contains(&spec.agent_id));
            }
        }
        let now = Utc::now();
        let permit = Arc::new(tokio::sync::Semaphore::new(2));
        let mut joins = Vec::new();
        for spec in specs {
            if self.cache.should_skip_probe(&spec.agent_id, now) {
                continue;
            }
            let Ok(owned) = permit.clone().acquire_owned().await else {
                continue;
            };
            let worker = Arc::clone(&self);
            joins.push(tokio::spawn(async move {
                let _permit = owned;
                worker.probe_one(spec).await;
            }));
        }
        for join in joins {
            let _ = join.await;
        }
    }

    async fn probe_one(&self, spec: AgentCatalogSpec) {
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let catalog = self.engine.probe(&spec).await;
        if let Err(error) = self.cache.put(&catalog) {
            warn!("failed to cache catalog for {}: {error}", spec.agent_id);
        }
        let _ = self.events.send(CatalogUpdated {
            agent_id: spec.agent_id,
            catalog,
        });
    }

    pub fn request_probe(self: &Arc<Self>, spec: AgentCatalogSpec) {
        let worker = Arc::clone(self);
        tokio::spawn(async move {
            worker.probe_one(spec).await;
        });
    }

    pub async fn get(&self, spec: &AgentCatalogSpec, refresh: bool) -> AgentModelCatalog {
        let now = Utc::now();
        if !refresh {
            if let Some(cached) = self.cache.get(&spec.agent_id, now) {
                return cached;
            }
        }
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let mut catalog = self.engine.probe(spec).await;
        catalog.source = CatalogSource::Live;
        let _ = self.cache.put(&catalog);
        catalog
    }

    pub fn get_cached_or_probing(
        self: &Arc<Self>,
        spec: &AgentCatalogSpec,
        refresh: bool,
    ) -> AgentModelCatalog {
        if !refresh {
            if let Some(cached) = self.cache.get(&spec.agent_id, Utc::now()) {
                return cached;
            }
        }
        self.request_probe(spec.clone());
        AgentModelCatalog::probing(&spec.agent_id)
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
                agent_id: id.clone(),
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
                acp: matches!(
                    id.as_str(),
                    "claude" | "gemini" | "codex" | "copilot" | "cursor" | "kiro" | "amp"
                ),
            })
        })
        .collect()
}
