use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use remote_access::{
    build_provider, CreateSessionRequest, GatewayHandle, GatewayRuntime, GatewayRuntimeConfig,
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderStartRequest, ProviderStatus,
    RemoteAccessStatus, SessionMode, SessionPermission, SessionStore,
    TunnelSession,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Fixed local gateway port shared by all providers.
const GATEWAY_PORT: u16 = 30313;
const GATEWAY_URL: &str = "http://127.0.0.1:30313";

// ---------------------------------------------------------------------------
// Per-provider active state
// ---------------------------------------------------------------------------

struct ActiveProvider {
    provider: Arc<dyn remote_access::TunnelProvider>,
    session_id: String,
    public_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

struct RemoteAccessRuntimeState {
    /// Single shared gateway — started when first provider starts, stopped
    /// when last provider stops.
    gateway: Option<GatewayHandle>,
    session_store: SessionStore,
    /// Active tunnel per provider kind.
    active: HashMap<ProviderKind, ActiveProvider>,
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedState {
    #[serde(default)]
    providers: HashMap<String, PersistedProviderState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedProviderState {
    mode: ProviderAccessMode,
    ttl_secs: i64,
    last_started_at: String,
    session: TunnelSession,
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct RemoteAccessManager {
    inner: Arc<RwLock<RemoteAccessRuntimeState>>,
    state_file: PathBuf,
}

impl RemoteAccessManager {
    pub fn new(state_file: PathBuf) -> Self {
        Self {
            inner: Arc::new(RwLock::new(RemoteAccessRuntimeState {
                gateway: None,
                session_store: SessionStore::default(),
                active: HashMap::new(),
            })),
            state_file,
        }
    }

    pub async fn detect_all(&self) -> Vec<ProviderDiagnostics> {
        let ts = build_provider(ProviderKind::Tailscale);
        let cf = build_provider(ProviderKind::Cloudflare);
        let ng = build_provider(ProviderKind::Ngrok);

        let (ts_diag, cf_diag, ng_diag) = tokio::join!(ts.detect(), cf.detect(), ng.detect());

        vec![ts_diag, cf_diag, ng_diag]
    }

    /// Start a tunnel for the given provider. Each provider can only run once;
    /// multiple providers can run simultaneously sharing one gateway.
    pub async fn start(
        &self,
        provider_kind: ProviderKind,
        mode: ProviderAccessMode,
        target_base_url: String,
        ttl_secs: i64,
        credential: Option<String>,
        on_gateway_error: impl Fn(String) + Send + 'static,
    ) -> Result<RemoteAccessStatus, String> {
        Self::debug_log(format!("[manager] start: provider={provider_kind:?}"));

        let provider = build_provider(provider_kind);
        let session_store = {
            let mut state = self.inner.write().await;
            if state.active.contains_key(&provider_kind) {
                return Err(format!("{provider_kind:?} tunnel is already running"));
            }

            // Start the shared gateway if not yet running.
            if state.gateway.is_none() {
                Self::debug_log("[manager] start: starting shared gateway".to_string());
                let bind_addr: SocketAddr = format!("127.0.0.1:{GATEWAY_PORT}")
                    .parse()
                    .map_err(|e: std::net::AddrParseError| e.to_string())?;
                let gateway = GatewayRuntime::start(GatewayRuntimeConfig {
                    bind_addr,
                    target_base_url: target_base_url.clone(),
                    session_store: state.session_store.clone(),
                })
                .await
                .map_err(|e| e.to_string())?;
                Self::debug_log(format!("[manager] start: gateway up at {}", gateway.local_url));

                let mut gateway_error_rx = gateway.error_rx.clone();
                tokio::spawn(async move {
                    if gateway_error_rx.changed().await.is_ok() {
                        if let Some(err) = gateway_error_rx.borrow().clone() {
                            on_gateway_error(err);
                        }
                    }
                });

                state.gateway = Some(gateway);
            }

            state.session_store.clone()
        };

        let session_mode = if mode == ProviderAccessMode::Public {
            SessionMode::Public
        } else {
            SessionMode::Private
        };

        let session = session_store
            .create_session(CreateSessionRequest {
                provider: provider_kind,
                mode: session_mode,
                permission: SessionPermission::Control,
                ttl_secs,
            })
            .await;

        Self::debug_log(format!("[manager] start: calling provider.start for {provider_kind:?}"));
        let status = match provider
            .start(ProviderStartRequest {
                target_url: GATEWAY_URL.to_string(),
                mode,
                credential,
            })
            .await
        {
            Ok(s) => s,
            Err(err) => {
                Self::debug_log(format!("[manager] start: provider err={err}"));
                let _ = session_store.revoke_session(&session.session_id).await;
                // If this was the only provider, shut down the gateway.
                let mut state = self.inner.write().await;
                if state.active.is_empty() {
                    if let Some(gw) = state.gateway.take() {
                        gw.shutdown().await;
                    }
                }
                return Err(err.to_string());
            }
        };

        let public_url = status.public_url.clone();
        let mut session = session;
        if let Some(url) = public_url.clone() {
            session_store
                .set_public_url(&session.session_id, url.clone())
                .await;
            session.public_url = Some(url.clone());
        }

        {
            let mut state = self.inner.write().await;
            state.active.insert(
                provider_kind,
                ActiveProvider {
                    provider: Arc::clone(&provider),
                    session_id: session.session_id.clone(),
                    public_url: public_url.clone(),
                },
            );
        }

        if let Err(err) = self
            .persist_provider(
                provider_kind,
                PersistedProviderState {
                    mode,
                    ttl_secs,
                    last_started_at: Utc::now().to_rfc3339(),
                    session: session.clone(),
                },
            )
            .await
        {
            // Persist failed — roll back the active entry so the user can retry.
            let mut state = self.inner.write().await;
            state.active.remove(&provider_kind);
            if state.active.is_empty() {
                if let Some(gw) = state.gateway.take() {
                    gw.shutdown().await;
                }
            }
            return Err(err);
        }

        Ok(Self::build_status(provider_kind, status, Some(session)))
    }

    /// Stop the tunnel for a specific provider.
    pub async fn stop(&self, provider_kind: ProviderKind) -> Result<(), String> {
        let (provider, session_id, session_store) = {
            let mut state = self.inner.write().await;
            match state.active.remove(&provider_kind) {
                Some(ap) => (ap.provider, ap.session_id, state.session_store.clone()),
                None => return Err(format!("{provider_kind:?} is not running")),
            }
        };

        let mut errors = Vec::new();

        if let Err(err) = provider.stop().await {
            errors.push(format!("provider stop failed: {err}"));
        }

        if let Err(err) = session_store.revoke_session(&session_id).await {
            errors.push(format!("session revoke failed: {err}"));
        }

        // Shut down gateway if no more active providers.
        {
            let mut state = self.inner.write().await;
            if state.active.is_empty() {
                if let Some(gw) = state.gateway.take() {
                    gw.shutdown().await;
                }
            }
        }

        if let Err(err) = self.remove_persisted_provider(provider_kind).await {
            errors.push(err);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    /// Return status for every active provider, keyed by provider kind string.
    pub async fn status_all(&self) -> HashMap<String, RemoteAccessStatus> {
        let (active_snapshot, session_store) = {
            let state = self.inner.read().await;
            let snap: Vec<(ProviderKind, Arc<dyn remote_access::TunnelProvider>, String)> = state
                .active
                .iter()
                .map(|(k, v)| (*k, Arc::clone(&v.provider), v.session_id.clone()))
                .collect();
            (snap, state.session_store.clone())
        };

        let mut map = HashMap::new();
        for (kind, provider, session_id) in active_snapshot {
            let provider_status = provider.status().await;
            let session = session_store.get_session(&session_id).await;
            let status = Self::build_status(kind, provider_status, session);
            map.insert(format!("{kind:?}").to_lowercase(), status);
        }
        map
    }

    pub async fn persisted_provider_kinds(&self) -> Vec<ProviderKind> {
        self.load_state().await
            .providers
            .keys()
            .filter_map(|k| provider_kind_from_str(k))
            .collect()
    }

    /// Recover persisted providers, forwarding the gateway to `target_base_url`.
    /// Called at startup with the actual sidecar URL once it's ready.
    pub async fn recover_with_target(
        &self,
        credentials: HashMap<ProviderKind, Option<String>>,
        target_base_url: String,
    ) -> Result<HashMap<String, RemoteAccessStatus>, String> {
        self.recover_impl(credentials, target_base_url).await
    }

    /// Recover persisted providers using the default sidecar URL.
    /// Called from the Tauri command (frontend-initiated recovery).
    pub async fn recover(
        &self,
        credentials: HashMap<ProviderKind, Option<String>>,
    ) -> Result<HashMap<String, RemoteAccessStatus>, String> {
        self.recover_impl(credentials, "http://127.0.0.1:30303".to_string()).await
    }

    async fn recover_impl(
        &self,
        credentials: HashMap<ProviderKind, Option<String>>,
        target_base_url: String,
    ) -> Result<HashMap<String, RemoteAccessStatus>, String> {
        let persisted = self.load_state().await;
        if persisted.providers.is_empty() {
            return Ok(HashMap::new());
        }

        let now = Utc::now();
        let mut results = HashMap::new();

        for (key, pstate) in &persisted.providers {
            let Some(provider_kind) = provider_kind_from_str(key) else { continue };
            if pstate.session.is_revoked() || pstate.session.is_expired(now) {
                let _ = self.remove_persisted_provider(provider_kind).await;
                continue;
            }

            {
                let state = self.inner.read().await;
                if state.active.contains_key(&provider_kind) {
                    drop(state);
                    let map = self.status_all().await;
                    if let Some(s) = map.get(key) {
                        results.insert(key.clone(), s.clone());
                    }
                    continue;
                }
            }

            let provider = build_provider(provider_kind);
            let session_store = {
                let mut state = self.inner.write().await;

                if state.gateway.is_none() {
                    let bind_addr: SocketAddr = format!("127.0.0.1:{GATEWAY_PORT}")
                        .parse()
                        .map_err(|e: std::net::AddrParseError| e.to_string())?;
                    let gateway = GatewayRuntime::start(GatewayRuntimeConfig {
                        bind_addr,
                        target_base_url: target_base_url.clone(),
                        session_store: state.session_store.clone(),
                    })
                    .await
                    .map_err(|e| e.to_string())?;
                    state.gateway = Some(gateway);
                }

                state.session_store.clone()
            };

            session_store.restore_session(pstate.session.clone()).await;

            let credential = credentials.get(&provider_kind).and_then(|c| c.clone());
            let status = provider
                .recover(ProviderStartRequest {
                    target_url: GATEWAY_URL.to_string(),
                    mode: pstate.mode,
                    credential,
                })
                .await;

            match status {
                Ok(provider_status) => {
                    let public_url = provider_status.public_url.clone();
                    let mut session = pstate.session.clone();
                    if let Some(url) = public_url.clone() {
                        session_store.set_public_url(&session.session_id, url.clone()).await;
                        session.public_url = Some(url.clone());
                    }

                    let result = Self::build_status(provider_kind, provider_status, Some(session.clone()));

                    {
                        let mut state = self.inner.write().await;
                        state.active.insert(
                            provider_kind,
                            ActiveProvider {
                                provider: Arc::clone(&provider),
                                session_id: session.session_id.clone(),
                                public_url,
                            },
                        );
                    }

                    let _ = self.persist_provider(
                        provider_kind,
                        PersistedProviderState {
                            mode: pstate.mode,
                            ttl_secs: pstate.ttl_secs,
                            last_started_at: Utc::now().to_rfc3339(),
                            session,
                        },
                    ).await;

                    results.insert(key.clone(), result);
                }
                Err(err) => {
                    Self::debug_log(format!("[manager] recover: {provider_kind:?} failed: {err}"));
                    let _ = self.remove_persisted_provider(provider_kind).await;
                    let mut state = self.inner.write().await;
                    if state.active.is_empty() {
                        if let Some(gw) = state.gateway.take() {
                            gw.shutdown().await;
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    /// Renew (extend) the session for an already-running provider without
    /// restarting the tunnel process.
    pub async fn renew(
        &self,
        provider_kind: ProviderKind,
        ttl_secs: i64,
        reuse_token: bool,
    ) -> Result<RemoteAccessStatus, String> {
        let (session_id, session_store, provider) = {
            let state = self.inner.read().await;
            match state.active.get(&provider_kind) {
                Some(ap) => (
                    ap.session_id.clone(),
                    state.session_store.clone(),
                    Arc::clone(&ap.provider),
                ),
                None => return Err(format!("{provider_kind:?} is not running")),
            }
        };

        let new_session = session_store
            .renew_session(&session_id, ttl_secs, reuse_token)
            .await
            .map_err(|e| e.to_string())?;

        // Update public_url in session store in case provider_status has one.
        if let Some(url) = new_session.public_url.clone() {
            session_store.set_public_url(&new_session.session_id, url).await;
        }

        // Persist updated session.
        let persisted = self.load_state().await;
        if let Some(pstate) = persisted.providers.get(&provider_kind_key(provider_kind)) {
            let _ = self.persist_provider(
                provider_kind,
                PersistedProviderState {
                    session: new_session.clone(),
                    last_started_at: Utc::now().to_rfc3339(),
                    ..pstate.clone()
                },
            ).await;
        }

        let provider_status = provider.status().await;
        Ok(Self::build_status(provider_kind, provider_status, Some(new_session)))
    }

    pub fn provider_guide(provider: ProviderKind) -> Vec<String> {
        match provider {
            ProviderKind::Tailscale => vec![
                "Confirm Tailscale is logged in: tailscale status".to_string(),
                "Use Serve for private (tailnet-only) access; use Funnel for public internet access".to_string(),
            ],
            ProviderKind::Cloudflare => vec![
                "Install cloudflared and ensure it is on your PATH".to_string(),
                "Quick Tunnels are temporary links, suitable for short-term sharing".to_string(),
            ],
            ProviderKind::Ngrok => vec![
                "Set NGROK_AUTHTOKEN or save your token in the desktop app first".to_string(),
                "Uses the ngrok Rust SDK to establish a forwarder directly".to_string(),
            ],
        }
    }

    // -------------------------------------------------------------------------
    // Persistence helpers
    // -------------------------------------------------------------------------

    /// Load persisted state. Never fails: missing file → empty state, unreadable
    /// or corrupt file → log + delete + empty state. This ensures that a bad
    /// state file can never surface as a user-visible "Failed to start tunnel".
    async fn load_state(&self) -> PersistedState {
        let raw = match tokio::fs::read(&self.state_file).await {
            Ok(raw) => raw,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return PersistedState::default(),
            Err(err) => {
                Self::debug_log(format!(
                    "[manager] state file unreadable ({err}), ignoring: {}",
                    self.state_file.display()
                ));
                return PersistedState::default();
            }
        };

        match serde_json::from_slice::<PersistedState>(&raw) {
            Ok(state) => state,
            Err(err) => {
                Self::debug_log(format!(
                    "[manager] state file corrupt ({err}), removing: {}",
                    self.state_file.display()
                ));
                let _ = tokio::fs::remove_file(&self.state_file).await;
                PersistedState::default()
            }
        }
    }

    async fn save_state(&self, state: &PersistedState) -> Result<(), String> {
        if let Some(parent) = self.state_file.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        let raw = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
        tokio::fs::write(&self.state_file, raw).await.map_err(|e| e.to_string())
    }

    async fn persist_provider(&self, provider: ProviderKind, pstate: PersistedProviderState) -> Result<(), String> {
        let mut full = self.load_state().await;
        full.providers.insert(provider_kind_key(provider), pstate);
        self.save_state(&full).await
    }

    async fn remove_persisted_provider(&self, provider: ProviderKind) -> Result<(), String> {
        let mut full = self.load_state().await;
        full.providers.remove(&provider_kind_key(provider));
        if full.providers.is_empty() {
            let _ = tokio::fs::remove_file(&self.state_file).await;
            return Ok(());
        }
        self.save_state(&full).await
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    fn build_status(
        provider: ProviderKind,
        provider_status: ProviderStatus,
        session: Option<TunnelSession>,
    ) -> RemoteAccessStatus {
        let gateway_url = Some(GATEWAY_URL.to_string());
        let public_url = provider_status.public_url.clone().or_else(|| {
            session.as_ref().and_then(|s| s.public_url.clone())
        });
        let share_url = session.as_ref().and_then(|s| {
            public_url.as_ref().map(|u| Self::share_url(u, &s.entry_token))
        });
        let entry_token = session.as_ref().map(|s| s.entry_token.clone());
        let expires_at = session.as_ref().map(|s| s.expires_at);

        RemoteAccessStatus {
            gateway_url,
            public_url,
            share_url,
            provider: Some(provider),
            provider_status,
            entry_token,
            expires_at,
        }
    }

    fn share_url(public_url: &str, entry_token: &str) -> String {
        let sep = if public_url.contains('?') { '&' } else { '?' };
        format!("{public_url}{sep}entry_token={entry_token}")
    }

    fn debug_log(msg: impl AsRef<str>) {
        use std::io::Write as _;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let line = format!("[{ts}] [DEBUG] {}\n", msg.as_ref());
        #[cfg(target_os = "macos")]
        let log_dir = dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("Library")
            .join("Logs")
            .join(if cfg!(debug_assertions) { "com.atmos.desktop.dev" } else { "com.atmos.desktop" });
        #[cfg(not(target_os = "macos"))]
        let log_dir = dirs::data_local_dir()
            .or_else(|| dirs::home_dir())
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("atmos")
            .join("logs");
        let path = log_dir.join("desktop.log");
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(line.as_bytes());
        }
    }
}

fn provider_kind_key(kind: ProviderKind) -> String {
    format!("{kind:?}").to_lowercase()
}

fn provider_kind_from_str(s: &str) -> Option<ProviderKind> {
    match s {
        "tailscale" => Some(ProviderKind::Tailscale),
        "cloudflare" => Some(ProviderKind::Cloudflare),
        "ngrok" => Some(ProviderKind::Ngrok),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_kind_round_trip() {
        for kind in [ProviderKind::Tailscale, ProviderKind::Cloudflare, ProviderKind::Ngrok] {
            let key = provider_kind_key(kind);
            assert_eq!(provider_kind_from_str(&key), Some(kind));
        }
    }
}
