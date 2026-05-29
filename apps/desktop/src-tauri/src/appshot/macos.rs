#[path = "macos/frontmost.rs"]
mod frontmost;
#[path = "macos/model.rs"]
mod model;
#[path = "macos/permissions.rs"]
mod permissions;
#[path = "macos/process.rs"]
mod process;

use crate::appshot::types::{
    AppshotPermissionState, AppshotPlatform, AppshotQuality, AppshotScreenshotMetadata,
    AppshotSettingsTarget, AppshotWindowBounds, CapturedAppshot,
};
use chrono::Utc;
use std::fs;
use std::process::Command;
use std::time::Duration;

const ACCESSIBILITY_TREE_TIMEOUT_MS: u64 = 6_000;
const ACCESSIBILITY_TREE_NODE_LIMIT: u16 = 180;
const ACCESSIBILITY_TREE_DEPTH_LIMIT: u8 = 5;
const ACCESSIBILITY_TREE_CHILD_LIMIT: u8 = 24;
const SCREENSHOT_TIMEOUT_MS: u64 = 2_500;
const ACCESSIBILITY_REDACTION_TERMS: &[&str] = &["secure", "Secure", "password", "Password"];
const ACCESSIBILITY_REDACTION_FIELDS: &[&str] =
    &["roleText", "nameText", "descriptionText", "valueText"];
use frontmost::{read_frontmost_window, read_frontmost_window_native};
use model::{window_bounds, FrontmostWindow};
use permissions::{accessibility_granted, screen_recording_granted};
use process::{run_command_output, run_osascript, truncate_bytes};

pub fn permission_states() -> Vec<AppshotPermissionState> {
    permissions::permission_states()
}

pub fn open_settings(target: AppshotSettingsTarget) -> Result<(), String> {
    permissions::open_settings(target)
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

fn read_accessibility_tree() -> Result<String, String> {
    if !accessibility_granted() {
        return Err("Accessibility permission is required to read UI structure.".to_string());
    }
    let redaction_condition = accessibility_redaction_condition();
    let script = format!(
        r#"
property nodeCount : 0
property nodeLimit : {ACCESSIBILITY_TREE_NODE_LIMIT}
property depthLimit : {ACCESSIBILITY_TREE_DEPTH_LIMIT}
property childLimit : {ACCESSIBILITY_TREE_CHILD_LIMIT}

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
    set childCount to 0
    repeat with childItem in childItems
      set childCount to childCount + 1
      if childCount > childLimit then exit repeat
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

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIG: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[0..8] != PNG_SIG {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
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
    use super::frontmost::select_frontmost_window;
    use super::model::{FrontmostApp, WindowCandidate};
    use super::{
        accessibility_redaction_condition, process::run_command_output, process::truncate_bytes,
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
