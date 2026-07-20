use std::collections::HashMap;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::error::{EngineError, Result};

use super::{run_git, try_run_git, CommitInfo, GitEngine};

fn run_gh_with_timeout(path: &Path, args: &[&str], timeout: Duration) -> Result<String> {
    let mut cmd = Command::new("gh");
    cmd.current_dir(path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| EngineError::Git(format!("Failed to execute gh: {}", e)))?;

    let start = std::time::Instant::now();
    loop {
        match child
            .try_wait()
            .map_err(|e| EngineError::Git(format!("Failed to wait for gh: {}", e)))?
        {
            Some(status) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    let _ = out.read_to_end(&mut stdout);
                }
                if let Some(mut err) = child.stderr.take() {
                    use std::io::Read;
                    let _ = err.read_to_end(&mut stderr);
                }

                if !status.success() {
                    let err_msg = String::from_utf8_lossy(&stderr);
                    return Err(EngineError::Git(format!(
                        "gh command failed: {}",
                        err_msg.trim()
                    )));
                }

                return Ok(String::from_utf8_lossy(&stdout).to_string());
            }
            None => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return Err(EngineError::Git("gh command timed out".to_string()));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
}

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

        let stdout = run_gh_with_timeout(
            path,
            &[
                "repo",
                "view",
                "--json",
                "owner,name",
                "--template",
                "{{.owner.login}}/{{.name}}",
            ],
            Duration::from_millis(8000),
        )?;

        Ok(stdout.trim().to_string())
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
        let stdout = run_gh_with_timeout(
            path,
            &[
                "api",
                &url,
                "--jq",
                ".[] | {sha: .sha, avatar: (.author.avatar_url // .committer.avatar_url)}",
            ],
            Duration::from_millis(8000),
        )?;

        let mut avatars = HashMap::new();
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
