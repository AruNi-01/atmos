use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use remote_access::{
    build_provider, CreateSessionRequest, GatewayHandle, GatewayRuntime, GatewayRuntimeConfig,
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderStartRequest, ProviderStatus,
    ProviderStatusState, RemoteAccessStatus, SessionMode, SessionPermission, SessionStore,
    TunnelSession,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct RemoteAccessManager {
    inner: Arc<RwLock<RemoteAccessRuntimeState>>,
    state_file: PathBuf,
}

struct RemoteAccessRuntimeState {
    provider: Option<Arc<dyn remote_access::TunnelProvider>>,
    provider_kind: Option<ProviderKind>,
    gateway: Option<GatewayHandle>,
    session_store: SessionStore,
    active_session_id: Option<String>,
    public_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedRemoteAccessState {
    provider: ProviderKind,
    mode: ProviderAccessMode,
    target_base_url: String,
    ttl_secs: i64,
    last_started_at: String,
    session: TunnelSession,
}

impl RemoteAccessManager {
    pub fn new(state_file: PathBuf) -> Self {
        Self {
            inner: Arc::new(RwLock::new(RemoteAccessRuntimeState {
                provider: None,
                provider_kind: None,
                gateway: None,
                session_store: SessionStore::default(),
                active_session_id: None,
                public_url: None,
            })),
            state_file,
        }
    }

    pub async fn detect_all(&self) -> Vec<ProviderDiagnostics> {
        let providers = [
            ProviderKind::Tailscale,
            ProviderKind::Cloudflare,
            ProviderKind::Ngrok,
        ];
        let mut diagnostics = Vec::with_capacity(providers.len());

        for kind in providers {
            let provider = build_provider(kind);
            diagnostics.push(provider.detect().await);
        }

        diagnostics
    }

    pub async fn start(
        &self,
        provider_kind: ProviderKind,
        mode: ProviderAccessMode,
        target_base_url: String,
        ttl_secs: i64,
        credential: Option<String>,
    ) -> Result<RemoteAccessStatus, String> {
        let provider = build_provider(provider_kind);
        let session_store = {
            let mut state = self.inner.write().await;
            if state.gateway.is_some() {
                return Err("remote access already running".to_string());
            }
            state.provider = Some(Arc::clone(&provider));
            state.provider_kind = Some(provider_kind);
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

        let gateway = GatewayRuntime::start(GatewayRuntimeConfig {
            bind_addr: "127.0.0.1:0"
                .parse::<SocketAddr>()
                .map_err(|e| e.to_string())?,
            target_base_url: target_base_url.clone(),
            session_store: session_store.clone(),
        })
        .await
        .map_err(|e| e.to_string())?;
        let gateway_url = gateway.local_url.clone();

        let status = provider
            .start(ProviderStartRequest {
                target_url: gateway_url.clone(),
                mode,
                credential,
            })
            .await;
        let status = match status {
            Ok(status) => status,
            Err(err) => {
                gateway.shutdown().await;
                let mut state = self.inner.write().await;
                state.provider = None;
                state.provider_kind = None;
                return Err(err.to_string());
            }
        };

        let public_url = status.public_url.clone();
        let mut session = session;
        if let Some(url) = public_url.clone() {
            session_store
                .set_public_url(&session.session_id, url.clone())
                .await;
            session.public_url = Some(url);
        }

        {
            let mut state = self.inner.write().await;
            state.active_session_id = Some(session.session_id.clone());
            state.public_url = public_url;
            state.gateway = Some(gateway);
        }

        self.persist_started_state(PersistedRemoteAccessState {
            provider: provider_kind,
            mode,
            target_base_url,
            ttl_secs,
            last_started_at: Utc::now().to_rfc3339(),
            session: session.clone(),
        })
        .await?;

        Ok(Self::build_status(
            Some(provider_kind),
            Some(gateway_url),
            status,
            Some(session),
        ))
    }

    pub async fn recover(
        &self,
        credential: Option<String>,
    ) -> Result<Option<RemoteAccessStatus>, String> {
        let persisted = self.load_state().await?;
        let Some(persisted) = persisted else {
            return Ok(None);
        };
        let now = Utc::now();
        if persisted.session.is_revoked() || persisted.session.is_expired(now) {
            self.remove_state_file().await?;
            return Ok(None);
        }

        {
            let state = self.inner.read().await;
            if state.gateway.is_some() {
                drop(state);
                return Ok(Some(self.status().await));
            }
        }

        let provider = build_provider(persisted.provider);
        let session_store = {
            let mut state = self.inner.write().await;
            state.provider = Some(Arc::clone(&provider));
            state.provider_kind = Some(persisted.provider);
            state.session_store.clone()
        };
        session_store
            .restore_session(persisted.session.clone())
            .await;

        let gateway = GatewayRuntime::start(GatewayRuntimeConfig {
            bind_addr: "127.0.0.1:0"
                .parse::<SocketAddr>()
                .map_err(|e| e.to_string())?,
            target_base_url: persisted.target_base_url.clone(),
            session_store: session_store.clone(),
        })
        .await
        .map_err(|e| e.to_string())?;
        let gateway_url = gateway.local_url.clone();

        let status = provider
            .recover(ProviderStartRequest {
                target_url: gateway_url.clone(),
                mode: persisted.mode,
                credential,
            })
            .await;
        let status = match status {
            Ok(status) => status,
            Err(err) => {
                gateway.shutdown().await;
                let mut state = self.inner.write().await;
                state.provider = None;
                state.provider_kind = None;
                return Err(err.to_string());
            }
        };

        let public_url = status.public_url.clone();
        let mut session = persisted.session;
        if let Some(url) = public_url.clone() {
            session_store
                .set_public_url(&session.session_id, url.clone())
                .await;
            session.public_url = Some(url);
        }

        {
            let mut state = self.inner.write().await;
            state.gateway = Some(gateway);
            state.active_session_id = Some(session.session_id.clone());
            state.public_url = public_url;
        }

        self.persist_started_state(PersistedRemoteAccessState {
            provider: persisted.provider,
            mode: persisted.mode,
            target_base_url: persisted.target_base_url,
            ttl_secs: persisted.ttl_secs,
            last_started_at: Utc::now().to_rfc3339(),
            session: session.clone(),
        })
        .await?;

        Ok(Some(Self::build_status(
            Some(persisted.provider),
            Some(gateway_url),
            status,
            Some(session),
        )))
    }

    pub async fn stop(&self) -> Result<(), String> {
        let (provider, gateway, active_session_id, session_store) = {
            let mut state = self.inner.write().await;
            (
                state.provider.take(),
                state.gateway.take(),
                state.active_session_id.take(),
                state.session_store.clone(),
            )
        };

        let mut errors = Vec::new();

        if let Some(provider) = provider {
            if let Err(err) = provider.stop().await {
                errors.push(format!("failed to stop provider: {err}"));
            }
        }

        if let Some(session_id) = active_session_id {
            if let Err(err) = session_store.revoke_session(&session_id).await {
                errors.push(format!("failed to revoke remote access session: {err}"));
            }
        }

        if let Some(gateway) = gateway {
            gateway.shutdown().await;
        }

        let mut state = self.inner.write().await;
        state.provider_kind = None;
        state.public_url = None;

        if let Err(err) = self.remove_state_file().await {
            errors.push(err);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    pub async fn status(&self) -> RemoteAccessStatus {
        let (provider, provider_kind, gateway_url, active_session_id, session_store) = {
            let state = self.inner.read().await;
            (
                state.provider.clone(),
                state.provider_kind,
                state
                    .gateway
                    .as_ref()
                    .map(|gateway| gateway.local_url.clone()),
                state.active_session_id.clone(),
                state.session_store.clone(),
            )
        };

        let provider_status = if let Some(provider) = provider {
            provider.status().await
        } else {
            Self::idle_status()
        };

        let session = match active_session_id.as_deref() {
            Some(session_id) => session_store.get_session(session_id).await,
            None => None,
        };

        Self::build_status(provider_kind, gateway_url, provider_status, session)
    }

    pub async fn persisted_provider_kind(&self) -> Result<Option<ProviderKind>, String> {
        Ok(self.load_state().await?.map(|persisted| persisted.provider))
    }

    pub fn provider_guide(provider: ProviderKind) -> Vec<String> {
        match provider {
            ProviderKind::Tailscale => vec![
                "确认 tailscale 已登录：tailscale status".to_string(),
                "私有访问使用 serve；公网访问使用 funnel".to_string(),
            ],
            ProviderKind::Cloudflare => vec![
                "安装 cloudflared 二进制并保证 PATH 可见".to_string(),
                "Quick Tunnel 为临时链接，适合短期分享".to_string(),
            ],
            ProviderKind::Ngrok => vec![
                "先配置 NGROK_AUTHTOKEN 或在桌面端保存 token".to_string(),
                "当前实现使用 ngrok Rust SDK 直接建立 forwarder".to_string(),
            ],
        }
    }

    async fn persist_state(&self, persisted: PersistedRemoteAccessState) -> Result<(), String> {
        if let Some(parent) = self.state_file.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|err| {
                format!(
                    "failed to create remote access state directory {}: {err}",
                    parent.display()
                )
            })?;
        }
        let raw = serde_json::to_vec_pretty(&persisted).map_err(|err| {
            format!(
                "failed to serialize remote access state {}: {err}",
                self.state_file.display()
            )
        })?;
        tokio::fs::write(&self.state_file, raw)
            .await
            .map_err(|err| {
                format!(
                    "failed to write remote access state {}: {err}",
                    self.state_file.display()
                )
            })
    }

    async fn persist_started_state(
        &self,
        persisted: PersistedRemoteAccessState,
    ) -> Result<(), String> {
        if let Err(err) = self.persist_state(persisted).await {
            let cleanup_err = self.stop().await.err();
            return Err(match cleanup_err {
                Some(cleanup_err) => format!("{err}; cleanup failed: {cleanup_err}"),
                None => err,
            });
        }

        Ok(())
    }

    async fn load_state(&self) -> Result<Option<PersistedRemoteAccessState>, String> {
        let raw = match tokio::fs::read(&self.state_file).await {
            Ok(raw) => raw,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(err) => return Err(err.to_string()),
        };

        let persisted = serde_json::from_slice::<PersistedRemoteAccessState>(&raw)
            .map_err(|err| err.to_string())?;
        Ok(Some(persisted))
    }

    fn build_status(
        provider: Option<ProviderKind>,
        gateway_url: Option<String>,
        provider_status: ProviderStatus,
        session: Option<TunnelSession>,
    ) -> RemoteAccessStatus {
        let public_url = provider_status.public_url.clone().or_else(|| {
            session
                .as_ref()
                .and_then(|session| session.public_url.clone())
        });
        let share_url = session.as_ref().and_then(|session| {
            public_url
                .as_ref()
                .map(|public_url| Self::share_url(public_url, &session.entry_token))
        });
        let active_session_id = session.as_ref().map(|session| session.session_id.clone());
        let expires_at = session.as_ref().map(|session| session.expires_at);

        RemoteAccessStatus {
            gateway_url,
            public_url,
            share_url,
            provider,
            provider_status,
            active_session_id,
            expires_at,
        }
    }

    fn share_url(public_url: &str, entry_token: &str) -> String {
        let separator = if public_url.contains('?') { '&' } else { '?' };
        format!("{public_url}{separator}entry_token={entry_token}")
    }

    fn idle_status() -> ProviderStatus {
        ProviderStatus {
            state: ProviderStatusState::Idle,
            public_url: None,
            message: Some("not running".to_string()),
            started_at: None,
        }
    }

    async fn remove_state_file(&self) -> Result<(), String> {
        match tokio::fs::remove_file(&self.state_file).await {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!(
                "failed to remove remote access state {}: {err}",
                self.state_file.display()
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::PathBuf;

    use chrono::Utc;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn persist_failure_cleans_up_without_deadlocking() {
        let state_dir = std::env::temp_dir().join(format!(
            "atmos-remote-access-manager-test-{}",
            uuid::Uuid::new_v4()
        ));
        tokio::fs::create_dir_all(&state_dir)
            .await
            .expect("create temp directory");

        let manager = RemoteAccessManager::new(PathBuf::from(&state_dir));
        let provider = build_provider(ProviderKind::Tailscale);

        {
            let mut state = manager.inner.write().await;
            state.provider = Some(provider);
            state.provider_kind = Some(ProviderKind::Tailscale);
        }

        let session = TunnelSession {
            session_id: "session-test".to_string(),
            provider: ProviderKind::Tailscale,
            mode: SessionMode::Private,
            permission: SessionPermission::Control,
            entry_token: "entry-token".to_string(),
            expires_at: Utc::now() + chrono::Duration::minutes(5),
            revoked_at: None,
            public_url: None,
        };

        let result = timeout(
            Duration::from_secs(1),
            manager.persist_started_state(PersistedRemoteAccessState {
                provider: ProviderKind::Tailscale,
                mode: ProviderAccessMode::Private,
                target_base_url: "http://127.0.0.1:3000".to_string(),
                ttl_secs: 60,
                last_started_at: Utc::now().to_rfc3339(),
                session,
            }),
        )
        .await
        .expect("cleanup path should not hang");

        assert!(
            result.is_err(),
            "persist failure should surface as an error"
        );

        let state = manager.inner.read().await;
        assert!(
            state.provider.is_none(),
            "manager should clear provider state"
        );

        let _ = tokio::fs::remove_dir_all(&state_dir).await;
    }
}
