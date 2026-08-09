use std::sync::LazyLock;

use regex::Regex;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::EngineError;

// Repo names may contain dots (e.g. `0x3f4.run`). Do NOT stop at `.` —
// strip a trailing `.git` suffix after capture instead.
static RE_HTTPS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"github\.com/([^/]+)/([^/\s?#]+)").unwrap());
static RE_SSH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"github\.com:([^/]+)/([^\s]+)").unwrap());
static RE_ISSUE_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)(?:[/?#].*)?$").unwrap()
});
static RE_PR_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)(?:[/?#].*)?$").unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueLabel {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueAssignee {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssue {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
    pub comments_count: u64,
    pub labels: Vec<GithubIssueLabel>,
    /// Issue opener (gh `author` / REST `user`).
    pub author: Option<GithubIssueAssignee>,
    pub assignees: Vec<GithubIssueAssignee>,
}

#[derive(Debug, Clone, Copy)]
pub struct GithubIssueListOptions<'a> {
    pub state: &'a str,
    pub limit: usize,
    pub sort: &'a str,
    pub direction: &'a str,
    pub search: Option<&'a str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GithubSearchKind {
    Issue,
    PullRequest,
}

impl GithubSearchKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Issue => "issue",
            Self::PullRequest => "pr",
        }
    }
}

#[derive(Debug, Clone)]
pub struct GithubSearchRepo {
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Clone, Copy)]
pub struct GithubSearchOptions<'a> {
    pub kind: GithubSearchKind,
    pub state: &'a str,
    pub repos: &'a [GithubSearchRepo],
    pub assignees: &'a [String],
    pub labels: &'a [String],
    /// Free-form GitHub search syntax (e.g. `sort:created-desc author:foo`).
    /// Combined with structured filters; structured `repo:` always wins for scoping.
    pub query: Option<&'a str>,
    pub page: u32,
    pub per_page: u32,
}

/// Extra PR fields filled after search (list rows).
#[derive(Default)]
struct PrListEnrichment {
    total_comments: Option<u64>,
    checks: Vec<GithubStatusCheck>,
    head_ref: Option<String>,
    base_ref: Option<String>,
    /// Normalized lifecycle: "open" | "closed" | "merged".
    state: Option<String>,
    /// Issues linked via `closingIssuesReferences`.
    linked_refs: Vec<GithubLinkedRef>,
}

/// Issue-list enrichment (linked PRs only).
#[derive(Default)]
struct IssueListEnrichment {
    linked_refs: Vec<GithubLinkedRef>,
}

/// Cross-link between an issue and a PR for Task list rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubLinkedRef {
    /// `"issue"` | `"pr"`
    pub kind: String,
    pub number: u64,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

/// Status check / CI context for list-row rings (subset of PR `statusCheckRollup`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GithubStatusCheck {
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default, rename = "detailsUrl", alias = "details_url")]
    pub details_url: Option<String>,
    #[serde(default, rename = "targetUrl", alias = "target_url")]
    pub target_url: Option<String>,
    #[serde(default, rename = "workflowName", alias = "workflow_name")]
    pub workflow_name: Option<String>,
}

/// Unified search hit for multi-repo Issue / PR Task lists.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubSearchItem {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub comments_count: u64,
    pub labels: Vec<GithubIssueLabel>,
    pub author: Option<GithubIssueAssignee>,
    pub assignees: Vec<GithubIssueAssignee>,
    pub is_draft: bool,
    pub head_ref: Option<String>,
    pub base_ref: Option<String>,
    pub kind: String,
    /// CI checks for PR rows (empty for issues / when enrichment fails).
    #[serde(default)]
    pub status_checks: Vec<GithubStatusCheck>,
    /// Linked issues (on PR rows) or linked PRs (on issue rows).
    #[serde(default)]
    pub linked_refs: Vec<GithubLinkedRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubSearchPage {
    pub items: Vec<GithubSearchItem>,
    pub has_more: bool,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPullRequest {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub head_ref: String,
    pub base_ref: String,
    pub is_draft: bool,
    pub labels: Vec<GithubIssueLabel>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub author: Option<GithubIssueAssignee>,
    #[serde(default)]
    pub assignees: Vec<GithubIssueAssignee>,
}

/// One day in a GitHub contribution calendar (0..=4 intensity).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubContributionDay {
    pub date: String,
    pub count: u32,
    pub level: u8,
}

/// Public profile + contribution calendar for hover cards.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubUserCard {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub total_contributions: u32,
    /// Last ~17 weeks (119 days) of contribution days, oldest → newest.
    pub contributions: Vec<GithubContributionDay>,
}

/// Single GitHub rate-limit resource snapshot (`core` / `search` / `graphql`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRateLimitResource {
    pub limit: u64,
    pub used: u64,
    pub remaining: u64,
    /// Unix epoch seconds when this window resets.
    pub reset: u64,
}

/// Authenticated `gh` token rate limits for the three resources Atmos uses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRateLimit {
    pub core: GithubRateLimitResource,
    pub search: GithubRateLimitResource,
    pub graphql: GithubRateLimitResource,
}

const USER_CARD_CONTRIBUTION_DAYS: usize = 119;

pub struct GithubEngine;

impl Default for GithubEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl GithubEngine {
    pub fn new() -> Self {
        Self
    }

    /// Run a gh command and return parsed JSON. If output is not JSON, returns it as a string.
    pub async fn run_gh(&self, args: &[&str]) -> Result<serde_json::Value, EngineError> {
        let output = Command::new("gh")
            .args(args)
            .output()
            .await
            .map_err(|e| EngineError::Git(format!("Failed to spawn gh: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(EngineError::Git(format!(
                "gh exited with error: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(serde_json::json!({ "success": true }));
        }

        match serde_json::from_str::<serde_json::Value>(&stdout) {
            Ok(json) => Ok(json),
            Err(_) => Ok(serde_json::Value::String(stdout)),
        }
    }

    /// Fetch a user's public profile + contribution calendar via authenticated `gh` GraphQL.
    ///
    /// Uses the local `gh` auth context (user token), not a third-party contributions host.
    pub async fn get_user_card(&self, login: &str) -> Result<GithubUserCard, EngineError> {
        let login = normalize_github_login(login)
            .ok_or_else(|| EngineError::Git("GitHub username is required".to_string()))?;

        // Compact single-line query so it can be passed safely via `-f query=...`.
        let query = concat!(
            "query($login:String!){",
            "user(login:$login){",
            "name login avatarUrl ",
            "contributionsCollection{",
            "contributionCalendar{",
            "totalContributions ",
            "weeks{contributionDays{date contributionCount contributionLevel}}",
            "}}}}"
        );
        let login_var = format!("login={login}");
        let query_arg = format!("query={query}");
        let output = self
            .run_gh(&["api", "graphql", "-f", &query_arg, "-F", &login_var])
            .await?;

        if let Some(errors) = output.get("errors").and_then(|v| v.as_array()) {
            if !errors.is_empty() {
                let message = errors
                    .iter()
                    .filter_map(|e| e.get("message").and_then(|m| m.as_str()))
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(EngineError::Git(format!(
                    "GitHub GraphQL error for user '{login}': {message}"
                )));
            }
        }

        let user = output
            .pointer("/data/user")
            .cloned()
            .filter(|v| !v.is_null())
            .ok_or_else(|| EngineError::Git(format!("GitHub user '{login}' not found")))?;

        let resolved_login = user
            .get("login")
            .and_then(|v| v.as_str())
            .unwrap_or(login.as_str())
            .to_string();
        let name = user
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        let avatar_url = user
            .get("avatarUrl")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        let calendar = user
            .pointer("/contributionsCollection/contributionCalendar")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let total_contributions = calendar
            .get("totalContributions")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let mut days: Vec<GithubContributionDay> = calendar
            .get("weeks")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|week| week.get("contributionDays")?.as_array())
            .flatten()
            .filter_map(|day| {
                let date = day.get("date")?.as_str()?.to_string();
                if date.is_empty() {
                    return None;
                }
                let count = day
                    .get("contributionCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
                let level = contribution_level_to_u8(
                    day.get("contributionLevel")
                        .and_then(|v| v.as_str())
                        .unwrap_or("NONE"),
                );
                Some(GithubContributionDay { date, count, level })
            })
            .collect();

        days.sort_by(|a, b| a.date.cmp(&b.date));
        if days.len() > USER_CARD_CONTRIBUTION_DAYS {
            days = days
                .into_iter()
                .rev()
                .take(USER_CARD_CONTRIBUTION_DAYS)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
        }

        Ok(GithubUserCard {
            login: resolved_login,
            name,
            avatar_url,
            total_contributions,
            contributions: days,
        })
    }

    /// Fetch REST core / Search / GraphQL rate limits for the local `gh` auth token.
    ///
    /// Uses `GET /rate_limit`, which does not consume REST quota.
    pub async fn get_rate_limit(&self) -> Result<GithubRateLimit, EngineError> {
        let output = self.run_gh(&["api", "rate_limit"]).await?;
        parse_rate_limit_value(&output)
    }

    /// Extract (owner, repo) from a remote URL
    pub fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
        RE_HTTPS
            .captures(remote_url)
            .or_else(|| RE_SSH.captures(remote_url))
            .map(|c| {
                let owner = c[1].to_string();
                // Prefer strip_suffix so dotted names like `0x3f4.run` stay intact
                // (trim_end_matches would wrongly treat ".git" as a char set).
                let repo = c[2]
                    .trim_end_matches('/')
                    .strip_suffix(".git")
                    .unwrap_or_else(|| c[2].trim_end_matches('/'))
                    .to_string();
                (owner, repo)
            })
    }

    pub fn parse_issue_url(issue_url: &str) -> Option<(String, String, u64)> {
        let captures = RE_ISSUE_URL.captures(issue_url.trim())?;
        let owner = captures.get(1)?.as_str().to_string();
        let repo = captures.get(2)?.as_str().to_string();
        let number = captures.get(3)?.as_str().parse::<u64>().ok()?;
        Some((owner, repo, number))
    }

    pub fn parse_pr_url(pr_url: &str) -> Option<(String, String, u64)> {
        let captures = RE_PR_URL.captures(pr_url.trim())?;
        let owner = captures.get(1)?.as_str().to_string();
        let repo = captures.get(2)?.as_str().to_string();
        let number = captures.get(3)?.as_str().parse::<u64>().ok()?;
        Some((owner, repo, number))
    }

    pub async fn list_prs(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubPullRequest>, EngineError> {
        match self.list_prs_via_gh(owner, repo, state, limit).await {
            Ok(prs) => Ok(prs),
            Err(gh_error) => {
                tracing::warn!(
                    owner,
                    repo,
                    state,
                    limit,
                    "gh pr list failed, falling back to GitHub API: {}",
                    gh_error
                );
                self.list_prs_via_api(owner, repo, state, limit).await
            }
        }
    }

    pub async fn get_pr(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubPullRequest, EngineError> {
        match self.get_pr_via_gh(owner, repo, number).await {
            Ok(pr) => Ok(pr),
            Err(gh_error) => {
                tracing::warn!(
                    owner,
                    repo,
                    number,
                    "gh pr view failed, falling back to GitHub API: {}",
                    gh_error
                );
                self.get_pr_via_api(owner, repo, number).await
            }
        }
    }

    async fn list_prs_via_gh(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubPullRequest>, EngineError> {
        let repo_arg = format!("{owner}/{repo}");
        let limit_value = limit.to_string();
        let args = vec![
            "pr",
            "list",
            "--repo",
            &repo_arg,
            "--state",
            state,
            "--limit",
            &limit_value,
            "--json",
            "number,title,body,url,state,headRefName,baseRefName,isDraft,labels,createdAt,updatedAt,author,assignees",
        ];
        let output = self.run_gh(&args).await?;
        parse_pr_list_value_gh(owner, repo, output)
    }

    async fn get_pr_via_gh(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubPullRequest, EngineError> {
        let repo_arg = format!("{owner}/{repo}");
        let pr_number = number.to_string();
        let args = vec![
            "pr",
            "view",
            &pr_number,
            "--repo",
            &repo_arg,
            "--json",
            "number,title,body,url,state,headRefName,baseRefName,isDraft,labels,createdAt,updatedAt,author,assignees",
        ];
        let output = self.run_gh(&args).await?;
        parse_pr_value_gh(owner, repo, &output)
    }

    async fn list_prs_via_api(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubPullRequest>, EngineError> {
        let endpoint = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls?state={state}&per_page={limit}&sort=updated&direction=desc"
        );
        let output = self.fetch_api_json(&endpoint).await?;
        parse_pr_list_value_api(owner, repo, output)
    }

    async fn get_pr_via_api(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubPullRequest, EngineError> {
        let endpoint = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{number}");
        let output = self.fetch_api_json(&endpoint).await?;
        parse_pr_value_api(owner, repo, &output)
    }

    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        options: GithubIssueListOptions<'_>,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        match self.list_issues_via_gh(owner, repo, options).await {
            Ok(issues) => Ok(issues),
            Err(gh_error) => {
                tracing::warn!(
                    owner,
                    repo,
                    state = options.state,
                    limit = options.limit,
                    "gh issue list failed, falling back to GitHub API: {}",
                    gh_error
                );
                self.list_issues_via_api(owner, repo, options).await
            }
        }
        .map(|mut issues| {
            sort_issues(&mut issues, options.sort, options.direction);
            issues
        })
    }

    pub async fn get_issue(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubIssue, EngineError> {
        match self.get_issue_via_gh(owner, repo, number).await {
            Ok(issue) => Ok(issue),
            Err(gh_error) => {
                tracing::warn!(
                    owner,
                    repo,
                    number,
                    "gh issue view failed, falling back to GitHub API: {}",
                    gh_error
                );
                self.get_issue_via_api(owner, repo, number).await
            }
        }
    }

    async fn list_issues_via_gh(
        &self,
        owner: &str,
        repo: &str,
        options: GithubIssueListOptions<'_>,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        let repo_arg = format!("{owner}/{repo}");
        let limit_value = options.limit.to_string();
        let mut args = vec![
            "issue",
            "list",
            "--repo",
            &repo_arg,
            "--state",
            options.state,
            "--limit",
            &limit_value,
            "--json",
            "number,title,body,url,state,createdAt,updatedAt,comments,labels,assignees,author",
        ];
        if let Some(search_query) = options.search.filter(|value| !value.trim().is_empty()) {
            args.push("--search");
            args.push(search_query);
        }
        let output = self.run_gh(&args).await?;
        parse_issue_list_value(owner, repo, output)
    }

    async fn get_issue_via_gh(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubIssue, EngineError> {
        let repo_arg = format!("{owner}/{repo}");
        let issue_number = number.to_string();
        let args = vec![
            "issue",
            "view",
            &issue_number,
            "--repo",
            &repo_arg,
            "--json",
            "number,title,body,url,state,createdAt,updatedAt,comments,labels,assignees,author",
        ];
        let output = self.run_gh(&args).await?;
        parse_issue_value(owner, repo, &output)
    }

    async fn list_issues_via_api(
        &self,
        owner: &str,
        repo: &str,
        options: GithubIssueListOptions<'_>,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        let mut url = reqwest::Url::parse(&format!(
            "https://api.github.com/repos/{owner}/{repo}/issues"
        ))
        .map_err(|e| EngineError::Processing(format!("Invalid GitHub API URL: {e}")))?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("state", options.state);
            pairs.append_pair("per_page", &options.limit.to_string());
            pairs.append_pair(
                "sort",
                if options.sort == "updated" {
                    "updated"
                } else {
                    "created"
                },
            );
            pairs.append_pair(
                "direction",
                if options.direction == "asc" {
                    "asc"
                } else {
                    "desc"
                },
            );
        }
        let endpoint = url.to_string();
        let output = self.fetch_api_json(&endpoint).await?;
        let mut issues = parse_issue_list_value(owner, repo, output)?;
        if let Some(search_query) = options
            .search
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let query = search_query.to_lowercase();
            issues.retain(|issue| {
                issue.title.to_lowercase().contains(&query)
                    || issue.number.to_string().contains(&query)
                    || issue
                        .body
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(&query)
            });
        }
        Ok(issues)
    }

    async fn get_issue_via_api(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GithubIssue, EngineError> {
        let endpoint = format!("https://api.github.com/repos/{owner}/{repo}/issues/{number}");
        let output = self.fetch_api_json(&endpoint).await?;
        parse_issue_value(owner, repo, &output)
    }

    /// Multi-repo issue/PR search via GitHub Search API.
    /// Prefer this over per-repo fan-out for Task surfaces.
    /// When the `q` would exceed GitHub's ~256-char limit, repos are batched
    /// and results merged (sorted by `updated_at` desc).
    pub async fn search_items(
        &self,
        options: GithubSearchOptions<'_>,
    ) -> Result<GithubSearchPage, EngineError> {
        if options.repos.is_empty() {
            return Ok(GithubSearchPage {
                items: vec![],
                has_more: false,
                total_count: 0,
            });
        }

        let batches = partition_repos_for_search_query(&options);
        let mut page = if batches.len() == 1 {
            let batch_repos = batches.into_iter().next().unwrap_or_default();
            self.search_items_single(&GithubSearchOptions {
                kind: options.kind,
                state: options.state,
                repos: &batch_repos,
                assignees: options.assignees,
                labels: options.labels,
                query: options.query,
                page: options.page,
                per_page: options.per_page,
            })
            .await?
        } else {
            // Multi-batch: fetch enough from each batch to fill the requested page window,
            // then merge/sort and slice. has_more is true if any batch still has more.
            let mut merged: Vec<GithubSearchItem> = Vec::new();
            let mut any_has_more = false;
            let mut total_count = 0u64;
            let fetch_limit = options
                .page
                .saturating_mul(options.per_page)
                .max(options.per_page);
            for batch_repos in &batches {
                let batch_page = self
                    .search_items_single(&GithubSearchOptions {
                        kind: options.kind,
                        state: options.state,
                        repos: batch_repos,
                        assignees: options.assignees,
                        labels: options.labels,
                        query: options.query,
                        // Always take page 1 with a larger per_page so merge covers the window.
                        page: 1,
                        per_page: fetch_limit.clamp(1, 100),
                    })
                    .await?;
                any_has_more = any_has_more
                    || batch_page.has_more
                    || batch_page.items.len() as u32 >= fetch_limit;
                total_count = total_count.saturating_add(batch_page.total_count);
                merged.extend(batch_page.items);
            }
            sort_search_items_for_merge(&mut merged, options.query);
            let start = (options.page.saturating_sub(1)).saturating_mul(options.per_page) as usize;
            let per_page = options.per_page as usize;
            let items: Vec<GithubSearchItem> =
                merged.into_iter().skip(start).take(per_page).collect();
            GithubSearchPage {
                items,
                has_more: any_has_more || (start + per_page) < total_count as usize,
                total_count,
            }
        };

        // Enrich only the final page (comments total + CI) so multi-batch merge stays cheap.
        self.enrich_search_items(&mut page.items).await;
        Ok(page)
    }

    async fn search_items_single(
        &self,
        options: &GithubSearchOptions<'_>,
    ) -> Result<GithubSearchPage, EngineError> {
        match self.search_items_via_gh(options).await {
            Ok(page) => {
                // Harden: `gh search` can succeed with `[]` (exit 0) for multi-repo
                // queries that freeform/CLI mishandles. Fall back to REST once when
                // page 1 is empty across 2+ repos — REST empty stays empty (cheap).
                if page.items.is_empty()
                    && page.total_count == 0
                    && options.page <= 1
                    && options.repos.len() > 1
                {
                    tracing::warn!(
                        kind = options.kind.as_str(),
                        repos = options.repos.len(),
                        "gh search returned empty multi-repo page; falling back to GitHub Search API"
                    );
                    match self.search_items_via_api(options).await {
                        Ok(api_page) => return Ok(api_page),
                        Err(api_error) => {
                            tracing::warn!(
                                kind = options.kind.as_str(),
                                "GitHub Search API fallback also failed: {}",
                                api_error
                            );
                            return Ok(page);
                        }
                    }
                }
                Ok(page)
            }
            Err(gh_error) => {
                tracing::warn!(
                    kind = options.kind.as_str(),
                    repos = options.repos.len(),
                    "gh search failed, falling back to GitHub Search API: {}",
                    gh_error
                );
                self.search_items_via_api(options).await
            }
        }
    }

    /// Align list rows with GitHub web: comment totals, CI, linked issue↔PR refs.
    /// Search API / `gh search` only expose conversation-level `commentsCount`.
    async fn enrich_search_items(&self, items: &mut [GithubSearchItem]) {
        enum EnrichResult {
            Pr(usize, PrListEnrichment),
            Issue(usize, IssueListEnrichment),
        }

        let mut handles = Vec::new();
        for (idx, item) in items.iter().enumerate() {
            let owner = item.owner.clone();
            let repo = item.repo.clone();
            let number = item.number;
            if item.kind == "pr" {
                handles.push(tokio::spawn(async move {
                    let engine = GithubEngine;
                    let enriched = engine.fetch_pr_list_enrichment(&owner, &repo, number).await;
                    EnrichResult::Pr(idx, enriched)
                }));
            } else if item.kind == "issue" {
                handles.push(tokio::spawn(async move {
                    let engine = GithubEngine;
                    let enriched = engine
                        .fetch_issue_list_enrichment(&owner, &repo, number)
                        .await;
                    EnrichResult::Issue(idx, enriched)
                }));
            }
        }

        for handle in handles {
            let Ok(result) = handle.await else {
                continue;
            };
            match result {
                EnrichResult::Pr(idx, enrich) => {
                    if let Some(item) = items.get_mut(idx) {
                        if let Some(count) = enrich.total_comments {
                            item.comments_count = count;
                        }
                        item.status_checks = enrich.checks;
                        if let Some(head) = enrich.head_ref {
                            item.head_ref = Some(head);
                        }
                        if let Some(base) = enrich.base_ref {
                            item.base_ref = Some(base);
                        }
                        if let Some(state) = enrich.state {
                            item.state = state;
                        }
                        item.linked_refs = enrich.linked_refs;
                    }
                }
                EnrichResult::Issue(idx, enrich) => {
                    if let Some(item) = items.get_mut(idx) {
                        item.linked_refs = enrich.linked_refs;
                    }
                }
            }
        }
    }

    /// PR list enrichment: web-accurate comment total + status checks + branch refs + merge state.
    async fn fetch_pr_list_enrichment(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> PrListEnrichment {
        let num = number.to_string();
        let repo_arg = format!("{owner}/{repo}");

        // GraphQL totalCommentsCount matches the number on github.com PR lists.
        let owner_esc = owner.replace('\\', "\\\\").replace('"', "\\\"");
        let repo_esc = repo.replace('\\', "\\\\").replace('"', "\\\"");
        let gql = format!(
            "query{{repository(owner:\"{owner_esc}\",name:\"{repo_esc}\"){{pullRequest(number:{number}){{totalCommentsCount state merged}}}}}}"
        );
        let query_arg = format!("query={gql}");

        // Keep arg arrays alive across the join (run_gh takes &[&str]).
        // headRefName is available on `pr view` (not on `gh search prs`).
        let view_args = [
            "pr",
            "view",
            num.as_str(),
            "--repo",
            repo_arg.as_str(),
            "--json",
            // closingIssuesReferences = issues this PR links/closes (Task "Linked" column).
            "statusCheckRollup,headRefName,baseRefName,state,mergedAt,closingIssuesReferences",
        ];
        let comments_args = ["api", "graphql", "-f", query_arg.as_str()];

        let (view_res, comments_res) =
            tokio::join!(self.run_gh(&view_args), self.run_gh(&comments_args),);

        let mut out = PrListEnrichment::default();

        if let Ok(view) = view_res {
            out.checks =
                parse_status_checks_value(view.get("statusCheckRollup")).unwrap_or_default();
            out.head_ref = view
                .get("headRefName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            out.base_ref = view
                .get("baseRefName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            // Prefer explicit mergedAt over state string from pr view.
            let merged_at = view
                .get("mergedAt")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty());
            let view_state = view
                .get("state")
                .and_then(|v| v.as_str())
                .map(|s| s.to_ascii_lowercase());
            out.state = if merged_at.is_some() || view_state.as_deref() == Some("merged") {
                Some("merged".to_string())
            } else {
                view_state
            };
            out.linked_refs = parse_closing_issues_references(view.get("closingIssuesReferences"));
        }

        if let Ok(gql) = comments_res {
            if let Some(pr) = gql.pointer("/data/repository/pullRequest") {
                out.total_comments = pr
                    .get("totalCommentsCount")
                    .and_then(|c| c.as_u64())
                    .or(out.total_comments);
                if out.state.is_none() {
                    let merged = pr.get("merged").and_then(|v| v.as_bool()).unwrap_or(false);
                    let gql_state = pr
                        .get("state")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_ascii_lowercase());
                    out.state = if merged || gql_state.as_deref() == Some("merged") {
                        Some("merged".to_string())
                    } else {
                        // GraphQL uses MERGED | OPEN | CLOSED
                        gql_state.map(|s| {
                            if s == "merged" {
                                "merged".to_string()
                            } else if s == "closed" {
                                "closed".to_string()
                            } else {
                                "open".to_string()
                            }
                        })
                    };
                }
            }
        }

        out
    }

    /// Issue list enrichment: linked PRs (closed-by + cross-referenced).
    async fn fetch_issue_list_enrichment(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> IssueListEnrichment {
        let owner_esc = owner.replace('\\', "\\\\").replace('"', "\\\"");
        let repo_esc = repo.replace('\\', "\\\\").replace('"', "\\\"");
        // closedByPullRequestsReferences covers PRs that close this issue;
        // CROSS_REFERENCED_EVENT catches PRs that mention the issue in body/timeline.
        // Concatenate (not format!) so GraphQL braces stay literal.
        let gql = [
            "query{repository(owner:\"",
            owner_esc.as_str(),
            "\",name:\"",
            repo_esc.as_str(),
            "\"){issue(number:",
            &number.to_string(),
            "){closedByPullRequestsReferences(first:20){nodes{number title state url}}\
timelineItems(first:50,itemTypes:[CROSS_REFERENCED_EVENT]){nodes{\
... on CrossReferencedEvent{source{... on PullRequest{number title state url}}}}}}}}",
        ]
        .concat();
        let query_arg = format!("query={gql}");
        let Ok(gql_res) = self
            .run_gh(&["api", "graphql", "-f", query_arg.as_str()])
            .await
        else {
            return IssueListEnrichment::default();
        };
        let issue = match gql_res.pointer("/data/repository/issue") {
            Some(v) => v,
            None => return IssueListEnrichment::default(),
        };

        let mut by_number: std::collections::BTreeMap<u64, GithubLinkedRef> =
            std::collections::BTreeMap::new();

        if let Some(nodes) = issue
            .pointer("/closedByPullRequestsReferences/nodes")
            .and_then(|v| v.as_array())
        {
            for node in nodes {
                if let Some(r) = parse_linked_pr_node(node) {
                    by_number.insert(r.number, r);
                }
            }
        }
        if let Some(nodes) = issue
            .pointer("/timelineItems/nodes")
            .and_then(|v| v.as_array())
        {
            for node in nodes {
                if let Some(source) = node.get("source") {
                    if let Some(r) = parse_linked_pr_node(source) {
                        by_number.entry(r.number).or_insert(r);
                    }
                }
            }
        }

        IssueListEnrichment {
            linked_refs: by_number.into_values().collect(),
        }
    }

    async fn search_items_via_gh(
        &self,
        options: &GithubSearchOptions<'_>,
    ) -> Result<GithubSearchPage, EngineError> {
        // `sort:` in the freeform q string is NOT how GitHub Search sorts results.
        // gh CLI requires `--sort` + `--order` flags (REST uses query params).
        let sort = parse_search_sort(options.query);
        // Scope repos via `--repo` flags — NOT freeform `repo:owner/name`.
        // Freeform `repo:` with dotted names (e.g. `0x3f4.run`) makes `gh search`
        // return `[]` exit 0 for the whole multi-repo query (no REST fallback).
        let query = build_search_query(&GithubSearchOptions {
            kind: options.kind,
            state: options.state,
            repos: &[],
            assignees: options.assignees,
            labels: options.labels,
            query: options.query,
            page: options.page,
            per_page: options.per_page,
        });
        let limit = (options.page.saturating_mul(options.per_page)).clamp(1, 100);
        let limit_str = limit.to_string();
        let kind = match options.kind {
            GithubSearchKind::Issue => "issues",
            GithubSearchKind::PullRequest => "prs",
        };

        // Build argv with owned strings so sort flags stay alive for run_gh.
        let mut args: Vec<String> = vec!["search".into(), kind.into(), "--limit".into(), limit_str];
        for repo in options.repos {
            let owner = repo.owner.trim();
            let name = repo.repo.trim();
            if owner.is_empty() || name.is_empty() {
                continue;
            }
            args.push("--repo".into());
            args.push(format!("{owner}/{name}"));
        }
        if sort.field != "best-match" {
            args.push("--sort".into());
            args.push(sort.field.into());
            args.push("--order".into());
            args.push(sort.order.into());
        }
        args.push("--json".into());
        // Note: gh search prs does NOT support headRefName/baseRefName (only pr view does).
        // Including them makes `gh search` fail and fall back to REST (state always open/closed).
        // `isDraft` is PR-only — gh search issues rejects unknown fields and falls back.
        let json_fields = match options.kind {
            GithubSearchKind::PullRequest => {
                "number,title,body,url,state,createdAt,updatedAt,commentsCount,labels,assignees,author,repository,isDraft"
            }
            GithubSearchKind::Issue => {
                "number,title,body,url,state,createdAt,updatedAt,commentsCount,labels,assignees,author,repository"
            }
        };
        args.push(json_fields.into());
        // CRITICAL: pass each search term as its own argv.
        // `gh search prs "is:pr is:open"` (one argv with spaces) succeeds with `[]`
        // and exit 0 — so we never fall back to REST and the UI shows empty lists.
        for token in split_search_query_args(&query) {
            args.push(token);
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = self.run_gh(&arg_refs).await?;
        let mut all = parse_search_list_value(output, options.kind)?;
        // gh search returns a flat top-N list; slice to the requested page.
        let start = (options.page.saturating_sub(1)).saturating_mul(options.per_page) as usize;
        let per_page = options.per_page as usize;
        let total_fetched = all.len();
        let items: Vec<GithubSearchItem> = all
            .drain(start.min(total_fetched)..)
            .take(per_page)
            .collect();
        let has_more = total_fetched == limit as usize;
        Ok(GithubSearchPage {
            items,
            has_more,
            total_count: total_fetched as u64,
        })
    }

    async fn search_items_via_api(
        &self,
        options: &GithubSearchOptions<'_>,
    ) -> Result<GithubSearchPage, EngineError> {
        let sort = parse_search_sort(options.query);
        let query = build_search_query(options);
        let mut url = reqwest::Url::parse("https://api.github.com/search/issues")
            .map_err(|e| EngineError::Processing(format!("Invalid GitHub Search URL: {e}")))?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("q", &query);
            // Best match = omit sort/order (GitHub relevance).
            if sort.field != "best-match" {
                pairs.append_pair("sort", sort.field);
                pairs.append_pair("order", sort.order);
            }
            pairs.append_pair("page", &options.page.max(1).to_string());
            pairs.append_pair("per_page", &options.per_page.clamp(1, 100).to_string());
        }
        let output = self.fetch_api_json(url.as_str()).await?;
        let total_count = output
            .get("total_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let items_raw = output
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut items = Vec::with_capacity(items_raw.len());
        for item in items_raw {
            if let Some(parsed) = parse_search_item_api(&item, options.kind) {
                items.push(parsed);
            }
        }
        let has_more = (options.page.saturating_mul(options.per_page) as u64) < total_count;
        Ok(GithubSearchPage {
            items,
            has_more,
            total_count,
        })
    }

    async fn fetch_api_json(&self, url: &str) -> Result<serde_json::Value, EngineError> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| EngineError::Processing(format!("Failed to build HTTP client: {e}")))?;

        let mut request = client
            .get(url)
            .header(USER_AGENT, "atmos")
            .header(ACCEPT, "application/vnd.github+json");

        if let Ok(token) = std::env::var("GH_TOKEN").or_else(|_| std::env::var("GITHUB_TOKEN")) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                request = request.header(AUTHORIZATION, format!("Bearer {trimmed}"));
            }
        }

        let response = request
            .send()
            .await
            .map_err(|e| EngineError::Processing(format!("GitHub API request failed: {e}")))?;
        let status = response.status();
        let body = response.text().await.map_err(|e| {
            EngineError::Processing(format!("Failed to read GitHub API response: {e}"))
        })?;

        if !status.is_success() {
            return Err(EngineError::Processing(format!(
                "GitHub API returned {}: {}",
                status, body
            )));
        }

        serde_json::from_str(&body)
            .map_err(|e| EngineError::Processing(format!("Invalid GitHub API JSON: {e}")))
    }
}

fn parse_issue_list_value(
    owner: &str,
    repo: &str,
    value: serde_json::Value,
) -> Result<Vec<GithubIssue>, EngineError> {
    let array = value.as_array().ok_or_else(|| {
        EngineError::Processing("GitHub issue list response was not an array".to_string())
    })?;

    array
        .iter()
        .filter(|item| item.get("pull_request").is_none())
        .map(|item| parse_issue_value(owner, repo, item))
        .collect()
}

fn parse_issue_value(
    owner: &str,
    repo: &str,
    value: &serde_json::Value,
) -> Result<GithubIssue, EngineError> {
    let number = value
        .get("number")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            EngineError::Processing("GitHub issue response missing number".to_string())
        })?;
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub issue response missing title".to_string()))?
        .to_string();
    let url = value
        .get("html_url")
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub issue response missing url".to_string()))?
        .to_string();
    let state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_string();
    let created_at = value
        .get("createdAt")
        .or_else(|| value.get("created_at"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let updated_at = value
        .get("updatedAt")
        .or_else(|| value.get("updated_at"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let comments_count = value
        .get("comments")
        .map(|comments| {
            comments
                .as_u64()
                .or_else(|| comments.as_array().map(|items| items.len() as u64))
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let body = value
        .get("body")
        .and_then(|v| v.as_str())
        .map(|text| text.to_string())
        .filter(|text| !text.trim().is_empty());

    let labels = value
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|label| {
                    let name = label.get("name").and_then(|v| v.as_str())?;
                    Some(GithubIssueLabel {
                        name: name.to_string(),
                        color: label
                            .get("color")
                            .and_then(|v| v.as_str())
                            .map(|text| text.to_string()),
                        description: label
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|text| text.to_string()),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let assignees = value
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(parse_issue_user).collect())
        .unwrap_or_default();
    // gh CLI uses `author`; REST /issues uses `user`.
    let author = value
        .get("author")
        .or_else(|| value.get("user"))
        .and_then(parse_issue_user);

    Ok(GithubIssue {
        owner: owner.to_string(),
        repo: repo.to_string(),
        number,
        title,
        body,
        url,
        state,
        created_at,
        updated_at,
        comments_count,
        labels,
        author,
        assignees,
    })
}

fn parse_issue_user(value: &serde_json::Value) -> Option<GithubIssueAssignee> {
    let login = value.get("login").and_then(|v| v.as_str())?;
    Some(GithubIssueAssignee {
        login: login.to_string(),
        avatar_url: value
            .get("avatar_url")
            .or_else(|| value.get("avatarUrl"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

fn sort_issues(issues: &mut [GithubIssue], sort: &str, direction: &str) {
    issues.sort_by(|a, b| {
        let left = if sort == "updated" {
            &a.updated_at
        } else {
            &a.created_at
        };
        let right = if sort == "updated" {
            &b.updated_at
        } else {
            &b.created_at
        };
        if direction == "asc" {
            left.cmp(right)
        } else {
            right.cmp(left)
        }
    });
}

fn parse_pr_list_value_gh(
    owner: &str,
    repo: &str,
    value: serde_json::Value,
) -> Result<Vec<GithubPullRequest>, EngineError> {
    let array = value.as_array().ok_or_else(|| {
        EngineError::Processing("GitHub PR list response was not an array".to_string())
    })?;
    array
        .iter()
        .map(|item| parse_pr_value_gh(owner, repo, item))
        .collect()
}

fn parse_pr_value_gh(
    owner: &str,
    repo: &str,
    value: &serde_json::Value,
) -> Result<GithubPullRequest, EngineError> {
    let number = value
        .get("number")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing number".to_string()))?;
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing title".to_string()))?
        .to_string();
    let url = value
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing url".to_string()))?
        .to_string();
    let state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("OPEN")
        .to_lowercase();
    let body = value
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());
    let head_ref = value
        .get("headRefName")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            EngineError::Processing("GitHub PR response missing headRefName".to_string())
        })?
        .to_string();
    let base_ref = value
        .get("baseRefName")
        .and_then(|v| v.as_str())
        .unwrap_or("main")
        .to_string();
    let is_draft = value
        .get("isDraft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let labels = value
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|label| {
                    let name = label.get("name").and_then(|v| v.as_str())?;
                    Some(GithubIssueLabel {
                        name: name.to_string(),
                        color: label
                            .get("color")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                        description: label
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let created_at = value
        .get("createdAt")
        .or_else(|| value.get("created_at"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let updated_at = value
        .get("updatedAt")
        .or_else(|| value.get("updated_at"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let author = value
        .get("author")
        .or_else(|| value.get("user"))
        .and_then(parse_issue_user);
    let assignees = value
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(parse_issue_user).collect())
        .unwrap_or_default();
    Ok(GithubPullRequest {
        owner: owner.to_string(),
        repo: repo.to_string(),
        number,
        title,
        body,
        url,
        state,
        head_ref,
        base_ref,
        is_draft,
        labels,
        created_at,
        updated_at,
        author,
        assignees,
    })
}

fn parse_pr_list_value_api(
    owner: &str,
    repo: &str,
    value: serde_json::Value,
) -> Result<Vec<GithubPullRequest>, EngineError> {
    let array = value.as_array().ok_or_else(|| {
        EngineError::Processing("GitHub PR list response was not an array".to_string())
    })?;
    array
        .iter()
        .map(|item| parse_pr_value_api(owner, repo, item))
        .collect()
}

fn parse_pr_value_api(
    owner: &str,
    repo: &str,
    value: &serde_json::Value,
) -> Result<GithubPullRequest, EngineError> {
    let number = value
        .get("number")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing number".to_string()))?;
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing title".to_string()))?
        .to_string();
    let url = value
        .get("html_url")
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing url".to_string()))?
        .to_string();
    let state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_string();
    let body = value
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());
    let head_ref = value
        .get("head")
        .and_then(|v| v.get("ref"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing head.ref".to_string()))?
        .to_string();
    let base_ref = value
        .get("base")
        .and_then(|v| v.get("ref"))
        .and_then(|v| v.as_str())
        .unwrap_or("main")
        .to_string();
    let is_draft = value
        .get("draft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let labels = value
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|label| {
                    let name = label.get("name").and_then(|v| v.as_str())?;
                    Some(GithubIssueLabel {
                        name: name.to_string(),
                        color: label
                            .get("color")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                        description: label
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let created_at = value
        .get("created_at")
        .or_else(|| value.get("createdAt"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let updated_at = value
        .get("updated_at")
        .or_else(|| value.get("updatedAt"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let author = value
        .get("user")
        .or_else(|| value.get("author"))
        .and_then(parse_issue_user);
    let assignees = value
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(parse_issue_user).collect())
        .unwrap_or_default();
    Ok(GithubPullRequest {
        owner: owner.to_string(),
        repo: repo.to_string(),
        number,
        title,
        body,
        url,
        state,
        head_ref,
        base_ref,
        is_draft,
        labels,
        created_at,
        updated_at,
        author,
        assignees,
    })
}

fn parse_rate_limit_resource(
    resources: &serde_json::Value,
    key: &str,
) -> Result<GithubRateLimitResource, EngineError> {
    let node = resources.get(key).ok_or_else(|| {
        EngineError::Processing(format!("GitHub rate_limit missing resources.{key}"))
    })?;
    let limit = node.get("limit").and_then(|v| v.as_u64()).ok_or_else(|| {
        EngineError::Processing(format!("GitHub rate_limit resources.{key}.limit missing"))
    })?;
    let remaining = node
        .get("remaining")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            EngineError::Processing(format!(
                "GitHub rate_limit resources.{key}.remaining missing"
            ))
        })?;
    let reset = node.get("reset").and_then(|v| v.as_u64()).ok_or_else(|| {
        EngineError::Processing(format!("GitHub rate_limit resources.{key}.reset missing"))
    })?;
    let used = node
        .get("used")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| limit.saturating_sub(remaining));
    Ok(GithubRateLimitResource {
        limit,
        used,
        remaining,
        reset,
    })
}

fn parse_rate_limit_value(value: &serde_json::Value) -> Result<GithubRateLimit, EngineError> {
    let resources = value.get("resources").ok_or_else(|| {
        EngineError::Processing("GitHub rate_limit response missing resources".to_string())
    })?;
    Ok(GithubRateLimit {
        core: parse_rate_limit_resource(resources, "core")?,
        search: parse_rate_limit_resource(resources, "search")?,
        graphql: parse_rate_limit_resource(resources, "graphql")?,
    })
}

fn normalize_github_login(login: &str) -> Option<String> {
    let trimmed = login.trim().trim_start_matches('@');
    if trimmed.is_empty() {
        return None;
    }
    // GitHub usernames: alphanumerics and hyphens; bots often end with [bot].
    let cleaned = trimmed.trim_end_matches("[bot]").trim_end_matches("[Bot]");
    if cleaned.is_empty() {
        return None;
    }
    let ok = cleaned
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !ok {
        return None;
    }
    Some(cleaned.to_string())
}

fn contribution_level_to_u8(level: &str) -> u8 {
    match level {
        "NONE" => 0,
        "FIRST_QUARTILE" => 1,
        "SECOND_QUARTILE" => 2,
        "THIRD_QUARTILE" => 3,
        "FOURTH_QUARTILE" => 4,
        _ => 0,
    }
}

/// GitHub Search `q` is limited to ~256 chars. Batch repos so each query fits.
fn partition_repos_for_search_query(
    options: &GithubSearchOptions<'_>,
) -> Vec<Vec<GithubSearchRepo>> {
    const MAX_Q_LEN: usize = 240; // leave headroom under 256
    let base = build_search_query(&GithubSearchOptions {
        kind: options.kind,
        state: options.state,
        repos: &[],
        assignees: options.assignees,
        labels: options.labels,
        query: options.query,
        page: options.page,
        per_page: options.per_page,
    });
    let base_len = base.len() + 1; // trailing space budget
    let mut batches: Vec<Vec<GithubSearchRepo>> = Vec::new();
    let mut current: Vec<GithubSearchRepo> = Vec::new();
    let mut current_len = base_len;

    for repo in options.repos {
        let token = format!("repo:{}/{} ", repo.owner.trim(), repo.repo.trim());
        let token_len = token.len();
        if !current.is_empty() && current_len + token_len > MAX_Q_LEN {
            batches.push(std::mem::take(&mut current));
            current_len = base_len;
        }
        // Always include at least one repo even if a single token is long.
        current.push(GithubSearchRepo {
            owner: repo.owner.clone(),
            repo: repo.repo.clone(),
        });
        current_len += token_len;
    }
    if !current.is_empty() {
        batches.push(current);
    }
    if batches.is_empty() {
        batches.push(Vec::new());
    }
    batches
}

fn quote_search_token(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed
        .chars()
        .any(|c| c.is_whitespace() || c == ':' || c == '"')
    {
        format!("\"{}\"", trimmed.replace('"', ""))
    } else {
        trimmed.to_string()
    }
}

fn freeform_has_token(freeform: &str, needle: &str) -> bool {
    freeform.split_whitespace().any(|part| {
        part.eq_ignore_ascii_case(needle)
            || part.to_ascii_lowercase().starts_with(&format!("{needle}:"))
    })
}

/// Parsed sort for GitHub Search API / `gh search --sort --order`.
/// (`sort:…` inside the freeform `q` string is ignored by the Search API.)
struct SearchSort {
    /// `updated` | `created` | `comments` | `best-match`
    field: &'static str,
    /// `asc` | `desc` (ignored for best-match)
    order: &'static str,
    /// Original freeform token e.g. `updated-asc` (for local multi-batch merge).
    token: &'static str,
}

fn parse_search_sort(query: Option<&str>) -> SearchSort {
    let free = query.unwrap_or("").to_ascii_lowercase();
    let token = free
        .split_whitespace()
        .find_map(|p| p.strip_prefix("sort:"))
        .unwrap_or("updated-desc");
    match token {
        "created-asc" => SearchSort {
            field: "created",
            order: "asc",
            token: "created-asc",
        },
        "created-desc" => SearchSort {
            field: "created",
            order: "desc",
            token: "created-desc",
        },
        "comments-asc" => SearchSort {
            field: "comments",
            order: "asc",
            token: "comments-asc",
        },
        "comments-desc" => SearchSort {
            field: "comments",
            order: "desc",
            token: "comments-desc",
        },
        "updated-asc" => SearchSort {
            field: "updated",
            order: "asc",
            token: "updated-asc",
        },
        "best-match" => SearchSort {
            field: "best-match",
            order: "desc",
            token: "best-match",
        },
        _ => SearchSort {
            field: "updated",
            order: "desc",
            token: "updated-desc",
        },
    }
}

/// Multi-batch merge sort — align with `sort:` in freeform when possible.
fn sort_search_items_for_merge(items: &mut [GithubSearchItem], query: Option<&str>) {
    let sort = parse_search_sort(query);
    if sort.token == "best-match" {
        return; // keep GitHub batch order
    }
    items.sort_by(|a, b| {
        let ord = match sort.field {
            "created" => {
                let a_t = a.created_at.as_deref().unwrap_or("");
                let b_t = b.created_at.as_deref().unwrap_or("");
                a_t.cmp(b_t)
            }
            "comments" => a.comments_count.cmp(&b.comments_count),
            _ => {
                let a_t = a.updated_at.as_deref().unwrap_or("");
                let b_t = b.updated_at.as_deref().unwrap_or("");
                a_t.cmp(b_t)
            }
        };
        if sort.order == "asc" {
            ord
        } else {
            ord.reverse()
        }
    });
}

/// Split a GitHub search `q` into separate argv tokens for `gh search`.
///
/// `gh search` joins multiple positional args with spaces. If the entire query
/// is passed as **one** argv that already contains spaces (e.g.
/// `"is:pr repo:owner/name"`), `gh` often returns an empty array with exit 0 —
/// which looks like "no results" and skips our REST fallback.
///
/// Keeps double-quoted segments together so `label:"bug fix"` stays one token.
fn split_search_query_args(query: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in query.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                cur.push(ch);
            }
            c if c.is_whitespace() && !in_quotes => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Build the Search `q` string. Sort is applied via API flags, not `sort:` in q.
fn build_search_query(options: &GithubSearchOptions<'_>) -> String {
    let freeform = options
        .query
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("");
    // Strip sort tokens — they are not valid Search qualifiers; use --sort/--order instead.
    let freeform_no_sort: String = freeform
        .split_whitespace()
        .filter(|p| !p.to_ascii_lowercase().starts_with("sort:"))
        .collect::<Vec<_>>()
        .join(" ");
    let free_lc = freeform_no_sort.to_ascii_lowercase();
    let mut parts: Vec<String> = Vec::new();

    let has_kind = free_lc.contains("is:issue")
        || free_lc.contains("is:pr")
        || free_lc.contains("is:pull-request")
        || free_lc.contains("type:issue")
        || free_lc.contains("type:pr");
    if !has_kind {
        match options.kind {
            GithubSearchKind::Issue => parts.push("is:issue".to_string()),
            GithubSearchKind::PullRequest => parts.push("is:pr".to_string()),
        }
    }

    let has_state = free_lc.contains("is:open")
        || free_lc.contains("is:closed")
        || free_lc.contains("is:merged")
        || free_lc.contains("is:unmerged");
    if !has_state {
        // `all` / empty → no state qualifier (open + closed + merged).
        let state = options.state.trim().to_ascii_lowercase();
        if state == "closed" {
            parts.push("is:closed".to_string());
        } else if state == "open" {
            parts.push("is:open".to_string());
        }
    }

    // Always scope to selected Atmos repos (multi-repo Task surface).
    for repo in options.repos {
        let owner = repo.owner.trim();
        let name = repo.repo.trim();
        if !owner.is_empty() && !name.is_empty() {
            parts.push(format!("repo:{owner}/{name}"));
        }
    }

    if !freeform_has_token(&freeform_no_sort, "assignee") {
        for login in options.assignees {
            let token = quote_search_token(login);
            if !token.is_empty() {
                parts.push(format!("assignee:{token}"));
            }
        }
    }
    if !freeform_has_token(&freeform_no_sort, "label") {
        for label in options.labels {
            let token = quote_search_token(label);
            if !token.is_empty() {
                parts.push(format!("label:{token}"));
            }
        }
    }

    if !freeform_no_sort.is_empty() {
        parts.push(freeform_no_sort);
    }
    parts.join(" ")
}

fn ensure_author_avatar(user: Option<GithubIssueAssignee>) -> Option<GithubIssueAssignee> {
    let mut user = user?;
    if user.avatar_url.as_ref().is_none_or(|u| u.trim().is_empty()) && !user.login.is_empty() {
        user.avatar_url = Some(format!(
            "https://github.com/{}.png?size=40",
            user.login.trim_start_matches('@')
        ));
    }
    Some(user)
}

fn parse_search_comments_count(value: &serde_json::Value) -> u64 {
    value
        .get("commentsCount")
        .or_else(|| value.get("comments_count"))
        .or_else(|| value.get("comments"))
        .map(|comments| {
            comments
                .as_u64()
                .or_else(|| comments.as_i64().map(|n| n.max(0) as u64))
                .or_else(|| comments.as_array().map(|items| items.len() as u64))
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

fn parse_status_checks_value(value: Option<&serde_json::Value>) -> Option<Vec<GithubStatusCheck>> {
    let value = value?;
    let array = value.as_array()?;
    let mut checks = Vec::with_capacity(array.len());
    for item in array {
        if !item.is_object() {
            continue;
        }
        checks.push(GithubStatusCheck {
            state: item
                .get("state")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            conclusion: item
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            status: item
                .get("status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            name: item
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            context: item
                .get("context")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            details_url: item
                .get("detailsUrl")
                .or_else(|| item.get("details_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            target_url: item
                .get("targetUrl")
                .or_else(|| item.get("target_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            workflow_name: item
                .get("workflowName")
                .or_else(|| item.get("workflow_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        });
    }
    Some(checks)
}

fn parse_search_owner_repo(value: &serde_json::Value) -> Option<(String, String)> {
    if let Some(full) = value
        .get("repository")
        .and_then(|r| r.get("nameWithOwner").or_else(|| r.get("full_name")))
        .and_then(|v| v.as_str())
    {
        let mut parts = full.splitn(2, '/');
        let owner = parts.next()?.to_string();
        let repo = parts.next()?.to_string();
        if !owner.is_empty() && !repo.is_empty() {
            return Some((owner, repo));
        }
    }
    if let Some(url) = value
        .get("html_url")
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
    {
        // https://github.com/owner/repo/issues/1 or /pull/1
        let re = Regex::new(r"github\.com/([^/]+)/([^/]+)/(?:issues|pull)/\d+").ok()?;
        if let Some(caps) = re.captures(url) {
            return Some((caps[1].to_string(), caps[2].to_string()));
        }
    }
    if let Some(repo_url) = value.get("repository_url").and_then(|v| v.as_str()) {
        // https://api.github.com/repos/owner/repo
        let re = Regex::new(r"repos/([^/]+)/([^/]+)$").ok()?;
        if let Some(caps) = re.captures(repo_url) {
            return Some((caps[1].to_string(), caps[2].to_string()));
        }
    }
    None
}

fn parse_search_labels(value: &serde_json::Value) -> Vec<GithubIssueLabel> {
    value
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|label| {
                    let name = label.get("name").and_then(|v| v.as_str())?;
                    Some(GithubIssueLabel {
                        name: name.to_string(),
                        color: label
                            .get("color")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                        description: label
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|t| t.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_search_list_value(
    value: serde_json::Value,
    kind: GithubSearchKind,
) -> Result<Vec<GithubSearchItem>, EngineError> {
    let array = value.as_array().ok_or_else(|| {
        EngineError::Processing("GitHub search response was not an array".to_string())
    })?;
    Ok(array
        .iter()
        .filter_map(|item| parse_search_item_gh(item, kind))
        .collect())
}

fn parse_search_item_gh(
    value: &serde_json::Value,
    kind: GithubSearchKind,
) -> Option<GithubSearchItem> {
    let (owner, repo) = parse_search_owner_repo(value)?;
    let number = value.get("number").and_then(|v| v.as_u64())?;
    let title = value.get("title").and_then(|v| v.as_str())?.to_string();
    let url = value
        .get("url")
        .or_else(|| value.get("html_url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // gh search prs returns state: open | closed | merged (REST only has open/closed).
    let mut state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_ascii_lowercase();
    if kind == GithubSearchKind::PullRequest && state == "merged" {
        state = "merged".to_string();
    }
    let body = value
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());
    let created_at = value
        .get("createdAt")
        .or_else(|| value.get("created_at"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let updated_at = value
        .get("updatedAt")
        .or_else(|| value.get("updated_at"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let author = ensure_author_avatar(
        value
            .get("author")
            .or_else(|| value.get("user"))
            .and_then(parse_issue_user),
    );
    let assignees = value
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(parse_issue_user)
                .filter_map(|u| ensure_author_avatar(Some(u)))
                .collect()
        })
        .unwrap_or_default();
    let is_draft = value
        .get("isDraft")
        .or_else(|| value.get("is_draft"))
        .or_else(|| value.get("draft"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let head_ref = value
        .get("headRefName")
        .or_else(|| value.get("head_ref"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let base_ref = value
        .get("baseRefName")
        .or_else(|| value.get("base_ref"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let comments_count = parse_search_comments_count(value);
    Some(GithubSearchItem {
        owner,
        repo,
        number,
        title,
        body,
        url,
        state,
        created_at,
        updated_at,
        comments_count,
        labels: parse_search_labels(value),
        author,
        assignees,
        is_draft,
        head_ref,
        base_ref,
        kind: kind.as_str().to_string(),
        status_checks: Vec::new(),
        linked_refs: Vec::new(),
    })
}

fn parse_search_item_api(
    value: &serde_json::Value,
    kind: GithubSearchKind,
) -> Option<GithubSearchItem> {
    // Search API mixes issues and PRs; filter by presence of pull_request field.
    let has_pr_field = value.get("pull_request").is_some();
    match kind {
        GithubSearchKind::Issue if has_pr_field => return None,
        GithubSearchKind::PullRequest if !has_pr_field => return None,
        _ => {}
    }
    let (owner, repo) = parse_search_owner_repo(value)?;
    let number = value.get("number").and_then(|v| v.as_u64())?;
    let title = value.get("title").and_then(|v| v.as_str())?.to_string();
    let url = value
        .get("html_url")
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // REST Search only returns open/closed; merged PRs still have state=closed.
    // Detect merge via pull_request.merged_at when present.
    let mut state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_ascii_lowercase();
    if kind == GithubSearchKind::PullRequest {
        let merged_at = value
            .pointer("/pull_request/merged_at")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if merged_at.is_some() || state == "merged" {
            state = "merged".to_string();
        }
    }
    let body = value
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());
    let created_at = value
        .get("created_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let updated_at = value
        .get("updated_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let author = ensure_author_avatar(value.get("user").and_then(parse_issue_user));
    let assignees = value
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(parse_issue_user)
                .filter_map(|u| ensure_author_avatar(Some(u)))
                .collect()
        })
        .unwrap_or_default();
    let is_draft = value
        .get("draft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let comments_count = parse_search_comments_count(value);
    Some(GithubSearchItem {
        owner,
        repo,
        number,
        title,
        body,
        url,
        state,
        created_at,
        updated_at,
        comments_count,
        labels: parse_search_labels(value),
        author,
        assignees,
        is_draft,
        head_ref: None,
        base_ref: None,
        kind: kind.as_str().to_string(),
        status_checks: Vec::new(),
        linked_refs: Vec::new(),
    })
}

fn parse_closing_issues_references(value: Option<&serde_json::Value>) -> Vec<GithubLinkedRef> {
    let Some(array) = value.and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in array {
        let Some(number) = item.get("number").and_then(|v| v.as_u64()) else {
            continue;
        };
        let state = item
            .get("state")
            .and_then(|v| v.as_str())
            .map(|s| s.to_ascii_lowercase());
        out.push(GithubLinkedRef {
            kind: "issue".to_string(),
            number,
            state,
            title: item
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            url: item
                .get("url")
                .or_else(|| item.get("html_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        });
    }
    out
}

fn parse_linked_pr_node(value: &serde_json::Value) -> Option<GithubLinkedRef> {
    let number = value.get("number").and_then(|v| v.as_u64())?;
    let mut state = value
        .get("state")
        .and_then(|v| v.as_str())
        .map(|s| s.to_ascii_lowercase());
    // GraphQL uses OPEN | CLOSED | MERGED
    if let Some(ref s) = state {
        if s == "merged" {
            state = Some("merged".to_string());
        } else if s == "closed" {
            state = Some("closed".to_string());
        } else if s == "open" {
            state = Some("open".to_string());
        }
    }
    Some(GithubLinkedRef {
        kind: "pr".to_string(),
        number,
        state,
        title: value
            .get("title")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        url: value
            .get("url")
            .or_else(|| value.get("html_url"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_search_query, contribution_level_to_u8, normalize_github_login,
        parse_rate_limit_value, split_search_query_args, GithubEngine, GithubSearchKind,
        GithubSearchOptions, GithubSearchRepo,
    };

    #[test]
    fn parse_issue_url_accepts_standard_urls() {
        let parsed = GithubEngine::parse_issue_url("https://github.com/AruNi-01/atmos/issues/40")
            .expect("url should parse");

        assert_eq!(parsed.0, "AruNi-01");
        assert_eq!(parsed.1, "atmos");
        assert_eq!(parsed.2, 40);
    }

    #[test]
    fn parse_issue_url_rejects_non_issue_urls() {
        assert!(
            GithubEngine::parse_issue_url("https://github.com/AruNi-01/atmos/pull/40").is_none()
        );
        assert!(GithubEngine::parse_issue_url("not-a-url").is_none());
    }

    #[test]
    fn normalize_github_login_strips_at_and_bot_suffix() {
        assert_eq!(
            normalize_github_login(" @octocat ").as_deref(),
            Some("octocat")
        );
        assert_eq!(
            normalize_github_login("dependabot[bot]").as_deref(),
            Some("dependabot")
        );
        assert_eq!(normalize_github_login(""), None);
        assert_eq!(normalize_github_login("bad login!"), None);
    }

    #[test]
    fn contribution_level_maps_quartiles() {
        assert_eq!(contribution_level_to_u8("NONE"), 0);
        assert_eq!(contribution_level_to_u8("FIRST_QUARTILE"), 1);
        assert_eq!(contribution_level_to_u8("FOURTH_QUARTILE"), 4);
        assert_eq!(contribution_level_to_u8("unknown"), 0);
    }

    #[test]
    fn parse_rate_limit_value_reads_core_search_graphql() {
        let value = serde_json::json!({
            "resources": {
                "core": { "limit": 5000, "used": 10, "remaining": 4990, "reset": 1_700_000_000 },
                "search": { "limit": 30, "remaining": 25, "reset": 1_700_000_100 },
                "graphql": { "limit": 5000, "used": 100, "remaining": 4900, "reset": 1_700_000_200 }
            }
        });
        let parsed = parse_rate_limit_value(&value).expect("parse");
        assert_eq!(parsed.core.used, 10);
        assert_eq!(parsed.core.remaining, 4990);
        // `used` is derived when GitHub omits it.
        assert_eq!(parsed.search.used, 5);
        assert_eq!(parsed.search.limit, 30);
        assert_eq!(parsed.graphql.used, 100);
        assert_eq!(parsed.graphql.reset, 1_700_000_200);
    }

    #[test]
    fn parse_github_remote_keeps_dots_in_repo_name() {
        assert_eq!(
            GithubEngine::parse_github_remote("https://github.com/AruNi-01/0x3f4.run"),
            Some(("AruNi-01".into(), "0x3f4.run".into()))
        );
        assert_eq!(
            GithubEngine::parse_github_remote("https://github.com/AruNi-01/0x3f4.run.git"),
            Some(("AruNi-01".into(), "0x3f4.run".into()))
        );
        assert_eq!(
            GithubEngine::parse_github_remote("git@github.com:AruNi-01/0x3f4.run.git"),
            Some(("AruNi-01".into(), "0x3f4.run".into()))
        );
        assert_eq!(
            GithubEngine::parse_github_remote("https://github.com/AruNi-01/atmos.git"),
            Some(("AruNi-01".into(), "atmos".into()))
        );
        assert_eq!(
            GithubEngine::parse_github_remote("git@github.com:AruNi-01/atmos.git"),
            Some(("AruNi-01".into(), "atmos".into()))
        );
    }

    #[test]
    fn split_search_query_args_splits_on_whitespace() {
        assert_eq!(
            split_search_query_args("is:pr repo:owner/name"),
            vec!["is:pr", "repo:owner/name"]
        );
        // State=all omits is:open/closed — must still split into multiple argv.
        assert_eq!(
            split_search_query_args("is:pr repo:a/b repo:c/d"),
            vec!["is:pr", "repo:a/b", "repo:c/d"]
        );
    }

    #[test]
    fn split_search_query_args_keeps_quoted_segments() {
        assert_eq!(
            split_search_query_args(r#"is:pr label:"bug fix" repo:o/r"#),
            vec!["is:pr", r#"label:"bug fix""#, "repo:o/r"]
        );
    }

    #[test]
    fn build_search_query_all_state_omits_is_open_closed() {
        let repos = [GithubSearchRepo {
            owner: "owner".into(),
            repo: "name".into(),
        }];
        let q = build_search_query(&GithubSearchOptions {
            kind: GithubSearchKind::PullRequest,
            state: "all",
            repos: &repos,
            assignees: &[],
            labels: &[],
            query: Some("sort:updated-desc"),
            page: 1,
            per_page: 20,
        });
        assert!(q.contains("is:pr"));
        assert!(q.contains("repo:owner/name"));
        assert!(!q.contains("is:open"));
        assert!(!q.contains("is:closed"));
        // sort: is stripped from q (applied via --sort/--order).
        assert!(!q.contains("sort:"));
        // Multi-token q must split into separate gh argv (not one spaced string).
        let tokens = split_search_query_args(&q);
        assert!(tokens.len() >= 2, "expected multi-token q, got {tokens:?}");
        assert_eq!(tokens[0], "is:pr");
    }
}
