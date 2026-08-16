use std::io::{Read, Write};
use std::path::PathBuf;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, warn};

use crate::error::{Result, ServiceError};

use super::SessionCommand;

type PtySetup = (
    Box<dyn portable_pty::MasterPty + Send>,
    Box<dyn std::io::Read + Send>,
    Box<dyn std::io::Write + Send>,
);

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

fn apply_utf8_env_to_pty_command(cmd: &mut CommandBuilder) {
    let locale = resolve_utf8_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
}

/// Spawn a command inside a new PTY and return master, reader, and writer.
/// The PTY slave is dropped immediately after spawning to ensure clean EOF on exit.
fn setup_pty(cols: u16, rows: u16, cmd: CommandBuilder) -> std::result::Result<PtySetup, String> {
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

/// Run simple PTY session (NO tmux). Used only for `mode=shell`.
#[allow(clippy::too_many_arguments)]
pub(super) fn run_simple_pty_session(
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

    if init_tx.send(Ok(())).is_err() {
        return;
    }

    let reader_handle = spawn_pty_reader(session_id.clone(), reader, output_tx.clone());

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
                SessionCommand::Enter => {
                    if let Err(e) = writer.write_all(b"\r") {
                        debug!(
                            "Failed to write Enter to PTY for session {}: {} (may be closed)",
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
                SessionCommand::Close => {
                    debug!("Closing session {}", session_id);
                    break;
                }
            }
        }
    });

    let _ = reader_handle.join();
    debug!("PTY session thread exited for session: {}", session_id);
}
