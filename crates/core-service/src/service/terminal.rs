//! Terminal Service - PTY session management with tmux persistence
//!
//! This service handles creating, managing, and destroying terminal sessions
//! that connect to tmux for persistence and communicate over WebSocket.
//!
//! Design:
//! - Each terminal session maps to a tmux window
//! - PTY operations run in dedicated threads, communicating via channels
//! - Closing a session detaches the PTY but keeps the tmux window alive

use crate::error::{Result, ServiceError};
use core_engine::{TmuxEngine, TmuxPaneSnapshot, TmuxWindowAtmosMetadata};
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

mod management;
mod mouse_mode_watch;
mod run_log_tee;
mod runtime;
mod text_capture;
mod types;

use mouse_mode_watch::{pane_watch_key, MouseModeWatchRegistry};
use run_log_tee::is_run_window_name as run_window_name_matches;
pub use run_log_tee::{is_run_window_name, latest_log_path, RunLogTee};
use runtime::{run_control_mode_tmux_session, run_simple_pty_session};
pub use text_capture::{
    process_captured_pane_text, select_transcript, strip_ansi_and_controls, TranscriptBudget,
};
pub use types::{
    AttachSessionParams, CapturePanePlainTextParams, CaptureSideContextParams,
    CapturedPanePlainText, CapturedSideContext, CreateSessionParams, CreateSimpleSessionParams,
    SessionDetail, SessionType, TerminalKind, TerminalMessage, TerminalResponse,
    TerminalSideChatRecord, TerminalSideChatStatus, UpsertTerminalSideChatParams,
};
use types::{SessionCommand, SessionHandle};

const MIN_BROWSER_COLS: u16 = 20;
const MIN_BROWSER_ROWS: u16 = 8;

fn is_usable_browser_size(cols: u16, rows: u16) -> bool {
    cols >= MIN_BROWSER_COLS && rows >= MIN_BROWSER_ROWS
}

fn validate_side_chat_id(value: &str) -> Result<()> {
    let len = value.len();
    if !(6..=96).contains(&len) {
        return Err(ServiceError::Validation(
            "side_chat_id length must be between 6 and 96 bytes".to_string(),
        ));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':'))
    {
        return Err(ServiceError::Validation(
            "side_chat_id must use URL-safe ASCII characters".to_string(),
        ));
    }
    Ok(())
}

/// Terminal service managing all PTY sessions with tmux persistence
/// This struct is Send + Sync safe
pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    tmux_engine: Arc<TmuxEngine>,
    default_cols: u16,
    default_rows: u16,
    /// Per-workspace locks to prevent concurrent session creation race conditions
    /// Key: tmux_session_name (derived from workspace), Value: lock for that session
    creation_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    /// Directory where shell shim scripts are installed (for dynamic title injection)
    shims_dir: Option<PathBuf>,
    db: Option<Arc<DatabaseConnection>>,
    /// Optional agent-hooks service so pane destroy can clear hook sessions.
    agent_hooks: std::sync::RwLock<Option<Arc<super::agent_hooks::AgentHooksService>>>,
    /// Detached pane watchers that keep DEC mouse modes fresh while no browser is attached (APP-054).
    mouse_mode_watches: Arc<MouseModeWatchRegistry>,
    /// APP-055: project-local Run terminal log tee (single writer).
    run_log_tee: Arc<RunLogTee>,
}

impl Default for TerminalService {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalService {
    /// Create a new terminal service
    pub fn new() -> Self {
        // Install shell shims for dynamic terminal titles
        let shims_dir = match core_engine::shims::ensure_installed() {
            Ok(dir) => Some(dir),
            Err(e) => {
                warn!(
                    "Failed to install shell shims (dynamic titles disabled): {}",
                    e
                );
                None
            }
        };

        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            tmux_engine: Arc::new(TmuxEngine::new()),
            default_cols: 120,
            default_rows: 30,
            creation_locks: Arc::new(Mutex::new(HashMap::new())),
            shims_dir,
            db: None,
            agent_hooks: std::sync::RwLock::new(None),
            mouse_mode_watches: Arc::new(MouseModeWatchRegistry::new()),
            run_log_tee: Arc::new(RunLogTee::new()),
        }
    }

    pub fn new_with_db(db: Arc<DatabaseConnection>) -> Self {
        Self::new_internal(None, Some(db))
    }

    /// APP-055: rotate/open latest Run log and write a start header.
    pub fn run_log_start(
        &self,
        project_root: &str,
        window_name: &str,
        command: Option<&str>,
    ) -> Result<String> {
        let root = PathBuf::from(project_root.trim());
        if root.as_os_str().is_empty() {
            return Err(ServiceError::Validation(
                "project_root is required".to_string(),
            ));
        }
        let path = self
            .run_log_tee
            .start_run(&root, window_name, command, Some(project_root))
            .map_err(|e| ServiceError::Processing(format!("Failed to start run log: {}", e)))?;
        Ok(path.to_string_lossy().into_owned())
    }

    /// APP-055: resolve preferred latest Run log under project root (if any).
    pub fn run_log_resolve_latest(&self, project_root: &str) -> Option<String> {
        let root = PathBuf::from(project_root.trim());
        if root.as_os_str().is_empty() {
            return None;
        }
        RunLogTee::resolve_latest_path(&root).map(|p| p.to_string_lossy().into_owned())
    }

    fn maybe_bridge_run_log_output(
        &self,
        output_tx: mpsc::UnboundedSender<Vec<u8>>,
        project_root: Option<String>,
        window_name: Option<String>,
    ) -> mpsc::UnboundedSender<Vec<u8>> {
        let Some(root) = project_root.filter(|r| !r.trim().is_empty()) else {
            return output_tx;
        };
        let Some(window) = window_name.filter(|w| run_window_name_matches(w)) else {
            return output_tx;
        };
        let tee = Arc::clone(&self.run_log_tee);
        let (bridged_tx, mut bridged_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        tokio::spawn(async move {
            let root_path = PathBuf::from(&root);
            while let Some(data) = bridged_rx.recv().await {
                tee.append(&root_path, &window, &data);
                if output_tx.send(data).is_err() {
                    break;
                }
            }
        });
        bridged_tx
    }

    /// Wire agent-hooks cleanup when terminal panes / tmux windows are destroyed.
    pub fn set_agent_hooks_service(&self, service: Arc<super::agent_hooks::AgentHooksService>) {
        *self.agent_hooks.write().expect("agent_hooks lock") = Some(service);
    }

    pub(super) fn clear_agent_hooks_for_pane(&self, workspace_id: &str, terminal_name: &str) {
        if workspace_id.is_empty() || terminal_name.is_empty() {
            return;
        }
        let stable_pane_id = format!("{}:{}", workspace_id, terminal_name);
        if let Ok(guard) = self.agent_hooks.read() {
            if let Some(hooks) = guard.as_ref() {
                hooks.clear_sessions_for_stable_pane(&stable_pane_id);
            }
        }
    }

    /// Create terminal service with custom TmuxEngine
    pub fn with_tmux_engine(tmux_engine: Arc<TmuxEngine>) -> Self {
        Self::new_internal(Some(tmux_engine), None)
    }

    pub fn with_tmux_engine_and_db(
        tmux_engine: Arc<TmuxEngine>,
        db: Arc<DatabaseConnection>,
    ) -> Self {
        Self::new_internal(Some(tmux_engine), Some(db))
    }

    fn new_internal(
        tmux_engine: Option<Arc<TmuxEngine>>,
        db: Option<Arc<DatabaseConnection>>,
    ) -> Self {
        // Install shell shims for dynamic terminal titles
        let shims_dir = match core_engine::shims::ensure_installed() {
            Ok(dir) => Some(dir),
            Err(e) => {
                warn!(
                    "Failed to install shell shims (dynamic titles disabled): {}",
                    e
                );
                None
            }
        };

        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            tmux_engine: tmux_engine.unwrap_or_else(|| Arc::new(TmuxEngine::new())),
            default_cols: 120,
            default_rows: 30,
            creation_locks: Arc::new(Mutex::new(HashMap::new())),
            shims_dir,
            db,
            agent_hooks: std::sync::RwLock::new(None),
            mouse_mode_watches: Arc::new(MouseModeWatchRegistry::new()),
            run_log_tee: Arc::new(RunLogTee::new()),
        }
    }

    /// Stop detached mouse-mode watch so a live control client owns observation.
    pub(super) fn stop_mouse_mode_watch_for_window(&self, tmux_session: &str, window_index: u32) {
        let key = pane_watch_key(tmux_session, window_index);
        self.mouse_mode_watches.stop_for_pane(&key);
    }

    /// When no browser session remains for this master window, keep observing mouse modes.
    ///
    /// `remaining` is the sessions map **after** the closing handle was removed.
    pub(super) async fn ensure_mouse_mode_watch_if_unattached(
        &self,
        tmux_session: &str,
        window_index: u32,
    ) {
        let still_live = {
            let sessions = self.sessions.lock().await;
            sessions.values().any(|h| {
                h.tmux_session.as_deref() == Some(tmux_session)
                    && h.tmux_window_index == Some(window_index)
            })
        };
        if still_live {
            return;
        }
        let pane_id = match self.tmux_engine.get_pane_id(tmux_session, window_index) {
            Ok(id) => id,
            Err(error) => {
                debug!(
                    "Skip mouse-mode watch for {}:{} (no pane id): {}",
                    tmux_session, window_index, error
                );
                return;
            }
        };
        let key = pane_watch_key(tmux_session, window_index);
        self.mouse_mode_watches.ensure_for_pane(
            key,
            tmux_session.to_string(),
            window_index,
            pane_id,
            self.tmux_engine.socket_file_path(),
        );
    }

    /// Get the TmuxEngine reference
    pub fn tmux_engine(&self) -> Arc<TmuxEngine> {
        self.tmux_engine.clone()
    }

    /// Get or create a lock for a specific tmux session
    /// This ensures only one session creation happens at a time per workspace
    /// Also performs cleanup of stale locks as a safety net (for error paths that skip release_creation_lock)
    async fn get_creation_lock(&self, tmux_session_name: &str) -> Arc<Mutex<()>> {
        let mut locks = self.creation_locks.lock().await;

        // Safety net cleanup: remove locks that are no longer in use (only HashMap holds a reference)
        // This handles cases where release_creation_lock was not called (e.g., early error return)
        locks.retain(|_, lock| Arc::strong_count(lock) > 1);

        locks
            .entry(tmux_session_name.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    /// Release the creation lock for a specific tmux session
    /// This removes the lock from the HashMap to free memory
    async fn release_creation_lock(&self, tmux_session_name: &str) {
        let mut locks = self.creation_locks.lock().await;
        // Only remove if no other thread is holding a reference to this lock
        if let Some(lock) = locks.get(tmux_session_name) {
            // strong_count == 1 means only HashMap holds it (our local clone was dropped)
            // But we need to check after dropping our reference, so we check for <= 2
            // (HashMap + possibly one active user who is about to release)
            if Arc::strong_count(lock) <= 2 {
                locks.remove(tmux_session_name);
                debug!(
                    "Cleaned up creation lock for tmux session: {}",
                    tmux_session_name
                );
            }
        }
    }

    /// Check if tmux is available
    pub fn is_tmux_available(&self) -> bool {
        TmuxEngine::check_installed()
    }

    /// Get tmux version info
    pub fn get_tmux_version(&self) -> Result<core_engine::TmuxVersion> {
        TmuxEngine::get_version().map_err(|e| ServiceError::Processing(e.to_string()))
    }

    /// Resolve the stable master tmux session for a workspace.
    ///
    /// Prefer the canonical `{project.name}_{workspace.name}` form from the DB
    /// so transient frontend display names (or missing query params during early
    /// hydration) cannot create a second empty session and lose the live TUI
    /// agent that is still running in the real session.
    async fn resolve_tmux_session_name(
        &self,
        workspace_id: &str,
        project_name: Option<&str>,
        workspace_name: Option<&str>,
    ) -> String {
        let mut candidates = Vec::new();

        if let Some(db) = self.db.as_ref() {
            let workspace_repo = WorkspaceRepo::new(db);
            if let Ok(Some(workspace)) = workspace_repo.find_by_guid(workspace_id).await {
                let project_repo = ProjectRepo::new(db);
                if let Ok(Some(project)) = project_repo.find_by_guid(&workspace.project_guid).await
                {
                    candidates.push(
                        self.tmux_engine
                            .get_session_name_from_names(&project.name, &workspace.name),
                    );
                }
            }
        }

        if let (Some(project), Some(workspace)) = (project_name, workspace_name) {
            candidates.push(
                self.tmux_engine
                    .get_session_name_from_names(project, workspace),
            );
        }

        candidates.push(self.tmux_engine.get_session_name(workspace_id));
        // Preserve priority order: DB canonical name, then frontend names, then
        // workspace-id fallback. Only drop exact duplicates.
        let mut deduped = Vec::new();
        for candidate in candidates {
            if !deduped.iter().any(|existing| existing == &candidate) {
                deduped.push(candidate);
            }
        }
        let candidates = deduped;

        if let Ok(sessions) = self.tmux_engine.list_sessions() {
            for candidate in &candidates {
                if sessions.iter().any(|session| session.name == *candidate) {
                    if Some(candidate) != candidates.first() {
                        info!(
                            "Resolved workspace {} to existing tmux session {} (preferred candidate was {:?})",
                            workspace_id,
                            candidate,
                            candidates.first()
                        );
                    }
                    return candidate.clone();
                }
            }
        }

        candidates
            .into_iter()
            .next()
            .unwrap_or_else(|| self.tmux_engine.get_session_name(workspace_id))
    }

    /// Detect the best available tmux installation plan for the current API host.
    pub fn get_tmux_install_plan(&self) -> core_engine::TmuxInstallPlan {
        TmuxEngine::detect_install_plan()
    }

    /// Create a new terminal session with tmux persistence
    /// Returns a receiver for terminal output
    pub async fn create_session(
        &self,
        params: CreateSessionParams,
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<TmuxPaneSnapshot>)> {
        let CreateSessionParams {
            session_id,
            workspace_id,
            shell,
            cols,
            rows,
            project_name,
            workspace_name,
            window_name,
            cwd,
            terminal_kind,
            side_chat_id,
            source_pane_id,
            source_tmux_window_name,
        } = params;
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        if terminal_kind == TerminalKind::SideChat {
            let side_chat_id = side_chat_id.as_deref().ok_or_else(|| {
                ServiceError::Validation("side_chat_id is required for side chat terminals".into())
            })?;
            validate_side_chat_id(side_chat_id)?;
            if source_tmux_window_name
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
            {
                return Err(ServiceError::Validation(
                    "source_tmux_window_name is required for side chat terminals".into(),
                ));
            }
        }

        // Compute tmux session name (without creating it yet) so we can acquire lock first
        let tmux_session_name = self
            .resolve_tmux_session_name(
                &workspace_id,
                project_name.as_deref(),
                workspace_name.as_deref(),
            )
            .await;

        // Acquire per-workspace creation lock BEFORE creating session to prevent race conditions
        // This ensures only one session/window creation happens at a time per workspace
        let creation_lock = self.get_creation_lock(&tmux_session_name).await;
        let _guard = creation_lock.lock().await;

        // NOW check if session_id is already active in our service (while holding workspace lock)
        // If so, just attach to it. This handles duplicate mount calls (e.g. React Strict Mode)
        {
            let sessions = self.sessions.lock().await;
            if let Some(_handle) = sessions.get(&session_id) {
                info!(
                    "Session {} already active, reusing existing handle",
                    session_id
                );
                drop(sessions);
                // Use internal attach to avoid deadlock since we already hold the guard
                let res = match self
                    .attach_session_internal(
                        session_id.clone(),
                        workspace_id.clone(),
                        None,
                        window_name.clone(),
                        Some(cols),
                        Some(rows),
                        project_name.clone(),
                        workspace_name.clone(),
                        cwd.clone(),
                    )
                    .await
                {
                    Ok((rx, snapshot)) => Ok((rx, snapshot)),
                    Err(e) => Err(ServiceError::Processing(format!(
                        "Failed to attach to existing session {}: {}",
                        session_id, e
                    ))),
                };

                // Clean up lock from HashMap before returning
                self.release_creation_lock(&tmux_session_name).await;
                return res;
            }
        }

        info!(
            "Creating terminal session: {} for workspace: {} ({}x{})",
            session_id, workspace_id, cols, rows
        );

        debug!(
            "Acquired creation lock for tmux session: {}",
            tmux_session_name
        );

        // Build shell command with shim injection (for both session and window creation)
        let shell_command = self
            .shims_dir
            .as_ref()
            .and_then(|dir| core_engine::shims::build_shell_command(dir, shell.as_deref()));

        // Now create or get tmux session for this workspace (protected by lock)
        // Pass shell_command so the first window "1" also gets shim injection.
        // Pass ATMOS env vars so the default window "1" gets them too — otherwise
        // the "window already exists → attach" shortcut below would skip injection.
        let default_window_pane_id = format!("{}:1", workspace_id);
        // Always export side-chat identity keys (empty on normal panes) so agent
        // hook runners that require referenced env vars (notably Grok Build)
        // still execute Atmos status hooks.
        //
        // Disable Grok's Claude/Cursor *compat hooks* via process env only
        // (precedence: env > config.toml). Does not edit ~/.grok/config.toml, so
        // non-Atmos Grok still honors the user's global compat settings. Native
        // ~/.grok/hooks/* (including atmos-hooks) still load.
        let session_env_vars: Vec<(&str, &str)> = vec![
            ("ATMOS_MANAGED", "1"),
            ("ATMOS_CONTEXT_ID", &workspace_id),
            ("ATMOS_PANE_ID", &default_window_pane_id),
            ("ATMOS_TERMINAL_KIND", ""),
            ("ATMOS_SIDE_CHAT_ID", ""),
            ("ATMOS_SOURCE_PANE_ID", ""),
            ("GROK_CLAUDE_HOOKS_ENABLED", "0"),
            ("GROK_CURSOR_HOOKS_ENABLED", "0"),
            // Codex hooks cell is reserved/inert today; set for forward-compat.
            ("GROK_CODEX_HOOKS_ENABLED", "0"),
        ];
        // Always open the already-resolved stable session name. Do not re-derive
        // from potentially display-name based frontend params.
        let tmux_session = self
            .tmux_engine
            .create_named_session(
                &tmux_session_name,
                cwd.as_deref(),
                shell_command.as_deref(),
                Some(&session_env_vars),
            )
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to create tmux session: {}", e))
            })?;

        // Create a new tmux window for this terminal pane
        // If a window_name is provided and already exists in tmux, ATTACH to it instead of creating a new one
        // This prevents duplicate window creation during React Strict Mode double-mounts or page refreshes
        let existing_windows = self
            .tmux_engine
            .list_windows(&tmux_session)
            .unwrap_or_default();
        let existing_names: std::collections::HashSet<String> =
            existing_windows.iter().map(|w| w.name.clone()).collect();

        debug!(
            "Existing windows for session '{}': {:?}",
            tmux_session, existing_names
        );

        // Check if we should attach to an existing window instead of creating a new one
        if let Some(ref name) = window_name {
            if existing_names.contains(name) {
                // Window with this name already exists - attach to it instead of creating a duplicate
                info!(
                    "Window '{}' already exists in session '{}', attaching instead of creating",
                    name, tmux_session
                );

                // Use internal attach to avoid deadlock since we already hold the guard
                let result = self
                    .attach_session_internal(
                        session_id.clone(),
                        workspace_id.clone(),
                        None,
                        Some(name.clone()),
                        Some(cols),
                        Some(rows),
                        project_name.clone(),
                        workspace_name.clone(),
                        cwd.clone(),
                    )
                    .await;

                // Clean up lock from HashMap
                self.release_creation_lock(&tmux_session).await;

                return match result {
                    Ok((rx, snapshot)) => Ok((rx, snapshot)),
                    Err(e) => Err(ServiceError::Processing(format!(
                        "Failed to attach to existing window '{}': {}",
                        name, e
                    ))),
                };
            }
        }

        let final_window_name = if let Some(name) = window_name {
            // Window doesn't exist, use the provided name
            name
        } else {
            // Auto-increment: use next available number
            let mut num = existing_windows.len() + 1;
            while existing_names.contains(&num.to_string()) {
                num += 1;
            }
            num.to_string()
        };

        info!(
            "Assigning tmux window: {} for session: {}",
            final_window_name, session_id
        );

        // Use a stable pane ID based on workspace_id + window_name so that
        // ATMOS_PANE_ID remains consistent across page reloads / reconnects.
        // The frontend session_id is a per-connection UUID that changes on every
        // reconnect, making it useless as a stable hook key.
        let stable_pane_id = format!("{}:{}", workspace_id, final_window_name);
        let computed_source_pane_id = source_tmux_window_name
            .as_ref()
            .map(|name| format!("{}:{}", workspace_id, name));
        let source_pane_id_value = source_pane_id
            .as_deref()
            .or(computed_source_pane_id.as_deref());
        // Always export side-chat keys; empty on normal panes. Grok Build treats
        // bare `$VAR` in hook commands as required and skips the hook if unset.
        let terminal_kind_value = if terminal_kind == TerminalKind::SideChat {
            "side_chat"
        } else {
            ""
        };
        let side_chat_id_value = if terminal_kind == TerminalKind::SideChat {
            side_chat_id.as_deref().unwrap_or("")
        } else {
            ""
        };
        let source_pane_env_value = if terminal_kind == TerminalKind::SideChat {
            source_pane_id_value.unwrap_or("")
        } else {
            ""
        };
        let atmos_env_vars: Vec<(&str, &str)> = vec![
            ("ATMOS_MANAGED", "1"),
            ("ATMOS_CONTEXT_ID", &workspace_id),
            ("ATMOS_PANE_ID", &stable_pane_id),
            ("ATMOS_TERMINAL_KIND", terminal_kind_value),
            ("ATMOS_SIDE_CHAT_ID", side_chat_id_value),
            ("ATMOS_SOURCE_PANE_ID", source_pane_env_value),
            // Session-scoped only: suppress Grok foreign-vendor hook scan
            // without mutating ~/.grok/config.toml (see session_env_vars above).
            ("GROK_CLAUDE_HOOKS_ENABLED", "0"),
            ("GROK_CURSOR_HOOKS_ENABLED", "0"),
            ("GROK_CODEX_HOOKS_ENABLED", "0"),
        ];
        let window_index = self
            .tmux_engine
            .create_window(
                &tmux_session,
                &final_window_name,
                cwd.as_deref(),
                shell_command.as_deref(),
                Some(&atmos_env_vars),
            )
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to create tmux window: {}", e))
            })?;

        if terminal_kind == TerminalKind::SideChat {
            let metadata = TmuxWindowAtmosMetadata {
                terminal_kind: Some("side_chat".to_string()),
                side_chat_id: side_chat_id.clone(),
                context_id: Some(workspace_id.clone()),
                source_pane_id: source_pane_id_value.map(ToOwned::to_owned),
                source_tmux_window_name: source_tmux_window_name.clone(),
            };
            if let Err(error) =
                self.tmux_engine
                    .set_window_atmos_metadata(&tmux_session, window_index, &metadata)
            {
                warn!(
                    "Failed to set side chat tmux metadata for {}:{}: {}",
                    tmux_session, window_index, error
                );
            }
        }

        // Now attach to this tmux window via tmux control mode.
        // We keep the guard until AFTER attach_to_tmux_window completes, which inserts into self.sessions
        // This ensures a subsequent request for the same session_id will see it in the map
        let result = self
            .attach_to_tmux_window(
                session_id,
                workspace_id,
                tmux_session.clone(),
                window_index,
                shell,
                cols,
                rows,
                false,
                project_name,
                workspace_name,
                Some(final_window_name),
                cwd,
                terminal_kind,
                side_chat_id,
                source_pane_id_value.map(ToOwned::to_owned),
                source_tmux_window_name,
            )
            .await;
        let snapshot = if result.is_ok() {
            self.capture_snapshot_after_attach(&tmux_session, window_index)
                .await
        } else {
            None
        };

        // Clean up lock from HashMap
        self.release_creation_lock(&tmux_session).await;

        result.map(|rx| (rx, snapshot))
    }

    /// Create a new simple terminal session (NO tmux persistence)
    /// Returns a receiver for terminal output
    pub async fn create_simple_session(
        &self,
        params: CreateSimpleSessionParams,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        let CreateSimpleSessionParams {
            session_id,
            workspace_id,
            shell,
            cols,
            rows,
            cwd,
            project_name,
            workspace_name,
            terminal_name,
        } = params;
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        {
            let sessions = self.sessions.lock().await;
            if sessions.contains_key(&session_id) {
                return Err(ServiceError::Processing(format!(
                    "Session {} already active",
                    session_id
                )));
            }
        }

        info!(
            "Creating simple terminal session (no tmux): {} for workspace: {} ({}x{})",
            session_id, workspace_id, cols, rows
        );

        // Channel for sending commands to the PTY thread
        let (command_tx, command_rx) = mpsc::unbounded_channel::<SessionCommand>();

        // Channel for receiving PTY output
        let (raw_output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let output_tx =
            self.maybe_bridge_run_log_output(raw_output_tx, cwd.clone(), terminal_name.clone());

        // Channel for receiving initialization result
        let (init_tx, init_rx) = oneshot::channel::<Result<()>>();

        let session_id_clone = session_id.clone();
        let cwd_for_handle = cwd.clone();
        let shims_dir = self.shims_dir.clone();

        // Spawn a dedicated thread for PTY operations
        thread::spawn(move || {
            run_simple_pty_session(
                session_id_clone,
                shell,
                cols,
                rows,
                cwd,
                shims_dir,
                command_rx,
                output_tx,
                init_tx,
            );
        });

        // Wait for initialization result
        match init_rx.await {
            Ok(Ok(())) => {
                // Store session handle with metadata
                let handle = SessionHandle {
                    command_tx,
                    workspace_id: workspace_id.clone(),
                    tmux_session: None,
                    tmux_window_index: None,
                    client_session: None,
                    session_type: SessionType::Simple,
                    project_name,
                    workspace_name,
                    terminal_name,
                    cwd: cwd_for_handle,
                    terminal_kind: TerminalKind::Standard,
                    side_chat_id: None,
                    source_pane_id: None,
                    source_tmux_window_name: None,
                    created_at: Instant::now(),
                };

                self.sessions
                    .lock()
                    .await
                    .insert(session_id.clone(), handle);
                info!("Simple terminal session created: {}", session_id);
                Ok(output_rx)
            }
            Ok(Err(e)) => {
                error!("Failed to create simple terminal session: {}", e);
                Err(e)
            }
            Err(_) => {
                error!("PTY thread failed to respond");
                Err(ServiceError::Processing(
                    "PTY initialization failed".to_string(),
                ))
            }
        }
    }

    /// Attach to an existing tmux window (for reconnection)
    pub async fn attach_session(
        &self,
        params: AttachSessionParams,
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<TmuxPaneSnapshot>)> {
        let AttachSessionParams {
            session_id,
            workspace_id,
            tmux_window_index,
            tmux_window_name,
            cols,
            rows,
            project_name,
            workspace_name,
            cwd,
        } = params;
        // Compute tmux session name so we can acquire lock
        let tmux_session_name = self
            .resolve_tmux_session_name(
                &workspace_id,
                project_name.as_deref(),
                workspace_name.as_deref(),
            )
            .await;

        // Acquire workspace lock to prevent race conditions during attachment
        let creation_lock = self.get_creation_lock(&tmux_session_name).await;
        let _guard = creation_lock.lock().await;

        let result = self
            .attach_session_internal(
                session_id,
                workspace_id,
                tmux_window_index,
                tmux_window_name,
                cols,
                rows,
                project_name,
                workspace_name,
                cwd,
            )
            .await;

        // Clean up lock from HashMap
        self.release_creation_lock(&tmux_session_name).await;

        result
    }

    /// Internal version of attach_session that doesn't acquire the workspace lock
    #[allow(clippy::too_many_arguments)]
    async fn attach_session_internal(
        &self,
        session_id: String,
        workspace_id: String,
        tmux_window_index: Option<u32>,
        tmux_window_name: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        project_name: Option<String>,
        workspace_name: Option<String>,
        cwd: Option<String>,
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<TmuxPaneSnapshot>)> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Resolve the stable master session (DB canonical name first) before attaching.
        let tmux_session = self
            .resolve_tmux_session_name(
                &workspace_id,
                project_name.as_deref(),
                workspace_name.as_deref(),
            )
            .await;
        self.tmux_engine.ensure_standard_config();

        // Save window name for metadata before it gets consumed
        let terminal_name = tmux_window_name.clone();

        // Determine the actual window index to attach to
        let final_window_index = if let Some(idx) = tmux_window_index {
            idx
        } else if let Some(name) = tmux_window_name {
            self.tmux_engine
                .find_window_index_by_name(&tmux_session, &name)?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!("Tmux window with name '{}' not found", name))
                })?
        } else {
            return Err(ServiceError::Validation(
                "Neither tmux window index nor name provided for attachment".to_string(),
            ));
        };

        // Check if window exists
        if !self
            .tmux_engine
            .window_exists(&tmux_session, final_window_index)
            .map_err(|e| ServiceError::Processing(format!("Failed to check window: {}", e)))?
        {
            return Err(ServiceError::NotFound(format!(
                "Tmux window does not exist at index {}",
                final_window_index
            )));
        }

        // NOTE: We intentionally do NOT evict existing sessions for the same tmux window
        // here. Previously this was done to handle page-refresh races, but it also
        // wrongly kicks legitimate simultaneous clients (e.g. tunnel connector while local
        // browser is open). Since each connection now gets its own grouped session name
        // (per-connection session_id), there is no tmux-level conflict between clients.
        // Stale sessions from crashed/disconnected clients are cleaned up by:
        //   - close_session() when the WebSocket closes cleanly
        //   - cleanup_stale_client_sessions() on startup

        info!(
            "Attaching to existing tmux window: {}:{} for session {}",
            tmux_session, final_window_index, session_id
        );

        let rx = self
            .attach_to_tmux_window(
                session_id,
                workspace_id,
                tmux_session.clone(),
                final_window_index,
                None, // Don't override shell for existing window
                cols,
                rows,
                true,
                project_name,
                workspace_name,
                terminal_name,
                cwd,
                TerminalKind::Standard,
                None,
                None,
                None,
            )
            .await?;
        let snapshot = self
            .capture_snapshot_after_attach(&tmux_session, final_window_index)
            .await;

        Ok((rx, snapshot))
    }

    /// Internal: Attach PTY to a tmux window
    #[allow(clippy::too_many_arguments)]
    async fn attach_to_tmux_window(
        &self,
        session_id: String,
        workspace_id: String,
        tmux_session: String,
        window_index: u32,
        _shell: Option<String>,
        cols: u16,
        rows: u16,
        _is_attach: bool,
        // Metadata for terminal manager
        project_name: Option<String>,
        workspace_name: Option<String>,
        terminal_name: Option<String>,
        cwd: Option<String>,
        terminal_kind: TerminalKind,
        side_chat_id: Option<String>,
        source_pane_id: Option<String>,
        source_tmux_window_name: Option<String>,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        // Each WebSocket connection gets its own tmux client session, named after
        // the ephemeral session_id UUID assigned by the frontend.
        //
        // WHY per-connection (not per-window):
        // Using a window-stable name caused multiple simultaneous clients (e.g. local
        // browser + tunnel connector) to share the same grouped session. tmux only allows
        // one terminal attached to a session at a time, so the second attach would
        // detach the first, showing "[detached (from session ...)]" to the user.
        //
        // WHY link only the target window:
        // A grouped session contains every master window, so a control client for
        // one tab can still participate in tmux sizing decisions for other tabs.
        // Full-screen TUIs such as opencode are very sensitive to those geometry
        // changes. Link only the target master window into this client session so
        // each browser tab affects only the pane it is displaying.
        //
        // PTY cleanup: stale grouped sessions from disconnected clients are cleaned up
        // by evict_conflicting_tmux_window_sessions() on reconnect, and by
        // cleanup_stale_client_sessions() on startup (both key on atmos_client_ prefix).
        //
        // Format: atmos_client_{tmux_session}_w{window_index}_{session_id_prefix}
        //
        // {tmux_session} + _w{window_index} — human-readable context (which workspace/window).
        // {session_id_prefix}               — first 8 chars of UUID, unique per connection.
        let session_id_prefix = &session_id[..8.min(session_id.len())];
        let client_session_name = format!(
            "atmos_client_{}_w{}_{}",
            tmux_session.replace(':', "_"),
            window_index,
            session_id_prefix.replace('-', "_"),
        );

        let pane_id = self
            .tmux_engine
            .get_pane_id(&tmux_session, window_index)
            .map_err(|e| ServiceError::Processing(format!("Failed to get tmux pane id: {}", e)))?;
        // Live browser client takes over observation from any detached watcher.
        self.stop_mouse_mode_watch_for_window(&tmux_session, window_index);
        let (control_cols, control_rows) = if is_usable_browser_size(cols, rows) {
            (cols, rows)
        } else {
            let (pane_cols, pane_rows) = self
                .tmux_engine
                .get_pane_size(&tmux_session, window_index)
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to get tmux pane size: {}", e))
                })?;
            (pane_cols.max(120), pane_rows.max(30))
        };

        // Create an isolated one-window client session for this control client.
        self.tmux_engine
            .create_window_client_session(
                &tmux_session,
                window_index,
                &client_session_name,
                control_cols,
                control_rows,
            )
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to create tmux client session: {}", e))
            })?;

        let target_window = format!("{}:{}", tmux_session, window_index);
        let cols_string = control_cols.to_string();
        let rows_string = control_rows.to_string();
        self.tmux_engine
            .run_tmux_pub(&[
                "resize-window",
                "-t",
                &target_window,
                "-x",
                &cols_string,
                "-y",
                &rows_string,
            ])
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to pin tmux window size: {}", e))
            })?;
        let socket_path = self.tmux_engine.socket_file_path();

        // Channel for sending commands to the PTY thread
        let (command_tx, command_rx) = mpsc::unbounded_channel::<SessionCommand>();

        // Channel for receiving PTY output
        let (raw_output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        // APP-055: bridge live output into project-local run logs for run-* windows.
        let output_tx =
            self.maybe_bridge_run_log_output(raw_output_tx, cwd.clone(), terminal_name.clone());
        // Keep a clone so we can inject a synthetic title OSC after init
        let title_tx = output_tx.clone();

        // Channel for receiving initialization result
        let (init_tx, init_rx) = oneshot::channel::<Result<()>>();

        let session_id_clone = session_id.clone();
        let client_session_clone = client_session_name.clone();
        let pane_id_clone = pane_id.clone();

        // Spawn a dedicated thread for tmux control mode I/O.
        thread::spawn(move || {
            run_control_mode_tmux_session(
                session_id_clone,
                client_session_clone,
                pane_id_clone,
                socket_path,
                control_cols,
                control_rows,
                command_rx,
                output_tx,
                init_tx,
            );
        });

        // Wait for initialization result
        match init_rx.await {
            Ok(Ok(())) => {
                // Inject synthetic OSC 9998 (reattach title only — not shell 9999).
                // Query tmux for the current pane state (command + cwd).
                self.inject_initial_title(&tmux_session, window_index, &title_tx);

                // Store session handle with metadata
                let handle = SessionHandle {
                    command_tx,
                    workspace_id: workspace_id.clone(),
                    tmux_session: Some(tmux_session),
                    tmux_window_index: Some(window_index),
                    client_session: Some(client_session_name),
                    session_type: SessionType::Tmux,
                    project_name,
                    workspace_name,
                    terminal_name,
                    cwd,
                    terminal_kind,
                    side_chat_id,
                    source_pane_id,
                    source_tmux_window_name,
                    created_at: Instant::now(),
                };

                self.sessions
                    .lock()
                    .await
                    .insert(session_id.clone(), handle);
                info!(
                    "Terminal session created/attached: {} (window index: {})",
                    session_id, window_index
                );
                Ok(output_rx)
            }
            Ok(Err(e)) => {
                error!("Failed to create terminal session: {}", e);
                Err(e)
            }
            Err(_) => {
                error!("PTY thread failed to respond");
                Err(ServiceError::Processing(
                    "PTY initialization failed".to_string(),
                ))
            }
        }
    }

    /// Inject a synthetic **OSC 9998** title so the frontend gets an immediate
    /// dynamic title on connect/reconnect without waiting for user interaction.
    ///
    /// Uses OSC **9998** (not the shell shim's 9999). The web client treats 9998
    /// as title-only and never clears DEC mouse modes. Sharing 9999 with the
    /// shell shim caused reattach races: snapshot restored TUI mouse, then a
    /// synthetic CMD_END wiped it and left 100% local xterm scrollback (APP-054).
    ///
    /// Queries tmux for the pane's current foreground command and working directory,
    /// then decides whether to send CMD_START (program running) or CMD_END (shell idle).
    fn inject_initial_title(
        &self,
        tmux_session: &str,
        window_index: u32,
        output_tx: &mpsc::UnboundedSender<Vec<u8>>,
    ) {
        let current_cmd = match self
            .tmux_engine
            .get_pane_current_command(tmux_session, window_index)
        {
            Ok(cmd) => cmd,
            Err(e) => {
                debug!("Could not query pane command for initial title: {}", e);
                return;
            }
        };

        // OSC 9998 = reattach synthetic title (must not share 9999 with shell shim).
        let osc = if core_engine::is_shell_command(&current_cmd) {
            // Shell is idle at prompt — show the current working directory
            match self
                .tmux_engine
                .get_pane_current_path(tmux_session, window_index)
            {
                Ok(path) if !path.is_empty() => format!("\x1b]9998;CMD_END:{}\x07", path),
                _ => return, // Can't determine path, skip
            }
        } else {
            // A foreground program is running — show its name
            format!("\x1b]9998;CMD_START:{}\x07", current_cmd)
        };

        if let Err(e) = output_tx.send(osc.into_bytes()) {
            debug!("Failed to inject initial title OSC: {}", e);
        } else {
            debug!(
                "Injected reattach title OSC 9998 for {}:{}",
                tmux_session, window_index
            );
        }
    }

    async fn capture_snapshot_after_attach(
        &self,
        tmux_session: &str,
        window_index: u32,
    ) -> Option<TmuxPaneSnapshot> {
        let snapshot = self
            .tmux_engine
            .capture_pane_snapshot(tmux_session, window_index, Some(10000))
            .ok();

        if snapshot.as_ref().is_some_and(|snapshot| snapshot.alternate) {
            // Full-screen TUIs often redraw shortly after SIGWINCH from the
            // control client resize. Give that redraw one frame before taking
            // the hydration snapshot, otherwise reconnect can replay a
            // half-updated popup/menu.
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            let delayed = self
                .tmux_engine
                .capture_pane_snapshot(tmux_session, window_index, Some(10000))
                .ok()
                .or(snapshot);
            return delayed;
        }

        snapshot
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_terminal_service_creation() {
        let service = TerminalService::new();
        assert_eq!(service.session_count().await, 0);
    }

    #[tokio::test]
    async fn test_session_list_empty() {
        let service = TerminalService::new();
        assert!(service.list_sessions().await.is_empty());
    }

    #[test]
    fn test_tmux_check() {
        let service = TerminalService::new();
        let available = service.is_tmux_available();
        println!("tmux available: {}", available);
    }

    #[tokio::test]
    async fn resolve_tmux_session_name_prefers_existing_named_session() {
        let service = TerminalService::new();
        // Without DB/live sessions this falls back to the provided names.
        let resolved = service
            .resolve_tmux_session_name("ws-guid", Some("Atmos"), Some("Main"))
            .await;
        assert_eq!(
            resolved,
            service
                .tmux_engine
                .get_session_name_from_names("Atmos", "Main")
        );
    }

    #[tokio::test]
    async fn resolve_tmux_session_name_falls_back_to_workspace_id() {
        let service = TerminalService::new();
        let resolved = service
            .resolve_tmux_session_name("13c75c87-516a-40ab-b7b8-bda46c0e3e3e", None, None)
            .await;
        assert_eq!(
            resolved,
            service
                .tmux_engine
                .get_session_name("13c75c87-516a-40ab-b7b8-bda46c0e3e3e")
        );
    }
}
