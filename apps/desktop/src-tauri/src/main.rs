mod commands;
mod state;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

use state::AppState;

fn main() {
    let debug_mode = std::env::var("ATMOS_DESKTOP_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let api_token = uuid::Uuid::new_v4().to_string();
            app.manage(AppState {
                api_port: Mutex::new(None),
                api_token: api_token.clone(),
                sidecar_child: Mutex::new(None),
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Resolve the bundled static frontend directory.
                // In a packaged app, the web-out dir is bundled as a resource.
                // In dev mode (devUrl), the sidecar serves no static files —
                // the webview already loads from http://localhost:3030.
                let static_dir = app_handle
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|d| d.join("web-out"))
                    .filter(|p| p.join("index.html").is_file());
                let has_static = static_dir.is_some();

                if let Err(err) = spawn_and_wait_sidecar(&app_handle, api_token, static_dir).await {
                    eprintln!("Failed to start sidecar: {err}");
                    if debug_mode {
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                            let escaped = err.replace('\\', "\\\\").replace('\'', "\\'");
                            let _ = main.eval(&format!(
                                "window.alert('Atmos sidecar startup failed:\\n{}');",
                                escaped
                            ));
                        }
                    } else {
                        app_handle.exit(1);
                    }
                    return;
                }

                // Navigate main window to the sidecar HTTP server so that
                // fetch/WebSocket from the webview go to the same HTTP origin,
                // avoiding macOS WKWebView mixed-content blocking.
                // Only applies when bundled static files are available (production build).
                // In dev mode, the webview already loads from http://localhost:3000.
                let port = {
                    let state = app_handle.state::<AppState>();
                    let x = *state.api_port.lock().unwrap();
                    x
                };
                if let Some(splash) = app_handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
                if let Some(main) = app_handle.get_webview_window("main") {
                    if let Some(p) = port {
                        if has_static {
                            // Production: load frontend from the sidecar HTTP server.
                            let url = format!("http://127.0.0.1:{}", p);
                            let _ = main.navigate(url.parse().expect("valid url"));
                        }
                    }
                    let _ = main.show();
                    let _ = main.set_focus();
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
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Only kill the sidecar when the main window closes, not the splashscreen.
                if window.label() != "main" {
                    return;
                }
                let state = window.state::<AppState>();
                let child = match state.sidecar_child.lock() {
                    Ok(mut guard) => guard.take(),
                    Err(_) => None,
                };
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_config,
            commands::write_debug_log,
            commands::open_in_external_editor,
            commands::send_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn spawn_and_wait_sidecar(
    app_handle: &tauri::AppHandle,
    api_token: String,
    static_dir: Option<PathBuf>,
) -> Result<(), String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos-desktop"));
    let data_dir_str = data_dir
        .to_str()
        .ok_or_else(|| "invalid data dir".to_string())?
        .to_string();

    // Fixed port so browsers (including mobile on LAN) can connect at
    // http://<host>:30303 without needing Tauri IPC to discover the port.
    // Override with ATMOS_PORT env var if 30303 is occupied.
    let port = std::env::var("ATMOS_PORT").unwrap_or_else(|_| "30303".into());
    let mut sidecar_cmd = app_handle
        .shell()
        .sidecar("api")
        .map_err(|e| e.to_string())?
        .env("ATMOS_PORT", &port)
        .env("ATMOS_LOCAL_TOKEN", &api_token)
        .env("ATMOS_DATA_DIR", data_dir_str);

    if let Some(dir) = static_dir {
        if let Some(dir_str) = dir.to_str() {
            sidecar_cmd = sidecar_cmd.env("ATMOS_STATIC_DIR", dir_str);
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

    let log_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("own_space/OpenSource/atmos/logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let sidecar_log_path = log_dir.join("sidecar.log");

    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        let now = tokio::time::Instant::now();
        if now >= deadline {
            return Err("API startup timeout (no ready signal received)".to_string());
        }

        let remaining = deadline - now;
        let event = tokio::time::timeout(remaining, rx.recv())
            .await
            .map_err(|_| "API startup timeout while waiting for sidecar output".to_string())?;

        let Some(event) = event else {
            return Err("API sidecar exited before ready signal".to_string());
        };

        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line);
                eprintln!("[sidecar stdout] {}", text.trim());
                append_sidecar_log(&sidecar_log_path, &format!("stdout: {}", text.trim()));
                if let Some(port) = parse_ready_port(&text) {
                    {
                        let app_state = app_handle.state::<AppState>();
                        let mut guard = app_state
                            .api_port
                            .lock()
                            .map_err(|_| "state lock poisoned".to_string())?;
                        *guard = Some(port);
                    }
                    wait_for_api(port).await?;
                    append_sidecar_log(
                        &sidecar_log_path,
                        &format!("healthz OK port={port}, continuing to monitor"),
                    );
                    // Keep draining sidecar output so we can log crashes after startup.
                    tokio::spawn(async move {
                        while let Some(ev) = rx.recv().await {
                            match ev {
                                tauri_plugin_shell::process::CommandEvent::Stdout(l) => {
                                    let t = String::from_utf8_lossy(&l);
                                    eprintln!("[sidecar stdout] {}", t.trim());
                                    append_sidecar_log(
                                        &sidecar_log_path,
                                        &format!("stdout: {}", t.trim()),
                                    );
                                }
                                tauri_plugin_shell::process::CommandEvent::Stderr(l) => {
                                    let t = String::from_utf8_lossy(&l);
                                    eprintln!("[sidecar stderr] {}", t.trim());
                                    append_sidecar_log(
                                        &sidecar_log_path,
                                        &format!("stderr: {}", t.trim()),
                                    );
                                }
                                tauri_plugin_shell::process::CommandEvent::Terminated(p) => {
                                    let msg = format!("TERMINATED: {:?}", p);
                                    eprintln!("[sidecar] {}", msg);
                                    append_sidecar_log(&sidecar_log_path, &msg);
                                    break;
                                }
                                _ => {}
                            }
                        }
                    });
                    return Ok(());
                }
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let text = String::from_utf8_lossy(&line);
                eprintln!("[sidecar stderr] {}", text.trim());
                append_sidecar_log(&sidecar_log_path, &format!("stderr: {}", text.trim()));
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                let msg = format!("API sidecar terminated early: {:?}", payload);
                append_sidecar_log(&sidecar_log_path, &msg);
                return Err(msg);
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

fn append_sidecar_log(path: &std::path::Path, msg: &str) {
    use std::io::Write;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "[{ts}] {msg}");
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
