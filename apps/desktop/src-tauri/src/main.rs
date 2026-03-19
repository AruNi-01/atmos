mod commands;
mod logging;
mod state;

use std::collections::VecDeque;
use std::ffi::CStr;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Listener, Manager, PhysicalPosition, PhysicalSize, Position, Size};
use tauri::utils::config::Color;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Notify;
use tokio::time::{sleep, timeout};

use state::{AppState, PersistedWindowState};

const STARTUP_OUTPUT_BUFFER_LIMIT: usize = 20;
const MIN_SPLASH_DURATION: Duration = Duration::from_secs(3);
const THEME_READY_TIMEOUT: Duration = Duration::from_secs(5);
const WINDOW_STATE_FILE: &str = "window-state.json";
const SPLASH_BACKGROUND_COLOR: Color = Color(6, 7, 11, 255);
#[cfg(target_os = "macos")]
struct StartupDiagnostics {
    stdout: VecDeque<String>,
    stderr: VecDeque<String>,
    log_path: PathBuf,
}

impl StartupDiagnostics {
    fn new(log_path: PathBuf) -> Self {
        Self {
            stdout: VecDeque::with_capacity(STARTUP_OUTPUT_BUFFER_LIMIT),
            stderr: VecDeque::with_capacity(STARTUP_OUTPUT_BUFFER_LIMIT),
            log_path,
        }
    }

    fn record_stdout(&mut self, line: &str) {
        push_bounded_line(&mut self.stdout, line);
        logging::append_log(&self.log_path, &format!("stdout: {line}"));
    }

    fn record_stderr(&mut self, line: &str) {
        push_bounded_line(&mut self.stderr, line);
        logging::append_log(&self.log_path, &format!("stderr: {line}"));
    }

    fn record_internal(&mut self, line: &str) {
        push_bounded_line(&mut self.stderr, line);
        logging::append_log(&self.log_path, line);
    }

    fn startup_error(&self, summary: impl Into<String>) -> String {
        let mut message = summary.into();

        if !self.stderr.is_empty() {
            message.push_str("\n\nRecent stderr:\n");
            message.push_str(&self.stderr.iter().cloned().collect::<Vec<_>>().join("\n"));
        }

        if !self.stdout.is_empty() {
            message.push_str("\n\nRecent stdout:\n");
            message.push_str(&self.stdout.iter().cloned().collect::<Vec<_>>().join("\n"));
        }

        message.push_str(&format!("\n\nLog file: {}", self.log_path.display()));
        message
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let api_token = uuid::Uuid::new_v4().to_string();
            let window_state_path = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| {
                    dirs::home_dir()
                        .unwrap_or_else(std::env::temp_dir)
                        .join(".atmos")
                        .join("desktop")
                })
                .join(WINDOW_STATE_FILE);
            app.manage(AppState {
                api_port: Mutex::new(None),
                api_token: api_token.clone(),
                desktop_log_level: logging::compiled_log_level(),
                sidecar_child: Mutex::new(None),
                window_state_path,
                theme_ready: AtomicBool::new(false),
                theme_ready_notify: Notify::new(),
            });

            let app_handle = app.handle().clone();
            app.listen("frontend://theme-ready", move |_| {
                let state = app_handle.state::<AppState>();
                state.theme_ready.store(true, Ordering::SeqCst);
                state.theme_ready_notify.notify_waiters();
            });

            if let (Some(main), Some(splash)) = (
                app.get_webview_window("main"),
                app.get_webview_window("splashscreen"),
            ) {
                let _ = main.set_background_color(Some(SPLASH_BACKGROUND_COLOR));
                let _ = splash.set_background_color(Some(SPLASH_BACKGROUND_COLOR));
                let restored = restore_main_window_state(app.handle(), &main);
                if !apply_saved_window_state(app.handle(), &splash) {
                    if restored {
                        sync_splash_to_main(&main, &splash);
                    } else {
                        sync_splash_to_main(&main, &splash);
                    }
                }
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let startup_started_at = Instant::now();
                let static_dir = app_handle
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|d| d.join("web-out"))
                    .filter(|p| p.join("index.html").is_file());
                let has_static = static_dir.is_some();

                if let Err(err) = spawn_and_wait_sidecar(&app_handle, api_token, static_dir).await {
                    eprintln!("Failed to start sidecar: {err}");

                    // Close splashscreen so it doesn't linger behind the dialog
                    if let Some(splash) = app_handle.get_webview_window("splashscreen") {
                        let _ = splash.close();
                    }

                    let handle = app_handle.clone();
                    app_handle
                        .dialog()
                        .message(format!(
                            "Atmos backend failed to start:\n\n{}\n\nThe app will now exit.",
                            err
                        ))
                        .title("Atmos Startup Error")
                        .kind(MessageDialogKind::Error)
                        .show(move |_| {
                            handle.exit(1);
                        });
                    return;
                }

                let port = {
                    let state = app_handle.state::<AppState>();
                    let x = *state.api_port.lock().unwrap();
                    x
                };

                if let Some(main) = app_handle.get_webview_window("main") {
                    if let Some(p) = port {
                        if has_static {
                            {
                                let state = app_handle.state::<AppState>();
                                state.theme_ready.store(false, Ordering::SeqCst);
                            }
                            let url = format!("http://127.0.0.1:{}", p);
                            let _ = main.navigate(url.parse().expect("valid url"));
                        }
                    }
                }

                let elapsed = startup_started_at.elapsed();
                if elapsed < MIN_SPLASH_DURATION {
                    sleep(MIN_SPLASH_DURATION - elapsed).await;
                }

                {
                    let state = app_handle.state::<AppState>();
                    if !state.theme_ready.load(Ordering::SeqCst) {
                        let _ =
                            timeout(THEME_READY_TIMEOUT, state.theme_ready_notify.notified()).await;
                    }
                }

                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                    sleep(Duration::from_millis(16)).await;
                }
                if let Some(splash) = app_handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
            });

            let quit_item = MenuItem::with_id(app, "quit", "Quit Atmos", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Atmos", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;
            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // macOS: close button hides the window instead of quitting.
            // The app stays in the dock; user can re-show via tray icon or dock click.
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    if window.is_fullscreen().unwrap_or(false) {
                        let handle = window.clone();
                        let _ = window.set_fullscreen(false);
                        tauri::async_runtime::spawn(async move {
                            for _ in 0..15 {
                                sleep(Duration::from_millis(100)).await;
                                if !handle.is_fullscreen().unwrap_or(false) {
                                    persist_main_window_state(&handle);
                                    let _ = handle.hide();
                                    return;
                                }
                            }
                            // Fallback: if macOS takes unusually long to transition out of fullscreen,
                            // still hide once the transition window has passed.
                            let _ = handle.set_fullscreen(false);
                            sleep(Duration::from_millis(200)).await;
                            persist_main_window_state(&handle);
                            let _ = handle.hide();
                        });
                    } else {
                        persist_main_window_state(window);
                        let _ = window.hide();
                    }
                }
            }
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Destroyed => {
                        persist_main_window_state(window)
                    }
                    tauri::WindowEvent::Resized(_) => {
                        persist_main_window_state(window);
                    }
                    _ => {}
                }
            }
            let _ = window; // suppress unused warning on non-macOS
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_config,
            commands::write_log,
            commands::open_in_external_editor,
            commands::send_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        // Sidecar cleanup on ALL exit paths:
        // tray "Quit", Cmd+Q, dock "Quit", system shutdown, etc.
        tauri::RunEvent::Exit => {
            let child = {
                let state = app_handle.state::<AppState>();
                state.sidecar_child.lock().ok().and_then(|mut g| g.take())
            };
            if let Some(child) = child {
                let _ = child.kill();
            }
        }
        // macOS: clicking the dock icon when the window is hidden should re-show it.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
        _ => {}
    });
}

fn restore_main_window_state<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> bool {
    apply_saved_window_state(app_handle, window)
}

fn apply_saved_window_state<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> bool {
    let window_state_path = window_state_path(app_handle);
    let Some(state) = load_window_state(&window_state_path) else {
        return false;
    };

    let _ = window.set_size(Size::Physical(PhysicalSize::new(state.width, state.height)));
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(state.x, state.y)));

    if state.maximized {
        let _ = window.maximize();
    }

    true
}

fn sync_splash_to_main<R: tauri::Runtime>(
    main: &tauri::WebviewWindow<R>,
    splash: &tauri::WebviewWindow<R>,
) {
    if let Ok(size) = main.outer_size() {
        let _ = splash.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
    }

    if let Ok(position) = main.outer_position() {
        let _ = splash.set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )));
    } else {
        let _ = splash.center();
    }
}

fn persist_main_window_state<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let path = window_state_path(&window.app_handle());
    let maximized = window.is_maximized().unwrap_or(false);
    let existing = load_window_state(&path);

    let next_state = if maximized {
        existing
            .map(|state| PersistedWindowState {
                maximized: true,
                ..state
            })
            .or_else(|| capture_window_state(window, true))
    } else {
        capture_window_state(window, false)
    };

    if let Some(state) = next_state {
        save_window_state(&path, &state);
    }
}

fn capture_window_state<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    maximized: bool,
) -> Option<PersistedWindowState> {
    let size = window.outer_size().ok()?;
    let position = window.outer_position().ok()?;

    Some(PersistedWindowState {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized,
    })
}

fn load_window_state(path: &PathBuf) -> Option<PersistedWindowState> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_window_state(path: &PathBuf, state: &PersistedWindowState) {
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let Ok(raw) = serde_json::to_string(state) else {
        return;
    };
    let _ = fs::write(path, raw);
}

fn window_state_path<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> PathBuf {
    app_handle.state::<AppState>().window_state_path.clone()
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

#[cfg(unix)]
fn detect_login_shell_from_system() -> Option<String> {
    let uid = unsafe { libc::geteuid() };
    let mut pwd = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut result = std::ptr::null_mut();
    let mut buf = vec![0u8; 4096];

    loop {
        let rc = unsafe {
            libc::getpwuid_r(
                uid,
                pwd.as_mut_ptr(),
                buf.as_mut_ptr().cast(),
                buf.len(),
                &mut result,
            )
        };

        if rc == 0 {
            if result.is_null() {
                return None;
            }

            let pwd = unsafe { pwd.assume_init() };
            if pwd.pw_shell.is_null() {
                return None;
            }

            let shell = unsafe { CStr::from_ptr(pwd.pw_shell) }
                .to_string_lossy()
                .trim()
                .to_string();

            return (!shell.is_empty()).then_some(shell);
        }

        if rc == libc::ERANGE {
            buf.resize(buf.len() * 2, 0);
            continue;
        }

        return None;
    }
}

#[cfg(not(unix))]
fn detect_login_shell_from_system() -> Option<String> {
    None
}

fn resolve_shell_for_sidecar() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(detect_login_shell_from_system)
        .unwrap_or_else(|| {
            #[cfg(target_os = "macos")]
            {
                for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
                    if std::path::Path::new(candidate).exists() {
                        return candidate.to_string();
                    }
                }
            }

            "/bin/sh".to_string()
        })
}

async fn spawn_and_wait_sidecar(
    app_handle: &tauri::AppHandle,
    api_token: String,
    static_dir: Option<PathBuf>,
) -> Result<(), String> {
    let sidecar_log_path = logging::app_log_path(app_handle, "sidecar-api.log");
    let mut diagnostics = StartupDiagnostics::new(sidecar_log_path.clone());

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos-desktop"));
    let data_dir_str = data_dir
        .to_str()
        .ok_or_else(|| "invalid data dir".to_string())?
        .to_string();

    let port = std::env::var("ATMOS_PORT").unwrap_or_else(|_| "30303".into());

    // macOS .app bundles launched from Finder don't inherit the shell's PATH.
    // Homebrew installs (tmux, git, etc.) live in /opt/homebrew/bin (Apple Silicon)
    // or /usr/local/bin (Intel). Augment PATH so the sidecar can find them.
    let path = {
        let current = std::env::var("PATH").unwrap_or_default();
        let extra = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];
        let mut parts: Vec<&str> = extra.to_vec();
        for p in current.split(':') {
            if !parts.contains(&p) {
                parts.push(p);
            }
        }
        parts.join(":")
    };
    // Finder-launched apps may miss LANG/LC_CTYPE; force UTF-8 so tmux/shell
    // keep Nerd Font glyphs instead of ASCII fallbacks.
    let utf8_locale = resolve_utf8_locale();
    // Finder-launched apps may also miss SHELL; recover the user's login shell
    // from the account record before falling back to a generic shell.
    let shell = resolve_shell_for_sidecar();

    let mut sidecar_cmd = app_handle
        .shell()
        .sidecar("api")
        .map_err(|e| e.to_string())?
        .env("PATH", &path)
        .env("ATMOS_PORT", &port)
        .env("ATMOS_LOCAL_TOKEN", &api_token)
        .env("LANG", &utf8_locale)
        .env("LC_CTYPE", &utf8_locale)
        .env("SHELL", &shell)
        .env("ATMOS_DATA_DIR", data_dir_str);

    if let Some(dir) = static_dir {
        if let Some(dir_str) = dir.to_str() {
            sidecar_cmd = sidecar_cmd.env("ATMOS_STATIC_DIR", dir_str);
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled_skills_dir = resource_dir.join("system-skills");
        if bundled_skills_dir.is_dir() {
            if let Some(dir_str) = bundled_skills_dir.to_str() {
                sidecar_cmd = sidecar_cmd.env("ATMOS_SYSTEM_SKILLS_DIR", dir_str);
            }
        }
    }

    let (mut rx, child) = sidecar_cmd.spawn().map_err(|e| e.to_string())?;

    {
        let app_state = app_handle.state::<AppState>();
        let mut guard = app_state
            .sidecar_child
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        *guard = Some(child);
    }

    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        let now = tokio::time::Instant::now();
        if now >= deadline {
            terminate_sidecar(app_handle);
            return Err(diagnostics.startup_error("API startup timeout (no ready signal received)"));
        }

        let remaining = deadline - now;
        let event = tokio::time::timeout(remaining, rx.recv())
            .await
            .map_err(|_| {
                terminate_sidecar(app_handle);
                diagnostics.startup_error("API startup timeout while waiting for sidecar output")
            })?;

        let Some(event) = event else {
            terminate_sidecar(app_handle);
            return Err(diagnostics.startup_error("API sidecar exited before ready signal"));
        };

        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                if let Some(text) = normalized_output(&line) {
                    eprintln!("[sidecar stdout] {}", text);
                    diagnostics.record_stdout(&text);
                    if let Some(port) = parse_ready_port(&text) {
                        {
                            let app_state = app_handle.state::<AppState>();
                            let mut guard = app_state
                                .api_port
                                .lock()
                                .map_err(|_| "state lock poisoned".to_string())?;
                            *guard = Some(port);
                        }
                        wait_for_api(port).await.map_err(|error| {
                            terminate_sidecar(app_handle);
                            diagnostics.startup_error(error)
                        })?;
                        logging::append_log(
                            &sidecar_log_path,
                            &format!("healthz OK port={port}, continuing to monitor"),
                        );
                        tokio::spawn(async move {
                            while let Some(ev) = rx.recv().await {
                                match ev {
                                    tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                        if let Some(text) = normalized_output(&line) {
                                            eprintln!("[sidecar stdout] {}", text);
                                            logging::append_log(
                                                &sidecar_log_path,
                                                &format!("stdout: {text}"),
                                            );
                                        }
                                    }
                                    tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                        if let Some(text) = normalized_output(&line) {
                                            eprintln!("[sidecar stderr] {}", text);
                                            logging::append_log(
                                                &sidecar_log_path,
                                                &format!("stderr: {text}"),
                                            );
                                        }
                                    }
                                    tauri_plugin_shell::process::CommandEvent::Error(error) => {
                                        let text = format!("sidecar monitor error: {error}");
                                        eprintln!("[sidecar error] {}", text);
                                        logging::append_log(&sidecar_log_path, &text);
                                    }
                                    tauri_plugin_shell::process::CommandEvent::Terminated(
                                        payload,
                                    ) => {
                                        let msg = format!(
                                            "TERMINATED code={:?} signal={:?}",
                                            payload.code, payload.signal
                                        );
                                        eprintln!("[sidecar] {}", msg);
                                        logging::append_log(&sidecar_log_path, &msg);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
                        return Ok(());
                    }
                }
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                if let Some(text) = normalized_output(&line) {
                    eprintln!("[sidecar stderr] {}", text);
                    diagnostics.record_stderr(&text);
                }
            }
            tauri_plugin_shell::process::CommandEvent::Error(error) => {
                let text = format!("API sidecar process error: {error}");
                eprintln!("[sidecar error] {}", text);
                diagnostics.record_internal(&text);
                terminate_sidecar(app_handle);
                return Err(diagnostics.startup_error(text));
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                let msg = format!(
                    "API sidecar terminated early (exit code: {:?}, signal: {:?})",
                    payload.code, payload.signal
                );
                diagnostics.record_internal(&msg);
                terminate_sidecar(app_handle);
                return Err(diagnostics.startup_error(msg));
            }
            _ => {}
        }
    }
}

fn parse_ready_port(line: &str) -> Option<u16> {
    line.trim()
        .strip_prefix("ATMOS_READY port=")?
        .parse::<u16>()
        .ok()
}

fn push_bounded_line(lines: &mut VecDeque<String>, line: &str) {
    if lines.len() == STARTUP_OUTPUT_BUFFER_LIMIT {
        lines.pop_front();
    }
    lines.push_back(line.to_string());
}

fn normalized_output(raw: &[u8]) -> Option<String> {
    let line = String::from_utf8_lossy(raw);
    let trimmed = line.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn terminate_sidecar(app_handle: &tauri::AppHandle) {
    let child = {
        let state = app_handle.state::<AppState>();
        state
            .sidecar_child
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    };

    if let Some(child) = child {
        let _ = child.kill();
    }
}

async fn wait_for_api(port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}/healthz");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(resp) = reqwest::get(&url).await {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        if tokio::time::Instant::now() > deadline {
            return Err("API health check timeout".to_string());
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}
