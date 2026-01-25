//! Terminal Service - PTY session management using portable-pty
//!
//! This service handles creating, managing, and destroying terminal sessions
//! that connect to the system's shell and communicate over WebSocket.
//!
//! Design: PTY operations run in dedicated threads, communicating via channels
//! to avoid Sync issues with trait objects.

use anyhow::{anyhow, Result};
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
    workspace_id: String,
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
    /// Send input to terminal
    TerminalInput { session_id: String, data: String },
    /// Resize terminal
    TerminalResize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    /// Close terminal session
    TerminalClose { session_id: String },
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
    /// Terminal output data
    TerminalOutput { session_id: String, data: String },
    /// Terminal session closed
    TerminalClosed { session_id: String },
    /// Error occurred
    TerminalError {
        session_id: Option<String>,
        error: String,
    },
}

/// Terminal service managing all PTY sessions
/// This struct is Send + Sync safe
pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
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
            default_cols: 120,
            default_rows: 30,
        }
    }

    /// Create a new terminal session with specified or default shell
    /// Returns a receiver for terminal output
    pub async fn create_session(
        &self,
        session_id: String,
        workspace_id: String,
        shell: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>> {
        let cols = cols.unwrap_or(self.default_cols);
        let rows = rows.unwrap_or(self.default_rows);

        info!(
            "Creating terminal session: {} for workspace: {} ({}x{})",
            session_id, workspace_id, cols, rows
        );

        // Channel for sending commands to the PTY thread
        let (command_tx, command_rx) = mpsc::unbounded_channel::<SessionCommand>();
        
        // Channel for receiving PTY output
        let (output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        
        // Channel for receiving initialization result
        let (init_tx, init_rx) = oneshot::channel::<Result<()>>();

        let session_id_clone = session_id.clone();
        
        // Spawn a dedicated thread for PTY operations
        thread::spawn(move || {
            run_pty_session(
                session_id_clone,
                shell,
                cols,
                rows,
                command_rx,
                output_tx,
                init_tx,
            );
        });

        // Wait for initialization result
        match init_rx.await {
            Ok(Ok(())) => {
                // Store session handle
                let handle = SessionHandle {
                    command_tx,
                    workspace_id: workspace_id.clone(),
                };
                
                self.sessions.lock().await.insert(session_id.clone(), handle);
                info!("Terminal session created: {}", session_id);
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

        handle
            .command_tx
            .send(SessionCommand::Resize { cols, rows })
            .map_err(|_| anyhow!("Session thread has exited"))?;

        debug!("Terminal session {} resized to {}x{}", session_id, cols, rows);
        Ok(())
    }

    /// Close and remove a terminal session
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            // Send close command (ignore error if thread already exited)
            let _ = handle.command_tx.send(SessionCommand::Close);
            info!("Terminal session closed: {}", session_id);
            Ok(())
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
            Err(anyhow!("Session not found: {}", session_id))
        }
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

/// Run PTY session in a dedicated thread
fn run_pty_session(
    session_id: String,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    init_tx: oneshot::Sender<Result<()>>,
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

    // Build command - use specified shell or default
    let cmd = match shell {
        Some(shell_path) => {
            let mut cmd = CommandBuilder::new(&shell_path);
            if shell_path.contains("bash") || shell_path.contains("zsh") {
                cmd.arg("-i");
            }
            cmd
        }
        None => CommandBuilder::new_default_prog(),
    };

    // Spawn the shell process
    if let Err(e) = pair.slave.spawn_command(cmd) {
        let _ = init_tx.send(Err(anyhow!("Failed to spawn shell: {}", e)));
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
                    error!("PTY read error for session {}: {}", session_id_reader, e);
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
                        error!("Failed to write to PTY for session {}: {}", session_id, e);
                        break;
                    }
                    if let Err(e) = writer.flush() {
                        error!("Failed to flush PTY for session {}: {}", session_id, e);
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
                        error!("Failed to resize PTY for session {}: {}", session_id, e);
                    }
                }
                SessionCommand::Close => {
                    debug!("Closing PTY session: {}", session_id);
                    break;
                }
            }
        }
    });

    // Wait for reader thread to finish
    let _ = reader_handle.join();
    info!("PTY session thread exited: {}", session_id);
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
}
