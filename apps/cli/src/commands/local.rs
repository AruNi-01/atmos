use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use chrono::Utc;
use clap::{Args, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{Pid, Process, Signal, System};

const DEFAULT_LOCAL_HOST: &str = "127.0.0.1";
const DEFAULT_LOCAL_PORT: u16 = 30303;

pub async fn execute(command: LocalCommand) -> Result<Value, String> {
    match command {
        LocalCommand::Start(args) => start_local_runtime(args).await,
        LocalCommand::Stop(args) => stop_local_runtime(args).await,
        LocalCommand::Status(args) => status_local_runtime(args).await,
    }
}

#[derive(Debug, Subcommand)]
pub enum LocalCommand {
    Start(StartArgs),
    Stop(StopArgs),
    Status(StatusArgs),
}

#[derive(Debug, Args)]
pub struct StartArgs {
    #[arg(long, default_value_t = DEFAULT_LOCAL_PORT)]
    pub port: u16,
    #[arg(long, default_value = DEFAULT_LOCAL_HOST)]
    pub host: String,
    #[arg(long, default_value_t = false)]
    pub force_restart: bool,
}

#[derive(Debug, Args)]
pub struct StopArgs {
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct StatusArgs {}

#[derive(Debug, Clone)]
struct RuntimeLayout {
    runtime_dir: PathBuf,
    api_bin_path: PathBuf,
    cli_bin_path: PathBuf,
    web_dir: PathBuf,
    system_skills_dir: PathBuf,
    version_file_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalRuntimeState {
    pid: u32,
    host: String,
    port: u16,
    url: String,
    runtime_dir: String,
    api_bin_path: String,
    cli_bin_path: String,
    web_dir: String,
    log_path: String,
    version: Option<String>,
    started_at: String,
}

#[derive(Debug, Clone, Serialize)]
struct LocalRuntimeStatus {
    installed: bool,
    running: bool,
    healthy: bool,
    pid: Option<u32>,
    host: String,
    port: u16,
    url: String,
    runtime_dir: Option<String>,
    api_bin_path: Option<String>,
    cli_bin_path: Option<String>,
    web_dir: Option<String>,
    log_path: Option<String>,
    version: Option<String>,
    started_at: Option<String>,
}

#[derive(Debug, Clone)]
struct RuntimeProcessStatus {
    pid: u32,
    healthy: bool,
}

async fn start_local_runtime(args: StartArgs) -> Result<Value, String> {
    let layout = resolve_runtime_layout()?;
    ensure_runtime_installed(&layout)?;

    let existing_status = collect_status(Some(&layout)).await?;
    if existing_status.running && !existing_status.healthy && !args.force_restart {
        return Err(format!(
            "Local runtime process {} is running but failed health checks at {}. Use --force-restart to replace it.",
            existing_status
                .pid
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string()),
            existing_status.url
        ));
    }

    if existing_status.running && !args.force_restart {
        return Ok(json!({
            "ok": true,
            "action": "already_running",
            "status": existing_status,
        }));
    }

    if existing_status.running && args.force_restart {
        let _ = stop_runtime_process(false).await?;
    }

    let local_dir = local_state_dir()?;
    let logs_dir = local_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|error| format!("Failed to create {}: {}", logs_dir.display(), error))?;

    let log_path = logs_dir.join("api.log");
    let launched_pid = spawn_detached_api(&layout, &args.host, args.port, &log_path)?;

    wait_for_health(&args.host, args.port, 20, Some(launched_pid)).await?;
    let pid = resolve_api_process_id(&layout.api_bin_path, args.port).unwrap_or(launched_pid);

    let state = LocalRuntimeState {
        pid,
        host: args.host.clone(),
        port: args.port,
        url: runtime_url(&args.host, args.port),
        runtime_dir: layout.runtime_dir.display().to_string(),
        api_bin_path: layout.api_bin_path.display().to_string(),
        cli_bin_path: layout.cli_bin_path.display().to_string(),
        web_dir: layout.web_dir.display().to_string(),
        log_path: log_path.display().to_string(),
        version: read_runtime_version(&layout),
        started_at: Utc::now().to_rfc3339(),
    };

    write_state_file(&state)?;

    Ok(json!({
        "ok": true,
        "action": "started",
        "status": state_to_status(&state, true, true),
    }))
}

fn spawn_detached_api(
    layout: &RuntimeLayout,
    host: &str,
    port: u16,
    log_path: &PathBuf,
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

        let output = command.output().map_err(|error| {
            format!(
                "Failed to spawn local API shell for {}: {}",
                layout.api_bin_path.display(),
                error
            )
        })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "Local API launcher shell failed".to_string()
            } else {
                stderr
            });
        }

        let pid_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return pid_text
            .parse::<u32>()
            .map_err(|error| format!("Failed to parse API pid `{pid_text}`: {}", error));
    }

    #[cfg(not(unix))]
    {
        let stdout_log = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .map_err(|error| format!("Failed to open {}: {}", log_path.display(), error))?;
        let stderr_log = stdout_log
            .try_clone()
            .map_err(|error| format!("Failed to clone log handle: {}", error))?;

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

        let child = command.spawn().map_err(|error| {
            format!(
                "Failed to start API binary {}: {}",
                layout.api_bin_path.display(),
                error
            )
        })?;
        Ok(child.id())
    }
}

async fn stop_local_runtime(args: StopArgs) -> Result<Value, String> {
    let stopped = stop_runtime_process(args.force).await?;
    Ok(json!({
        "ok": true,
        "action": "stopped",
        "stopped": stopped,
        "status": collect_status(None).await?,
    }))
}

async fn status_local_runtime(_args: StatusArgs) -> Result<Value, String> {
    Ok(serde_json::to_value(collect_status(None).await?)
        .map_err(|error| format!("Failed to serialize local runtime status: {}", error))?)
}

async fn stop_runtime_process(force: bool) -> Result<bool, String> {
    let Some(state) = read_state_file()? else {
        return Ok(false);
    };

    let Some(runtime_process) = resolve_runtime_process(&state).await else {
        remove_state_file()?;
        return Ok(false);
    };

    let pid = Pid::from_u32(runtime_process.pid);
    let mut system = System::new_all();
    system.refresh_processes();

    let Some(process) = system.process(pid) else {
        remove_state_file()?;
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
            remove_state_file()?;
            return Ok(true);
        }
    }

    Err(format!(
        "Process {} did not exit in time",
        runtime_process.pid
    ))
}

async fn collect_status(
    layout_override: Option<&RuntimeLayout>,
) -> Result<LocalRuntimeStatus, String> {
    let layout = match layout_override {
        Some(layout) => Some(layout.clone()),
        None => resolve_runtime_layout().ok(),
    };
    let installed = layout
        .as_ref()
        .map(|resolved| {
            resolved.api_bin_path.is_file()
                && resolved.cli_bin_path.is_file()
                && resolved.web_dir.is_dir()
        })
        .unwrap_or(false);

    let mut state = read_state_file()?;
    let default_host = state
        .as_ref()
        .map(|value| value.host.clone())
        .unwrap_or_else(|| DEFAULT_LOCAL_HOST.to_string());
    let default_port = state
        .as_ref()
        .map(|value| value.port)
        .unwrap_or(DEFAULT_LOCAL_PORT);

    let mut running = false;
    let mut healthy = false;
    let mut pid = state.as_ref().map(|value| value.pid);

    if let Some(saved) = state.as_ref() {
        if let Some(runtime_process) = resolve_runtime_process(saved).await {
            running = true;
            pid = Some(runtime_process.pid);
            healthy = runtime_process.healthy;
            if runtime_process.pid != saved.pid {
                let mut updated = saved.clone();
                updated.pid = runtime_process.pid;
                write_state_file(&updated)?;
                state = Some(updated);
            }
        } else {
            remove_state_file()?;
            state = None;
            pid = None;
        }
    }

    let runtime_dir = state
        .as_ref()
        .map(|value| value.runtime_dir.clone())
        .or_else(|| {
            layout
                .as_ref()
                .map(|resolved| resolved.runtime_dir.display().to_string())
        });
    let api_bin_path = state
        .as_ref()
        .map(|value| value.api_bin_path.clone())
        .or_else(|| {
            layout
                .as_ref()
                .map(|resolved| resolved.api_bin_path.display().to_string())
        });
    let cli_bin_path = state
        .as_ref()
        .map(|value| value.cli_bin_path.clone())
        .or_else(|| {
            layout
                .as_ref()
                .map(|resolved| resolved.cli_bin_path.display().to_string())
        });
    let web_dir = state
        .as_ref()
        .map(|value| value.web_dir.clone())
        .or_else(|| {
            layout
                .as_ref()
                .map(|resolved| resolved.web_dir.display().to_string())
        });
    let log_path = state
        .as_ref()
        .map(|value| value.log_path.clone())
        .or_else(|| local_log_path().ok().map(|path| path.display().to_string()));
    let version = state
        .as_ref()
        .and_then(|value| value.version.clone())
        .or_else(|| layout.as_ref().and_then(read_runtime_version));

    Ok(LocalRuntimeStatus {
        installed,
        running,
        healthy,
        pid,
        host: default_host.clone(),
        port: default_port,
        url: runtime_url(&default_host, default_port),
        runtime_dir,
        api_bin_path,
        cli_bin_path,
        web_dir,
        log_path,
        version,
        started_at: state.as_ref().map(|value| value.started_at.clone()),
    })
}

fn state_to_status(
    state: &LocalRuntimeState,
    installed: bool,
    healthy: bool,
) -> LocalRuntimeStatus {
    LocalRuntimeStatus {
        installed,
        running: true,
        healthy,
        pid: Some(state.pid),
        host: state.host.clone(),
        port: state.port,
        url: state.url.clone(),
        runtime_dir: Some(state.runtime_dir.clone()),
        api_bin_path: Some(state.api_bin_path.clone()),
        cli_bin_path: Some(state.cli_bin_path.clone()),
        web_dir: Some(state.web_dir.clone()),
        log_path: Some(state.log_path.clone()),
        version: state.version.clone(),
        started_at: Some(state.started_at.clone()),
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
            if !is_pid_running(process_id) {
                return Err("Local API process exited before becoming ready".to_string());
            }
        }

        if is_runtime_healthy(host, port).await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    Err(format!(
        "Timed out waiting for local API to become healthy at {}",
        runtime_url(host, port)
    ))
}

async fn is_runtime_healthy(host: &str, port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build();
    let Ok(client) = client else {
        return false;
    };
    client
        .get(format!("{}/healthz", runtime_url(host, port)))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn resolve_runtime_process(state: &LocalRuntimeState) -> Option<RuntimeProcessStatus> {
    let pid = resolve_api_process_id_with_hint(
        Path::new(&state.api_bin_path),
        state.port,
        Some(state.pid),
    )?;
    Some(RuntimeProcessStatus {
        pid,
        healthy: is_runtime_healthy(&state.host, state.port).await,
    })
}

fn is_pid_running(pid: u32) -> bool {
    let mut system = System::new_all();
    system.refresh_process(Pid::from_u32(pid));
    system.process(Pid::from_u32(pid)).is_some()
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
    process_command_matches(process, api_bin_path) && process_port_matches(process, port)
}

fn process_command_matches(process: &Process, api_bin_path: &Path) -> bool {
    let expected_name = api_bin_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("api");
    if process.name() != expected_name {
        return false;
    }

    let expected_path = canonical_or_original(api_bin_path);
    if process
        .exe()
        .map(|path| paths_match(path, &expected_path))
        .unwrap_or(false)
    {
        return true;
    }

    process
        .cmd()
        .first()
        .map(|value| paths_match(Path::new(value), &expected_path))
        .unwrap_or(false)
}

fn process_port_matches(process: &Process, port: u16) -> bool {
    let port_text = port.to_string();
    process
        .cmd()
        .windows(2)
        .any(|window| window[0] == "--port" && window[1] == port_text)
        || process
            .cmd()
            .iter()
            .any(|value| value == &format!("--port={port_text}"))
}

fn paths_match(candidate: &Path, expected: &Path) -> bool {
    if candidate.as_os_str().is_empty() {
        return false;
    }

    canonical_or_original(candidate) == expected
}

fn canonical_or_original(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn ensure_runtime_installed(layout: &RuntimeLayout) -> Result<(), String> {
    if !layout.api_bin_path.is_file() {
        return Err(format!(
            "ATMOS local runtime is not installed: missing {}",
            layout.api_bin_path.display()
        ));
    }
    if !layout.cli_bin_path.is_file() {
        return Err(format!(
            "ATMOS local runtime is not installed: missing {}",
            layout.cli_bin_path.display()
        ));
    }
    if !layout.web_dir.is_dir() {
        return Err(format!(
            "ATMOS local runtime is not installed: missing {}",
            layout.web_dir.display()
        ));
    }
    Ok(())
}

fn resolve_runtime_layout() -> Result<RuntimeLayout, String> {
    let runtime_dir = if let Some(path) = std::env::var_os("ATMOS_RUNTIME_DIR").map(PathBuf::from) {
        path
    } else if let Ok(current_exe) = std::env::current_exe() {
        if let Some(bin_dir) = current_exe.parent() {
            if bin_dir.file_name().and_then(|value| value.to_str()) == Some("bin") {
                let install_root = bin_dir.parent().unwrap_or(bin_dir).to_path_buf();
                let bundled_runtime = install_root.join("runtime").join("current");
                if bundled_runtime.join("bin").is_dir() && bundled_runtime.join("web").is_dir() {
                    bundled_runtime
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
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".atmos").join("runtime").join("current"))
}

fn local_state_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".atmos").join("local"))
}

fn local_state_file() -> Result<PathBuf, String> {
    Ok(local_state_dir()?.join("state.json"))
}

fn local_log_path() -> Result<PathBuf, String> {
    Ok(local_state_dir()?.join("logs").join("api.log"))
}

fn read_state_file() -> Result<Option<LocalRuntimeState>, String> {
    let path = local_state_file()?;
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {}", path.display(), error))?;
    serde_json::from_str::<LocalRuntimeState>(&content)
        .map(Some)
        .map_err(|error| format!("Failed to parse {}: {}", path.display(), error))
}

fn write_state_file(state: &LocalRuntimeState) -> Result<(), String> {
    let path = local_state_file()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {}", parent.display(), error))?;
    }
    let content = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize state: {}", error))?;
    fs::write(&path, content)
        .map_err(|error| format!("Failed to write {}: {}", path.display(), error))
}

fn remove_state_file() -> Result<(), String> {
    let path = local_state_file()?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to remove {}: {}", path.display(), error))?;
    }
    Ok(())
}

fn local_process_path(layout: &RuntimeLayout) -> Result<String, String> {
    let mut paths = vec![layout.runtime_dir.join("bin")];
    let installed_bin = dirs::home_dir()
        .map(|home| home.join(".atmos").join("bin"))
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    paths.push(installed_bin);
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    std::env::join_paths(paths)
        .map_err(|error| format!("Failed to construct PATH: {}", error))
        .map(|value| value.to_string_lossy().to_string())
}

fn read_runtime_version(layout: &RuntimeLayout) -> Option<String> {
    fs::read_to_string(&layout.version_file_path)
        .ok()
        .map(|content| content.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn runtime_url(host: &str, port: u16) -> String {
    format!("http://{}:{}", host, port)
}
