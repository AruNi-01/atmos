use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::error::{EngineError, Result};

use super::GitEngine;

impl GitEngine {
    /// Apply a unified diff to the Git index only (`git apply --cached`).
    pub fn apply_patch_to_index(&self, repo_path: &Path, patch: &str) -> Result<()> {
        let mut child = Command::new("git")
            .current_dir(repo_path)
            .args(["apply", "--cached", "--unidiff-zero", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| EngineError::Git(format!("Failed to spawn git apply --cached ({})", e)))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(patch.as_bytes())
                .map_err(|e| EngineError::Git(format!("git apply stdin: {}", e)))?;
        }

        let output = child.wait_with_output().map_err(|e| {
            EngineError::Git(format!("Failed to wait for git apply --cached ({})", e))
        })?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(EngineError::Git(format!(
            "git apply --cached failed: {}",
            stderr.trim()
        )))
    }

    /// Reverse-apply a unified diff to the worktree only (`git apply --reverse`).
    pub fn apply_patch_to_worktree_reverse(&self, repo_path: &Path, patch: &str) -> Result<()> {
        let mut child = Command::new("git")
            .current_dir(repo_path)
            .args(["apply", "--reverse", "--unidiff-zero", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                EngineError::Git(format!("Failed to spawn git apply --reverse ({})", e))
            })?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(patch.as_bytes())
                .map_err(|e| EngineError::Git(format!("git apply stdin: {}", e)))?;
        }

        let output = child.wait_with_output().map_err(|e| {
            EngineError::Git(format!("Failed to wait for git apply --reverse ({})", e))
        })?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(EngineError::Git(format!(
            "git apply --reverse failed: {}",
            stderr.trim()
        )))
    }
}
