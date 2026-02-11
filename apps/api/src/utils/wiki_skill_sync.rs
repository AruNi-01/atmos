//! Sync project-wiki skill to ~/.atmos/skills/.system/ on startup.
//! Only copies from project root when running from ATMOS source; does not clone from GitHub.

use std::path::Path;
use tracing::info;

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

/// Ensure project-wiki skill exists in ~/.atmos/skills/.system/.
/// Copies from project root if running from ATMOS source; otherwise no-op.
pub fn sync_project_wiki_skill_on_startup() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let target_dir = home.join(".atmos").join("skills").join(".system").join("project-wiki");
    if target_dir.exists() {
        return;
    }
    let project_root = match std::env::current_dir() {
        Ok(p) => p,
        Err(_) => return,
    };
    let source = project_root.join("skills").join("project-wiki");
    if !source.exists() || !source.is_dir() {
        return;
    }
    if let Some(parent) = target_dir.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if copy_dir_all(&source, &target_dir).is_ok() {
        info!(
            "Synced project-wiki skill to {}",
            target_dir.to_string_lossy()
        );
    }
}
