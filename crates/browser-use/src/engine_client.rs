//! Thin control-engine tool caller for the CUA external browser path.
//!
//! Does not depend on desktop-use host internals. Uses the managed engine binary
//! under `~/.atmos/desktop-use` when present (same socket contract as Desktop Use).

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

fn data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_DESKTOP_USE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("desktop-use")
}

pub fn engine_bin() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_DESKTOP_USE_ENGINE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let name = if cfg!(windows) {
        "atmos-desktop-control.exe"
    } else {
        "atmos-desktop-control"
    };
    data_dir().join("bin").join(name)
}

pub fn socket_path() -> PathBuf {
    data_dir().join("engine.sock")
}

pub fn call_tool(tool: &str, args: &Value) -> Result<Value, String> {
    let engine = engine_bin();
    if !engine.is_file() {
        return Err("Control engine is not installed. Run: atmos desktop-use driver ensure".into());
    }
    let socket = socket_path();
    if !socket.exists() {
        // Best-effort daemon start (direct serve; host.app path is Desktop Use concern).
        let _ = Command::new(&engine)
            .args([
                "serve",
                "--socket",
                &socket.display().to_string(),
                "--no-permissions-gate",
            ])
            .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        // Short wait for socket
        for _ in 0..40 {
            if socket.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    call_tool_on(&engine, &socket, tool, args)
}

fn call_tool_on(engine: &Path, socket: &Path, tool: &str, args: &Value) -> Result<Value, String> {
    let args_json = serde_json::to_string(args).map_err(|e| e.to_string())?;
    let output = Command::new(engine)
        .arg("call")
        .arg("--socket")
        .arg(socket.display().to_string())
        .arg(tool)
        .arg(&args_json)
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
        .output()
        .map_err(|e| format!("control engine call failed: {e}"))?;

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
        return Err(msg);
    }
    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true }));
    }
    serde_json::from_str(&stdout)
        .map_err(|e| format!("control engine returned non-JSON success output: {e}; raw={stdout}"))
}
