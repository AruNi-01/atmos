//! Click-through border highlight + dynamic status caption under the agent pointer.
//!
//! macOS: compiles a small Swift overlay helper into the Desktop Use data dir and
//! keeps a single long-lived process whose frame is replaced on each show.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::config::desktop_use_dir;
use crate::strings::scrub_vendor;

const HELPER_NAME: &str = "atmos-desktop-highlight";
const PID_FILE: &str = "highlight.pid";
const META_FILE: &str = "highlight.json";
/// Source is embedded next to the crate for `include_str!` at compile time of the helper.
const SWIFT_SOURCE: &str = include_str!("../assets/highlight_overlay.swift");

#[derive(Debug, Clone, Serialize)]
pub struct HighlightTarget {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HighlightResult {
    pub ok: bool,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<HighlightTarget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Optional extras for border + under-arrow caption.
#[derive(Debug, Clone)]
pub struct HighlightStyle {
    pub label: Option<String>,
    /// Logical-point cursor position (top-left) for caption under the arrow.
    pub cursor: Option<(f64, f64)>,
    /// Auto-clear after ms (default from prefs). `None` = use prefs.
    pub idle_ms: Option<u64>,
    /// Blink border (default true).
    pub blink: bool,
    /// Target CGWindowID — border is ordered just above this window so covering
    /// windows also cover the highlight (background-safe).
    pub above_window_id: Option<i64>,
}

impl Default for HighlightStyle {
    fn default() -> Self {
        Self {
            label: None,
            cursor: None,
            idle_ms: None,
            blink: true,
            above_window_id: None,
        }
    }
}

impl HighlightStyle {
    pub fn with_label(label: impl Into<String>) -> Self {
        Self {
            label: Some(label.into()),
            ..Default::default()
        }
    }
}

fn data_paths() -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let dir = desktop_use_dir();
    let bin = dir.join("bin").join(HELPER_NAME);
    let pid = dir.join(PID_FILE);
    let meta = dir.join(META_FILE);
    let src = dir.join("cache").join("highlight_overlay.swift");
    (bin, pid, meta, src)
}

/// Ensure the Swift overlay helper is compiled into `~/.atmos/desktop-use/bin/`.
pub fn ensure_helper() -> Result<PathBuf, String> {
    #[cfg(not(target_os = "macos"))]
    {
        return Err("window/desktop highlight overlay is only supported on macOS".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (bin, _, _, src) = data_paths();
        if let Some(parent) = bin.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Some(parent) = src.parent() {
            let _ = fs::create_dir_all(parent);
        }

        fs::write(&src, SWIFT_SOURCE)
            .map_err(|e| scrub_vendor(&format!("write highlight source failed: {e}")))?;
        let need_compile = !bin.is_file() || source_newer_than_binary(&src, &bin);
        if need_compile {
            let output = Command::new("swiftc")
                .args(["-O", "-o"])
                .arg(&bin)
                .arg(&src)
                .output()
                .map_err(|e| {
                    scrub_vendor(&format!(
                        "swiftc not available to build highlight helper: {e}"
                    ))
                })?;
            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr);
                return Err(scrub_vendor(&format!(
                    "failed to compile desktop highlight helper: {err}"
                )));
            }
        }
        Ok(bin)
    }
}

fn source_newer_than_binary(src: &Path, bin: &Path) -> bool {
    let src_mtime = fs::metadata(src).and_then(|m| m.modified()).ok();
    let bin_mtime = fs::metadata(bin).and_then(|m| m.modified()).ok();
    match (src_mtime, bin_mtime) {
        (Some(s), Some(b)) => s > b,
        _ => true,
    }
}

fn read_pid(pid_path: &Path) -> Option<u32> {
    let text = fs::read_to_string(pid_path).ok()?;
    text.trim().parse().ok()
}

fn process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Clear any active highlight overlay.
pub fn clear_highlight() -> HighlightResult {
    let (_, pid_path, meta_path, _) = data_paths();
    if let Some(pid) = read_pid(&pid_path) {
        if process_alive(pid) {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    let _ = fs::remove_file(&pid_path);
    let _ = fs::remove_file(&meta_path);
    HighlightResult {
        ok: true,
        action: "clear".into(),
        target: None,
        helper_path: None,
        pid: None,
        error: None,
    }
}

fn push_style(args: &mut Vec<String>, style: &HighlightStyle) {
    if let Some(label) = style
        .label
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        args.push("--label".into());
        args.push(label.to_string());
    }
    if let Some((cx, cy)) = style.cursor {
        args.push("--cursor-x".into());
        args.push(format!("{cx}"));
        args.push("--cursor-y".into());
        args.push(format!("{cy}"));
    }
    if let Some(wid) = style.above_window_id {
        if wid > 0 {
            args.push("--above-window-id".into());
            args.push(wid.to_string());
        }
    }
    // Small continuous corner radius similar to modern macOS app windows.
    args.push("--corner-radius".into());
    args.push("10".into());
    let idle = style
        .idle_ms
        .unwrap_or_else(|| crate::prefs::load_prefs().highlight_idle_ms);
    args.push("--idle-ms".into());
    args.push(idle.to_string());
    if style.blink {
        args.push("--blink".into());
    } else {
        args.push("--no-blink".into());
    }
}

/// Whether Settings / prefs allow drawing the operation border.
pub fn operation_border_enabled() -> bool {
    crate::prefs::load_prefs().operation_border_enabled
}

/// Show a border around a logical-point rect (top-left origin).
pub fn show_window_highlight(x: f64, y: f64, width: f64, height: f64) -> HighlightResult {
    show_window_highlight_styled(
        x,
        y,
        width,
        height,
        HighlightStyle {
            blink: true,
            ..Default::default()
        },
    )
}

pub fn show_window_highlight_styled(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    style: HighlightStyle,
) -> HighlightResult {
    if !operation_border_enabled() {
        return HighlightResult {
            ok: true,
            action: "skipped".into(),
            target: None,
            helper_path: None,
            pid: None,
            error: None,
        };
    }
    let mut extra = vec![
        "--x".into(),
        format!("{x}"),
        "--y".into(),
        format!("{y}"),
        "--width".into(),
        format!("{width}"),
        "--height".into(),
        format!("{height}"),
        "--color".into(),
        "3B82F6".into(),
        "--thickness".into(),
        "3".into(),
    ];
    push_style(&mut extra, &style);
    show_with_args(
        "show",
        extra,
        HighlightTarget {
            kind: "window".into(),
            x,
            y,
            width,
            height,
            label: style.label,
        },
    )
}

/// Show a border around the primary display (desktop-scope operations).
pub fn show_desktop_highlight() -> HighlightResult {
    show_desktop_highlight_styled(HighlightStyle {
        blink: true,
        ..Default::default()
    })
}

pub fn show_desktop_highlight_styled(style: HighlightStyle) -> HighlightResult {
    if !operation_border_enabled() {
        return HighlightResult {
            ok: true,
            action: "skipped".into(),
            target: None,
            helper_path: None,
            pid: None,
            error: None,
        };
    }
    let mut extra = vec![
        "--inset".into(),
        "4".into(),
        "--color".into(),
        "22C55E".into(),
        "--thickness".into(),
        "4".into(),
    ];
    push_style(&mut extra, &style);
    show_with_args(
        "desktop",
        extra,
        HighlightTarget {
            kind: "desktop".into(),
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
            label: style.label,
        },
    )
}

/// Caption only — pill under the agent arrow at a screen point.
pub fn show_cursor_caption(x: f64, y: f64, label: &str) -> HighlightResult {
    if !operation_border_enabled() {
        return HighlightResult {
            ok: true,
            action: "skipped".into(),
            target: None,
            helper_path: None,
            pid: None,
            error: None,
        };
    }
    let label = label.trim();
    if label.is_empty() {
        return HighlightResult {
            ok: false,
            action: "show".into(),
            target: None,
            helper_path: None,
            pid: None,
            error: Some("caption label is empty".into()),
        };
    }
    let mut extra = vec![
        "--x".into(),
        format!("{x}"),
        "--y".into(),
        format!("{y}"),
        "--label".into(),
        label.into(),
        "--color".into(),
        "3B82F6".into(),
    ];
    push_style(
        &mut extra,
        &HighlightStyle {
            blink: false,
            ..Default::default()
        },
    );
    show_with_args(
        "caption",
        extra,
        HighlightTarget {
            kind: "caption".into(),
            x,
            y,
            width: 0.0,
            height: 0.0,
            label: Some(label.into()),
        },
    )
}

fn show_with_args(mode: &str, extra: Vec<String>, target: HighlightTarget) -> HighlightResult {
    let _ = clear_highlight();

    let helper = match ensure_helper() {
        Ok(p) => p,
        Err(e) => {
            return HighlightResult {
                ok: false,
                action: "show".into(),
                target: Some(target),
                helper_path: None,
                pid: None,
                error: Some(e),
            };
        }
    };

    let mut cmd = Command::new(&helper);
    cmd.arg(mode);
    for a in &extra {
        cmd.arg(a);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            std::mem::forget(child);
            let (_, pid_path, meta_path, _) = data_paths();
            let _ = fs::write(&pid_path, pid.to_string());
            let meta = serde_json::json!({
                "pid": pid,
                "target": target,
                "updated_at_ms": SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0),
            });
            let _ = fs::write(&meta_path, meta.to_string());
            HighlightResult {
                ok: true,
                action: "show".into(),
                target: Some(target),
                helper_path: Some(helper.display().to_string()),
                pid: Some(pid),
                error: None,
            }
        }
        Err(e) => HighlightResult {
            ok: false,
            action: "show".into(),
            target: Some(target),
            helper_path: Some(helper.display().to_string()),
            pid: None,
            error: Some(scrub_vendor(&format!(
                "failed to start highlight helper: {e}"
            ))),
        },
    }
}

/// Look up window bounds from a list_windows JSON payload.
pub fn bounds_for_window_id(
    list_windows: &serde_json::Value,
    window_id: i64,
) -> Option<(f64, f64, f64, f64)> {
    let windows = list_windows.get("windows")?.as_array()?;
    for w in windows {
        let id = w.get("window_id").and_then(|v| v.as_i64()).or_else(|| {
            w.get("window_id")
                .and_then(|v| v.as_u64())
                .map(|n| n as i64)
        })?;
        if id != window_id {
            continue;
        }
        let b = w.get("bounds")?;
        let x = num(b.get("x")?)?;
        let y = num(b.get("y")?)?;
        let width = num(b.get("width")?)?;
        let height = num(b.get("height")?)?;
        return Some((x, y, width, height));
    }
    None
}

pub fn app_name_for_window_id(list_windows: &serde_json::Value, window_id: i64) -> Option<String> {
    let windows = list_windows.get("windows")?.as_array()?;
    for w in windows {
        let id = w.get("window_id").and_then(|v| v.as_i64()).or_else(|| {
            w.get("window_id")
                .and_then(|v| v.as_u64())
                .map(|n| n as i64)
        })?;
        if id != window_id {
            continue;
        }
        let name = w.get("app_name")?.as_str()?.trim();
        if name.is_empty() {
            return None;
        }
        return Some(name.to_string());
    }
    None
}

pub fn app_name_for_pid(list_windows: &serde_json::Value, pid: i32) -> Option<String> {
    let windows = list_windows.get("windows")?.as_array()?;
    for w in windows {
        let p = w
            .get("pid")
            .and_then(|v| v.as_i64())
            .or_else(|| w.get("pid").and_then(|v| v.as_u64()).map(|n| n as i64))?;
        if p as i32 != pid {
            continue;
        }
        let name = w.get("app_name")?.as_str()?.trim();
        if name.is_empty() {
            continue;
        }
        return Some(name.to_string());
    }
    None
}

fn num(v: &serde_json::Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_i64().map(|n| n as f64))
        .or_else(|| v.as_u64().map(|n| n as f64))
}

/// Resolve agent display name for the under-arrow caption.
///
/// Priority: explicit override → `ATMOS_DESKTOP_USE_AGENT_NAME` → `AGENT_NAME` → `"Agent"`.
pub fn resolve_agent_name(explicit: Option<&str>) -> String {
    if let Some(n) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return n.to_string();
    }
    for key in [
        "ATMOS_DESKTOP_USE_AGENT_NAME",
        "AGENT_NAME",
        "ATMOS_AGENT_NAME",
    ] {
        if let Ok(v) = env::var(key) {
            let t = v.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    "Agent".into()
}

/// Build dynamic status text under the agent arrow.
///
/// Prefer an explicit status; otherwise describe the live action + target app;
/// final fallback: `"{AgentName} Operating"`.
pub fn build_status_label(
    explicit_status: Option<&str>,
    agent_name: Option<&str>,
    action: &str,
    target_app: Option<&str>,
) -> String {
    if let Some(s) = explicit_status.map(str::trim).filter(|s| !s.is_empty()) {
        return s.to_string();
    }
    let agent = resolve_agent_name(agent_name);
    let app = target_app.map(str::trim).filter(|s| !s.is_empty());
    match (action, app) {
        ("click", Some(app)) => format!("Clicking {app}"),
        ("type", Some(app)) => format!("Typing in {app}"),
        ("window_state", Some(app)) => format!("Inspecting {app}"),
        ("screenshot", Some(app)) => format!("Capturing {app}"),
        ("highlight", Some(app)) => format!("{agent} · {app}"),
        (_, Some(app)) => format!("{agent} · {app}"),
        ("click", None) => format!("{agent} clicking"),
        ("type", None) => format!("{agent} typing"),
        _ => format!("{agent} Operating"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bounds_lookup() {
        let v = json!({
            "windows": [
                {"window_id": 1, "bounds": {"x": 10, "y": 20, "width": 100, "height": 50}},
                {"window_id": 2, "bounds": {"x": 0, "y": 0, "width": 800, "height": 600}},
            ]
        });
        assert_eq!(bounds_for_window_id(&v, 2), Some((0.0, 0.0, 800.0, 600.0)));
        assert_eq!(bounds_for_window_id(&v, 99), None);
    }

    #[test]
    fn status_label_dynamic_and_fallback() {
        assert_eq!(
            build_status_label(
                Some("Open dashboard"),
                Some("Claude"),
                "click",
                Some("Orca")
            ),
            "Open dashboard"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "click", Some("Orca")),
            "Clicking Orca"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "type", Some("Notes")),
            "Typing in Notes"
        );
        assert_eq!(
            build_status_label(None, Some("Grok"), "click", None),
            "Grok clicking"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "verify", None),
            "Claude Operating"
        );
    }

    #[test]
    fn resolve_agent_defaults() {
        assert_eq!(resolve_agent_name(Some("  Claude  ")), "Claude");
        assert_eq!(resolve_agent_name(Some("")), "Agent");
    }
}
