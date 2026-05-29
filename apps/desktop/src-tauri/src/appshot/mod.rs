mod capture_animation;
mod clipboard;
mod encoding;
#[cfg(target_os = "macos")]
mod macos;
mod pending;
mod permissions_window;
pub mod protocol;
mod records;
mod thumbnail;
pub mod types;
#[cfg(not(target_os = "macos"))]
mod unsupported;

use crate::appshot::types::{
    AppshotAcceptResponse, AppshotCopyResponse, AppshotOpenPermissionsRequest,
    AppshotPendingAutoAcceptRequest, AppshotReadRecordsRequest, AppshotRecordDetail,
    AppshotRecordListItem, AppshotSnapshotView, AppshotStatus, AppshotTriggerMode,
    AppshotTriggerStatus,
};
use tauri::{AppHandle, Emitter, Manager};

const PREVIEW_EVENT: &str = "appshot://preview";

pub async fn status(app: AppHandle) -> Result<AppshotStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let permissions = macos::permission_states();
        let trigger = trigger_status(permissions.clone());
        return Ok(AppshotStatus {
            supported: true,
            platform: types::AppshotPlatform::Macos,
            reason: None,
            trigger,
            permissions,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(unsupported::status())
    }
}

fn trigger_status(
    permissions: Vec<crate::appshot::types::AppshotPermissionState>,
) -> AppshotTriggerStatus {
    AppshotTriggerStatus {
        mode: if cfg!(target_os = "macos") {
            AppshotTriggerMode::MacosModifierGesture
        } else {
            AppshotTriggerMode::Unsupported
        },
        enabled: false,
        required_modifiers: if cfg!(target_os = "macos") {
            vec![
                "function".to_string(),
                "option".to_string(),
                "command".to_string(),
            ]
        } else {
            Vec::new()
        },
        last_error: None,
        permissions,
    }
}

pub async fn accept_pending(preview_id: String) -> Result<AppshotAcceptResponse, String> {
    pending::accept(&preview_id)
}

pub async fn discard_pending(preview_id: String) -> Result<(), String> {
    pending::discard(&preview_id)
}

pub async fn set_pending_auto_accept(req: AppshotPendingAutoAcceptRequest) -> Result<(), String> {
    pending::set_auto_accept_hold(&req.preview_id, req.held, req.resume_in_ms)
}

pub async fn list_records() -> Result<Vec<AppshotRecordListItem>, String> {
    records::list_records()
}

pub async fn read_records(
    req: AppshotReadRecordsRequest,
) -> Result<Vec<AppshotRecordDetail>, String> {
    records::read_records(&req.timestamps)
}

pub async fn read_snapshot(timestamp: String) -> Result<AppshotSnapshotView, String> {
    records::read_snapshot(&timestamp)
}

pub async fn copy_record(timestamp: String) -> Result<AppshotCopyResponse, String> {
    records::copy_record(&timestamp)
}

pub async fn delete_record(timestamp: String) -> Result<(), String> {
    records::delete_record(&timestamp)
}

pub fn show_permissions_window(
    app: AppHandle,
    locale: Option<String>,
    api_port: u16,
) -> Result<(), String> {
    permissions_window::show_permissions_window(app, locale, api_port)
}

pub async fn open_permissions(req: AppshotOpenPermissionsRequest) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return macos::open_settings(req.target);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = req;
        Err("Appshot permissions are only available on macOS desktop builds.".to_string())
    }
}

pub async fn trigger_capture(app: AppHandle) {
    play_capture_animation(&app).await;
    match capture_current().await {
        Ok(captured) => match pending::insert(captured) {
            Ok(preview) => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
                let _ = app.emit(PREVIEW_EVENT, &preview);
                if preview.expires_in_ms > 0 {
                    pending::spawn_auto_accept(app, preview.preview_id);
                }
            }
            Err(error) => {
                let _ = app.emit("appshot://error", error);
            }
        },
        Err(error) => {
            let _ = app.emit("appshot://error", error);
        }
    }
}

async fn play_capture_animation(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        if let Some(bounds) = macos::capture_animation_target().await {
            let _ = capture_animation::play(app.clone(), bounds).await;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

async fn capture_current() -> Result<types::CapturedAppshot, String> {
    #[cfg(target_os = "macos")]
    {
        return macos::capture_frontmost().await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Appshots are currently available on macOS desktop builds only.".to_string())
    }
}
