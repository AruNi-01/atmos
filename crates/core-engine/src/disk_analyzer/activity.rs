//! Last-activity signals for cleanup suggestions.
//!
//! Worktrees use git metadata (gitdir HEAD/index + last commit). Agent session
//! dirs use shallow file mtimes. Directory mtime is only a weak fallback.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use super::cache::path_mtime_ms;

/// Suggest leftover checkouts / sessions idle longer than this.
pub const STALE_AFTER_MS: u64 = 30 * 24 * 60 * 60 * 1000;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_stale(activity_ms: u64, now: u64) -> bool {
    activity_ms > 0 && now.saturating_sub(activity_ms) >= STALE_AFTER_MS
}

/// Last git activity in a linked worktree (or any git checkout).
///
/// Uses gitdir metadata and the latest commit time — not the checkout
/// directory's own mtime, which updates on unrelated file noise.
pub fn git_worktree_last_activity_ms(path: &Path) -> Option<u64> {
    let mut best = 0u64;
    if let Some(gitdir) = resolve_gitdir(path) {
        for name in ["HEAD", "index", "COMMIT_EDITMSG"] {
            best = best.max(path_mtime_ms(&gitdir.join(name)));
        }
        best = best.max(path_mtime_ms(&gitdir.join("logs").join("HEAD")));
    }
    if let Some(commit_ms) = git_last_commit_ms(path) {
        best = best.max(commit_ms);
    }
    if best == 0 {
        None
    } else {
        Some(best)
    }
}

/// Max mtime of immediate children (capped). Parent mtime is used only when
/// the directory has no children, so a container touch cannot hide idle sessions.
pub fn session_dir_last_activity_ms(path: &Path) -> Option<u64> {
    let parent_mtime = path_mtime_ms(path);
    let Ok(rd) = std::fs::read_dir(path) else {
        return if parent_mtime == 0 {
            None
        } else {
            Some(parent_mtime)
        };
    };
    let mut children: Vec<_> = rd.flatten().map(|entry| entry.path()).collect();
    if children.is_empty() {
        return if parent_mtime == 0 {
            None
        } else {
            Some(parent_mtime)
        };
    }
    children.sort();
    let mut best = 0u64;
    for (i, child) in children.iter().enumerate() {
        if i >= 256 {
            break;
        }
        best = best.max(path_mtime_ms(child));
    }
    if best == 0 {
        None
    } else {
        Some(best)
    }
}

fn resolve_gitdir(path: &Path) -> Option<PathBuf> {
    let git = path.join(".git");
    if git.is_dir() {
        return Some(git);
    }
    if !git.is_file() {
        return None;
    }
    let text = std::fs::read_to_string(&git).ok()?;
    let gitdir = text.lines().find_map(|line| {
        line.trim()
            .strip_prefix("gitdir:")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
    })?;
    let abs = if gitdir.is_absolute() {
        gitdir
    } else {
        path.join(gitdir)
    };
    Some(std::fs::canonicalize(&abs).unwrap_or(abs))
}

fn git_last_commit_ms(path: &Path) -> Option<u64> {
    let output = Command::new("git")
        .current_dir(path)
        .args(["log", "-1", "--format=%ct"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let secs: u64 = raw.parse().ok()?;
    Some(secs.saturating_mul(1000))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn is_stale_requires_30_days() {
        let now = 1_700_000_000_000;
        assert!(!is_stale(now - (29 * 24 * 60 * 60 * 1000), now));
        assert!(is_stale(now - STALE_AFTER_MS, now));
        assert!(!is_stale(0, now));
    }

    #[test]
    fn session_dir_activity_reads_child_mtime() {
        let dir = std::env::temp_dir().join(format!(
            "atmos-activity-session-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("session.jsonl"), "x").unwrap();
        let ms = session_dir_last_activity_ms(&dir).expect("mtime");
        let _ = fs::remove_dir_all(&dir);
        assert!(ms > 0);
    }
}
