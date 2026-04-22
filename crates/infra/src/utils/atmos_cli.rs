use std::path::{Path, PathBuf};
use std::process::Command;

use tracing::{info, warn};

const ATMOS_CLI_BIN_ENV: &str = "ATMOS_CLI_BIN";

fn binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "atmos.exe"
    }
    #[cfg(not(windows))]
    {
        "atmos"
    }
}

fn home_bin_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".atmos").join("bin"))
}

pub fn installed_cli_path() -> Option<PathBuf> {
    home_bin_dir().map(|dir| dir.join(binary_name()))
}

fn source_workspace_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let target_dir = exe.parent()?;
    let build_kind_dir = target_dir.parent()?;
    let workspace_root = build_kind_dir.parent()?;
    if workspace_root.join("skills").is_dir() && workspace_root.join("apps").is_dir() {
        Some(workspace_root.to_path_buf())
    } else {
        None
    }
}

fn build_cli_from_source_workspace() -> Option<PathBuf> {
    let workspace_root = source_workspace_root()?;
    let status = Command::new("cargo")
        .args(["build", "--bin", "atmos"])
        .current_dir(&workspace_root)
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let candidate = workspace_root.join("target").join("debug").join(binary_name());
    candidate.is_file().then_some(candidate)
}

fn source_cli_candidate() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(ATMOS_CLI_BIN_ENV).map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let sibling = parent.join(binary_name());
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }

    build_cli_from_source_workspace()
}

fn set_executable_if_needed(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = std::fs::metadata(path)
            .map_err(|error| format!("failed to stat {}: {}", path.display(), error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).map_err(|error| {
            format!(
                "failed to set executable permissions on {}: {}",
                path.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn prepend_bin_dir_to_process_path(bin_dir: &Path) -> Result<(), String> {
    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = std::env::split_paths(&existing).collect::<Vec<_>>();
    if paths.iter().any(|path| path == bin_dir) {
        return Ok(());
    }

    let mut next_paths = vec![bin_dir.to_path_buf()];
    next_paths.append(&mut paths);
    let joined = std::env::join_paths(next_paths)
        .map_err(|error| format!("failed to join PATH entries: {}", error))?;
    unsafe {
        std::env::set_var("PATH", joined);
    }
    Ok(())
}

pub fn ensure_atmos_cli_on_startup() -> Result<Option<PathBuf>, String> {
    let Some(bin_dir) = home_bin_dir() else {
        return Err("Cannot determine home directory for Atmos CLI install".to_string());
    };
    std::fs::create_dir_all(&bin_dir).map_err(|error| {
        format!(
            "failed to create Atmos CLI bin dir {}: {}",
            bin_dir.display(),
            error
        )
    })?;

    let installed = bin_dir.join(binary_name());
    if let Some(source) = source_cli_candidate() {
        if source != installed {
            std::fs::copy(&source, &installed).map_err(|error| {
                format!(
                    "failed to install Atmos CLI from {} to {}: {}",
                    source.display(),
                    installed.display(),
                    error
                )
            })?;
            set_executable_if_needed(&installed)?;
            info!("Installed Atmos CLI to {}", installed.display());
        }
    } else if !installed.is_file() {
        warn!(
            "Atmos CLI source binary was not found; review-fix terminal flows may be unavailable"
        );
        return Ok(None);
    }

    prepend_bin_dir_to_process_path(&bin_dir)?;
    Ok(installed.is_file().then_some(installed))
}
