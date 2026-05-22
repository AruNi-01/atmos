use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use crate::error::{EngineError, Result};

use super::{CommitInfo, GitEngine, run_git, try_run_git};

impl GitEngine {
    /// Get commit log for the current branch (paginated)
    pub fn get_commit_log(
        &self,
        repo_path: &Path,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<CommitInfo>> {
        let upstream_exists =
            try_run_git(repo_path, &["rev-parse", "--abbrev-ref", "@{u}"])?.is_some();

        let mut all_commits = Vec::new();

        if upstream_exists {
            if offset == 0 {
                let unpushed = self.fetch_raw_commits(repo_path, "@{u}..HEAD", 0, 100, false)?;
                all_commits.extend(unpushed);
            }

            let pushed = self.fetch_raw_commits(repo_path, "@{u}", offset, limit, true)?;
            all_commits.extend(pushed);
        } else {
            let local = self.fetch_raw_commits(repo_path, "HEAD", offset, limit, false)?;
            all_commits.extend(local);
        }

        if let Ok(repo_info) = self.get_github_repo_info(repo_path) {
            if let Ok(avatars) = self.fetch_github_avatars(repo_path, &repo_info, offset) {
                for commit in &mut all_commits {
                    if commit.is_pushed {
                        if let Some(avatar_url) = avatars.get(&commit.hash) {
                            commit.author_avatar_url = Some(avatar_url.clone());
                        }
                    }
                }
            }
        }

        Ok(all_commits)
    }

    fn fetch_raw_commits(
        &self,
        repo_path: &Path,
        rev_range: &str,
        skip: usize,
        limit: usize,
        is_pushed: bool,
    ) -> Result<Vec<CommitInfo>> {
        let separator = "\x1f";
        let record_sep = "\x1e";
        let format = format!(
            "--format={}%H{}%an{}%ae{}%at{}%s{}%b{}",
            record_sep, separator, separator, separator, separator, separator, separator
        );

        let skip_arg = format!("--skip={}", skip);
        let limit_arg = format!("-n{}", limit);
        let stdout = match try_run_git(
            repo_path,
            &["log", &format, &skip_arg, &limit_arg, rev_range],
        )? {
            Some(s) => s,
            None => return Ok(Vec::new()),
        };

        let mut result = Vec::new();

        for block in stdout.split(record_sep) {
            let block = block.trim();
            if block.is_empty() {
                continue;
            }
            let parts: Vec<&str> = block.splitn(7, separator).collect();
            if parts.len() < 6 {
                continue;
            }
            let hash = parts[0].trim().to_string();
            let author_name = parts[1].trim().to_string();
            let author_email = parts[2].trim().to_string();
            let timestamp: i64 = parts[3].trim().parse().unwrap_or(0);
            let subject = parts[4].trim().to_string();
            let body = if parts.len() > 5 {
                parts[5].trim().to_string()
            } else {
                String::new()
            };

            if hash.is_empty() || hash.len() < 7 {
                continue;
            }

            result.push(CommitInfo {
                short_hash: hash[..7].to_string(),
                hash,
                author_name,
                author_email,
                timestamp,
                subject,
                body,
                is_pushed,
                author_avatar_url: None,
            });
        }
        Ok(result)
    }

    fn get_github_repo_info(&self, path: &Path) -> Result<String> {
        let remote_url = run_git(path, &["remote", "get-url", "origin"])?;

        if !remote_url.contains("github.com") {
            return Err(EngineError::Git("Not a GitHub repository".to_string()));
        }

        let output = Command::new("gh")
            .current_dir(path)
            .args([
                "repo",
                "view",
                "--json",
                "owner,name",
                "--template",
                "{{.owner.login}}/{{.name}}",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("gh-cli not found: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git(
                "gh-cli error or not authenticated".to_string(),
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn fetch_github_avatars(
        &self,
        path: &Path,
        repo_info: &str,
        offset: usize,
    ) -> Result<HashMap<String, String>> {
        let gh_limit = 100;
        let page = (offset / gh_limit) + 1;

        let url = format!(
            "repos/{}/commits?per_page={}&page={}",
            repo_info, gh_limit, page
        );
        let output = Command::new("gh")
            .current_dir(path)
            .args([
                "api",
                &url,
                "--jq",
                ".[] | {sha: .sha, avatar: (.author.avatar_url // .committer.avatar_url)}",
            ])
            .output()
            .map_err(|e| EngineError::Git(format!("gh api failed: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Git("gh api error".to_string()));
        }

        let mut avatars = HashMap::new();
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                if let (Some(sha), Some(avatar)) = (val["sha"].as_str(), val["avatar"].as_str()) {
                    avatars.insert(sha.to_string(), avatar.to_string());
                }
            }
        }
        Ok(avatars)
    }
}
