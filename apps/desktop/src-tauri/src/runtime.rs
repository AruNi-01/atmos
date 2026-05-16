//! Attach Desktop to the shared local API runtime via `runtime-manager`.

use std::path::{Path, PathBuf};

use runtime_manager::supervisor::{EnsureOptions, EnsureOutcome, DEFAULT_PORT};
use tauri::Manager;

const DEFAULT_HOST: &str = "127.0.0.1";

pub struct DesktopRuntimeFailure {
    pub root_cause: String,
    pub log_path: PathBuf,
}

pub async fn ensure_desktop_runtime(
    app_handle: &tauri::AppHandle,
) -> Result<u16, DesktopRuntimeFailure> {
    let log_path = crate::logging::app_log_path(app_handle, "runtime-api.log");

    let resource_dir = app_handle.path().resource_dir().map_err(|e| {
        desktop_failure(&log_path, format!("resource dir unavailable: {e}"))
    })?;

    let runtime_dir = resolve_bundled_runtime_dir(&resource_dir).map_err(|e| {
        desktop_failure(
            &log_path,
            format!("{e} — run `just dev-desktop` or `bash scripts/desktop/prepare-sidecar.sh`"),
        )
    })?;

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos-desktop"));
    let data_dir_str = data_dir.to_string_lossy().to_string();

    let port = std::env::var("ATMOS_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    std::env::set_var("ATMOS_RUNTIME_DIR", &runtime_dir);

    let mut extra_env = vec![("ATMOS_DATA_DIR".to_string(), data_dir_str)];
    let utf8_locale = resolve_utf8_locale();
    extra_env.push(("LANG".to_string(), utf8_locale.clone()));
    extra_env.push(("LC_CTYPE".to_string(), utf8_locale));
    extra_env.push(("SHELL".to_string(), resolve_shell()));
    if let Ok(path) = augmented_path(&runtime_dir) {
        extra_env.push(("PATH".to_string(), path));
    }

    let outcome = runtime_manager::supervisor::ensure_running(EnsureOptions {
        host: DEFAULT_HOST.to_string(),
        port,
        force_restart: false,
        extra_env,
    })
    .await
    .map_err(|e| desktop_failure(&log_path, e))?;

    let status = match outcome {
        EnsureOutcome::AlreadyRunning(s) | EnsureOutcome::Started(s) => s,
    };

    if !status.healthy {
        return Err(desktop_failure(
            &log_path,
            format!("API at {} is not healthy", status.url),
        ));
    }

    crate::logging::append_log(
        &log_path,
        &format!(
            "runtime ready port={} manifest={:?}",
            status.port, status.manifest_path
        ),
    );

    Ok(status.port)
}

fn resolve_bundled_runtime_dir(resource_dir: &Path) -> Result<PathBuf, String> {
    let api_name = if cfg!(windows) { "api.exe" } else { "api" };

    let mut candidates = vec![resource_dir.join("runtime").join("current")];
    #[cfg(debug_assertions)]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/runtime/current"),
        );
    }

    for current in candidates {
        if current.join("bin").join(api_name).is_file() {
            return Ok(current);
        }
    }

    Err(
        "bundled runtime layout missing (expected runtime/current/bin/api — run prepare-sidecar)"
            .into(),
    )
}

fn augmented_path(runtime_dir: &Path) -> Result<String, String> {
    let mut paths = vec![runtime_dir.join("bin")];
    let extra = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];
    paths.extend(extra.iter().map(|p| PathBuf::from(*p)));
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".atmos").join("bin"));
    }
    paths.extend(
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect::<Vec<_>>(),
    );
    std::env::join_paths(paths)
        .map_err(|e| format!("Failed to construct PATH: {e}"))
        .map(|v| v.to_string_lossy().to_string())
}

fn resolve_utf8_locale() -> String {
    for key in ["LC_ALL", "LC_CTYPE", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            if value.to_ascii_lowercase().contains("utf-8") || value.to_ascii_lowercase().contains("utf8")
            {
                return value;
            }
        }
    }
    "en_US.UTF-8".to_string()
}

fn resolve_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            #[cfg(target_os = "macos")]
            {
                for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
                    if Path::new(candidate).exists() {
                        return candidate.to_string();
                    }
                }
            }
            "/bin/sh".to_string()
        })
}

fn desktop_failure(log_path: &Path, message: impl Into<String>) -> DesktopRuntimeFailure {
    let root_cause = message.into();
    crate::logging::append_log(log_path, &format!("runtime error: {root_cause}"));
    DesktopRuntimeFailure {
        root_cause,
        log_path: log_path.to_path_buf(),
    }
}
