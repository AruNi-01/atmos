//! Tmux Engine - Terminal session persistence layer
//!
//! This module provides a high-level interface for managing tmux sessions,
//! enabling terminal persistence across WebSocket disconnections.
//!
//! # Architecture
//! - Each Atmos workspace maps to a tmux session
//! - Each terminal pane maps to a tmux window
//! - Uses a custom socket path (~/.atmos/tmux.sock) for isolation

pub mod control;

use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;
use tracing::{debug, info, warn};

use serde::{Deserialize, Serialize};

use crate::error::{EngineError, Result};

/// Default socket path for Atmos tmux server
const TMUX_SOCKET_NAME: &str = "atmos";

fn is_utf8_locale(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    upper.contains("UTF-8") || upper.contains("UTF8")
}

fn default_utf8_locale() -> String {
    #[cfg(target_os = "macos")]
    {
        "en_US.UTF-8".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "C.UTF-8".to_string()
    }
}

fn resolve_utf8_locale() -> String {
    std::env::var("LC_CTYPE")
        .ok()
        .filter(|v| is_utf8_locale(v))
        .or_else(|| std::env::var("LANG").ok().filter(|v| is_utf8_locale(v)))
        .unwrap_or_else(default_utf8_locale)
}

fn apply_utf8_env(cmd: &mut Command) {
    let locale = resolve_utf8_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
}

/// Information about a tmux session
#[derive(Debug, Clone, Serialize)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

/// Information about a tmux window
#[derive(Debug, Clone, Serialize)]
pub struct TmuxWindowInfo {
    pub index: u32,
    pub name: String,
    pub active: bool,
    pub panes: u32,
}

/// Snapshot of a tmux pane for initial terminal hydration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxPaneSnapshot {
    pub data: String,
    pub cursor_x: u32,
    pub cursor_y: u32,
    pub cols: u32,
    pub rows: u32,
    pub alternate: bool,
}

/// Tmux version information
#[derive(Debug, Clone, Serialize)]
pub struct TmuxVersion {
    pub major: u32,
    pub minor: u32,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TmuxInstallPlan {
    pub installed: bool,
    pub supported: bool,
    pub platform: String,
    pub package_manager: Option<String>,
    pub package_manager_label: Option<String>,
    pub command: Option<String>,
    pub requires_sudo: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct InstallMethod {
    binary: &'static str,
    label: &'static str,
    command: &'static str,
    requires_sudo: bool,
}

const MACOS_INSTALL_METHODS: &[InstallMethod] = &[InstallMethod {
    binary: "brew",
    label: "Homebrew",
    command: "brew install tmux",
    requires_sudo: false,
}];

const LINUX_INSTALL_METHODS: &[InstallMethod] = &[
    InstallMethod {
        binary: "apt-get",
        label: "apt-get",
        command: "sudo apt-get update && sudo apt-get install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "dnf",
        label: "dnf",
        command: "sudo dnf install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "yum",
        label: "yum",
        command: "sudo yum install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "pacman",
        label: "pacman",
        command: "sudo pacman -S --noconfirm tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "zypper",
        label: "zypper",
        command: "sudo zypper install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "apk",
        label: "apk",
        command: "sudo apk add tmux",
        requires_sudo: true,
    },
];

fn platform_label(os: &str) -> String {
    match os {
        "macos" => "macOS",
        "linux" => "Linux",
        "windows" => "Windows",
        other => other,
    }
    .to_string()
}

fn methods_for_os(os: &str) -> &'static [InstallMethod] {
    match os {
        "macos" => MACOS_INSTALL_METHODS,
        "linux" => LINUX_INSTALL_METHODS,
        _ => &[],
    }
}

fn command_exists(binary: &str) -> bool {
    Command::new(binary).arg("--version").output().is_ok()
}

fn build_install_plan(
    os: &str,
    installed: bool,
    available_commands: &HashSet<&'static str>,
) -> TmuxInstallPlan {
    let platform = platform_label(os);

    if installed {
        return TmuxInstallPlan {
            installed: true,
            supported: false,
            platform,
            package_manager: None,
            package_manager_label: None,
            command: None,
            requires_sudo: false,
            reason: Some("tmux is already installed.".to_string()),
        };
    }

    if let Some(method) = methods_for_os(os)
        .iter()
        .find(|method| available_commands.contains(method.binary))
    {
        return TmuxInstallPlan {
            installed: false,
            supported: true,
            platform,
            package_manager: Some(method.binary.to_string()),
            package_manager_label: Some(method.label.to_string()),
            command: Some(method.command.to_string()),
            requires_sudo: method.requires_sudo,
            reason: None,
        };
    }

    let reason = match os {
        "macos" => {
            Some("Homebrew was not found on the API host. Install Homebrew first or install tmux manually.".to_string())
        }
        "linux" => Some(
            "No supported package manager was detected on the API host. Install tmux manually in a terminal on that machine."
                .to_string(),
        ),
        "windows" => Some(
            "Atmos can only use tmux when the API runs inside a Unix-like environment. Run the API inside WSL or install tmux on the backend host manually."
                .to_string(),
        ),
        _ => Some("Automatic tmux installation is not supported on this platform yet.".to_string()),
    };

    TmuxInstallPlan {
        installed: false,
        supported: false,
        platform,
        package_manager: None,
        package_manager_label: None,
        command: None,
        requires_sudo: false,
        reason,
    }
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

    /// Keep tmux server environment UTF-8 so new shells inside windows render
    /// Nerd Font / Powerline glyphs instead of falling back to ASCII placeholders.
    /// Also injects `ATMOS_MANAGED=1` so agent hook scripts can distinguish
    /// Atmos-managed terminals from external terminals.
    fn sync_utf8_environment(&self) {
        let locale = resolve_utf8_locale();
        let _ = self.run_tmux(&["set-environment", "-g", "LANG", &locale]);
        let _ = self.run_tmux(&["set-environment", "-g", "LC_CTYPE", &locale]);
        let _ = self.run_tmux(&["set-environment", "-g", "ATMOS_MANAGED", "1"]);
    }

    /// Apply the standard tmux configuration options for Atmos sessions.
    ///
    /// Key design decisions:
    /// - **Control mode transport**: tmux sends raw pane output via `%output`,
    ///   so xterm.js receives the application's real terminal stream and builds
    ///   scrollback naturally.
    /// - **xterm TERM inside panes**: applications target xterm.js semantics.
    ///   Several modern full-screen TUIs rely on xterm's background-color erase
    ///   behavior for sparse redraws; `tmux-256color` lacks that capability on
    ///   macOS and leaves stale cells behind in tmux's own pane state.
    /// - **Alternate screen enabled**: TUI apps use the alternate buffer
    ///   normally instead of leaking frames into scrollback.
    /// - **Mouse OFF**: xterm.js handles all scrolling locally (native scrollbar,
    ///   smooth scroll, 10K line buffer). TUI apps that enable their own mouse
    ///   tracking still work because they send escape sequences directly.
    fn apply_standard_config(&self) {
        let _ = self.run_tmux(&["set-option", "-g", "status", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "default-terminal", "xterm-256color"]);
        let _ = self.run_tmux(&["set-option", "-g", "allow-passthrough", "on"]);
        let _ = self.run_tmux(&["set-option", "-g", "mouse", "off"]);
        let _ = self.run_tmux(&["set-option", "-gu", "terminal-features"]);
        let _ = self.run_tmux(&["set-option", "-ga", "terminal-features", "xterm*:RGB"]);
        let _ = self.run_tmux(&["set-option", "-gu", "terminal-overrides"]);
        let _ = self.run_tmux(&["set-option", "-g", "history-limit", "10000"]);
        // Keep automatic sizing enabled for tmux window creation. tmux 3.6a can
        // exit unexpectedly when `new-window` runs with global `window-size
        // manual`; Atmos still pins real browser sizes explicitly after attach.
        let _ = self.run_tmux(&["set-option", "-g", "aggressive-resize", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "window-size", "latest"]);
        let _ = self.run_tmux(&["set-option", "-g", "allow-rename", "off"]);
        let _ = self.run_tmux(&["set-option", "-g", "automatic-rename", "off"]);
    }

    /// Re-apply Atmos' tmux server/session defaults to an existing server.
    ///
    /// This is intentionally idempotent and is called before attach as well as
    /// create, because development sessions may have been created by an older
    /// binary with stale terminal-overrides.
    pub fn ensure_standard_config(&self) {
        self.sync_utf8_environment();
        self.apply_standard_config();
    }

    /// Check if tmux is installed on the system
    pub fn check_installed() -> bool {
        Command::new("tmux")
            .arg("-V")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Detect the best available tmux installation plan for the current host.
    pub fn detect_install_plan() -> TmuxInstallPlan {
        let os = std::env::consts::OS;
        let installed = Self::check_installed();
        let available_commands = methods_for_os(os)
            .iter()
            .filter_map(|method| command_exists(method.binary).then_some(method.binary))
            .collect::<HashSet<_>>();

        build_install_plan(os, installed, &available_commands)
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
    ///
    /// If `shell_command` is provided, it is used as the initial command for the first
    /// window ("1"), enabling shim injection for dynamic terminal titles.
    pub fn create_session(
        &self,
        workspace_id: &str,
        cwd: Option<&str>,
        shell_command: Option<&[String]>,
        env_vars: Option<&[(&str, &str)]>,
    ) -> Result<String> {
        let session_name = self.session_name(workspace_id);
        self.create_session_internal(&session_name, cwd, shell_command, env_vars)
    }

    /// Create a new tmux session with human-readable names
    /// Format: {project_name}_{workspace_name}
    pub fn create_session_with_names(
        &self,
        project_name: &str,
        workspace_name: &str,
        cwd: Option<&str>,
        shell_command: Option<&[String]>,
        env_vars: Option<&[(&str, &str)]>,
    ) -> Result<String> {
        let session_name = self.session_name_from_names(project_name, workspace_name);
        self.create_session_internal(&session_name, cwd, shell_command, env_vars)
    }

    /// Internal function to create tmux session
    fn create_session_internal(
        &self,
        session_name: &str,
        cwd: Option<&str>,
        shell_command: Option<&[String]>,
        env_vars: Option<&[(&str, &str)]>,
    ) -> Result<String> {
        if self.session_exists(session_name)? {
            self.ensure_standard_config();
            info!("Tmux session already exists: {}", session_name);
            return Ok(session_name.to_string());
        }

        let mut args: Vec<String> = vec![
            "new-session".to_string(),
            "-d".to_string(),
            "-s".to_string(),
            session_name.to_string(),
            "-n".to_string(),
            "1".to_string(),
            "-x".to_string(),
            "120".to_string(),
            "-y".to_string(),
            "30".to_string(),
        ];

        if let Some(dir) = cwd {
            args.push("-c".to_string());
            args.push(dir.to_string());
        }

        if let Some(vars) = env_vars {
            for (key, value) in vars {
                args.push("-e".to_string());
                args.push(format!("{}={}", key, value));
            }
        }

        if let Some(cmd) = shell_command {
            for part in cmd {
                args.push(part.clone());
            }
            debug!(
                "Tmux new-session with shim-injected shell for window 1: {:?}",
                cmd
            );
        }

        let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        self.run_tmux(&args_refs)?;
        self.ensure_standard_config();

        info!("Created tmux session: {} (with window '1')", session_name);
        Ok(session_name.to_string())
    }

    /// Create a grouped session that shares windows with a target session
    /// but has its own independent view (active window).
    pub fn create_grouped_session(&self, target_session: &str, new_session: &str) -> Result<()> {
        if self.session_exists(new_session)? {
            return Ok(());
        }

        self.run_tmux(&["new-session", "-d", "-t", target_session, "-s", new_session])?;

        debug!(
            "Created grouped tmux session '{}' linked to '{}'",
            new_session, target_session
        );
        Ok(())
    }

    /// Create a per-client session containing only one linked master window.
    ///
    /// This keeps each browser/control client from participating in the sizing
    /// of every tmux window in the workspace. The linked window remains owned by
    /// the master session; killing the client session only removes this view.
    pub fn create_window_client_session(
        &self,
        target_session: &str,
        window_index: u32,
        new_session: &str,
        cols: u16,
        rows: u16,
    ) -> Result<()> {
        if self.session_exists(new_session)? {
            return Ok(());
        }

        let cols = cols.to_string();
        let rows = rows.to_string();
        self.run_tmux(&[
            "new-session",
            "-d",
            "-s",
            new_session,
            "-n",
            "__atmos_placeholder__",
            "-x",
            &cols,
            "-y",
            &rows,
        ])?;

        let source = format!("{}:{}", target_session, window_index);
        let target = format!("{}:0", new_session);
        self.run_tmux(&["link-window", "-k", "-s", &source, "-t", &target])?;
        self.run_tmux(&["select-window", "-t", &target])?;

        debug!(
            "Created tmux client session '{}' linked to '{}'",
            new_session, source
        );
        Ok(())
    }

    /// Select a specific window in a session
    pub fn select_window(&self, session_name: &str, window_index: u32) -> Result<()> {
        let target = format!("{}:{}", session_name, window_index);
        self.run_tmux(&["select-window", "-t", &target])?;
        Ok(())
    }

    /// Create a new window in a session
    /// Returns the window index
    ///
    /// If `shell_command` is provided, it is used as the shell command for the
    /// new window instead of the default shell. This enables shim injection
    /// for dynamic terminal titles.
    pub fn create_window(
        &self,
        session_name: &str,
        window_name: &str,
        cwd: Option<&str>,
        shell_command: Option<&[String]>,
        env_vars: Option<&[(&str, &str)]>,
    ) -> Result<u32> {
        if !self.session_exists(session_name)? {
            info!("Session {} does not exist, creating it first", session_name);
            let mut session_args: Vec<String> = vec![
                "new-session".to_string(),
                "-d".to_string(),
                "-s".to_string(),
                session_name.to_string(),
                "-n".to_string(),
                "1".to_string(),
                "-x".to_string(),
                "120".to_string(),
                "-y".to_string(),
                "30".to_string(),
            ];
            if let Some(dir) = cwd {
                session_args.push("-c".to_string());
                session_args.push(dir.to_string());
            }
            if let Some(cmd) = shell_command {
                for part in cmd {
                    session_args.push(part.clone());
                }
            }
            let session_args_refs: Vec<&str> = session_args.iter().map(|s| s.as_str()).collect();
            self.run_tmux(&session_args_refs)?;
            self.ensure_standard_config();
        }

        self.ensure_standard_config();

        let mut args: Vec<String> = vec![
            "new-window".to_string(),
            "-t".to_string(),
            session_name.to_string(),
            "-n".to_string(),
            window_name.to_string(),
            "-P".to_string(),
            "-F".to_string(),
            "#{window_index}".to_string(),
        ];
        if let Some(dir) = cwd {
            args.push("-c".to_string());
            args.push(dir.to_string());
        }
        if let Some(vars) = env_vars {
            for (key, value) in vars {
                args.push("-e".to_string());
                args.push(format!("{}={}", key, value));
            }
            debug!(
                "Tmux new-window with env vars: {:?}",
                vars.iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
            );
        }
        if let Some(cmd) = shell_command {
            for part in cmd {
                args.push(part.clone());
            }
            debug!("Tmux new-window with shim-injected shell: {:?}", cmd);
        }

        let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = self.run_tmux(&args_refs)?;

        if output.is_empty() {
            warn!("new-window returned empty output, trying to get window list");
            let windows = self.list_windows(session_name)?;
            if let Some(last_window) = windows.last() {
                info!("Using last window index: {}", last_window.index);
                return Ok(last_window.index);
            }
            return Err(EngineError::Tmux(
                "Failed to create window: no window index returned and no windows found"
                    .to_string(),
            ));
        }

        let index = output.parse::<u32>().map_err(|e| {
            EngineError::Tmux(format!("Failed to parse window index '{}': {}", output, e))
        })?;

        info!(
            "Created tmux window: {}:{} (index: {})",
            session_name, window_name, index
        );
        Ok(index)
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

    /// Capture pane content (scrollback + visible) for reconnection.
    ///
    /// Uses `-e` to preserve ANSI escape sequences (colors, formatting) and
    /// `-N` to preserve trailing spaces. The trailing spaces matter for TUIs:
    /// many of them paint panels by writing background-coloured spaces all the
    /// way to the end of a row.
    /// Returns both scrollback history and visible pane content as a single
    /// string, used by the frontend to restore terminal state after reconnect.
    pub fn capture_pane(
        &self,
        session_name: &str,
        window_index: u32,
        lines: Option<i32>,
        alternate: bool,
    ) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let start_line = if alternate {
            // Even when #{alternate_on}=1, capture the pane's current visible
            // screen without `capture-pane -a`. In tmux 3.6, `-a` can return a
            // stale alternate buffer for modern TUIs after a control-mode attach,
            // while the default capture returns the actual client-visible grid.
            "0".to_string()
        } else {
            lines
                .map(|l| format!("-{}", l))
                .unwrap_or_else(|| "-".to_string())
        };

        let mut args = vec![
            "capture-pane".to_string(),
            "-t".to_string(),
            target,
            "-p".to_string(), // print to stdout
            "-e".to_string(), // include ANSI escape sequences
            "-N".to_string(), // preserve trailing spaces/background cells
        ];
        args.extend([
            "-S".to_string(),
            start_line,
            "-E".to_string(),
            "-".to_string(),
        ]);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();

        let mut content = self.run_tmux_raw(&arg_refs)?;
        if content.ends_with('\n') {
            content.pop();
        }

        Ok(content)
    }

    /// Capture pane content and cursor metadata for initial hydration.
    pub fn capture_pane_snapshot(
        &self,
        session_name: &str,
        window_index: u32,
        lines: Option<i32>,
    ) -> Result<TmuxPaneSnapshot> {
        let target = format!("{}:{}.0", session_name, window_index);
        let metadata = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{cursor_x}|#{cursor_y}|#{pane_width}|#{pane_height}|#{alternate_on}",
        ])?;
        let parts = metadata.split('|').collect::<Vec<_>>();
        let parse_part = |idx: usize| -> u32 {
            parts
                .get(idx)
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(0)
        };
        let rows = parse_part(3);
        let alternate = parts.get(4).is_some_and(|value| value.trim() == "1");
        let capture_lines = if alternate {
            Some(rows.max(1) as i32)
        } else {
            lines
        };
        let data = self.capture_pane(session_name, window_index, capture_lines, alternate)?;

        Ok(TmuxPaneSnapshot {
            data,
            cursor_x: parse_part(0),
            cursor_y: parse_part(1),
            cols: parse_part(2),
            rows,
            alternate,
        })
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
                Ok(())
            }
        }
    }

    /// Kill the entire tmux server (all sessions)
    pub fn kill_server(&self) -> Result<()> {
        match self.run_tmux(&["kill-server"]) {
            Ok(_) => {
                info!("Killed tmux server");
                Ok(())
            }
            Err(e) => {
                warn!("Failed to kill tmux server: {}", e);
                Ok(())
            }
        }
    }

    pub fn kill_session(&self, session_name: &str) -> Result<()> {
        match self.run_tmux(&["kill-session", "-t", session_name]) {
            Ok(_) => {
                info!("Killed tmux session: {}", session_name);
                Ok(())
            }
            Err(e) => {
                warn!("Failed to kill session {}: {}", session_name, e);
                Ok(())
            }
        }
    }

    /// Get the tmux server PID (if running)
    pub fn get_server_pid(&self) -> Option<u32> {
        self.run_tmux(&["display-message", "-p", "#{pid}"])
            .ok()
            .and_then(|s| s.trim().parse().ok())
    }

    /// Get the tmux server start time as epoch seconds (if running)
    pub fn get_server_start_time(&self) -> Option<u64> {
        self.run_tmux(&["display-message", "-p", "#{start_time}"])
            .ok()
            .and_then(|s| s.trim().parse().ok())
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

        let mut cmd = Command::new("tmux");
        cmd.arg("-u")
            .arg("-f")
            .arg("/dev/null")
            .arg("-S")
            .arg(self.socket_arg())
            .args(["has-session", "-t", session_name]);
        apply_utf8_env(&mut cmd);

        let output = cmd
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to execute tmux: {}", e)))?;

        Ok(output.status.success())
    }

    /// Check if a window exists in a session
    pub fn window_exists(&self, session_name: &str, window_index: u32) -> Result<bool> {
        let windows = self.list_windows(session_name)?;
        Ok(windows.iter().any(|w| w.index == window_index))
    }

    /// Generate session name from workspace ID
    fn session_name(&self, workspace_id: &str) -> String {
        workspace_id.replace('-', "_")
    }

    /// Generate session name from project and workspace names
    /// Format: {project_name}_{workspace_name} (sanitized for tmux)
    pub fn session_name_from_names(&self, project_name: &str, workspace_name: &str) -> String {
        let sanitize = |s: &str| -> String {
            s.chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
                .trim_matches('_')
                .to_string()
        };

        let project = sanitize(project_name);
        let workspace = sanitize(workspace_name);

        if workspace.starts_with(&project)
            && (workspace.len() == project.len() || workspace.as_bytes()[project.len()] == b'_')
        {
            workspace
        } else {
            format!("{}_{}", project, workspace)
        }
    }

    /// Parse a workspace ID out of a session name.
    ///
    /// This is the inverse of [`Self::session_name`] (which replaces `-` with
    /// `_`). It is **not** the inverse of [`Self::session_name_from_names`] —
    /// that function is lossy because workspace/project names may contain
    /// underscores. Callers that need the canonical workspace lookup should go
    /// through `WorkspaceService::resolve_tmux_session_name`.
    pub fn parse_workspace_id(&self, session_name: &str) -> Option<String> {
        Some(session_name.replace('_', "-"))
    }

    /// Find a window index by its name in a session
    pub fn find_window_index_by_name(
        &self,
        session_name: &str,
        window_name: &str,
    ) -> Result<Option<u32>> {
        let windows = self.list_windows(session_name)?;
        Ok(windows
            .iter()
            .find(|w| w.name == window_name)
            .map(|w| w.index))
    }

    /// List all Atmos-managed sessions
    /// Note: All sessions on the isolated tmux socket are Atmos-managed
    pub fn list_atmos_sessions(&self) -> Result<Vec<TmuxSessionInfo>> {
        self.list_sessions()
    }

    /// Clean up orphaned sessions (sessions for workspaces that no longer exist)
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
    pub fn rename_window(
        &self,
        session_name: &str,
        window_index: u32,
        new_name: &str,
    ) -> Result<()> {
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
    use std::collections::HashSet;

    #[test]
    fn test_session_name_generation() {
        // Sessions live on the isolated `~/.atmos/tmux.sock` socket, so the
        // session name itself no longer carries an `atmos_` prefix. When a
        // project happens to be literally named "atmos" the resulting session
        // name still starts with "atmos_" — that's the project name, not a
        // legacy prefix.
        let engine = TmuxEngine::new();
        assert_eq!(engine.session_name("abc-def-123"), "abc_def_123");

        assert_eq!(
            engine.session_name_from_names("myproj", "myws"),
            "myproj_myws"
        );

        assert_eq!(
            engine.session_name_from_names("kepano-obsidian", "kepano-obsidian/exeggutor"),
            "kepano-obsidian_exeggutor"
        );

        // Project name `atmos` + workspace `atmos/logysk` collapses to a
        // single `atmos_logysk` (the workspace already starts with the
        // project), not an `atmos_` prefix on top of `atmos_logysk`.
        assert_eq!(
            engine.session_name_from_names("atmos", "atmos/logysk"),
            "atmos_logysk"
        );

        assert_eq!(
            engine.session_name_from_names("atmos", "other"),
            "atmos_other"
        );

        assert_eq!(
            engine.session_name_from_names("atmos", "mankey"),
            "atmos_mankey"
        );
    }

    #[test]
    fn test_parse_workspace_id() {
        let engine = TmuxEngine::new();
        assert_eq!(
            engine.parse_workspace_id("abc_def_123"),
            Some("abc-def-123".to_string())
        );
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
        let installed = TmuxEngine::check_installed();
        println!("tmux installed: {}", installed);
    }

    #[test]
    fn test_install_plan_prefers_homebrew_on_macos() {
        let available = HashSet::from(["brew"]);
        let plan = build_install_plan("macos", false, &available);

        assert!(plan.supported);
        assert_eq!(plan.platform, "macOS");
        assert_eq!(plan.package_manager.as_deref(), Some("brew"));
        assert_eq!(plan.command.as_deref(), Some("brew install tmux"));
        assert!(!plan.requires_sudo);
    }

    #[test]
    fn test_install_plan_prefers_apt_get_on_linux() {
        let available = HashSet::from(["apt-get", "dnf"]);
        let plan = build_install_plan("linux", false, &available);

        assert!(plan.supported);
        assert_eq!(plan.platform, "Linux");
        assert_eq!(plan.package_manager.as_deref(), Some("apt-get"));
        assert_eq!(
            plan.command.as_deref(),
            Some("sudo apt-get update && sudo apt-get install -y tmux")
        );
        assert!(plan.requires_sudo);
    }

    #[test]
    fn test_install_plan_reports_unsupported_without_package_manager() {
        let available = HashSet::new();
        let plan = build_install_plan("linux", false, &available);

        assert!(!plan.supported);
        assert!(plan.command.is_none());
        assert!(plan.reason.is_some());
    }

    #[test]
    fn test_install_plan_reports_already_installed() {
        let available = HashSet::from(["brew"]);
        let plan = build_install_plan("macos", true, &available);

        assert!(plan.installed);
        assert!(!plan.supported);
        assert!(plan.command.is_none());
    }
}
