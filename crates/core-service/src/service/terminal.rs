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
use core_engine::TmuxEngine;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

/// Commands that can be sent to a terminal session thread
#[derive(Debug)]
enum SessionCommand {
    Write(Vec<u8>),
    Resize {
        cols: u16,
        rows: u16,
    },
    /// Close the PTY session. If `client_session` is provided, the PTY thread
    /// will kill the tmux client session AFTER detaching cleanly to avoid
    /// producing "[exited]" / "can't find session" error output.
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
        shell: Option<String>,
    },
    /// Attach to an existing terminal session (reconnection)
    TerminalAttach {
        session_id: String,
        workspace_id: String,
    },
    /// Send input to terminal
    TerminalInput { session_id: String, data: String },
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
    },
    /// Terminal session attached (reconnected)
    TerminalAttached {
        session_id: String,
        workspace_id: String,
        history: Option<String>,
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
    /// Response to tmux copy-mode status check
    TmuxCopyModeStatus {
        session_id: String,
        in_copy_mode: bool,
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
    /// Flag to stop the background stale-session reaper on shutdown
    reaper_running: Arc<AtomicBool>,
    /// Monotonic counter for generating unique tmux client session names.
    /// Prevents the race where an old PTY thread's deferred `kill-session`
    /// destroys a newly-created client session that reuses the same name.
    client_session_counter: AtomicU64,
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
            reaper_running: Arc::new(AtomicBool::new(false)),
            client_session_counter: AtomicU64::new(0),
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
            reaper_running: Arc::new(AtomicBool::new(false)),
            client_session_counter: AtomicU64::new(0),
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
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        self.check_pty_health_and_cleanup()?;

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
                    Ok((rx, _)) => Ok(rx),
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
        // Pass shell_command so the first window "1" also gets shim injection
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name)
        {
            self.tmux_engine
                .create_session_with_names(proj, ws, cwd.as_deref(), shell_command.as_deref())
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to create tmux session: {}", e))
                })?
        } else {
            self.tmux_engine
                .create_session(&workspace_id, cwd.as_deref(), shell_command.as_deref())
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
                    Ok((rx, _)) => Ok(rx),
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

        // shell_command already built above (for session creation), reuse for new window
        let window_index = self
            .tmux_engine
            .create_window(
                &tmux_session,
                &final_window_name,
                cwd.as_deref(),
                shell_command.as_deref(),
            )
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to create tmux window: {}", e))
            })?;

        // Now attach to this tmux window via PTY
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

        // Clean up lock from HashMap
        self.release_creation_lock(&tmux_session).await;

        result
    }

    /// Create a new simple terminal session (NO tmux persistence)
    /// Returns a receiver for terminal output
    pub async fn create_simple_session(
        &self,
        params: CreateSimpleSessionParams,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        self.check_pty_health_and_cleanup()?;

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
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<String>)> {
        self.check_pty_health_and_cleanup()?;

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
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<String>)> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Use human-readable session name if provided, otherwise fall back to workspace_id
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name)
        {
            self.tmux_engine.get_session_name_from_names(proj, ws)
        } else {
            self.tmux_engine.get_session_name(&workspace_id)
        };

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

        // Capture recent history before attaching (match tmux history-limit)
        let history = self
            .tmux_engine
            .capture_pane(&tmux_session, final_window_index, Some(10000))
            .ok();

        info!(
            "Attaching to existing tmux window: {}:{} for session {}",
            tmux_session, final_window_index, session_id
        );

        let rx = self
            .attach_to_tmux_window(
                session_id,
                workspace_id,
                tmux_session,
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

        Ok((rx, history))
    }

    /// Internal: Attach PTY to a tmux window
    #[allow(clippy::too_many_arguments)]
    async fn attach_to_tmux_window(
        &self,
        session_id: String,
        workspace_id: String,
        tmux_session: String,
        window_index: u32,
        shell: Option<String>,
        cols: u16,
        rows: u16,
        is_attach: bool,
        // Metadata for terminal manager
        project_name: Option<String>,
        workspace_name: Option<String>,
        terminal_name: Option<String>,
        cwd: Option<String>,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        // Create a unique client session name with a monotonic counter suffix.
        // This prevents the race where an old PTY thread's deferred
        // `kill-session -t atmos_client_<id>` destroys a newly-created client
        // session that would otherwise reuse the same name.
        let seq = self.client_session_counter.fetch_add(1, Ordering::Relaxed);
        let client_session_name = format!("atmos_client_{}_{}", session_id.replace('-', "_"), seq);

        // Create the grouped session if it doesn't exist
        // This ensures this pane has its own independent view of the windows
        self.tmux_engine
            .create_grouped_session(&tmux_session, &client_session_name)
            .map_err(|e| {
                ServiceError::Processing(format!("Failed to create grouped session: {}", e))
            })?;

        // Immediately select the correct window in the client session
        self.tmux_engine
            .select_window(&client_session_name, window_index)
            .map_err(|e| {
                ServiceError::Processing(format!(
                    "Failed to select window in grouped session: {}",
                    e
                ))
            })?;

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

        // Spawn a dedicated thread for PTY operations
        thread::spawn(move || {
            run_pty_session_with_tmux(
                session_id_clone,
                client_session_clone,
                window_index,
                shell,
                cols,
                rows,
                command_rx,
                output_tx,
                init_tx,
                is_attach,
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

    /// Cancel tmux copy-mode for a session.
    ///
    /// Uses `tmux send-keys -X cancel` which is a no-op if not in copy-mode.
    /// This is the safe way to exit copy-mode (unlike sending 'q' which would
    /// type into the shell if copy-mode already exited).
    pub async fn tmux_cancel_copy_mode(&self, session_id: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        if let (Some(tmux_session), Some(window_index)) =
            (&handle.tmux_session, handle.tmux_window_index)
        {
            let target = format!("{}:{}.0", tmux_session, window_index);
            self.tmux_engine
                .run_tmux_pub(&["send-keys", "-X", "-t", &target, "cancel"])
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to cancel copy-mode: {}", e))
                })?;
        }
        Ok(())
    }

    /// Check if a tmux pane is currently in copy-mode.
    ///
    /// Returns true if the pane is in copy-mode (user scrolled up).
    pub async fn tmux_check_copy_mode(&self, session_id: &str) -> Result<bool> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| ServiceError::NotFound(format!("Session not found: {}", session_id)))?;

        if let (Some(tmux_session), Some(window_index)) =
            (&handle.tmux_session, handle.tmux_window_index)
        {
            let target = format!("{}:{}.0", tmux_session, window_index);
            let result = self
                .tmux_engine
                .run_tmux_pub(&["display-message", "-t", &target, "-p", "#{pane_in_mode}"])
                .map_err(|e| {
                    ServiceError::Processing(format!("Failed to check copy-mode: {}", e))
                })?;
            Ok(result.trim() == "1")
        } else {
            Ok(false)
        }
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

    /// Resize a terminal session
    ///
    /// Only resizes the PTY. For tmux-backed sessions, the PTY resize triggers
    /// SIGWINCH on the tmux client, which propagates the size change to the tmux
    /// server automatically. Calling `tmux resize-pane` on top of that causes a
    /// double reflow, duplicating content in the scrollback.
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

    /// Check if the tmux pane is currently using the alternate screen buffer.
    ///
    /// Full-screen TUI apps (vim, htop, opencode, etc.) use alternate screen.
    /// This is used to decide whether to clear xterm.js scrollback after resize —
    /// only needed when a TUI app is active to prevent stale frame artifacts.
    pub async fn is_alternate_screen_active(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.get(session_id) {
            if let (Some(tmux_session), Some(window_index)) =
                (&handle.tmux_session, handle.tmux_window_index)
            {
                let target = format!("{}:{}.0", tmux_session, window_index);
                return self
                    .tmux_engine
                    .run_tmux_pub(&["display-message", "-t", &target, "-p", "#{alternate_on}"])
                    .map(|r| r.trim() == "1")
                    .unwrap_or(false);
            }
        }
        false
    }

    /// Close a terminal session (detach PTY but keep tmux window for persistence)
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Kill the tmux client session FIRST (synchronously) to release the
            // PTY immediately. This is critical for page-refresh scenarios:
            // the browser kills old connections and opens new ones nearly
            // simultaneously, so if we defer the kill to the PTY thread, both
            // old and new PTYs overlap and the count grows with each refresh.
            //
            // Killing the client session causes the `tmux attach-session` process
            // to exit, which produces EOF on the PTY reader → the PTY thread
            // sees it and exits cleanly. We still send the Close command (without
            // client_session) so the PTY thread breaks out of its command loop.
            if let Some(ref client_session) = handle.client_session {
                let _ = self.tmux_engine.kill_session(client_session);
            }

            // Tell the PTY thread to stop (it will see EOF from the killed
            // client session and exit). Don't pass client_session since we
            // already killed it above.
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: None,
                socket_path: None,
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
            // Step 1: Detach the client FIRST to prevent "[exited]" output.
            // `detach-client` causes a clean exit of the tmux attach process,
            // unlike `kill-session` which produces "[exited]" / "can't find session".
            // After detach, the PTY reader sees EOF and stops forwarding output.
            if let Some(ref client_session) = handle.client_session {
                let socket = self.tmux_engine.socket_file_path();
                let mut cmd = std::process::Command::new("tmux");
                cmd.args([
                    "-u",
                    "-f",
                    "/dev/null",
                    "-S",
                    &socket,
                    "detach-client",
                    "-s",
                    client_session,
                ]);
                apply_utf8_env_to_tmux_command(&mut cmd);
                let _ = cmd.output();
            }

            // Step 2: Send Close command to PTY thread (it will exit cleanly
            // since the tmux client is already detached)
            let _ = handle.command_tx.send(SessionCommand::Close {
                client_session: None, // We handle kill ourselves below
                socket_path: None,
            });

            // Step 3: Kill the tmux window in the master session
            if let (Some(ts), Some(twi)) = (&handle.tmux_session, handle.tmux_window_index) {
                if let Err(e) = self.tmux_engine.kill_window(ts, twi) {
                    warn!("Failed to kill tmux window: {}", e);
                }
            }

            // Step 4: Kill the client session
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

        // Stop the background reaper so it doesn't interfere with shutdown
        self.reaper_running.store(false, Ordering::SeqCst);

        let mut sessions = self.sessions.lock().await;
        let count = sessions.len();

        if count == 0 {
            info!("No active terminal sessions to clean up");
            drop(sessions);
        } else {
            // Drain all sessions and clean up
            let handles: Vec<(String, SessionHandle)> = sessions.drain().collect();
            drop(sessions); // Release the lock early

            for (session_id, handle) in &handles {
                // Kill the tmux client session synchronously to free PTYs immediately
                if let Some(ref client_session) = handle.client_session {
                    let _ = self.tmux_engine.kill_session(client_session);
                }

                let _ = handle.command_tx.send(SessionCommand::Close {
                    client_session: None,
                    socket_path: None,
                });

                debug!("Sent shutdown signal to session: {}", session_id);
            }

            // Brief wait for PTY threads to see EOF and exit
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
        //
        // SAFETY: If the lock is contended we MUST skip cleanup entirely.
        // Falling back to an empty set would make every live session look
        // "stale" and get killed — a P1 data-loss scenario.
        let active_clients: std::collections::HashSet<String> = match self.sessions.try_lock() {
            Ok(sessions) => sessions
                .values()
                .filter_map(|h| h.client_session.clone())
                .collect(),
            Err(_) => {
                debug!("Skipping stale client cleanup: sessions lock is contended");
                return;
            }
        };

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

    /// Kill tmux windows in atmos sessions that are not backed by any active
    /// `SessionHandle`. Each tmux window holds a shell process (zsh/bash) that
    /// consumes a PTY device. Over many hot-reload cycles, windows accumulate
    /// because `close_session` intentionally preserves them for persistence.
    ///
    /// This is the "nuclear" cleanup for PTY exhaustion: it kills the shell
    /// processes by destroying their tmux windows. Only call this when PTY
    /// usage is critical and normal cleanup didn't help.
    ///
    /// Returns the number of windows killed.
    pub fn cleanup_unused_tmux_windows(&self) -> u32 {
        // Collect the set of (tmux_session, window_index) pairs that are
        // currently attached to an active SessionHandle.
        let active_windows: std::collections::HashSet<(String, u32)> =
            match self.sessions.try_lock() {
                Ok(sessions) => sessions
                    .values()
                    .filter_map(|h| {
                        if let (Some(ts), Some(wi)) = (&h.tmux_session, h.tmux_window_index) {
                            Some((ts.clone(), wi))
                        } else {
                            None
                        }
                    })
                    .collect(),
                Err(_) => {
                    debug!("Skipping unused window cleanup: sessions lock is contended");
                    return 0;
                }
            };

        let atmos_sessions = match self.tmux_engine.list_atmos_sessions() {
            Ok(s) => s,
            Err(e) => {
                warn!("Failed to list atmos sessions for window cleanup: {}", e);
                return 0;
            }
        };

        let mut killed = 0u32;
        for session in &atmos_sessions {
            // Skip client sessions — they are cleaned up by cleanup_stale_client_sessions
            if session.name.starts_with("atmos_client_") {
                continue;
            }

            let windows = match self.tmux_engine.list_windows(&session.name) {
                Ok(w) => w,
                Err(_) => continue,
            };

            for window in &windows {
                if !active_windows.contains(&(session.name.clone(), window.index)) {
                    if let Err(e) = self.tmux_engine.kill_window(&session.name, window.index) {
                        warn!(
                            "Failed to kill unused tmux window {}:{}: {}",
                            session.name, window.index, e
                        );
                    } else {
                        killed += 1;
                    }
                }
            }
        }

        if killed > 0 {
            info!(
                "Killed {} unused tmux windows (skipped {} active)",
                killed,
                active_windows.len()
            );
        }

        killed
    }

    /// Start a background task that periodically cleans up stale tmux client
    /// sessions. During development with hot-reload, the API process can be
    /// killed before graceful shutdown finishes, leaving orphaned `atmos_client_*`
    /// tmux sessions that each hold a PTY device. This reaper runs every
    /// `interval` and reclaims those leaked PTYs automatically.
    ///
    /// Returns a `JoinHandle` that the caller can abort on shutdown.
    pub fn start_stale_session_reaper(
        self: &Arc<Self>,
        interval: std::time::Duration,
    ) -> tokio::task::JoinHandle<()> {
        let service = Arc::clone(self);
        self.reaper_running.store(true, Ordering::SeqCst);
        let running = self.reaper_running.clone();

        tokio::spawn(async move {
            let mut tick = tokio::time::interval(interval);
            // The first tick fires immediately; skip it so we don't duplicate
            // the startup cleanup that runs in main().
            tick.tick().await;

            while running.load(Ordering::SeqCst) {
                tick.tick().await;
                if !running.load(Ordering::SeqCst) {
                    break;
                }
                service.cleanup_stale_client_sessions();
            }
            debug!("Stale session reaper stopped");
        })
    }

    /// Check current system PTY usage and return (current, max, usage_percent).
    /// Returns None if the information cannot be determined.
    pub fn get_pty_usage() -> Option<(u64, u64, f64)> {
        let os = std::env::consts::OS;

        let pty_max: Option<u64> = if os == "macos" {
            std::process::Command::new("sysctl")
                .args(["-n", "kern.tty.ptmx_max"])
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| s.trim().parse().ok())
        } else {
            std::fs::read_to_string("/proc/sys/kernel/pty/max")
                .ok()
                .and_then(|s| s.trim().parse().ok())
        };

        let pty_current: Option<u64> = if os == "macos" {
            std::fs::read_dir("/dev").ok().map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_name().to_string_lossy().starts_with("ttys"))
                    .count() as u64
            })
        } else {
            std::fs::read_to_string("/proc/sys/kernel/pty/nr")
                .ok()
                .and_then(|s| s.trim().parse().ok())
                .or_else(|| {
                    std::fs::read_dir("/dev/pts")
                        .ok()
                        .map(|entries| entries.filter_map(|e| e.ok()).count() as u64)
                })
        };

        match (pty_current, pty_max) {
            (Some(cur), Some(max)) if max > 0 => {
                Some((cur, max, (cur as f64 / max as f64) * 100.0))
            }
            _ => None,
        }
    }

    /// Check PTY usage and perform emergency cleanup if usage is critical (>=85%).
    /// Logs a warning at >=70%. Returns Ok(()) if usage is acceptable or cleanup
    /// freed enough resources, Err if PTY pool is exhausted.
    pub fn check_pty_health_and_cleanup(&self) -> Result<()> {
        if let Some((current, max, pct)) = Self::get_pty_usage() {
            if pct >= 85.0 {
                warn!(
                    "PTY usage critical: {}/{} ({:.1}%) — running emergency cleanup",
                    current, max, pct
                );
                self.cleanup_stale_client_sessions();

                if let Some((after_current, after_max, after_pct)) = Self::get_pty_usage() {
                    if after_pct >= 95.0 {
                        error!(
                            "PTY pool nearly exhausted after cleanup: {}/{} ({:.1}%)",
                            after_current, after_max, after_pct
                        );
                        return Err(ServiceError::Processing(format!(
                            "PTY devices nearly exhausted ({}/{}). Close unused terminals or restart the application.",
                            after_current, after_max
                        )));
                    }
                    info!(
                        "PTY usage after cleanup: {}/{} ({:.1}%)",
                        after_current, after_max, after_pct
                    );
                }
            } else if pct >= 70.0 {
                warn!(
                    "PTY usage elevated: {}/{} ({:.1}%) — consider closing unused terminals",
                    current, max, pct
                );
            }
        }
        Ok(())
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
            for (session_id, handle) in &matching_handles {
                // Kill client session synchronously to free PTY immediately
                if let Some(ref client_session) = handle.client_session {
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

/// Run PTY session attached to a tmux window
#[allow(clippy::too_many_arguments)]
fn run_pty_session_with_tmux(
    session_id: String,
    tmux_session: String, // This is now the client session (grouped)
    _window_index: u32,
    _shell: Option<String>,
    cols: u16,
    rows: u16,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    init_tx: oneshot::Sender<Result<()>>,
    _is_attach: bool,
) {
    // Build socket path
    let socket_path: std::path::PathBuf = dirs::home_dir()
        .map(|h: std::path::PathBuf| h.join(".atmos").join("atmos.sock"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/.atmos/atmos.sock"));

    // Wait for the tmux session to be fully created before attempting to attach
    // This handles race conditions where the PTY thread starts before tmux finishes processing
    let max_retries = 10;
    let retry_delay = std::time::Duration::from_millis(50);
    let mut session_ready = false;

    for attempt in 0..max_retries {
        let mut check_cmd = std::process::Command::new("tmux");
        check_cmd.args([
            "-u",
            "-f",
            "/dev/null",
            "-S",
            &socket_path.to_string_lossy(),
            "has-session",
            "-t",
            &tmux_session,
        ]);
        apply_utf8_env_to_tmux_command(&mut check_cmd);
        let check_output = check_cmd.output();

        match check_output {
            Ok(output) if output.status.success() => {
                session_ready = true;
                if attempt > 0 {
                    debug!(
                        "Tmux session '{}' ready after {} attempts",
                        tmux_session,
                        attempt + 1
                    );
                }
                break;
            }
            _ => {
                if attempt < max_retries - 1 {
                    std::thread::sleep(retry_delay);
                }
            }
        }
    }

    if !session_ready {
        let _ = init_tx.send(Err(ServiceError::Processing(format!(
            "Tmux session '{}' not ready after {} retries",
            tmux_session, max_retries
        ))));
        return;
    }

    // Build tmux attach command
    let mut cmd = CommandBuilder::new("tmux");
    cmd.args([
        "-u",
        "-f",
        "/dev/null",
        "-S",
        &socket_path.to_string_lossy(),
        "attach-session",
        "-t",
        &tmux_session,
    ]);
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
    // Use blocking recv since we're in a dedicated thread
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    // Will be set by Close command for post-detach cleanup
    let mut close_client_session: Option<String> = None;
    let mut close_socket_path: Option<std::path::PathBuf> = None;

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
                SessionCommand::Resize { cols, rows } => {
                    if let Err(e) = master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    }) {
                        debug!("Failed to resize PTY for session {}: {}", session_id, e);
                    }
                }
                SessionCommand::Close {
                    client_session: cs,
                    socket_path: sp,
                } => {
                    debug!("Closing PTY session (detaching): {}", session_id);

                    // Use `tmux detach-client` for reliable detach instead of the
                    // fragile Ctrl+B,d key sequence. The key sequence is unreliable:
                    // 1. Depends on prefix key being Ctrl+B (user's .tmux.conf may differ)
                    // 2. Input buffering can interfere with prefix + 'd' sequence
                    // 3. Programs consuming input (vim, etc.) intercept the keys
                    // `detach-client` is a direct command to the tmux server that
                    // always works and produces a clean exit (no "[exited]" message).
                    let detached = if let (Some(ref client_name), Some(ref sock)) = (&cs, &sp) {
                        let mut detach_cmd = std::process::Command::new("tmux");
                        detach_cmd.args([
                            "-u",
                            "-f",
                            "/dev/null",
                            "-S",
                            &sock.to_string_lossy(),
                            "detach-client",
                            "-s",
                            client_name,
                        ]);
                        apply_utf8_env_to_tmux_command(&mut detach_cmd);
                        detach_cmd
                            .output()
                            .map(|o| o.status.success())
                            .unwrap_or(false)
                    } else {
                        false
                    };

                    if !detached {
                        // Fallback to key sequence if detach-client failed or
                        // client info was not provided (shouldn't happen normally)
                        let _ = writer.write_all(&[0x02, b'd']); // Ctrl+B, d
                        let _ = writer.flush();
                    }

                    // Store client session info for post-detach cleanup
                    close_client_session = cs;
                    close_socket_path = sp;
                    break;
                }
            }
        }
    });

    // Wait for reader thread to finish (reader exits once PTY sees EOF from detach)
    let _ = reader_handle.join();

    // NOW kill the client tmux session as cleanup AFTER the PTY has fully detached.
    // This ordering is critical: killing the session while the PTY is still attached
    // causes tmux to write "[exited]" / "can't find session" to the PTY output,
    // which can leak to the frontend terminal.
    if let Some(cs) = close_client_session {
        if let Some(sp) = close_socket_path {
            let mut kill_cmd = std::process::Command::new("tmux");
            kill_cmd.args(["-u", "-S", &sp.to_string_lossy(), "kill-session", "-t", &cs]);
            apply_utf8_env_to_tmux_command(&mut kill_cmd);
            let _ = kill_cmd.output();
            debug!("Killed client tmux session after detach: {}", cs);
        }
    }

    info!("PTY session thread exited (detached): {}", session_id);
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
