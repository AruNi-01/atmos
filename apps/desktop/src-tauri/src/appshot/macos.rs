use crate::appshot::types::{
    AppshotPermissionName, AppshotPermissionRecoveryAction, AppshotPermissionState,
    AppshotPlatform, AppshotQuality, AppshotScreenshotMetadata, AppshotSettingsTarget,
    AppshotWindowBounds, CapturedAppshot,
};
use chrono::Utc;
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
use std::fs;
use std::io::Read;
use std::mem;
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const FRONTMOST_WINDOW_TIMEOUT_MS: u64 = 2_500;
const ACCESSIBILITY_TREE_TIMEOUT_MS: u64 = 3_500;
const SCREENSHOT_TIMEOUT_MS: u64 = 2_500;
const PROCESS_POLL_INTERVAL_MS: u64 = 20;
const MIN_WINDOW_WIDTH: i32 = 32;
const MIN_WINDOW_HEIGHT: i32 = 32;
const ACCESSIBILITY_REDACTION_TERMS: &[&str] = &["secure", "Secure", "password", "Password"];
const ACCESSIBILITY_REDACTION_FIELDS: &[&str] =
    &["roleText", "nameText", "descriptionText", "valueText"];

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

struct FrontmostWindow {
    app_name: String,
    bundle_id: Option<String>,
    process_id: Option<u32>,
    window_title: Option<String>,
    window_id: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
}

struct FrontmostApp {
    app_name: String,
    bundle_id: Option<String>,
    process_id: Option<u32>,
}

#[derive(Clone)]
struct WindowCandidate {
    app_name: String,
    process_id: Option<u32>,
    window_title: Option<String>,
    window_id: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
}

pub fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

pub fn screen_recording_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

pub fn permission_states() -> Vec<AppshotPermissionState> {
    vec![
        permission_state(
            AppshotPermissionName::Accessibility,
            "Accessibility",
            accessibility_granted(),
            vec![
                "Read the target app's accessibility tree".to_string(),
                "Detect modifier-only Appshot gestures when required by macOS".to_string(),
            ],
            AppshotSettingsTarget::Accessibility,
            vec![
                "Open System Settings > Privacy & Security > Accessibility.".to_string(),
                "Enable Atmos, then return to Atmos.".to_string(),
            ],
        ),
        permission_state(
            AppshotPermissionName::ScreenRecording,
            "Screen Recording",
            screen_recording_granted(),
            vec!["Capture the focused app window as snapshot.png".to_string()],
            AppshotSettingsTarget::ScreenRecording,
            vec![
                "Open System Settings > Privacy & Security > Screen & System Audio Recording."
                    .to_string(),
                "Enable Atmos, then return to Atmos.".to_string(),
            ],
        ),
    ]
}

pub fn open_settings(target: AppshotSettingsTarget) -> Result<(), String> {
    let url = match target {
        AppshotSettingsTarget::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        AppshotSettingsTarget::ScreenRecording => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        AppshotSettingsTarget::PrivacySecurity => {
            "x-apple.systempreferences:com.apple.preference.security"
        }
    };

    let status = Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| format!("failed to open System Settings: {error}"))?;
    if status.success() {
        return Ok(());
    }

    let fallback = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security")
        .status()
        .map_err(|error| format!("failed to open Privacy & Security settings: {error}"))?;
    if fallback.success() {
        Ok(())
    } else {
        Err("Open System Settings > Privacy & Security manually.".to_string())
    }
}

pub async fn capture_frontmost() -> Result<CapturedAppshot, String> {
    tauri::async_runtime::spawn_blocking(capture_frontmost_blocking)
        .await
        .map_err(|error| format!("appshot capture task failed: {error}"))?
}

pub async fn capture_animation_target() -> Option<AppshotWindowBounds> {
    tauri::async_runtime::spawn_blocking(|| {
        read_frontmost_window_native()
            .ok()
            .filter(|frontmost| frontmost.app_name != "Atmos")
            .and_then(|frontmost| window_bounds(&frontmost))
    })
    .await
    .ok()
    .flatten()
}

fn capture_frontmost_blocking() -> Result<CapturedAppshot, String> {
    let captured_at = Utc::now().to_rfc3339();
    let permissions = permission_states();
    let mut warnings = Vec::new();
    let frontmost = match read_frontmost_window() {
        Ok(info) => info,
        Err(error) => {
            warnings.push(error);
            FrontmostWindow {
                app_name: "Unknown App".to_string(),
                bundle_id: None,
                process_id: None,
                window_title: None,
                window_id: None,
                x: None,
                y: None,
                width: None,
                height: None,
            }
        }
    };

    if frontmost.app_name == "Atmos" {
        warnings
            .push("Atmos is frontmost; focus another app and trigger Appshots again.".to_string());
        let screenshot_png = placeholder_png();
        let context_markdown = build_context_markdown(
            &frontmost,
            &captured_at,
            AppshotQuality::MetadataOnly,
            "No external target was captured.",
            &warnings,
        );
        return Ok(CapturedAppshot {
            app_name: "No external app".to_string(),
            bundle_id: None,
            process_id: None,
            window_title: None,
            window_id: None,
            captured_at,
            platform: AppshotPlatform::Macos,
            quality: AppshotQuality::MetadataOnly,
            screenshot_png,
            screenshot: AppshotScreenshotMetadata {
                available: false,
                width: Some(1),
                height: Some(1),
                media_type: "image/png".to_string(),
            },
            source_bounds: None,
            context_markdown,
            permissions,
            warnings,
        });
    }

    let source_bounds = window_bounds(&frontmost);
    let (screenshot_png, screenshot_available, mut screenshot_warnings) =
        capture_screenshot(&frontmost);
    warnings.append(&mut screenshot_warnings);
    let screenshot_dimensions = png_dimensions(&screenshot_png);
    let accessibility_tree = match read_accessibility_tree() {
        Ok(tree) if !tree.trim().is_empty() => tree,
        Ok(_) => {
            warnings.push("Accessibility tree was empty.".to_string());
            String::new()
        }
        Err(error) => {
            warnings.push(error);
            String::new()
        }
    };

    let has_accessibility = !accessibility_tree.trim().is_empty();
    let quality = match (screenshot_available, has_accessibility) {
        (true, true) => AppshotQuality::ScreenshotAndAccessibility,
        (true, false) => AppshotQuality::ScreenshotOnly,
        (false, true) => AppshotQuality::AccessibilityOnly,
        (false, false) => AppshotQuality::MetadataOnly,
    };
    let context_markdown = build_context_markdown(
        &frontmost,
        &captured_at,
        quality.clone(),
        if has_accessibility {
            accessibility_tree.as_str()
        } else {
            "Accessibility tree unavailable."
        },
        &warnings,
    );

    Ok(CapturedAppshot {
        app_name: frontmost.app_name,
        bundle_id: frontmost.bundle_id,
        process_id: frontmost.process_id,
        window_title: frontmost.window_title,
        window_id: frontmost.window_id,
        captured_at,
        platform: AppshotPlatform::Macos,
        quality,
        screenshot_png,
        screenshot: AppshotScreenshotMetadata {
            available: screenshot_available,
            width: screenshot_dimensions.map(|(width, _)| width),
            height: screenshot_dimensions.map(|(_, height)| height),
            media_type: "image/png".to_string(),
        },
        source_bounds,
        context_markdown,
        permissions,
        warnings,
    })
}

fn window_bounds(frontmost: &FrontmostWindow) -> Option<AppshotWindowBounds> {
    let (Some(x), Some(y), Some(width), Some(height)) =
        (frontmost.x, frontmost.y, frontmost.width, frontmost.height)
    else {
        return None;
    };
    if width <= 0 || height <= 0 {
        return None;
    }
    Some(AppshotWindowBounds {
        x,
        y,
        width: u32::try_from(width).ok()?,
        height: u32::try_from(height).ok()?,
    })
}

fn permission_state(
    name: AppshotPermissionName,
    display_name: &str,
    granted: bool,
    required_for: Vec<String>,
    target: AppshotSettingsTarget,
    manual_steps: Vec<String>,
) -> AppshotPermissionState {
    AppshotPermissionState {
        name,
        display_name: display_name.to_string(),
        granted,
        required_for,
        recovery_action: if granted {
            None
        } else {
            Some(AppshotPermissionRecoveryAction {
                label: "Open System Settings".to_string(),
                target,
                manual_steps,
            })
        },
    }
}

fn read_frontmost_window() -> Result<FrontmostWindow, String> {
    read_frontmost_window_native().or_else(|native_error| {
        read_frontmost_window_with_system_events().map_err(|script_error| {
            format!("{native_error}; System Events fallback failed: {script_error}")
        })
    })
}

fn read_frontmost_window_native() -> Result<FrontmostWindow, String> {
    let front_app = read_frontmost_app();
    let candidates = read_window_candidates()?;
    select_frontmost_window(front_app, candidates)
}

fn select_frontmost_window(
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

fn read_accessibility_tree() -> Result<String, String> {
    if !accessibility_granted() {
        return Err("Accessibility permission is required to read UI structure.".to_string());
    }
    let redaction_condition = accessibility_redaction_condition();
    let script = format!(
        r#"
property nodeCount : 0
property nodeLimit : 420
property depthLimit : 8

on replaceText(findText, replaceTextValue, inputText)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to findText
  set textItems to text items of inputText
  set AppleScript's text item delimiters to replaceTextValue
  set outputText to textItems as text
  set AppleScript's text item delimiters to oldDelimiters
  return outputText
end replaceText

on cleanText(valueText)
  try
    if valueText is missing value then return ""
    set outputText to valueText as text
    set outputText to my replaceText(linefeed, " ", outputText)
    set outputText to my replaceText(return, " ", outputText)
    if length of outputText > 140 then set outputText to text 1 thru 140 of outputText
    return outputText
  on error
    return ""
  end try
end cleanText

on dumpElement(uiElement, depth)
  if depth > depthLimit then return ""
  if nodeCount > nodeLimit then return ""
  set nodeCount to nodeCount + 1
  set indent to ""
  repeat depth times
    set indent to indent & "  "
  end repeat
  set roleText to ""
  set nameText to ""
  set descriptionText to ""
  set valueText to ""
  try
    tell application "System Events" to set roleText to my cleanText(role of uiElement)
  end try
  try
    tell application "System Events" to set nameText to my cleanText(name of uiElement)
  end try
  try
    tell application "System Events" to set descriptionText to my cleanText(description of uiElement)
  end try
  try
    tell application "System Events" to set valueText to my cleanText(value of uiElement)
  end try
  if {redaction_condition} then
    set valueText to "[redacted]"
  end if
  set lineText to indent & "- " & roleText
  if nameText is not "" then set lineText to lineText & " \"" & nameText & "\""
  if valueText is not "" and valueText is not nameText then set lineText to lineText & " = " & valueText
  if descriptionText is not "" and descriptionText is not nameText then set lineText to lineText & " (" & descriptionText & ")"
  set outputText to lineText & linefeed
  try
    tell application "System Events" to set childItems to UI elements of uiElement
    repeat with childItem in childItems
      set outputText to outputText & my dumpElement(childItem, depth + 1)
      if nodeCount > nodeLimit then exit repeat
    end repeat
  end try
  return outputText
end dumpElement

tell application "System Events"
  set frontApp to first application process whose frontmost is true
  try
    return my dumpElement(front window of frontApp, 0)
  on error
    return my dumpElement(frontApp, 0)
  end try
end tell
"#
    );
    let raw = run_osascript(
        &script,
        Duration::from_millis(ACCESSIBILITY_TREE_TIMEOUT_MS),
        "accessibility tree capture",
    )?;
    Ok(truncate_bytes(&raw, 24 * 1024))
}

fn accessibility_redaction_condition() -> String {
    let mut clauses = Vec::new();
    for field in ACCESSIBILITY_REDACTION_FIELDS {
        for term in ACCESSIBILITY_REDACTION_TERMS {
            clauses.push(format!("({field} contains \"{term}\")"));
        }
    }
    clauses.join(" or ")
}

fn capture_screenshot(frontmost: &FrontmostWindow) -> (Vec<u8>, bool, Vec<String>) {
    if !screen_recording_granted() {
        return (
            placeholder_png(),
            false,
            vec!["Screen Recording permission is required for snapshot.png.".to_string()],
        );
    }

    let (x, y, width, height) = match (frontmost.x, frontmost.y, frontmost.width, frontmost.height)
    {
        (Some(x), Some(y), Some(width), Some(height)) if width > 0 && height > 0 => {
            (x, y, width, height)
        }
        _ => {
            return (
                placeholder_png(),
                false,
                vec![
                    "Unable to determine the focused window bounds; skipped screenshot capture."
                        .to_string(),
                ],
            )
        }
    };

    let temp_path = std::env::temp_dir().join(format!(
        "atmos-appshot-{}.png",
        Utc::now().timestamp_millis()
    ));
    let mut command = Command::new("screencapture");
    command.arg("-x");
    command.arg("-R").arg(format!("{x},{y},{width},{height}"));
    command.arg(&temp_path);

    let output = match run_command_output(
        command,
        Duration::from_millis(SCREENSHOT_TIMEOUT_MS),
        "screencapture",
    ) {
        Ok(output) => output,
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            return (placeholder_png(), false, vec![error]);
        }
    };
    if !output.status.success() {
        let _ = fs::remove_file(&temp_path);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return (
            placeholder_png(),
            false,
            vec![if stderr.is_empty() {
                format!("screencapture exited with status {}", output.status)
            } else {
                format!("screencapture failed: {stderr}")
            }],
        );
    }

    let bytes = match fs::read(&temp_path) {
        Ok(bytes) if !bytes.is_empty() => bytes,
        Ok(_) => {
            let _ = fs::remove_file(&temp_path);
            return (
                placeholder_png(),
                false,
                vec!["screencapture produced an empty file.".to_string()],
            );
        }
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            return (
                placeholder_png(),
                false,
                vec![format!("Failed to read screencapture output: {error}")],
            );
        }
    };
    let _ = fs::remove_file(temp_path);
    (bytes, true, Vec::new())
}

fn build_context_markdown(
    frontmost: &FrontmostWindow,
    captured_at: &str,
    quality: AppshotQuality,
    accessibility_tree: &str,
    warnings: &[String],
) -> String {
    let mut out = String::new();
    out.push_str("# Appshot Context\n\n");
    out.push_str(&format!("- App: {}\n", frontmost.app_name));
    if let Some(title) = &frontmost.window_title {
        out.push_str(&format!("- Window: {}\n", title));
    }
    if let Some(bundle_id) = &frontmost.bundle_id {
        out.push_str(&format!("- Bundle ID: {}\n", bundle_id));
    }
    if let Some(process_id) = frontmost.process_id {
        out.push_str(&format!("- Process ID: {}\n", process_id));
    }
    if let Some(window_id) = &frontmost.window_id {
        out.push_str(&format!("- Window ID: {}\n", window_id));
    }
    out.push_str(&format!("- Captured at: {}\n", captured_at));
    out.push_str(&format!("- Quality: {:?}\n\n", quality));
    out.push_str("## Accessibility Tree\n\n");
    out.push_str(accessibility_tree.trim());
    out.push_str("\n\n## Warnings\n\n");
    if warnings.is_empty() {
        out.push_str("- None\n");
    } else {
        for warning in warnings {
            out.push_str("- ");
            out.push_str(warning);
            out.push('\n');
        }
    }
    truncate_bytes(&out, 28 * 1024)
}

fn run_osascript(script: &str, timeout: Duration, label: &str) -> Result<String, String> {
    let mut command = Command::new("osascript");
    command.arg("-e").arg(script);
    let output = run_command_output(command, timeout, label)?;
    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(|text| text.trim_end().to_string())
            .map_err(|error| format!("osascript returned invalid utf8: {error}"));
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("osascript exited with status {}", output.status))
    } else {
        Err(stderr)
    }
}

#[derive(Debug)]
struct CommandOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn run_command_output(
    mut command: Command,
    timeout: Duration,
    label: &str,
) -> Result<CommandOutput, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start {label}: {error}"))?;
    let stdout_reader = spawn_child_pipe_reader(child.stdout.take(), label, "stdout");
    let stderr_reader = spawn_child_pipe_reader(child.stderr.take(), label, "stderr");
    let started_at = Instant::now();

    loop {
        match child
            .try_wait()
            .map_err(|error| format!("failed to wait for {label}: {error}"))?
        {
            Some(status) => {
                let stdout = join_child_pipe_reader(stdout_reader, label, "stdout")?;
                let stderr = join_child_pipe_reader(stderr_reader, label, "stderr")?;
                return Ok(CommandOutput {
                    status,
                    stdout,
                    stderr,
                });
            }
            None if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!(
                    "{label} timed out after {} ms",
                    timeout.as_millis()
                ));
            }
            None => thread::sleep(Duration::from_millis(PROCESS_POLL_INTERVAL_MS)),
        }
    }
}

fn spawn_child_pipe_reader<R>(
    pipe: Option<R>,
    label: &str,
    stream_name: &'static str,
) -> JoinHandle<Result<Vec<u8>, String>>
where
    R: Read + Send + 'static,
{
    let label = label.to_string();
    thread::spawn(move || read_child_pipe(pipe, &label, stream_name))
}

fn join_child_pipe_reader(
    reader: JoinHandle<Result<Vec<u8>, String>>,
    label: &str,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    reader
        .join()
        .map_err(|_| format!("failed to join {label} {stream_name} reader"))?
}

fn read_child_pipe<R: Read>(
    pipe: Option<R>,
    label: &str,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    let Some(mut pipe) = pipe else {
        return Ok(Vec::new());
    };
    let mut bytes = Vec::new();
    pipe.read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read {label} {stream_name}: {error}"))?;
    Ok(bytes)
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIG: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[0..8] != PNG_SIG {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
}

fn truncate_bytes(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut end = 0;
    for (idx, ch) in text.char_indices() {
        if idx + ch.len_utf8() > limit {
            break;
        }
        end = idx + ch.len_utf8();
    }
    format!("{}...", &text[..end])
}

fn placeholder_png() -> Vec<u8> {
    vec![
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0,
        5, 254, 2, 254, 167, 69, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        accessibility_redaction_condition, run_command_output, select_frontmost_window,
        truncate_bytes, FrontmostApp, WindowCandidate,
    };
    use std::process::Command;
    use std::time::Duration;

    #[test]
    fn command_runner_times_out_hung_process() {
        let mut command = Command::new("sh");
        command.arg("-c").arg("sleep 2");

        let error = run_command_output(command, Duration::from_millis(50), "test command")
            .expect_err("command should time out");

        assert!(error.contains("test command timed out after"));
    }

    #[test]
    fn command_runner_returns_stdout_and_stderr() {
        let mut command = Command::new("sh");
        command.arg("-c").arg("printf 'hello'; printf 'warn' >&2");

        let output = run_command_output(command, Duration::from_secs(1), "test command")
            .expect("command output");

        assert!(output.status.success());
        assert_eq!(output.stdout, b"hello");
        assert_eq!(output.stderr, b"warn");
    }

    #[test]
    fn truncate_bytes_keeps_utf8_boundary() {
        assert_eq!(truncate_bytes("hello", 20), "hello");
        assert_eq!(truncate_bytes("你好世界", 7), "你好...");
    }

    #[test]
    fn accessibility_redaction_condition_covers_secure_fields_before_values() {
        let condition = accessibility_redaction_condition();

        assert!(condition.contains("(roleText contains \"secure\")"));
        assert!(condition.contains("(roleText contains \"password\")"));
        assert!(condition.contains("(nameText contains \"password\")"));
        assert!(condition.contains("(descriptionText contains \"password\")"));
        assert!(condition.contains("(valueText contains \"password\")"));
        assert!(condition.contains(") or ("));
    }

    #[test]
    fn native_frontmost_selection_uses_pid_matched_window_bounds() {
        let selected = select_frontmost_window(
            Some(frontmost_app("Cursor", Some(42))),
            vec![
                window_candidate("Atmos", Some(7), Some((0, 0, 300, 200))),
                window_candidate("Cursor", Some(42), Some((10, 20, 1200, 800))),
            ],
        )
        .expect("selected window");

        assert_eq!(selected.app_name, "Cursor");
        assert_eq!(selected.process_id, Some(42));
        assert_eq!(selected.window_title.as_deref(), Some("Cursor Window"));
        assert_eq!(selected.window_id.as_deref(), Some("9001"));
        assert_eq!(selected.x, Some(10));
        assert_eq!(selected.y, Some(20));
        assert_eq!(selected.width, Some(1200));
        assert_eq!(selected.height, Some(800));
    }

    #[test]
    fn native_frontmost_selection_falls_back_to_visible_non_atmos_window() {
        let selected = select_frontmost_window(
            None,
            vec![
                window_candidate("Atmos", Some(7), Some((0, 0, 300, 200))),
                window_candidate("WeChat", Some(88), Some((30, 40, 900, 700))),
            ],
        )
        .expect("selected window");

        assert_eq!(selected.app_name, "WeChat");
        assert_eq!(selected.process_id, Some(88));
        assert_eq!(selected.x, Some(30));
        assert_eq!(selected.width, Some(900));
    }

    #[test]
    fn native_frontmost_selection_uses_name_match_when_pid_differs() {
        let selected = select_frontmost_window(
            Some(frontmost_app("Electron App", Some(100))),
            vec![window_candidate(
                "Electron App",
                Some(101),
                Some((50, 60, 1000, 700)),
            )],
        )
        .expect("selected window");

        assert_eq!(selected.app_name, "Electron App");
        assert_eq!(selected.process_id, Some(100));
        assert_eq!(selected.x, Some(50));
        assert_eq!(selected.height, Some(700));
    }

    #[test]
    fn native_frontmost_selection_keeps_app_identity_without_window() {
        let selected = select_frontmost_window(Some(frontmost_app("Safari", Some(55))), Vec::new())
            .expect("selected app");

        assert_eq!(selected.app_name, "Safari");
        assert_eq!(selected.process_id, Some(55));
        assert_eq!(selected.window_title, None);
        assert_eq!(selected.width, None);
    }

    fn frontmost_app(name: &str, process_id: Option<u32>) -> FrontmostApp {
        FrontmostApp {
            app_name: name.to_string(),
            bundle_id: Some(format!("test.{name}")),
            process_id,
        }
    }

    fn window_candidate(
        app_name: &str,
        process_id: Option<u32>,
        bounds: Option<(i32, i32, i32, i32)>,
    ) -> WindowCandidate {
        WindowCandidate {
            app_name: app_name.to_string(),
            process_id,
            window_title: Some(format!("{app_name} Window")),
            window_id: Some("9001".to_string()),
            x: bounds.map(|bounds| bounds.0),
            y: bounds.map(|bounds| bounds.1),
            width: bounds.map(|bounds| bounds.2),
            height: bounds.map(|bounds| bounds.3),
        }
    }
}
