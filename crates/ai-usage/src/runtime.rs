use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crate::config::{
    provider_config_api_key, provider_config_region, provider_config_source_label,
    provider_manual_setup,
};
use crate::constants::PROVIDER_TIMEOUT_MILLIS;
use crate::models::{
    AuthState, AuthStateStatus, DetailRow, DetailSection, FetchState, FetchStateStatus,
    ProviderError, ProviderKind, ProviderStatus, RowTone, SubscriptionSummary, UsageSummary,
};
use crate::providers::{amp, antigravity, claude, codex, cursor, factory, minimax, opencode, zai};
use crate::support::{
    expand_home, load_amp_browser_cookie_source, load_factory_browser_cookie_source,
    load_minimax_browser_cookie_source, unix_now,
};

#[derive(Debug, Clone)]
pub struct ProviderDescriptor {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LiveFetchResult {
    pub(crate) plan_label: Option<String>,
    pub(crate) usage_summary: Option<UsageSummary>,
    pub(crate) detail_sections: Vec<DetailSection>,
    pub(crate) warnings: Vec<String>,
    pub(crate) fetch_message: String,
    pub(crate) reset_at: Option<u64>,
    pub(crate) credits_label: Option<String>,
    pub(crate) last_updated_at: Option<u64>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum LiveProviderKind {
    Codex,
    Claude,
    Cursor,
    OpenCode,
    Factory,
    Amp,
    Antigravity,
    Zai,
    MiniMax,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum FetchStrategyKind {
    Snapshot,
    Api,
    LocalApi,
    AuthProbe,
}

impl FetchStrategyKind {
    fn label(self) -> &'static str {
        match self {
            Self::Snapshot => "Snapshot",
            Self::Api => "API",
            Self::LocalApi => "Local API",
            Self::AuthProbe => "Auth probe",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct FetchAttempt {
    pub(crate) kind: FetchStrategyKind,
    pub(crate) success: bool,
    pub(crate) detail: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ProviderSpec {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) kind: ProviderKind,
    pub(crate) live_kind: Option<LiveProviderKind>,
    pub(crate) timeout_millis: u64,
    pub(crate) setup_hint: &'static str,
    pub(crate) auth_env_keys: &'static [&'static str],
    pub(crate) auth_paths: &'static [&'static str],
}

#[async_trait]
pub trait UsageProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;
    fn timeout(&self) -> Duration;
    async fn collect(&self) -> Result<ProviderStatus, ProviderError>;
}

#[derive(Clone)]
struct ManagedProvider {
    spec: ProviderSpec,
    client: Client,
}

#[async_trait]
impl UsageProvider for ManagedProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: self.spec.id.to_string(),
            label: self.spec.label.to_string(),
        }
    }

    fn timeout(&self) -> Duration {
        Duration::from_millis(self.spec.timeout_millis)
    }

    async fn collect(&self) -> Result<ProviderStatus, ProviderError> {
        let auth = detect_auth(&self.spec);
        let mut attempts = Vec::new();

        if let Some((snapshot, source)) = load_snapshot(&self.spec, &mut attempts)? {
            return Ok(snapshot_status(
                &self.spec, auth, snapshot, source, attempts,
            ));
        }

        if let Some(kind) = self.spec.live_kind {
            match collect_live(kind, &self.client).await {
                Ok(result) => return Ok(live_status(&self.spec, auth, result, attempts)),
                Err(error) => {
                    attempts.push(FetchAttempt {
                        kind: FetchStrategyKind::Api,
                        success: false,
                        detail: error.to_string(),
                    });
                    if auth.status == AuthStateStatus::Detected {
                        return Ok(unavailable_status(
                            &self.spec,
                            auth,
                            error.to_string(),
                            attempts,
                        ));
                    }
                }
            }
        }

        Ok(missing_status(&self.spec, auth, attempts))
    }
}

pub(crate) fn default_providers() -> Vec<Arc<dyn UsageProvider>> {
    provider_specs()
        .into_iter()
        .map(|spec| {
            let client = Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new());
            Arc::new(ManagedProvider { spec, client }) as Arc<dyn UsageProvider>
        })
        .collect()
}

pub(crate) fn error_status(descriptor: &ProviderDescriptor, message: String) -> ProviderStatus {
    ProviderStatus {
        id: descriptor.id.clone(),
        label: descriptor.label.clone(),
        kind: ProviderKind::Api,
        enabled: false,
        switch_enabled: true,
        healthy: false,
        last_updated_at: Some(unix_now()),
        subscription_summary: None,
        usage_summary: None,
        detail_sections: vec![],
        warnings: vec![],
        auth_state: AuthState {
            status: AuthStateStatus::Missing,
            source: None,
            detail: None,
            setup_hint: None,
        },
        fetch_state: FetchState {
            status: FetchStateStatus::Error,
            message: Some(message),
        },
        manual_setup: provider_manual_setup(&descriptor.id),
    }
}

pub(crate) fn detect_auth(spec: &ProviderSpec) -> AuthState {
    if provider_config_api_key(spec.id).is_some() {
        return AuthState {
            status: AuthStateStatus::Detected,
            source: provider_config_source_label(),
            detail: Some("Detected stored API key".to_string()),
            setup_hint: Some(spec.setup_hint.to_string()),
        };
    }

    for env_key in spec.auth_env_keys {
        if env::var(env_key)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some()
        {
            return AuthState {
                status: AuthStateStatus::Detected,
                source: Some(format!("env:{env_key}")),
                detail: Some("Detected local auth source".to_string()),
                setup_hint: Some(spec.setup_hint.to_string()),
            };
        }
    }

    for raw_path in spec.auth_paths {
        if let Some(path) = expand_home(raw_path).filter(|path| path.exists()) {
            return AuthState {
                status: AuthStateStatus::Detected,
                source: Some(path.display().to_string()),
                detail: Some("Detected local auth source".to_string()),
                setup_hint: Some(spec.setup_hint.to_string()),
            };
        }
    }

    if spec.id == "amp" {
        if let Ok(Some(source)) = load_amp_browser_cookie_source() {
            return AuthState {
                status: AuthStateStatus::Detected,
                source: Some(source.source_label),
                detail: Some("Detected browser session cookie".to_string()),
                setup_hint: Some(spec.setup_hint.to_string()),
            };
        }
    }

    if spec.id == "factory" {
        if let Ok(tokens) = factory::storage::load_factory_local_storage_tokens() {
            if let Some(token) = tokens.first() {
                return AuthState {
                    status: AuthStateStatus::Detected,
                    source: Some(token.source_label.clone()),
                    detail: Some("Detected browser local storage token".to_string()),
                    setup_hint: Some(spec.setup_hint.to_string()),
                };
            }
        }

        if let Ok(Some(source)) = load_factory_browser_cookie_source() {
            return AuthState {
                status: AuthStateStatus::Detected,
                source: Some(source.source_label),
                detail: Some("Detected browser session cookie".to_string()),
                setup_hint: Some(spec.setup_hint.to_string()),
            };
        }
    }

    if spec.id == "minimax" {
        if let Ok(Some(source)) = load_minimax_browser_cookie_source() {
            return AuthState {
                status: AuthStateStatus::Detected,
                source: Some(source.source_label),
                detail: Some("Detected browser session cookie".to_string()),
                setup_hint: Some(spec.setup_hint.to_string()),
            };
        }
    }

    AuthState {
        status: AuthStateStatus::Missing,
        source: None,
        detail: provider_config_region(spec.id).map(|region| format!("Preferred region: {region}")),
        setup_hint: Some(spec.setup_hint.to_string()),
    }
}

pub(crate) fn load_snapshot(
    spec: &ProviderSpec,
    attempts: &mut Vec<FetchAttempt>,
) -> Result<Option<(ProviderStatus, String)>, ProviderError> {
    if let Some(raw) = env::var(format!("ATMOS_USAGE_{}_SNAPSHOT", spec.id.to_uppercase()))
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        let snapshot = parse_snapshot(spec, &raw)?;
        attempts.push(FetchAttempt {
            kind: FetchStrategyKind::Snapshot,
            success: true,
            detail: "Loaded from env snapshot".to_string(),
        });
        return Ok(Some((snapshot, "env snapshot".to_string())));
    }

    if let Some(path) = snapshot_candidates(spec.id)
        .into_iter()
        .find(|path| path.exists())
    {
        let contents = fs::read_to_string(&path)
            .map_err(|error| ProviderError::SnapshotIo(format!("{}: {error}", path.display())))?;
        let snapshot = parse_snapshot(spec, &contents)?;
        attempts.push(FetchAttempt {
            kind: FetchStrategyKind::Snapshot,
            success: true,
            detail: format!("Loaded {}", path.display()),
        });
        return Ok(Some((snapshot, path.display().to_string())));
    }

    attempts.push(FetchAttempt {
        kind: FetchStrategyKind::Snapshot,
        success: false,
        detail: "No local snapshot found".to_string(),
    });
    Ok(None)
}

pub(crate) fn snapshot_status(
    spec: &ProviderSpec,
    auth: AuthState,
    mut snapshot: ProviderStatus,
    source: String,
    mut attempts: Vec<FetchAttempt>,
) -> ProviderStatus {
    attempts.push(FetchAttempt {
        kind: FetchStrategyKind::Snapshot,
        success: true,
        detail: source.clone(),
    });
    snapshot.id = spec.id.to_string();
    snapshot.label = spec.label.to_string();
    snapshot.kind = spec.kind.clone();
    snapshot.switch_enabled = true;
    snapshot.auth_state = auth;
    snapshot
        .detail_sections
        .push(fetch_pipeline_section(&attempts));
    snapshot.manual_setup = provider_manual_setup(spec.id);
    snapshot
}

pub(crate) fn missing_status(
    spec: &ProviderSpec,
    auth: AuthState,
    attempts: Vec<FetchAttempt>,
) -> ProviderStatus {
    ProviderStatus {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        kind: spec.kind.clone(),
        enabled: false,
        switch_enabled: true,
        healthy: false,
        last_updated_at: Some(unix_now()),
        subscription_summary: None,
        usage_summary: None,
        detail_sections: vec![
            DetailSection {
                title: "Setup".to_string(),
                rows: vec![DetailRow {
                    label: "Detection".to_string(),
                    value: auth
                        .setup_hint
                        .clone()
                        .unwrap_or_else(|| "Local auth is required".to_string()),
                    tone: RowTone::Muted,
                }],
            },
            fetch_pipeline_section(&attempts),
        ],
        warnings: vec![],
        auth_state: auth,
        fetch_state: FetchState {
            status: FetchStateStatus::Unavailable,
            message: Some("Local auth not detected".to_string()),
        },
        manual_setup: provider_manual_setup(spec.id),
    }
}

pub(crate) fn fetch_pipeline_section(attempts: &[FetchAttempt]) -> DetailSection {
    DetailSection {
        title: "Fetch pipeline".to_string(),
        rows: attempts
            .iter()
            .map(|attempt| DetailRow {
                label: attempt.kind.label().to_string(),
                value: attempt.detail.clone(),
                tone: if attempt.success {
                    RowTone::Success
                } else {
                    RowTone::Muted
                },
            })
            .collect(),
    }
}

fn live_status(
    spec: &ProviderSpec,
    auth: AuthState,
    result: LiveFetchResult,
    mut attempts: Vec<FetchAttempt>,
) -> ProviderStatus {
    attempts.push(FetchAttempt {
        kind: FetchStrategyKind::Api,
        success: true,
        detail: result.fetch_message.clone(),
    });
    let mut detail_sections = result.detail_sections;
    detail_sections.push(fetch_pipeline_section(&attempts));

    ProviderStatus {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        kind: spec.kind.clone(),
        enabled: true,
        switch_enabled: true,
        healthy: true,
        last_updated_at: result.last_updated_at.or(Some(unix_now())),
        subscription_summary: Some(SubscriptionSummary {
            plan_label: result.plan_label,
            window_label: None,
            credits_label: result.credits_label,
            billing_state: Some("active".to_string()),
            reset_at: result.reset_at,
        }),
        usage_summary: result.usage_summary,
        detail_sections,
        warnings: result.warnings,
        auth_state: auth,
        fetch_state: FetchState {
            status: FetchStateStatus::Ready,
            message: Some(result.fetch_message),
        },
        manual_setup: provider_manual_setup(spec.id),
    }
}

fn unavailable_status(
    spec: &ProviderSpec,
    auth: AuthState,
    message: String,
    attempts: Vec<FetchAttempt>,
) -> ProviderStatus {
    ProviderStatus {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        kind: spec.kind.clone(),
        enabled: auth.status == AuthStateStatus::Detected,
        switch_enabled: true,
        healthy: false,
        last_updated_at: Some(unix_now()),
        subscription_summary: None,
        usage_summary: None,
        detail_sections: vec![fetch_pipeline_section(&attempts)],
        warnings: vec![message.clone()],
        auth_state: auth,
        fetch_state: FetchState {
            status: FetchStateStatus::Unavailable,
            message: Some(message),
        },
        manual_setup: provider_manual_setup(spec.id),
    }
}

fn parse_snapshot(spec: &ProviderSpec, raw: &str) -> Result<ProviderStatus, ProviderError> {
    let value = serde_json::from_str::<Value>(raw)
        .map_err(|error| ProviderError::InvalidSnapshot(error.to_string()))?;
    let mut status = serde_json::from_value::<ProviderStatus>(value)
        .map_err(|error| ProviderError::InvalidSnapshot(error.to_string()))?;
    status.id = spec.id.to_string();
    status.label = spec.label.to_string();
    status.kind = spec.kind.clone();
    Ok(status)
}

fn snapshot_candidates(provider_id: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var("ATMOS_USAGE_SNAPSHOT_DIR")
        .ok()
        .and_then(|value| expand_home(&value))
    {
        candidates.push(path.join(format!("{provider_id}.json")));
    }
    if let Some(home) = dirs::home_dir() {
        candidates.push(
            home.join(".atmos")
                .join("ai-usage")
                .join(format!("{provider_id}.json")),
        );
        candidates.push(
            home.join(".config")
                .join("atmos")
                .join("ai-usage")
                .join(format!("{provider_id}.json")),
        );
    }
    candidates
}

fn provider_specs() -> Vec<ProviderSpec> {
    vec![
        ProviderSpec {
            id: "claude",
            label: "Claude",
            kind: ProviderKind::Cli,
            live_kind: Some(LiveProviderKind::Claude),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to Claude Code locally, or set CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY.",
            auth_env_keys: &["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
            auth_paths: &["~/.claude/.credentials.json"],
        },
        ProviderSpec {
            id: "codex",
            label: "Codex",
            kind: ProviderKind::Cli,
            live_kind: Some(LiveProviderKind::Codex),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Run codex login, or make OPENAI_API_KEY / ~/.codex/auth.json available.",
            auth_env_keys: &["OPENAI_API_KEY"],
            auth_paths: &["~/.codex/auth.json", "~/.config/codex/auth.json"],
        },
        ProviderSpec {
            id: "cursor",
            label: "Cursor",
            kind: ProviderKind::Desktop,
            live_kind: Some(LiveProviderKind::Cursor),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to Cursor desktop or run agent login. Atmos reads state.vscdb and keychain automatically; CURSOR_ACCESS_TOKEN / CURSOR_REFRESH_TOKEN are only fallbacks.",
            auth_env_keys: &[
                "CURSOR_ACCESS_TOKEN",
                "ATMOS_USAGE_CURSOR_ACCESS_TOKEN",
                "CURSOR_REFRESH_TOKEN",
                "ATMOS_USAGE_CURSOR_REFRESH_TOKEN",
            ],
            auth_paths: &[
                "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
                "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb.backup",
            ],
        },
        ProviderSpec {
            id: "opencode",
            label: "OpenCode",
            kind: ProviderKind::Api,
            live_kind: Some(LiveProviderKind::OpenCode),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to opencode.ai, or add OPENCODE_COOKIE_HEADER / ~/.atmos/ai-usage/opencode.cookie.",
            auth_env_keys: &[
                "OPENCODE_COOKIE_HEADER",
                "ATMOS_USAGE_OPENCODE_COOKIE_HEADER",
                "OPENCODE_AUTH_COOKIE",
            ],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "factory",
            label: "Factory Droid",
            kind: ProviderKind::Hybrid,
            live_kind: Some(LiveProviderKind::Factory),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to app.factory.ai. Atmos auto-imports supported browser session cookies; FACTORY_COOKIE_HEADER / FACTORY_REFRESH_TOKEN are fallbacks.",
            auth_env_keys: &[
                "FACTORY_COOKIE_HEADER",
                "ATMOS_USAGE_FACTORY_COOKIE_HEADER",
                "FACTORY_REFRESH_TOKEN",
                "FACTORY_BEARER_TOKEN",
            ],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "gemini",
            label: "Gemini",
            kind: ProviderKind::Cli,
            live_kind: None,
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to Gemini CLI locally, or set GEMINI_API_KEY.",
            auth_env_keys: &["GEMINI_API_KEY"],
            auth_paths: &["~/.gemini/settings.json"],
        },
        ProviderSpec {
            id: "antigravity",
            label: "Antigravity",
            kind: ProviderKind::Desktop,
            live_kind: Some(LiveProviderKind::Antigravity),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Launch Antigravity so its local language server is running.",
            auth_env_keys: &[],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "zai",
            label: "Zhipu AI",
            kind: ProviderKind::Api,
            live_kind: Some(LiveProviderKind::Zai),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Set Z_AI_API_KEY, ZHIPU_API_KEY, or ZAI_API_KEY. Atmos auto-probes Global and China Zhipu quota endpoints.",
            auth_env_keys: &["Z_AI_API_KEY", "ZHIPU_API_KEY", "ZAI_API_KEY"],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "minimax",
            label: "MiniMax",
            kind: ProviderKind::Api,
            live_kind: Some(LiveProviderKind::MiniMax),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Set MINIMAX_API_KEY. Atmos auto-probes Global and China MiniMax coding-plan endpoints.",
            auth_env_keys: &["MINIMAX_API_KEY"],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "kimi",
            label: "Kimi",
            kind: ProviderKind::Api,
            live_kind: None,
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to kimi.com, or set KIMI_API_KEY / add a local snapshot.",
            auth_env_keys: &["KIMI_API_KEY"],
            auth_paths: &[],
        },
        ProviderSpec {
            id: "amp",
            label: "Amp",
            kind: ProviderKind::Desktop,
            live_kind: Some(LiveProviderKind::Amp),
            timeout_millis: PROVIDER_TIMEOUT_MILLIS,
            setup_hint: "Sign in to Amp locally. Atmos reads ~/.local/share/amp/secrets.json automatically and falls back to browser session import; AMP_COOKIE_HEADER / ~/.atmos/ai-usage/amp.cookie is only a fallback.",
            auth_env_keys: &["AMP_COOKIE_HEADER", "ATMOS_USAGE_AMP_COOKIE_HEADER"],
            auth_paths: &["~/.local/share/amp/secrets.json"],
        },
    ]
}

async fn collect_live(
    kind: LiveProviderKind,
    client: &Client,
) -> Result<LiveFetchResult, ProviderError> {
    match kind {
        LiveProviderKind::Codex => codex::fetch_codex_live(client).await,
        LiveProviderKind::Claude => claude::fetch_claude_live(client).await,
        LiveProviderKind::Cursor => cursor::fetch_cursor_live(client).await,
        LiveProviderKind::OpenCode => opencode::fetch_opencode_live(client).await,
        LiveProviderKind::Factory => factory::fetch_factory_live(client).await,
        LiveProviderKind::Amp => amp::fetch_amp_live(client, None).await,
        LiveProviderKind::Antigravity => antigravity::fetch_antigravity_live().await,
        LiveProviderKind::Zai => zai::fetch_zai_live(client).await,
        LiveProviderKind::MiniMax => minimax::fetch_minimax_live(client).await,
    }
}
