use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use agent::{
    apply_native_chat_options_plan, canonicalize_chat_provider_id, is_native_chat_options_id,
    options_cache_dir, thinking_from_builtin, AgentOptionsSnapshot, OptionsCache,
    OptionsParserKind, OptionsProbe, OptionsProbeStrategy, OptionsSource, OptionsStatus, ProbePlan,
};
use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::service::agent::AgentService;

pub const PREFETCH_POLL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, serde::Serialize)]
pub struct OptionsUpdated {
    pub agent_id: String,
    pub options: AgentOptionsSnapshot,
}

pub struct OptionsPrefetchWorker {
    started: AtomicBool,
    cache: OptionsCache,
    probe: Arc<OptionsProbe>,
    plans: Mutex<Vec<ProbePlan>>,
    events: broadcast::Sender<OptionsUpdated>,
    poll: Duration,
    web_clients: AtomicUsize,
    probe_count: AtomicUsize,
    agent_service: Option<Arc<AgentService>>,
}

impl OptionsPrefetchWorker {
    pub fn new(agent_data_root: PathBuf, probe: OptionsProbe, poll: Duration) -> Self {
        Self::with_plans(agent_data_root, probe, poll, Vec::new())
    }

    pub fn with_plans(
        agent_data_root: PathBuf,
        probe: OptionsProbe,
        poll: Duration,
        plans: Vec<ProbePlan>,
    ) -> Self {
        let cache = OptionsCache::new(options_cache_dir(&agent_data_root));
        let (events, _) = broadcast::channel(64);
        Self {
            started: AtomicBool::new(false),
            cache,
            probe: Arc::new(probe),
            plans: Mutex::new(plans),
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

    pub fn subscribe(&self) -> broadcast::Receiver<OptionsUpdated> {
        self.events.subscribe()
    }

    pub fn is_started(&self) -> bool {
        self.started.load(Ordering::SeqCst)
    }

    pub fn probe_count(&self) -> usize {
        self.probe_count.load(Ordering::SeqCst)
    }

    pub async fn set_plans(&self, plans: Vec<ProbePlan>) {
        *self.plans.lock().await = plans;
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
        let mut specs = self.plans.lock().await.clone();
        if let Some(service) = &self.agent_service {
            let mut installed = std::collections::HashSet::new();
            for agent in service.list_agents() {
                if agent.installed {
                    for id in options_equivalent_ids(&agent.registry_id) {
                        installed.insert(id);
                    }
                }
            }
            if let Ok(custom) = service.list_custom_agents() {
                for agent in custom {
                    if !agent.enabled {
                        continue;
                    }
                    if !specs.iter().any(|spec| spec.agent_id == agent.name) {
                        specs.push(ProbePlan {
                            agent_id: agent.name.clone(),
                            acp: true,
                            strategies: vec![OptionsProbeStrategy::Acp],
                            ..Default::default()
                        });
                    }
                    installed.insert(agent.name);
                }
            }
            if let Ok(natives) = service.list_native_chat_agents() {
                for agent in natives {
                    if !agent.enabled {
                        continue;
                    }
                    installed.insert(agent.id);
                }
            }
            if installed.is_empty() {
                for spec in &mut specs {
                    spec.acp = false;
                }
            } else {
                specs.retain(|spec| {
                    options_equivalent_ids(&spec.agent_id)
                        .iter()
                        .any(|id| installed.contains(id))
                });
            }
        }
        let now = Utc::now();
        let permit = Arc::new(tokio::sync::Semaphore::new(2));
        let mut joins = Vec::new();
        for spec in specs {
            if options_equivalent_ids(&spec.agent_id)
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

    async fn probe_one(&self, spec: ProbePlan) {
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let catalog = self.probe.probe(&spec).await;
        self.store_options(&catalog);
    }

    fn store_options(&self, catalog: &AgentOptionsSnapshot) {
        for id in options_equivalent_ids(&catalog.agent_id) {
            let mut clone = catalog.clone();
            clone.agent_id = id.clone();
            if let Err(error) = self.cache.put(&clone) {
                warn!("failed to cache options for {id}: {error}");
            }
            let _ = self.events.send(OptionsUpdated {
                agent_id: id,
                options: clone,
            });
        }
    }

    fn lookup_options(&self, agent_id: &str) -> Option<AgentOptionsSnapshot> {
        self.lookup_usable(agent_id)
            .and_then(|(catalog, fresh)| fresh.then_some(catalog))
    }

    /// Prefer a fresh cache entry; fall back to a displayable stale snapshot.
    fn lookup_usable(&self, agent_id: &str) -> Option<(AgentOptionsSnapshot, bool)> {
        let now = Utc::now();
        for id in options_equivalent_ids(agent_id) {
            if let Some((mut catalog, fresh)) = self.cache.get_usable(&id, now) {
                catalog.agent_id = agent_id.to_string();
                return Some((catalog, fresh));
            }
        }
        None
    }

    pub fn request_probe(self: &Arc<Self>, spec: ProbePlan) {
        let worker = Arc::clone(self);
        tokio::spawn(async move {
            worker.probe_one(spec).await;
        });
    }

    pub async fn get(&self, spec: &ProbePlan, refresh: bool) -> AgentOptionsSnapshot {
        if !refresh {
            if let Some(cached) = self.lookup_options(&spec.agent_id) {
                return cached;
            }
        }
        self.probe_count.fetch_add(1, Ordering::SeqCst);
        let mut catalog = self.probe.probe(spec).await;
        catalog.source = OptionsSource::Live;
        self.store_options(&catalog);
        catalog
    }

    /// Serve cache immediately (including stale). Revalidate in the background
    /// when missing, expired, or `refresh` is set. Only return `probing` when
    /// there is nothing displayable yet.
    pub fn get_cached_or_probing(
        self: &Arc<Self>,
        spec: &ProbePlan,
        refresh: bool,
    ) -> AgentOptionsSnapshot {
        let cached = self.lookup_usable(&spec.agent_id);
        let needs_probe = refresh || cached.as_ref().is_none_or(|(_, fresh)| !fresh);
        if needs_probe {
            self.request_probe(spec.clone());
        }
        if let Some((catalog, _)) = cached {
            return catalog;
        }
        AgentOptionsSnapshot::probing(&spec.agent_id)
    }

    pub fn cache_get(&self, agent_id: &str) -> Option<AgentOptionsSnapshot> {
        self.lookup_usable(agent_id).map(|(catalog, _)| catalog)
    }

    #[cfg(test)]
    pub fn put_options_for_test(&self, catalog: &AgentOptionsSnapshot) {
        self.store_options(catalog);
    }
}

pub fn terminal_options_from(catalog: &AgentOptionsSnapshot) -> crate::TerminalAgentOptions {
    use crate::{
        TerminalAgentOption, TerminalAgentOptions, TerminalAgentOptionsSource,
        TerminalAgentOptionsStatus,
    };
    TerminalAgentOptions {
        agent_id: catalog.agent_id.clone(),
        status: match catalog.status {
            OptionsStatus::Ok => TerminalAgentOptionsStatus::Ok,
            OptionsStatus::AuthRequired => TerminalAgentOptionsStatus::AuthRequired,
            OptionsStatus::Unsupported => TerminalAgentOptionsStatus::Unsupported,
            OptionsStatus::Probing => TerminalAgentOptionsStatus::Probing,
            OptionsStatus::Error => TerminalAgentOptionsStatus::Error,
        },
        models: catalog
            .models
            .iter()
            .map(|model| TerminalAgentOption {
                id: model.id.clone(),
                label: model.label.clone(),
                group: model.group.clone(),
                is_default: model.is_default,
                thinking: model.thinking.clone(),
            })
            .collect(),
        message: catalog.message.clone(),
        source: match catalog.source {
            OptionsSource::Cache => TerminalAgentOptionsSource::Cache,
            OptionsSource::Live => TerminalAgentOptionsSource::Live,
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

pub fn builtin_options_probe_plans() -> Vec<ProbePlan> {
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
                Some("grok_line_list") => OptionsParserKind::GrokLineList,
                Some("kiro_json") => OptionsParserKind::KiroJson,
                Some("json") => OptionsParserKind::Json,
                Some("droid_help") => OptionsParserKind::DroidHelp,
                _ => OptionsParserKind::LineList,
            };
            let thinking = thinking_from_builtin(&value);
            let mut spec = ProbePlan {
                agent_id: id.clone(),
                strategies: if cli_command.is_empty() {
                    vec![OptionsProbeStrategy::Config, OptionsProbeStrategy::Acp]
                } else {
                    vec![
                        OptionsProbeStrategy::Config,
                        OptionsProbeStrategy::Cli,
                        OptionsProbeStrategy::Acp,
                    ]
                },
                cli_command,
                parser,
                thinking,
                static_models: Vec::new(),
                acp: catalog_agent_has_acp(&id),
            };
            apply_native_chat_options_plan(&mut spec);
            Some(spec)
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

fn options_equivalent_ids(agent_id: &str) -> Vec<String> {
    if is_native_chat_options_id(agent_id) {
        let folded = canonicalize_chat_provider_id(agent_id);
        let mut ids = vec![agent_id.to_string(), folded.to_string()];
        if folded == "claude" {
            ids.extend(
                ["claude-code", "claude_code"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        ids.sort();
        ids.dedup();
        return ids;
    }
    let terminal = catalog_terminal_id(agent_id);
    let mut ids = vec![agent_id.to_string()];
    if !is_native_chat_options_id(terminal) {
        ids.push(terminal.to_string());
    }
    for (registry, builtin) in [
        ("antigravity-acp", "antigravity"),
        ("kilo", "kilocode"),
        ("factory-droid", "droid"),
        ("amp-acp", "amp"),
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
/// built-in terminal agent. Chat natives skip generic ACP `session/new`.
/// ACP registry ids (`claude-acp`, `codex-acp`, `grok-build`) stay ACP.
pub fn options_probe_plan_for(agent_id: &str) -> ProbePlan {
    let folded = canonicalize_chat_provider_id(agent_id);
    let lookup = if is_native_chat_options_id(agent_id) {
        match folded {
            // Terminal builtin id. Chat native host id stays `grok`.
            "grok" => "grok-build",
            other => other,
        }
    } else {
        catalog_terminal_id(agent_id)
    };
    let mut spec = builtin_options_probe_plans()
        .into_iter()
        .find(|spec| {
            spec.agent_id == lookup
                || spec.agent_id == agent_id
                || canonicalize_chat_provider_id(&spec.agent_id) == folded
        })
        .unwrap_or(ProbePlan {
            agent_id: agent_id.to_string(),
            acp: true,
            strategies: vec![OptionsProbeStrategy::Acp],
            ..Default::default()
        });
    spec.agent_id = agent_id.to_string();
    if is_native_chat_options_id(agent_id) {
        apply_native_chat_options_plan(&mut spec);
    } else if catalog_agent_has_acp(agent_id) {
        spec.acp = true;
        spec.strategies
            .retain(|kind| *kind != OptionsProbeStrategy::Native);
        if spec.strategies.is_empty() {
            spec.strategies.push(OptionsProbeStrategy::Config);
        }
        if !spec.strategies.contains(&OptionsProbeStrategy::Acp) {
            spec.strategies.push(OptionsProbeStrategy::Acp);
        }
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent::OptionsParserKind;

    #[test]
    fn opencode_uses_models_cli_and_native() {
        let spec = options_probe_plan_for("opencode");
        assert_eq!(spec.cli_command, ["opencode", "models"]);
        assert_eq!(spec.parser, OptionsParserKind::LineList);
        assert!(!spec.acp);
        assert!(spec.strategies.contains(&OptionsProbeStrategy::Cli));
        assert!(spec.strategies.contains(&OptionsProbeStrategy::Native));
        assert!(!spec.strategies.contains(&OptionsProbeStrategy::Acp));
    }

    #[test]
    fn kilo_registry_id_reuses_kilocode_cli() {
        let spec = options_probe_plan_for("kilo");
        assert_eq!(spec.agent_id, "kilo");
        assert_eq!(spec.cli_command, ["kilo", "models"]);
        assert!(spec.acp);
    }

    #[test]
    fn factory_droid_parses_cli_help_for_per_model_thinking() {
        let spec = options_probe_plan_for("factory-droid");
        assert_eq!(spec.cli_command, ["droid", "exec", "--help"]);
        assert_eq!(spec.parser, OptionsParserKind::DroidHelp);
        assert!(spec.strategies.contains(&OptionsProbeStrategy::Cli));
        assert!(spec.acp);
        let terminal = options_probe_plan_for("droid");
        assert_eq!(terminal.cli_command, spec.cli_command);
        assert_eq!(terminal.parser, OptionsParserKind::DroidHelp);
    }

    #[test]
    fn claude_acp_alias_is_acp_probe_not_native() {
        let claude = options_probe_plan_for("claude-acp");
        assert_eq!(claude.agent_id, "claude-acp");
        assert!(claude.acp);
        assert!(!claude.strategies.contains(&OptionsProbeStrategy::Native));
        assert!(claude.strategies.contains(&OptionsProbeStrategy::Acp));
        let hermes = options_probe_plan_for("hermes");
        assert!(hermes.acp);
        assert!(hermes.cli_command.is_empty());
        assert!(hermes.strategies.contains(&OptionsProbeStrategy::Acp));
    }

    #[test]
    fn app069_s5_native_grok_skips_acp_registry_grok_stays_acp() {
        let grok = options_probe_plan_for("grok");
        assert!(!grok.acp);
        assert!(grok.strategies.contains(&OptionsProbeStrategy::Native));
        assert!(!grok.strategies.contains(&OptionsProbeStrategy::Acp));
        assert_eq!(grok.cli_command, ["grok", "models"]);
        assert_eq!(grok.parser, OptionsParserKind::GrokLineList);
        for id in ["grok-build", "grok-acp"] {
            let spec = options_probe_plan_for(id);
            assert!(spec.acp, "{id}");
            assert!(spec.strategies.contains(&OptionsProbeStrategy::Acp), "{id}");
            assert!(
                !spec.strategies.contains(&OptionsProbeStrategy::Native),
                "{id}"
            );
        }
        let gemini = options_probe_plan_for("gemini");
        assert!(gemini.acp);
        assert!(gemini.strategies.contains(&OptionsProbeStrategy::Acp));
        assert!(!gemini.strategies.contains(&OptionsProbeStrategy::Native));
    }

    #[test]
    fn commandcode_stays_cli_only() {
        let spec = options_probe_plan_for("commandcode");
        assert_eq!(spec.cli_command, ["cmd", "--list-models"]);
        assert!(!spec.acp);
    }

    #[test]
    fn kimi_and_codex_use_documented_cli_lists() {
        let kimi = options_probe_plan_for("kimi");
        assert_eq!(kimi.cli_command, ["kimi", "provider", "list", "--json"]);
        assert_eq!(kimi.parser, OptionsParserKind::Json);
        assert!(kimi.acp);
        let codex = options_probe_plan_for("codex");
        assert_eq!(codex.cli_command, ["codex", "debug", "models"]);
        assert_eq!(codex.parser, OptionsParserKind::Json);
        assert!(!codex.acp);
        assert!(codex.strategies.contains(&OptionsProbeStrategy::Native));
        assert!(!codex.strategies.contains(&OptionsProbeStrategy::Acp));
        let pi = options_probe_plan_for("pi-acp");
        assert!(pi.acp);
        assert!(!pi.strategies.contains(&OptionsProbeStrategy::Native));
        assert!(pi.strategies.contains(&OptionsProbeStrategy::Acp));
        for id in ["claude", "codex", "opencode", "pi", "grok"] {
            let spec = options_probe_plan_for(id);
            assert!(!spec.acp, "{id} must not ACP-probe");
            assert!(
                spec.strategies.contains(&OptionsProbeStrategy::Native),
                "{id}"
            );
            assert!(
                !spec.strategies.contains(&OptionsProbeStrategy::Acp),
                "{id}"
            );
        }
    }
}
