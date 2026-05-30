use crate::logging::LogLevel;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use crate::tunnel_connector::manager::TunnelConnectorManager;
use tokio::sync::Notify;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct PersistedWindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub maximized: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DesktopPreviewBridgeState {
    pub session_id: String,
    pub current_url: String,
    pub pick_mode: bool,
}

pub struct AppState {
    pub api_port: Mutex<Option<u16>>,
    pub desktop_log_level: LogLevel,
    pub preview_bridge: Mutex<Option<DesktopPreviewBridgeState>>,
    pub window_state_path: PathBuf,
    pub splash_close_allowed: AtomicBool,
    pub startup_failed: AtomicBool,
    pub theme_ready: AtomicBool,
    pub theme_ready_notify: Notify,
    pub tunnel_connector_manager: TunnelConnectorManager,
}
