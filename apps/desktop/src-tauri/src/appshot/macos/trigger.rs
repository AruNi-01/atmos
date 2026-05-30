use super::permissions::accessibility_granted;
use crate::appshot;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventTapProxy, CGEventType, EventField, KeyCode,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use tauri::AppHandle;

#[derive(Clone, Debug, Default)]
struct ListenerState {
    starting: bool,
    enabled: bool,
    last_error: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ShiftSide {
    Left,
    Right,
}

#[derive(Debug, Default)]
struct ShiftChordState {
    shift_active: bool,
    last_side: Option<ShiftSide>,
    chord_down: bool,
}

impl ShiftChordState {
    fn observe(&mut self, side: ShiftSide, shift_active: bool) -> bool {
        if !shift_active {
            self.reset();
            return false;
        }

        let should_trigger = self.shift_active
            && self.last_side.is_some_and(|last_side| last_side != side)
            && !self.chord_down;

        self.shift_active = true;
        self.last_side = Some(side);
        if should_trigger {
            self.chord_down = true;
        }

        should_trigger
    }

    fn reset(&mut self) {
        self.shift_active = false;
        self.last_side = None;
        self.chord_down = false;
    }
}

static LISTENER_STATE: OnceLock<Mutex<ListenerState>> = OnceLock::new();

pub(super) fn ensure_listener(app: AppHandle) {
    if !accessibility_granted() {
        return;
    }

    {
        let mut state = listener_state().lock().unwrap();
        if state.enabled || state.starting {
            return;
        }
        state.starting = true;
        state.last_error = None;
    }

    if let Err(error) = thread::Builder::new()
        .name("appshot-modifier-trigger".to_string())
        .spawn(move || run_event_tap(app))
    {
        update_state(|state| {
            state.starting = false;
            state.enabled = false;
            state.last_error = Some(format!(
                "failed to start Appshots trigger listener: {error}"
            ));
        });
    }
}

pub(super) fn listener_status() -> (bool, Option<String>) {
    let state = listener_state().lock().unwrap().clone();
    (state.enabled, state.last_error)
}

fn run_event_tap(app: AppHandle) {
    let chord_state = Arc::new(Mutex::new(ShiftChordState::default()));
    let capture_running = Arc::new(AtomicBool::new(false));
    let app_for_callback = app.clone();
    let chord_state_for_callback = Arc::clone(&chord_state);
    let capture_running_for_callback = Arc::clone(&capture_running);

    let tap = match CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::FlagsChanged],
        move |_proxy: CGEventTapProxy, event_type: CGEventType, event: &CGEvent| {
            if !matches!(event_type, CGEventType::FlagsChanged) {
                return None;
            }

            let shift_active = event.get_flags().contains(CGEventFlags::CGEventFlagShift);
            let should_capture = {
                let mut chord_state = chord_state_for_callback.lock().unwrap();
                match shift_side_for_event(event) {
                    Some(side) => chord_state.observe(side, shift_active),
                    None if !shift_active => {
                        chord_state.reset();
                        false
                    }
                    None => false,
                }
            };
            if !should_capture {
                return None;
            }

            if capture_running_for_callback.swap(true, Ordering::SeqCst) {
                return None;
            }

            let app = app_for_callback.clone();
            let capture_running = Arc::clone(&capture_running_for_callback);
            tauri::async_runtime::spawn(async move {
                appshot::trigger_capture(app).await;
                capture_running.store(false, Ordering::SeqCst);
            });

            None
        },
    ) {
        Ok(tap) => tap,
        Err(()) => {
            update_state(|state| {
                state.starting = false;
                state.enabled = false;
                state.last_error = Some(
                    "failed to create Appshots trigger listener; verify Accessibility permission for Atmos."
                        .to_string(),
                );
            });
            return;
        }
    };

    let current = CFRunLoop::get_current();
    let source = match tap.mach_port.create_runloop_source(0) {
        Ok(source) => source,
        Err(()) => {
            update_state(|state| {
                state.starting = false;
                state.enabled = false;
                state.last_error =
                    Some("failed to attach Appshots trigger listener to the run loop.".to_string());
            });
            return;
        }
    };

    current.add_source(&source, unsafe { kCFRunLoopCommonModes });
    tap.enable();
    update_state(|state| {
        state.starting = false;
        state.enabled = true;
        state.last_error = None;
    });

    CFRunLoop::run_current();

    update_state(|state| {
        state.enabled = false;
        state.last_error = Some("Appshots trigger listener stopped unexpectedly.".to_string());
    });
}

fn shift_side_for_event(event: &CGEvent) -> Option<ShiftSide> {
    let keycode =
        u16::try_from(event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)).ok()?;
    shift_side_for_keycode(keycode)
}

fn shift_side_for_keycode(keycode: u16) -> Option<ShiftSide> {
    match keycode {
        KeyCode::SHIFT => Some(ShiftSide::Left),
        KeyCode::RIGHT_SHIFT => Some(ShiftSide::Right),
        _ => None,
    }
}

fn listener_state() -> &'static Mutex<ListenerState> {
    LISTENER_STATE.get_or_init(|| Mutex::new(ListenerState::default()))
}

fn update_state(update: impl FnOnce(&mut ListenerState)) {
    let mut state = listener_state().lock().unwrap();
    update(&mut state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shift_chord_triggers_when_second_side_is_pressed() {
        let mut state = ShiftChordState::default();

        assert!(!state.observe(ShiftSide::Left, true));
        assert!(state.observe(ShiftSide::Right, true));
        assert!(!state.observe(ShiftSide::Right, true));
    }

    #[test]
    fn shift_chord_rearms_after_both_shift_keys_are_released() {
        let mut state = ShiftChordState::default();

        assert!(!state.observe(ShiftSide::Right, true));
        assert!(state.observe(ShiftSide::Left, true));
        assert!(!state.observe(ShiftSide::Left, true));

        assert!(!state.observe(ShiftSide::Right, false));
        assert!(!state.observe(ShiftSide::Right, true));
        assert!(state.observe(ShiftSide::Left, true));
    }

    #[test]
    fn shift_side_uses_physical_left_and_right_keycodes() {
        assert_eq!(
            shift_side_for_keycode(KeyCode::SHIFT),
            Some(ShiftSide::Left)
        );
        assert_eq!(
            shift_side_for_keycode(KeyCode::RIGHT_SHIFT),
            Some(ShiftSide::Right)
        );
        assert_eq!(shift_side_for_keycode(KeyCode::OPTION), None);
    }
}
