use crate::logging;
use crate::state::AppState;
use objc2::MainThreadMarker;
use objc2_app_kit::NSApplication;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::time::Duration;
use tauri::Manager;

const MAIN_THREAD_RESTORE_TIMEOUT: Duration = Duration::from_secs(2);

pub(crate) fn restore_main_window_after_activation(app_handle: &tauri::AppHandle, source: &str) {
    if MainThreadMarker::new().is_some() {
        restore_main_window_after_activation_on_main_thread(app_handle, source);
        return;
    }

    let (tx, rx) = mpsc::channel();
    let handle_for_task = app_handle.clone();
    let source_for_task = source.to_string();
    let source_for_error = source_for_task.clone();
    if let Err(error) = app_handle.run_on_main_thread(move || {
        restore_main_window_after_activation_on_main_thread(&handle_for_task, &source_for_task);
        let _ = tx.send(());
    }) {
        log_desktop_event(
            app_handle,
            &format!("{source_for_error}: scheduling main window restore failed: {error}"),
        );
        return;
    }

    if rx.recv_timeout(MAIN_THREAD_RESTORE_TIMEOUT).is_err() {
        log_desktop_event(
            app_handle,
            &format!("{source_for_error}: main window restore did not finish before timeout"),
        );
    }
}

fn restore_main_window_after_activation_on_main_thread(
    app_handle: &tauri::AppHandle,
    source: &str,
) {
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

    activate_current_app();

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

fn activate_current_app() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    #[allow(deprecated)]
    app.activateIgnoringOtherApps(true);
}

fn log_desktop_event(app_handle: &tauri::AppHandle, message: &str) {
    let log_path = logging::app_log_path(app_handle, "desktop.log");
    logging::append_log(&log_path, message);
}
