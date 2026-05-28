use crate::appshot::encoding;
use crate::appshot::records;
use crate::appshot::types::{AppshotAcceptResponse, AppshotPendingPreview, CapturedAppshot};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const PREVIEW_EXPIRES_IN_MS: u64 = 6_000;
const NATIVE_AUTO_ACCEPT_GRACE_MS: i64 = 500;
const RECOVERABLE_PENDING_TTL_MS: i64 = 5 * 60 * 1_000;
const BLOCKED_PENDING_TTL_MS: i64 = 60 * 1_000;
const MAX_PENDING_ENTRIES: usize = 16;

#[derive(Clone)]
struct PendingEntry {
    state: PendingState,
    created_at_ms: i64,
    expires_at_ms: i64,
    blocked_by_permissions: bool,
    auto_accept_held: bool,
    auto_accept_after_ms: Option<i64>,
}

#[derive(Clone)]
enum PendingState {
    Captured(CapturedAppshot),
    Saved(AppshotAcceptResponse),
}

static PENDING: OnceLock<Mutex<HashMap<String, PendingEntry>>> = OnceLock::new();

fn pending() -> &'static Mutex<HashMap<String, PendingEntry>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn insert(captured: CapturedAppshot) -> Result<AppshotPendingPreview, String> {
    let now_ms = Utc::now().timestamp_millis();
    let preview_id = format!("{}-{}", now_ms, random_suffix());
    let mut preview_warnings = captured.warnings.clone();
    let screenshot_preview_base64 = screenshot_preview_base64(&captured, &mut preview_warnings);
    let has_denied_permissions = captured
        .permissions
        .iter()
        .any(|permission| !permission.granted);
    let preview = AppshotPendingPreview {
        preview_id: preview_id.clone(),
        app_name: captured.app_name.clone(),
        window_title: captured.window_title.clone(),
        captured_at: captured.captured_at.clone(),
        quality: captured.quality.clone(),
        screenshot_preview_base64,
        permissions: captured.permissions.clone(),
        warnings: preview_warnings,
        expires_in_ms: if has_denied_permissions {
            0
        } else {
            PREVIEW_EXPIRES_IN_MS
        },
    };
    let mut pending = pending()
        .lock()
        .map_err(|_| "appshot pending state lock poisoned".to_string())?;
    prune_locked(&mut pending, now_ms);
    if has_denied_permissions {
        pending.retain(|_, entry| !entry.blocked_by_permissions);
    }
    enforce_capacity_locked(&mut pending);
    pending.insert(
        preview_id,
        PendingEntry {
            state: PendingState::Captured(captured),
            created_at_ms: now_ms,
            expires_at_ms: now_ms
                + if has_denied_permissions {
                    BLOCKED_PENDING_TTL_MS
                } else {
                    RECOVERABLE_PENDING_TTL_MS
                },
            blocked_by_permissions: has_denied_permissions,
            auto_accept_held: false,
            auto_accept_after_ms: if has_denied_permissions {
                None
            } else {
                Some(now_ms + PREVIEW_EXPIRES_IN_MS as i64 + NATIVE_AUTO_ACCEPT_GRACE_MS)
            },
        },
    );
    Ok(preview)
}

fn screenshot_preview_base64(
    captured: &CapturedAppshot,
    warnings: &mut Vec<String>,
) -> Option<String> {
    if !captured.screenshot.available {
        return None;
    }
    if captured.screenshot_png.len() > encoding::MAX_INLINE_SNAPSHOT_BYTES {
        append_warning(warnings, encoding::OVERSIZED_SNAPSHOT_WARNING);
        return None;
    }
    Some(encoding::base64_encode(&captured.screenshot_png))
}

fn append_warning(warnings: &mut Vec<String>, warning: &str) {
    if !warnings.iter().any(|existing| existing == warning) {
        warnings.push(warning.to_string());
    }
}

pub fn accept(preview_id: &str) -> Result<AppshotAcceptResponse, String> {
    accept_with_clipboard(preview_id, records::copy_protocol_text)
}

fn accept_with_clipboard(
    preview_id: &str,
    copy_protocol_text: impl Fn(&str) -> Result<(), String>,
) -> Result<AppshotAcceptResponse, String> {
    let entry = pending()
        .lock()
        .map_err(|_| "appshot pending state lock poisoned".to_string())?
        .remove(preview_id)
        .ok_or_else(|| "appshot preview is no longer pending".to_string())?;
    let created_at_ms = entry.created_at_ms;
    let expires_at_ms = entry.expires_at_ms;
    let blocked_by_permissions = entry.blocked_by_permissions;
    let auto_accept_held = entry.auto_accept_held;
    let auto_accept_after_ms = entry.auto_accept_after_ms;

    match entry.state {
        PendingState::Captured(captured) => match records::write_record(captured.clone()) {
            Ok(response) => copy_saved_response(
                preview_id,
                response,
                created_at_ms,
                blocked_by_permissions,
                auto_accept_held,
                auto_accept_after_ms,
                &copy_protocol_text,
            ),
            Err(error) => {
                restore_entry(
                    preview_id,
                    PendingEntry {
                        state: PendingState::Captured(captured),
                        created_at_ms,
                        expires_at_ms,
                        blocked_by_permissions,
                        auto_accept_held,
                        auto_accept_after_ms,
                    },
                );
                Err(error)
            }
        },
        PendingState::Saved(response) => copy_saved_response(
            preview_id,
            response,
            created_at_ms,
            blocked_by_permissions,
            auto_accept_held,
            auto_accept_after_ms,
            &copy_protocol_text,
        ),
    }
}

fn copy_saved_response(
    preview_id: &str,
    response: AppshotAcceptResponse,
    created_at_ms: i64,
    blocked_by_permissions: bool,
    auto_accept_held: bool,
    auto_accept_after_ms: Option<i64>,
    copy_protocol_text: &impl Fn(&str) -> Result<(), String>,
) -> Result<AppshotAcceptResponse, String> {
    match copy_protocol_text(&response.protocol_text) {
        Ok(()) => Ok(response),
        Err(error) => {
            restore_entry(
                preview_id,
                PendingEntry {
                    state: PendingState::Saved(response),
                    created_at_ms,
                    expires_at_ms: Utc::now().timestamp_millis() + RECOVERABLE_PENDING_TTL_MS,
                    blocked_by_permissions,
                    auto_accept_held,
                    auto_accept_after_ms,
                },
            );
            Err(error)
        }
    }
}

pub fn discard(preview_id: &str) -> Result<(), String> {
    let removed = pending()
        .lock()
        .map_err(|_| "appshot pending state lock poisoned".to_string())?
        .remove(preview_id);
    if let Some(PendingEntry {
        state: PendingState::Saved(response),
        ..
    }) = removed
    {
        records::delete_record(&response.timestamp)?;
    }
    Ok(())
}

pub fn set_auto_accept_hold(
    preview_id: &str,
    held: bool,
    resume_in_ms: Option<u64>,
) -> Result<(), String> {
    let mut pending = pending()
        .lock()
        .map_err(|_| "appshot pending state lock poisoned".to_string())?;
    prune_locked(&mut pending, Utc::now().timestamp_millis());
    let Some(entry) = pending.get_mut(preview_id) else {
        return Ok(());
    };

    entry.auto_accept_held = held;
    if !held {
        entry.auto_accept_after_ms = resume_in_ms.map(|millis| {
            Utc::now().timestamp_millis()
                + i64::try_from(millis.max(500)).unwrap_or(500)
                + NATIVE_AUTO_ACCEPT_GRACE_MS
        });
    }
    Ok(())
}

pub fn spawn_auto_accept(app: AppHandle, preview_id: String) {
    tauri::async_runtime::spawn(async move {
        loop {
            match auto_accept_state(&preview_id) {
                Ok(AutoAcceptState::Missing) => return,
                Ok(AutoAcceptState::Held) => {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                Ok(AutoAcceptState::Wait(delay_ms)) => {
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                }
                Ok(AutoAcceptState::Ready) => {
                    if let Err(error) = accept(&preview_id) {
                        if !error.to_lowercase().contains("no longer pending") {
                            let _ = app.emit("appshot://error", error.clone());
                            eprintln!("appshot auto-accept failed: {error}");
                        }
                    }
                    return;
                }
                Err(error) => {
                    let _ = app.emit("appshot://error", error.clone());
                    eprintln!("appshot auto-accept failed: {error}");
                    return;
                }
            }
        }
    });
}

#[derive(Debug, PartialEq, Eq)]
enum AutoAcceptState {
    Missing,
    Held,
    Wait(u64),
    Ready,
}

fn auto_accept_state(preview_id: &str) -> Result<AutoAcceptState, String> {
    let mut pending = pending()
        .lock()
        .map_err(|_| "appshot pending state lock poisoned".to_string())?;
    let now_ms = Utc::now().timestamp_millis();
    prune_locked(&mut pending, now_ms);
    let Some(entry) = pending.get(preview_id) else {
        return Ok(AutoAcceptState::Missing);
    };
    if entry.auto_accept_held {
        return Ok(AutoAcceptState::Held);
    }
    let Some(auto_accept_after_ms) = entry.auto_accept_after_ms else {
        return Ok(AutoAcceptState::Missing);
    };
    if auto_accept_after_ms <= now_ms {
        return Ok(AutoAcceptState::Ready);
    }
    Ok(AutoAcceptState::Wait(
        (auto_accept_after_ms - now_ms) as u64,
    ))
}

fn restore_entry(preview_id: &str, entry: PendingEntry) {
    if let Ok(mut pending) = pending().lock() {
        prune_locked(&mut pending, Utc::now().timestamp_millis());
        enforce_capacity_locked(&mut pending);
        pending.insert(preview_id.to_string(), entry);
    }
}

fn prune_locked(pending: &mut HashMap<String, PendingEntry>, now_ms: i64) {
    pending.retain(|_, entry| entry.expires_at_ms > now_ms);
}

fn enforce_capacity_locked(pending: &mut HashMap<String, PendingEntry>) {
    while pending.len() >= MAX_PENDING_ENTRIES {
        let Some(oldest_key) = pending
            .iter()
            .min_by_key(|(_, entry)| entry.created_at_ms)
            .map(|(key, _)| key.clone())
        else {
            break;
        };
        pending.remove(&oldest_key);
    }
}

fn random_suffix() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

#[cfg(test)]
fn pending_count() -> usize {
    pending().lock().expect("pending lock").len()
}

#[cfg(test)]
fn clear_for_tests() {
    pending().lock().expect("pending lock").clear();
}

#[cfg(test)]
fn test_serial_guard() -> std::sync::MutexGuard<'static, ()> {
    static TEST_SERIAL: OnceLock<Mutex<()>> = OnceLock::new();
    TEST_SERIAL
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("pending test serial lock")
}

#[cfg(test)]
mod tests {
    use super::{
        accept_with_clipboard, auto_accept_state, clear_for_tests, insert, pending_count,
        set_auto_accept_hold, test_serial_guard, AutoAcceptState,
    };
    use crate::appshot::types::{
        AppshotPermissionName, AppshotPermissionState, AppshotPlatform, AppshotQuality,
        AppshotScreenshotMetadata, CapturedAppshot,
    };
    use crate::appshot::{encoding, records};
    use chrono::Utc;
    use std::cell::{Cell, RefCell};
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn clipboard_failure_keeps_saved_record_retryable() {
        let _serial = test_serial_guard();
        clear_for_tests();
        let root = unique_test_root("retry");
        let _root_guard = records::use_test_data_root(root.clone());
        let preview = insert(sample_capture(true)).expect("insert pending");

        let attempts = Cell::new(0);
        let copied_text = RefCell::new(None::<String>);
        let first_error = accept_with_clipboard(&preview.preview_id, |protocol_text| {
            attempts.set(attempts.get() + 1);
            if attempts.get() == 1 {
                Err("clipboard unavailable".to_string())
            } else {
                *copied_text.borrow_mut() = Some(protocol_text.to_string());
                Ok(())
            }
        })
        .expect_err("first copy should fail");

        assert!(first_error.contains("clipboard unavailable"));
        assert_eq!(pending_count(), 1);
        let saved_records = records::list_records().expect("list records after failed copy");
        assert_eq!(saved_records.len(), 1);
        let saved_timestamp = saved_records[0].timestamp.clone();

        let response = accept_with_clipboard(&preview.preview_id, |protocol_text| {
            attempts.set(attempts.get() + 1);
            *copied_text.borrow_mut() = Some(protocol_text.to_string());
            Ok(())
        })
        .expect("retry copy");

        assert_eq!(response.timestamp, saved_timestamp);
        assert_eq!(pending_count(), 0);
        assert_eq!(attempts.get(), 2);
        assert_eq!(
            copied_text.borrow().as_deref(),
            Some(response.protocol_text.as_str())
        );
        assert_eq!(records::list_records().unwrap().len(), 1);

        clear_for_tests();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn permission_blocked_pending_entries_are_replaced() {
        let _serial = test_serial_guard();
        clear_for_tests();

        let first = insert(sample_capture(false)).expect("first blocked pending");
        assert_eq!(first.expires_in_ms, 0);
        assert_eq!(pending_count(), 1);

        let second = insert(sample_capture(false)).expect("second blocked pending");
        assert_eq!(second.expires_in_ms, 0);
        assert_eq!(pending_count(), 1);
        assert!(accept_with_clipboard(&first.preview_id, |_| Ok(())).is_err());

        clear_for_tests();
    }

    #[test]
    fn pending_preview_omits_oversized_inline_snapshot() {
        let _serial = test_serial_guard();
        clear_for_tests();

        let mut capture = sample_capture(true);
        capture.screenshot_png = vec![7; encoding::MAX_INLINE_SNAPSHOT_BYTES + 1];
        let preview = insert(capture).expect("insert oversized pending");

        assert!(preview.screenshot_preview_base64.is_none());
        assert!(preview
            .warnings
            .iter()
            .any(|warning| warning == encoding::OVERSIZED_SNAPSHOT_WARNING));

        clear_for_tests();
    }

    #[test]
    fn pending_auto_accept_can_be_held_and_resumed() {
        let _serial = test_serial_guard();
        clear_for_tests();

        let preview = insert(sample_capture(true)).expect("insert pending");
        assert!(matches!(
            auto_accept_state(&preview.preview_id).expect("initial auto accept state"),
            AutoAcceptState::Wait(delay) if delay > 0
        ));

        set_auto_accept_hold(&preview.preview_id, true, None).expect("hold auto accept");
        assert_eq!(
            auto_accept_state(&preview.preview_id).expect("held auto accept state"),
            AutoAcceptState::Held
        );

        set_auto_accept_hold(&preview.preview_id, false, Some(1_200)).expect("resume auto accept");
        assert!(matches!(
            auto_accept_state(&preview.preview_id).expect("resumed auto accept state"),
            AutoAcceptState::Wait(delay) if delay > 0 && delay <= 1_700
        ));

        clear_for_tests();
    }

    fn sample_capture(granted: bool) -> CapturedAppshot {
        CapturedAppshot {
            app_name: "Safari".to_string(),
            bundle_id: Some("com.apple.Safari".to_string()),
            process_id: Some(100),
            window_title: Some("Example".to_string()),
            window_id: None,
            captured_at: Utc::now().to_rfc3339(),
            platform: AppshotPlatform::Macos,
            quality: if granted {
                AppshotQuality::ScreenshotAndAccessibility
            } else {
                AppshotQuality::MetadataOnly
            },
            screenshot_png: b"png-bytes".to_vec(),
            screenshot: AppshotScreenshotMetadata {
                available: granted,
                width: Some(20),
                height: Some(10),
                media_type: "image/png".to_string(),
            },
            context_markdown: "# Appshot Context\n\nbody".to_string(),
            permissions: vec![AppshotPermissionState {
                name: AppshotPermissionName::Accessibility,
                display_name: "Accessibility".to_string(),
                granted,
                required_for: Vec::new(),
                recovery_action: None,
            }],
            warnings: Vec::new(),
        }
    }

    fn unique_test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "atmos-appshot-pending-{name}-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }
}
