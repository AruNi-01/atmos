use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn app_log_dir(app: &tauri::AppHandle) -> PathBuf {
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
    use std::io::Write;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "[{ts}] {message}");
    }
}
