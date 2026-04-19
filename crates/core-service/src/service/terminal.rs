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
use core_engine::tmux::control::{
    encode_refresh_client_report_command, encode_send_keys_hex_commands, parse_control_line_bytes,
    ControlModeEvent, TmuxPassthroughUnwrapper,
};
use core_engine::{TmuxEngine, TmuxPaneSnapshot};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Instant;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

const MIN_BROWSER_COLS: u16 = 20;
const MIN_BROWSER_ROWS: u16 = 8;

fn is_usable_browser_size(cols: u16, rows: u16) -> bool {
    cols >= MIN_BROWSER_COLS && rows >= MIN_BROWSER_ROWS
}

/// Commands that can be sent to a terminal session thread
#[derive(Debug)]
enum SessionCommand {
    Write(Vec<u8>),
    Report(Vec<u8>),
    Resize {
        cols: u16,
        rows: u16,
    },
    /// Close the terminal session. Control-mode sessions already know their
    /// client session/socket; fields are kept so simple and tmux sessions share
    /// one command shape.
    Close {
        client_session: Option<String>,
        socket_path: Option<std::path::PathBuf>,
    },
}

/// Type of terminal session
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionType {
    /// Tmux-backed persistent terminal
    Tmux,
    /// Simple PTY without tmux (e.g., Run Script)
    Simple,
}

/// Terminal session handle - thread-safe wrapper for PTY session
struct SessionHandle {
    command_tx: mpsc::UnboundedSender<SessionCommand>,
    workspace_id: String,
    tmux_session: Option<String>,
    tmux_window_index: Option<u32>,
    client_session: Option<String>,
    // Metadata for terminal manager
    session_type: SessionType,
    project_name: Option<String>,
    workspace_name: Option<String>,
    terminal_name: Option<String>,
    cwd: Option<String>,
    created_at: Instant,
}

/// Detailed session information for the terminal manager UI
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionDetail {
    pub session_id: String,
    pub workspace_id: String,
    pub session_type: SessionType,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub terminal_name: Option<String>,
    pub tmux_session: Option<String>,
    pub tmux_window_index: Option<u32>,
    pub cwd: Option<String>,
    /// Seconds since the session was created
    pub uptime_secs: u64,
}

/// Message types for terminal communication
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalMessage {
    /// Create a new terminal session
    TerminalCreate {
        workspace_id: String,
        _shell: Option<String>,
    },
    /// Attach to an existing terminal session (reconnection)
    TerminalAttach {
        session_id: String,
        workspace_id: String,
    },
    /// Send input to terminal
    TerminalInput { session_id: String, data: String },
    /// Send a terminal emulator report back to tmux control mode
    TerminalReport { session_id: String, data: String },
    /// Resize terminal
    TerminalResize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    /// Close terminal session (detach only, keeps tmux window)
    TerminalClose { session_id: String },
    /// Destroy terminal session (kills tmux window)
    TerminalDestroy { session_id: String },
}

/// Response messages from terminal service
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalResponse {
    /// Terminal session created successfully
    TerminalCreated {
        session_id: String,
        workspace_id: String,
        snapshot: Option<TmuxPaneSnapshot>,
    },
    /// Terminal session attached (reconnected)
    TerminalAttached {
        session_id: String,
        workspace_id: String,
        snapshot: Option<TmuxPaneSnapshot>,
    },
    /// Terminal output data
    TerminalOutput { session_id: String, data: String },
    /// Terminal session closed (detached)
    TerminalClosed { session_id: String },
    /// Terminal session destroyed (killed)
    TerminalDestroyed { session_id: String },
    /// Error occurred
    TerminalError {
        session_id: Option<String>,
        error: String,
    },
}

/// Parameters for creating a tmux-backed terminal session
pub struct CreateSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub shell: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub window_name: Option<String>,
    pub cwd: Option<String>,
}

/// Parameters for creating a simple (non-tmux) terminal session
pub struct CreateSimpleSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub shell: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub cwd: Option<String>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub terminal_name: Option<String>,
}

/// Parameters for attaching to an existing tmux window
pub struct AttachSessionParams {
    pub session_id: String,
    pub workspace_id: String,
    pub tmux_window_index: Option<u32>,
    pub tmux_window_name: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
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

    /// Send input data to a terminal session
    pub async fn send_input(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Write(data.as_bytes().to_vec()))
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        Ok(())
    }

    /// Send a terminal emulator report to the active terminal pane.
    ///
    /// xterm.js generates these in response to terminal queries such as OSC 11,
    /// cursor-position requests, and device-attributes probes. In tmux control
    /// mode these must be sent with `refresh-client -r` so tmux treats them as
    /// terminal reports from the client, not as ordinary keyboard input.
    pub async fn send_terminal_report(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Report(data.as_bytes().to_vec()))
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        Ok(())
    }

    /// Resize a terminal session
    ///
    /// Tmux-backed sessions are control-mode clients, so resize is sent through
    /// `refresh-client -C`; simple shell sessions still resize their PTY.
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        handle
            .command_tx
            .send(SessionCommand::Resize { cols, rows })
            .map_err(|_| ServiceError::Processing("Session thread has exited".to_string()))?;

        debug!(
            "Terminal session {} resized to {}x{}",
            session_id, cols, rows
        );
        Ok(())
    }

    /// Close a terminal session (detach control client but keep tmux window)
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let sock = self.tmux_engine.socket_file_path();

        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Signal the control-mode thread to detach this client and kill the
            // per-connection grouped session. The master tmux session/window is
            // preserved for reconnection.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: handle.client_session.clone(),
                socket_path: Some(std::path::PathBuf::from(&sock)),
            });

            info!(
                "Terminal session closed (detached): {} - tmux window {:?}:{:?} preserved",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
            Err(ServiceError::NotFound(format!(
                "Session not found: {}",
                session_id
            )))
        }
    }

    /// Destroy a terminal session (kill tmux window)
    pub async fn destroy_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Step 1: Ask the control-mode thread to detach and shut down its
            // per-connection grouped session.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: handle.client_session.clone(),
                socket_path: Some(std::path::PathBuf::from(
                    self.tmux_engine.socket_file_path(),
                )),
            });

            tokio::time::sleep(std::time::Duration::from_millis(50)).await;

            // Step 2: Kill the tmux window in the master session.
            if let (Some(ts), Some(twi)) = (&handle.tmux_session, handle.tmux_window_index) {
                if let Err(e) = self.tmux_engine.kill_window(ts, twi) {
                    warn!("Failed to kill tmux window: {}", e);
                }
            }

            // Step 3: Best-effort cleanup if the control-mode thread has not
            // already removed the grouped session.
            if let Some(client_session) = &handle.client_session {
                let _ = self.tmux_engine.kill_session(client_session);
            }

            info!(
                "Terminal session destroyed: {} - tmux window {:?}:{:?} killed",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to destroy non-existent session: {}", session_id);
            Err(ServiceError::NotFound(format!(
                "Session not found: {}",
                session_id
            )))
        }
    }

    /// Get session info (tmux window index) for reconnection
    pub async fn get_session_info(&self, session_id: &str) -> Option<(String, u32)> {
        let sessions = self.sessions.lock().await;
        sessions.get(session_id).and_then(|h| {
            if let (Some(ts), Some(twi)) = (&h.tmux_session, h.tmux_window_index) {
                Some((ts.clone(), twi))
            } else {
                None
            }
        })
    }

    /// List all tmux windows for a workspace (for reconnection)
    pub fn list_workspace_windows(&self, workspace_id: &str) -> Result<Vec<(u32, String)>> {
        let tmux_session = self.tmux_engine.get_session_name(workspace_id);
        let windows = self
            .tmux_engine
            .list_windows(&tmux_session)
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(windows.into_iter().map(|w| (w.index, w.name)).collect())
    }

    /// Check if a "Generate Project Wiki" tmux window exists in the given session.
    pub fn has_project_wiki_window(&self, session_name: &str) -> Result<bool> {
        let idx = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Generate Project Wiki")?;
        Ok(idx.is_some())
    }

    /// Kill the "Generate Project Wiki" tmux window in the given session.
    pub fn kill_project_wiki_window(&self, session_name: &str) -> Result<()> {
        if let Some(index) = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Generate Project Wiki")?
        {
            self.tmux_engine.kill_window(session_name, index)?;
        }
        Ok(())
    }

    /// Check if a "Code Review" tmux window exists in the given session.
    pub fn has_code_review_window(&self, session_name: &str) -> Result<bool> {
        let idx = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Code Review")?;
        Ok(idx.is_some())
    }

    /// Kill the "Code Review" tmux window in the given session.
    pub fn kill_code_review_window(&self, session_name: &str) -> Result<()> {
        if let Some(index) = self
            .tmux_engine
            .find_window_index_by_name(session_name, "Code Review")?
        {
            self.tmux_engine.kill_window(session_name, index)?;
        }
        Ok(())
    }

    /// Get all active session IDs
    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }

    /// List detailed information about all active sessions (for Terminal Manager UI)
    pub async fn list_session_details(&self) -> Vec<SessionDetail> {
        let sessions = self.sessions.lock().await;
        sessions
            .iter()
            .map(|(id, handle)| SessionDetail {
                session_id: id.clone(),
                workspace_id: handle.workspace_id.clone(),
                session_type: handle.session_type.clone(),
                project_name: handle.project_name.clone(),
                workspace_name: handle.workspace_name.clone(),
                terminal_name: handle.terminal_name.clone(),
                tmux_session: handle.tmux_session.clone(),
                tmux_window_index: handle.tmux_window_index,
                cwd: handle.cwd.clone(),
                uptime_secs: handle.created_at.elapsed().as_secs(),
            })
            .collect()
    }

    /// Check if a session exists
    pub async fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.lock().await.contains_key(session_id)
    }

    /// Get session count
    pub async fn session_count(&self) -> usize {
        self.sessions.lock().await.len()
    }

    /// Gracefully shutdown all terminal sessions.
    /// Called during application shutdown to clean up PTY resources and prevent
    /// PTY device exhaustion ("unable to allocate pty: Device not configured").
    pub async fn shutdown(&self) {
        info!("Shutting down terminal service, cleaning up all sessions...");

        let mut sessions = self.sessions.lock().await;
        let count = sessions.len();

        if count == 0 {
            info!("No active terminal sessions to clean up");
            drop(sessions);
        } else {
            // Drain all sessions and clean up
            let handles: Vec<(String, SessionHandle)> = sessions.drain().collect();
            drop(sessions); // Release the lock early

            let sock = self.tmux_engine.socket_file_path();
            for (session_id, handle) in &handles {
                // On full shutdown we kill the grouped session (window-stable
                // sessions are recreated on the next API start + first connect).
                if let Some(ref client_session) = handle.client_session {
                    let mut detach_cmd = std::process::Command::new("tmux");
                    detach_cmd.args([
                        "-u",
                        "-f",
                        "/dev/null",
                        "-S",
                        &sock,
                        "detach-client",
                        "-s",
                        client_session,
                    ]);
                    apply_utf8_env_to_tmux_command(&mut detach_cmd);
                    let _ = detach_cmd.output();
                    let _ = self.tmux_engine.kill_session(client_session);
                }

                // Signal the PTY thread to stop its command loop.
                let _ = handle.command_tx.send(SessionCommand::Close {
                    client_session: None,
                    socket_path: None,
                });

                debug!("Sent shutdown signal to session: {}", session_id);
            }

            // Brief wait for PTY threads to see EOF and exit cleanly.
            // Synchronous kill above ensures the PTY fd is already released;
            // this just gives threads time to drain and exit gracefully.
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;

            info!(
                "Terminal service shutdown complete: cleaned up {} sessions",
                count
            );
        }

        // NOTE: Do NOT call cleanup_stale_client_sessions() here.
        // When multiple API instances share the same tmux socket (e.g., a desktop
        // sidecar on port 30303 and a dev server on port 30301), this instance's
        // "stale" sessions include the OTHER instance's live sessions. Cleaning
        // them up on shutdown would kill terminals owned by the other instance.
        // Stale cleanup should only happen on startup, gated by --cleanup-stale-clients.
    }

    /// Clean up stale tmux client sessions from previous crashes or hot-reloads.
    /// Called on startup and shutdown to release PTY resources from orphaned sessions.
    ///
    /// During hot-reload, the process is killed before cleanup can happen.
    /// This leaves behind tmux "grouped sessions" (atmos_client_*) that each hold
    /// a PTY device. Over many hot-reloads, these accumulate and exhaust the system's
    /// PTY device pool.
    pub fn cleanup_stale_client_sessions(&self) {
        // Collect the set of client session names that are currently active
        // so we don't kill live sessions. Killing a live session would cause
        // tmux to write "[exited]" / "can't find session" into the PTY output.
        // Use try_lock to avoid blocking if sessions mutex is held.
        let active_clients: std::collections::HashSet<String> = self
            .sessions
            .try_lock()
            .map(|sessions| {
                sessions
                    .values()
                    .filter_map(|h| h.client_session.clone())
                    .collect()
            })
            .unwrap_or_default();

        match self.tmux_engine.list_sessions() {
            Ok(sessions) => {
                let mut cleaned = 0;
                for session in sessions {
                    if session.name.starts_with("atmos_client_")
                        && !active_clients.contains(&session.name)
                    {
                        if let Err(e) = self.tmux_engine.kill_session(&session.name) {
                            warn!(
                                "Failed to kill stale client session {}: {}",
                                session.name, e
                            );
                        } else {
                            cleaned += 1;
                        }
                    }
                }
                if cleaned > 0 {
                    info!(
                        "Cleaned up {} stale tmux client sessions (skipped {} active)",
                        cleaned,
                        active_clients.len()
                    );
                } else {
                    debug!("No stale tmux client sessions found");
                }
            }
            Err(e) => {
                warn!("Failed to list tmux sessions for cleanup: {}", e);
            }
        }
    }

    /// Clean up all terminal state associated with a workspace being deleted.
    ///
    /// This detaches live grouped client sessions, removes their PTY handles from
    /// memory, then kills the workspace's backing tmux session.
    pub async fn cleanup_workspace_terminal_state(&self, workspace_id: &str, tmux_session: &str) {
        let matching_handles = {
            let mut sessions = self.sessions.lock().await;
            let matching_ids: Vec<String> = sessions
                .iter()
                .filter(|(_, handle)| {
                    handle.workspace_id == workspace_id
                        || handle.tmux_session.as_deref() == Some(tmux_session)
                })
                .map(|(session_id, _)| session_id.clone())
                .collect();

            matching_ids
                .into_iter()
                .filter_map(|session_id| {
                    sessions
                        .remove(&session_id)
                        .map(|handle| (session_id, handle))
                })
                .collect::<Vec<_>>()
        };

        if !matching_handles.is_empty() {
            let sock = self.tmux_engine.socket_file_path();
            for (session_id, handle) in &matching_handles {
                // Detach first (releases PTY fd immediately), then kill the ghost session.
                if let Some(ref client_session) = handle.client_session {
                    let mut detach_cmd = std::process::Command::new("tmux");
                    detach_cmd.args([
                        "-u",
                        "-f",
                        "/dev/null",
                        "-S",
                        &sock,
                        "detach-client",
                        "-s",
                        client_session,
                    ]);
                    apply_utf8_env_to_tmux_command(&mut detach_cmd);
                    let _ = detach_cmd.output();
                    let _ = self.tmux_engine.kill_session(client_session);
                }
                let _ = handle.command_tx.send(SessionCommand::Close {
                    client_session: None,
                    socket_path: None,
                });
                debug!(
                    "Sent workspace cleanup signal to terminal session: {}",
                    session_id
                );
            }

            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        if let Err(error) = self.tmux_engine.kill_session(tmux_session) {
            warn!(
                "Failed to kill tmux session {} during workspace cleanup: {}",
                tmux_session, error
            );
        }
    }
}

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

fn apply_utf8_env_to_tmux_command(cmd: &mut std::process::Command) {
    let locale = resolve_utf8_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
}

fn apply_terminal_env_to_tmux_client(cmd: &mut std::process::Command) {
    apply_utf8_env_to_tmux_command(cmd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
}

fn apply_utf8_env_to_pty_command(cmd: &mut CommandBuilder) {
    let locale = resolve_utf8_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
}

/// Spawn a command inside a new PTY and return master, reader, and writer.
/// The PTY slave is dropped immediately after spawning to ensure clean EOF on exit.
fn setup_pty(
    cols: u16,
    rows: u16,
    cmd: CommandBuilder,
) -> std::result::Result<
    (
        Box<dyn portable_pty::MasterPty + Send>,
        Box<dyn std::io::Read + Send>,
        Box<dyn std::io::Write + Send>,
    ),
    String,
> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    Ok((pair.master, reader, writer))
}

/// Spawn a thread that reads from the PTY and forwards output to the channel.
fn spawn_pty_reader(
    session_id: String,
    mut reader: Box<dyn std::io::Read + Send>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    debug!("PTY reader EOF for session: {}", session_id);
                    break;
                }
                Ok(n) => {
                    let data = buffer[..n].to_vec();
                    if output_tx.send(data).is_err() {
                        debug!("Output channel closed for session: {}", session_id);
                        break;
                    }
                }
                Err(e) => {
                    let err_str = e.to_string();
                    if err_str.contains("Input/output error") || err_str.contains("EIO") {
                        debug!(
                            "PTY disconnected for session: {} (expected on close)",
                            session_id
                        );
                    } else {
                        warn!("PTY read error for session {}: {}", session_id, e);
                    }
                    break;
                }
            }
        }
    })
}

/// Run a tmux control mode client attached to a grouped session.
#[allow(clippy::too_many_arguments)]
fn run_control_mode_tmux_session(
    session_id: String,
    client_session: String,
    pane_id: String,
    socket_path: String,
    cols: u16,
    rows: u16,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    init_tx: oneshot::Sender<Result<()>>,
) {
    if let Err(error) = wait_for_tmux_session(&client_session, &socket_path) {
        let _ = init_tx.send(Err(error));
        return;
    }

    let mut command = std::process::Command::new("tmux");
    command
        .arg("-u")
        .arg("-T")
        .arg("RGB,ccolour,cstyle,extkeys,focus,mouse,strikethrough,sync,title,usstyle")
        // `-CC` expects an interactive terminal on some tmux builds. Atmos runs
        // the client over pipes, so plain control mode (`-C`) is the correct API.
        .arg("-C")
        .arg("-f")
        .arg("/dev/null")
        .arg("-S")
        .arg(&socket_path)
        .arg("attach-session")
        .arg("-t")
        .arg(&client_session)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_terminal_env_to_tmux_client(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = init_tx.send(Err(ServiceError::Processing(format!(
                "Failed to spawn tmux control client: {}",
                error
            ))));
            return;
        }
    };

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = init_tx.send(Err(ServiceError::Processing(
                "tmux control client stdout unavailable".to_string(),
            )));
            let _ = child.kill();
            return;
        }
    };
    let stderr = child.stderr.take();
    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = init_tx.send(Err(ServiceError::Processing(
                "tmux control client stdin unavailable".to_string(),
            )));
            let _ = child.kill();
            return;
        }
    };

    let running = Arc::new(AtomicBool::new(true));
    let reader_running = running.clone();
    let reader_session_id = session_id.clone();
    let reader_pane_id = pane_id.clone();
    let reader_handle = thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        let mut passthrough_unwrapper = TmuxPassthroughUnwrapper::default();

        while reader_running.load(Ordering::SeqCst) {
            line.clear();
            match reader.read_until(b'\n', &mut line) {
                Ok(0) => {
                    break;
                }
                Ok(_) => match parse_control_line_bytes(&line) {
                    Some(ControlModeEvent::Output { pane_id, data })
                    | Some(ControlModeEvent::ExtendedOutput { pane_id, data, .. })
                        if pane_id == reader_pane_id =>
                    {
                        // Preserve synchronized-output markers. Modern TUIs use
                        // them to bracket a complete redraw frame; xterm.js can
                        // use that hint to avoid presenting half-drawn frames.
                        let data = passthrough_unwrapper.push(&data);
                        if !data.is_empty() && output_tx.send(data).is_err() {
                            break;
                        }
                    }
                    Some(ControlModeEvent::Exit(reason)) => {
                        debug!(
                            "tmux control client exited for session {}: {:?}",
                            reader_session_id, reason
                        );
                        reader_running.store(false, Ordering::SeqCst);
                        break;
                    }
                    Some(ControlModeEvent::Error(error)) => {
                        debug!(
                            "tmux control command error for session {}: {}",
                            reader_session_id, error
                        );
                    }
                    Some(_) | None => {}
                },
                Err(error) => {
                    debug!(
                        "tmux control reader error for session {}: {}",
                        reader_session_id, error
                    );
                    break;
                }
            }
        }
    });

    let stderr_session_id = session_id.clone();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(std::result::Result::ok) {
                debug!("tmux control stderr for {}: {}", stderr_session_id, line);
            }
        })
    });

    if let Err(error) = write_control_command(
        &mut stdin,
        &format!("resize-window -t {pane_id} -x {cols} -y {rows}"),
    ) {
        let _ = init_tx.send(Err(ServiceError::Processing(format!(
            "Failed to size tmux window: {}",
            error
        ))));
        running.store(false, Ordering::SeqCst);
        let _ = child.kill();
        let _ = reader_handle.join();
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
        return;
    }
    if let Err(error) =
        write_control_command(&mut stdin, &format!("refresh-client -C {cols}x{rows}"))
    {
        let _ = init_tx.send(Err(ServiceError::Processing(format!(
            "Failed to size tmux control client: {}",
            error
        ))));
        running.store(false, Ordering::SeqCst);
        let _ = child.kill();
        let _ = reader_handle.join();
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
        return;
    }

    if init_tx.send(Ok(())).is_err() {
        running.store(false, Ordering::SeqCst);
        let _ = child.kill();
        let _ = reader_handle.join();
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
        return;
    }

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let mut detach_requested = false;

    rt.block_on(async {
        while let Some(command) = command_rx.recv().await {
            match command {
                SessionCommand::Write(data) => {
                    for command in encode_send_keys_hex_commands(&pane_id, &data, 256) {
                        if let Err(error) = write_control_command(&mut stdin, &command) {
                            debug!(
                                "Failed to write tmux control input for session {}: {}",
                                session_id, error
                            );
                            return;
                        }
                    }
                }
                SessionCommand::Report(data) => {
                    if let Some(command) = encode_refresh_client_report_command(&pane_id, &data) {
                        if let Err(error) = write_control_command(&mut stdin, &command) {
                            debug!(
                                "Failed to write tmux control report for session {}: {}",
                                session_id, error
                            );
                            return;
                        }
                    }
                }
                SessionCommand::Resize { cols, rows } => {
                    if !is_usable_browser_size(cols, rows) {
                        continue;
                    }
                    if let Err(error) = write_control_command(
                        &mut stdin,
                        &format!("resize-window -t {pane_id} -x {cols} -y {rows}"),
                    ) {
                        debug!(
                            "Failed to pin tmux window size for session {}: {}",
                            session_id, error
                        );
                        return;
                    }
                    if let Err(error) = write_control_command(
                        &mut stdin,
                        &format!("refresh-client -C {cols}x{rows}"),
                    ) {
                        debug!(
                            "Failed to resize tmux control client for session {}: {}",
                            session_id, error
                        );
                        return;
                    }
                }
                SessionCommand::Close {
                    client_session,
                    socket_path,
                } => {
                    let _ = (client_session, socket_path);
                    debug!("Closing tmux control session: {}", session_id);
                    let _ = write_control_command(&mut stdin, "detach-client");
                    detach_requested = true;
                    return;
                }
            }
        }
    });

    if !detach_requested {
        let _ = write_control_command(&mut stdin, "detach-client");
    }
    drop(stdin);

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(750);
    while std::time::Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
            Err(_) => break,
        }
    }

    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
        let _ = child.wait();
    }

    running.store(false, Ordering::SeqCst);
    let _ = reader_handle.join();
    if let Some(handle) = stderr_handle {
        let _ = handle.join();
    }

    kill_tmux_client_session(&socket_path, &client_session);
    info!("tmux control session thread exited: {}", session_id);
}

fn wait_for_tmux_session(session_name: &str, socket_path: &str) -> Result<()> {
    let max_retries = 10;
    let retry_delay = std::time::Duration::from_millis(50);

    for attempt in 0..max_retries {
        let mut check_cmd = std::process::Command::new("tmux");
        check_cmd.args([
            "-u",
            "-f",
            "/dev/null",
            "-S",
            socket_path,
            "has-session",
            "-t",
            session_name,
        ]);
        apply_utf8_env_to_tmux_command(&mut check_cmd);

        match check_cmd.output() {
            Ok(output) if output.status.success() => return Ok(()),
            _ if attempt < max_retries - 1 => std::thread::sleep(retry_delay),
            _ => {}
        }
    }

    Err(ServiceError::Processing(format!(
        "Tmux session '{}' not ready after {} retries",
        session_name, max_retries
    )))
}

fn write_control_command(
    stdin: &mut std::process::ChildStdin,
    command: &str,
) -> std::io::Result<()> {
    stdin.write_all(command.as_bytes())?;
    stdin.write_all(b"\n")?;
    stdin.flush()
}

fn kill_tmux_client_session(socket_path: &str, client_session: &str) {
    let mut kill_cmd = std::process::Command::new("tmux");
    kill_cmd.args([
        "-u",
        "-f",
        "/dev/null",
        "-S",
        socket_path,
        "kill-session",
        "-t",
        client_session,
    ]);
    apply_utf8_env_to_tmux_command(&mut kill_cmd);
    let _ = kill_cmd.output();
    debug!("Killed tmux control client session: {}", client_session);
}

/// Run simple PTY session (NO tmux)
#[allow(clippy::too_many_arguments)]
fn run_simple_pty_session(
    session_id: String,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shims_dir: Option<PathBuf>,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    init_tx: oneshot::Sender<Result<()>>,
) {
    // Build shell command with optional shim injection for dynamic title support
    let shell_command = shims_dir
        .as_ref()
        .and_then(|dir| core_engine::shims::build_shell_command(dir, shell.as_deref()));

    let mut cmd = if let Some(ref shell_args) = shell_command {
        let mut cmd = CommandBuilder::new(&shell_args[0]);
        for arg in &shell_args[1..] {
            cmd.arg(arg);
        }
        cmd
    } else {
        let shell_cmd = shell
            .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()));
        CommandBuilder::new(&shell_cmd)
    };

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    apply_utf8_env_to_pty_command(&mut cmd);

    let (master, reader, mut writer) = match setup_pty(cols, rows, cmd) {
        Ok(parts) => parts,
        Err(e) => {
            let _ = init_tx.send(Err(ServiceError::Processing(e)));
            return;
        }
    };

    // Signal successful initialization
    if init_tx.send(Ok(())).is_err() {
        return;
    }

    let reader_handle = spawn_pty_reader(session_id.clone(), reader, output_tx.clone());

    // Process commands in main thread
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    rt.block_on(async {
        while let Some(cmd) = command_rx.recv().await {
            match cmd {
                SessionCommand::Write(data) => {
                                        if let Err(e) = writer.write_all(&data) {
                        debug!(
                            "Failed to write to PTY for session {}: {} (may be closed)",
                            session_id, e
                        );
                        break;
                    }
                    if let Err(e) = writer.flush() {
                        debug!("Failed to flush PTY for session {}: {}", session_id, e);
                        break;
                    }
                }
                SessionCommand::Report(data) => {
                                        if let Err(e) = writer.write_all(&data) {
                        debug!(
                            "Failed to write terminal report to PTY for session {}: {} (may be closed)",
                            session_id, e
                        );
                        break;
                    }
                    if let Err(e) = writer.flush() {
                        debug!("Failed to flush PTY for session {}: {}", session_id, e);
                        break;
                    }
                }
                SessionCommand::Resize { cols, rows } => {
                    if let Err(e) = master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    }) {
                        warn!("Failed to resize PTY for session {}: {}", session_id, e);
                    }
                }
                SessionCommand::Close { .. } => {
                    debug!("Closing session {}", session_id);
                    break;
                }
            }
        }
    });

    // Wait for reader thread to finish
    let _ = reader_handle.join();
    debug!("PTY session thread exited for session: {}", session_id);
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
