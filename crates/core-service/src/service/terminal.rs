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
use core_engine::{TmuxEngine, TmuxPaneSnapshot};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

mod management;
mod runtime;
mod types;

use runtime::{run_control_mode_tmux_session, run_simple_pty_session};
pub use types::{
    AttachSessionParams, CreateSessionParams, CreateSimpleSessionParams, SessionDetail,
    SessionType, TerminalMessage, TerminalResponse,
};
use types::{SessionCommand, SessionHandle};

const MIN_BROWSER_COLS: u16 = 20;
const MIN_BROWSER_ROWS: u16 = 8;

fn is_usable_browser_size(cols: u16, rows: u16) -> bool {
    cols >= MIN_BROWSER_COLS && rows >= MIN_BROWSER_ROWS
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
        }
    }

    /// Create terminal service with custom TmuxEngine
    pub fn with_tmux_engine(tmux_engine: Arc<TmuxEngine>) -> Self {
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
            tmux_engine,
            default_cols: 120,
            default_rows: 30,
            creation_locks: Arc::new(Mutex::new(HashMap::new())),
            shims_dir,
        }
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
        } = params;
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Compute tmux session name (without creating it yet) so we can acquire lock first
        let tmux_session_name =
            if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name) {
                self.tmux_engine.get_session_name_from_names(proj, ws)
            } else {
                self.tmux_engine.get_session_name(&workspace_id)
            };

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
        let session_env_vars: Vec<(&str, &str)> = vec![
            ("ATMOS_MANAGED", "1"),
            ("ATMOS_CONTEXT_ID", &workspace_id),
            ("ATMOS_PANE_ID", &default_window_pane_id),
        ];
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name)
        {
            self.tmux_engine
                .create_session_with_names(
                    proj,
                    ws,
                    cwd.as_deref(),
                    shell_command.as_deref(),
                    Some(&session_env_vars),
                )
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to create tmux session: {}", e))
                })?
        } else {
            self.tmux_engine
                .create_session(
                    &workspace_id,
                    cwd.as_deref(),
                    shell_command.as_deref(),
                    Some(&session_env_vars),
                )
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to create tmux session: {}", e))
                })?
        };

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
        let atmos_env_vars: Vec<(&str, &str)> = vec![
            ("ATMOS_MANAGED", "1"),
            ("ATMOS_CONTEXT_ID", &workspace_id),
            ("ATMOS_PANE_ID", &stable_pane_id),
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
        let (output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();

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
        } = params;
        // Compute tmux session name so we can acquire lock
        let tmux_session_name =
            if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name) {
                self.tmux_engine.get_session_name_from_names(proj, ws)
            } else {
                self.tmux_engine.get_session_name(&workspace_id)
            };

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
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<TmuxPaneSnapshot>)> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Use human-readable session name if provided, otherwise fall back to workspace_id
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name)
        {
            self.tmux_engine.get_session_name_from_names(proj, ws)
        } else {
            self.tmux_engine.get_session_name(&workspace_id)
        };
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
        // wrongly kicks legitimate simultaneous clients (e.g. remote access while local
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
                None, // CWD not tracked for attach
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
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        // Each WebSocket connection gets its own tmux client session, named after
        // the ephemeral session_id UUID assigned by the frontend.
        //
        // WHY per-connection (not per-window):
        // Using a window-stable name caused multiple simultaneous clients (e.g. local
        // browser + remote access) to share the same grouped session. tmux only allows
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
        let (output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
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
                // Inject a synthetic OSC 9999 so the frontend gets an immediate
                // dynamic title even on reconnect / page refresh.
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

    /// Inject a synthetic OSC 9999 sequence so the frontend gets an immediate
    /// dynamic title on connect/reconnect without waiting for user interaction.
    ///
    /// Queries tmux for the pane's current foreground command and working directory,
    /// then decides whether to send CMD_START (program running) or CMD_END (shell idle).
    fn inject_initial_title(
        &self,
        tmux_session: &str,
        window_index: u32,
        output_tx: &mpsc::UnboundedSender<Vec<u8>>,
    ) {
        // Known shell names — if pane_current_command matches one of these, the shell is idle
        const SHELLS: &[&str] = &["zsh", "bash", "fish", "sh", "dash", "ksh", "tcsh", "csh"];

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

        let osc = if SHELLS.contains(&current_cmd.as_str()) {
            // Shell is idle at prompt — show the current working directory
            match self
                .tmux_engine
                .get_pane_current_path(tmux_session, window_index)
            {
                Ok(path) if !path.is_empty() => format!("\x1b]9999;CMD_END:{}\x07", path),
                _ => return, // Can't determine path, skip
            }
        } else {
            // A foreground program is running — show its name
            format!("\x1b]9999;CMD_START:{}\x07", current_cmd)
        };

        if let Err(e) = output_tx.send(osc.into_bytes()) {
            debug!("Failed to inject initial title OSC: {}", e);
        } else {
            debug!(
                "Injected initial title OSC for {}:{}",
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
}
