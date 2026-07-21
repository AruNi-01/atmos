use crate::logging::LogLevel;
use crate::preview_bridge::PreviewBridgeBounds;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use crate::tunnel_connector::manager::TunnelConnectorManager;

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
    pub host_label: String,
    pub bridge_token: String,
    pub pick_mode: bool,
    pub detached: bool,
    pub visible: bool,
    pub bounds: Option<PreviewBridgeBounds>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DesktopPreviewBridgeRegistry {
    pub active_session_id: Option<String>,
    pub surfaces: HashMap<String, DesktopPreviewBridgeState>,
}

pub struct AppState {
    pub api_port: Mutex<Option<u16>>,
    pub desktop_log_level: LogLevel,
    pub preview_bridge: Mutex<DesktopPreviewBridgeRegistry>,
    pub window_state_path: PathBuf,
    pub startup_failed: AtomicBool,
    pub main_hidden_by_close: AtomicBool,
    pub tunnel_connector_manager: TunnelConnectorManager,
    pub browser_cookies: crate::browser_cookies::BrowserCookieCoordinator,
}
