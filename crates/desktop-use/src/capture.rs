//! Desktop capture: frontmost window identity + screenshot + light context.
//! Owned by Desktop Use (not Electron AppShot business logic).

use std::path::PathBuf;
use std::process::Command;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

use crate::strings::{scrub_vendor, ERR_CAPTURE_FAILED};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Default)]
pub struct CaptureRequest {
    /// Optional path to write PNG instead of base64.
    pub out_path: Option<PathBuf>,
    /// Include base64 even when out_path is set.
    pub include_base64: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CaptureResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<WindowBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub png_base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub png_path: Option<String>,
    pub context_markdown: String,
    pub quality: String,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CaptureResult {
    pub fn failure(error: impl Into<String>) -> Self {
        let error = scrub_vendor(&error.into());
        Self {
            ok: false,
            app_name: None,
            window_title: None,
            bundle_id: None,
            process_id: None,
            bounds: None,
            png_base64: None,
            png_path: None,
            context_markdown: String::new(),
            quality: "none".into(),
            warnings: vec![],
            error: Some(error),
        }
    }
}

/// Run a desktop capture. On non-macOS returns a structured unsupported error.
pub fn capture(req: CaptureRequest) -> CaptureResult {
    #[cfg(target_os = "macos")]
    {
        capture_macos(req)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = req;
        CaptureResult::failure(ERR_CAPTURE_UNSUPPORTED)
    }
}

#[cfg(target_os = "macos")]
fn capture_macos(req: CaptureRequest) -> CaptureResult {
    let mut warnings = Vec::new();
    let frontmost = match read_frontmost_macos() {
        Ok(f) => f,
        Err(e) => {
            warnings.push(format!("frontmost_identity_failed: {e}"));
            Frontmost {
                app_name: "Unknown".into(),
                window_title: None,
                process_id: None,
                bounds: None,
            }
        }
    };

    if is_self_app(&frontmost.app_name) {
        return CaptureResult {
            ok: false,
            app_name: Some(frontmost.app_name.clone()),
            window_title: frontmost.window_title.clone(),
            bundle_id: None,
            process_id: frontmost.process_id,
            bounds: frontmost.bounds.clone(),
            png_base64: None,
            png_path: None,
            context_markdown: build_context_markdown(&frontmost, &warnings),
            quality: "none".into(),
            warnings: {
                let mut w = warnings;
                w.push(format!(
                    "{} is frontmost; focus another app and capture again.",
                    frontmost.app_name
                ));
                w
            },
            error: Some(format!(
                "{} is frontmost; focus another app and capture again.",
                frontmost.app_name
            )),
        };
    }

    let tmp = std::env::temp_dir().join(format!(
        "atmos-desktop-use-capture-{}.png",
        std::process::id()
    ));
    let out_target = req.out_path.clone().unwrap_or_else(|| tmp.clone());
    let (png_bytes, quality) = match screenshot_macos(&frontmost, &out_target, &mut warnings) {
        Ok((bytes, q)) => (bytes, q),
        Err(e) => {
            return CaptureResult::failure(format!("{ERR_CAPTURE_FAILED}: {e}"));
        }
    };

    let png_base64 = if req.include_base64 || req.out_path.is_none() {
        Some(B64.encode(&png_bytes))
    } else {
        None
    };

    let png_path = req
        .out_path
        .as_ref()
        .map(|p| p.display().to_string())
        .or_else(|| {
            // keep temp path only if we wrote there and caller wants path
            None
        });

    // If out_path set, file is already there; if not, still may have written tmp — copy base64 only.
    if req.out_path.is_none() {
        let _ = std::fs::remove_file(&tmp);
    }

    let context_markdown = build_context_markdown(&frontmost, &warnings);

    CaptureResult {
        ok: true,
        app_name: Some(frontmost.app_name),
        window_title: frontmost.window_title,
        bundle_id: None,
        process_id: frontmost.process_id,
        bounds: frontmost.bounds,
        png_base64,
        png_path,
        context_markdown,
        quality: quality.into(),
        warnings,
        error: None,
    }
}

#[derive(Debug, Clone)]
struct Frontmost {
    app_name: String,
    window_title: Option<String>,
    process_id: Option<i32>,
    bounds: Option<WindowBounds>,
}

fn is_self_app(name: &str) -> bool {
    matches!(
        name,
        "Atmos" | "Atmos Electron" | "Electron" | "Atmos Desktop"
    )
}

fn build_context_markdown(frontmost: &Frontmost, warnings: &[String]) -> String {
    let mut lines = vec![
        format!("# Desktop Use Capture"),
        format!("- App: {}", frontmost.app_name),
    ];
    if let Some(t) = &frontmost.window_title {
        lines.push(format!("- Window: {t}"));
    }
    if let Some(pid) = frontmost.process_id {
        lines.push(format!("- PID: {pid}"));
    }
    if let Some(b) = &frontmost.bounds {
        lines.push(format!(
            "- Bounds: {}x{} at ({}, {})",
            b.width, b.height, b.x, b.y
        ));
    }
    if !warnings.is_empty() {
        lines.push("## Warnings".into());
        for w in warnings {
            lines.push(format!("- {w}"));
        }
    }
    lines.join("\n")
}

#[cfg(target_os = "macos")]
fn read_frontmost_macos() -> Result<Frontmost, String> {
    const SCRIPT: &str = r#"
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  set winX to -1
  set winY to -1
  set winW to -1
  set winH to -1
  set pid to unix id of p
  try
    set w to first window of p
    set winTitle to name of w
    set pos to position of w
    set sz to size of w
    set winX to item 1 of pos as integer
    set winY to item 2 of pos as integer
    set winW to item 1 of sz as integer
    set winH to item 2 of sz as integer
  end try
  return appName & linefeed & winTitle & linefeed & (winX as text) & "," & (winY as text) & "," & (winW as text) & "," & (winH as text) & linefeed & (pid as text)
end tell
"#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(SCRIPT)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    parse_frontmost_stdout(&String::from_utf8_lossy(&output.stdout))
}

/// Parse osascript frontmost stdout (testable without TCC).
fn parse_frontmost_stdout(stdout: &str) -> Result<Frontmost, String> {
    let normalized = stdout.replace('\r', "");
    let lines: Vec<&str> = normalized.lines().collect();
    let app_name = lines
        .first()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Unknown")
        .to_string();
    let window_title = lines
        .get(1)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let bounds = lines.get(2).and_then(|line| {
        let parts: Vec<i32> = line
            .split(',')
            .filter_map(|p| p.trim().parse().ok())
            .collect();
        if parts.len() == 4 && parts[2] > 0 && parts[3] > 0 {
            Some(WindowBounds {
                x: parts[0],
                y: parts[1],
                width: parts[2],
                height: parts[3],
            })
        } else {
            None
        }
    });
    let process_id = lines
        .get(3)
        .and_then(|s| s.trim().parse::<i32>().ok())
        .filter(|&p| p > 0);

    Ok(Frontmost {
        app_name,
        window_title,
        process_id,
        bounds,
    })
}

#[cfg(target_os = "macos")]
fn screenshot_macos(
    frontmost: &Frontmost,
    out: &std::path::Path,
    warnings: &mut Vec<String>,
) -> Result<(Vec<u8>, &'static str), String> {
    let region_ok = frontmost
        .bounds
        .as_ref()
        .map(|b| b.width >= 32 && b.height >= 32)
        .unwrap_or(false);

    if region_ok {
        if let Some(b) = &frontmost.bounds {
            let rect = format!("{},{},{},{}", b.x, b.y, b.width, b.height);
            let status = Command::new("screencapture")
                .args(["-x", "-R", &rect, out.to_str().unwrap_or("/tmp/out.png")])
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() && out.is_file() {
                let bytes = std::fs::read(out).map_err(|e| e.to_string())?;
                if !bytes.is_empty() {
                    return Ok((bytes, "window"));
                }
            }
            warnings.push("window_region_capture_failed_fallback_display".into());
        }
    }

    let status = Command::new("screencapture")
        .args(["-x", out.to_str().unwrap_or("/tmp/out.png")])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() || !out.is_file() {
        return Err("screencapture produced no file".into());
    }
    let bytes = std::fs::read(out).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("screencapture produced empty file".into());
    }
    Ok((bytes, "display_fallback"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strings;

    #[test]
    fn parse_frontmost_sample() {
        let raw = "Safari\nStart Page\n10,20,800,600\n4321\n";
        let f = parse_frontmost_stdout(raw).unwrap();
        assert_eq!(f.app_name, "Safari");
        assert_eq!(f.window_title.as_deref(), Some("Start Page"));
        assert_eq!(f.process_id, Some(4321));
        let b = f.bounds.unwrap();
        assert_eq!(b.width, 800);
        assert_eq!(b.x, 10);
    }

    #[test]
    fn failure_is_vendor_free() {
        let r = CaptureResult::failure("talk to cua please");
        assert!(!r.ok);
        let err = r.error.unwrap();
        assert!(!strings::contains_vendor_brand(&err));
    }

    #[test]
    fn context_markdown_shape() {
        let f = Frontmost {
            app_name: "Notes".into(),
            window_title: Some("Todo".into()),
            process_id: Some(1),
            bounds: Some(WindowBounds {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            }),
        };
        let md = build_context_markdown(&f, &["w1".into()]);
        assert!(md.contains("Desktop Use Capture"));
        assert!(md.contains("Notes"));
        assert!(!strings::contains_vendor_brand(&md));
    }
}
