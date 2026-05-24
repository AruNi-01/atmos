use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;

use core_engine::tmux::control::{
    encode_refresh_client_report_command, encode_send_keys_hex_commands, parse_control_line_bytes,
    ControlModeEvent, TmuxPassthroughUnwrapper,
};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, info, warn};

use crate::error::{Result, ServiceError};

use super::{is_usable_browser_size, SessionCommand};

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

pub(super) fn apply_utf8_env_to_tmux_command(cmd: &mut std::process::Command) {
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
pub(super) fn run_control_mode_tmux_session(
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

        // Suppress %output bytes that flow during the tmux control client's
        // initial attach/resize/refresh cycle. Those bytes are tmux replaying
        // the pane's current visible state — the exact same content that
        // `capture_pane_snapshot` (called by the caller right after this
        // thread finishes init) hands the frontend as a one-shot JSON snapshot
        // applied via xterm `writeSync`. Forwarding the replay too would force
        // the slow rAF-batched `term.write()` path to redraw the same pixels,
        // which is what users see as "the terminal slowly scrolls from the
        // top" after switching workspaces or reattaching.
        //
        // Boundary: tmux processes commands serially in its event loop and
        // emits %begin/%end (or %error on failure) per command. We send
        // exactly two init commands below (resize-window + refresh-client),
        // so the 2nd %end / %error means all redundant repaint %output is
        // behind us and any subsequent %output is genuine PTY activity.
        let mut suppress_pane_output = true;
        let mut init_responses_remaining: u8 = 2;

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
                        if suppress_pane_output {
                            // Always feed bytes through the DCS passthrough
                            // unwrapper so its state machine stays in sync
                            // with the live stream even while we drop them.
                            let _ = passthrough_unwrapper.push(&data);
                            continue;
                        }
                        // Preserve synchronized-output markers. Modern TUIs use
                        // them to bracket a complete redraw frame; xterm.js can
                        // use that hint to avoid presenting half-drawn frames.
                        let data = passthrough_unwrapper.push(&data);
                        if !data.is_empty() && output_tx.send(data).is_err() {
                            break;
                        }
                    }
                    Some(ControlModeEvent::End) => {
                        if init_responses_remaining > 0 {
                            init_responses_remaining -= 1;
                            if init_responses_remaining == 0 {
                                suppress_pane_output = false;
                            }
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
                        // %error terminates a command response the same way
                        // %end does, so it still counts against our init
                        // response budget — otherwise a failed init command
                        // would leave the suppress flag stuck forever.
                        if init_responses_remaining > 0 {
                            init_responses_remaining -= 1;
                            if init_responses_remaining == 0 {
                                suppress_pane_output = false;
                            }
                        }
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
