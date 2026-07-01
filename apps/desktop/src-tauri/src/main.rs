mod appshot;
mod commands;
mod logging;
mod preview_bridge;
mod runtime;
mod state;
mod tunnel_connector;
mod updater;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{IconMenuItem, MenuBuilder, NativeIcon, SubmenuBuilder};
use tauri::utils::config::Color;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size};
use tokio::time::sleep;

use state::{AppState, PersistedWindowState};

const WINDOW_STATE_FILE: &str = "window-state.json";
const STARTUP_BACKGROUND_COLOR: Color = Color(6, 7, 11, 255);
const STARTUP_ERROR_HTML: &str = include_str!("../../../web/public/startup-error.html");

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
            let tunnel_connector_state_path = dirs::home_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join(".atmos")
                .join("tunnel-connector")
                .join("state.json");
            app.manage(AppState {
                api_port: Mutex::new(None),
                desktop_log_level: logging::compiled_log_level(),
                preview_bridge: Mutex::new(Default::default()),
                window_state_path,
                startup_failed: AtomicBool::new(false),
                main_hidden_by_close: AtomicBool::new(false),
                tunnel_connector_manager: tunnel_connector::manager::TunnelConnectorManager::new(
                    tunnel_connector_state_path,
                ),
            });
            appshot::start_trigger_listener(app.handle().clone());

            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_background_color(Some(STARTUP_BACKGROUND_COLOR));
                let _ = restore_main_window_state(app.handle(), &main);
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
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
                    if let Some(main) = app_handle.get_webview_window("main") {
                        let app_version = app_handle.package_info().version.to_string();
                        let url = format!("http://127.0.0.1:{p}?desktop_app_version={app_version}");
                        match url.parse() {
                            Ok(url) => {
                                let _ = main.navigate(url);
                                let _ = main.show();
                                let _ = main.set_focus();
                                let state = app_handle.state::<AppState>();
                                state.main_hidden_by_close.store(false, Ordering::SeqCst);
                            }
                            Err(err) => {
                                let log_path = logging::app_log_path(&app_handle, "desktop.log");
                                logging::append_log(
                                    &log_path,
                                    &format!("failed to parse desktop runtime URL: {err}"),
                                );
                            }
                        }
                    }

                    let recover_handle = app_handle.clone();
                    let target_base_url = format!("http://127.0.0.1:{p}");
                    tauri::async_runtime::spawn(async move {
                        tunnel_connector::startup_recover(recover_handle, target_base_url).await;
                    });
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
                    preview_bridge::hide_all_preview_windows(&window.app_handle());
                    api.prevent_close();
                    state.main_hidden_by_close.store(true, Ordering::SeqCst);
                    log_desktop_event(
                        &window.app_handle(),
                        "main close requested: hiding main window",
                    );
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
                        preview_bridge::hide_all_preview_windows(&window.app_handle());
                        let _ = window.hide();
                    }
                }
            }
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Destroyed => {
                        if matches!(event, tauri::WindowEvent::Destroyed) {
                            let _ = preview_bridge::close_all_preview_windows(&window.app_handle());
                        }
                        persist_main_window_state(window)
                    }
                    tauri::WindowEvent::Resized(_) => {
                        persist_main_window_state(window);
                    }
                    _ => {}
                }
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                emit_standalone_surface_closed(window);
            }
            let _ = window; // suppress unused warning on non-macOS
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_config,
            commands::get_local_computer_display_name,
            commands::clear_client_session_cmd,
            commands::get_version_info,
            commands::open_agent_chat_window,
            commands::write_agent_chat_handoff,
            commands::read_agent_chat_handoff,
            commands::open_preview_browser_window,
            commands::write_log,
            commands::open_in_external_editor,
            commands::send_notification,
            commands::preview_bridge_open,
            commands::preview_bridge_update_bounds,
            commands::preview_bridge_set_detached,
            commands::preview_bridge_navigate,
            commands::preview_bridge_enter_pick_mode,
            commands::preview_bridge_clear_selection,
            commands::preview_bridge_clear_annotations,
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
            tunnel_connector::commands::tunnel_connector_detect,
            tunnel_connector::commands::tunnel_connector_start,
            tunnel_connector::commands::tunnel_connector_stop,
            tunnel_connector::commands::tunnel_connector_renew,
            tunnel_connector::commands::tunnel_connector_status,
            tunnel_connector::commands::tunnel_connector_recover,
            tunnel_connector::commands::tunnel_connector_provider_guide,
            tunnel_connector::commands::tunnel_connector_save_credential,
            tunnel_connector::commands::tunnel_connector_clear_credential,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        // On quit, also tear down the shared local API daemon. This is an
        // explicit product decision: Desktop owns the runtime lifecycle for
        // end users, so closing the app should not leave a background process
        // listening on the loopback port.
        tauri::RunEvent::Exit => {
            let _ = preview_bridge::close_all_preview_windows(&app_handle);
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
        // macOS: clicking the dock icon should restore the main window when it
        // was hidden by the red close button.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            log_desktop_event(
                &app_handle,
                &format!("run event reopen: has_visible_windows={has_visible_windows}"),
            );
            restore_main_window_after_activation(&app_handle, "reopen");
            let retry_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                sleep(Duration::from_millis(150)).await;
                restore_main_window_after_activation(&retry_handle, "reopen-retry");
            });
            let _ = preview_bridge::show_active_preview_window(&app_handle);
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Resumed => {
            if app_handle
                .state::<AppState>()
                .main_hidden_by_close
                .load(Ordering::SeqCst)
            {
                log_desktop_event(
                    &app_handle,
                    "run event resumed: restoring hidden main window",
                );
                restore_main_window_after_activation(&app_handle, "resumed");
            }
        }
        _ => {}
    });
}

#[cfg(target_os = "macos")]
fn restore_main_window_after_activation(app_handle: &tauri::AppHandle, source: &str) {
    let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
    let Some(window) = app_handle.get_webview_window("main") else {
        log_desktop_event(
            app_handle,
            &format!("{source}: main window unavailable during restore"),
        );
        return;
    };

    let was_visible = window.is_visible().unwrap_or(false);
    let was_minimized = window.is_minimized().unwrap_or(false);
    log_desktop_event(
        app_handle,
        &format!("{source}: restore main window visible={was_visible} minimized={was_minimized}"),
    );

    if !was_visible {
        if let Err(error) = window.show() {
            log_desktop_event(app_handle, &format!("{source}: main show failed: {error}"));
        }
    }
    if was_minimized {
        if let Err(error) = window.unminimize() {
            log_desktop_event(
                app_handle,
                &format!("{source}: main unminimize failed: {error}"),
            );
        }
    }
    if let Err(error) = window.set_focus() {
        log_desktop_event(app_handle, &format!("{source}: main focus failed: {error}"));
    }

    if window.is_visible().unwrap_or(false) {
        app_handle
            .state::<AppState>()
            .main_hidden_by_close
            .store(false, Ordering::SeqCst);
    }
}

fn log_desktop_event(app_handle: &tauri::AppHandle, message: &str) {
    let log_path = logging::app_log_path(app_handle, "desktop.log");
    logging::append_log(&log_path, message);
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

    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_background_color(Some(STARTUP_BACKGROUND_COLOR));
        let startup_error_path = startup_error_page_path(failure);
        let html_json = serde_json::to_string(STARTUP_ERROR_HTML).unwrap_or_else(|_| "\"\"".into());
        let path_json =
            serde_json::to_string(&startup_error_path).unwrap_or_else(|_| "\"/\"".into());
        let script = format!(
            r#"
window.history.replaceState(null, "", {path_json});
document.open();
document.write({html_json});
document.close();
"#,
        );

        if main.eval(&script).is_err() {
            // Fallback to the bundled asset URL for normal dist builds. The eval
            // path above keeps startup errors visible even when dev asset lookup
            // fails before the local runtime is available.
            let target = format!("tauri://localhost{startup_error_path}")
                .parse()
                .ok();

            if let Some(url) = target {
                let _ = main.navigate(url);
            }
        }
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn emit_standalone_surface_closed(window: &tauri::Window) {
    let surface = match window.label() {
        "agent-chat" => "agent-chat",
        "preview-browser" => "preview",
        _ => return,
    };

    let _ = window.app_handle().emit(
        "atmos://standalone-surface-closed",
        serde_json::json!({
            "surface": surface,
            "label": window.label(),
        }),
    );
}
