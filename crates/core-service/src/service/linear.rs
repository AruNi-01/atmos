//! Linear Task integration (APP-057).
//! Credentials:
//! - **OAuth** → Hub under `user_id` (cross-device sync, recommended)
//! - **Local API key** → client may pass `linear_api_key` per request (not stored on Hub)
//! Associations: local SQLite (worktree-bound display snapshots).

use chrono::Utc;
use core_engine::linear::{
    build_oauth_authorize_url, linear_issue_to_import_body, oauth_pkce_challenge,
    select_oauth_redirect, LinearAuth, LinearClient, LinearIssue, LinearIssueListOptions,
    LinearIssuePreset, LinearOAuthShell, LinearRateLimit,
};
use infra::db::entities::workspace_external_issue;
use infra::db::repo::{WorkspaceExternalIssueRepo, PROVIDER_LINEAR};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use super::linear_credentials::{
    delete_credentials_on_hub, fetch_credentials_from_hub, peek_oauth_pending,
    put_credentials_to_hub, set_oauth_pending, take_oauth_pending, HubAuth, LinearCredentials,
    AUTH_METHOD_API_KEY, AUTH_METHOD_OAUTH,
};
use crate::error::{Result, ServiceError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearStatusDto {
    pub connected: bool,
    pub auth_method: Option<String>,
    pub viewer_name: Option<String>,
    pub viewer_email: Option<String>,
    /// True when Hub session is required but missing.
    #[serde(default)]
    pub needs_hub_login: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearLinkDto {
    pub guid: String,
    pub workspace_guid: String,
    pub provider: String,
    pub external_id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub snapshot_json: Option<String>,
    pub linked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearImportPayload {
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub identifier: String,
    pub external_id: String,
}

pub struct LinearService {
    db: Arc<DatabaseConnection>,
}

impl LinearService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    async fn load_creds(
        &self,
        auth: &HubAuth,
        linear_api_key: Option<&str>,
    ) -> Result<LinearCredentials> {
        if let Some(key) = linear_api_key.map(str::trim).filter(|s| !s.is_empty()) {
            return Ok(LinearCredentials {
                auth_method: AUTH_METHOD_API_KEY.to_string(),
                api_key: Some(key.to_string()),
                ..Default::default()
            });
        }
        fetch_credentials_from_hub(auth).await
    }

    pub async fn status(
        &self,
        auth: &HubAuth,
        linear_api_key: Option<&str>,
    ) -> Result<LinearStatusDto> {
        // Local API key: optional viewer probe for name/email.
        if let Some(key) = linear_api_key.map(str::trim).filter(|s| !s.is_empty()) {
            let client = LinearClient::new(LinearAuth::ApiKey(key.to_string()));
            match client.viewer().await {
                Ok(viewer) => {
                    return Ok(LinearStatusDto {
                        connected: true,
                        auth_method: Some(AUTH_METHOD_API_KEY.to_string()),
                        viewer_name: Some(viewer.name),
                        viewer_email: viewer.email,
                        needs_hub_login: false,
                    });
                }
                Err(e) => {
                    return Err(ServiceError::Validation(format!(
                        "Linear API key rejected: {e}"
                    )));
                }
            }
        }
        match self.load_creds(auth, None).await {
            Ok(c) => Ok(LinearStatusDto {
                connected: c.is_connected(),
                auth_method: if c.is_connected() {
                    Some(c.auth_method.clone())
                } else {
                    None
                },
                viewer_name: c.viewer_name,
                viewer_email: c.viewer_email,
                needs_hub_login: false,
            }),
            Err(ServiceError::Validation(msg))
                if msg.to_ascii_lowercase().contains("sign in")
                    || msg.to_ascii_lowercase().contains("hub is not configured") =>
            {
                Ok(LinearStatusDto {
                    connected: false,
                    auth_method: None,
                    viewer_name: None,
                    viewer_email: None,
                    needs_hub_login: true,
                })
            }
            Err(e) => Err(e),
        }
    }

    fn client_from_creds(&self, c: &LinearCredentials) -> Result<LinearClient> {
        if !c.is_connected() {
            return Err(ServiceError::Validation(
                "Linear is not connected. Sign in to Atmos and connect Linear in Settings.".into(),
            ));
        }
        let auth = match c.auth_method.as_str() {
            AUTH_METHOD_API_KEY => LinearAuth::ApiKey(
                c.api_key
                    .clone()
                    .ok_or_else(|| ServiceError::Validation("Missing Linear API key".into()))?,
            ),
            AUTH_METHOD_OAUTH => LinearAuth::Bearer(
                c.access_token
                    .clone()
                    .ok_or_else(|| ServiceError::Validation("Missing Linear OAuth token".into()))?,
            ),
            _ => {
                return Err(ServiceError::Validation(
                    "Linear credentials are incomplete".into(),
                ))
            }
        };
        Ok(LinearClient::new(auth))
    }

    /// Validate a personal API key (local product path). Does **not** write to Hub.
    pub async fn connect_api_key(
        &self,
        _auth: &HubAuth,
        api_key: String,
    ) -> Result<LinearStatusDto> {
        let key = api_key.trim().to_string();
        if key.is_empty() {
            return Err(ServiceError::Validation("API key is required".into()));
        }
        let client = LinearClient::new(LinearAuth::ApiKey(key));
        let viewer = client
            .viewer()
            .await
            .map_err(|e| ServiceError::Validation(format!("Linear API key rejected: {e}")))?;
        Ok(LinearStatusDto {
            connected: true,
            auth_method: Some(AUTH_METHOD_API_KEY.to_string()),
            viewer_name: Some(viewer.name),
            viewer_email: viewer.email,
            needs_hub_login: false,
        })
    }

    pub fn oauth_start(
        &self,
        shell: LinearOAuthShell,
        web_origin: Option<String>,
        client_id: &str,
    ) -> Result<(String, String)> {
        if client_id.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Linear OAuth client_id is not configured (LINEAR_OAUTH_CLIENT_ID)".into(),
            ));
        }
        let state = Uuid::new_v4().to_string();
        let verifier = Uuid::new_v4().to_string().replace('-', "")
            + &Uuid::new_v4().to_string().replace('-', "");
        let challenge = oauth_pkce_challenge(&verifier);
        let redirect = select_oauth_redirect(shell, web_origin.as_deref());
        let url = build_oauth_authorize_url(client_id, &redirect, &state, &challenge);

        set_oauth_pending(LinearCredentials {
            auth_method: AUTH_METHOD_OAUTH.into(),
            oauth_pending_state: Some(state.clone()),
            oauth_pending_verifier: Some(verifier),
            oauth_pending_redirect: Some(redirect),
            ..Default::default()
        });
        Ok((url, state))
    }

    pub async fn oauth_finish(
        &self,
        auth: &HubAuth,
        code: String,
        state: String,
        client_id: &str,
    ) -> Result<LinearStatusDto> {
        let pending = peek_oauth_pending().ok_or_else(|| {
            ServiceError::Validation("OAuth state missing — restart Connect Linear".into())
        })?;
        let expected = pending.oauth_pending_state.clone().unwrap_or_default();
        if expected.is_empty() || expected != state {
            return Err(ServiceError::Validation(
                "OAuth state mismatch — restart Connect Linear".into(),
            ));
        }
        let verifier = pending
            .oauth_pending_verifier
            .clone()
            .ok_or_else(|| ServiceError::Validation("Missing PKCE verifier".into()))?;
        let redirect = pending
            .oauth_pending_redirect
            .clone()
            .ok_or_else(|| ServiceError::Validation("Missing OAuth redirect".into()))?;

        let http = reqwest::Client::new();
        let form = [
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("client_id", client_id),
            ("code_verifier", verifier.as_str()),
        ];
        let resp = http
            .post(core_engine::linear::LINEAR_OAUTH_TOKEN_URL)
            .form(&form)
            .send()
            .await
            .map_err(|e| ServiceError::Processing(format!("OAuth token exchange failed: {e}")))?;
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| ServiceError::Processing(format!("OAuth token JSON invalid: {e}")))?;
        let access = body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ServiceError::Validation(format!("OAuth response missing access_token: {body}"))
            })?
            .to_string();
        let refresh = body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let expires_in = body
            .get("expires_in")
            .and_then(|v| v.as_i64())
            .unwrap_or(86400);
        let expires_at = Utc::now().timestamp() + expires_in;

        let client = LinearClient::new(LinearAuth::Bearer(access.clone()));
        let viewer = client
            .viewer()
            .await
            .map_err(|e| ServiceError::Validation(format!("OAuth token rejected: {e}")))?;

        let creds = LinearCredentials {
            auth_method: AUTH_METHOD_OAUTH.to_string(),
            access_token: Some(access),
            refresh_token: refresh,
            expires_at: Some(expires_at),
            viewer_id: Some(viewer.id),
            viewer_name: Some(viewer.name),
            viewer_email: viewer.email,
            connected_at: Some(Utc::now().to_rfc3339()),
            ..Default::default()
        };
        put_credentials_to_hub(auth, &creds).await?;
        let _ = take_oauth_pending();
        self.status(auth, None).await
    }

    /// Disconnect Linear on Hub only — **never** deletes association rows.
    pub async fn disconnect(&self, auth: &HubAuth) -> Result<LinearStatusDto> {
        delete_credentials_on_hub(auth).await?;
        self.status(auth, None).await
    }

    pub async fn rate_limit(
        &self,
        auth: &HubAuth,
        linear_api_key: Option<&str>,
    ) -> Result<Option<LinearRateLimit>> {
        let c = self.load_creds(auth, linear_api_key).await?;
        let client = self.client_from_creds(&c)?;
        client
            .probe_rate_limit()
            .await
            .map_err(|e| ServiceError::Processing(format!("Linear rate limit probe failed: {e}")))
    }

    pub async fn list_issues(
        &self,
        auth: &HubAuth,
        options: LinearIssueListOptions,
        linear_api_key: Option<&str>,
    ) -> Result<core_engine::linear::LinearIssueListPage> {
        let c = self.load_creds(auth, linear_api_key).await?;
        let client = self.client_from_creds(&c)?;
        client
            .list_issues(options)
            .await
            .map_err(|e| ServiceError::Processing(format!("Linear issue list failed: {e}")))
    }

    pub async fn filter_options(
        &self,
        auth: &HubAuth,
        linear_api_key: Option<&str>,
    ) -> Result<(
        Vec<core_engine::linear::LinearTeam>,
        Vec<core_engine::linear::LinearProject>,
    )> {
        let c = self.load_creds(auth, linear_api_key).await?;
        let client = self.client_from_creds(&c)?;
        let teams = client
            .list_teams()
            .await
            .map_err(|e| ServiceError::Processing(format!("Linear teams failed: {e}")))?;
        let projects = client
            .list_projects()
            .await
            .map_err(|e| ServiceError::Processing(format!("Linear projects failed: {e}")))?;
        Ok((teams, projects))
    }

    pub async fn link_issue(
        &self,
        workspace_guid: String,
        issue: &LinearIssue,
    ) -> Result<LinearLinkDto> {
        let snapshot = json!({
            "priority": issue.priority,
            "state_name": issue.state_name,
            "state_type": issue.state_type,
            "project_name": issue.project_name,
            "labels": issue.labels,
            "assignee": issue.assignee,
            "github_refs": issue.github_refs,
            "created_at": issue.created_at,
            "updated_at": issue.updated_at,
        });
        let repo = WorkspaceExternalIssueRepo::new(self.db.as_ref());
        let model = repo
            .upsert_link(
                workspace_guid,
                PROVIDER_LINEAR.to_string(),
                issue.id.clone(),
                issue.identifier.clone(),
                issue.title.clone(),
                issue.url.clone(),
                Some(snapshot.to_string()),
            )
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(link_dto(&model))
    }

    pub async fn unlink_issue(&self, workspace_guid: &str, external_id: &str) -> Result<bool> {
        let repo = WorkspaceExternalIssueRepo::new(self.db.as_ref());
        repo.soft_unlink(workspace_guid, PROVIDER_LINEAR, external_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub async fn links_for_workspace(&self, workspace_guid: &str) -> Result<Vec<LinearLinkDto>> {
        let repo = WorkspaceExternalIssueRepo::new(self.db.as_ref());
        let rows = repo
            .list_by_workspace(workspace_guid, PROVIDER_LINEAR)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(rows.iter().map(link_dto).collect())
    }

    pub fn import_payload_from_issue(issue: &LinearIssue) -> LinearImportPayload {
        let (title, body, url) = linear_issue_to_import_body(issue);
        LinearImportPayload {
            title,
            body,
            url,
            identifier: issue.identifier.clone(),
            external_id: issue.id.clone(),
        }
    }
}

fn link_dto(m: &workspace_external_issue::Model) -> LinearLinkDto {
    LinearLinkDto {
        guid: m.guid.clone(),
        workspace_guid: m.workspace_guid.clone(),
        provider: m.provider.clone(),
        external_id: m.external_id.clone(),
        identifier: m.identifier.clone(),
        title: m.title.clone(),
        url: m.url.clone(),
        snapshot_json: m.snapshot_json.clone(),
        linked_at: m.linked_at.to_string(),
    }
}

pub fn parse_list_options(
    preset: Option<String>,
    team_id: Option<String>,
    project_id: Option<String>,
    query: Option<String>,
    first: Option<u32>,
    after: Option<String>,
) -> LinearIssueListOptions {
    LinearIssueListOptions {
        preset: preset
            .as_deref()
            .map(LinearIssuePreset::parse)
            .unwrap_or_default(),
        team_id,
        project_id,
        query,
        first: first.unwrap_or(25),
        after,
    }
}

pub fn parse_oauth_shell(raw: Option<String>) -> LinearOAuthShell {
    raw.as_deref()
        .map(LinearOAuthShell::parse)
        .unwrap_or(LinearOAuthShell::Web)
}

#[cfg(test)]
mod tests {
    use super::*;
    use infra::db::entities::base::BaseFields;
    use infra::db::entities::{project, workspace};
    use infra::db::migration::Migrator;
    use sea_orm::{ActiveModelTrait, ConnectionTrait, Database, Set, Statement};
    use sea_orm_migration::MigratorTrait;

    async fn test_db() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.expect("sqlite");
        db.execute(Statement::from_string(
            db.get_database_backend(),
            "PRAGMA foreign_keys = ON;".to_owned(),
        ))
        .await
        .ok();
        Migrator::up(&db, None).await.expect("migrate");
        db
    }

    async fn seed_workspace(db: &DatabaseConnection) -> String {
        let pbase = BaseFields::new();
        let project_guid = pbase.guid.clone();
        let now = pbase.created_at;
        project::ActiveModel {
            guid: Set(project_guid.clone()),
            created_at: Set(now),
            updated_at: Set(now),
            is_deleted: Set(false),
            name: Set("demo".into()),
            main_file_path: Set("/tmp/demo".into()),
            sidebar_order: Set(0),
            border_color: Set(None),
            logo_path: Set(None),
            is_open: Set(true),
            target_branch: Set(None),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
        }
        .insert(db)
        .await
        .expect("project");

        let wbase = BaseFields::new();
        let ws_guid = wbase.guid.clone();
        workspace::ActiveModel {
            guid: Set(ws_guid.clone()),
            created_at: Set(wbase.created_at),
            updated_at: Set(wbase.updated_at),
            is_deleted: Set(false),
            project_guid: Set(project_guid),
            name: Set("demo/ws".into()),
            display_name: Set(Some("WS".into())),
            branch: Set("feature".into()),
            base_branch: Set("main".into()),
            sidebar_order: Set(0),
            is_pinned: Set(false),
            pinned_at: Set(None),
            pin_order: Set(None),
            is_archived: Set(false),
            archived_at: Set(None),
            last_visited_at: Set(None),
            workflow_status: Set("todo".into()),
            priority: Set("none".into()),
            label_guids: Set(None),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
            github_issue_url: Set(None),
            github_issue_data: Set(None),
            auto_extract_todos: Set(false),
            github_pr_url: Set(None),
            github_pr_data: Set(None),
            create_source: Set("manual".into()),
        }
        .insert(db)
        .await
        .expect("workspace");
        ws_guid
    }

    fn sample_issue(id: &str, ident: &str) -> LinearIssue {
        LinearIssue {
            id: id.into(),
            identifier: ident.into(),
            title: format!("Title {ident}"),
            url: format!("https://linear.app/x/issue/{ident}"),
            description: Some("desc".into()),
            priority: 2,
            state_name: Some("Todo".into()),
            state_type: Some("unstarted".into()),
            project_name: None,
            project_id: None,
            team_id: None,
            team_key: None,
            labels: vec![],
            assignee: None,
            github_refs: vec![],
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn multi_link_and_relink_after_unlink() {
        let db = test_db().await;
        let ws = seed_workspace(&db).await;
        let svc = LinearService::new(Arc::new(db));

        let a = sample_issue("id-a", "LAN-1");
        let b = sample_issue("id-b", "LAN-2");
        svc.link_issue(ws.clone(), &a).await.unwrap();
        svc.link_issue(ws.clone(), &b).await.unwrap();
        assert_eq!(svc.links_for_workspace(&ws).await.unwrap().len(), 2);

        assert!(svc.unlink_issue(&ws, "id-a").await.unwrap());
        assert_eq!(svc.links_for_workspace(&ws).await.unwrap().len(), 1);

        // Soft-deleted row revives under unique constraint
        svc.link_issue(ws.clone(), &a).await.unwrap();
        assert_eq!(svc.links_for_workspace(&ws).await.unwrap().len(), 2);
    }

    #[test]
    fn import_payload_parity_fields() {
        let issue = sample_issue("x", "LAN-9");
        let p = LinearService::import_payload_from_issue(&issue);
        assert_eq!(p.identifier, "LAN-9");
        assert!(p.body.is_some());
    }

    #[test]
    fn oauth_start_stores_ephemeral_pending() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let db = rt.block_on(async { Database::connect("sqlite::memory:").await.unwrap() });
        let svc = LinearService::new(Arc::new(db));
        let (url, state) = svc
            .oauth_start(LinearOAuthShell::Desktop, None, "client-abc")
            .unwrap();
        assert!(url.contains("client-abc"));
        assert!(url.contains("code_challenge"));
        let pending = peek_oauth_pending().expect("pending");
        assert_eq!(pending.oauth_pending_state.as_deref(), Some(state.as_str()));
    }
}
