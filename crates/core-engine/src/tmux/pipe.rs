//! tmux `pipe-pane` live I/O (APP-062).
//!
//! One duplex Unix socket per pane. tmux runs a helper that copies pane output
//! (`-O` → helper stdin) to the socket and socket bytes to pane input
//! (helper stdout → `-I`). No `send-keys -H`, no `%output` octal.

use std::fs;
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use tracing::{debug, warn};

use super::install::tmux_bin_for_engine;
use super::locale::apply_utf8_env;
use super::TmuxEngine;
use crate::error::{EngineError, Result};

const ACCEPT_TIMEOUT: Duration = Duration::from_secs(3);
const ACCEPT_POLL: Duration = Duration::from_millis(20);

/// Bound helper socket plus the accepted duplex stream.
pub struct PanePipeSpec {
    pub stream: UnixStream,
    pub socket_path: PathBuf,
}

/// `~/.atmos/state/tmux-pipes`, overridable with `ATMOS_TMUX_PIPES_DIR`.
/// Same relative path as `runtime_manager::layout::tmux_pipes_dir`.
pub fn tmux_pipes_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ATMOS_TMUX_PIPES_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".atmos/state/tmux-pipes")
}

/// Safe socket file stem: `{sanitized-session}_w{index}`.
pub fn sanitize_tmux_pipe_socket_stem(session: &str, window_index: u32) -> String {
    let mut safe = String::with_capacity(session.len());
    for c in session.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
            safe.push(c);
        } else {
            safe.push('_');
        }
    }
    if safe.is_empty() {
        safe.push_str("session");
    }
    format!("{safe}_w{window_index}")
}

pub fn tmux_pipe_socket_path(session: &str, window_index: u32) -> PathBuf {
    tmux_pipes_dir().join(format!(
        "{}.sock",
        sanitize_tmux_pipe_socket_stem(session, window_index)
    ))
}

/// POSIX sh single-quote wrapping for `pipe-pane` shell-command.
pub fn shell_single_quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('\'');
    for ch in value.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

/// Framing-free copy. Flushes after every chunk so tmux sees input promptly.
pub fn copy_raw<R: Read, W: Write>(reader: &mut R, writer: &mut W) -> io::Result<u64> {
    let mut buf = [0u8; 8192];
    let mut total = 0u64;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n])?;
        writer.flush()?;
        total += n as u64;
    }
    Ok(total)
}

/// Helper process: stdin (pane output) ⇄ UDS ⇄ stdout (pane input).
///
/// Exits when either side hits EOF.
pub fn run_tmux_pipe_bridge(uds_path: &Path) -> io::Result<()> {
    let stream = UnixStream::connect(uds_path)?;
    let stream_out = stream.try_clone()?;
    let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();

    let stdin_done = done_tx.clone();
    thread::spawn(move || {
        let mut stdin = io::stdin();
        let mut sock = stream_out;
        let _ = copy_raw(&mut stdin, &mut sock);
        let _ = stdin_done.send(());
    });

    thread::spawn(move || {
        let mut sock = stream;
        let mut stdout = io::stdout();
        let _ = copy_raw(&mut sock, &mut stdout);
        let _ = done_tx.send(());
    });

    let _ = done_rx.recv();
    Ok(())
}

/// If argv is `--internal tmux-pipe-bridge --uds <path>`, run the helper and exit.
/// Returns `false` when this process should continue as the API/CLI.
pub fn try_run_internal_from_env() -> bool {
    let mut args = std::env::args();
    let _exe = args.next();
    if args.next().as_deref() != Some("--internal") {
        return false;
    }
    match args.next().as_deref() {
        Some("tmux-pipe-bridge") => {
            let Some(uds) = parse_uds_arg(args) else {
                eprintln!("tmux-pipe-bridge: missing --uds <path>");
                std::process::exit(2);
            };
            if let Err(error) = run_tmux_pipe_bridge(&uds) {
                eprintln!("tmux-pipe-bridge: {error}");
                std::process::exit(1);
            }
            std::process::exit(0);
        }
        Some(other) => {
            eprintln!("unknown --internal command: {other}");
            std::process::exit(2);
        }
        None => {
            eprintln!("missing --internal command");
            std::process::exit(2);
        }
    }
}

fn parse_uds_arg(mut args: impl Iterator<Item = String>) -> Option<PathBuf> {
    while let Some(arg) = args.next() {
        if let Some(path) = arg.strip_prefix("--uds=") {
            return Some(PathBuf::from(path));
        }
        if arg == "--uds" {
            return args.next().map(PathBuf::from);
        }
    }
    None
}

fn ensure_pipes_dir(dir: &Path) -> Result<()> {
    if !dir.exists() {
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .map_err(|e| EngineError::Tmux(format!("Failed to create tmux pipe dir: {e}")))?;
    } else {
        let mut perms = fs::metadata(dir)
            .map_err(|e| EngineError::Tmux(format!("Failed to stat tmux pipe dir: {e}")))?
            .permissions();
        perms.set_mode(0o700);
        let _ = fs::set_permissions(dir, perms);
    }
    Ok(())
}

fn accept_with_timeout(listener: &UnixListener) -> Result<UnixStream> {
    listener
        .set_nonblocking(true)
        .map_err(|e| EngineError::Tmux(format!("Failed to set pipe listener nonblocking: {e}")))?;
    let deadline = Instant::now() + ACCEPT_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_nonblocking(false).map_err(|e| {
                    EngineError::Tmux(format!("Failed to set pipe stream blocking: {e}"))
                })?;
                return Ok(stream);
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(EngineError::Tmux(
                        "Timed out waiting for tmux pipe-pane helper to connect".to_string(),
                    ));
                }
                thread::sleep(ACCEPT_POLL);
            }
            Err(error) => {
                return Err(EngineError::Tmux(format!(
                    "Failed to accept tmux pipe helper: {error}"
                )));
            }
        }
    }
}

fn helper_shell_command(uds_path: &Path) -> Result<String> {
    let exe = std::env::current_exe()
        .map_err(|e| EngineError::Tmux(format!("Failed to resolve current exe: {e}")))?;
    Ok(format!(
        "{} --internal tmux-pipe-bridge --uds {}",
        shell_single_quote(&exe.to_string_lossy()),
        shell_single_quote(&uds_path.to_string_lossy())
    ))
}

fn pane_target(session: &str, window_index: u32) -> String {
    format!("{session}:{window_index}.0")
}

impl TmuxEngine {
    /// Bind a UDS, start `pipe-pane -o -I -O`, accept the helper.
    ///
    /// On timeout or already-open pipe: close the pipe and retry once (M9, no
    /// control-mode fallback).
    pub fn attach_pane_pipe(&self, session: &str, window_index: u32) -> Result<PanePipeSpec> {
        let dir = tmux_pipes_dir();
        ensure_pipes_dir(&dir)?;
        let socket_path = tmux_pipe_socket_path(session, window_index);
        let _ = fs::remove_file(&socket_path);

        match self.attach_pane_pipe_once(session, window_index, &socket_path) {
            Ok(spec) => Ok(spec),
            Err(first) => {
                warn!(
                    "pipe-pane attach failed for {}:{} ({first}); detaching and retrying once",
                    session, window_index
                );
                let _ = self.detach_pane_pipe(session, window_index);
                let _ = fs::remove_file(&socket_path);
                self.attach_pane_pipe_once(session, window_index, &socket_path)
            }
        }
    }

    fn attach_pane_pipe_once(
        &self,
        session: &str,
        window_index: u32,
        socket_path: &Path,
    ) -> Result<PanePipeSpec> {
        let listener = UnixListener::bind(socket_path).map_err(|e| {
            EngineError::Tmux(format!(
                "Failed to bind tmux pipe socket {}: {e}",
                socket_path.display()
            ))
        })?;
        let helper = helper_shell_command(socket_path)?;
        let target = pane_target(session, window_index);

        debug!(
            tmux_bin = %tmux_bin_for_engine(),
            target = %target,
            socket = %socket_path.display(),
            "opening tmux pipe-pane"
        );

        let mut cmd = std::process::Command::new(tmux_bin_for_engine());
        cmd.arg("-u")
            .arg("-f")
            .arg("/dev/null")
            .arg("-S")
            .arg(self.socket_file_path())
            .arg("pipe-pane")
            .arg("-t")
            .arg(&target)
            .arg("-o")
            .arg("-I")
            .arg("-O")
            .arg(&helper);
        apply_utf8_env(&mut cmd);
        let output = cmd
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to execute pipe-pane: {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(EngineError::Tmux(format!("pipe-pane error: {stderr}")));
        }

        let stream = accept_with_timeout(&listener)?;
        // Connection is live; the filesystem name is no longer required.
        let _ = fs::remove_file(socket_path);
        Ok(PanePipeSpec {
            stream,
            socket_path: socket_path.to_path_buf(),
        })
    }

    /// Close the pane pipe (`pipe-pane` with an empty command).
    pub fn detach_pane_pipe(&self, session: &str, window_index: u32) -> Result<()> {
        let target = pane_target(session, window_index);
        let mut cmd = std::process::Command::new(tmux_bin_for_engine());
        cmd.arg("-u")
            .arg("-f")
            .arg("/dev/null")
            .arg("-S")
            .arg(self.socket_file_path())
            .arg("pipe-pane")
            .arg("-t")
            .arg(&target);
        apply_utf8_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                debug!("detached pipe-pane for {target}");
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr.is_empty()
                    && !stderr.contains("no pane")
                    && !stderr.contains("can't find")
                {
                    debug!("pipe-pane detach for {target}: {stderr}");
                }
            }
            Err(error) => {
                debug!("pipe-pane detach spawn failed for {target}: {error}");
            }
        }
        let _ = fs::remove_file(tmux_pipe_socket_path(session, window_index));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_unsafe_session_chars() {
        assert_eq!(
            sanitize_tmux_pipe_socket_stem("proj:ws/name", 3),
            "proj_ws_name_w3"
        );
        assert_eq!(
            sanitize_tmux_pipe_socket_stem("Atmos_Main", 1),
            "Atmos_Main_w1"
        );
        assert_eq!(sanitize_tmux_pipe_socket_stem("", 0), "session_w0");
    }

    #[test]
    fn shell_quote_wraps_and_escapes_quotes() {
        assert_eq!(shell_single_quote("abc"), "'abc'");
        assert_eq!(shell_single_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn copy_raw_is_identity_including_nul_and_esc() {
        let input = [b'a', 0x00, 0x1b, b'[', b'?', b'1', b'0', b'0', b'0', b'h'];
        let mut out = Vec::new();
        copy_raw(&mut &input[..], &mut out).unwrap();
        assert_eq!(out, input);
    }

    #[test]
    fn copy_raw_does_not_hex_or_octal_encode() {
        let input = b"\x1b]11;rgb:00/00/00\x1b\\";
        let mut out = Vec::new();
        copy_raw(&mut &input[..], &mut out).unwrap();
        assert_eq!(out, input);
        let as_text = String::from_utf8_lossy(&out);
        assert!(!as_text.contains("send-keys"));
        assert!(!as_text.contains("\\033"));
    }

    #[test]
    fn parse_uds_supports_space_and_equals() {
        let path = parse_uds_arg(["--uds".into(), "/tmp/a.sock".into()].into_iter()).unwrap();
        assert_eq!(path, PathBuf::from("/tmp/a.sock"));
        let path = parse_uds_arg(["--uds=/tmp/b.sock".into()].into_iter()).unwrap();
        assert_eq!(path, PathBuf::from("/tmp/b.sock"));
    }

    #[test]
    fn bridge_copies_stdio_to_unix_stream_pair() {
        let (left, right) = UnixStream::pair().unwrap();
        let payload = vec![b'x', 0x00, 0x1b];
        let payload_clone = payload.clone();

        let reader_thread = thread::spawn(move || {
            let mut right = right;
            let mut buf = vec![0u8; 16];
            let n = right.read(&mut buf).unwrap();
            buf.truncate(n);
            buf
        });

        let mut left = left;
        copy_raw(&mut &payload_clone[..], &mut left).unwrap();
        drop(left);
        assert_eq!(reader_thread.join().unwrap(), payload);
    }
}
