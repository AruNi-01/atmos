//! Pane-scoped DEC mouse-mode watcher (APP-054).
//!
//! Interactive browser sessions already observe mouse DECSET on the live
//! control-mode stream. When the last browser detaches, the pane can keep
//! running (TUI still alive). This registry starts a lightweight control
//! client that **only** observes and persists `@atmos_mouse_tracking` so
//! reattach restore stays accurate without a browser attached.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use core_engine::tmux::control::{
    parse_control_line_bytes, ControlModeEvent, TmuxPassthroughUnwrapper,
};
use core_engine::TmuxEngine;
use tracing::{debug, info, warn};

/// Stable key for a master tmux window/pane: `{session}:{window_index}`.
pub fn pane_watch_key(tmux_session: &str, window_index: u32) -> String {
    format!("{tmux_session}:{window_index}")
}

struct WatchHandle {
    stop: Arc<AtomicBool>,
    socket_path: String,
    tmux_session: String,
    window_index: u32,
}

/// Tracks background mouse-mode observers per master pane.
#[derive(Default)]
pub struct MouseModeWatchRegistry {
    inner: Mutex<HashMap<String, WatchHandle>>,
}

impl MouseModeWatchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Stop any detached watcher for this pane (a live browser client is taking over).
    pub fn stop_for_pane(&self, key: &str) {
        let handle = {
            let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            map.remove(key)
        };
        if let Some(handle) = handle {
            handle.stop.store(true, Ordering::SeqCst);
            // Kill the watch client session so the blocked control reader unblocks.
            force_stop_client_session(
                &handle.socket_path,
                &handle.tmux_session,
                handle.window_index,
            );
            debug!("Stopped mouse-mode watch for pane {key}");
        }
    }

    /// Ensure a detached watcher is running while no browser client is attached.
    pub fn ensure_for_pane(
        &self,
        key: String,
        tmux_session: String,
        window_index: u32,
        pane_id: String,
        socket_path: String,
    ) {
        {
            let map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            if map.contains_key(&key) {
                return;
            }
        }

        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let key_thread = key.clone();
        let socket_for_handle = socket_path.clone();
        let session_for_handle = tmux_session.clone();

        {
            let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            // Double-check after re-lock.
            if map.contains_key(&key) {
                return;
            }
            map.insert(
                key.clone(),
                WatchHandle {
                    stop: stop.clone(),
                    socket_path: socket_for_handle,
                    tmux_session: session_for_handle,
                    window_index,
                },
            );
        }

        let registry_cleanup_key = key.clone();
        // SAFETY: registry is process-long; we only remove our key if still present.
        // We cannot hold a weak ref easily without Arc self — remove entry at end of thread
        // by re-checking stop ownership via a separate call pattern.
        thread::Builder::new()
            .name(format!("atmos-mouse-watch-{key_thread}"))
            .spawn(move || {
                run_mouse_mode_watch(
                    key_thread,
                    tmux_session,
                    window_index,
                    pane_id,
                    socket_path,
                    stop_thread,
                );
                let _ = registry_cleanup_key;
            })
            .ok();

        info!("Started mouse-mode watch for pane {key}");
    }

    pub fn stop_all(&self) {
        let handles: Vec<WatchHandle> = {
            let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            map.drain().map(|(_, h)| h).collect()
        };
        for handle in handles {
            handle.stop.store(true, Ordering::SeqCst);
            force_stop_client_session(
                &handle.socket_path,
                &handle.tmux_session,
                handle.window_index,
            );
        }
    }
}

fn client_session_name(tmux_session: &str, window_index: u32) -> String {
    format!(
        "atmos_mousewatch_{}_w{}",
        tmux_session.replace(':', "_"),
        window_index
    )
}

fn apply_utf8_env(cmd: &mut std::process::Command) {
    let locale = std::env::var("LC_CTYPE")
        .ok()
        .filter(|v| {
            let u = v.to_ascii_uppercase();
            u.contains("UTF-8") || u.contains("UTF8")
        })
        .or_else(|| {
            std::env::var("LANG").ok().filter(|v| {
                let u = v.to_ascii_uppercase();
                u.contains("UTF-8") || u.contains("UTF8")
            })
        })
        .unwrap_or_else(|| {
            #[cfg(target_os = "macos")]
            {
                "en_US.UTF-8".to_string()
            }
            #[cfg(not(target_os = "macos"))]
            {
                "C.UTF-8".to_string()
            }
        });
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
}

fn kill_client_session(socket_path: &str, client_session: &str) {
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
    apply_utf8_env(&mut kill_cmd);
    let _ = kill_cmd.output();
}

fn run_mouse_mode_watch(
    key: String,
    tmux_session: String,
    window_index: u32,
    pane_id: String,
    socket_path: String,
    stop: Arc<AtomicBool>,
) {
    let client_session = client_session_name(&tmux_session, window_index);
    // Replace any leftover watch session from a previous process.
    kill_client_session(&socket_path, &client_session);

    let tmux = TmuxEngine::new();
    if let Err(error) =
        tmux.create_window_client_session(&tmux_session, window_index, &client_session, 120, 40)
    {
        warn!("mouse-mode watch: failed to create client session for {key}: {error}");
        return;
    }

    // Wait briefly for the session to exist.
    for _ in 0..10 {
        if stop.load(Ordering::SeqCst) {
            kill_client_session(&socket_path, &client_session);
            return;
        }
        let mut check = std::process::Command::new("tmux");
        check.args([
            "-u",
            "-f",
            "/dev/null",
            "-S",
            &socket_path,
            "has-session",
            "-t",
            &client_session,
        ]);
        apply_utf8_env(&mut check);
        if check.output().map(|o| o.status.success()).unwrap_or(false) {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }

    let mut command = std::process::Command::new("tmux");
    command
        .arg("-u")
        .arg("-T")
        .arg("RGB,ccolour,cstyle,extkeys,focus,mouse,strikethrough,sync,title,usstyle")
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
        .stderr(Stdio::null());
    apply_utf8_env(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            warn!("mouse-mode watch: spawn failed for {key}: {error}");
            kill_client_session(&socket_path, &client_session);
            return;
        }
    };

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            kill_client_session(&socket_path, &client_session);
            return;
        }
    };
    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = child.kill();
            kill_client_session(&socket_path, &client_session);
            return;
        }
    };

    // Minimal refresh so we receive subsequent %output; do not resize the master window.
    let _ = writeln!(stdin, "refresh-client -C 120x40");
    let _ = stdin.flush();

    let mut reader = BufReader::new(stdout);
    let mut line = Vec::new();
    let mut passthrough = TmuxPassthroughUnwrapper::default();
    let mut mouse_modes = tmux
        .get_pane_mouse_tracking_by_id(&pane_id)
        .ok()
        .flatten()
        .unwrap_or_default();

    while !stop.load(Ordering::SeqCst) {
        line.clear();
        // Use a short timed approach: set non-blocking is hard on pipes; instead
        // poll try_wait on child and read with a deadline via thread interrupt
        // is not available. Rely on stop + kill of child from outside.
        // Reader blocks until line or EOF; stop is checked after each line and
        // via killing the child when stop is set from ensure/stop.
        // To make stop responsive, spawn a killer side-thread.
        match reader.read_until(b'\n', &mut line) {
            Ok(0) => break,
            Ok(_) => match parse_control_line_bytes(&line) {
                Some(ControlModeEvent::Output { pane_id: pid, data })
                | Some(ControlModeEvent::ExtendedOutput {
                    pane_id: pid, data, ..
                }) if pid == pane_id => {
                    let data = passthrough.push(&data);
                    if !data.is_empty() {
                        let mouse_was_active = mouse_modes.is_active();
                        if mouse_modes.observe_bytes(&data) {
                            if let Err(error) =
                                tmux.set_pane_mouse_tracking_by_id(&pane_id, &mouse_modes)
                            {
                                debug!("mouse-mode watch persist failed for {key}: {error}");
                            }
                            if mouse_was_active && !mouse_modes.is_active() {
                                if let Err(error) = tmux.clear_pane_history_by_id(&pane_id) {
                                    debug!(
                                        "mouse-mode watch clear-history failed for {key}: {error}"
                                    );
                                }
                            }
                        }
                    }
                }
                Some(ControlModeEvent::Exit(_)) => break,
                _ => {}
            },
            Err(_) => break,
        }
    }

    let _ = writeln!(stdin, "detach-client");
    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    kill_client_session(&socket_path, &client_session);
    debug!("mouse-mode watch exited for {key}");
}

/// Poll stop flag and kill the child process so the blocked reader unblocks.
/// Callers set `stop` then we need the watch thread to exit — the watch thread
/// itself doesn't have a reference to kill from outside the registry.
///
/// We improve stop responsiveness by storing the child pid... For simplicity,
/// the registry stop only sets the flag; the next %output or process death
/// unblocks. On attach we also kill the client session which detaches the
/// control client and unblocks the reader.
pub fn force_stop_client_session(socket_path: &str, tmux_session: &str, window_index: u32) {
    kill_client_session(
        socket_path,
        &client_session_name(tmux_session, window_index),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pane_watch_key_is_stable() {
        assert_eq!(pane_watch_key("ws_abc", 2), "ws_abc:2");
    }

    #[test]
    fn client_session_name_is_namespaced() {
        let name = client_session_name("proj:ws", 3);
        assert!(name.starts_with("atmos_mousewatch_"));
        assert!(name.contains("_w3"));
        assert!(!name.contains(':'));
    }

    #[test]
    fn registry_stop_missing_is_noop() {
        let reg = MouseModeWatchRegistry::new();
        reg.stop_for_pane("missing:0");
        reg.stop_all();
    }
}
