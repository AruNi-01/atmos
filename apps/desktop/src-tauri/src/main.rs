mod appshot;
mod commands;
mod logging;
mod preview_bridge;
mod remote_access;
mod runtime;
mod state;
mod updater;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{IconMenuItem, MenuBuilder, NativeIcon, SubmenuBuilder};
use tauri::utils::config::Color;
use tauri::{Listener, Manager, PhysicalPosition, PhysicalSize, Position, Size};
use tokio::sync::Notify;
use tokio::time::{sleep, timeout};

use state::{AppState, PersistedWindowState};

const MIN_SPLASH_DURATION: Duration = Duration::from_secs(3);
const THEME_READY_TIMEOUT: Duration = Duration::from_secs(5);
const WINDOW_STATE_FILE: &str = "window-state.json";
const SPLASH_BACKGROUND_COLOR: Color = Color(6, 7, 11, 255);

struct StartupFailure {
    root_cause: String,
    log_path: PathBuf,
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
                desktop_log_level: logging::compiled_log_level(),
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
            appshot::start_trigger_listener(app.handle().clone());

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

                let port = match runtime::ensure_desktop_runtime(&app_handle).await {
                    Ok(port) => {
                        let state = app_handle.state::<AppState>();
                        *state.api_port.lock().unwrap() = Some(port);
                        Some(port)
                    }
                    Err(err) => {
                        eprintln!("Failed to start local runtime: {}", err.root_cause);
                        show_startup_error(
                            &app_handle,
                            &StartupFailure {
                                root_cause: err.root_cause,
                                log_path: err.log_path,
                            },
                        );
                        return;
                    }
                };

                // Asynchronously restore any tunnel providers that were running
                // when the app was last closed, now that the local API is ready.
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
                // Use a custom Close item (without the default Cmd+W accelerator)
                // so that AppKit does not intercept Cmd+W before the WebView.
                // Cmd+W handling (closing terminal panes, etc.) is done in JS.
                // The red window button still fires CloseRequested → hide window.
                let close_item = IconMenuItem::with_id_and_native_icon(
                    app,
                    "close_window",
                    "Close",
                    true,
                    Some(NativeIcon::StopProgress),
                    None::<&str>,
                )?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .item(&close_item)
                    .build()?;

                // NOTE: Do NOT set accelerators on Back/Forward. On macOS,
                // NSMenu accelerators are consumed by AppKit before the WebView
                // receives the keydown event. If we bind `Command+[` / `Command+]`
                // here, the terminal pane-switch shortcut (handled in
                // `TerminalGrid.tsx`) can never fire on desktop — breaking parity
                // with the web build. Keyboard navigation is therefore handled
                // entirely in JS (see `Header.tsx`); these menu items remain
                // click-only affordances in the menu bar.
                let back_item = IconMenuItem::with_id_and_native_icon(
                    app,
                    "back",
                    "Back",
                    true,
                    Some(NativeIcon::GoLeft),
                    None::<&str>,
                )?;
                let forward_item = IconMenuItem::with_id_and_native_icon(
                    app,
                    "forward",
                    "Forward",
                    true,
                    Some(NativeIcon::GoRight),
                    None::<&str>,
                )?;
                let navigation_menu = SubmenuBuilder::new(app, "Navigation")
                    .item(&back_item)
                    .item(&forward_item)
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu, &navigation_menu])
                    .build()?;
                app.set_menu(menu)?;
            }

            // Handle navigation / window menu events
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
                "close_window" => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.close();
                    }
                }
                _ => {}
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // macOS: close button hides the window instead of quitting.
            // The app stays in the dock; user can re-show via dock click.
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
            commands::get_local_computer_display_name,
            commands::clear_client_session_cmd,
            commands::get_version_info,
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
            commands::appshot_status,
            commands::appshot_accept_pending,
            commands::appshot_discard_pending,
            commands::appshot_set_pending_auto_accept,
            commands::appshot_list_records,
            commands::appshot_read_records,
            commands::appshot_read_snapshot,
            commands::appshot_copy_record,
            commands::appshot_delete_record,
            commands::appshot_trigger_capture,
            commands::appshot_open_permissions,
            commands::appshot_show_permissions_window,
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
        // On quit, also tear down the shared local API daemon. This is an
        // explicit product decision: Desktop owns the runtime lifecycle for
        // end users, so closing the app should not leave a background process
        // listening on the loopback port.
        tauri::RunEvent::Exit => {
            let _ = preview_bridge::close_preview_window(&app_handle);
            match tauri::async_runtime::block_on(runtime_manager::supervisor::stop_running(false)) {
                Ok(stopped) => {
                    let log_path = logging::app_log_path(&app_handle, "runtime-api.log");
                    logging::append_log(
                        &log_path,
                        &format!("runtime stop on exit: stopped={stopped}"),
                    );
                }
                Err(err) => {
                    let log_path = logging::app_log_path(&app_handle, "runtime-api.log");
                    logging::append_log(&log_path, &format!("runtime stop on exit failed: {err}"));
                }
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
