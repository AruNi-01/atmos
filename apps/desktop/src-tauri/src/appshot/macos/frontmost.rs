use super::model::{FrontmostApp, FrontmostWindow, WindowCandidate};
use super::process::{non_empty, run_osascript};
use core_foundation::array::CFArray;
use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowIsOnscreen,
    kCGWindowLayer, kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly,
    kCGWindowName, kCGWindowNumber, kCGWindowOwnerName, kCGWindowOwnerPID,
};
use objc2_app_kit::{NSRunningApplication, NSWorkspace};
use std::mem;
use std::time::Duration;

const FRONTMOST_WINDOW_TIMEOUT_MS: u64 = 2_500;
const MIN_WINDOW_WIDTH: i32 = 32;
const MIN_WINDOW_HEIGHT: i32 = 32;

pub(super) fn read_frontmost_window() -> Result<FrontmostWindow, String> {
    read_frontmost_window_native().or_else(|native_error| {
        read_frontmost_window_with_system_events().map_err(|script_error| {
            format!("{native_error}; System Events fallback failed: {script_error}")
        })
    })
}

pub(super) fn read_frontmost_window_native() -> Result<FrontmostWindow, String> {
    let front_app = read_frontmost_app();
    let candidates = read_window_candidates()?;
    select_frontmost_window(front_app, candidates)
}

pub(super) fn select_frontmost_window(
    front_app: Option<FrontmostApp>,
    candidates: Vec<WindowCandidate>,
) -> Result<FrontmostWindow, String> {
    if candidates.is_empty() && front_app.is_none() {
        return Err("Unable to identify the frontmost app or any visible window.".to_string());
    }

    if let Some(app) = front_app {
        if let Some(window) = app
            .process_id
            .and_then(|process_id| {
                candidates
                    .iter()
                    .find(|window| window.process_id == Some(process_id))
            })
            .cloned()
        {
            return Ok(merge_app_and_window(app, Some(window)));
        }

        if app.app_name == "Atmos" {
            return Ok(merge_app_and_window(app, None));
        }

        if let Some(window) = candidates
            .iter()
            .find(|window| window.app_name == app.app_name)
            .cloned()
        {
            return Ok(merge_app_and_window(app, Some(window)));
        }

        return Ok(merge_app_and_window(app, None));
    }

    candidates
        .into_iter()
        .find(|window| window.app_name != "Atmos")
        .map(window_candidate_to_frontmost)
        .ok_or_else(|| "Unable to identify a non-Atmos visible window.".to_string())
}

fn read_frontmost_app() -> Option<FrontmostApp> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let app_name = app
        .localizedName()
        .map(|name| name.to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Unknown App".to_string());
    let bundle_id = app
        .bundleIdentifier()
        .map(|bundle_id| bundle_id.to_string())
        .filter(|bundle_id| !bundle_id.trim().is_empty());
    let process_id = {
        let pid = app.processIdentifier();
        u32::try_from(pid).ok()
    };

    Some(FrontmostApp {
        app_name,
        bundle_id,
        process_id,
    })
}

fn merge_app_and_window(app: FrontmostApp, window: Option<WindowCandidate>) -> FrontmostWindow {
    FrontmostWindow {
        app_name: app.app_name,
        bundle_id: app.bundle_id,
        process_id: app
            .process_id
            .or_else(|| window.as_ref().and_then(|window| window.process_id)),
        window_title: window
            .as_ref()
            .and_then(|window| window.window_title.clone()),
        window_id: window.as_ref().and_then(|window| window.window_id.clone()),
        x: window.as_ref().and_then(|window| window.x),
        y: window.as_ref().and_then(|window| window.y),
        width: window.as_ref().and_then(|window| window.width),
        height: window.as_ref().and_then(|window| window.height),
    }
}

fn window_candidate_to_frontmost(window: WindowCandidate) -> FrontmostWindow {
    let bundle_id = window.process_id.and_then(bundle_id_for_pid);
    FrontmostWindow {
        app_name: window.app_name,
        bundle_id,
        process_id: window.process_id,
        window_title: window.window_title,
        window_id: window.window_id,
        x: window.x,
        y: window.y,
        width: window.width,
        height: window.height,
    }
}

fn bundle_id_for_pid(process_id: u32) -> Option<String> {
    let pid = i32::try_from(process_id).ok()?;
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)?;
    app.bundleIdentifier()
        .map(|bundle_id| bundle_id.to_string())
        .filter(|bundle_id| !bundle_id.trim().is_empty())
}

fn read_window_candidates() -> Result<Vec<WindowCandidate>, String> {
    let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    let raw_windows = copy_window_info(options, kCGNullWindowID)
        .ok_or_else(|| "CoreGraphics window list was unavailable.".to_string())?;
    let raw_windows_ref = raw_windows.as_concrete_TypeRef();
    mem::forget(raw_windows);
    let windows: CFArray<CFDictionary<CFType, CFType>> =
        unsafe { TCFType::wrap_under_create_rule(raw_windows_ref) };

    let mut candidates = Vec::new();
    for window in windows.iter() {
        if cf_number_i32(&window, unsafe { kCGWindowLayer }).unwrap_or_default() != 0 {
            continue;
        }
        if cf_number_i32(&window, unsafe { kCGWindowIsOnscreen }) == Some(0) {
            continue;
        }
        if cf_number_f64(&window, unsafe { kCGWindowAlpha })
            .map(|alpha| alpha <= 0.01)
            .unwrap_or(false)
        {
            continue;
        }

        let bounds = cg_window_bounds(&window);
        if !usable_bounds(bounds) {
            continue;
        }

        let app_name = cf_string(&window, unsafe { kCGWindowOwnerName })
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "Unknown App".to_string());
        candidates.push(WindowCandidate {
            app_name,
            process_id: cf_number_u32(&window, unsafe { kCGWindowOwnerPID }),
            window_title: cf_string(&window, unsafe { kCGWindowName })
                .filter(|title| !title.trim().is_empty()),
            window_id: cf_number_u32(&window, unsafe { kCGWindowNumber })
                .map(|window_id| window_id.to_string()),
            x: bounds.map(|bounds| bounds.0),
            y: bounds.map(|bounds| bounds.1),
            width: bounds.map(|bounds| bounds.2),
            height: bounds.map(|bounds| bounds.3),
        });
    }

    Ok(candidates)
}

fn usable_bounds(bounds: Option<(i32, i32, i32, i32)>) -> bool {
    matches!(
        bounds,
        Some((_, _, width, height)) if width >= MIN_WINDOW_WIDTH && height >= MIN_WINDOW_HEIGHT
    )
}

fn cg_window_bounds(window: &CFDictionary<CFType, CFType>) -> Option<(i32, i32, i32, i32)> {
    let bounds = cf_value(window, unsafe { kCGWindowBounds })?;
    let untyped_bounds = bounds.downcast::<CFDictionary>()?;
    let bounds: CFDictionary<CFType, CFType> =
        unsafe { TCFType::wrap_under_get_rule(untyped_bounds.as_concrete_TypeRef()) };

    let x = cf_number_i32_for_name(&bounds, "X")?;
    let y = cf_number_i32_for_name(&bounds, "Y")?;
    let width = cf_number_i32_for_name(&bounds, "Width")?;
    let height = cf_number_i32_for_name(&bounds, "Height")?;
    Some((x, y, width, height))
}

fn cf_number_i32_for_name(dictionary: &CFDictionary<CFType, CFType>, name: &str) -> Option<i32> {
    let key = CFString::new(name);
    dictionary
        .find(&key.as_CFType())
        .and_then(|value| value.downcast::<CFNumber>())
        .and_then(|number| number.to_i32())
}

fn cf_string(dictionary: &CFDictionary<CFType, CFType>, key: CFStringRef) -> Option<String> {
    cf_value(dictionary, key)
        .and_then(|value| value.downcast::<CFString>().map(|text| text.to_string()))
}

fn cf_number_i32(dictionary: &CFDictionary<CFType, CFType>, key: CFStringRef) -> Option<i32> {
    cf_value(dictionary, key)
        .and_then(|value| value.downcast::<CFNumber>())
        .and_then(|number| number.to_i32())
}

fn cf_number_u32(dictionary: &CFDictionary<CFType, CFType>, key: CFStringRef) -> Option<u32> {
    cf_number_i32(dictionary, key).and_then(|value| u32::try_from(value).ok())
}

fn cf_number_f64(dictionary: &CFDictionary<CFType, CFType>, key: CFStringRef) -> Option<f64> {
    cf_value(dictionary, key)
        .and_then(|value| value.downcast::<CFNumber>())
        .and_then(|number| number.to_f64())
}

fn cf_value(dictionary: &CFDictionary<CFType, CFType>, key: CFStringRef) -> Option<CFType> {
    let key = unsafe { CFString::wrap_under_get_rule(key) };
    dictionary.find(&key.as_CFType()).map(|value| value.clone())
}

fn read_frontmost_window_with_system_events() -> Result<FrontmostWindow, String> {
    let script = r#"
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp as text
  set bundleId to ""
  set pidValue to ""
  set windowTitle to ""
  set posX to ""
  set posY to ""
  set winW to ""
  set winH to ""
  try
    set bundleId to bundle identifier of frontApp as text
  end try
  try
    set pidValue to unix id of frontApp as text
  end try
  try
    set frontWindow to front window of frontApp
    set windowTitle to name of frontWindow as text
    set windowPosition to position of frontWindow
    set windowSize to size of frontWindow
    set posX to item 1 of windowPosition as text
    set posY to item 2 of windowPosition as text
    set winW to item 1 of windowSize as text
    set winH to item 2 of windowSize as text
  end try
  return appName & linefeed & bundleId & linefeed & pidValue & linefeed & windowTitle & linefeed & posX & linefeed & posY & linefeed & winW & linefeed & winH
end tell
"#;
    let raw = run_osascript(
        script,
        Duration::from_millis(FRONTMOST_WINDOW_TIMEOUT_MS),
        "frontmost window lookup",
    )?;
    let mut lines = raw.lines();
    let app_name = lines.next().unwrap_or("").trim().to_string();
    if app_name.is_empty() {
        return Err("Unable to identify the frontmost app.".to_string());
    }
    let bundle_id = non_empty(lines.next());
    let process_id = non_empty(lines.next()).and_then(|value| value.parse::<u32>().ok());
    let window_title = non_empty(lines.next());
    let x = non_empty(lines.next()).and_then(|value| value.parse::<i32>().ok());
    let y = non_empty(lines.next()).and_then(|value| value.parse::<i32>().ok());
    let width = non_empty(lines.next()).and_then(|value| value.parse::<i32>().ok());
    let height = non_empty(lines.next()).and_then(|value| value.parse::<i32>().ok());
    Ok(FrontmostWindow {
        app_name,
        bundle_id,
        process_id,
        window_title,
        window_id: None,
        x,
        y,
        width,
        height,
    })
}
