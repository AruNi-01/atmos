use serde_json::{json, Value};

use core_engine::linear::{LinearAssignee, LinearGithubRef, LinearIssue, LinearLabel};
use core_service::service::linear::{parse_list_options, parse_oauth_shell};
use core_service::service::linear_credentials::HubAuth;
use core_service::{Result, ServiceError};

use super::{
    HubSessionFields, LinearConnectApiKeyRequest, LinearDisconnectRequest,
    LinearFilterOptionsRequest, LinearIssueListRequest, LinearIssueWire, LinearLinkIssueRequest,
    LinearLinksForWorkspaceRequest, LinearOauthFinishRequest, LinearOauthStartRequest,
    LinearRateLimitRequest, LinearStatusRequest, LinearUnlinkIssueRequest, WsMessageService,
};

/// Prefer client-supplied public client_id (web `NEXT_PUBLIC_*`); fall back to API env.
fn resolve_linear_oauth_client_id(from_request: Option<&str>) -> Result<String> {
    let from_req = from_request
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let from_env = std::env::var("LINEAR_OAUTH_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    from_req.or(from_env).ok_or_else(|| {
        ServiceError::Validation(
            "Linear OAuth client_id is not configured. Set NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID (web) or LINEAR_OAUTH_CLIENT_ID (API).".into(),
        )
    })
}

fn hub_auth(hub: &HubSessionFields) -> HubAuth {
    HubAuth::from_parts(hub.cookie(), hub.device_credential())
}

fn linear_api_key(hub: &HubSessionFields) -> Option<&str> {
    hub.linear_api_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn wire_to_issue(w: LinearIssueWire) -> LinearIssue {
    LinearIssue {
        id: w.id,
        identifier: w.identifier,
        title: w.title,
        url: w.url,
        description: w.description,
        priority: w.priority,
        state_name: w.state_name,
        state_type: w.state_type,
        project_name: w.project_name,
        project_id: w.project_id,
        team_id: w.team_id,
        team_key: w.team_key,
        labels: w
            .labels
            .into_iter()
            .map(|l| LinearLabel {
                id: None,
                name: l.name,
                color: l.color,
            })
            .collect(),
        assignee: w.assignee.map(|a| LinearAssignee {
            id: None,
            name: a.name,
            avatar_url: a.avatar_url,
        }),
        github_refs: w
            .github_refs
            .into_iter()
            .map(|g| LinearGithubRef {
                owner: g.owner,
                repo: g.repo,
                number: g.number,
                kind: g.kind,
                url: g.url,
            })
            .collect(),
        created_at: w.created_at,
        updated_at: w.updated_at,
    }
}

impl WsMessageService {
    pub(super) async fn handle_linear_status(&self, req: LinearStatusRequest) -> Result<Value> {
        let status = self
            .linear_service
            .status(&hub_auth(&req.hub), linear_api_key(&req.hub))
            .await?;
        serde_json::to_value(status).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize linear status: {e}"))
        })
    }

    pub(super) async fn handle_linear_connect_api_key(
        &self,
        req: LinearConnectApiKeyRequest,
    ) -> Result<Value> {
        // Local-only validate; client persists the key. Does not write Hub.
        let status = self
            .linear_service
            .connect_api_key(&hub_auth(&req.hub), req.api_key)
            .await?;
        serde_json::to_value(status).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize linear status: {e}"))
        })
    }

    pub(super) fn handle_linear_oauth_start(&self, req: LinearOauthStartRequest) -> Result<Value> {
        let shell = parse_oauth_shell(req.shell);
        let client_id = resolve_linear_oauth_client_id(req.client_id.as_deref())?;
        let (authorize_url, state) =
            self.linear_service
                .oauth_start(shell, req.web_origin, &client_id)?;
        Ok(json!({ "authorize_url": authorize_url, "state": state }))
    }

    pub(super) async fn handle_linear_oauth_finish(
        &self,
        req: LinearOauthFinishRequest,
    ) -> Result<Value> {
        let client_id = resolve_linear_oauth_client_id(req.client_id.as_deref())?;
        let status = self
            .linear_service
            .oauth_finish(&hub_auth(&req.hub), req.code, req.state, &client_id)
            .await?;
        serde_json::to_value(status).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize linear status: {e}"))
        })
    }

    pub(super) async fn handle_linear_disconnect(
        &self,
        req: LinearDisconnectRequest,
    ) -> Result<Value> {
        let status = self.linear_service.disconnect(&hub_auth(&req.hub)).await?;
        serde_json::to_value(status).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize linear status: {e}"))
        })
    }

    pub(super) async fn handle_linear_rate_limit(
        &self,
        req: LinearRateLimitRequest,
    ) -> Result<Value> {
        match self
            .linear_service
            .rate_limit(&hub_auth(&req.hub), linear_api_key(&req.hub))
            .await?
        {
            Some(rl) => Ok(json!({
                "requests": {
                    "limit": rl.requests.limit,
                    "used": rl.requests.used,
                    "remaining": rl.requests.remaining,
                    "reset": rl.requests.reset,
                },
                "complexity": {
                    "limit": rl.complexity.limit,
                    "used": rl.complexity.used,
                    "remaining": rl.complexity.remaining,
                    "reset": rl.complexity.reset,
                },
            })),
            None => Ok(json!({ "requests": null, "complexity": null })),
        }
    }

    pub(super) async fn handle_linear_issue_list(
        &self,
        req: LinearIssueListRequest,
    ) -> Result<Value> {
        let options = parse_list_options(
            req.preset,
            req.team_id,
            req.project_id,
            req.state_types,
            req.assignee_ids,
            req.label_ids,
            req.query,
            req.first,
            req.after,
        );
        let page = self
            .linear_service
            .list_issues(&hub_auth(&req.hub), options, linear_api_key(&req.hub))
            .await?;
        serde_json::to_value(page).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize linear issues: {e}"))
        })
    }

    pub(super) async fn handle_linear_filter_options(
        &self,
        req: LinearFilterOptionsRequest,
    ) -> Result<Value> {
        let (teams, projects, users, labels) = self
            .linear_service
            .filter_options(&hub_auth(&req.hub), linear_api_key(&req.hub))
            .await?;
        Ok(json!({
            "teams": teams,
            "projects": projects,
            "users": users,
            "labels": labels,
        }))
    }

    pub(super) async fn handle_linear_link_issue(
        &self,
        req: LinearLinkIssueRequest,
    ) -> Result<Value> {
        let issue = wire_to_issue(req.issue);
        let link = self
            .linear_service
            .link_issue(req.workspace_guid, &issue)
            .await?;
        serde_json::to_value(link)
            .map_err(|e| ServiceError::Processing(format!("Failed to serialize linear link: {e}")))
    }

    pub(super) async fn handle_linear_unlink_issue(
        &self,
        req: LinearUnlinkIssueRequest,
    ) -> Result<Value> {
        let ok = self
            .linear_service
            .unlink_issue(&req.workspace_guid, &req.external_id)
            .await?;
        Ok(json!({ "ok": ok }))
    }

    pub(super) async fn handle_linear_links_for_workspace(
        &self,
        req: LinearLinksForWorkspaceRequest,
    ) -> Result<Value> {
        let links = self
            .linear_service
            .links_for_workspace(&req.workspace_guid)
            .await?;
        serde_json::to_value(links)
            .map_err(|e| ServiceError::Processing(format!("Failed to serialize linear links: {e}")))
    }
}
