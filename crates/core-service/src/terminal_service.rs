//! Terminal Service - PTY session management with tmux persistence
//!
//! This service handles creating, managing, and destroying terminal sessions
//! that connect to tmux for persistence and communicate over WebSocket.
//!
//! Design: 
//! - Each terminal session maps to a tmux window
//! - PTY operations run in dedicated threads, communicating via channels
//! - Closing a session detaches the PTY but keeps the tmux window alive

use anyhow::{anyhow, Result};
use core_engine::TmuxEngine;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

/// Commands that can be sent to a terminal session thread
#[derive(Debug)]
enum SessionCommand {
    Write(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Close,
}

/// Terminal session handle - thread-safe wrapper for PTY session
struct SessionHandle {
    command_tx: mpsc::UnboundedSender<SessionCommand>,
    #[allow(dead_code)]
    workspace_id: String,
    tmux_session: String,
    tmux_window_index: u32,
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
}

/// Terminal service managing all PTY sessions with tmux persistence
/// This struct is Send + Sync safe
pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    tmux_engine: Arc<TmuxEngine>,
    default_cols: u16,
    default_rows: u16,
}

impl Default for TerminalService {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalService {
    /// Create a new terminal service
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            tmux_engine: Arc::new(TmuxEngine::new()),
            default_cols: 120,
            default_rows: 30,
        }
    }

    /// Create terminal service with custom TmuxEngine
    pub fn with_tmux_engine(tmux_engine: Arc<TmuxEngine>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            tmux_engine,
            default_cols: 120,
            default_rows: 30,
        }
    }

    /// Get the TmuxEngine reference
    pub fn tmux_engine(&self) -> Arc<TmuxEngine> {
        self.tmux_engine.clone()
    }

    /// Check if tmux is available
    pub fn is_tmux_available(&self) -> bool {
        TmuxEngine::check_installed()
    }

    /// Get tmux version info
    pub fn get_tmux_version(&self) -> Result<core_engine::TmuxVersion> {
        TmuxEngine::get_version().map_err(|e| anyhow!("{}", e))
    }

    /// Create a new terminal session with tmux persistence
    /// Returns a receiver for terminal output
    pub async fn create_session(
        &self,
        session_id: String,
        workspace_id: String,
        shell: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        // Optional human-readable names for clean tmux naming
        project_name: Option<String>,
        workspace_name: Option<String>,
        window_name: Option<String>,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Check if session_id is already active in our service
        // If so, just attach to it. This handles duplicate mount calls (e.g. React Strict Mode)
        {
            let sessions = self.sessions.lock().await;
            if let Some(handle) = sessions.get(&session_id) {
                info!("Session {} already active, reusing existing handle", session_id);
                // We need more complex logic to get a new receiver if the old one is gone,
                // but for now let's just use attach logic if we can.
                // Actually, the simplest way is to call attach_session internally.
                drop(sessions);
                return match self.attach_session(
                    session_id.clone(),
                    workspace_id.clone(),
                    None,
                    window_name.clone(),
                    Some(cols),
                    Some(rows),
                    project_name.clone(),
                    workspace_name.clone(),
                ).await {
                    Ok((rx, _)) => Ok(rx),
                    Err(e) => Err(anyhow!("Failed to attach to existing session {}: {}", session_id, e)),
                };
            }
        }

        info!(
            "Creating terminal session: {} for workspace: {} ({}x{})",
            session_id, workspace_id, cols, rows
        );

        // Create or get tmux session for this workspace
        // Use human-readable names if provided, otherwise fall back to workspace_id
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name) {
            self.tmux_engine
                .create_session_with_names(proj, ws)
                .map_err(|e| anyhow!("Failed to create tmux session: {}", e))?
        } else {
            self.tmux_engine
                .create_session(&workspace_id)
                .map_err(|e| anyhow!("Failed to create tmux session: {}", e))?
        };

        // Create a new tmux window for this terminal pane
        // If a window_name is provided but already exists in tmux, increment it to find a unique name.
        let existing_windows = self.tmux_engine.list_windows(&tmux_session)
            .unwrap_or_default();
        let existing_names: std::collections::HashSet<String> = existing_windows.iter().map(|w| w.name.clone()).collect();

        let final_window_name = if let Some(name) = window_name {
            if !existing_names.contains(&name) {
                name
            } else {
                // Name conflict! Find next available number
                let mut num = 1;
                while existing_names.contains(&num.to_string()) {
                    num += 1;
                }
                num.to_string()
            }
        } else {
            // Auto-increment: use next available number
            let mut num = existing_windows.len() + 1;
            while existing_names.contains(&num.to_string()) {
                num += 1;
            }
            num.to_string()
        };
        
        info!("Assigning tmux window: {} for session: {}", final_window_name, session_id);

        let window_index = self.tmux_engine
            .create_window(&tmux_session, &final_window_name)
            .map_err(|e| anyhow!("Failed to create tmux window: {}", e))?;

        // Now attach to this tmux window via PTY
        self.attach_to_tmux_window(
            session_id,
            workspace_id,
            tmux_session,
            window_index,
            shell,
            cols,
            rows,
            false,
        )
        .await
    }

    /// Attach to an existing tmux window (for reconnection)
    pub async fn attach_session(
        &self,
        session_id: String,
        workspace_id: String,
        tmux_window_index: Option<u32>,
        tmux_window_name: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
        // Optional human-readable names for session lookup
        project_name: Option<String>,
        workspace_name: Option<String>,
    ) -> Result<(mpsc::UnboundedReceiver<Vec<u8>>, Option<String>)> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        // Use human-readable session name if provided, otherwise fall back to workspace_id
        let tmux_session = if let (Some(ref proj), Some(ref ws)) = (&project_name, &workspace_name) {
            self.tmux_engine.get_session_name_from_names(proj, ws)
        } else {
            self.tmux_engine.get_session_name(&workspace_id)
        };

        // Determine the actual window index to attach to
        let final_window_index = if let Some(idx) = tmux_window_index {
            idx
        } else if let Some(name) = tmux_window_name {
            self.tmux_engine.find_window_index_by_name(&tmux_session, &name)?
                .ok_or_else(|| anyhow!("Tmux window with name '{}' not found", name))?
        } else {
            return Err(anyhow!("Neither tmux window index nor name provided for attachment"));
        };

        // Check if window exists
        if !self.tmux_engine.window_exists(&tmux_session, final_window_index)
            .map_err(|e| anyhow!("Failed to check window: {}", e))? 
        {
            return Err(anyhow!("Tmux window does not exist at index {}", final_window_index));
        }

        // Capture recent history before attaching (match tmux history-limit)
        let history = self.tmux_engine
            .capture_pane(&tmux_session, final_window_index, Some(10000))
            .ok();

        info!(
            "Attaching to existing tmux window: {}:{} for session {}",
            tmux_session, final_window_index, session_id
        );

        let rx = self.attach_to_tmux_window(
            session_id,
            workspace_id,
            tmux_session,
            final_window_index,
            None, // Don't override shell for existing window
            cols,
            rows,
            true,
        )
        .await?;

        Ok((rx, history))
    }

    /// Internal: Attach PTY to a tmux window
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
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        // Channel for sending commands to the PTY thread
        let (command_tx, command_rx) = mpsc::unbounded_channel::<SessionCommand>();
        
        // Channel for receiving PTY output
        let (output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        
        // Channel for receiving initialization result
        let (init_tx, init_rx) = oneshot::channel::<Result<()>>();

        let session_id_clone = session_id.clone();
        let tmux_session_clone = tmux_session.clone();
        
        // Spawn a dedicated thread for PTY operations
        thread::spawn(move || {
            run_pty_session_with_tmux(
                session_id_clone,
                tmux_session_clone,
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
                // Store session handle
                let handle = SessionHandle {
                    command_tx,
                    workspace_id: workspace_id.clone(),
                    tmux_session,
                    tmux_window_index: window_index,
                };
                
                self.sessions.lock().await.insert(session_id.clone(), handle);
                info!("Terminal session created/attached: {} (window index: {})", session_id, window_index);
                Ok(output_rx)
            }
            Ok(Err(e)) => {
                error!("Failed to create terminal session: {}", e);
                Err(e)
            }
            Err(_) => {
                error!("PTY thread failed to respond");
                Err(anyhow!("PTY initialization failed"))
            }
        }
    }

    /// Send input data to a terminal session
    pub async fn send_input(&self, session_id: &str, data: &str) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;

        handle
            .command_tx
            .send(SessionCommand::Write(data.as_bytes().to_vec()))
            .map_err(|_| anyhow!("Session thread has exited"))?;

        Ok(())
    }

    /// Resize a terminal session
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;

        // Resize tmux pane as well
        if let Err(e) = self.tmux_engine.resize_pane(
            &handle.tmux_session, 
            handle.tmux_window_index, 
            cols, 
            rows
        ) {
            warn!("Failed to resize tmux pane: {}", e);
        }

        handle
            .command_tx
            .send(SessionCommand::Resize { cols, rows })
            .map_err(|_| anyhow!("Session thread has exited"))?;

        debug!("Terminal session {} resized to {}x{}", session_id, cols, rows);
        Ok(())
    }

    /// Close a terminal session (detach PTY but keep tmux window for persistence)
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Send close command to PTY thread (ignore error if thread already exited)
            let _ = handle.command_tx.send(SessionCommand::Close);
            info!(
                "Terminal session closed (detached): {} - tmux window {}:{} preserved",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
            Err(anyhow!("Session not found: {}", session_id))
        }
    }

    /// Destroy a terminal session (kill tmux window)
    pub async fn destroy_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Send close command to PTY thread
            let _ = handle.command_tx.send(SessionCommand::Close);
            
            // Kill the tmux window
            if let Err(e) = self.tmux_engine.kill_window(&handle.tmux_session, handle.tmux_window_index) {
                warn!("Failed to kill tmux window: {}", e);
            }
            
            info!(
                "Terminal session destroyed: {} - tmux window {}:{} killed",
                session_id, handle.tmux_session, handle.tmux_window_index
            );
            Ok(())
        } else {
            warn!("Attempted to destroy non-existent session: {}", session_id);
            Err(anyhow!("Session not found: {}", session_id))
        }
    }

    /// Get session info (tmux window index) for reconnection
    pub async fn get_session_info(&self, session_id: &str) -> Option<(String, u32)> {
        let sessions = self.sessions.lock().await;
        sessions.get(session_id).map(|h| (h.tmux_session.clone(), h.tmux_window_index))
    }

    /// List all tmux windows for a workspace (for reconnection)
    pub fn list_workspace_windows(&self, workspace_id: &str) -> Result<Vec<(u32, String)>> {
        let tmux_session = self.tmux_engine.get_session_name(workspace_id);
        let windows = self.tmux_engine.list_windows(&tmux_session)
            .map_err(|e| anyhow!("{}", e))?;
        Ok(windows.into_iter().map(|w| (w.index, w.name)).collect())
    }

    /// Get all active session IDs
    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }

    /// Check if a session exists
    pub async fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.lock().await.contains_key(session_id)
    }

    /// Get session count
    pub async fn session_count(&self) -> usize {
        self.sessions.lock().await.len()
    }
}

/// Run PTY session attached to a tmux window
fn run_pty_session_with_tmux(
    session_id: String,
    tmux_session: String,
    window_index: u32,
    _shell: Option<String>,
    cols: u16,
    rows: u16,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    init_tx: oneshot::Sender<Result<()>>,
    is_attach: bool,
) {
    // Create PTY system
    let pty_system = native_pty_system();

    // Open PTY with specified size
    let pair = match pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            let _ = init_tx.send(Err(anyhow!("Failed to open PTY: {}", e)));
            return;
        }
    };

    // Build command to attach to tmux window
    // We use `tmux attach-session` to connect to the existing tmux pane
    let socket_path: std::path::PathBuf = dirs::home_dir()
        .map(|h: std::path::PathBuf| h.join(".atmos").join("atmos.sock"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/.atmos/atmos.sock"));
    
    let target = format!("{}:{}", tmux_session, window_index);
    
    let cmd = if is_attach {
        // For attach, we just connect to the existing shell in tmux
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["-S", &socket_path.to_string_lossy(), "attach-session", "-t", &target]);
        cmd
    } else {
        // For new sessions, we need to first ensure the shell is running
        // The tmux window was already created, so we just attach to it
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["-S", &socket_path.to_string_lossy(), "attach-session", "-t", &target]);
        cmd
    };

    // Spawn the tmux attach process
    if let Err(e) = pair.slave.spawn_command(cmd) {
        let _ = init_tx.send(Err(anyhow!("Failed to attach to tmux: {}", e)));
        return;
    }

    // Get reader and writer
    let mut reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            let _ = init_tx.send(Err(anyhow!("Failed to clone PTY reader: {}", e)));
            return;
        }
    };

    let mut writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            let _ = init_tx.send(Err(anyhow!("Failed to get PTY writer: {}", e)));
            return;
        }
    };

    // Store master for resize operations
    let master = pair.master;

    // Signal successful initialization
    if init_tx.send(Ok(())).is_err() {
        return;
    }

    // Spawn reader thread
    let session_id_reader = session_id.clone();
    let output_tx_clone = output_tx.clone();
    let reader_handle = thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    debug!("PTY reader EOF for session: {}", session_id_reader);
                    break;
                }
                Ok(n) => {
                    let data = buffer[..n].to_vec();
                    if output_tx_clone.send(data).is_err() {
                        debug!("Output channel closed for session: {}", session_id_reader);
                        break;
                    }
                }
                Err(e) => {
                    // Check if this is expected disconnect
                    let err_str = e.to_string();
                    if err_str.contains("Input/output error") || err_str.contains("EIO") {
                        debug!("PTY disconnected for session: {} (expected on close)", session_id_reader);
                    } else {
                        warn!("PTY read error for session {}: {}", session_id_reader, e);
                    }
                    break;
                }
            }
        }
    });

    // Process commands in main thread
    // Use blocking recv since we're in a dedicated thread
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    rt.block_on(async {
        while let Some(cmd) = command_rx.recv().await {
            match cmd {
                SessionCommand::Write(data) => {
                    if let Err(e) = writer.write_all(&data) {
                        debug!("Failed to write to PTY for session {}: {} (may be closed)", session_id, e);
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
                SessionCommand::Close => {
                    debug!("Closing PTY session (detaching): {}", session_id);
                    // Send detach key sequence to tmux (Ctrl+B, D)
                    // This detaches cleanly without killing the session
                    let _ = writer.write_all(&[0x02, b'd']); // Ctrl+B, d
                    let _ = writer.flush();
                    break;
                }
            }
        }
    });

    // Wait for reader thread to finish
    let _ = reader_handle.join();
    info!("PTY session thread exited (detached): {}", session_id);
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
