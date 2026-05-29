//! Start/stop/status for the installed local runtime (`~/.atmos/runtime/current`).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;
use sysinfo::{Pid, Process, Signal, System};

use crate::manifest::{
    atmos_home_dir, read_runtime_manifest, remove_runtime_manifest, write_runtime_manifest,
    RuntimeManifest,
};

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 30303;

#[derive(Debug, Clone)]
pub struct RuntimeLayout {
    pub runtime_dir: PathBuf,
    pub api_bin_path: PathBuf,
    pub cli_bin_path: PathBuf,
    pub web_dir: PathBuf,
    pub system_skills_dir: PathBuf,
    pub version_file_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeStatus {
    pub installed: bool,
    pub running: bool,
    pub healthy: bool,
    pub pid: Option<u32>,
    pub host: String,
    pub port: u16,
    pub url: String,
    pub manifest_path: Option<String>,
    pub runtime_dir: Option<String>,
    pub api_bin_path: Option<String>,
    pub log_path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EnsureOptions {
    pub host: String,
    pub port: u16,
    pub force_restart: bool,
    /// Extra env vars passed to the API process (e.g. `ATMOS_DATA_DIR` for Desktop).
    pub extra_env: Vec<(String, String)>,
    /// Spawn API detached and return after a short health wait (VPS / headless).
    pub daemon: bool,
}

impl EnsureOptions {
    pub fn new(host: impl Into<String>, port: u16) -> Self {
        Self {
            host: host.into(),
            port,
            force_restart: false,
            extra_env: Vec::new(),
            daemon: false,
        }
    }
}

impl Default for EnsureOptions {
    fn default() -> Self {
        Self::new(DEFAULT_HOST, DEFAULT_PORT)
    }
}

pub enum EnsureOutcome {
    AlreadyRunning(RuntimeStatus),
    Started(RuntimeStatus),
}

pub async fn runtime_status() -> Result<RuntimeStatus, String> {
    collect_status(resolve_runtime_layout().ok().as_ref()).await
}

pub async fn ensure_running(options: EnsureOptions) -> Result<EnsureOutcome, String> {
    let layout = resolve_runtime_layout()?;
    ensure_runtime_installed(&layout)?;

    let existing = collect_status(Some(&layout)).await?;
    if existing.running && !existing.healthy && !options.force_restart {
        return Err(format!(
            "Runtime process {} is running but unhealthy at {}. Use --force-restart.",
            existing
                .pid
                .map(|p| p.to_string())
                .unwrap_or_else(|| "?".into()),
            existing.url
        ));
    }

    if existing.running && !options.force_restart {
        return Ok(EnsureOutcome::AlreadyRunning(existing));
    }

    if existing.running && options.force_restart {
        let _ = stop_running(false).await?;
    }

    let log_path = runtime_log_path()?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }

    let launched_pid = spawn_detached_api(
        &layout,
        &options.host,
        options.port,
        &log_path,
        &options.extra_env,
    )?;
    let health_attempts = if options.daemon { 6 } else { 20 };
    wait_for_health(
        &options.host,
        options.port,
        health_attempts,
        Some(launched_pid),
    )
    .await?;
    let pid = resolve_api_process_id(&layout.api_bin_path, options.port).unwrap_or(launched_pid);

    let manifest = RuntimeManifest::new(&options.host, options.port, Some(pid), "runtime-manager");
    let manifest_path = write_runtime_manifest(&manifest)?;

    let status = RuntimeStatus {
        installed: true,
        running: true,
        healthy: true,
        pid: Some(pid),
        host: manifest.api.host.clone(),
        port: manifest.api.port,
        url: manifest.api.url.clone(),
        manifest_path: Some(manifest_path.display().to_string()),
        runtime_dir: Some(layout.runtime_dir.display().to_string()),
        api_bin_path: Some(layout.api_bin_path.display().to_string()),
        log_path: Some(log_path.display().to_string()),
        version: read_runtime_version(&layout),
    };

    Ok(EnsureOutcome::Started(status))
}

pub async fn stop_running(force: bool) -> Result<bool, String> {
    let Some(manifest) = read_runtime_manifest()? else {
        return Ok(false);
    };

    let Some(runtime_process) = resolve_runtime_process(&manifest).await else {
        let _ = remove_runtime_manifest();
        return Ok(false);
    };

    let pid = Pid::from_u32(runtime_process.pid);
    let mut system = System::new_all();
    system.refresh_processes();

    let Some(process) = system.process(pid) else {
        let _ = remove_runtime_manifest();
        return Ok(false);
    };

    let terminated = if force {
        process.kill()
    } else {
        process
            .kill_with(Signal::Term)
            .unwrap_or_else(|| process.kill())
    };

    if !terminated {
        return Err(format!("Failed to stop process {}", runtime_process.pid));
    }

    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let mut refresh = System::new_all();
        refresh.refresh_process(pid);
        if refresh.process(pid).is_none() {
            let _ = remove_runtime_manifest();
            return Ok(true);
        }
    }

    Err(format!(
        "Process {} did not exit in time",
        runtime_process.pid
    ))
}

async fn collect_status(layout: Option<&RuntimeLayout>) -> Result<RuntimeStatus, String> {
    let installed = layout
        .map(|resolved| {
            resolved.api_bin_path.is_file()
                && resolved.cli_bin_path.is_file()
                && resolved.web_dir.is_dir()
        })
        .unwrap_or(false);

    let manifest = read_runtime_manifest().ok().flatten();
    let host = manifest
        .as_ref()
        .map(|m| m.api.host.clone())
        .unwrap_or_else(|| DEFAULT_HOST.to_string());
    let port = manifest
        .as_ref()
        .map(|m| m.api.port)
        .unwrap_or(DEFAULT_PORT);
    let url = manifest
        .as_ref()
        .map(|m| m.api.url.clone())
        .unwrap_or_else(|| runtime_url(&host, port));

    let mut running = false;
    let mut healthy = false;
    let mut pid = manifest.as_ref().and_then(|m| m.pid);

    if let Some(ref m) = manifest {
        if let Some(runtime_process) = resolve_runtime_process(m).await {
            running = true;
            healthy = runtime_process.healthy;
            pid = Some(runtime_process.pid);
            if Some(runtime_process.pid) != m.pid {
                let updated = RuntimeManifest::new(
                    &m.api.host,
                    m.api.port,
                    Some(runtime_process.pid),
                    &m.source,
                );
                let _ = write_runtime_manifest(&updated);
            }
        } else if m.pid.is_some() {
            let _ = remove_runtime_manifest();
        }
    }

    Ok(RuntimeStatus {
        installed,
        running,
        healthy,
        pid,
        host,
        port,
        url,
        manifest_path: crate::manifest::runtime_manifest_path()
            .ok()
            .filter(|p| p.is_file())
            .map(|p| p.display().to_string()),
        runtime_dir: layout.map(|l| l.runtime_dir.display().to_string()),
        api_bin_path: layout.map(|l| l.api_bin_path.display().to_string()),
        log_path: runtime_log_path().ok().map(|p| p.display().to_string()),
        version: layout.and_then(read_runtime_version),
    })
}

async fn resolve_runtime_process(manifest: &RuntimeManifest) -> Option<RuntimeProcessStatus> {
    let layout = resolve_runtime_layout().ok()?;
    let pid =
        resolve_api_process_id_with_hint(&layout.api_bin_path, manifest.api.port, manifest.pid)?;
    Some(RuntimeProcessStatus {
        pid,
        healthy: is_runtime_healthy(&manifest.api.host, manifest.api.port).await,
    })
}

struct RuntimeProcessStatus {
    pid: u32,
    healthy: bool,
}

fn apply_extra_env(command: &mut Command, extra_env: &[(String, String)]) {
    for (key, value) in extra_env {
        command.env(key, value);
    }
}

fn spawn_detached_api(
    layout: &RuntimeLayout,
    host: &str,
    port: u16,
    log_path: &PathBuf,
    extra_env: &[(String, String)],
) -> Result<u32, String> {
    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut command = Command::new(shell);
        command.arg("-c").arg(
            "nohup \"$ATMOS_LOCAL_API_BIN\" --port \"$ATMOS_LOCAL_PORT\" --cleanup-stale-clients true </dev/null >>\"$ATMOS_LOCAL_LOG_PATH\" 2>&1 & echo $!",
        );
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("SERVER_HOST", host)
            .env("ATMOS_PORT", port.to_string())
            .env("ATMOS_STATIC_DIR", &layout.web_dir)
            .env("ATMOS_CLI_BIN", &layout.cli_bin_path)
            .env("ATMOS_LOCAL_API_BIN", &layout.api_bin_path)
            .env("ATMOS_LOCAL_PORT", port.to_string())
            .env("ATMOS_LOCAL_LOG_PATH", log_path)
            .env("PATH", local_process_path(layout)?);
        if layout.system_skills_dir.is_dir() {
            command.env("ATMOS_SYSTEM_SKILLS_DIR", &layout.system_skills_dir);
        }
        apply_extra_env(&mut command, extra_env);

        let output = command.output().map_err(|error| {
            format!(
                "Failed to spawn API via shell for {}: {}",
                layout.api_bin_path.display(),
                error
            )
        })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "API launcher shell failed".to_string()
            } else {
                stderr
            });
        }

        let pid_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return pid_text
            .parse::<u32>()
            .map_err(|error| format!("Failed to parse API pid `{pid_text}`: {error}"));
    }

    #[cfg(not(unix))]
    {
        let stdout_log = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .map_err(|e| format!("Failed to open {}: {}", log_path.display(), e))?;
        let stderr_log = stdout_log
            .try_clone()
            .map_err(|e| format!("Failed to clone log handle: {e}"))?;

        let mut command = Command::new(&layout.api_bin_path);
        command
            .arg("--port")
            .arg(port.to_string())
            .arg("--cleanup-stale-clients")
            .arg("true")
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout_log))
            .stderr(Stdio::from(stderr_log))
            .env("SERVER_HOST", host)
            .env("ATMOS_PORT", port.to_string())
            .env("ATMOS_STATIC_DIR", &layout.web_dir)
            .env("ATMOS_CLI_BIN", &layout.cli_bin_path)
            .env("PATH", local_process_path(layout)?);
        if layout.system_skills_dir.is_dir() {
            command.env("ATMOS_SYSTEM_SKILLS_DIR", &layout.system_skills_dir);
        }
        apply_extra_env(&mut command, extra_env);

        let child = command.spawn().map_err(|error| {
            format!(
                "Failed to start API {}: {}",
                layout.api_bin_path.display(),
                error
            )
        })?;
        Ok(child.id())
    }
}

async fn wait_for_health(
    host: &str,
    port: u16,
    attempts: usize,
    pid: Option<u32>,
) -> Result<(), String> {
    for _ in 0..attempts {
        if let Some(process_id) = pid {
            let mut system = System::new_all();
            system.refresh_process(Pid::from_u32(process_id));
            if system.process(Pid::from_u32(process_id)).is_none() {
                return Err("API process exited before becoming ready".into());
            }
        }
        if is_runtime_healthy(host, port).await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!(
        "Timed out waiting for API at {}",
        runtime_url(host, port)
    ))
}

async fn is_runtime_healthy(host: &str, port: u16) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client
        .get(format!("{}/healthz", runtime_url(host, port)))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn resolve_api_process_id(api_bin_path: &Path, port: u16) -> Option<u32> {
    resolve_api_process_id_with_hint(api_bin_path, port, None)
}

fn resolve_api_process_id_with_hint(
    api_bin_path: &Path,
    port: u16,
    pid_hint: Option<u32>,
) -> Option<u32> {
    let mut system = System::new_all();
    system.refresh_processes();

    if let Some(pid_hint) = pid_hint {
        let hinted_pid = Pid::from_u32(pid_hint);
        if let Some(process) = system.process(hinted_pid) {
            if process_matches_runtime(process, api_bin_path, port) {
                return Some(hinted_pid.as_u32());
            }
        }
    }

    system.processes().iter().find_map(|(pid, process)| {
        process_matches_runtime(process, api_bin_path, port).then_some(pid.as_u32())
    })
}

fn process_matches_runtime(process: &Process, api_bin_path: &Path, port: u16) -> bool {
    let expected_name = api_bin_path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("api");
    if process.name() != expected_name {
        return false;
    }
    if !process_port_matches(process, port) {
        return false;
    }
    let expected_path = canonical_or_original(api_bin_path);
    if process
        .exe()
        .map(|p| paths_match(p, &expected_path))
        .unwrap_or(false)
    {
        return true;
    }
    process
        .cmd()
        .first()
        .map(|v| paths_match(Path::new(v), &expected_path))
        .unwrap_or(false)
}

fn process_port_matches(process: &Process, port: u16) -> bool {
    let port_text = port.to_string();
    process
        .cmd()
        .windows(2)
        .any(|w| w[0] == "--port" && w[1] == port_text)
        || process
            .cmd()
            .iter()
            .any(|v| v == &format!("--port={port_text}"))
}

fn paths_match(candidate: &Path, expected: &Path) -> bool {
    !candidate.as_os_str().is_empty() && canonical_or_original(candidate) == expected
}

fn canonical_or_original(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub fn resolve_runtime_layout() -> Result<RuntimeLayout, String> {
    let runtime_dir = if let Some(path) = std::env::var_os("ATMOS_RUNTIME_DIR").map(PathBuf::from) {
        path
    } else if let Ok(current_exe) = std::env::current_exe() {
        if let Some(bin_dir) = current_exe.parent() {
            if bin_dir.file_name().and_then(|v| v.to_str()) == Some("bin") {
                let install_root = bin_dir.parent().unwrap_or(bin_dir).to_path_buf();
                let bundled = install_root.join("runtime").join("current");
                if bundled.join("bin").is_dir() && bundled.join("web").is_dir() {
                    bundled
                } else if install_root.join("bin").is_dir() && install_root.join("web").is_dir() {
                    install_root
                } else {
                    default_runtime_dir()?
                }
            } else {
                default_runtime_dir()?
            }
        } else {
            default_runtime_dir()?
        }
    } else {
        default_runtime_dir()?
    };

    let bin_name = if cfg!(windows) { "api.exe" } else { "api" };
    let cli_name = if cfg!(windows) { "atmos.exe" } else { "atmos" };

    Ok(RuntimeLayout {
        api_bin_path: runtime_dir.join("bin").join(bin_name),
        cli_bin_path: runtime_dir.join("bin").join(cli_name),
        web_dir: runtime_dir.join("web"),
        system_skills_dir: runtime_dir.join("system-skills"),
        version_file_path: runtime_dir.join("version.txt"),
        runtime_dir,
    })
}

fn default_runtime_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("runtime").join("current"))
}

fn runtime_log_path() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?
        .join("runtime")
        .join("logs")
        .join("api.log"))
}

fn ensure_runtime_installed(layout: &RuntimeLayout) -> Result<(), String> {
    if !layout.api_bin_path.is_file() {
        return Err(format!(
            "Atmos runtime is not installed (missing {}). Run `npx @atmos/local-web-runtime` or install Desktop.",
            layout.api_bin_path.display()
        ));
    }
    if !layout.web_dir.is_dir() {
        return Err(format!(
            "Atmos runtime is not installed (missing {}).",
            layout.web_dir.display()
        ));
    }
    Ok(())
}

fn local_process_path(layout: &RuntimeLayout) -> Result<String, String> {
    let mut paths = vec![layout.runtime_dir.join("bin")];
    if let Some(home) = dirs::home_dir() {
        paths.extend([
            home.join(".atmos").join("bin"),
            home.join(".local").join("bin"),
            home.join(".npm-global").join("bin"),
            home.join(".bun").join("bin"),
            home.join(".cargo").join("bin"),
            home.join(".deno").join("bin"),
            home.join(".yarn").join("bin"),
            home.join(".local").join("share").join("pnpm"),
            home.join("Library").join("pnpm"),
        ]);
    }
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    std::env::join_paths(paths)
        .map_err(|e| format!("Failed to construct PATH: {e}"))
        .map(|v| v.to_string_lossy().to_string())
}

fn read_runtime_version(layout: &RuntimeLayout) -> Option<String> {
    fs::read_to_string(&layout.version_file_path)
        .ok()
        .map(|c| c.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn runtime_url(host: &str, port: u16) -> String {
    format!("http://{host}:{port}")
}
