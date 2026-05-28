mod clipboard;
mod encoding;
#[cfg(target_os = "macos")]
mod macos;
mod pending;
pub mod protocol;
mod records;
mod shortcut;
pub mod types;
#[cfg(not(target_os = "macos"))]
mod unsupported;

use crate::appshot::types::{
    AppshotAcceptResponse, AppshotCopyResponse, AppshotOpenPermissionsRequest,
    AppshotPendingAutoAcceptRequest, AppshotReadRecordsRequest, AppshotRecordDetail,
    AppshotRecordListItem, AppshotStatus,
};
use tauri::{AppHandle, Emitter, Manager};

const PREVIEW_EVENT: &str = "appshot://preview";

pub fn init(app: AppHandle) {
    shortcut::start(app);
}

pub async fn status(app: AppHandle) -> Result<AppshotStatus, String> {
    #[cfg(target_os = "macos")]
    {
        shortcut::start(app);
        let permissions = macos::permission_states(shortcut::is_enabled());
        let trigger = shortcut::trigger_status(permissions.clone());
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

pub async fn copy_record(timestamp: String) -> Result<AppshotCopyResponse, String> {
    records::copy_record(&timestamp)
}

pub async fn delete_record(timestamp: String) -> Result<(), String> {
    records::delete_record(&timestamp)
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
    match capture_current(shortcut::is_enabled()).await {
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

async fn capture_current(input_monitoring_granted: bool) -> Result<types::CapturedAppshot, String> {
    #[cfg(target_os = "macos")]
    {
        return macos::capture_frontmost(input_monitoring_granted).await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = input_monitoring_granted;
        Err("Appshots are currently available on macOS desktop builds only.".to_string())
    }
}
