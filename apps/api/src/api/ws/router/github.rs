use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{
    GithubActionsDetailRequest, GithubActionsListRequest, GithubActionsRerunRequest,
    GithubCiOpenBrowserRequest, GithubCiStatusRequest, GithubIssueGetRequest,
    GithubIssueLabelPayload, GithubIssueListRequest, GithubIssuePayload, GithubPrCloseRequest,
    GithubPrCommentRequest, GithubPrCreateRequest, GithubPrDetailRequest, GithubPrDraftRequest,
    GithubPrFilesRequest, GithubPrGetRequest, GithubPrListRepoRequest, GithubPrListRequest,
    GithubPrMergeRequest, GithubPrOpenBrowserRequest, GithubPrPayload, GithubPrReadyRequest,
    GithubPrReopenRequest, GithubPrTimelinePageRequest, WsEvent, WsMessage, WsMessageService,
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
            labels: issue
                .labels
                .into_iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
                .collect(),
        }
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
                &req.state,
                req.limit,
                &req.sort,
                &req.direction,
                req.search.as_deref(),
            )
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub issues: {error}"))
            })?;

        let payloads: Vec<GithubIssuePayload> =
            issues.into_iter().map(Self::to_issue_payload).collect();
        Ok(json!(payloads))
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

        let head_args = vec![
            "pr",
            "list",
            "--repo",
            &repo_arg,
            "--head",
            &req.branch,
            "--state",
            &state,
            "--limit",
            "30",
            "--json",
            "number,title,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,author,isDraft,comments,commits,reviews",
        ];

        let base_args = vec![
            "pr",
            "list",
            "--repo",
            &repo_arg,
            "--base",
            &req.branch,
            "--state",
            &state,
            "--limit",
            "30",
            "--json",
            "number,title,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,author,isDraft,comments,commits,reviews",
        ];

        let (head_res, base_res) = tokio::join!(
            self.github_engine.run_gh(&head_args),
            self.github_engine.run_gh(&base_args)
        );

        let mut all_prs = Vec::new();

        if let Ok(Value::Array(prs)) = head_res {
            all_prs.extend(prs);
        }
        if let Ok(Value::Array(prs)) = base_res {
            all_prs.extend(prs);
        }

        let mut seen_numbers = std::collections::HashSet::new();
        let mut unique_prs = Vec::new();

        for pr in all_prs {
            if let Some(num) = pr.get("number").and_then(|n| n.as_u64()) {
                if seen_numbers.insert(num) {
                    unique_prs.push(pr);
                }
            }
        }

        unique_prs.sort_by(|a, b| {
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

        Ok(json!(unique_prs))
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
            "number,title,body,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,statusCheckRollup,comments,reviews,author,commits,isDraft,assignees,labels,reviewRequests,closingIssuesReferences,changedFiles",
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

    pub(super) async fn handle_github_actions_detail(
        &self,
        req: GithubActionsDetailRequest,
    ) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let api_endpoint = format!("/repos/{}/actions/runs/{}", repo_arg, run_id_str);

        let api_args = vec!["api", &api_endpoint];
        let api_output = self
            .github_engine
            .run_gh(&api_args)
            .await
            .unwrap_or_else(|_| json!({}));

        let jobs_args = vec![
            "run",
            "view",
            &run_id_str,
            "--repo",
            &repo_arg,
            "--json",
            "jobs",
        ];
        let jobs_output = self
            .github_engine
            .run_gh(&jobs_args)
            .await
            .unwrap_or_else(|_| json!({}));

        let mut result = json!({});
        if let Some(obj) = result.as_object_mut() {
            if let Some(actor) = api_output.get("actor") {
                obj.insert("actor".to_string(), actor.clone());
            }
            if let Some(triggering_actor) = api_output.get("triggering_actor") {
                obj.insert("triggering_actor".to_string(), triggering_actor.clone());
            }
            if let Some(jobs) = jobs_output.get("jobs") {
                obj.insert("jobs".to_string(), jobs.clone());
            }
        }

        Ok(result)
    }
}
