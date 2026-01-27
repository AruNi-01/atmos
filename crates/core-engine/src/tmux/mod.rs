//! Tmux Engine - Terminal session persistence layer
//!
//! This module provides a high-level interface for managing tmux sessions,
//! enabling terminal persistence across WebSocket disconnections.
//!
//! # Architecture
//! - Each Atmos workspace maps to a tmux session
//! - Each terminal pane maps to a tmux window
//! - Uses a custom socket path (~/.atmos/tmux.sock) for isolation

use std::path::PathBuf;
use std::process::Command;
use tracing::{debug, info, warn};

use crate::error::{EngineError, Result};

/// Default socket path for Atmos tmux server
const TMUX_SOCKET_NAME: &str = "atmos";

/// Information about a tmux session
#[derive(Debug, Clone)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

/// Information about a tmux window
#[derive(Debug, Clone)]
pub struct TmuxWindowInfo {
    pub index: u32,
    pub name: String,
    pub active: bool,
    pub panes: u32,
}

/// Tmux version information
#[derive(Debug, Clone)]
pub struct TmuxVersion {
    pub major: u32,
    pub minor: u32,
    pub raw: String,
}

impl TmuxVersion {
    /// Check if version is at least the specified major.minor
    pub fn at_least(&self, major: u32, minor: u32) -> bool {
        self.major > major || (self.major == major && self.minor >= minor)
    }
}

/// TmuxEngine handles all tmux operations
#[derive(Debug, Clone)]
pub struct TmuxEngine {
    socket_path: PathBuf,
}

impl Default for TmuxEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl TmuxEngine {
    /// Create a new TmuxEngine with default socket path
    pub fn new() -> Self {
        let socket_dir = dirs::home_dir()
            .map(|h| h.join(".atmos"))
            .unwrap_or_else(|| PathBuf::from("/tmp/.atmos"));
        
        Self {
            socket_path: socket_dir,
        }
    }

    /// Create TmuxEngine with custom socket directory
    pub fn with_socket_dir(socket_dir: PathBuf) -> Self {
        Self {
            socket_path: socket_dir,
        }
    }

    /// Get the full socket path
    fn socket_arg(&self) -> String {
        self.socket_path
            .join(format!("{}.sock", TMUX_SOCKET_NAME))
            .to_string_lossy()
            .to_string()
    }

    /// Ensure the socket directory exists
    fn ensure_socket_dir(&self) -> Result<()> {
        if !self.socket_path.exists() {
            std::fs::create_dir_all(&self.socket_path).map_err(|e| {
                EngineError::Tmux(format!(
                    "Failed to create socket directory {:?}: {}",
                    self.socket_path, e
                ))
            })?;
        }
        Ok(())
    }

    /// Execute a tmux command and return output
    fn run_tmux(&self, args: &[&str]) -> Result<String> {
        self.ensure_socket_dir()?;
        
        let output = Command::new("tmux")
            .arg("-f")
            .arg("/dev/null") // Isolate from local ~/.tmux.conf
            .arg("-S")
            .arg(self.socket_arg())
            .args(args)
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to execute tmux: {}", e)))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            // Some "errors" are expected (e.g., "no server running" when listing empty sessions)
            if stderr.contains("no server running") || stderr.contains("no sessions") {
                Ok(String::new())
            } else {
                Err(EngineError::Tmux(format!("tmux error: {}", stderr)))
            }
        }
    }

    /// Check if tmux is installed on the system
    pub fn check_installed() -> bool {
        Command::new("tmux")
            .arg("-V")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Get tmux version information
    pub fn get_version() -> Result<TmuxVersion> {
        let output = Command::new("tmux")
            .arg("-V")
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to get tmux version: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Tmux("tmux -V failed".to_string()));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Parse version like "tmux 3.4" or "tmux 3.3a"
        let version_str = raw
            .strip_prefix("tmux ")
            .unwrap_or(&raw)
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>();

        let parts: Vec<&str> = version_str.split('.').collect();
        let major = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
        let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

        Ok(TmuxVersion { major, minor, raw })
    }

    /// Create a new tmux session for a workspace
    /// Returns the session name
    pub fn create_session(&self, workspace_id: &str) -> Result<String> {
        let session_name = self.session_name(workspace_id);
        self.create_session_internal(&session_name)
    }

    /// Create a new tmux session with human-readable names
    /// Format: {project_name}_{workspace_name}
    pub fn create_session_with_names(&self, project_name: &str, workspace_name: &str) -> Result<String> {
        let session_name = self.session_name_from_names(project_name, workspace_name);
        self.create_session_internal(&session_name)
    }

    /// Internal function to create tmux session
    fn create_session_internal(&self, session_name: &str) -> Result<String> {
        // Check if session already exists
        if self.session_exists(session_name)? {
            info!("Tmux session already exists: {}", session_name);
            return Ok(session_name.to_string());
        }

        // Create new detached session
        self.run_tmux(&[
            "new-session",
            "-d",
            "-s",
            session_name,
            "-x",
            "120",
            "-y",
            "30",
        ])?;

        // Disable status bar globally for this Atmos tmux server to ensure a clean UI
        // and isolate from any local user preferences.
        self.run_tmux(&["set-option", "-g", "status", "off"])?;
        
        // Disable tmux mouse mode - let xterm.js handle all mouse events
        // This enables unified scrolling where xterm.js scrollbar reflects actual scroll position
        self.run_tmux(&["set-option", "-g", "mouse", "off"])?;
        
        // Disable alternate screen buffer to allow terminal's native scrollback
        // This makes xterm.js scrollbar work properly while keeping tmux persistence
        self.run_tmux(&["set-option", "-g", "terminal-overrides", "xterm*:smcup@:rmcup@"])?;
        
        // Set scrollback buffer in tmux
        self.run_tmux(&["set-option", "-g", "history-limit", "10000"])?;

        info!("Created tmux session: {}", session_name);
        Ok(session_name.to_string())
    }

    /// Create a new window in a session
    /// Returns the window index
    pub fn create_window(&self, session_name: &str, window_name: &str) -> Result<u32> {
        // Ensure session exists
        if !self.session_exists(session_name)? {
            // Try to create the session if it doesn't exist
            info!("Session {} does not exist, creating it first", session_name);
            self.run_tmux(&[
                "new-session",
                "-d",
                "-s",
                session_name,
                "-x",
                "120",
                "-y",
                "30",
            ])?;
            
            // Apply our standard configuration
            let _ = self.run_tmux(&["set-option", "-g", "status", "off"]);
            let _ = self.run_tmux(&["set-option", "-g", "mouse", "off"]);
            let _ = self.run_tmux(&["set-option", "-g", "terminal-overrides", "xterm*:smcup@:rmcup@"]);
            let _ = self.run_tmux(&["set-option", "-g", "history-limit", "10000"]);
        }

        // Create new window
        let output = self.run_tmux(&[
            "new-window",
            "-t",
            session_name,
            "-n",
            window_name,
            "-P",
            "-F",
            "#{window_index}",
        ])?;

        // Handle empty output
        if output.is_empty() {
            warn!("new-window returned empty output, trying to get window list");
            // Try to get the latest window index from the session
            let windows = self.list_windows(session_name)?;
            if let Some(last_window) = windows.last() {
                info!("Using last window index: {}", last_window.index);
                return Ok(last_window.index);
            }
            return Err(EngineError::Tmux(
                "Failed to create window: no window index returned and no windows found".to_string()
            ));
        }

        let index = output
            .parse::<u32>()
            .map_err(|e| EngineError::Tmux(format!("Failed to parse window index '{}': {}", output, e)))?;

        info!(
            "Created tmux window: {}:{} (index: {})",
            session_name, window_name, index
        );
        Ok(index)
    }

    /// Get the PTY device path for a specific window's pane
    /// This is used to bridge PTY I/O with the tmux pane
    pub fn get_pane_tty(&self, session_name: &str, window_index: u32) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let tty = self.run_tmux(&["display-message", "-t", &target, "-p", "#{pane_tty}"])?;

        if tty.is_empty() {
            return Err(EngineError::Tmux(format!(
                "No TTY found for {}",
                target
            )));
        }

        debug!("Got PTY for {}: {}", target, tty);
        Ok(tty)
    }

    /// Send keys (input) to a specific window
    pub fn send_keys(&self, session_name: &str, window_index: u32, keys: &str) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        
        // Use send-keys with literal flag to send raw text
        self.run_tmux(&["send-keys", "-t", &target, "-l", keys])?;
        
        Ok(())
    }

    /// Capture pane content (for potential restore/display)
    pub fn capture_pane(&self, session_name: &str, window_index: u32, lines: Option<i32>) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let start_line = lines.map(|l| format!("-{}", l)).unwrap_or_else(|| "-".to_string());
        
        let content = self.run_tmux(&[
            "capture-pane",
            "-t",
            &target,
            "-p",
            "-S",
            &start_line,
        ])?;

        Ok(content)
    }

    /// Resize a window's pane
    pub fn resize_pane(&self, session_name: &str, window_index: u32, cols: u16, rows: u16) -> Result<()> {
        let target = format!("{}:{}.0", session_name, window_index);
        
        self.run_tmux(&[
            "resize-pane",
            "-t",
            &target,
            "-x",
            &cols.to_string(),
            "-y",
            &rows.to_string(),
        ])?;

        debug!(
            "Resized pane {} to {}x{}",
            target, cols, rows
        );
        Ok(())
    }

    /// Kill a specific window
    pub fn kill_window(&self, session_name: &str, window_index: u32) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        
        match self.run_tmux(&["kill-window", "-t", &target]) {
            Ok(_) => {
                info!("Killed tmux window: {}", target);
                Ok(())
            }
            Err(e) => {
                warn!("Failed to kill window {}: {}", target, e);
                // Don't propagate error if window doesn't exist
                Ok(())
            }
        }
    }

    /// Kill an entire session
    pub fn kill_session(&self, session_name: &str) -> Result<()> {
        match self.run_tmux(&["kill-session", "-t", session_name]) {
            Ok(_) => {
                info!("Killed tmux session: {}", session_name);
                Ok(())
            }
            Err(e) => {
                warn!("Failed to kill session {}: {}", session_name, e);
                // Don't propagate error if session doesn't exist
                Ok(())
            }
        }
    }

    /// List all sessions
    pub fn list_sessions(&self) -> Result<Vec<TmuxSessionInfo>> {
        let output = self.run_tmux(&[
            "list-sessions",
            "-F",
            "#{session_name}|#{session_windows}|#{session_created_string}|#{session_attached}",
        ])?;

        if output.is_empty() {
            return Ok(vec![]);
        }

        let sessions = output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 4 {
                    Some(TmuxSessionInfo {
                        name: parts[0].to_string(),
                        windows: parts[1].parse().unwrap_or(0),
                        created: parts[2].to_string(),
                        attached: parts[3] == "1",
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(sessions)
    }

    /// List windows in a session
    pub fn list_windows(&self, session_name: &str) -> Result<Vec<TmuxWindowInfo>> {
        let output = self.run_tmux(&[
            "list-windows",
            "-t",
            session_name,
            "-F",
            "#{window_index}|#{window_name}|#{window_active}|#{window_panes}",
        ])?;

        if output.is_empty() {
            return Ok(vec![]);
        }

        let windows = output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 4 {
                    Some(TmuxWindowInfo {
                        index: parts[0].parse().unwrap_or(0),
                        name: parts[1].to_string(),
                        active: parts[2] == "1",
                        panes: parts[3].parse().unwrap_or(1),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(windows)
    }

    /// Check if a session exists
    pub fn session_exists(&self, session_name: &str) -> Result<bool> {
        self.ensure_socket_dir()?;
        
        let output = Command::new("tmux")
            .arg("-f")
            .arg("/dev/null")
            .arg("-S")
            .arg(self.socket_arg())
            .args(["has-session", "-t", session_name])
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to execute tmux: {}", e)))?;

        // has-session returns 0 if session exists, 1 otherwise
        Ok(output.status.success())
    }

    /// Check if a window exists in a session
    pub fn window_exists(&self, session_name: &str, window_index: u32) -> Result<bool> {
        let windows = self.list_windows(session_name)?;
        Ok(windows.iter().any(|w| w.index == window_index))
    }

    /// Generate session name from workspace ID or names
    /// Format: {project_name}_{workspace_name} if names provided, otherwise atmos_{workspace_id}
    fn session_name(&self, workspace_id: &str) -> String {
        // Default format using workspace_id
        format!("atmos_{}", workspace_id.replace('-', "_"))
    }

    /// Generate session name from project and workspace names
    /// Format: {project_name}_{workspace_name} (sanitized for tmux)
    pub fn session_name_from_names(&self, project_name: &str, workspace_name: &str) -> String {
        let sanitize = |s: &str| -> String {
            s.chars()
                .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
                .collect::<String>()
                .trim_matches('_')
                .to_string()
        };
        
        let project = sanitize(project_name);
        let workspace = sanitize(workspace_name);
        
        format!("{}_{}", project, workspace)
    }

    /// Parse workspace ID from session name
    pub fn parse_workspace_id(&self, session_name: &str) -> Option<String> {
        session_name
            .strip_prefix("atmos_")
            .map(|s| s.replace('_', "-"))
    }

    /// List all Atmos-managed sessions (those starting with "atmos_")
    pub fn list_atmos_sessions(&self) -> Result<Vec<TmuxSessionInfo>> {
        let all_sessions = self.list_sessions()?;
        Ok(all_sessions
            .into_iter()
            .filter(|s| s.name.starts_with("atmos_"))
            .collect())
    }

    /// Clean up orphaned sessions (sessions for workspaces that no longer exist)
    /// Takes a list of valid workspace IDs
    pub fn cleanup_orphaned_sessions(&self, valid_workspace_ids: &[String]) -> Result<Vec<String>> {
        let sessions = self.list_atmos_sessions()?;
        let mut cleaned = vec![];

        for session in sessions {
            if let Some(workspace_id) = self.parse_workspace_id(&session.name) {
                if !valid_workspace_ids.contains(&workspace_id) {
                    self.kill_session(&session.name)?;
                    cleaned.push(session.name);
                }
            }
        }

        if !cleaned.is_empty() {
            info!("Cleaned up {} orphaned tmux sessions", cleaned.len());
        }

        Ok(cleaned)
    }

    /// Rename a window
    pub fn rename_window(&self, session_name: &str, window_index: u32, new_name: &str) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        self.run_tmux(&["rename-window", "-t", &target, new_name])?;
        debug!("Renamed window {} to {}", target, new_name);
        Ok(())
    }

    /// Get the session name for a workspace
    pub fn get_session_name(&self, workspace_id: &str) -> String {
        self.session_name(workspace_id)
    }

    /// Get the session name from project and workspace names
    pub fn get_session_name_from_names(&self, project_name: &str, workspace_name: &str) -> String {
        self.session_name_from_names(project_name, workspace_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_name_generation() {
        let engine = TmuxEngine::new();
        assert_eq!(
            engine.session_name("abc-def-123"),
            "atmos_abc_def_123"
        );
    }

    #[test]
    fn test_parse_workspace_id() {
        let engine = TmuxEngine::new();
        assert_eq!(
            engine.parse_workspace_id("atmos_abc_def_123"),
            Some("abc-def-123".to_string())
        );
        assert_eq!(engine.parse_workspace_id("other_session"), None);
    }

    #[test]
    fn test_version_at_least() {
        let v = TmuxVersion {
            major: 3,
            minor: 4,
            raw: "tmux 3.4".to_string(),
        };
        assert!(v.at_least(3, 4));
        assert!(v.at_least(3, 3));
        assert!(v.at_least(2, 9));
        assert!(!v.at_least(3, 5));
        assert!(!v.at_least(4, 0));
    }

    #[test]
    fn test_check_installed() {
        // This test depends on system state
        let installed = TmuxEngine::check_installed();
        println!("tmux installed: {}", installed);
    }
}
