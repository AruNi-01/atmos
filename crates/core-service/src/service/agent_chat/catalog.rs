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
                    for id in catalog_equivalent_ids(&agent.registry_id) {
                        installed.insert(id);
                    }
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
                specs.retain(|spec| {
                    catalog_equivalent_ids(&spec.agent_id)
                        .iter()
                        .any(|id| installed.contains(id))
                });
            }
        }
        let now = Utc::now();
        let permit = Arc::new(tokio::sync::Semaphore::new(2));
        let mut joins = Vec::new();
        for spec in specs {
            if catalog_equivalent_ids(&spec.agent_id)
                .iter()
                .any(|id| self.cache.should_skip_probe(id, now))
            {
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
        self.store_catalog(&catalog);
    }

    fn store_catalog(&self, catalog: &AgentModelCatalog) {
        for id in catalog_equivalent_ids(&catalog.agent_id) {
            let mut clone = catalog.clone();
            clone.agent_id = id.clone();
            if let Err(error) = self.cache.put(&clone) {
                warn!("failed to cache catalog for {id}: {error}");
            }
            let _ = self.events.send(CatalogUpdated {
                agent_id: id,
                catalog: clone,
            });
        }
    }

    fn lookup_catalog(&self, agent_id: &str) -> Option<AgentModelCatalog> {
        let now = Utc::now();
        for id in catalog_equivalent_ids(agent_id) {
            if let Some(mut catalog) = self.cache.get(&id, now) {
                catalog.agent_id = agent_id.to_string();
                return Some(catalog);
            }
        }
        None
    }

    pub fn request_probe(self: &Arc<Self>, spec: AgentCatalogSpec) {
        let worker = Arc::clone(self);
        tokio::spawn(async move {
            worker.probe_one(spec).await;
        });
    }

    pub async fn get(&self, spec: &AgentCatalogSpec, refresh: bool) -> AgentModelCatalog {
        if !refresh {
            if let Some(cached) = self.lookup_catalog(&spec.agent_id) {
                return cached;
            }
        }
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let mut catalog = self.engine.probe(spec).await;
        catalog.source = CatalogSource::Live;
        self.store_catalog(&catalog);
        catalog
    }

    pub fn get_cached_or_probing(
        self: &Arc<Self>,
        spec: &AgentCatalogSpec,
        refresh: bool,
    ) -> AgentModelCatalog {
        if !refresh {
            if let Some(cached) = self.lookup_catalog(&spec.agent_id) {
                return cached;
            }
        }
        self.request_probe(spec.clone());
        AgentModelCatalog::probing(&spec.agent_id)
    }

    pub fn cache_get(&self, agent_id: &str) -> Option<AgentModelCatalog> {
        self.lookup_catalog(agent_id)
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
            CatalogStatus::Probing => TerminalAgentModelCatalogStatus::Probing,
            CatalogStatus::Error => TerminalAgentModelCatalogStatus::Error,
        },
        models: catalog
            .models
            .iter()
            .map(|model| TerminalAgentModelOption {
                id: model.id.clone(),
                label: model.label.clone(),
                group: model.group.clone(),
                is_default: model.is_default,
                thinking: model.thinking.clone(),
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
                Some("droid_help") => CatalogParserKind::DroidHelp,
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
                acp: catalog_agent_has_acp(&id),
            })
        })
        .collect()
}

/// Registry ACP ids that differ from the built-in terminal agent id.
fn catalog_terminal_id(agent_id: &str) -> &str {
    match agent_id {
        "claude-acp" => "claude",
        "codex-acp" => "codex",
        "antigravity-acp" => "antigravity",
        "kilo" => "kilocode",
        "factory-droid" => "droid",
        "amp-acp" => "amp",
        "pi-acp" => "pi",
        other => other,
    }
}

fn catalog_agent_has_acp(agent_id: &str) -> bool {
    matches!(
        catalog_terminal_id(agent_id),
        "claude"
            | "codex"
            | "gemini"
            | "antigravity"
            | "cursor"
            | "opencode"
            | "kimi"
            | "kilocode"
            | "grok-build"
            | "droid"
            | "devin"
            | "amp"
            | "pi"
            | "kiro"
            | "openclaw"
            | "hermes"
            | "copilot"
    )
}

fn catalog_equivalent_ids(agent_id: &str) -> Vec<String> {
    let terminal = catalog_terminal_id(agent_id);
    let mut ids = vec![agent_id.to_string(), terminal.to_string()];
    for (registry, builtin) in [
        ("claude-acp", "claude"),
        ("codex-acp", "codex"),
        ("antigravity-acp", "antigravity"),
        ("kilo", "kilocode"),
        ("factory-droid", "droid"),
        ("amp-acp", "amp"),
        ("pi-acp", "pi"),
    ] {
        if builtin == terminal {
            ids.push(registry.to_string());
        }
    }
    ids.sort();
    ids.dedup();
    ids
}

/// Catalog spec for a chat/registry agent id. CLI commands come from the
/// built-in terminal agent; ACP is enabled for every agent that speaks ACP.
pub fn catalog_spec_for(agent_id: &str) -> AgentCatalogSpec {
    let lookup = catalog_terminal_id(agent_id);
    let mut spec = builtin_catalog_specs()
        .into_iter()
        .find(|spec| spec.agent_id == lookup || spec.agent_id == agent_id)
        .unwrap_or(AgentCatalogSpec {
            agent_id: agent_id.to_string(),
            acp: true,
            strategies: vec![CatalogStrategyKind::Acp],
            ..Default::default()
        });
    spec.agent_id = agent_id.to_string();
    if catalog_agent_has_acp(agent_id) {
        spec.acp = true;
        if !spec.strategies.contains(&CatalogStrategyKind::Acp) {
            spec.strategies.push(CatalogStrategyKind::Acp);
        }
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent::CatalogParserKind;

    #[test]
    fn opencode_uses_models_cli_and_acp() {
        let spec = catalog_spec_for("opencode");
        assert_eq!(spec.cli_command, ["opencode", "models"]);
        assert_eq!(spec.parser, CatalogParserKind::LineList);
        assert!(spec.acp);
        assert!(spec.strategies.contains(&CatalogStrategyKind::Cli));
        assert!(spec.strategies.contains(&CatalogStrategyKind::Acp));
    }

    #[test]
    fn kilo_registry_id_reuses_kilocode_cli() {
        let spec = catalog_spec_for("kilo");
        assert_eq!(spec.agent_id, "kilo");
        assert_eq!(spec.cli_command, ["kilo", "models"]);
        assert!(spec.acp);
    }

    #[test]
    fn factory_droid_parses_cli_help_for_per_model_thinking() {
        let spec = catalog_spec_for("factory-droid");
        assert_eq!(spec.cli_command, ["droid", "exec", "--help"]);
        assert_eq!(spec.parser, CatalogParserKind::DroidHelp);
        assert!(spec.strategies.contains(&CatalogStrategyKind::Cli));
        assert!(spec.acp);
        let terminal = catalog_spec_for("droid");
        assert_eq!(terminal.cli_command, spec.cli_command);
        assert_eq!(terminal.parser, CatalogParserKind::DroidHelp);
    }

    #[test]
    fn claude_and_hermes_probe_via_acp() {
        let claude = catalog_spec_for("claude-acp");
        assert_eq!(claude.agent_id, "claude-acp");
        assert!(claude.acp);
        assert!(claude.strategies.contains(&CatalogStrategyKind::Acp));
        let hermes = catalog_spec_for("hermes");
        assert!(hermes.acp);
        assert!(hermes.cli_command.is_empty());
    }

    #[test]
    fn commandcode_stays_cli_only() {
        let spec = catalog_spec_for("commandcode");
        assert_eq!(spec.cli_command, ["cmd", "--list-models"]);
        assert!(!spec.acp);
    }

    #[test]
    fn kimi_and_codex_use_documented_cli_lists() {
        let kimi = catalog_spec_for("kimi");
        assert_eq!(kimi.cli_command, ["kimi", "provider", "list", "--json"]);
        assert_eq!(kimi.parser, CatalogParserKind::Json);
        assert!(kimi.acp);
        let codex = catalog_spec_for("codex");
        assert_eq!(codex.cli_command, ["codex", "debug", "models"]);
        assert_eq!(codex.parser, CatalogParserKind::Json);
        assert!(codex.acp);
    }
}
