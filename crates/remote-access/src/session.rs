use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use rand::distributions::{Alphanumeric, DistString};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::RemoteAccessError;
use crate::providers::ProviderKind;
use crate::types::{CreateSessionRequest, SessionMode, SessionPermission, SessionValidation};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelSession {
    pub session_id: String,
    pub provider: ProviderKind,
    pub mode: SessionMode,
    pub permission: SessionPermission,
    pub entry_token: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub public_url: Option<String>,
}

impl TunnelSession {
    pub fn is_expired(&self, now: DateTime<Utc>) -> bool {
        self.expires_at.is_some_and(|expires_at| now >= expires_at)
    }

    pub fn is_revoked(&self) -> bool {
        self.revoked_at.is_some()
    }
}

#[derive(Debug, Clone, Default)]
pub struct SessionStore {
    inner: Arc<RwLock<HashMap<String, TunnelSession>>>,
}

impl SessionStore {
    pub async fn create_session(&self, req: CreateSessionRequest) -> TunnelSession {
        let session_id = Uuid::new_v4().to_string();
        let entry_token = Alphanumeric.sample_string(&mut rand::thread_rng(), 48);
        let expires_at = resolve_expiry(Utc::now(), req.ttl_secs);

        let session = TunnelSession {
            session_id: session_id.clone(),
            provider: req.provider,
            mode: req.mode,
            permission: req.permission,
            entry_token,
            expires_at,
            revoked_at: None,
            public_url: None,
        };

        let now = Utc::now();
        let mut guard = self.inner.write().await;
        prune_stale_sessions(&mut guard, now);
        guard.insert(session_id, session.clone());
        session
    }

    pub async fn set_public_url(&self, session_id: &str, public_url: String) {
        if let Some(session) = self.inner.write().await.get_mut(session_id) {
            session.public_url = Some(public_url);
        }
    }

    pub async fn restore_session(&self, session: TunnelSession) {
        let now = Utc::now();
        let mut guard = self.inner.write().await;
        prune_stale_sessions(&mut guard, now);
        guard.insert(session.session_id.clone(), session);
    }

    /// Extend an existing session's TTL. If `reuse_token` is true the existing
    /// `entry_token` is kept; otherwise a fresh one is generated (invalidating
    /// any previously shared URLs).
    pub async fn renew_session(
        &self,
        session_id: &str,
        ttl_secs: i64,
        reuse_token: bool,
    ) -> Result<TunnelSession, RemoteAccessError> {
        let now = Utc::now();
        let mut guard = self.inner.write().await;
        let session = guard
            .get_mut(session_id)
            .ok_or(RemoteAccessError::SessionNotFound)?;

        session.expires_at = resolve_expiry(now, ttl_secs);
        session.revoked_at = None;
        if !reuse_token {
            session.entry_token = Alphanumeric.sample_string(&mut rand::thread_rng(), 48);
        }
        Ok(session.clone())
    }

    pub async fn revoke_session(&self, session_id: &str) -> Result<(), RemoteAccessError> {
        let mut guard = self.inner.write().await;
        if guard.remove(session_id).is_none() {
            return Err(RemoteAccessError::SessionNotFound);
        }
        Ok(())
    }

    pub async fn get_session(&self, session_id: &str) -> Option<TunnelSession> {
        let now = Utc::now();
        let mut guard = self.inner.write().await;
        prune_stale_sessions(&mut guard, now);
        guard.get(session_id).cloned()
    }

    pub async fn validate(
        &self,
        session_cookie: Option<&str>,
        entry_token: Option<&str>,
    ) -> SessionValidation {
        let now = Utc::now();
        let sessions = self.inner.read().await;

        if let Some(cookie_id) = session_cookie {
            if let Some(session) = sessions.get(cookie_id) {
                if !session.is_revoked() && !session.is_expired(now) {
                    return SessionValidation::Authorized {
                        session_id: session.session_id.clone(),
                    };
                }
            }
        }

        let Some(entry_token) = entry_token else {
            return SessionValidation::Unauthorized;
        };

        for session in sessions.values() {
            if session.entry_token == entry_token
                && !session.is_revoked()
                && !session.is_expired(now)
            {
                return SessionValidation::Authorized {
                    session_id: session.session_id.clone(),
                };
            }
        }

        SessionValidation::Unauthorized
    }
}

fn prune_stale_sessions(sessions: &mut HashMap<String, TunnelSession>, now: DateTime<Utc>) {
    sessions.retain(|_, session| !session.is_revoked() && !session.is_expired(now));
}

fn resolve_expiry(now: DateTime<Utc>, ttl_secs: i64) -> Option<DateTime<Utc>> {
    if ttl_secs <= 0 {
        None
    } else {
        Some(now + Duration::seconds(ttl_secs.max(60)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_positive_ttl_creates_non_expiring_session() {
        assert_eq!(resolve_expiry(Utc::now(), 0), None);
        assert_eq!(resolve_expiry(Utc::now(), -1), None);
    }

    #[test]
    fn short_positive_ttl_is_still_clamped_to_one_minute() {
        let now = Utc::now();
        let expiry = resolve_expiry(now, 1).expect("expiry should be present");
        assert_eq!(expiry, now + Duration::seconds(60));
    }
}
