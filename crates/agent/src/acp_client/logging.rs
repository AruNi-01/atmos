use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use serde::Serialize;

static ACP_LOG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn acp_log_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("logs")
        .join("acp_agent.log")
}

pub fn append_acp_log<T: Serialize>(
    session_id: &str,
    channel: &str,
    kind: &str,
    payload: &T,
) {
    let Ok(payload_value) = serde_json::to_value(payload) else {
        return;
    };

    let lock = ACP_LOG_LOCK.get_or_init(|| Mutex::new(()));
    let Ok(_guard) = lock.lock() else {
        return;
    };

    let path = acp_log_path();
    if let Some(parent) = path.parent() {
        if create_dir_all(parent).is_err() {
            return;
        }
    }

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };

    let entry = serde_json::json!({
        "ts": Utc::now().to_rfc3339(),
        "session_id": session_id,
        "channel": channel,
        "kind": kind,
        "payload": payload_value,
    });

    let Ok(line) = serde_json::to_string(&entry) else {
        return;
    };

    let _ = writeln!(file, "{line}");
}
