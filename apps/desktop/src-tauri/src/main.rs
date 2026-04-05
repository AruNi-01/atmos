mod commands;
mod logging;
mod preview_bridge;
mod remote_access;
mod state;

use std::collections::VecDeque;
use std::ffi::CStr;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::Color;
use tauri::{Listener, Manager, PhysicalPosition, PhysicalSize, Position, Size};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Notify;
use tokio::time::{sleep, timeout};

use state::{AppState, PersistedWindowState};

const STARTUP_OUTPUT_BUFFER_LIMIT: usize = 20;
const MIN_SPLASH_DURATION: Duration = Duration::from_secs(3);
const THEME_READY_TIMEOUT: Duration = Duration::from_secs(5);
const WINDOW_STATE_FILE: &str = "window-state.json";
const SPLASH_BACKGROUND_COLOR: Color = Color(6, 7, 11, 255);
struct StartupDiagnostics {
    stdout: VecDeque<String>,
    stderr: VecDeque<String>,
    log_path: PathBuf,
}

struct StartupFailure {
    root_cause: String,
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

    fn startup_error(&self, summary: impl Into<String>) -> StartupFailure {
        let summary = clean_error_text(&summary.into());
        let root_cause = self
            .stderr
            .iter()
            .rev()
            .map(|line| clean_error_text(line))
            .find(|line| is_meaningful_error_line(line))
            .filter(|line| !line.is_empty())
            .unwrap_or(summary);

        StartupFailure {
            root_cause,
            log_path: self.log_path.clone(),
        }
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
            let remote_access_state_path = dirs::home_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join(".atmos")
                .join("remote-access")
                .join("state.json");
            app.manage(AppState {
                api_port: Mutex::new(None),
                api_token: api_token.clone(),
                desktop_log_level: logging::compiled_log_level(),
                sidecar_child: Mutex::new(None),
                preview_bridge: Mutex::new(None),
                window_state_path,
                splash_close_allowed: AtomicBool::new(false),
                startup_failed: AtomicBool::new(false),
                theme_ready: AtomicBool::new(false),
                theme_ready_notify: Notify::new(),
                remote_access_manager: remote_access::manager::RemoteAccessManager::new(
                    remote_access_state_path,
                ),
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
                let _ = restore_main_window_state(app.handle(), &main);
                if !apply_saved_window_state(app.handle(), &splash) {
                    sync_splash_to_main(&main, &splash);
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
                    eprintln!("Failed to start sidecar: {}", err.root_cause);
                    show_startup_error(&app_handle, &err);
                    return;
                }

                let port = {
                    let state = app_handle.state::<AppState>();
                    let x = *state.api_port.lock().unwrap();
                    x
                };

                // Asynchronously restore any tunnel providers that were running
                // when the app was last closed, now that the sidecar API is ready.
                if let Some(p) = port {
                    let recover_handle = app_handle.clone();
                    let target_base_url = format!("http://127.0.0.1:{p}");
                    tauri::async_runtime::spawn(async move {
                        remote_access::startup_recover(recover_handle, target_base_url).await;
                    });
                }

                if let Some(main) = app_handle.get_webview_window("main") {
                    if let Some(p) = port {
                        if has_static {
                            {
                                let state = app_handle.state::<AppState>();
                                state.theme_ready.store(false, Ordering::SeqCst);
                            }
                            let app_version = app_handle.package_info().version.to_string();
                            let url = format!(
                                "http://127.0.0.1:{}?desktop_app_version={}",
                                p, app_version
                            );
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
                    let notified = state.theme_ready_notify.notified();
                    if !state.theme_ready.load(Ordering::SeqCst) {
                        let _ = timeout(THEME_READY_TIMEOUT, notified).await;
                    }
                }

                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                    sleep(Duration::from_millis(16)).await;
                }
                if let Some(splash) = app_handle.get_webview_window("splashscreen") {
                    let state = app_handle.state::<AppState>();
                    state.splash_close_allowed.store(true, Ordering::SeqCst);
                    let _ = splash.close();
                }
            });

            // ── macOS application menu ────────────────────────────────────
            // A proper Edit submenu is required on macOS so that the AppKit
            // responder chain correctly forwards keyboard events (including
            // IME composition) to the WKWebView.  Without it, Chinese IME
            // Shift+key combos (for punctuation like ！？（）) need a double
            // press because the first keydown is swallowed by the system.
            #[cfg(target_os = "macos")]
            {
                let app_menu = SubmenuBuilder::new(app, "Atmos")
                    .about(None)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .close_window()
                    .build()?;

                let navigation_menu = SubmenuBuilder::new(app, "Navigation")
                    .item(&MenuItem::with_id(
                        app,
                        "back",
                        "Back",
                        true,
                        Some("Command+["),
                    )?)
                    .item(&MenuItem::with_id(
                        app,
                        "forward",
                        "Forward",
                        true,
                        Some("Command+]"),
                    )?)
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu, &navigation_menu])
                    .build()?;
                app.set_menu(menu)?;
            }

            let quit_item = MenuItem::with_id(app, "quit", "Quit Atmos", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Atmos", true, None::<&str>)?;

            // Handle navigation menu events
            app.on_menu_event(move |app_handle, event| match event.id.as_ref() {
                "back" => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.eval("window.history.back()");
                    }
                }
                "forward" => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.eval("window.history.forward()");
                    }
                }
                _ => {}
            });
            let tray_menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;
            TrayIconBuilder::new()
                .menu(&tray_menu)
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
                    let state = window.app_handle().state::<AppState>();
                    if state.startup_failed.load(Ordering::SeqCst) {
                        window.app_handle().exit(1);
                        return;
                    }
                    preview_bridge::hide_preview_window(&window.app_handle());
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
                        preview_bridge::hide_preview_window(&window.app_handle());
                        let _ = window.hide();
                    }
                } else if window.label() == "splashscreen" {
                    let state = window.app_handle().state::<AppState>();
                    if !state.splash_close_allowed.load(Ordering::SeqCst) {
                        api.prevent_close();
                    }
                }
            }
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Destroyed => {
                        if matches!(event, tauri::WindowEvent::Destroyed) {
                            let _ = preview_bridge::close_preview_window(&window.app_handle());
                        }
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
            commands::preview_bridge_open,
            commands::preview_bridge_update_bounds,
            commands::preview_bridge_navigate,
            commands::preview_bridge_enter_pick_mode,
            commands::preview_bridge_clear_selection,
            commands::preview_bridge_close,
            commands::preview_bridge_show,
            commands::preview_bridge_hide,
            commands::preview_bridge_event,
            commands::preview_bridge_probe_url,
            remote_access::commands::remote_access_detect,
            remote_access::commands::remote_access_start,
            remote_access::commands::remote_access_stop,
            remote_access::commands::remote_access_renew,
            remote_access::commands::remote_access_status,
            remote_access::commands::remote_access_recover,
            remote_access::commands::remote_access_provider_guide,
            remote_access::commands::remote_access_save_credential,
            remote_access::commands::remote_access_clear_credential,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        // Sidecar cleanup on ALL exit paths:
        // tray "Quit", Cmd+Q, dock "Quit", system shutdown, etc.
        tauri::RunEvent::Exit => {
            let _ = preview_bridge::close_preview_window(&app_handle);
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
) -> Result<(), StartupFailure> {
    let sidecar_log_path = logging::app_log_path(app_handle, "sidecar-api.log");
    let mut diagnostics = StartupDiagnostics::new(sidecar_log_path.clone());

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos-desktop"));
    let data_dir_str = data_dir
        .to_str()
        .ok_or_else(|| StartupFailure {
            root_cause: "Invalid app data directory".to_string(),
            log_path: sidecar_log_path.clone(),
        })?
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
        .map_err(|e| StartupFailure {
            root_cause: clean_error_text(&e.to_string()),
            log_path: sidecar_log_path.clone(),
        })?
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

    let (mut rx, child) = sidecar_cmd.spawn().map_err(|e| StartupFailure {
        root_cause: clean_error_text(&e.to_string()),
        log_path: sidecar_log_path.clone(),
    })?;

    {
        let app_state = app_handle.state::<AppState>();
        let mut guard = app_state.sidecar_child.lock().map_err(|_| StartupFailure {
            root_cause: "State lock poisoned".to_string(),
            log_path: sidecar_log_path.clone(),
        })?;
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
                            let mut guard =
                                app_state.api_port.lock().map_err(|_| StartupFailure {
                                    root_cause: "State lock poisoned".to_string(),
                                    log_path: sidecar_log_path.clone(),
                                })?;
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
    let cleaned = strip_ansi_sequences(&line);
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn strip_ansi_sequences(value: &str) -> String {
    let mut cleaned = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                let _ = chars.next();
                while let Some(next) = chars.next() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
                continue;
            }
        }

        cleaned.push(ch);
    }

    cleaned
}

fn clean_error_text(value: &str) -> String {
    let mut text = strip_ansi_sequences(value).trim().to_string();

    if let Some(rest) = text.strip_prefix("Error:") {
        text = rest.trim().to_string();
    }

    if text.starts_with('"') && text.ends_with('"') && text.len() > 1 {
        text = text[1..text.len() - 1].to_string();
    }

    text
}

fn is_meaningful_error_line(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && !trimmed.starts_with("API sidecar terminated early")
        && !trimmed.starts_with("API sidecar process error:")
        && !trimmed.starts_with("TERMINATED code=")
}

fn percent_encode_for_url_component(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());

    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => {
                encoded.push('%');
                encoded.push(HEX[(byte >> 4) as usize] as char);
                encoded.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }

    encoded
}

fn startup_error_page_path(failure: &StartupFailure) -> String {
    let root_cause = percent_encode_for_url_component(&failure.root_cause);
    let log_path = percent_encode_for_url_component(&failure.log_path.display().to_string());
    format!("/startup-error.html?rootCause={root_cause}&logPath={log_path}")
}

fn show_startup_error(app_handle: &tauri::AppHandle, failure: &StartupFailure) {
    let state = app_handle.state::<AppState>();
    state.startup_failed.store(true, Ordering::SeqCst);
    state.splash_close_allowed.store(true, Ordering::SeqCst);

    if let Some(splash) = app_handle.get_webview_window("splashscreen") {
        let _ = splash.close();
    }

    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_background_color(Some(SPLASH_BACKGROUND_COLOR));
        let target = main
            .url()
            .ok()
            .and_then(|current| current.join(&startup_error_page_path(failure)).ok())
            .or_else(|| "tauri://localhost/startup-error.html".parse().ok());

        if let Some(url) = target {
            let _ = main.navigate(url);
        }
        let _ = main.show();
        let _ = main.set_focus();
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
