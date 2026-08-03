//! Control-engine host: managed socket daemon + tool calls (Atmos wrap).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::strings::scrub_vendor;

/// Default socket under the Desktop Use data dir.
pub fn default_socket_path(data_dir: &Path) -> PathBuf {
    data_dir.join("engine.sock")
}

pub fn is_daemon_alive(socket: &Path) -> bool {
    socket.exists()
}

/// Start managed control engine daemon if needed.
///
/// Uses `--no-permissions-gate` so Atmos Settings owns the grant UX; the engine
/// still requires OS grants on the **Atmos Desktop Use** host identity for live actions.
pub fn ensure_daemon(engine_bin: &Path, socket: &Path) -> Result<(), String> {
    if !engine_bin.is_file() {
        return Err(scrub_vendor(
            "Control engine is not installed. Run: atmos desktop-use driver ensure",
        ));
    }
    if is_daemon_alive(socket) {
        // Probe with a cheap call.
        if call_tool(engine_bin, socket, "get_config", &serde_json::json!({})).is_ok() {
            return Ok(());
        }
        let _ = stop_daemon(engine_bin, socket);
    }

    if let Some(parent) = socket.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::remove_file(socket);

    let child = Command::new(engine_bin)
        .args([
            "serve",
            "--socket",
            &socket.display().to_string(),
            "--no-permissions-gate",
        ])
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| scrub_vendor(&format!("failed to start control engine: {e}")))?;

    // Detach: don't wait on child; poll socket readiness.
    let _ = child.id();
    std::mem::forget(child);

    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if is_daemon_alive(socket)
            && call_tool(engine_bin, socket, "get_config", &serde_json::json!({})).is_ok()
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(scrub_vendor(
        "Control engine did not become ready. Grant Accessibility and Screen Recording for Atmos Desktop Use in Settings, then retry.",
    ))
}

pub fn stop_daemon(engine_bin: &Path, socket: &Path) -> Result<(), String> {
    if engine_bin.is_file() && socket.exists() {
        let _ = Command::new(engine_bin)
            .args(["stop", "--socket", &socket.display().to_string()])
            .output();
    }
    let _ = fs::remove_file(socket);
    Ok(())
}

/// Invoke a control-engine tool via `call` subcommand.
pub fn call_tool(
    engine_bin: &Path,
    socket: &Path,
    tool: &str,
    args: &Value,
) -> Result<Value, String> {
    let args_json = serde_json::to_string(args).map_err(|e| scrub_vendor(&e.to_string()))?;
    let output = Command::new(engine_bin)
        .args([
            "call",
            "--socket",
            &socket.display().to_string(),
            tool,
            &args_json,
        ])
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
        .output()
        .map_err(|e| scrub_vendor(&format!("control engine call failed: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "control engine call failed".into()
        };
        return Err(scrub_vendor(&msg));
    }
    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true }));
    }
    // Parse JSON if present; otherwise wrap text.
    match serde_json::from_str::<Value>(&stdout) {
        Ok(v) => Ok(v),
        Err(_) => Ok(serde_json::json!({ "ok": true, "raw": stdout })),
    }
}

/// Open system permission grant flow for the rebranded host app when present.
pub fn open_host_permission_grant(
    host_app: Option<&Path>,
    engine_bin: &Path,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(app) = host_app {
            if app.is_dir() {
                let status = Command::new("open")
                    .args(["-n", "-g", "-a"])
                    .arg(app)
                    .args(["--args", "permissions", "grant"])
                    .status()
                    .map_err(|e| scrub_vendor(&e.to_string()))?;
                if status.success() {
                    return Ok(());
                }
            }
        }
        // Fallback: run binary grant (Settings still names Atmos Desktop Use host).
        let _ = Command::new(engine_bin)
            .args(["permissions", "grant"])
            .status();
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (host_app, engine_bin);
        Ok(())
    }
}

pub fn permissions_status_json(engine_bin: &Path, socket: &Path) -> Result<Value, String> {
    if !engine_bin.is_file() {
        return Ok(serde_json::json!({
            "installed": false,
            "accessibility": null,
            "screen_recording": null,
            "host": "Atmos Desktop Use",
        }));
    }
    // Prefer live daemon identity when running.
    let _ = ensure_daemon(engine_bin, socket);
    let output = Command::new(engine_bin)
        .args([
            "permissions",
            "status",
            "--json",
            "--socket",
            &socket.display().to_string(),
        ])
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
        .output()
        .map_err(|e| scrub_vendor(&e.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if let Ok(v) = serde_json::from_str::<Value>(&stdout) {
        return Ok(v);
    }
    Ok(serde_json::json!({
        "installed": true,
        "raw": stdout,
        "host": "Atmos Desktop Use",
        "ok": output.status.success(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn socket_path_under_data_dir() {
        let dir = tempdir().unwrap();
        let sock = default_socket_path(dir.path());
        assert!(sock.ends_with("engine.sock"));
    }
}
