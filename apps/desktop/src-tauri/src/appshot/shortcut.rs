use crate::appshot::types::{AppshotTriggerMode, AppshotTriggerStatus};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

#[derive(Debug)]
struct RuntimeStatus {
    started: bool,
    enabled: bool,
    last_error: Option<String>,
}

static STATUS: OnceLock<Arc<Mutex<RuntimeStatus>>> = OnceLock::new();

fn status_state() -> Arc<Mutex<RuntimeStatus>> {
    STATUS
        .get_or_init(|| {
            Arc::new(Mutex::new(RuntimeStatus {
                started: false,
                enabled: false,
                last_error: None,
            }))
        })
        .clone()
}

pub fn start(app: AppHandle) {
    #[cfg(target_os = "macos")]
    start_macos(app);

    #[cfg(not(target_os = "macos"))]
    {
        let status = status_state();
        if let Ok(mut status) = status.lock() {
            status.started = true;
            status.enabled = false;
            status.last_error =
                Some("Appshot trigger is unsupported on this platform.".to_string());
        }
        let _ = app;
    }
}

pub fn trigger_status(
    permissions: Vec<crate::appshot::types::AppshotPermissionState>,
) -> AppshotTriggerStatus {
    let status = status_state();
    let status = status.lock().ok();
    let enabled = status
        .as_ref()
        .map(|status| status.enabled)
        .unwrap_or(false);
    let last_error = status.as_ref().and_then(|status| status.last_error.clone());

    AppshotTriggerStatus {
        mode: if cfg!(target_os = "macos") {
            AppshotTriggerMode::MacosModifierGesture
        } else {
            AppshotTriggerMode::Unsupported
        },
        enabled,
        required_modifiers: if cfg!(target_os = "macos") {
            vec![
                "function".to_string(),
                "option".to_string(),
                "command".to_string(),
            ]
        } else {
            Vec::new()
        },
        last_error,
        permissions,
    }
}

pub fn is_enabled() -> bool {
    status_state()
        .lock()
        .map(|status| status.enabled)
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn start_macos(app: AppHandle) {
    use std::thread;

    let status = status_state();
    {
        let mut guard = match status.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        if guard.started {
            return;
        }
        guard.started = true;
        guard.enabled = false;
        guard.last_error = None;
    }

    thread::spawn(move || {
        let context = Box::new(TapContext {
            app,
            status: status.clone(),
            gesture: Arc::new(Mutex::new(ModifierGestureState::default())),
            tap_ref: Mutex::new(None),
            reenable_attempted: Mutex::new(false),
        });
        let context_ptr = Box::into_raw(context);
        let tap = unsafe {
            CGEventTapCreate(
                K_CG_HID_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                event_mask(K_CG_EVENT_FLAGS_CHANGED),
                appshot_event_tap_callback,
                context_ptr.cast(),
            )
        };

        if tap.is_null() {
            unsafe {
                let _ = Box::from_raw(context_ptr);
            }
            set_status_error(
                &status,
                "Failed to install Appshot modifier listener. Grant Accessibility and Input Monitoring permissions, then restart Atmos if the listener does not recover.",
            );
            return;
        }

        if let Ok(mut tap_ref) = unsafe { &*context_ptr }.tap_ref.lock() {
            *tap_ref = Some(tap as usize);
        }

        let source = unsafe { CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0) };
        if source.is_null() {
            set_status_error(
                &status,
                "Failed to attach Appshot modifier listener to the run loop.",
            );
            unsafe {
                CFRelease(tap.cast());
                let _ = Box::from_raw(context_ptr);
            }
            return;
        }

        unsafe {
            let current_loop = CFRunLoopGetCurrent();
            CFRunLoopAddSource(current_loop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
        }
        if let Ok(mut status) = status.lock() {
            status.enabled = true;
            status.last_error = None;
        }

        unsafe {
            CFRunLoopRun();
            CFRelease(source.cast());
            CFRelease(tap.cast());
            let _ = Box::from_raw(context_ptr);
        }
    });
}

#[cfg(target_os = "macos")]
#[derive(Default)]
struct ModifierGestureState {
    fired: bool,
    last_fire_at: Option<Instant>,
}

#[cfg(target_os = "macos")]
struct TapContext {
    app: AppHandle,
    status: Arc<Mutex<RuntimeStatus>>,
    gesture: Arc<Mutex<ModifierGestureState>>,
    tap_ref: Mutex<Option<usize>>,
    reenable_attempted: Mutex<bool>,
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn appshot_event_tap_callback(
    _proxy: *mut std::ffi::c_void,
    event_type: u32,
    event: *mut std::ffi::c_void,
    user_info: *mut std::ffi::c_void,
) -> *mut std::ffi::c_void {
    if user_info.is_null() {
        return event;
    }

    let context = &*(user_info as *const TapContext);
    match event_type {
        K_CG_EVENT_FLAGS_CHANGED if !event.is_null() => {
            let flags = CGEventGetFlags(event);
            handle_flags_changed(context, flags);
        }
        K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT | K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT => {
            handle_tap_disabled(context);
        }
        _ => {}
    }

    event
}

#[cfg(target_os = "macos")]
fn handle_flags_changed(context: &TapContext, flags: u64) {
    let mut gesture = match context.gesture.lock() {
        Ok(gesture) => gesture,
        Err(_) => return,
    };

    let gesture_down = flags & K_CG_EVENT_FLAG_SECONDARY_FN != 0
        && flags & K_CG_EVENT_FLAG_ALTERNATE != 0
        && flags & K_CG_EVENT_FLAG_COMMAND != 0;
    if !gesture_down {
        gesture.fired = false;
        return;
    }

    let cooldown_elapsed = gesture
        .last_fire_at
        .map(|instant| instant.elapsed() >= Duration::from_millis(800))
        .unwrap_or(true);
    if gesture.fired || !cooldown_elapsed {
        return;
    }

    gesture.fired = true;
    gesture.last_fire_at = Some(Instant::now());
    if let Ok(mut status) = context.status.lock() {
        status.enabled = true;
        status.last_error = None;
    }

    let app = context.app.clone();
    tauri::async_runtime::spawn(async move {
        crate::appshot::trigger_capture(app).await;
    });
}

#[cfg(target_os = "macos")]
fn handle_tap_disabled(context: &TapContext) {
    let should_reenable = context
        .reenable_attempted
        .lock()
        .map(|mut attempted| {
            if *attempted {
                false
            } else {
                *attempted = true;
                true
            }
        })
        .unwrap_or(false);

    if should_reenable {
        if let Ok(tap_ref) = context.tap_ref.lock() {
            if let Some(tap) = *tap_ref {
                unsafe {
                    CGEventTapEnable(tap as *mut std::ffi::c_void, true);
                }
                return;
            }
        }
    }

    set_status_warning(
        &context.status,
        "Appshot modifier listener was disabled by macOS. Check Accessibility and Input Monitoring permissions.",
    );
}

#[cfg(target_os = "macos")]
fn set_status_error(status: &Arc<Mutex<RuntimeStatus>>, message: &str) {
    if let Ok(mut status) = status.lock() {
        status.started = false;
        status.enabled = false;
        status.last_error = Some(message.to_string());
    }
}

#[cfg(target_os = "macos")]
fn set_status_warning(status: &Arc<Mutex<RuntimeStatus>>, message: &str) {
    if let Ok(mut status) = status.lock() {
        status.enabled = false;
        status.last_error = Some(message.to_string());
    }
}

#[cfg(target_os = "macos")]
fn event_mask(event_type: u32) -> u64 {
    1_u64 << event_type
}

#[cfg(target_os = "macos")]
const K_CG_HID_EVENT_TAP: u32 = 0;
#[cfg(target_os = "macos")]
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
#[cfg(target_os = "macos")]
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;
#[cfg(target_os = "macos")]
const K_CG_EVENT_FLAGS_CHANGED: u32 = 12;
#[cfg(target_os = "macos")]
const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
#[cfg(target_os = "macos")]
const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
#[cfg(target_os = "macos")]
const K_CG_EVENT_FLAG_ALTERNATE: u64 = 0x0008_0000;
#[cfg(target_os = "macos")]
const K_CG_EVENT_FLAG_COMMAND: u64 = 0x0010_0000;
#[cfg(target_os = "macos")]
const K_CG_EVENT_FLAG_SECONDARY_FN: u64 = 0x0080_0000;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: unsafe extern "C" fn(
            proxy: *mut std::ffi::c_void,
            event_type: u32,
            event: *mut std::ffi::c_void,
            user_info: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void,
        user_info: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;

    fn CGEventTapEnable(tap: *mut std::ffi::c_void, enable: bool);
    fn CGEventGetFlags(event: *mut std::ffi::c_void) -> u64;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopCommonModes: *const std::ffi::c_void;

    fn CFRunLoopGetCurrent() -> *mut std::ffi::c_void;
    fn CFRunLoopAddSource(
        run_loop: *mut std::ffi::c_void,
        source: *mut std::ffi::c_void,
        mode: *const std::ffi::c_void,
    );
    fn CFRunLoopRun();
    fn CFMachPortCreateRunLoopSource(
        allocator: *const std::ffi::c_void,
        port: *mut std::ffi::c_void,
        order: isize,
    ) -> *mut std::ffi::c_void;
    fn CFRelease(value: *const std::ffi::c_void);
}
