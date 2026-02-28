//! Sync all system skills (wiki + code review) to ~/.atmos/skills/.system/ on startup.
//! 1. Copy from project root if running from ATMOS source (symlinks are preserved; project-wiki is synced first)
//! 2. Otherwise clone from GitHub when target does not exist

use std::path::{Path, PathBuf};
use tracing::{info, warn};

const GITHUB_REPO: &str = "https://github.com/AruNi-01/atmos.git";

/// All system skills that should be synced to ~/.atmos/skills/.system/ on startup.
const ALL_SYSTEM_SKILL_NAMES: &[&str] = &[
    // Wiki skills
    "project-wiki",
    "project-wiki-update",
    "project-wiki-specify",
    // Code review skills
    "fullstack-reviewer",
    "code-review-expert",
    "typescript-react-reviewer",
    // Git skills
    "git-commit",
];

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

/// Clone atmos repo from GitHub and copy specified skills to ~/.atmos/skills/.system/.
/// Returns true if at least one skill was synced.
fn clone_and_sync_skills_from_github(system_dir: &Path, skills_to_sync: &[&str]) -> bool {
    let temp_dir = std::env::temp_dir().join(format!("atmos-skill-sync-{}", std::process::id()));
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
            let dir_entries = std::fs::read_dir(&skills_dir)
                .ok()
                .map(|read_dir| read_dir.filter_map(Result::ok).collect::<Vec<_>>())
                .unwrap_or_default();

            for skill_name in skills_to_sync {
                let mut skill_src = skills_dir.join(skill_name);
                if !skill_src.exists() || !skill_src.is_dir() {
                    for entry in &dir_entries {
                        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                            let potential_source = entry.path().join(skill_name);
                            if potential_source.exists() && potential_source.is_dir() {
                                skill_src = potential_source;
                                break;
                            }
                        }
                    }
                }
                
                let skill_dst = get_target_dir(system_dir, skill_name);
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

/// Check if a skill directory is valid (has SKILL.md). Empty dirs are considered invalid.
fn skill_dir_is_valid(skill_path: &Path) -> bool {
    skill_path.join("SKILL.md").exists()
}

/// Helper function to determine the target directory for a skill.
fn get_target_dir(system_dir: &Path, skill_name: &str) -> PathBuf {
    let review_skills = ["fullstack-reviewer", "code-review-expert", "typescript-react-reviewer"];
    if review_skills.contains(&skill_name) {
        system_dir.join("code_review_skills").join(skill_name)
    } else {
        system_dir.join(skill_name)
    }
}

/// Sync a single skill from project root. Returns true if synced successfully.
/// Re-syncs if target exists but is empty (no SKILL.md).
fn sync_skill_from_project(skill_name: &str, system_dir: &Path, project_root: &Path) -> bool {
    let target_dir = get_target_dir(system_dir, skill_name);
    if target_dir.exists() && skill_dir_is_valid(&target_dir) {
        return false;
    }
    // Remove empty/invalid dir so we can copy fresh
    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    let dir_entries = std::fs::read_dir(project_root.join("skills"))
        .ok()
        .map(|read_dir| read_dir.filter_map(Result::ok).collect::<Vec<_>>())
        .unwrap_or_default();

    let mut source = project_root.join("skills").join(skill_name);
    if !source.exists() || !source.is_dir() {
        // Try to find it in subdirectories (like code_review_skills/fullstack-reviewer)
        for entry in dir_entries {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                let potential_source = entry.path().join(skill_name);
                if potential_source.exists() && potential_source.is_dir() {
                    source = potential_source;
                    break;
                }
            }
        }
    }

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
            true
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
            false
        }
    }
}

/// Resolve project/workspace root. Derive from executable path (target/debug/api -> workspace root),
/// which is reliable when running via `cargo run` regardless of cwd. Fall back to current_dir().
fn resolve_project_root() -> PathBuf {
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

/// Ensure all system skills exist in ~/.atmos/skills/.system/.
/// 1. If target exists and valid, no-op
/// 2. Copy from project root when running from ATMOS source
/// 3. For any still missing: clone from GitHub and copy
pub fn sync_system_skills_on_startup() {
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
            "Project skills dir not found at {}, using current_dir fallback - skill sync may be incomplete",
            skills_path.display()
        );
    }

    // 1. Try copy from project root for each skill
    for skill_name in ALL_SYSTEM_SKILL_NAMES {
        sync_skill_from_project(skill_name, &system_dir, &project_root);
    }

    // 2. For any still missing or invalid (empty), clone from GitHub and copy
    let missing: Vec<&str> = ALL_SYSTEM_SKILL_NAMES
        .iter()
        .filter(|name| {
            let path = get_target_dir(&system_dir, name);
            !skill_dir_is_valid(&path)
        })
        .copied()
        .collect();
    if !missing.is_empty() {
        clone_and_sync_skills_from_github(&system_dir, &missing);
    }
}
