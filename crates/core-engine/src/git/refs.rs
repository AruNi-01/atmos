use std::path::Path;

use crate::error::{EngineError, Result};

use super::{run_git, try_run_git, GitEngine, GitStatus};

impl GitEngine {
    pub(super) fn resolve_remote_branch_ref(
        &self,
        repo_path: &Path,
        base_branch: &str,
    ) -> Result<String> {
        let normalized = base_branch.trim().trim_start_matches("origin/");
        if normalized.is_empty() {
            return Err(EngineError::Git("Base branch cannot be empty".to_string()));
        }

        let remote_branches = self.list_remote_branches(repo_path)?;
        if remote_branches.iter().any(|branch| branch == normalized) {
            return Ok(format!("origin/{}", normalized));
        }

        Err(EngineError::Git(format!(
            "Remote branch origin/{} does not exist",
            normalized
        )))
    }

    pub(super) fn get_upstream_branch_ref(&self, repo_path: &Path) -> Result<Option<String>> {
        let Some(stdout) = try_run_git(
            repo_path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        )?
        else {
            return Ok(None);
        };

        let upstream_ref = stdout.trim();
        if upstream_ref.is_empty() {
            return Ok(None);
        }

        Ok(Some(upstream_ref.to_string()))
    }

    pub(super) fn resolve_preferred_compare_ref(
        &self,
        repo_path: &Path,
        base_branch: Option<&str>,
    ) -> Result<Option<String>> {
        if let Some(base_branch) = base_branch.filter(|value| !value.trim().is_empty()) {
            return self
                .resolve_remote_branch_ref(repo_path, base_branch)
                .map(Some);
        }

        if let Some(upstream_ref) = self.get_upstream_branch_ref(repo_path)? {
            return Ok(Some(upstream_ref));
        }

        Ok(self
            .get_remote_default_branch(repo_path)?
            .map(|branch| format!("origin/{branch}")))
    }

    /// Get the default branch of a repository from locally available refs only.
    pub fn get_default_branch(&self, repo_path: &Path) -> Result<Option<String>> {
        // 1. Try origin/HEAD symbolic ref (set by git clone)
        if let Some(stdout) = try_run_git(
            repo_path,
            &["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
        )? {
            let branch = stdout
                .trim()
                .strip_prefix("origin/")
                .unwrap_or(stdout.trim());
            if !branch.is_empty() {
                return Ok(Some(branch.to_string()));
            }
        }

        // 2. Prefer well-known default branches if we already have the remote refs locally.
        if let Ok(branches) = self.list_remote_branches(repo_path) {
            for candidate in &["main", "master"] {
                if branches.iter().any(|b| b == candidate) {
                    return Ok(Some(candidate.to_string()));
                }
            }
        }

        // 3. Fall back to well-known local branches.
        if let Some(stdout) = try_run_git(
            repo_path,
            &[
                "for-each-ref",
                "refs/heads/main",
                "refs/heads/master",
                "--format=%(refname:short)",
            ],
        )? {
            if let Some(branch) = stdout
                .lines()
                .map(str::trim)
                .find(|branch| !branch.is_empty())
            {
                return Ok(Some(branch.to_string()));
            }
        }

        // 4. Last resort: whatever local HEAD points to, if not detached.
        if let Some(stdout) = try_run_git(repo_path, &["symbolic-ref", "--short", "HEAD"])? {
            let branch = stdout.trim();
            if !branch.is_empty() && branch != "HEAD" {
                return Ok(Some(branch.to_string()));
            }
        }

        Ok(None)
    }

    /// Get the remote default branch from locally available origin refs only.
    pub fn get_remote_default_branch(&self, repo_path: &Path) -> Result<Option<String>> {
        // 1. Try origin/HEAD symbolic ref (set by git clone)
        if let Some(stdout) = try_run_git(
            repo_path,
            &["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
        )? {
            let branch = stdout
                .trim()
                .strip_prefix("origin/")
                .unwrap_or(stdout.trim());
            if !branch.is_empty() {
                return Ok(Some(branch.to_string()));
            }
        }

        // 2. Fall back to common remote default branches if we already have them locally.
        if let Ok(branches) = self.list_remote_branches(repo_path) {
            for candidate in &["main", "master"] {
                if branches.iter().any(|b| b == candidate) {
                    return Ok(Some(candidate.to_string()));
                }
            }
        }

        Ok(None)
    }

    /// Compare `head_ref` with `base_ref` and return `(ahead, behind)` for the head ref.
    fn get_branch_divergence(
        &self,
        repo_path: &Path,
        base_ref: &str,
        head_ref: &str,
    ) -> Result<Option<(u32, u32)>> {
        let range = format!("{}...{}", base_ref, head_ref);
        let Some(stdout) =
            try_run_git(repo_path, &["rev-list", "--left-right", "--count", &range])?
        else {
            return Ok(None);
        };

        let mut counts = stdout.split_whitespace();
        let behind = counts
            .next()
            .ok_or_else(|| EngineError::Git("Missing behind count".to_string()))?
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid behind count".to_string()))?;
        let ahead = counts
            .next()
            .ok_or_else(|| EngineError::Git("Missing ahead count".to_string()))?
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid ahead count".to_string()))?;

        Ok(Some((ahead, behind)))
    }

    /// Check the git status of a worktree/repository
    pub fn get_git_status(&self, repo_path: &Path) -> Result<GitStatus> {
        let status_stdout = run_git(repo_path, &["status", "--porcelain", "-uall"])?;
        let uncommitted_count = status_stdout.lines().filter(|l| !l.is_empty()).count() as u32;
        let has_uncommitted_changes = uncommitted_count > 0;
        let has_merge_conflicts = status_stdout.lines().any(|line| {
            if line.len() < 2 {
                return false;
            }

            matches!(&line[..2], "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU")
        });

        let (has_unpushed_commits, unpushed_count) =
            match try_run_git(repo_path, &["rev-list", "@{u}..HEAD", "--count"])? {
                Some(count_str) => {
                    let count = count_str.trim().parse::<u32>().unwrap_or(0);
                    (count > 0, count)
                }
                None => (false, 0),
            };
        let upstream_behind_count =
            match try_run_git(repo_path, &["rev-list", "HEAD..@{u}", "--count"])? {
                Some(count_str) => Some(count_str.trim().parse::<u32>().unwrap_or(0)),
                None => None,
            };

        let default_branch = self.get_remote_default_branch(repo_path)?;
        let current_branch = self.get_current_branch(repo_path).ok();
        let (default_branch_ahead, default_branch_behind) =
            match (default_branch.as_deref(), current_branch.as_deref()) {
                (Some(default_branch), Some(current_branch)) => {
                    let default_branch_ref = format!("origin/{}", default_branch);
                    let current_branch_remote_ref = format!("origin/{}", current_branch);

                    if try_run_git(
                        repo_path,
                        &["rev-parse", "--verify", &current_branch_remote_ref],
                    )?
                    .is_some()
                    {
                        match self.get_branch_divergence(
                            repo_path,
                            &default_branch_ref,
                            &current_branch_remote_ref,
                        )? {
                            Some((ahead, behind)) => (Some(ahead), Some(behind)),
                            None => (None, None),
                        }
                    } else {
                        (None, None)
                    }
                }
                _ => (None, None),
            };

        Ok(GitStatus {
            has_uncommitted_changes,
            has_merge_conflicts,
            has_unpushed_commits,
            uncommitted_count,
            unpushed_count,
            upstream_behind_count,
            default_branch,
            default_branch_ahead,
            default_branch_behind,
        })
    }

    /// Get the current branch name of a repository
    pub fn get_current_branch(&self, repo_path: &Path) -> Result<String> {
        let stdout = run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        Ok(stdout.trim().to_string())
    }

    /// Get remote origin url
    pub fn get_remote_url(&self, repo_path: &Path) -> Result<String> {
        match try_run_git(repo_path, &["config", "--get", "remote.origin.url"])? {
            Some(stdout) => Ok(stdout.trim().to_string()),
            None => Ok(String::new()),
        }
    }

    /// Count commits between base and head (exclusive of base)
    pub fn get_commit_count(
        &self,
        repo_path: &Path,
        base_commit: &str,
        head_commit: &str,
    ) -> Result<u32> {
        let range = format!("{}..{}", base_commit, head_commit);
        let stdout = run_git(repo_path, &["rev-list", "--count", &range])?;
        stdout
            .trim()
            .parse::<u32>()
            .map_err(|_| EngineError::Git("Invalid commit count".to_string()))
    }

    /// Get the current HEAD commit hash (full SHA)
    pub fn get_head_commit(&self, repo_path: &Path) -> Result<String> {
        let stdout = run_git(repo_path, &["rev-parse", "HEAD"])?;
        Ok(stdout.trim().to_string())
    }

    /// List only remote branches (origin) for a repository
    pub fn list_remote_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let stdout = run_git(
            repo_path,
            &["for-each-ref", "refs/remotes/origin", "--format=%(refname)"],
        )?;

        let mut branches: Vec<String> = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                l.strip_prefix("refs/remotes/origin/")
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        branches.sort();

        Ok(branches)
    }

    /// List both local and remote branches for a repository
    pub fn list_branches(&self, repo_path: &Path) -> Result<Vec<String>> {
        let stdout = run_git(
            repo_path,
            &[
                "for-each-ref",
                "refs/heads",
                "refs/remotes/origin",
                "--format=%(refname)",
            ],
        )?;

        let mut branches: Vec<String> = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
            .filter_map(|l| {
                l.strip_prefix("refs/heads/")
                    .or_else(|| l.strip_prefix("refs/remotes/origin/"))
                    .map(|s| s.to_string())
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        branches.sort();

        Ok(branches)
    }

    /// Rename a branch in a repository
    pub fn rename_branch(&self, repo_path: &Path, old_name: &str, new_name: &str) -> Result<()> {
        run_git(repo_path, &["branch", "-m", old_name, new_name])?;
        Ok(())
    }

    /// Check if the current branch has been published to remote
    pub fn is_branch_published(&self, repo_path: &Path) -> Result<bool> {
        let branch = self.get_current_branch(repo_path)?;
        let remote_ref = format!("origin/{}", branch);
        Ok(try_run_git(repo_path, &["rev-parse", "--verify", &remote_ref])?.is_some())
    }
}
