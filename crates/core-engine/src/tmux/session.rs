use std::process::Command;

use tracing::{debug, info, warn};

use crate::error::{EngineError, Result};

use super::locale::apply_utf8_env;
use super::{TmuxEngine, TmuxSessionInfo, TmuxWindowInfo};

pub(super) fn session_name_from_workspace_id(workspace_id: &str) -> String {
    workspace_id.replace('-', "_")
}

pub(super) fn parse_workspace_id_from_session_name(session_name: &str) -> String {
    session_name.replace('_', "-")
}

pub(super) fn session_name_from_names(project_name: &str, workspace_name: &str) -> String {
    let project = sanitize_session_component(project_name);
    let workspace = sanitize_session_component(workspace_name);

    if workspace.starts_with(&project)
        && (workspace.len() == project.len() || workspace.as_bytes()[project.len()] == b'_')
    {
        workspace
    } else {
        format!("{}_{}", project, workspace)
    }
}

fn sanitize_session_component(value: &str) -> String {
    value
        .chars()
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
}

impl TmuxEngine {
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

        // Mark session as atmos-managed via tmux user option
        let _ = self.run_tmux(&["set-option", "-t", session_name, "@atmos_managed", "true"]);

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
    pub(super) fn session_name(&self, workspace_id: &str) -> String {
        session_name_from_workspace_id(workspace_id)
    }

    /// Generate session name from project and workspace names
    /// Format: {project_name}_{workspace_name} (sanitized for tmux)
    pub fn session_name_from_names(&self, project_name: &str, workspace_name: &str) -> String {
        session_name_from_names(project_name, workspace_name)
    }

    /// Parse a workspace ID out of a session name.
    ///
    /// This is the inverse of [`Self::session_name`] (which replaces `-` with
    /// `_`). It is **not** the inverse of [`Self::session_name_from_names`] —
    /// that function is lossy because workspace/project names may contain
    /// underscores. Callers that need the canonical workspace lookup should go
    /// through `WorkspaceService::resolve_tmux_session_name`.
    pub fn parse_workspace_id(&self, session_name: &str) -> Option<String> {
        Some(parse_workspace_id_from_session_name(session_name))
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
        let all_sessions = self.list_sessions()?;
        let mut result = vec![];

        for session in all_sessions {
            // Check tmux user option @atmos_managed
            match self.run_tmux(&["show-option", "-t", &session.name, "-qv", "@atmos_managed"]) {
                Ok(output) if output.trim() == "true" => {
                    result.push(session);
                }
                _ => {
                    // Fallback: also match sessions with known atmos prefixes
                    // (for backward compatibility with existing sessions)
                    if session.name.starts_with("atmos_client_") {
                        result.push(session);
                    }
                }
            }
        }

        Ok(result)
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
    use super::{parse_workspace_id_from_session_name, session_name_from_names};

    #[test]
    fn test_session_name_generation() {
        assert_eq!(session_name_from_names("myproj", "myws"), "myproj_myws");

        assert_eq!(
            session_name_from_names("kepano-obsidian", "kepano-obsidian/exeggutor"),
            "kepano-obsidian_exeggutor"
        );

        // Project name `atmos` + workspace `atmos/logysk` collapses to a
        // single `atmos_logysk` (the workspace already starts with the
        // project), not an `atmos_` prefix on top of `atmos_logysk`.
        assert_eq!(
            session_name_from_names("atmos", "atmos/logysk"),
            "atmos_logysk"
        );

        assert_eq!(session_name_from_names("atmos", "other"), "atmos_other");

        assert_eq!(session_name_from_names("atmos", "mankey"), "atmos_mankey");
    }

    #[test]
    fn test_parse_workspace_id() {
        assert_eq!(
            parse_workspace_id_from_session_name("abc_def_123"),
            "abc-def-123".to_string()
        );
    }
}
