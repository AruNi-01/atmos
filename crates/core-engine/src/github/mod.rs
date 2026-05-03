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
pub struct GithubIssue {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub labels: Vec<GithubIssueLabel>,
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
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        match self.list_issues_via_gh(owner, repo, state, limit).await {
            Ok(issues) => Ok(issues),
            Err(gh_error) => {
                tracing::warn!(
                    owner,
                    repo,
                    state,
                    limit,
                    "gh issue list failed, falling back to GitHub API: {}",
                    gh_error
                );
                self.list_issues_via_api(owner, repo, state, limit).await
            }
        }
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
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        let repo_arg = format!("{owner}/{repo}");
        let limit_value = limit.to_string();
        let args = vec![
            "issue",
            "list",
            "--repo",
            &repo_arg,
            "--state",
            state,
            "--limit",
            &limit_value,
            "--json",
            "number,title,body,url,state,labels",
        ];
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
            "number,title,body,url,state,labels",
        ];
        let output = self.run_gh(&args).await?;
        parse_issue_value(owner, repo, &output)
    }

    async fn list_issues_via_api(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        limit: usize,
    ) -> Result<Vec<GithubIssue>, EngineError> {
        let endpoint = format!(
            "https://api.github.com/repos/{owner}/{repo}/issues?state={state}&per_page={limit}"
        );
        let output = self.fetch_api_json(&endpoint).await?;
        parse_issue_list_value(owner, repo, output)
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

    Ok(GithubIssue {
        owner: owner.to_string(),
        repo: repo.to_string(),
        number,
        title,
        body,
        url,
        state,
        labels,
    })
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
        .ok_or_else(|| EngineError::Processing("GitHub PR response missing headRefName".to_string()))?
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

#[cfg(test)]
mod tests {
    use super::GithubEngine;

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
}
