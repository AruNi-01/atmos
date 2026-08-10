//! Linear credentials (APP-056 / APP-057).
//! - OAuth (and optional Hub-stored secrets): Hub under `user_id`
//! - Personal API keys for the product path: client-local; request may pass
//!   `linear_api_key` without writing Hub
//! OAuth pending state is ephemeral in-memory (PKCE).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::error::{Result, ServiceError};

pub const AUTH_METHOD_API_KEY: &str = "api_key";
pub const AUTH_METHOD_OAUTH: &str = "oauth";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct LinearCredentials {
    #[serde(default)]
    pub auth_method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<String>,
    /// Set when credentials were loaded from Hub for this user.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hub_user_id: Option<String>,
    /// Ephemeral OAuth PKCE (never persisted to Hub as final credentials).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oauth_pending_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oauth_pending_verifier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oauth_pending_redirect: Option<String>,
}

impl LinearCredentials {
    pub fn is_connected(&self) -> bool {
        match self.auth_method.as_str() {
            AUTH_METHOD_API_KEY => self
                .api_key
                .as_deref()
                .map(str::trim)
                .is_some_and(|s| !s.is_empty()),
            AUTH_METHOD_OAUTH => self
                .access_token
                .as_deref()
                .map(str::trim)
                .is_some_and(|s| !s.is_empty()),
            _ => false,
        }
    }
}

/// Auth material for Hub HTTP calls from the local runtime.
#[derive(Debug, Clone, Default)]
pub struct HubAuth {
    pub cookie: Option<String>,
    pub device_credential: Option<String>,
}

impl HubAuth {
    pub fn from_parts(cookie: Option<&str>, device_credential: Option<&str>) -> Self {
        Self {
            cookie: cookie
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            device_credential: device_credential
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.cookie.is_none() && self.device_credential.is_none()
    }

    fn apply(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut req = req;
        if let Some(cred) = self.device_credential.as_deref() {
            req = req.header("Authorization", format!("Bearer {cred}"));
        }
        if let Some(cookie) = self.cookie.as_deref() {
            req = req.header("Cookie", cookie);
        }
        req
    }
}

/// Hub base URL from env (no dual local store).
pub fn hub_base_url() -> Option<String> {
    std::env::var("ATMOS_HUB_URL")
        .or_else(|_| std::env::var("NEXT_PUBLIC_ATMOS_HUB_URL"))
        .ok()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
}

// Ephemeral OAuth pending only (process-local). Final credentials always on Hub.
static OAUTH_PENDING: Mutex<Option<LinearCredentials>> = Mutex::new(None);

pub fn set_oauth_pending(creds: LinearCredentials) {
    if let Ok(mut g) = OAUTH_PENDING.lock() {
        *g = Some(creds);
    }
}

pub fn take_oauth_pending() -> Option<LinearCredentials> {
    OAUTH_PENDING.lock().ok().and_then(|mut g| g.take())
}

pub fn peek_oauth_pending() -> Option<LinearCredentials> {
    OAUTH_PENDING.lock().ok().and_then(|g| g.clone())
}

fn hub_auth_required_err() -> ServiceError {
    ServiceError::Validation("Sign in to Atmos and trust this device to use Linear.".into())
}

/// Fetch Linear credentials for the signed-in Hub user.
pub async fn fetch_credentials_from_hub(auth: &HubAuth) -> Result<LinearCredentials> {
    let base = hub_base_url().ok_or_else(|| {
        ServiceError::Validation(
            "Atmos Hub is not configured (set ATMOS_HUB_URL). Sign in to use Linear.".into(),
        )
    })?;
    if auth.is_empty() {
        return Err(hub_auth_required_err());
    }

    let client = reqwest::Client::new();
    let res = auth
        .apply(client.get(format!("{base}/v1/me/integrations/linear/credentials")))
        .send()
        .await
        .map_err(|e| ServiceError::Processing(format!("Hub request failed: {e}")))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(hub_auth_required_err());
    }
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(LinearCredentials::default());
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(ServiceError::Processing(format!(
            "Hub linear credentials {status}: {body}"
        )));
    }

    #[derive(Deserialize)]
    struct HubResp {
        auth_method: Option<String>,
        credentials: Option<LinearCredentials>,
        viewer_name: Option<String>,
        viewer_email: Option<String>,
    }

    let body: HubResp = res
        .json()
        .await
        .map_err(|e| ServiceError::Processing(format!("Hub JSON invalid: {e}")))?;

    let mut creds = body.credentials.unwrap_or_default();
    if creds.auth_method.is_empty() {
        creds.auth_method = body.auth_method.unwrap_or_default();
    }
    if creds.viewer_name.is_none() {
        creds.viewer_name = body.viewer_name;
    }
    if creds.viewer_email.is_none() {
        creds.viewer_email = body.viewer_email;
    }
    Ok(creds)
}

/// Persist Linear credentials on Hub for the signed-in user.
pub async fn put_credentials_to_hub(auth: &HubAuth, creds: &LinearCredentials) -> Result<()> {
    let base = hub_base_url().ok_or_else(|| {
        ServiceError::Validation("Atmos Hub is not configured (set ATMOS_HUB_URL).".into())
    })?;
    if auth.is_empty() {
        return Err(hub_auth_required_err());
    }

    let client = reqwest::Client::new();
    let res = auth
        .apply(client.put(format!("{base}/v1/me/integrations/linear")))
        .header("Content-Type", "application/json")
        .json(creds)
        .send()
        .await
        .map_err(|e| ServiceError::Processing(format!("Hub upsert failed: {e}")))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(hub_auth_required_err());
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(ServiceError::Processing(format!(
            "Hub linear upsert {status}: {body}"
        )));
    }
    Ok(())
}

pub async fn delete_credentials_on_hub(auth: &HubAuth) -> Result<()> {
    let base = hub_base_url().ok_or_else(|| {
        ServiceError::Validation("Atmos Hub is not configured (set ATMOS_HUB_URL).".into())
    })?;
    if auth.is_empty() {
        return Err(hub_auth_required_err());
    }
    let client = reqwest::Client::new();
    let res = auth
        .apply(client.delete(format!("{base}/v1/me/integrations/linear")))
        .send()
        .await
        .map_err(|e| ServiceError::Processing(format!("Hub delete failed: {e}")))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(hub_auth_required_err());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_pending_is_ephemeral_not_file() {
        set_oauth_pending(LinearCredentials {
            auth_method: AUTH_METHOD_OAUTH.into(),
            oauth_pending_state: Some("s".into()),
            oauth_pending_verifier: Some("v".into()),
            oauth_pending_redirect: Some("http://localhost/cb".into()),
            ..Default::default()
        });
        let p = peek_oauth_pending().expect("pending");
        assert_eq!(p.oauth_pending_state.as_deref(), Some("s"));
        let taken = take_oauth_pending().expect("take");
        assert_eq!(taken.oauth_pending_verifier.as_deref(), Some("v"));
        assert!(peek_oauth_pending().is_none());
    }

    #[test]
    fn is_connected_checks_method() {
        let mut c = LinearCredentials::default();
        assert!(!c.is_connected());
        c.auth_method = AUTH_METHOD_API_KEY.into();
        c.api_key = Some("lin_x".into());
        assert!(c.is_connected());
    }

    #[test]
    fn hub_auth_prefers_device_or_cookie() {
        assert!(HubAuth::from_parts(None, None).is_empty());
        assert!(!HubAuth::from_parts(Some("a=b"), None).is_empty());
        let cred = "devcred".repeat(4);
        assert!(!HubAuth::from_parts(None, Some(&cred)).is_empty());
    }
}
