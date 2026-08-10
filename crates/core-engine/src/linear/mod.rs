//! Linear GraphQL read client + pure helpers for APP-056.
//!
//! Read-only: no issue create/update/delete mutations are exposed.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::OnceLock;

use crate::error::EngineError;

pub const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
pub const LINEAR_OAUTH_AUTHORIZE_URL: &str = "https://linear.app/oauth/authorize";
pub const LINEAR_OAUTH_TOKEN_URL: &str = "https://api.linear.app/oauth/token";
pub const LINEAR_OAUTH_REVOKE_URL: &str = "https://api.linear.app/oauth/revoke";

/// Issue list preset tabs (Linear-aligned).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LinearIssuePreset {
    Active,
    Backlog,
    #[default]
    All,
}

impl LinearIssuePreset {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "active" => Self::Active,
            "backlog" => Self::Backlog,
            _ => Self::All,
        }
    }
}

/// Auth shell for OAuth redirect selection (M2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinearOAuthShell {
    Desktop,
    Web,
}

impl LinearOAuthShell {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "desktop" | "electron" | "loopback" => Self::Desktop,
            _ => Self::Web,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinearRateLimitResource {
    pub limit: u64,
    pub used: u64,
    pub remaining: u64,
    /// Unix epoch milliseconds when the window resets (Linear docs).
    pub reset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinearRateLimit {
    pub requests: LinearRateLimitResource,
    pub complexity: LinearRateLimitResource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinearGithubRef {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub kind: String, // "issue" | "pull"
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearLabel {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearAssignee {
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub description: Option<String>,
    pub priority: i32,
    pub state_name: Option<String>,
    pub state_type: Option<String>,
    pub project_name: Option<String>,
    pub project_id: Option<String>,
    pub team_id: Option<String>,
    pub team_key: Option<String>,
    pub labels: Vec<LinearLabel>,
    pub assignee: Option<LinearAssignee>,
    pub github_refs: Vec<LinearGithubRef>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearIssueListPage {
    pub issues: Vec<LinearIssue>,
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearViewer {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinearProject {
    pub id: String,
    pub name: String,
}

/// Filters for on-demand issue list (M7).
#[derive(Debug, Clone, Default)]
pub struct LinearIssueListOptions {
    pub preset: LinearIssuePreset,
    pub team_id: Option<String>,
    pub project_id: Option<String>,
    pub query: Option<String>,
    pub first: u32,
    pub after: Option<String>,
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/// Parse Linear rate-limit headers from a GraphQL response (M4).
///
/// Linear uses:
/// - `X-RateLimit-Requests-Limit` / `Remaining` / `Reset` (ms epoch)
/// - `X-RateLimit-Complexity-Limit` / `Remaining` / `Reset`
pub fn parse_rate_limit_headers(headers: &HashMap<String, String>) -> Option<LinearRateLimit> {
    let get = |name: &str| -> Option<u64> {
        headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .and_then(|(_, v)| v.trim().parse().ok())
    };

    let req_limit = get("x-ratelimit-requests-limit")?;
    let req_remaining = get("x-ratelimit-requests-remaining")?;
    let req_reset = get("x-ratelimit-requests-reset").unwrap_or(0);
    let cpx_limit = get("x-ratelimit-complexity-limit")?;
    let cpx_remaining = get("x-ratelimit-complexity-remaining")?;
    let cpx_reset = get("x-ratelimit-complexity-reset").unwrap_or(0);

    Some(LinearRateLimit {
        requests: LinearRateLimitResource {
            limit: req_limit,
            used: req_limit.saturating_sub(req_remaining),
            remaining: req_remaining,
            reset: req_reset,
        },
        complexity: LinearRateLimitResource {
            limit: cpx_limit,
            used: cpx_limit.saturating_sub(cpx_remaining),
            remaining: cpx_remaining,
            reset: cpx_reset,
        },
    })
}

/// Build GraphQL `filter` object for issues query.
pub fn build_issues_filter(options: &LinearIssueListOptions) -> Value {
    let mut and: Vec<Value> = Vec::new();

    match options.preset {
        LinearIssuePreset::Active => {
            and.push(json!({
                "state": { "type": { "in": ["started", "unstarted"] } }
            }));
        }
        LinearIssuePreset::Backlog => {
            and.push(json!({
                "state": { "type": { "eq": "backlog" } }
            }));
        }
        LinearIssuePreset::All => {}
    }

    if let Some(team_id) = options
        .team_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        and.push(json!({ "team": { "id": { "eq": team_id } } }));
    }

    if let Some(project_id) = options
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        and.push(json!({ "project": { "id": { "eq": project_id } } }));
    }

    if let Some(q) = options
        .query
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        and.push(json!({
            "or": [
                { "title": { "containsIgnoreCase": q } },
                { "number": { "eq": parse_identifier_number(q) } }
            ]
        }));
    }

    if and.is_empty() {
        json!({})
    } else if and.len() == 1 {
        and.into_iter().next().unwrap_or_else(|| json!({}))
    } else {
        json!({ "and": and })
    }
}

fn parse_identifier_number(q: &str) -> i64 {
    // "LAN-48" → 48; bare digits → number; else 0 (harmless eq miss)
    if let Some(idx) = q.rfind('-') {
        return q[idx + 1..].parse().unwrap_or(0);
    }
    q.parse().unwrap_or(0)
}

/// Extract GitHub issue/PR refs from attachment URLs (M11).
pub fn extract_github_refs_from_urls(urls: &[String]) -> Vec<LinearGithubRef> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"(?i)https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/(issues|pull)/(\d+)")
            .expect("github url regex")
    });

    let mut out = Vec::new();
    for url in urls {
        if let Some(caps) = re.captures(url.trim()) {
            let kind = if caps[3].eq_ignore_ascii_case("pull") {
                "pull"
            } else {
                "issue"
            };
            out.push(LinearGithubRef {
                owner: caps[1].to_string(),
                repo: caps[2].trim_end_matches(".git").to_string(),
                number: caps[4].parse().unwrap_or(0),
                kind: kind.to_string(),
                url: url.trim().to_string(),
            });
        }
    }
    out
}

/// PKCE S256 code_challenge from verifier (M2).
pub fn oauth_pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// Select OAuth redirect URI for the shell where the user authenticates (M2).
pub fn select_oauth_redirect(shell: LinearOAuthShell, web_origin: Option<&str>) -> String {
    match shell {
        LinearOAuthShell::Desktop => {
            "http://127.0.0.1:39217/integrations/linear/callback".to_string()
        }
        LinearOAuthShell::Web => {
            let origin = web_origin
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("http://localhost:3000");
            format!(
                "{}/integrations/linear/callback",
                origin.trim_end_matches('/')
            )
        }
    }
}

/// Build authorize URL (no network).
pub fn build_oauth_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> String {
    format!(
        "{LINEAR_OAUTH_AUTHORIZE_URL}?response_type=code&client_id={}&redirect_uri={}&scope=read&state={}&code_challenge={}&code_challenge_method=S256&actor=user",
        urlencoding_encode(client_id),
        urlencoding_encode(redirect_uri),
        urlencoding_encode(state),
        urlencoding_encode(code_challenge),
    )
}

fn urlencoding_encode(s: &str) -> String {
    // Minimal encode for query values without adding a dep beyond what's needed.
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Map Linear issue → GitHub-like payload fields for workspace import parity (M9).
pub fn linear_issue_to_import_body(issue: &LinearIssue) -> (String, Option<String>, String) {
    // (title, body, url)
    (
        issue.title.clone(),
        issue.description.clone(),
        issue.url.clone(),
    )
}

/// Parse a GraphQL issues connection into a page.
pub fn parse_issues_connection(data: &Value) -> Result<LinearIssueListPage, EngineError> {
    let issues_root = data
        .pointer("/issues")
        .or_else(|| data.pointer("/data/issues"))
        .ok_or_else(|| EngineError::Git("Linear response missing issues connection".into()))?;

    let nodes = issues_root
        .get("nodes")
        .and_then(|n| n.as_array())
        .cloned()
        .unwrap_or_default();

    let page_info = issues_root.get("pageInfo");
    let has_next_page = page_info
        .and_then(|p| p.get("hasNextPage"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let end_cursor = page_info
        .and_then(|p| p.get("endCursor"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let mut issues = Vec::with_capacity(nodes.len());
    for node in nodes {
        issues.push(parse_issue_node(&node)?);
    }

    Ok(LinearIssueListPage {
        issues,
        has_next_page,
        end_cursor,
    })
}

pub fn parse_issue_node(node: &Value) -> Result<LinearIssue, EngineError> {
    let id = node
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let identifier = node
        .get("identifier")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let title = node
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let url = node
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if id.is_empty() || identifier.is_empty() {
        return Err(EngineError::Git(
            "Linear issue node missing id/identifier".into(),
        ));
    }

    let attachment_urls: Vec<String> = node
        .pointer("/attachments/nodes")
        .and_then(|n| n.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("url").and_then(|u| u.as_str()).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let labels = node
        .pointer("/labels/nodes")
        .and_then(|n| n.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|l| {
                    let name = l.get("name")?.as_str()?.to_string();
                    Some(LinearLabel {
                        name,
                        color: l.get("color").and_then(|c| c.as_str()).map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let assignee = node.get("assignee").and_then(|a| {
        if a.is_null() {
            return None;
        }
        Some(LinearAssignee {
            name: a.get("name")?.as_str()?.to_string(),
            avatar_url: a
                .get("avatarUrl")
                .and_then(|u| u.as_str())
                .map(str::to_string),
        })
    });

    Ok(LinearIssue {
        id,
        identifier,
        title,
        url,
        description: node
            .get("description")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        priority: node.get("priority").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        state_name: node
            .pointer("/state/name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        state_type: node
            .pointer("/state/type")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        project_name: node
            .pointer("/project/name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        project_id: node
            .pointer("/project/id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        team_id: node
            .pointer("/team/id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        team_key: node
            .pointer("/team/key")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        labels,
        assignee,
        github_refs: extract_github_refs_from_urls(&attachment_urls),
        created_at: node
            .get("createdAt")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        updated_at: node
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

// ---------------------------------------------------------------------------
// Network client (read-only)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum LinearAuth {
    ApiKey(String),
    Bearer(String),
}

/// Thin Linear GraphQL client. **No mutation methods** (M8).
pub struct LinearClient {
    http: reqwest::Client,
    auth: LinearAuth,
    last_rate_limit: std::sync::Mutex<Option<LinearRateLimit>>,
}

impl LinearClient {
    pub fn new(auth: LinearAuth) -> Self {
        Self {
            http: reqwest::Client::new(),
            auth,
            last_rate_limit: std::sync::Mutex::new(None),
        }
    }

    pub fn last_rate_limit(&self) -> Option<LinearRateLimit> {
        self.last_rate_limit.lock().ok().and_then(|g| g.clone())
    }

    fn apply_auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.auth {
            LinearAuth::ApiKey(key) => req.header("Authorization", key.as_str()),
            LinearAuth::Bearer(token) => req.bearer_auth(token),
        }
    }

    async fn graphql(&self, query: &str, variables: Value) -> Result<Value, EngineError> {
        let body = json!({ "query": query, "variables": variables });
        let req = self.apply_auth(
            self.http
                .post(LINEAR_GRAPHQL_URL)
                .header("Content-Type", "application/json")
                .json(&body),
        );
        let resp = req
            .send()
            .await
            .map_err(|e| EngineError::Git(format!("Linear request failed: {e}")))?;

        let mut header_map = HashMap::new();
        for (k, v) in resp.headers().iter() {
            if let Ok(s) = v.to_str() {
                header_map.insert(k.as_str().to_string(), s.to_string());
            }
        }
        if let Some(rl) = parse_rate_limit_headers(&header_map) {
            if let Ok(mut guard) = self.last_rate_limit.lock() {
                *guard = Some(rl);
            }
        }

        let status = resp.status();
        let json: Value = resp
            .json()
            .await
            .map_err(|e| EngineError::Git(format!("Linear invalid JSON: {e}")))?;

        if let Some(errors) = json.get("errors").and_then(|e| e.as_array()) {
            let msg = errors
                .iter()
                .filter_map(|e| e.get("message").and_then(|m| m.as_str()))
                .collect::<Vec<_>>()
                .join("; ");
            if msg.to_ascii_uppercase().contains("RATELIMITED") {
                return Err(EngineError::Git(format!("Linear rate limited: {msg}")));
            }
            if !msg.is_empty() {
                return Err(EngineError::Git(format!("Linear GraphQL error: {msg}")));
            }
        }

        if !status.is_success() {
            return Err(EngineError::Git(format!(
                "Linear HTTP {}: {}",
                status.as_u16(),
                json
            )));
        }

        Ok(json.get("data").cloned().unwrap_or(json))
    }

    pub async fn viewer(&self) -> Result<LinearViewer, EngineError> {
        let data = self
            .graphql("query { viewer { id name email } }", json!({}))
            .await?;
        let v = data
            .get("viewer")
            .ok_or_else(|| EngineError::Git("Linear viewer missing".into()))?;
        Ok(LinearViewer {
            id: v
                .get("id")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            name: v
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            email: v.get("email").and_then(|x| x.as_str()).map(str::to_string),
        })
    }

    pub async fn list_issues(
        &self,
        options: LinearIssueListOptions,
    ) -> Result<LinearIssueListPage, EngineError> {
        let first = options.first.clamp(1, 50);
        let filter = build_issues_filter(&options);
        let query = r#"
query($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title url description priority createdAt updatedAt
      state { name type }
      team { id key }
      project { id name }
      labels { nodes { name color } }
      assignee { name avatarUrl }
      attachments { nodes { url title } }
    }
  }
}"#;
        let variables = json!({
            "first": first,
            "after": options.after,
            "filter": if filter.as_object().map(|o| o.is_empty()).unwrap_or(true) {
                Value::Null
            } else {
                filter
            },
        });
        let data = self.graphql(query, variables).await?;
        parse_issues_connection(&data)
    }

    pub async fn list_teams(&self) -> Result<Vec<LinearTeam>, EngineError> {
        let data = self
            .graphql(
                "query { teams(first: 50) { nodes { id name key } } }",
                json!({}),
            )
            .await?;
        let nodes = data
            .pointer("/teams/nodes")
            .and_then(|n| n.as_array())
            .cloned()
            .unwrap_or_default();
        Ok(nodes
            .into_iter()
            .filter_map(|n| {
                Some(LinearTeam {
                    id: n.get("id")?.as_str()?.to_string(),
                    name: n.get("name")?.as_str()?.to_string(),
                    key: n.get("key")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    pub async fn list_projects(&self) -> Result<Vec<LinearProject>, EngineError> {
        let data = self
            .graphql(
                "query { projects(first: 50) { nodes { id name } } }",
                json!({}),
            )
            .await?;
        let nodes = data
            .pointer("/projects/nodes")
            .and_then(|n| n.as_array())
            .cloned()
            .unwrap_or_default();
        Ok(nodes
            .into_iter()
            .filter_map(|n| {
                Some(LinearProject {
                    id: n.get("id")?.as_str()?.to_string(),
                    name: n.get("name")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    /// Cheap probe that updates rate-limit headers via `viewer`.
    pub async fn probe_rate_limit(&self) -> Result<Option<LinearRateLimit>, EngineError> {
        let _ = self.viewer().await?;
        Ok(self.last_rate_limit())
    }
}

// Compile-time / structural guarantee of read-only surface for tests:
// LinearClient methods are only viewer/list_*/probe_rate_limit/graphql private.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rate_limit_headers_computes_used() {
        let mut h = HashMap::new();
        h.insert("X-RateLimit-Requests-Limit".into(), "2500".into());
        h.insert("X-RateLimit-Requests-Remaining".into(), "2400".into());
        h.insert("X-RateLimit-Requests-Reset".into(), "1700000000000".into());
        h.insert("X-RateLimit-Complexity-Limit".into(), "3000000".into());
        h.insert("X-RateLimit-Complexity-Remaining".into(), "2999000".into());
        h.insert(
            "X-RateLimit-Complexity-Reset".into(),
            "1700000000000".into(),
        );
        let rl = parse_rate_limit_headers(&h).expect("parse");
        assert_eq!(rl.requests.limit, 2500);
        assert_eq!(rl.requests.remaining, 2400);
        assert_eq!(rl.requests.used, 100);
        assert_eq!(rl.complexity.used, 1000);
    }

    #[test]
    fn build_issues_filter_active_and_team() {
        let f = build_issues_filter(&LinearIssueListOptions {
            preset: LinearIssuePreset::Active,
            team_id: Some("team-1".into()),
            project_id: None,
            query: None,
            first: 25,
            after: None,
        });
        let s = f.to_string();
        assert!(s.contains("started"));
        assert!(s.contains("team-1"));
    }

    #[test]
    fn build_issues_filter_backlog_project_query() {
        let f = build_issues_filter(&LinearIssueListOptions {
            preset: LinearIssuePreset::Backlog,
            team_id: None,
            project_id: Some("proj-9".into()),
            query: Some("LAN-48".into()),
            first: 10,
            after: None,
        });
        let s = f.to_string();
        assert!(s.contains("backlog"));
        assert!(s.contains("proj-9"));
        assert!(s.contains("LAN-48") || s.contains("48"));
    }

    #[test]
    fn extract_github_refs() {
        let urls = vec![
            "https://github.com/AruNi-01/atmos/issues/164".into(),
            "https://github.com/AruNi-01/atmos/pull/192".into(),
            "https://linear.app/x/issue/LAN-1".into(),
        ];
        let refs = extract_github_refs_from_urls(&urls);
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].number, 164);
        assert_eq!(refs[0].kind, "issue");
        assert_eq!(refs[1].kind, "pull");
        assert_eq!(refs[1].number, 192);
    }

    #[test]
    fn pkce_challenge_is_stable_s256() {
        // RFC 7636 appendix B style check: non-empty, url-safe, no padding
        let ch = oauth_pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
        assert!(!ch.contains('='));
        assert!(!ch.contains('+'));
        assert!(!ch.contains('/'));
        assert_eq!(ch.len(), 43);
    }

    #[test]
    fn select_oauth_redirect_by_shell() {
        let d = select_oauth_redirect(LinearOAuthShell::Desktop, None);
        let w = select_oauth_redirect(LinearOAuthShell::Web, Some("https://app.example.com"));
        assert!(d.starts_with("http://127.0.0.1"));
        assert!(w.starts_with("https://app.example.com/"));
        assert_ne!(d, w);
    }

    #[test]
    fn parse_issues_connection_fixture() {
        let data = json!({
            "issues": {
                "pageInfo": { "hasNextPage": false, "endCursor": "c1" },
                "nodes": [{
                    "id": "iss-1",
                    "identifier": "LAN-48",
                    "title": "perf: Optimize SQLite",
                    "url": "https://linear.app/x/issue/LAN-48",
                    "description": "body here",
                    "priority": 2,
                    "createdAt": "2026-07-20T00:00:00.000Z",
                    "updatedAt": "2026-08-10T00:00:00.000Z",
                    "state": { "name": "In Progress", "type": "started" },
                    "team": { "id": "t1", "key": "LAN" },
                    "project": { "id": "p1", "name": "Test" },
                    "labels": { "nodes": [{ "name": "enhancement", "color": "#00ff00" }] },
                    "assignee": { "name": "Alice", "avatarUrl": "https://img" },
                    "attachments": { "nodes": [
                        { "url": "https://github.com/org/repo/issues/164", "title": "#164" }
                    ]}
                }]
            }
        });
        let page = parse_issues_connection(&data).expect("parse");
        assert_eq!(page.issues.len(), 1);
        let i = &page.issues[0];
        assert_eq!(i.identifier, "LAN-48");
        assert_eq!(i.priority, 2);
        assert_eq!(i.labels.len(), 1);
        assert_eq!(i.project_name.as_deref(), Some("Test"));
        assert_eq!(i.github_refs.len(), 1);
        assert_eq!(i.github_refs[0].number, 164);
        let (title, body, url) = linear_issue_to_import_body(i);
        assert_eq!(title, "perf: Optimize SQLite");
        assert_eq!(body.as_deref(), Some("body here"));
        assert!(url.contains("LAN-48"));
    }

    #[test]
    fn linear_client_has_no_mutation_api_surface() {
        // Structural: LinearClient impl methods are read-only.
        let src = include_str!("mod.rs");
        let client_impl = src
            .split("impl LinearClient")
            .nth(1)
            .unwrap_or("")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or("");
        assert!(
            client_impl.contains("pub async fn viewer"),
            "viewer present"
        );
        assert!(
            client_impl.contains("pub async fn list_issues"),
            "list_issues present"
        );
        assert!(
            !client_impl.contains("pub async fn create"),
            "no create* methods on LinearClient"
        );
        assert!(
            !client_impl.contains("pub async fn update"),
            "no update* methods on LinearClient"
        );
        assert!(
            !client_impl.contains("mutation"),
            "no GraphQL mutation strings in LinearClient"
        );
    }
}
