use serde::{Deserialize, Serialize};

/// Hub auth for local → Hub integration calls (APP-056 / APP-057).
/// Prefer device credential (cross-origin safe); cookie is optional same-site fallback.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HubSessionFields {
    /// Full `Cookie` header value for Hub origin (dev / same-site only).
    #[serde(default)]
    pub hub_cookie: Option<String>,
    /// Hub-minted device credential (plaintext). Sent as `Authorization: Bearer`.
    #[serde(default)]
    pub device_credential: Option<String>,
    /// Client-local Linear personal API key (never stored on Hub when used this way).
    #[serde(default)]
    pub linear_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearConnectApiKeyRequest {
    pub api_key: String,
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearOauthStartRequest {
    #[serde(default)]
    pub shell: Option<String>,
    #[serde(default)]
    pub web_origin: Option<String>,
    /// Public Linear OAuth client id (from web `NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID`).
    #[serde(default)]
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearOauthFinishRequest {
    pub code: String,
    pub state: String,
    /// Same public client id used at start (PKCE token exchange).
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinearStatusRequest {
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinearRateLimitRequest {
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinearFilterOptionsRequest {
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinearDisconnectRequest {
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueListRequest {
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub team_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub first: Option<u32>,
    #[serde(default)]
    pub after: Option<String>,
    #[serde(flatten)]
    pub hub: HubSessionFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearLinkIssueRequest {
    pub workspace_guid: String,
    pub issue: LinearIssueWire,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearUnlinkIssueRequest {
    pub workspace_guid: String,
    pub external_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearLinksForWorkspaceRequest {
    pub workspace_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueWire {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub state_name: Option<String>,
    #[serde(default)]
    pub state_type: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub team_id: Option<String>,
    #[serde(default)]
    pub team_key: Option<String>,
    #[serde(default)]
    pub labels: Vec<LinearLabelWire>,
    #[serde(default)]
    pub assignee: Option<LinearAssigneeWire>,
    #[serde(default)]
    pub github_refs: Vec<LinearGithubRefWire>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearLabelWire {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearAssigneeWire {
    pub name: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearGithubRefWire {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub kind: String,
    pub url: String,
}
