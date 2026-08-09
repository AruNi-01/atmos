use std::sync::LazyLock;

use regex::Regex;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::EngineError;

static RE_HTTPS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"github\.com/([^/]+)/([^/\s\.]+)").unwrap());
static RE_SSH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"github\.com:([^/]+)/([^\s\.]+)").unwrap());
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

    /// Extract (owner, repo) from a remote URL
    pub fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
        RE_HTTPS
            .captures(remote_url)
            .or_else(|| RE_SSH.captures(remote_url))
            .map(|c| {
                let repo = c[2].trim_end_matches(".git").to_string();
                (c[1].to_string(), repo)
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
            "number,title,body,url,state,headRefName,baseRefName,isDraft,labels",
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
            "number,title,body,url,state,headRefName,baseRefName,isDraft,labels",
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
            "https://api.github.com/repos/{owner}/{repo}/pulls?state={state}&per_page={limit}"
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

#[cfg(test)]
mod tests {
    use super::{contribution_level_to_u8, normalize_github_login, GithubEngine};

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
}
