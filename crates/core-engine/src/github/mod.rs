use anyhow::{anyhow, Result};
use regex::Regex;
use tokio::process::Command;

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
    pub async fn run_gh(&self, args: &[&str]) -> Result<serde_json::Value> {
        let output = Command::new("gh")
            .args(args)
            .output()
            .await
            .map_err(|e| anyhow!("Failed to spawn gh: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("gh exited with error: {}", stderr));
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
        let re_https = Regex::new(r"github\.com/([^/]+)/([^/\s\.]+)").unwrap();
        let re_ssh = Regex::new(r"github\.com:([^/]+)/([^\s\.]+)").unwrap();

        re_https
            .captures(remote_url)
            .or_else(|| re_ssh.captures(remote_url))
            .map(|c| {
                // Remove .git suffix if present
                let repo = c[2].trim_end_matches(".git").to_string();
                (c[1].to_string(), repo)
            })
    }
}
