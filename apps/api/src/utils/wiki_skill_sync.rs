//! Sync project-wiki and project-wiki-update skills to ~/.atmos/skills/.system/ on startup.
//! 1. Copy from project root if running from ATMOS source (symlinks are preserved; project-wiki is synced first)
//! 2. Otherwise clone from GitHub when target does not exist

use std::path::Path;
use tracing::{info, warn};

const GITHUB_REPO: &str = "https://github.com/AruNi-01/atmos.git";

/// Recursively copy directory. Symlinks are preserved with their target path unchanged;
/// since project-wiki is synced first, relative symlinks (e.g. ../project-wiki/references) resolve correctly.
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_symlink() {
            let target = std::fs::read_link(&path)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &dst_path)?;
            #[cfg(windows)]
            {
                let target_is_dir = std::fs::metadata(&path)
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                if target_is_dir {
                    std::os::windows::fs::symlink_dir(&target, &dst_path)?;
                } else {
                    std::os::windows::fs::symlink_file(&target, &dst_path)?;
                }
            }
        } else if ty.is_dir() {
            copy_dir_all(&path, &dst_path)?;
        } else {
            std::fs::copy(&path, dst_path)?;
        }
    }
    Ok(())
}

/// Clone atmos repo from GitHub and copy wiki skills to ~/.atmos/skills/.system/.
/// Copies project-wiki, project-wiki-update, and project-wiki-specify.
/// Returns true if at least project-wiki was synced.
fn clone_and_sync_all_wiki_skills(system_dir: &Path, skills_to_sync: &[&str]) -> bool {
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

    let mut any_ok = false;

    if let Ok(output) = clone_status {
        if output.status.success() {
            let skills_dir = clone_path.join("skills");
            for skill_name in skills_to_sync {
                let skill_src = skills_dir.join(skill_name);
                let skill_dst = system_dir.join(skill_name);
                if skill_src.exists() && skill_src.is_dir() && !skill_dir_is_valid(&skill_dst) {
                    if skill_dst.exists() {
                        let _ = std::fs::remove_dir_all(&skill_dst);
                    }
                    if copy_dir_all(&skill_src, &skill_dst).is_ok() {
                        info!(
                            "Synced {} skill to {} (from GitHub)",
                            skill_name,
                            skill_dst.to_string_lossy()
                        );
                        any_ok = true;
                    }
                }
            }
        } else {
            warn!(
                "Git clone failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    } else if let Err(e) = clone_status {
        warn!("Git clone failed: {}", e);
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    any_ok
}

const WIKI_SKILL_NAMES: &[&str] = &[
    "project-wiki",
    "project-wiki-update",
    "project-wiki-specify",
];

/// Check if a skill directory is valid (has SKILL.md). Empty dirs are considered invalid.
fn skill_dir_is_valid(skill_path: &Path) -> bool {
    skill_path.join("SKILL.md").exists()
}

/// Sync a single skill from project root. Returns true if synced successfully.
/// Re-syncs if target exists but is empty (no SKILL.md).
fn sync_skill_from_project(skill_name: &str, system_dir: &Path, project_root: &Path) -> bool {
    let target_dir = system_dir.join(skill_name);
    if target_dir.exists() && skill_dir_is_valid(&target_dir) {
        return false;
    }
    // Remove empty/invalid dir so we can copy fresh
    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    let source = project_root.join("skills").join(skill_name);
    if !source.exists() || !source.is_dir() {
        tracing::debug!(
            "Skill {} source not found at {} (project_root: {})",
            skill_name,
            source.display(),
            project_root.display()
        );
        return false;
    }
    match copy_dir_all(&source, &target_dir) {
        Ok(()) => {
            info!(
                "Synced {} skill to {} (from project)",
                skill_name,
                target_dir.to_string_lossy()
            );
            return true;
        }
        Err(e) => {
            warn!(
                "Failed to copy skill {} from {} to {}: {} (kind: {:?})",
                skill_name,
                source.display(),
                target_dir.display(),
                e,
                e.kind()
            );
            return false;
        }
    }
}

/// Resolve project/workspace root. Derive from executable path (target/debug/api -> workspace root),
/// which is reliable when running via `cargo run` regardless of cwd. Fall back to current_dir().
fn resolve_project_root() -> std::path::PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        // exe = .../atmos/target/debug/api or .../atmos/target/release/api
        if let Some(target_dir) = exe.parent() {
            if let Some(build_type) = target_dir.parent() {
                if let Some(workspace_root) = build_type.parent() {
                    if workspace_root.join("skills").join("project-wiki").exists() {
                        return workspace_root.to_path_buf();
                    }
                }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf())
}

/// Ensure project-wiki, project-wiki-update, and project-wiki-specify skills exist in ~/.atmos/skills/.system/.
/// 1. If target exists and valid, no-op
/// 2. Copy from project root when running from ATMOS source (uses CARGO_MANIFEST_DIR to find skills/)
/// 3. For any still missing: clone from GitHub and copy all three
pub fn sync_project_wiki_skill_on_startup() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };

    let system_dir = home.join(".atmos").join("skills").join(".system");
    if std::fs::create_dir_all(&system_dir).is_err() {
        return;
    }

    let project_root = resolve_project_root();
    let skills_path = project_root.join("skills");
    if !skills_path.exists() {
        warn!(
            "Project skills dir not found at {}, using current_dir fallback - wiki sync may be incomplete",
            skills_path.display()
        );
    }

    // 1. Try copy from project root for each skill
    for skill_name in WIKI_SKILL_NAMES {
        sync_skill_from_project(skill_name, &system_dir, &project_root);
    }

    // 2. For any still missing or invalid (empty), clone from GitHub and copy all
    let missing: Vec<&str> = WIKI_SKILL_NAMES
        .iter()
        .filter(|name| {
            let path = system_dir.join(*name);
            !skill_dir_is_valid(&path)
        })
        .copied()
        .collect();
    if !missing.is_empty() {
        clone_and_sync_all_wiki_skills(&system_dir, &missing);
    }
}
