//! Sync project-wiki skill to ~/.atmos/skills/.system/ on startup.
//! 1. Copy from project root if running from ATMOS source
//! 2. Otherwise clone from GitHub when target does not exist

use std::path::Path;
use tracing::{info, warn};

const GITHUB_REPO: &str = "https://github.com/AruNi-01/atmos.git";

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), dst_path)?;
        }
    }
    Ok(())
}

/// Clone project-wiki skill from GitHub to target_dir.
/// Returns true on success.
fn clone_from_github(target_dir: &Path) -> bool {
    let temp_dir = std::env::temp_dir().join(format!("atmos-wiki-skill-{}", std::process::id()));
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return false;
    }

    let clone_path = temp_dir.join("atmos");
    let clone_status = std::process::Command::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            GITHUB_REPO,
            clone_path.to_str().unwrap_or("atmos"),
        ])
        .current_dir(&temp_dir)
        .output();

    let result = match clone_status {
        Ok(output) if output.status.success() => {
            let skill_src = clone_path.join("skills").join("project-wiki");
            if skill_src.exists() {
                copy_dir_all(&skill_src, target_dir).is_ok()
            } else {
                false
            }
        }
        Ok(output) => {
            warn!(
                "Git clone failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            false
        }
        Err(e) => {
            warn!("Git clone failed: {}", e);
            false
        }
    };

    let _ = std::fs::remove_dir_all(&temp_dir);
    result
}

/// Ensure project-wiki skill exists in ~/.atmos/skills/.system/.
/// 1. If target exists, no-op
/// 2. Copy from project root if running from ATMOS source
/// 3. Otherwise clone from GitHub
pub fn sync_project_wiki_skill_on_startup() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let target_dir = home.join(".atmos").join("skills").join(".system").join("project-wiki");
    if target_dir.exists() {
        return;
    }

    if let Some(parent) = target_dir.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }

    // 1. Try copy from project root (when running from ATMOS source)
    if let Ok(project_root) = std::env::current_dir() {
        let source = project_root.join("skills").join("project-wiki");
        if source.exists() && source.is_dir() {
            if copy_dir_all(&source, &target_dir).is_ok() {
                info!(
                    "Synced project-wiki skill to {} (from project)",
                    target_dir.to_string_lossy()
                );
            }
            return;
        }
    }

    // 2. Fallback: clone from GitHub
    if clone_from_github(&target_dir) {
        info!(
            "Synced project-wiki skill to {} (from GitHub)",
            target_dir.to_string_lossy()
        );
    }
}
