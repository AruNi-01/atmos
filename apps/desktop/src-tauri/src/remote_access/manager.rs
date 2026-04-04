use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use remote_access::{
    build_provider, CreateSessionRequest, GatewayHandle, GatewayRuntime, GatewayRuntimeConfig,
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderStartRequest, ProviderStatus,
    ProviderStatusState, SessionMode, SessionPermission, SessionStore,
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
    ) -> Result<ProviderStatus, String> {
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
            bind_addr: "127.0.0.1:0".parse().map_err(|e| e.to_string())?,
            target_base_url: target_base_url.clone(),
            session_store: session_store.clone(),
        })
        .await
        .map_err(|e| e.to_string())?;

        let status = provider
            .start(ProviderStartRequest {
                target_url: gateway.local_url.clone(),
                mode,
                credential,
            })
            .await
            .map_err(|e| e.to_string())?;

        let public_url = status.public_url.clone();
        if let Some(url) = public_url.clone() {
            session_store.set_public_url(&session.session_id, url).await;
        }

        let mut state = self.inner.write().await;
        state.active_session_id = Some(session.session_id);
        state.public_url = public_url;
        state.gateway = Some(gateway);

        self.persist_state(PersistedRemoteAccessState {
            provider: provider_kind,
            mode,
            target_base_url,
            ttl_secs,
            last_started_at: Utc::now().to_rfc3339(),
        })
        .await;

        Ok(status)
    }

    pub async fn recover(
        &self,
        credential: Option<String>,
    ) -> Result<Option<ProviderStatus>, String> {
        let persisted = self.load_state().await?;
        let Some(persisted) = persisted else {
            return Ok(None);
        };

        let provider = build_provider(persisted.provider);
        let session_store = {
            let mut state = self.inner.write().await;
            if state.gateway.is_some() {
                return Ok(Some(state.provider.as_ref().unwrap().status().await));
            }
            state.provider = Some(Arc::clone(&provider));
            state.provider_kind = Some(persisted.provider);
            state.session_store.clone()
        };

        let gateway = GatewayRuntime::start(GatewayRuntimeConfig {
            bind_addr: "127.0.0.1:0".parse().map_err(|e| e.to_string())?,
            target_base_url: persisted.target_base_url,
            session_store,
        })
        .await
        .map_err(|e| e.to_string())?;

        let status = provider
            .recover(ProviderStartRequest {
                target_url: gateway.local_url.clone(),
                mode: persisted.mode,
                credential,
            })
            .await
            .map_err(|e| e.to_string())?;

        let mut state = self.inner.write().await;
        state.gateway = Some(gateway);
        state.public_url = status.public_url.clone();
        Ok(Some(status))
    }

    pub async fn stop(&self) -> Result<(), String> {
        let (provider, gateway, active_session_id, session_store) = {
            let mut state = self.inner.write().await;
            (
                state.provider.clone(),
                state.gateway.take(),
                state.active_session_id.take(),
                state.session_store.clone(),
            )
        };

        if let Some(provider) = provider {
            provider.stop().await.map_err(|e| e.to_string())?;
        }

        if let Some(session_id) = active_session_id {
            let _ = session_store.revoke_session(&session_id).await;
        }

        if let Some(gateway) = gateway {
            gateway.shutdown().await;
        }

        let _ = tokio::fs::remove_file(&self.state_file).await;
        Ok(())
    }

    pub async fn status(&self) -> ProviderStatus {
        let state = self.inner.read().await;
        if let Some(provider) = &state.provider {
            return provider.status().await;
        }

        ProviderStatus {
            state: ProviderStatusState::Idle,
            public_url: None,
            message: Some("not running".to_string()),
            started_at: None,
        }
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

    async fn persist_state(&self, persisted: PersistedRemoteAccessState) {
        if let Some(parent) = self.state_file.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(raw) = serde_json::to_vec_pretty(&persisted) {
            let _ = tokio::fs::write(&self.state_file, raw).await;
        }
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
}
