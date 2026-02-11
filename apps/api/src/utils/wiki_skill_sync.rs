//! Sync project-wiki and project-wiki-update skills to ~/.atmos/skills/.system/ on startup.
//! 1. Copy from project root if running from ATMOS source (symlinks are resolved during copy)
//! 2. Otherwise clone from GitHub when target does not exist

use std::path::Path;
use tracing::{info, warn};

const GITHUB_REPO: &str = "https://github.com/AruNi-01/atmos.git";

/// Recursively copy directory, following symlinks (equivalent to cp -rL).
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

/// Sync a single skill directory. Returns true if synced from project, false if from GitHub or skipped.
fn sync_skill(skill_name: &str, home: &Path, project_root: &Path) -> bool {
    let target_dir = home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join(skill_name);

    if target_dir.exists() {
        return false; // No-op, already exists
    }

    if let Some(parent) = target_dir.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return false;
        }
    }

    // 1. Try copy from project root (when running from ATMOS source)
    let source = project_root.join("skills").join(skill_name);
    if source.exists() && source.is_dir() {
        if copy_dir_all(&source, &target_dir).is_ok() {
            info!(
                "Synced {} skill to {} (from project)",
                skill_name,
                target_dir.to_string_lossy()
            );
            return true;
        }
    }

    // 2. Fallback: clone from GitHub (only for project-wiki; project-wiki-update comes from project)
    if skill_name == "project-wiki" {
        if clone_from_github(&target_dir) {
            info!(
                "Synced {} skill to {} (from GitHub)",
                skill_name,
                target_dir.to_string_lossy()
            );
            return true;
        }
    }

    false
}

/// Ensure project-wiki, project-wiki-update, and project-wiki-specify skills exist in ~/.atmos/skills/.system/.
/// 1. If target exists, no-op
/// 2. Copy from project root if running from ATMOS source (symlinks resolved during copy)
/// 3. For project-wiki only: otherwise clone from GitHub
pub fn sync_project_wiki_skill_on_startup() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };

    let project_root = std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());

    // Sync project-wiki first (project-wiki-update may depend on it for shared refs when cloned)
    sync_skill("project-wiki", &home, &project_root);

    // Sync project-wiki-update (only from project; not in GitHub clone fallback)
    sync_skill("project-wiki-update", &home, &project_root);

    // Sync project-wiki-specify (only from project)
    sync_skill("project-wiki-specify", &home, &project_root);
}
