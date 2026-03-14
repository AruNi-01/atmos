use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_LOG_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_LOG_FILES: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "error" => Self::Error,
            "warn" | "warning" => Self::Warn,
            "info" => Self::Info,
            _ => Self::Debug,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "DEBUG",
            Self::Info => "INFO",
            Self::Warn => "WARN",
            Self::Error => "ERROR",
        }
    }
}

pub fn compiled_log_level() -> LogLevel {
    LogLevel::parse(option_env!("ATMOS_LOG_LEVEL").unwrap_or("debug"))
}

pub fn app_log_dir(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Some(home_dir) = dirs::home_dir() {
            let bundle_id = if cfg!(debug_assertions) {
                "com.atmos.desktop.dev"
            } else {
                "com.atmos.desktop"
            };
            return home_dir.join("Library").join("Logs").join(bundle_id);
        }
    }

    app.path().app_log_dir().unwrap_or_else(|_| {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".atmos-desktop")
            .join("logs")
    })
}

pub fn app_log_path(app: &tauri::AppHandle, file_name: &str) -> PathBuf {
    let log_dir = app_log_dir(app);
    let _ = std::fs::create_dir_all(&log_dir);
    log_dir.join(file_name)
}

pub fn append_log(path: &Path, message: &str) {
    append_log_with_level(path, LogLevel::Info, message);
}

pub fn append_log_with_level(path: &Path, level: LogLevel, message: &str) {
    use std::io::Write;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    rotate_log_files_if_needed(path, message.len() as u64 + 32);

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "[{ts}] [{}] {message}", level.as_str());
    }
}

fn rotate_log_files_if_needed(path: &Path, incoming_bytes: u64) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };

    if metadata.len().saturating_add(incoming_bytes) <= MAX_LOG_FILE_SIZE_BYTES {
        return;
    }

    let archive_limit = MAX_LOG_FILES.saturating_sub(1);
    if archive_limit == 0 {
        let _ = std::fs::remove_file(path);
        return;
    }

    let oldest_archive = rotated_log_path(path, archive_limit);
    if oldest_archive.exists() {
        let _ = std::fs::remove_file(&oldest_archive);
    }

    for index in (1..archive_limit).rev() {
        let source = rotated_log_path(path, index);
        let target = rotated_log_path(path, index + 1);

        if source.exists() {
            let _ = std::fs::rename(&source, &target);
        }
    }

    let rotated_current = rotated_log_path(path, 1);
    if rotated_current.exists() {
        let _ = std::fs::remove_file(&rotated_current);
    }
    let _ = std::fs::rename(path, rotated_current);
}

fn rotated_log_path(path: &Path, index: usize) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("log");

    let rotated_name = match file_name.rsplit_once('.') {
        Some((stem, extension)) => format!("{stem}.{index}.{extension}"),
        None => format!("{file_name}.{index}"),
    };

    path.with_file_name(rotated_name)
}
