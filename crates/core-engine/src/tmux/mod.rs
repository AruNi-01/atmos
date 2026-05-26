//! Tmux Engine - Terminal session persistence layer
//!
//! This module provides a high-level interface for managing tmux sessions,
//! enabling terminal persistence across WebSocket disconnections.
//!
//! # Architecture
//! - Each Atmos workspace maps to a tmux session
//! - Each terminal pane maps to a tmux window
//! - Uses a custom socket path (~/.atmos/tmux.sock) for isolation

mod capture;
pub mod control;
mod install;
mod locale;
mod session;
mod types;

use std::path::PathBuf;
use std::process::Command;
use tracing::debug;

use crate::error::{EngineError, Result};
use locale::apply_utf8_env;

pub use types::{
    TmuxInstallPlan, TmuxPaneCapturePage, TmuxPaneSnapshot, TmuxSessionInfo, TmuxVersion,
    TmuxWindowInfo,
};

/// Default socket path for Atmos tmux server
const TMUX_SOCKET_NAME: &str = "atmos";

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

    /// Get the full socket file path (public for diagnostics)
    pub fn socket_file_path(&self) -> String {
        self.socket_arg()
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

    /// Execute an arbitrary tmux command (public API for service layer).
    ///
    /// Prefer using dedicated methods (create_window, send_keys, etc.) when available.
    /// This is exposed for one-off commands like `send-keys -X cancel` that don't
    /// warrant their own dedicated method.
    pub fn run_tmux_pub(&self, args: &[&str]) -> Result<String> {
        self.run_tmux(args)
    }

    /// Execute a tmux command and return output
    fn run_tmux(&self, args: &[&str]) -> Result<String> {
        self.run_tmux_output(args)
            .map(|stdout| stdout.trim().to_string())
    }

    /// Execute a tmux command and return raw stdout without trimming.
    fn run_tmux_raw(&self, args: &[&str]) -> Result<String> {
        self.run_tmux_output(args)
    }

    fn run_tmux_output(&self, args: &[&str]) -> Result<String> {
        self.ensure_socket_dir()?;

        let mut cmd = Command::new("tmux");
        cmd.arg("-u")
            .arg("-f")
            .arg("/dev/null") // Isolate from local ~/.tmux.conf
            .arg("-S")
            .arg(self.socket_arg())
            .args(args);
        apply_utf8_env(&mut cmd);

        let output = cmd
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to execute tmux: {}", e)))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
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

    /// Get the PTY device path for a specific window's pane
    pub fn get_pane_tty(&self, session_name: &str, window_index: u32) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let tty = self.run_tmux(&["display-message", "-t", &target, "-p", "#{pane_tty}"])?;

        if tty.is_empty() {
            return Err(EngineError::Tmux(format!("No TTY found for {}", target)));
        }

        debug!("Got PTY for {}: {}", target, tty);
        Ok(tty)
    }

    /// Get the current foreground command running in a pane.
    pub fn get_pane_current_command(
        &self,
        session_name: &str,
        window_index: u32,
    ) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let cmd = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{pane_current_command}",
        ])?;
        debug!("Pane current command for {}: {}", target, cmd);
        Ok(cmd.trim().to_string())
    }

    /// Get the current working directory of a pane.
    pub fn get_pane_current_path(&self, session_name: &str, window_index: u32) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let path = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{pane_current_path}",
        ])?;
        debug!("Pane current path for {}: {}", target, path);
        Ok(path.trim().to_string())
    }

    /// Send keys (input) to a specific window
    pub fn send_keys(&self, session_name: &str, window_index: u32, keys: &str) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        self.run_tmux(&["send-keys", "-t", &target, "-l", keys])?;
        Ok(())
    }

    /// Send raw text bytes to a specific window using tmux hex input.
    ///
    /// This avoids interpolating arbitrary text through shell command strings.
    pub fn send_text_to_window(
        &self,
        session_name: &str,
        window_index: u32,
        text: &str,
    ) -> Result<()> {
        let pane_id = self.get_pane_id(session_name, window_index)?;
        for chunk in text.as_bytes().chunks(64) {
            let hex_args = chunk
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<Vec<_>>();
            let mut args = vec![
                "send-keys".to_string(),
                "-t".to_string(),
                pane_id.clone(),
                "-H".to_string(),
            ];
            args.extend(hex_args);
            let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
            self.run_tmux(&refs)?;
        }
        Ok(())
    }

    /// Send Ctrl-C to a specific window's first pane.
    pub fn interrupt_window(&self, session_name: &str, window_index: u32) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        self.run_tmux(&["send-keys", "-t", &target, "C-c"])?;
        Ok(())
    }

    /// Return an existing window by name, or create it when missing.
    pub fn ensure_window_named(
        &self,
        session_name: &str,
        cwd: Option<&str>,
        window_name: &str,
    ) -> Result<u32> {
        if let Some(index) = self.find_window_index_by_name(session_name, window_name)? {
            return Ok(index);
        }
        self.create_window(session_name, window_name, cwd, None, None)
    }

    /// Return the stable tmux pane id (for example `%0`) for a window's first pane.
    pub fn get_pane_id(&self, session_name: &str, window_index: u32) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        self.run_tmux(&["display-message", "-t", &target, "-p", "#{pane_id}"])
    }

    /// Return the current pane grid size for a window's first pane.
    pub fn get_pane_size(&self, session_name: &str, window_index: u32) -> Result<(u16, u16)> {
        let target = format!("{}:{}.0", session_name, window_index);
        let output = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{pane_width}|#{pane_height}",
        ])?;
        let mut parts = output.split('|');
        let cols = parts
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(120);
        let rows = parts
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(30);
        Ok((cols, rows))
    }

    /// Resize a window's pane
    pub fn resize_pane(
        &self,
        session_name: &str,
        window_index: u32,
        cols: u16,
        rows: u16,
    ) -> Result<()> {
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

        debug!("Resized pane {} to {}x{}", target, cols, rows);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_name_generation() {
        // Sessions live on the isolated `~/.atmos/tmux.sock` socket, so the
        // session name itself no longer carries an `atmos_` prefix. When a
        // project happens to be literally named "atmos" the resulting session
        // name still starts with "atmos_" — that's the project name, not a
        // legacy prefix.
        let engine = TmuxEngine::new();
        assert_eq!(engine.session_name("abc-def-123"), "abc_def_123");
    }

    #[test]
    fn test_check_installed() {
        let installed = TmuxEngine::check_installed();
        println!("tmux installed: {}", installed);
    }
}
