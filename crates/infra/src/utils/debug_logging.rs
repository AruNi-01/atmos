//! Debug logging utility for PTY / terminal lifecycle investigation.
//!
//! Writes structured, timestamped JSON lines to `./logs/debug/<prefix>-YYYY-MM-DD.log`.
//! Designed to be callable from any crate that depends on `infra` — just obtain a
//! [`DebugLogger`] and call [`DebugLogger::log`].
//!
//! The log directory is created automatically on first write.
//! All I/O errors are silently ignored so this never panics or disrupts normal
//! operation.
//!
//! ## Reuse
//! ```rust,no_run
//! use infra::utils::debug_logging::DebugLogger;
//!
//! let logger = DebugLogger::new("terminal");
//! logger.log("WS_CONNECT", "WebSocket connected", Some(serde_json::json!({
//!     "session_id": "abc123",
//!     "pty_count_before": 12,
//! })));
//! ```

use chrono::Local;
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Lightweight debug logger that appends JSON-line entries to a dated log file.
pub struct DebugLogger {
    log_dir: PathBuf,
    prefix: String,
}

impl DebugLogger {
    /// Create a logger that writes to `./logs/debug/<prefix>-YYYY-MM-DD.log`.
    pub fn new(prefix: &str) -> Self {
        Self {
            log_dir: PathBuf::from("./logs/debug"),
            prefix: prefix.to_string(),
        }
    }

    /// Create a logger that writes to `<log_dir>/<prefix>-YYYY-MM-DD.log`.
    pub fn with_dir(prefix: &str, log_dir: impl AsRef<Path>) -> Self {
        Self {
            log_dir: log_dir.as_ref().to_path_buf(),
            prefix: prefix.to_string(),
        }
    }

    /// Append a log entry.  Never panics — all errors are silently discarded.
    ///
    /// * `category` – short ALL_CAPS label, e.g. `"WS_CONNECT"`, `"CLOSE_SESSION"`
    /// * `msg`      – human-readable description
    /// * `extra`    – optional structured data (serialised inline)
    pub fn log(&self, category: &str, msg: &str, extra: Option<Value>) {
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let filename = format!("{}-{}.log", self.prefix, date_str);
        let path = self.log_dir.join(&filename);

        if fs::create_dir_all(&self.log_dir).is_err() {
            return;
        }

        // Use the same Local::now() source as date_str so the timestamp and
        // filename date always refer to the same calendar day (avoids a
        // mismatch at midnight when UTC is already on the next date).
        let ts = Local::now().format("%H:%M:%S%.3f").to_string();
        let entry = if let Some(ref e) = extra {
            serde_json::json!({
                "ts":  ts,
                "cat": category,
                "msg": msg,
                "data": e,
            })
        } else {
            serde_json::json!({
                "ts":  ts,
                "cat": category,
                "msg": msg,
            })
        };

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = writeln!(file, "{}", entry);
        }
    }
}

// ── Convenience helpers ──────────────────────────────────────────────────────

/// Count the number of PTY slave devices currently present on this host.
///
/// On macOS/Linux the PTY slave devices appear as `/dev/ttys*` (macOS) or
/// `/dev/pts/*` (Linux).  Returns `None` if the directory can't be read.
pub fn count_pty_devices() -> Option<usize> {
    // macOS
    #[cfg(target_os = "macos")]
    {
        if let Ok(rd) = fs::read_dir("/dev") {
            let count = rd
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with("ttys")
                })
                .count();
            return Some(count);
        }
    }

    // Linux — /dev/pts/<number>
    #[cfg(target_os = "linux")]
    {
        if let Ok(rd) = fs::read_dir("/dev/pts") {
            let count = rd
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                })
                .count();
            return Some(count);
        }
    }

    None
}

/// Count live `atmos_client_*` grouped tmux sessions.
/// Returns `None` if `tmux ls` fails (e.g. no server running).
pub fn count_atmos_client_sessions(socket_path: &str) -> Option<usize> {
    let output = std::process::Command::new("tmux")
        .args(["-S", socket_path, "ls", "-F", "#{session_name}"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let count = stdout
        .lines()
        .filter(|l| l.starts_with("atmos_client_"))
        .count();
    Some(count)
}
