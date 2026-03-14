use crate::logging::LogLevel;
use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;

pub struct AppState {
    pub api_port: Mutex<Option<u16>>,
    pub api_token: String,
    pub desktop_log_level: LogLevel,
    pub sidecar_child: Mutex<Option<CommandChild>>,
}
