use std::path::{Path, PathBuf};

use tracing::{info, warn};

const GITHUB_REPO: &str = "https://github.com/AruNi-01/atmos.git";
const GIT_COMMIT_PROMPT_SOURCE: &str = "prompt/git-commit/git-commit-generator.md";

fn target_prompt_path(home: &Path) -> PathBuf {
    home.join(".atmos")
        .join("llm")
        .join("prompt")
        .join("git-commit-prompt.md")
}

fn prompt_file_is_valid(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .map(|content| !content.trim().is_empty())
        .unwrap_or(false)
}

fn copy_prompt_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(src, dst)?;
    Ok(())
}

fn resolve_project_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(target_dir) = exe.parent() {
            if let Some(build_type) = target_dir.parent() {
                if let Some(workspace_root) = build_type.parent() {
                    if workspace_root.join(GIT_COMMIT_PROMPT_SOURCE).exists() {
                        return workspace_root.to_path_buf();
                    }
                }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf())
}

fn sync_prompt_from_project(project_root: &Path, destination: &Path) -> bool {
    if prompt_file_is_valid(destination) {
        return false;
    }

    let source = project_root.join(GIT_COMMIT_PROMPT_SOURCE);
    if !source.exists() || !source.is_file() {
        return false;
    }

    if copy_prompt_file(&source, destination).is_ok() {
        info!(
            "Synced git commit prompt to {} (from project)",
            destination.display()
        );
        true
    } else {
        false
    }
}

fn clone_and_sync_prompt_from_github(destination: &Path) -> bool {
    if prompt_file_is_valid(destination) {
        return false;
    }

    let temp_dir = std::env::temp_dir().join(format!("atmos-prompt-sync-{}", std::process::id()));
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

    let mut synced = false;

    if let Ok(output) = clone_status {
        if output.status.success() {
            let source = clone_path.join(GIT_COMMIT_PROMPT_SOURCE);
            if source.exists() && source.is_file() && copy_prompt_file(&source, destination).is_ok()
            {
                info!(
                    "Synced git commit prompt to {} (from GitHub)",
                    destination.display()
                );
                synced = true;
            }
        } else {
            warn!(
                "Git clone failed during prompt sync: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    } else if let Err(error) = clone_status {
        warn!("Git clone failed during prompt sync: {}", error);
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    synced
}

pub fn sync_git_commit_prompt_if_missing() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let destination = target_prompt_path(&home);
    if prompt_file_is_valid(&destination) {
        return Ok(());
    }

    let project_root = resolve_project_root();
    if sync_prompt_from_project(&project_root, &destination) {
        return Ok(());
    }

    if prompt_file_is_valid(&destination) {
        return Ok(());
    }

    if clone_and_sync_prompt_from_github(&destination) {
        Ok(())
    } else {
        Err("Failed to sync git commit prompt from project or GitHub".to_string())
    }
}

pub fn sync_prompts_on_startup() {
    let _ = sync_git_commit_prompt_if_missing();
}
