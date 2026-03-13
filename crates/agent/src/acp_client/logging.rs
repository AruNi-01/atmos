use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::OnceLock;
use std::thread;

use serde::Serialize;

struct LogEntry {
    session_id: String,
    channel: String,
    kind: String,
    payload: serde_json::Value,
    timestamp: String,
}

static LOG_SENDER: OnceLock<mpsc::Sender<LogEntry>> = OnceLock::new();

fn acp_log_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("logs")
        .join("acp_agent.log")
}

fn get_log_sender() -> &'static mpsc::Sender<LogEntry> {
    LOG_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<LogEntry>();
        thread::spawn(move || {
            let path = acp_log_path();
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let mut file = match std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
            {
                Ok(f) => f,
                Err(_) => return,
            };
            while let Ok(entry) = rx.recv() {
                let json = serde_json::json!({
                    "timestamp": entry.timestamp,
                    "session_id": entry.session_id,
                    "channel": entry.channel,
                    "kind": entry.kind,
                    "payload": entry.payload,
                });
                if let Ok(line) = serde_json::to_string(&json) {
                    let _ = writeln!(file, "{line}");
                }
            }
        });
        tx
    })
}

pub fn append_acp_log<T: Serialize>(session_id: &str, channel: &str, kind: &str, payload: &T) {
    let Ok(payload_value) = serde_json::to_value(payload) else {
        return;
    };
    let sender = get_log_sender();
    let _ = sender.send(LogEntry {
        session_id: session_id.to_string(),
        channel: channel.to_string(),
        kind: kind.to_string(),
        payload: payload_value,
        timestamp: chrono::Utc::now().to_rfc3339(),
    });
}
