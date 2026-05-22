use std::path::Path;

use crate::error::{EngineError, Result};

use super::{run_git, try_run_git_with_stderr, GitEngine};

impl GitEngine {
    /// Commit all staged and unstaged changes
    pub fn commit_all(&self, repo_path: &Path, message: &str) -> Result<String> {
        run_git(repo_path, &["add", "-A"])?;
        run_git(repo_path, &["commit", "-m", message])?;
        let hash_stdout = run_git(repo_path, &["rev-parse", "HEAD"])?;
        let hash = hash_stdout.trim().to_string();
        tracing::info!("Committed changes with hash: {}", hash);
        Ok(hash)
    }

    /// Push to remote
    pub fn push(&self, repo_path: &Path) -> Result<()> {
        let branch = self.get_current_branch(repo_path)?;
        let expected_upstream = format!("origin/{branch}");
        let should_set_upstream =
            self.get_upstream_branch_ref(repo_path)?.as_deref() != Some(expected_upstream.as_str());

        if should_set_upstream {
            run_git(repo_path, &["push", "--set-upstream", "origin", &branch])?;
            tracing::info!(
                "Pushed changes to remote with upstream set to {}",
                expected_upstream
            );
            return Ok(());
        }

        match try_run_git_with_stderr(repo_path, &["push"])? {
            Ok(_) => {
                tracing::info!("Pushed changes to remote");
                Ok(())
            }
            Err(stderr) => {
                if stderr.contains("no upstream")
                    || stderr.contains("set-upstream")
                    || stderr.contains("does not match")
                {
                    run_git(repo_path, &["push", "--set-upstream", "origin", &branch])?;
                    tracing::info!("Pushed changes to remote (with set-upstream)");
                    Ok(())
                } else {
                    Err(EngineError::Git(format!("Failed to push: {}", stderr)))
                }
            }
        }
    }

    /// Stage specific files
    pub fn stage_files(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["add", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        run_git(repo_path, &args)?;

        tracing::info!("Staged {} files", paths.len());
        Ok(())
    }

    /// Unstage specific files from staged area
    pub fn unstage_files(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["reset", "HEAD", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        run_git(repo_path, &args)?;

        tracing::info!("Unstaged {} files", paths.len());
        Ok(())
    }

    /// Discard changes to unstaged files (restore to HEAD)
    pub fn discard_unstaged(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut args = vec!["checkout", "--"];
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        args.extend(path_refs);

        run_git(repo_path, &args)?;

        tracing::info!("Discarded changes to {} files", paths.len());
        Ok(())
    }

    /// Discard untracked files
    pub fn discard_untracked(&self, repo_path: &Path, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }

        for path in paths {
            let full_path = repo_path.join(path);
            if full_path.exists() {
                if full_path.is_dir() {
                    std::fs::remove_dir_all(&full_path).map_err(|e| {
                        EngineError::Git(format!("Failed to remove directory {}: {}", path, e))
                    })?;
                } else {
                    std::fs::remove_file(&full_path).map_err(|e| {
                        EngineError::Git(format!("Failed to remove file {}: {}", path, e))
                    })?;
                }
            }
        }

        tracing::info!("Removed {} untracked files", paths.len());
        Ok(())
    }

    /// Pull from remote
    pub fn pull(&self, repo_path: &Path) -> Result<()> {
        match try_run_git_with_stderr(repo_path, &["pull"])? {
            Ok(_) => {
                tracing::info!("Pulled from remote");
                Ok(())
            }
            Err(stderr) => Err(EngineError::Git(format!(
                "git pull failed: {}",
                stderr.trim()
            ))),
        }
    }

    /// Fetch from remote
    pub fn fetch(&self, repo_path: &Path) -> Result<()> {
        run_git(repo_path, &["fetch", "origin"])?;
        tracing::info!("Fetched from remote");
        Ok(())
    }

    /// Sync local and remote branch state.
    ///
    /// For published branches, this pulls remote changes first and then pushes
    /// local commits so both sides end up aligned. For unpublished branches,
    /// this falls back to push, which publishes the branch.
    pub fn sync(&self, repo_path: &Path) -> Result<()> {
        if self.is_branch_published(repo_path)? {
            self.pull(repo_path)?;
        }
        self.push(repo_path)?;
        Ok(())
    }
}
