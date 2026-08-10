use serde_json::{json, Value};

use core_service::{Result, ServiceError};
use futures_util::future;

use super::{
    GithubActionsDetailRequest, GithubActionsJobLogsRequest, GithubActionsListRequest,
    GithubActionsRerunRequest, GithubCiOpenBrowserRequest, GithubCiStatusRequest,
    GithubCommitDetailRequest, GithubIssueActionRequest, GithubIssueAssigneePayload,
    GithubIssueCreatePayload, GithubIssueCreateRequest, GithubIssueGetRequest,
    GithubIssueLabelPayload, GithubIssueLinkedPrsRequest, GithubIssueListRequest,
    GithubIssuePageRequest, GithubIssuePayload, GithubIssueTemplateFilePayload,
    GithubIssueTemplatesPayload, GithubIssueTemplatesRequest, GithubIssueTimelinePageRequest,
    GithubIssueUpdateAssigneesRequest, GithubIssueUpdateLabelsRequest, GithubPrBranchPageRequest,
    GithubPrCloseRequest, GithubPrCommentRequest, GithubPrConflictFilesRequest,
    GithubPrCreateRequest, GithubPrDetailRequest, GithubPrDraftRequest, GithubPrFilesRequest,
    GithubPrGetRequest, GithubPrListRepoRequest, GithubPrListRequest, GithubPrMergeRequest,
    GithubPrOpenBrowserRequest, GithubPrPayload, GithubPrReadyRequest, GithubPrReopenRequest,
    GithubPrTimelinePageRequest, GithubPrUpdateAssigneesRequest, GithubPrUpdateLabelsRequest,
    GithubPrUpdateLinkedIssuesRequest, GithubRepoAssigneesRequest, GithubRepoLabelsRequest,
    GithubSearchItemPayload, GithubSearchPagePayload, GithubSearchRequest,
    GithubSecurityPolicyPayload, GithubUserCardRequest, WsEvent, WsMessage, WsMessageService,
};

impl WsMessageService {
    fn to_issue_payload(issue: core_engine::github::GithubIssue) -> GithubIssuePayload {
        GithubIssuePayload {
            owner: issue.owner,
            repo: issue.repo,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            url: issue.url,
            state: issue.state,
            created_at: Some(issue.created_at),
            updated_at: Some(issue.updated_at),
            comments_count: issue.comments_count,
            labels: issue
                .labels
                .into_iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
                .collect(),
            author: issue.author.map(|author| GithubIssueAssigneePayload {
                login: author.login,
                avatar_url: author.avatar_url,
            }),
            assignees: issue
                .assignees
                .into_iter()
                .map(|assignee| GithubIssueAssigneePayload {
                    login: assignee.login,
                    avatar_url: assignee.avatar_url,
                })
                .collect(),
        }
    }

    pub(super) async fn handle_github_search(&self, req: GithubSearchRequest) -> Result<Value> {
        let kind = match req.kind.trim().to_ascii_lowercase().as_str() {
            "pr" | "pull" | "pull_request" | "pulls" => {
                core_engine::github::GithubSearchKind::PullRequest
            }
            _ => core_engine::github::GithubSearchKind::Issue,
        };
        let repos: Vec<core_engine::github::GithubSearchRepo> = req
            .repos
            .into_iter()
            .filter(|r| !r.owner.trim().is_empty() && !r.repo.trim().is_empty())
            .map(|r| core_engine::github::GithubSearchRepo {
                owner: r.owner,
                repo: r.repo,
            })
            .collect();
        let freeform = req
            .query
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let page = self
            .github_engine
            .search_items(core_engine::github::GithubSearchOptions {
                kind,
                state: &req.state,
                repos: &repos,
                assignees: &req.assignees,
                labels: &req.labels,
                query: freeform,
                page: req.page.max(1),
                per_page: req.per_page.clamp(1, 100),
            })
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to search GitHub items: {error}"))
            })?;

        let payload = GithubSearchPagePayload {
            items: page
                .items
                .into_iter()
                .map(|item| GithubSearchItemPayload {
                    owner: item.owner,
                    repo: item.repo,
                    number: item.number,
                    title: item.title,
                    body: item.body,
                    url: item.url,
                    state: item.state,
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                    comments_count: item.comments_count,
                    labels: item
                        .labels
                        .into_iter()
                        .map(|label| GithubIssueLabelPayload {
                            name: label.name,
                            color: label.color,
                            description: label.description,
                        })
                        .collect(),
                    author: item.author.map(|user| GithubIssueAssigneePayload {
                        login: user.login,
                        avatar_url: user.avatar_url,
                    }),
                    assignees: item
                        .assignees
                        .into_iter()
                        .map(|user| GithubIssueAssigneePayload {
                            login: user.login,
                            avatar_url: user.avatar_url,
                        })
                        .collect(),
                    is_draft: item.is_draft,
                    head_ref: item.head_ref,
                    base_ref: item.base_ref,
                    kind: item.kind,
                    status_checks: item
                        .status_checks
                        .into_iter()
                        .map(|check| core_service::types::GithubStatusCheckPayload {
                            state: check.state,
                            conclusion: check.conclusion,
                            status: check.status,
                            name: check.name,
                            context: check.context,
                            details_url: check.details_url,
                            target_url: check.target_url,
                            workflow_name: check.workflow_name,
                        })
                        .collect(),
                    linked_refs: item
                        .linked_refs
                        .into_iter()
                        .map(|r| core_service::types::GithubLinkedRefPayload {
                            kind: r.kind,
                            number: r.number,
                            state: r.state,
                            title: r.title,
                            url: r.url,
                        })
                        .collect(),
                })
                .collect(),
            has_more: page.has_more,
            total_count: page.total_count,
        };
        Ok(json!(payload))
    }

    /// List `.github/ISSUE_TEMPLATE/*` files (raw contents) for the create-issue UI.
    /// Also resolves `SECURITY.md` (root / `.github` / `docs`) when present.
    pub(super) async fn handle_github_issue_templates(
        &self,
        req: GithubIssueTemplatesRequest,
    ) -> Result<Value> {
        let owner = req.owner.trim();
        let repo = req.repo.trim();
        if owner.is_empty() || repo.is_empty() {
            return Err(ServiceError::Validation(
                "owner and repo are required".to_string(),
            ));
        }
        let path = format!("repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE");
        let listing = match self.github_engine.run_gh(&["api", &path]).await {
            Ok(value) => value,
            Err(error) => {
                let message = error.to_string();
                // Missing template folder → still return security policy if any.
                if message.contains("404") || message.contains("Not Found") {
                    let security_policy = self.fetch_github_security_policy(owner, repo).await;
                    return Ok(json!(GithubIssueTemplatesPayload {
                        files: vec![],
                        security_policy,
                    }));
                }
                return Err(ServiceError::Validation(format!(
                    "Failed to list issue templates: {error}"
                )));
            }
        };

        let entries = listing.as_array().cloned().unwrap_or_default();
        let mut files = Vec::new();
        for entry in entries {
            let name = entry
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let lower = name.to_ascii_lowercase();
            // Keep YAML forms, Markdown templates, and config.yml.
            let is_template =
                lower.ends_with(".yml") || lower.ends_with(".yaml") || lower.ends_with(".md");
            if !is_template {
                continue;
            }
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("file");
            if entry_type != "file" {
                continue;
            }

            // Prefer inline base64 content; fall back to fetching by path.
            let content = if let Some(encoded) = entry.get("content").and_then(|v| v.as_str()) {
                decode_github_content_base64(encoded)
            } else {
                let file_path =
                    format!("repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE/{name}");
                match self.github_engine.run_gh(&["api", &file_path]).await {
                    Ok(file_json) => file_json
                        .get("content")
                        .and_then(|v| v.as_str())
                        .map(decode_github_content_base64)
                        .unwrap_or_default(),
                    Err(_) => String::new(),
                }
            };
            if content.is_empty() {
                continue;
            }
            files.push(GithubIssueTemplateFilePayload { name, content });
        }

        files.sort_by(|a, b| a.name.cmp(&b.name));
        let security_policy = self.fetch_github_security_policy(owner, repo).await;
        Ok(json!(GithubIssueTemplatesPayload {
            files,
            security_policy,
        }))
    }

    /// GitHub looks for SECURITY.md at repo root, `.github/`, or `docs/` (case-insensitive match via API path).
    async fn fetch_github_security_policy(
        &self,
        owner: &str,
        repo: &str,
    ) -> Option<GithubSecurityPolicyPayload> {
        // Order matches GitHub's documented discovery paths for security policies.
        const CANDIDATES: &[&str] = &[
            "SECURITY.md",
            ".github/SECURITY.md",
            "docs/SECURITY.md",
            "security.md",
            ".github/security.md",
            "docs/security.md",
        ];
        for rel in CANDIDATES {
            let api_path = format!("repos/{owner}/{repo}/contents/{rel}");
            let file_json = match self.github_engine.run_gh(&["api", &api_path]).await {
                Ok(value) => value,
                Err(_) => continue,
            };
            let entry_type = file_json
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            if entry_type != "file" {
                continue;
            }
            let content = file_json
                .get("content")
                .and_then(|v| v.as_str())
                .map(decode_github_content_base64)
                .unwrap_or_default();
            if content.trim().is_empty() {
                continue;
            }
            let path = file_json
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or(rel)
                .to_string();
            let html_url = file_json
                .get("html_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| Some(format!("https://github.com/{owner}/{repo}/security/policy")));
            return Some(GithubSecurityPolicyPayload {
                path,
                content,
                html_url,
            });
        }
        None
    }

    pub(super) async fn handle_github_issue_create(
        &self,
        req: GithubIssueCreateRequest,
    ) -> Result<Value> {
        let owner = req.owner.trim();
        let repo = req.repo.trim();
        let title = req.title.trim();
        if owner.is_empty() || repo.is_empty() {
            return Err(ServiceError::Validation(
                "owner and repo are required".to_string(),
            ));
        }
        if title.is_empty() {
            return Err(ServiceError::Validation("title is required".to_string()));
        }

        let repo_arg = format!("{owner}/{repo}");
        let body = req.body.as_deref().unwrap_or("").to_string();
        // Keep owned strings alive for run_gh (&[&str]).
        let mut args: Vec<String> = vec![
            "issue".into(),
            "create".into(),
            "--repo".into(),
            repo_arg,
            "--title".into(),
            title.to_string(),
            "--body".into(),
            body,
        ];
        for label in &req.labels {
            let trimmed = label.trim();
            if !trimmed.is_empty() {
                args.push("--label".into());
                args.push(trimmed.to_string());
            }
        }
        for assignee in &req.assignees {
            let trimmed = assignee.trim();
            if !trimmed.is_empty() {
                args.push("--assignee".into());
                args.push(trimmed.to_string());
            }
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = self
            .github_engine
            .run_gh(&arg_refs)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to create issue: {e}")))?;

        // `gh issue create` prints the issue URL as plain text (or JSON string via run_gh).
        let url = match &output {
            Value::String(s) => s.trim().to_string(),
            other => other
                .get("url")
                .and_then(|v| v.as_str())
                .or_else(|| other.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
        };
        if url.is_empty() {
            return Err(ServiceError::Validation(
                "Create issue succeeded but returned no URL".to_string(),
            ));
        }
        let number = url.rsplit('/').next().and_then(|s| s.parse::<u64>().ok());

        Ok(json!(GithubIssueCreatePayload { number, url }))
    }

    pub(super) async fn handle_github_issue_list(
        &self,
        req: GithubIssueListRequest,
    ) -> Result<Value> {
        let issues = self
            .github_engine
            .list_issues(
                &req.owner,
                &req.repo,
                core_engine::github::GithubIssueListOptions {
                    state: &req.state,
                    limit: req.limit,
                    sort: &req.sort,
                    direction: &req.direction,
                    search: req.search.as_deref(),
                },
            )
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub issues: {error}"))
            })?;

        let payloads: Vec<GithubIssuePayload> =
            issues.into_iter().map(Self::to_issue_payload).collect();
        Ok(json!(payloads))
    }

    pub(super) async fn handle_github_issue_page(
        &self,
        req: GithubIssuePageRequest,
    ) -> Result<Value> {
        // GitHub's `/issues` REST endpoint mixes PRs into the list. Filtering them
        // after fetch produces sparse pages (e.g. 1 real issue out of 20 items)
        // while `has_more` stays true. Prefer `list_issues` (gh issue list / filtered
        // API) which returns only issues, then slice the requested page.
        let per_page = req.per_page.clamp(1, 100) as usize;
        let page = req.page.max(1) as usize;
        let fetch_limit = page.saturating_mul(per_page);

        let issues = self
            .github_engine
            .list_issues(
                &req.owner,
                &req.repo,
                core_engine::github::GithubIssueListOptions {
                    state: &req.state,
                    limit: fetch_limit,
                    sort: &req.sort,
                    direction: &req.direction,
                    search: None,
                },
            )
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub issues: {error}"))
            })?;

        let total_fetched = issues.len();
        let start = (page - 1).saturating_mul(per_page);
        let items: Vec<GithubIssuePayload> = issues
            .into_iter()
            .skip(start)
            .take(per_page)
            .map(Self::to_issue_payload)
            .collect();
        let has_more = total_fetched == fetch_limit;

        Ok(json!({ "items": items, "has_more": has_more }))
    }

    pub(super) async fn handle_github_issue_get(
        &self,
        req: GithubIssueGetRequest,
    ) -> Result<Value> {
        let (owner, repo, number) = if let Some(issue_url) = req.issue_url {
            core_engine::GithubEngine::parse_issue_url(&issue_url)
                .ok_or_else(|| ServiceError::Validation("Invalid GitHub issue URL".to_string()))?
        } else {
            let owner = req.owner.ok_or_else(|| {
                ServiceError::Validation("GitHub issue owner is required".to_string())
            })?;
            let repo = req.repo.ok_or_else(|| {
                ServiceError::Validation("GitHub issue repo is required".to_string())
            })?;
            let number = req.issue_number.ok_or_else(|| {
                ServiceError::Validation("GitHub issue number is required".to_string())
            })?;
            (owner, repo, number)
        };

        let issue = self
            .github_engine
            .get_issue(&owner, &repo, number)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to fetch GitHub issue: {error}"))
            })?;

        Ok(json!(Self::to_issue_payload(issue)))
    }

    pub(super) async fn handle_github_issue_timeline_page(
        &self,
        req: GithubIssueTimelinePageRequest,
    ) -> Result<Value> {
        let per_page = req.per_page.clamp(1, 100);
        let endpoint = format!(
            "repos/{}/{}/issues/{}/timeline?per_page={}&page={}",
            req.owner, req.repo, req.issue_number, per_page, req.page
        );
        let args = vec!["api", &endpoint];
        let items = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or(Value::Array(vec![]));
        let count = items.as_array().map(|items| items.len()).unwrap_or(0);

        Ok(json!({
            "items": items,
            "page": req.page,
            "per_page": per_page,
            "has_more": count == per_page as usize,
        }))
    }

    pub(super) async fn handle_github_issue_linked_prs(
        &self,
        req: GithubIssueLinkedPrsRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let issue_reference = format!("#{}", req.issue_number);
        let search_query = format!("{issue_reference} in:body");
        let args = vec![
            "pr",
            "list",
            "--repo",
            &repo_arg,
            "--state",
            "all",
            "--search",
            &search_query,
            "--limit",
            "100",
            "--json",
            "number,title,url,state,headRefName",
        ];
        let candidates = self.github_engine.run_gh(&args).await.map_err(|error| {
            ServiceError::Validation(format!("Failed to list linked pull requests: {error}"))
        })?;
        let mut linked_prs = Vec::new();
        for candidate in candidates.as_array().into_iter().flatten() {
            let Some(number) = candidate.get("number").and_then(|value| value.as_u64()) else {
                continue;
            };
            let pr_number = number.to_string();
            let detail_args = vec![
                "pr",
                "view",
                &pr_number,
                "--repo",
                &repo_arg,
                "--json",
                "closingIssuesReferences",
            ];
            let Ok(detail) = self.github_engine.run_gh(&detail_args).await else {
                continue;
            };
            let is_linked = detail
                .get("closingIssuesReferences")
                .and_then(Value::as_array)
                .is_some_and(|issues| {
                    issues.iter().any(|issue| {
                        issue.get("number").and_then(Value::as_u64) == Some(req.issue_number)
                    })
                });
            if is_linked {
                linked_prs.push(candidate.clone());
            }
        }
        Ok(json!(linked_prs))
    }

    fn to_pr_payload(pr: core_engine::github::GithubPullRequest) -> GithubPrPayload {
        GithubPrPayload {
            owner: pr.owner,
            repo: pr.repo,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            url: pr.url,
            state: pr.state,
            head_ref: pr.head_ref,
            base_ref: pr.base_ref,
            is_draft: pr.is_draft,
            labels: pr
                .labels
                .into_iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
                .collect(),
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            author: pr.author.map(|user| GithubIssueAssigneePayload {
                login: user.login,
                avatar_url: user.avatar_url,
            }),
            assignees: pr
                .assignees
                .into_iter()
                .map(|user| GithubIssueAssigneePayload {
                    login: user.login,
                    avatar_url: user.avatar_url,
                })
                .collect(),
        }
    }

    pub(super) async fn handle_github_pr_list_repo(
        &self,
        req: GithubPrListRepoRequest,
    ) -> Result<Value> {
        let prs = self
            .github_engine
            .list_prs(&req.owner, &req.repo, &req.state, req.limit)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub PRs: {error}"))
            })?;
        let payloads: Vec<GithubPrPayload> = prs.into_iter().map(Self::to_pr_payload).collect();
        Ok(json!(payloads))
    }

    pub(super) async fn handle_github_pr_get(&self, req: GithubPrGetRequest) -> Result<Value> {
        let (owner, repo, number) = if let Some(pr_url) = req.pr_url {
            core_engine::GithubEngine::parse_pr_url(&pr_url)
                .ok_or_else(|| ServiceError::Validation("Invalid GitHub PR URL".to_string()))?
        } else {
            let owner = req.owner.ok_or_else(|| {
                ServiceError::Validation("GitHub PR owner is required".to_string())
            })?;
            let repo = req.repo.ok_or_else(|| {
                ServiceError::Validation("GitHub PR repo is required".to_string())
            })?;
            let number = req.pr_number.ok_or_else(|| {
                ServiceError::Validation("GitHub PR number is required".to_string())
            })?;
            (owner, repo, number)
        };

        let pr = self
            .github_engine
            .get_pr(&owner, &repo, number)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to fetch GitHub PR: {error}"))
            })?;

        Ok(json!(Self::to_pr_payload(pr)))
    }

    pub(super) async fn handle_github_pr_list(
        &self,
        conn_id: &str,
        req: GithubPrListRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let state = req.state.as_deref().unwrap_or("open").to_lowercase();
        let args = vec![
            "pr",
            "list",
            "--repo",
            &repo_arg,
            "--state",
            "all",
            "--limit",
            "100",
            "--json",
            "number,title,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,author,isDraft",
        ];
        let output = self.github_engine.run_gh(&args).await.map_err(|error| {
            ServiceError::Validation(format!("Failed to list pull requests: {error}"))
        })?;
        let mut prs = output
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|pr| {
                let matches_branch = pr
                    .get("baseRefName")
                    .or_else(|| pr.get("base_ref"))
                    .and_then(Value::as_str)
                    == Some(req.branch.as_str())
                    || pr
                        .get("headRefName")
                        .or_else(|| pr.get("head_ref"))
                        .and_then(Value::as_str)
                        == Some(req.branch.as_str());
                let pr_state = pr
                    .get("state")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let matches_state = match state.as_str() {
                    "closed" => pr_state == "closed" || pr_state == "merged",
                    "open" => pr_state == "open",
                    _ => true,
                };
                matches_branch && matches_state
            })
            .collect::<Vec<_>>();

        prs.sort_by(|a, b| {
            let a_time = a.get("createdAt").and_then(|t| t.as_str()).unwrap_or("");
            let b_time = b.get("createdAt").and_then(|t| t.as_str()).unwrap_or("");
            b_time.cmp(a_time)
        });

        if req.emit_branch_status_refresh {
            if let Some(manager) = self.ws_manager.get().cloned() {
                let notification = WsMessage::notification(
                    WsEvent::GithubBranchPrStatusRefreshed,
                    json!({
                        "owner": req.owner,
                        "repo": req.repo,
                        "branch": req.branch,
                    }),
                );
                let _ = manager.send_to(conn_id, &notification).await;
            }
        }

        Ok(json!(prs))
    }

    pub(super) async fn handle_github_pr_branch_page(
        &self,
        req: GithubPrBranchPageRequest,
    ) -> Result<Value> {
        let per_page = req.per_page.clamp(1, 100);
        let state = if req.state.eq_ignore_ascii_case("closed") {
            "closed"
        } else {
            "open"
        };
        let page = req.page.max(1);
        let base_endpoint = format!(
            "repos/{}/{}/pulls?state={state}&base={}&per_page={per_page}&page={page}",
            req.owner, req.repo, req.branch
        );
        let head_endpoint = format!(
            "repos/{}/{}/pulls?state={state}&head={}:{}&per_page={per_page}&page={page}",
            req.owner, req.repo, req.owner, req.branch
        );
        let (base, head) = future::try_join(
            self.github_engine.run_gh(&["api", &base_endpoint]),
            self.github_engine.run_gh(&["api", &head_endpoint]),
        )
        .await
        .map_err(|error| {
            ServiceError::Validation(format!("Failed to list pull requests: {error}"))
        })?;

        let base_items = base.as_array().cloned().unwrap_or_default();
        let head_items = head.as_array().cloned().unwrap_or_default();
        let mut prs = base_items
            .iter()
            .chain(head_items.iter())
            .cloned()
            .collect::<Vec<_>>();
        prs.sort_by(|a, b| {
            b.get("created_at")
                .and_then(Value::as_str)
                .cmp(&a.get("created_at").and_then(Value::as_str))
        });
        prs.dedup_by_key(|pr| pr.get("number").and_then(Value::as_u64));

        let items = prs
            .into_iter()
            .take(per_page as usize)
            .map(|pr| {
                // GitHub REST `/pulls` returns lowercase `open`/`closed`. Normalize to the
                // uppercase OPEN/CLOSED/MERGED shape used by `gh pr list --json` and the UI.
                let merged = pr.get("merged_at").is_some_and(|value| !value.is_null());
                let state = if merged {
                    "MERGED".to_string()
                } else {
                    pr.get("state")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_ascii_uppercase()
                };
                json!({
                    "number": pr.get("number").and_then(Value::as_u64).unwrap_or_default(),
                    "title": pr.get("title").and_then(Value::as_str).unwrap_or_default(),
                    "state": state,
                    "url": pr.get("html_url").and_then(Value::as_str).unwrap_or_default(),
                    "headRefName": pr.pointer("/head/ref").and_then(Value::as_str).unwrap_or_default(),
                    "baseRefName": pr.pointer("/base/ref").and_then(Value::as_str).unwrap_or_default(),
                    "isDraft": pr.get("draft").and_then(Value::as_bool).unwrap_or(false),
                    "createdAt": pr.get("created_at").and_then(Value::as_str),
                    "author": pr.get("user"),
                    "commits": pr.get("commits").and_then(Value::as_u64).map(|count| vec![Value::Null; count as usize]),
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({
            "items": items,
            "has_more": base_items.len() == per_page as usize || head_items.len() == per_page as usize,
        }))
    }

    pub(super) async fn handle_github_pr_detail(
        &self,
        req: GithubPrDetailRequest,
    ) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "view",
            &pr_num_str,
            "--repo",
            &repo_arg,
            "--json",
            "number,title,body,state,mergeable,mergeStateStatus,reviewDecision,baseRefName,headRefName,createdAt,url,statusCheckRollup,comments,reviews,author,commits,isDraft,assignees,labels,reviewRequests,closingIssuesReferences,changedFiles",
        ];
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get PR detail: {}", e)))?;
        Ok(output)
    }

    pub(super) async fn handle_github_pr_timeline_page(
        &self,
        req: GithubPrTimelinePageRequest,
    ) -> Result<Value> {
        let per_page = req.per_page.clamp(1, 100);
        let endpoint = format!(
            "repos/{}/{}/issues/{}/timeline?per_page={}&page={}",
            req.owner, req.repo, req.pr_number, per_page, req.page
        );
        let args = vec!["api", &endpoint];
        let items = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or(Value::Array(vec![]));

        let count = items.as_array().map(|a| a.len()).unwrap_or(0);
        let has_more = count == per_page as usize;

        Ok(json!({
            "items": items,
            "page": req.page,
            "per_page": per_page,
            "has_more": has_more,
        }))
    }

    pub(super) async fn handle_github_pr_detail_sidebar(
        &self,
        req: GithubPrDetailRequest,
    ) -> Result<Value> {
        let review_comments_endpoint = format!(
            "repos/{}/{}/pulls/{}/comments?per_page=100",
            req.owner, req.repo, req.pr_number
        );
        let graphql_query = format!(
            r#"query {{ repository(owner: "{}", name: "{}") {{ pullRequest(number: {}) {{ totalCommentsCount participants(first: 50) {{ nodes {{ login avatarUrl }} }} }} }} }}"#,
            req.owner, req.repo, req.pr_number
        );
        let graphql_query_arg = format!("query={}", graphql_query);

        let (review_comments_result, participants_result, closing_issues_result) = tokio::join!(
            async {
                let args = vec!["api", &review_comments_endpoint];
                self.github_engine.run_gh(&args).await.ok()
            },
            async {
                let args = vec!["api", "graphql", "-f", &graphql_query_arg];
                self.github_engine.run_gh(&args).await.ok()
            },
            async { self.fetch_enriched_closing_issues(&req).await }
        );

        let mut result = json!({});
        let obj = result.as_object_mut().unwrap();

        if let Some(rc) = review_comments_result {
            obj.insert("review_comments".to_string(), rc);
        }

        if let Some(gql) = participants_result {
            if let Some(pr_node) = gql.pointer("/data/repository/pullRequest") {
                if let Some(count) = pr_node.get("totalCommentsCount") {
                    obj.insert("totalCommentsCount".to_string(), count.clone());
                }
                if let Some(nodes) = pr_node
                    .pointer("/participants/nodes")
                    .and_then(|v| v.as_array())
                {
                    let participants: Vec<Value> = nodes
                        .iter()
                        .filter_map(|n| {
                            let login = n.get("login")?.as_str()?;
                            let avatar = n.get("avatarUrl").and_then(|a| a.as_str()).unwrap_or("");
                            Some(json!({ "login": login, "avatar_url": avatar }))
                        })
                        .collect();
                    obj.insert("participants".to_string(), json!(participants));
                }
            }
        }

        if let Some(issues) = closing_issues_result {
            obj.insert("closingIssuesReferences".to_string(), json!(issues));
        }

        Ok(result)
    }

    async fn fetch_enriched_closing_issues(
        &self,
        req: &GithubPrDetailRequest,
    ) -> Option<Vec<Value>> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "view",
            &pr_num_str,
            "--repo",
            &repo_arg,
            "--json",
            "closingIssuesReferences",
        ];
        let output = self.github_engine.run_gh(&args).await.ok()?;
        let issues = output.get("closingIssuesReferences")?.as_array()?.clone();
        if issues.is_empty() {
            return Some(issues);
        }

        let mut enriched = Vec::new();
        for issue in &issues {
            let number = issue.get("number").and_then(|n| n.as_u64()).unwrap_or(0);
            let issue_owner = issue
                .pointer("/repository/owner/login")
                .and_then(|v| v.as_str())
                .unwrap_or(&req.owner);
            let issue_repo = issue
                .pointer("/repository/name")
                .and_then(|v| v.as_str())
                .unwrap_or(&req.repo);
            let endpoint = format!("repos/{}/{}/issues/{}", issue_owner, issue_repo, number);
            let api_args = vec!["api", &endpoint];
            if let Ok(issue_data) = self.github_engine.run_gh(&api_args).await {
                let mut merged = issue.clone();
                if let Some(obj) = merged.as_object_mut() {
                    if let Some(title) = issue_data.get("title") {
                        obj.insert("title".to_string(), title.clone());
                    }
                    if let Some(state) = issue_data.get("state") {
                        obj.insert("state".to_string(), state.clone());
                    }
                }
                enriched.push(merged);
            } else {
                enriched.push(issue.clone());
            }
        }
        Some(enriched)
    }

    pub(super) async fn handle_github_pr_create(
        &self,
        req: GithubPrCreateRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec![
            "pr",
            "create",
            "--repo",
            &repo_arg,
            "--title",
            &req.title,
            "--base",
            &req.base_branch,
            "--head",
            &req.branch,
        ];
        if let Some(body) = &req.body {
            args.push("--body");
            args.push(body);
        }
        if req.draft.unwrap_or(false) {
            args.push("--draft");
        }
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to create PR: {}", e)))?;
        Ok(output)
    }

    pub(super) async fn handle_github_pr_merge(&self, req: GithubPrMergeRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let strategy_flag = format!("--{}", req.strategy);
        let mut args = vec![
            "pr",
            "merge",
            &pr_num_str,
            "--repo",
            &repo_arg,
            &strategy_flag,
        ];

        let body_val;
        if let Some(body) = &req.body {
            body_val = body.clone();
            args.push("--body");
            args.push(&body_val);
        }

        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_close(&self, req: GithubPrCloseRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec!["pr", "close", &pr_num_str, "--repo", &repo_arg];

        let comment_val;
        if let Some(comment) = &req.comment {
            comment_val = comment.clone();
            args.push("--comment");
            args.push(&comment_val);
        }

        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_reopen(
        &self,
        req: GithubPrReopenRequest,
    ) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "reopen", &pr_num_str, "--repo", &repo_arg];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_comment(
        &self,
        req: GithubPrCommentRequest,
    ) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "comment",
            &pr_num_str,
            "--repo",
            &repo_arg,
            "--body",
            &req.body,
        ];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_open_browser(
        &self,
        req: GithubPrOpenBrowserRequest,
    ) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "view", &pr_num_str, "--repo", &repo_arg, "--web"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_ready(&self, req: GithubPrReadyRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "ready", &pr_num_str, "--repo", &repo_arg];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_draft(&self, req: GithubPrDraftRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "ready", &pr_num_str, "--repo", &repo_arg, "--undo"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_repo_labels(
        &self,
        req: GithubRepoLabelsRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let limit = req.limit.clamp(1, 500).to_string();
        let args = vec![
            "label",
            "list",
            "--repo",
            &repo_arg,
            "--limit",
            &limit,
            "--json",
            "name,color,description",
        ];
        let output =
            self.github_engine.run_gh(&args).await.map_err(|e| {
                ServiceError::Validation(format!("Failed to list repo labels: {}", e))
            })?;

        let labels = output
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                let name = item.get("name")?.as_str()?.to_string();
                if name.is_empty() {
                    return None;
                }
                let color = item
                    .get("color")
                    .and_then(|v| v.as_str())
                    .map(|c| c.trim_start_matches('#').to_string());
                let description = item
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty());
                Some(json!({
                    "name": name,
                    "color": color,
                    "description": description,
                }))
            })
            .collect::<Vec<_>>();

        Ok(json!(labels))
    }

    pub(super) async fn handle_github_repo_assignees(
        &self,
        req: GithubRepoAssigneesRequest,
    ) -> Result<Value> {
        let endpoint = format!("repos/{}/{}/assignees?per_page=100", req.owner, req.repo);
        let args = vec!["api", "--paginate", &endpoint];
        let output = self.github_engine.run_gh(&args).await.map_err(|e| {
            ServiceError::Validation(format!("Failed to list repo assignees: {}", e))
        })?;

        let assignees = output
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                let login = item.get("login")?.as_str()?.to_string();
                if login.is_empty() {
                    return None;
                }
                let avatar_url = item
                    .get("avatar_url")
                    .and_then(|v| v.as_str())
                    .or_else(|| item.get("avatarUrl").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                Some(json!({
                    "login": login,
                    "avatar_url": avatar_url,
                }))
            })
            .collect::<Vec<_>>();

        Ok(json!(assignees))
    }

    pub(super) async fn handle_github_user_card(
        &self,
        req: GithubUserCardRequest,
    ) -> Result<Value> {
        let card = self
            .github_engine
            .get_user_card(&req.login)
            .await
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to load GitHub user card: {}", e))
            })?;

        Ok(json!({
            "login": card.login,
            "name": card.name,
            "avatar_url": card.avatar_url,
            "total_contributions": card.total_contributions,
            "contributions": card.contributions.iter().map(|day| json!({
                "date": day.date,
                "count": day.count,
                "level": day.level,
            })).collect::<Vec<_>>(),
        }))
    }

    pub(super) async fn handle_github_rate_limit(&self) -> Result<Value> {
        let limits = self.github_engine.get_rate_limit().await.map_err(|e| {
            ServiceError::Validation(format!("Failed to load GitHub API rate limits: {}", e))
        })?;

        let resource = |r: &core_engine::github::GithubRateLimitResource| {
            json!({
                "limit": r.limit,
                "used": r.used,
                "remaining": r.remaining,
                "reset": r.reset,
            })
        };

        Ok(json!({
            "core": resource(&limits.core),
            "search": resource(&limits.search),
            "graphql": resource(&limits.graphql),
        }))
    }

    pub(super) async fn handle_github_pr_update_labels(
        &self,
        req: GithubPrUpdateLabelsRequest,
    ) -> Result<Value> {
        let add: Vec<String> = req
            .add
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let remove: Vec<String> = req
            .remove
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if add.is_empty() && remove.is_empty() {
            return Ok(json!({ "success": true }));
        }

        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut owned = vec![
            "pr".to_string(),
            "edit".to_string(),
            pr_num_str,
            "--repo".to_string(),
            repo_arg,
        ];
        for label in &add {
            owned.push("--add-label".to_string());
            owned.push(label.clone());
        }
        for label in &remove {
            owned.push("--remove-label".to_string());
            owned.push(label.clone());
        }
        let args: Vec<&str> = owned.iter().map(String::as_str).collect();
        self.github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to update PR labels: {}", e)))?;
        Ok(json!({ "success": true, "added": add, "removed": remove }))
    }

    pub(super) async fn handle_github_pr_update_assignees(
        &self,
        req: GithubPrUpdateAssigneesRequest,
    ) -> Result<Value> {
        let add: Vec<String> = req
            .add
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let remove: Vec<String> = req
            .remove
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if add.is_empty() && remove.is_empty() {
            return Ok(json!({ "success": true }));
        }

        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut owned = vec![
            "pr".to_string(),
            "edit".to_string(),
            pr_num_str,
            "--repo".to_string(),
            repo_arg,
        ];
        for login in &add {
            owned.push("--add-assignee".to_string());
            owned.push(login.clone());
        }
        for login in &remove {
            owned.push("--remove-assignee".to_string());
            owned.push(login.clone());
        }
        let args: Vec<&str> = owned.iter().map(String::as_str).collect();
        self.github_engine.run_gh(&args).await.map_err(|e| {
            ServiceError::Validation(format!("Failed to update PR assignees: {}", e))
        })?;
        Ok(json!({ "success": true, "added": add, "removed": remove }))
    }

    pub(super) async fn handle_github_issue_update_labels(
        &self,
        req: GithubIssueUpdateLabelsRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec![
            "issue".to_string(),
            "edit".to_string(),
            req.issue_number.to_string(),
            "--repo".to_string(),
            repo_arg,
        ];
        for label in &req.add {
            args.extend(["--add-label".to_string(), label.trim().to_string()]);
        }
        for label in &req.remove {
            args.extend(["--remove-label".to_string(), label.trim().to_string()]);
        }
        self.github_engine
            .run_gh(&args.iter().map(String::as_str).collect::<Vec<_>>())
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to update issue labels: {error}"))
            })?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_github_issue_update_assignees(
        &self,
        req: GithubIssueUpdateAssigneesRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec![
            "issue".to_string(),
            "edit".to_string(),
            req.issue_number.to_string(),
            "--repo".to_string(),
            repo_arg,
        ];
        for login in &req.add {
            args.extend(["--add-assignee".to_string(), login.trim().to_string()]);
        }
        for login in &req.remove {
            args.extend(["--remove-assignee".to_string(), login.trim().to_string()]);
        }
        self.github_engine
            .run_gh(&args.iter().map(String::as_str).collect::<Vec<_>>())
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to update issue assignees: {error}"))
            })?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_github_issue_comment(
        &self,
        req: GithubIssueActionRequest,
    ) -> Result<Value> {
        let body = req.body.unwrap_or_default();
        if body.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Comment body is required".to_string(),
            ));
        }
        let number = req.issue_number.to_string();
        let repo = format!("{}/{}", req.owner, req.repo);
        self.github_engine
            .run_gh(&[
                "issue", "comment", &number, "--repo", &repo, "--body", &body,
            ])
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to comment on issue: {error}"))
            })?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_github_issue_close(
        &self,
        req: GithubIssueActionRequest,
    ) -> Result<Value> {
        self.run_github_issue_state_action(req, "close").await
    }

    pub(super) async fn handle_github_issue_reopen(
        &self,
        req: GithubIssueActionRequest,
    ) -> Result<Value> {
        self.run_github_issue_state_action(req, "reopen").await
    }

    async fn run_github_issue_state_action(
        &self,
        req: GithubIssueActionRequest,
        action: &str,
    ) -> Result<Value> {
        let number = req.issue_number.to_string();
        let repo = format!("{}/{}", req.owner, req.repo);
        let mut args = vec![
            "issue".to_string(),
            action.to_string(),
            number,
            "--repo".to_string(),
            repo,
        ];
        if let Some(body) = req.body.filter(|body| !body.trim().is_empty()) {
            args.extend(["--comment".to_string(), body]);
        }
        self.github_engine
            .run_gh(&args.iter().map(String::as_str).collect::<Vec<_>>())
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to {action} issue: {error}"))
            })?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_github_pr_update_linked_issues(
        &self,
        req: GithubPrUpdateLinkedIssuesRequest,
    ) -> Result<Value> {
        if req.add.is_empty() && req.remove.is_empty() {
            return Ok(json!({ "success": true }));
        }

        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let pr_number = req.pr_number.to_string();
        let view_args = vec![
            "pr", "view", &pr_number, "--repo", &repo_arg, "--json", "body",
        ];
        let output = self
            .github_engine
            .run_gh(&view_args)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to read pull request body: {error}"))
            })?;
        let mut body = output
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim_end()
            .to_string();

        body = body
            .lines()
            .filter(|line| {
                let normalized = line.trim().to_ascii_lowercase();
                !req.remove.iter().any(|number| {
                    normalized == format!("closes #{number}")
                        || normalized == format!("close #{number}")
                        || normalized == format!("fixes #{number}")
                        || normalized == format!("resolves #{number}")
                })
            })
            .collect::<Vec<_>>()
            .join("\n");

        for number in &req.add {
            let reference = format!("#{number}");
            if !body.contains(&reference) {
                if !body.is_empty() {
                    body.push_str("\n\n");
                }
                body.push_str(&format!("Closes {reference}"));
            }
        }

        let edit_args = vec![
            "pr", "edit", &pr_number, "--repo", &repo_arg, "--body", &body,
        ];
        self.github_engine
            .run_gh(&edit_args)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to update linked issues: {error}"))
            })?;
        Ok(json!({ "success": true, "added": req.add, "removed": req.remove }))
    }

    pub(super) async fn handle_github_ci_status(
        &self,
        req: GithubCiStatusRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "run",
            "list",
            "--repo",
            &repo_arg,
            "--branch",
            &req.branch,
            "--limit",
            "1",
            "--json",
            "databaseId,workflowName,status,conclusion,createdAt,url",
        ];
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get CI status: {}", e)))?;

        if let Some(arr) = output.as_array() {
            if let Some(item) = arr.first() {
                return Ok(item.clone());
            }
        }
        Ok(json!({ "status": "no_ci_record" }))
    }

    pub(super) async fn handle_github_actions_list(
        &self,
        req: GithubActionsListRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "run",
            "list",
            "--repo",
            &repo_arg,
            "--branch",
            &req.branch,
            "--limit",
            "30",
            "--json",
            "databaseId,workflowName,displayTitle,status,conclusion,createdAt,url,event,headBranch,headSha",
        ];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!([]));
        if !output.is_array() {
            output = json!([]);
        }
        Ok(output)
    }

    pub(super) async fn handle_github_ci_open_browser(
        &self,
        req: GithubCiOpenBrowserRequest,
    ) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["run", "view", &run_id_str, "--repo", &repo_arg, "--web"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_actions_rerun(
        &self,
        req: GithubActionsRerunRequest,
    ) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec!["run", "rerun", &run_id_str, "--repo", &repo_arg];
        if req.failed_only.unwrap_or(false) {
            args.push("--failed");
        }
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    pub(super) async fn handle_github_pr_files(&self, req: GithubPrFilesRequest) -> Result<Value> {
        let endpoint = format!(
            "repos/{}/{}/pulls/{}/files?per_page=100",
            req.owner, req.repo, req.pr_number
        );
        let args = vec!["api", &endpoint];
        let result = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get PR files: {}", e)))?;
        Ok(result)
    }

    /// Resolve conflict file paths (and optional conflict-marked contents) for a PR.
    ///
    /// GitHub's public API only exposes `mergeable` / `mergeStateStatus`, not paths.
    /// We match GitHub's mergeability by merging the **current tip of the base branch**
    /// into the PR head via local `git merge-tree` (no worktree changes).
    pub(super) async fn handle_github_pr_conflict_files(
        &self,
        req: GithubPrConflictFilesRequest,
    ) -> Result<Value> {
        let repo_path = match req
            .repo_path
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
        {
            Some(path) => std::path::PathBuf::from(path),
            None => {
                return Ok(json!({
                    "files": [],
                    "contents": {},
                    "source": "unavailable",
                    "reason": "missing_repo_path",
                }));
            }
        };

        if !repo_path.is_dir() {
            return Ok(json!({
                "files": [],
                "contents": {},
                "source": "unavailable",
                "reason": "repo_path_not_found",
            }));
        }

        let pr_num = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "view",
            &pr_num,
            "--repo",
            &repo_arg,
            "--json",
            "baseRefOid,headRefOid,baseRefName,headRefName,mergeable,mergeStateStatus",
        ];
        let meta = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get PR refs: {}", e)))?;

        let pr_base_oid = meta
            .get("baseRefOid")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let head_oid = meta
            .get("headRefOid")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let base_ref = meta
            .get("baseRefName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let head_ref = meta
            .get("headRefName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        if head_oid.is_empty() || base_ref.is_empty() {
            return Ok(json!({
                "files": [],
                "contents": {},
                "source": "unavailable",
                "reason": "missing_oids",
            }));
        }

        let mergeable = meta.get("mergeable").and_then(Value::as_str).unwrap_or("");
        let merge_state = meta
            .get("mergeStateStatus")
            .and_then(Value::as_str)
            .unwrap_or("");
        let is_conflicting = mergeable.eq_ignore_ascii_case("CONFLICTING")
            || merge_state.eq_ignore_ascii_case("DIRTY");

        let include_contents = req.include_contents;
        let path_for_job = repo_path.clone();
        let base_ref_job = base_ref.clone();
        let head_ref_job = head_ref.clone();
        let head_oid_job = head_oid.clone();
        let pr_base_oid_job = pr_base_oid.clone();

        let job_result = tokio::task::spawn_blocking(move || {
            Self::compute_pr_conflict_files(
                &path_for_job,
                &base_ref_job,
                &head_ref_job,
                &head_oid_job,
                &pr_base_oid_job,
                include_contents,
            )
        })
        .await
        .map_err(|e| ServiceError::Validation(format!("conflict job join failed: {}", e)))?;

        match job_result {
            Ok(payload) => {
                let mut out = payload;
                if let Some(obj) = out.as_object_mut() {
                    obj.insert("is_conflicting".to_string(), json!(is_conflicting));
                    obj.insert("base_ref".to_string(), json!(base_ref));
                    obj.insert("head_ref".to_string(), json!(head_ref));
                    obj.insert("pr_base_oid".to_string(), json!(pr_base_oid));
                    obj.insert("head_oid".to_string(), json!(head_oid));
                }
                Ok(out)
            }
            Err(reason) => Ok(json!({
                "files": [],
                "contents": {},
                "source": "unavailable",
                "reason": reason,
                "base_ref": base_ref,
                "head_ref": head_ref,
                "pr_base_oid": pr_base_oid,
                "head_oid": head_oid,
            })),
        }
    }

    /// Core merge-tree + optional merge-file content generation (blocking).
    fn compute_pr_conflict_files(
        repo_path: &std::path::Path,
        base_ref: &str,
        head_ref: &str,
        head_oid: &str,
        pr_base_oid: &str,
        include_contents: bool,
    ) -> std::result::Result<Value, &'static str> {
        // Prefer current tip of base branch (matches GitHub's mergeability UI).
        Self::prepare_repo_for_merge_tree(repo_path, base_ref, head_ref, pr_base_oid, head_oid)?;

        let base_tip = Self::git_rev_parse(repo_path, &format!("refs/remotes/origin/{base_ref}"))
            .or_else(|| Self::git_rev_parse(repo_path, base_ref))
            .or_else(|| {
                if !pr_base_oid.is_empty() {
                    Some(pr_base_oid.to_string())
                } else {
                    None
                }
            })
            .ok_or("missing_base_tip")?;

        // Ensure merge-base against the tip we will actually use.
        if !Self::git_merge_base_ok(repo_path, &base_tip, head_oid) {
            // Re-run prepare using the resolved tip oid as "base_oid".
            Self::prepare_repo_for_merge_tree(repo_path, base_ref, head_ref, &base_tip, head_oid)?;
            if !Self::git_merge_base_ok(repo_path, &base_tip, head_oid) {
                return Err("no_merge_base");
            }
        }

        let merge_tree_output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args([
                "merge-tree",
                "--write-tree",
                "--name-only",
                "--no-messages",
                &base_tip,
                head_oid,
            ])
            .output()
            .map_err(|_| "merge_tree_spawn_failed")?;

        let stderr = String::from_utf8_lossy(&merge_tree_output.stderr)
            .trim()
            .to_string();
        if !merge_tree_output.status.success()
            && stderr.to_ascii_lowercase().contains("unrelated histories")
        {
            return Err("unrelated_histories");
        }

        let stdout = String::from_utf8_lossy(&merge_tree_output.stdout);
        let mut files: Vec<String> = Vec::new();
        for (i, line) in stdout.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if i == 0 && line.len() == 40 && line.chars().all(|c| c.is_ascii_hexdigit()) {
                continue;
            }
            if line.len() == 40 && line.chars().all(|c| c.is_ascii_hexdigit()) {
                continue;
            }
            files.push(line.to_string());
        }
        files.sort();
        files.dedup();

        let mut contents = serde_json::Map::new();
        if include_contents && !files.is_empty() {
            let merge_base =
                Self::git_merge_base(repo_path, &base_tip, head_oid).unwrap_or_default();
            for path in &files {
                if let Some(text) = Self::build_conflict_marked_content(
                    repo_path,
                    &merge_base,
                    &base_tip,
                    head_oid,
                    path,
                ) {
                    contents.insert(path.clone(), json!(text));
                }
            }
        }

        Ok(json!({
            "files": files,
            "contents": contents,
            "source": "merge_tree",
            "base_oid": base_tip,
            "merge_base_oid": Self::git_merge_base(repo_path, &base_tip, head_oid),
        }))
    }

    /// Fetch PR tips and deepen shallow history until `merge-base(base, head)` works.
    fn prepare_repo_for_merge_tree(
        repo_path: &std::path::Path,
        base_ref: &str,
        head_ref: &str,
        base_oid: &str,
        head_oid: &str,
    ) -> std::result::Result<(), &'static str> {
        // Full ref fetch (no --depth): shallow depth-1 breaks merge-base.
        if !base_ref.is_empty() && !head_ref.is_empty() {
            let _ = std::process::Command::new("git")
                .current_dir(repo_path)
                .args(["fetch", "--no-tags", "origin", base_ref, head_ref])
                .output();
        }

        // Also request the exact PR SHAs (works when the server allows sha fetch).
        let mut sha_args = vec!["fetch", "--no-tags", "origin"];
        if !base_oid.is_empty() {
            sha_args.push(base_oid);
        }
        if !head_oid.is_empty() {
            sha_args.push(head_oid);
        }
        if sha_args.len() > 3 {
            let _ = std::process::Command::new("git")
                .current_dir(repo_path)
                .args(&sha_args)
                .output();
        }

        // Prefer checking head always; base tip may be resolved after fetch.
        let head_ok = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(["cat-file", "-e", &format!("{}^{{commit}}", head_oid)])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !head_ok {
            return Err("missing_commit_objects");
        }

        let base_candidates: Vec<String> = [
            if !base_ref.is_empty() {
                Some(format!("refs/remotes/origin/{base_ref}"))
            } else {
                None
            },
            if !base_ref.is_empty() {
                Some(base_ref.to_string())
            } else {
                None
            },
            if !base_oid.is_empty() {
                Some(base_oid.to_string())
            } else {
                None
            },
        ]
        .into_iter()
        .flatten()
        .collect();

        for base in &base_candidates {
            let base_resolved =
                Self::git_rev_parse(repo_path, base).unwrap_or_else(|| base.clone());
            if Self::git_merge_base_ok(repo_path, &base_resolved, head_oid) {
                return Ok(());
            }
        }

        let is_shallow = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--is-shallow-repository"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim() == "true")
            .unwrap_or(false);

        if is_shallow {
            for deepen in [100u32, 500, 2000] {
                let _ = std::process::Command::new("git")
                    .current_dir(repo_path)
                    .args([
                        "fetch",
                        "--no-tags",
                        &format!("--deepen={deepen}"),
                        "origin",
                    ])
                    .output();
                for base in &base_candidates {
                    let base_resolved =
                        Self::git_rev_parse(repo_path, base).unwrap_or_else(|| base.clone());
                    if Self::git_merge_base_ok(repo_path, &base_resolved, head_oid) {
                        return Ok(());
                    }
                }
            }
            let _ = std::process::Command::new("git")
                .current_dir(repo_path)
                .args(["fetch", "--no-tags", "--unshallow", "origin"])
                .output();
            for base in &base_candidates {
                let base_resolved =
                    Self::git_rev_parse(repo_path, base).unwrap_or_else(|| base.clone());
                if Self::git_merge_base_ok(repo_path, &base_resolved, head_oid) {
                    return Ok(());
                }
            }
            return Err("shallow_no_merge_base");
        }

        Err("no_merge_base")
    }

    fn git_merge_base_ok(repo_path: &std::path::Path, a: &str, b: &str) -> bool {
        Self::git_merge_base(repo_path, a, b).is_some()
    }

    fn git_merge_base(repo_path: &std::path::Path, a: &str, b: &str) -> Option<String> {
        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(["merge-base", a, b])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }

    fn git_rev_parse(repo_path: &std::path::Path, rev: &str) -> Option<String> {
        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--verify", rev])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }

    fn git_show_blob(repo_path: &std::path::Path, rev_path: &str) -> Option<Vec<u8>> {
        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(["show", rev_path])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        Some(output.stdout)
    }

    /// Build conflict-marked file text via three-way `git merge-file` (no worktree write).
    fn build_conflict_marked_content(
        repo_path: &std::path::Path,
        merge_base: &str,
        base_tip: &str,
        head_oid: &str,
        path: &str,
    ) -> Option<String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("atmos-pr-conflict-{stamp}"));
        std::fs::create_dir_all(&dir).ok()?;
        let base_path = dir.join("base");
        let ours_path = dir.join("ours");
        let theirs_path = dir.join("theirs");

        let base_blob = if merge_base.is_empty() {
            None
        } else {
            Self::git_show_blob(repo_path, &format!("{merge_base}:{path}"))
        };
        let ours_blob = Self::git_show_blob(repo_path, &format!("{base_tip}:{path}"));
        let theirs_blob = Self::git_show_blob(repo_path, &format!("{head_oid}:{path}"));

        // If neither side has the file, nothing to show.
        if ours_blob.is_none() && theirs_blob.is_none() {
            let _ = std::fs::remove_dir_all(&dir);
            return None;
        }

        if std::fs::write(&base_path, base_blob.as_deref().unwrap_or(b"")).is_err()
            || std::fs::write(&ours_path, ours_blob.as_deref().unwrap_or(b"")).is_err()
            || std::fs::write(&theirs_path, theirs_blob.as_deref().unwrap_or(b"")).is_err()
        {
            let _ = std::fs::remove_dir_all(&dir);
            return None;
        }

        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args([
                "merge-file",
                "-p",
                "-L",
                "base",
                "-L",
                "ours",
                "-L",
                "theirs",
                ours_path.to_str()?,
                base_path.to_str()?,
                theirs_path.to_str()?,
            ])
            .output();

        let _ = std::fs::remove_dir_all(&dir);

        let output = output.ok()?;

        // merge-file writes merged result to stdout with -p; exit 0 clean, 1 conflicts.
        let mut text = String::from_utf8_lossy(&output.stdout).to_string();
        if !text.contains("<<<<<<<") {
            // modify/delete or clean resolution of one side — still present a synthetic conflict
            // so the read-only viewer has something meaningful to show.
            let ours = String::from_utf8_lossy(ours_blob.as_deref().unwrap_or(b""));
            let theirs = String::from_utf8_lossy(theirs_blob.as_deref().unwrap_or(b""));
            if ours == theirs {
                return Some(ours.into_owned());
            }
            text = format!(
                "<<<<<<< ours (base branch)\n{ours}=======\n{theirs}>>>>>>> theirs (pull request)\n"
            );
        }
        Some(text)
    }

    pub(super) async fn handle_github_commit_detail(
        &self,
        req: GithubCommitDetailRequest,
    ) -> Result<Value> {
        let endpoint = format!(
            "repos/{}/{}/commits/{}?per_page=300",
            req.owner, req.repo, req.sha
        );
        let args = vec!["api", &endpoint];
        let result =
            self.github_engine.run_gh(&args).await.map_err(|e| {
                ServiceError::Validation(format!("Failed to get commit detail: {}", e))
            })?;
        Ok(result)
    }

    pub(super) async fn handle_github_actions_detail(
        &self,
        req: GithubActionsDetailRequest,
    ) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);

        // --- Phase 1: Fetch run details, jobs, and artifacts in parallel ---
        let api_endpoint = format!("/repos/{}/actions/runs/{}", repo_arg, run_id_str);
        let jobs_endpoint = format!(
            "/repos/{}/{}/actions/runs/{}/jobs?per_page=100",
            req.owner, req.repo, run_id_str
        );
        let artifacts_endpoint = format!(
            "/repos/{}/{}/actions/runs/{}/artifacts?per_page=100",
            req.owner, req.repo, run_id_str
        );

        let api_args = vec!["api", &api_endpoint];
        let jobs_args = vec!["api", &jobs_endpoint];
        let artifacts_args = vec!["api", &artifacts_endpoint];

        let (api_output, jobs_output, artifacts_output) = tokio::join!(
            self.github_engine.run_gh(&api_args),
            self.github_engine.run_gh(&jobs_args),
            self.github_engine.run_gh(&artifacts_args),
        );

        let api_output = api_output.unwrap_or_else(|_| json!({}));
        let jobs_output = jobs_output.unwrap_or_else(|_| json!({}));
        let artifacts_output = artifacts_output.unwrap_or_else(|_| json!({}));

        // --- Phase 2: Fetch per-job summaries + annotations and workflow file in parallel ---

        let job_infos: Vec<(u64, String)> = jobs_output
            .get("jobs")
            .and_then(Value::as_array)
            .map(|jobs| {
                jobs.iter()
                    .filter_map(|job| {
                        let job_id = job
                            .get("databaseId")
                            .or_else(|| job.get("database_id"))
                            .or_else(|| job.get("id"))
                            .and_then(Value::as_u64)?;
                        let job_name = job
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        Some((job_id, job_name))
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Per-job futures: fetch summary + annotations concurrently for each job
        let job_futures = job_infos.iter().map(|(job_id, job_name)| {
            let summary_endpoint =
                format!("/repos/{}/{}/check-runs/{}", req.owner, req.repo, job_id);
            let annotations_endpoint = format!(
                "/repos/{}/{}/check-runs/{}/annotations?per_page=100",
                req.owner, req.repo, job_id
            );
            let job_name = job_name.clone();
            async move {
                let summary_args = vec!["api", &summary_endpoint];
                let annotations_args = vec!["api", &annotations_endpoint];
                let (summary, annotations) = tokio::join!(
                    self.github_engine.run_gh(&summary_args),
                    self.github_engine.run_gh(&annotations_args),
                );
                (*job_id, job_name, summary, annotations)
            }
        });

        // Workflow file fetch (depends on api_output which is already available)
        let workflow_path = api_output
            .get("path")
            .and_then(Value::as_str)
            .map(String::from);
        let workflow_ref = api_output
            .get("head_sha")
            .and_then(Value::as_str)
            .map(String::from);

        let workflow_future = async {
            if let (Some(path), Some(reference)) = (workflow_path.as_ref(), workflow_ref.as_ref()) {
                let endpoint = format!(
                    "/repos/{}/{}/contents/{}?ref={}",
                    req.owner, req.repo, path, reference
                );
                let wf_args = vec![
                    "api",
                    &endpoint,
                    "-H",
                    "Accept: application/vnd.github.raw+json",
                ];
                if let Ok(Value::String(content)) = self.github_engine.run_gh(&wf_args).await {
                    Some(content)
                } else {
                    None
                }
            } else {
                None
            }
        };

        // Run all per-job fetches and workflow file fetch in parallel
        let (job_results, workflow_file_content) =
            future::join(future::join_all(job_futures), workflow_future).await;

        // --- Phase 3: Build result ---

        // Insert summaries into jobs and collect annotations
        let mut jobs_value = jobs_output
            .get("jobs")
            .cloned()
            .unwrap_or(Value::Array(vec![]));
        let mut annotations = Vec::new();

        for (job_id, job_name, summary_result, annotations_result) in job_results {
            if let Ok(check_run) = &summary_result {
                if let Some(summary) = check_run
                    .get("output")
                    .and_then(|output| output.get("summary"))
                    .and_then(Value::as_str)
                    .filter(|summary| !summary.trim().is_empty())
                {
                    if let Some(jobs) = jobs_value.as_array_mut() {
                        if let Some(job) = jobs.iter_mut().find(|j| {
                            j.get("databaseId")
                                .or_else(|| j.get("database_id"))
                                .or_else(|| j.get("id"))
                                .and_then(Value::as_u64)
                                == Some(job_id)
                        }) {
                            if let Some(job_obj) = job.as_object_mut() {
                                job_obj.insert("summary".to_string(), json!(summary));
                            }
                        }
                    }
                }
            }

            if let Ok(Value::Array(job_annotations)) = annotations_result {
                annotations.extend(job_annotations.into_iter().filter_map(|annotation| {
                    let mut annotation = annotation.as_object()?.clone();
                    annotation.insert("job_id".to_string(), json!(job_id));
                    annotation.insert("job_name".to_string(), json!(&job_name));
                    Some(Value::Object(annotation))
                }));
            }
        }

        let mut result = json!({});
        if let Some(obj) = result.as_object_mut() {
            let insert_first =
                |obj: &mut serde_json::Map<String, Value>, key: &str, aliases: &[&str]| {
                    for alias in aliases {
                        if let Some(value) = api_output.get(*alias) {
                            obj.insert(key.to_string(), value.clone());
                            break;
                        }
                    }
                };

            insert_first(obj, "databaseId", &["databaseId", "database_id", "id"]);
            insert_first(
                obj,
                "workflowName",
                &["workflowName", "workflow_name", "name"],
            );
            insert_first(
                obj,
                "displayTitle",
                &["displayTitle", "display_title", "name"],
            );
            insert_first(obj, "status", &["status"]);
            insert_first(obj, "conclusion", &["conclusion"]);
            insert_first(
                obj,
                "createdAt",
                &["createdAt", "created_at", "run_started_at"],
            );
            insert_first(obj, "url", &["html_url", "url"]);
            insert_first(obj, "event", &["event"]);
            insert_first(obj, "headBranch", &["headBranch", "head_branch"]);
            insert_first(obj, "headSha", &["headSha", "head_sha"]);

            if let Some(actor) = api_output.get("actor") {
                obj.insert("actor".to_string(), actor.clone());
            }
            if let Some(triggering_actor) = api_output.get("triggering_actor") {
                obj.insert("triggering_actor".to_string(), triggering_actor.clone());
            }
            obj.insert("jobs".to_string(), jobs_value);
            if let Some(artifacts) = artifacts_output.get("artifacts") {
                obj.insert("artifacts".to_string(), artifacts.clone());
            }
            if !annotations.is_empty() {
                obj.insert("annotations".to_string(), Value::Array(annotations));
            }
            if let Some(content) = workflow_file_content {
                if let Some(path) = &workflow_path {
                    obj.insert(
                        "workflow_file".to_string(),
                        json!({ "path": path, "content": content }),
                    );
                }
            }
        }

        Ok(result)
    }

    /// Download a failed job's plain-text log, partition by step timestamps, and
    /// return excerpts only for failed steps (so post-failure cleanup does not
    /// hide the real error under a job-level tail).
    pub(super) async fn handle_github_actions_job_logs(
        &self,
        req: GithubActionsJobLogsRequest,
    ) -> Result<Value> {
        use super::github_job_log_split::{
            build_failed_step_excerpts, build_job_level_fallback_excerpt, excerpts_to_json,
            parse_github_time, JobStepMeta,
        };

        let logs_endpoint = format!(
            "/repos/{}/{}/actions/jobs/{}/logs",
            req.owner, req.repo, req.job_id
        );
        let job_endpoint = format!(
            "/repos/{}/{}/actions/jobs/{}",
            req.owner, req.repo, req.job_id
        );
        let logs_args = ["api", logs_endpoint.as_str()];
        let job_args = ["api", job_endpoint.as_str()];

        let (logs_raw, job_raw) = tokio::join!(
            self.github_engine.run_gh(&logs_args),
            self.github_engine.run_gh(&job_args),
        );

        let full = match logs_raw
            .map_err(|e| ServiceError::Validation(format!("Failed to download job logs: {e}")))?
        {
            Value::String(s) => s,
            other => other
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| other.to_string()),
        };
        let job_total_lines = full.lines().count();

        let steps: Vec<JobStepMeta> = job_raw
            .ok()
            .and_then(|job| {
                job.get("steps").and_then(Value::as_array).map(|arr| {
                    arr.iter()
                        .filter_map(|step| {
                            let number = step.get("number").and_then(Value::as_u64).unwrap_or(0);
                            let name = step
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("Step")
                                .to_string();
                            let conclusion = step
                                .get("conclusion")
                                .and_then(Value::as_str)
                                .map(str::to_owned);
                            let started_at =
                                parse_github_time(step.get("started_at").and_then(Value::as_str));
                            let completed_at =
                                parse_github_time(step.get("completed_at").and_then(Value::as_str));
                            Some(JobStepMeta {
                                number,
                                name,
                                conclusion,
                                started_at,
                                completed_at,
                            })
                        })
                        .collect::<Vec<_>>()
                })
            })
            .unwrap_or_default();

        let mut excerpts = if steps.is_empty() {
            vec![build_job_level_fallback_excerpt(&full)]
        } else {
            build_failed_step_excerpts(&full, &steps)
        };

        // If the job is failed but no step was marked failed (rare), fall back.
        if excerpts.is_empty() && !full.trim().is_empty() {
            excerpts.push(build_job_level_fallback_excerpt(&full));
        }

        Ok(excerpts_to_json(req.job_id, &excerpts, job_total_lines))
    }
}

/// GitHub Contents API returns base64 with optional newlines.
fn decode_github_content_base64(encoded: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    STANDARD
        .decode(cleaned.as_bytes())
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}
