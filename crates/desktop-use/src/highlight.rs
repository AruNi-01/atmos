//! Click-through border highlight + dynamic status caption under the agent pointer.
//!
//! macOS: installs a **prebuilt** Swift overlay helper into the Desktop Use data dir
//! and keeps a single long-lived process whose frame is replaced on each show.
//! Production never requires `swiftc`. Maintainers rebuild the prebuilt under
//! `native/highlight/` (see that folder's README). Set
//! `ATMOS_DESKTOP_USE_BUILD_HELPERS=1` to compile from source for local iteration.

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
const STAMP_FILE: &str = "highlight.prebuilt.sha256";

/// Universal prebuilt helper (arm64 + x86_64). Shipped with the crate so users
/// do not need Xcode / swiftc.
#[cfg(target_os = "macos")]
const PREBUILT_HIGHLIGHT: &[u8] =
    include_bytes!("../native/highlight/prebuilt/atmos-desktop-highlight");

/// Source for optional local rebuild (`ATMOS_DESKTOP_USE_BUILD_HELPERS=1`).
#[cfg(target_os = "macos")]
const SWIFT_SOURCE: &str = include_str!("../native/highlight/highlight_overlay.swift");

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
    /// Border/caption fill as 6-digit hex (no `#`). When `None`, derived from
    /// [`session_id`] via the engine session-cursor palette.
    pub color_hex: Option<String>,
    /// Drive session id used to match the agent cursor color when `color_hex`
    /// is not set. Defaults to [`crate::control::DEFAULT_DRIVE_SESSION`].
    pub session_id: Option<String>,
}

impl Default for HighlightStyle {
    fn default() -> Self {
        Self {
            label: None,
            cursor: None,
            idle_ms: None,
            blink: true,
            above_window_id: None,
            color_hex: None,
            session_id: None,
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

fn data_paths() -> (PathBuf, PathBuf, PathBuf, PathBuf, PathBuf) {
    let dir = desktop_use_dir();
    let bin = dir.join("bin").join(HELPER_NAME);
    let pid = dir.join(PID_FILE);
    let meta = dir.join(META_FILE);
    let src = dir.join("cache").join("highlight_overlay.swift");
    let stamp = dir.join("cache").join(STAMP_FILE);
    (bin, pid, meta, src, stamp)
}

#[cfg(target_os = "macos")]
fn prefer_build_from_source() -> bool {
    matches!(
        env::var("ATMOS_DESKTOP_USE_BUILD_HELPERS")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .ok(),
        Some(true)
    )
}

#[cfg(target_os = "macos")]
fn prebuilt_sha256_hex() -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(PREBUILT_HIGHLIGHT);
    hex::encode(hasher.finalize())
}

/// Ensure the overlay helper binary is present under `~/.atmos/desktop-use/bin/`.
///
/// Default: install the crate-shipped prebuilt (no `swiftc`).
/// Dev: `ATMOS_DESKTOP_USE_BUILD_HELPERS=1` recompiles from embedded Swift source.
pub fn ensure_helper() -> Result<PathBuf, String> {
    #[cfg(not(target_os = "macos"))]
    {
        Err("window/desktop highlight overlay is only supported on macOS".into())
    }
    #[cfg(target_os = "macos")]
    {
        let (bin, _, _, src, stamp) = data_paths();
        if let Some(parent) = bin.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Some(parent) = src.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if prefer_build_from_source() {
            return compile_helper_from_source(&bin, &src);
        }

        install_prebuilt_helper(&bin, &stamp)?;
        Ok(bin)
    }
}

#[cfg(target_os = "macos")]
fn install_prebuilt_helper(bin: &Path, stamp: &Path) -> Result<(), String> {
    let expected = prebuilt_sha256_hex();
    let stamp_ok = fs::read_to_string(stamp)
        .ok()
        .map(|s| s.trim() == expected)
        .unwrap_or(false);
    let bin_ok = bin.is_file() && stamp_ok;
    if bin_ok {
        return Ok(());
    }

    fs::write(bin, PREBUILT_HIGHLIGHT)
        .map_err(|e| scrub_vendor(&format!("install prebuilt highlight helper failed: {e}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(bin, fs::Permissions::from_mode(0o755));
    }
    fs::write(stamp, format!("{expected}\n"))
        .map_err(|e| scrub_vendor(&format!("write highlight stamp failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn compile_helper_from_source(bin: &Path, src: &Path) -> Result<PathBuf, String> {
    fs::write(src, SWIFT_SOURCE)
        .map_err(|e| scrub_vendor(&format!("write highlight source failed: {e}")))?;
    let output = Command::new("swiftc")
        .args(["-O", "-o"])
        .arg(bin)
        .arg(src)
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
    Ok(bin.to_path_buf())
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
    let (_, pid_path, meta_path, _, _) = data_paths();
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

/// Anonymous / `default` session fill — original Cua blue (engine theme default).
const DEFAULT_CURSOR_FILL: [u8; 3] = [94, 192, 232];

/// Multi-session palette used by the control engine cursor overlay.
///
/// Mirrors `cursor-overlay::theme::SESSION_CURSOR_FILLS` so the operation border
/// matches the agent pointer for the same session id. When several sessions are
/// active, each maps to one entry; we only need the color for the current drive
/// session (one at a time is enough).
const SESSION_CURSOR_FILLS: &[[u8; 3]] = &[
    [178, 132, 255],
    [247, 132, 170],
    [96, 218, 174],
    [244, 178, 66],
    [76, 204, 224],
    [221, 113, 236],
    [232, 82, 98],
    [184, 220, 54],
    [80, 126, 236],
];

fn stable_session_index(id: &str, count: usize) -> usize {
    if count == 0 {
        return 0;
    }
    let suffix = id
        .rfind(['-', '_', '.'])
        .map(|index| &id[index + 1..])
        .unwrap_or(id);
    if let Ok(number) = suffix.parse::<usize>() {
        if number > 0 {
            return (number - 1) % count;
        }
    }
    if suffix.len() == 1 {
        if let Some(character) = suffix.chars().next() {
            if character.is_ascii_alphabetic() {
                return (character.to_ascii_lowercase() as usize - b'a' as usize) % count;
            }
        }
    }

    // FNV-1a 32-bit over the full session id (engine-stable).
    let mut hash: u32 = 2_166_136_261;
    for character in id.chars() {
        hash ^= character as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    hash as usize % count
}

/// RGB fill for one session-owned agent cursor (no alpha).
///
/// Empty / `"default"` → engine default blue; otherwise palette-index from a
/// stable hash of the session id (same rules as the control engine).
pub fn session_cursor_fill_rgb(session_id: &str) -> [u8; 3] {
    if session_id.is_empty() || session_id == "default" {
        return DEFAULT_CURSOR_FILL;
    }
    SESSION_CURSOR_FILLS[stable_session_index(session_id, SESSION_CURSOR_FILLS.len())]
}

/// 6-digit uppercase hex (no `#`) for overlay `--color`.
pub fn session_cursor_fill_hex(session_id: &str) -> String {
    let [r, g, b] = session_cursor_fill_rgb(session_id);
    format!("{r:02X}{g:02X}{b:02X}")
}

fn resolve_color_hex(style: &HighlightStyle) -> String {
    if let Some(c) = style
        .color_hex
        .as_ref()
        .map(|s| s.trim().trim_start_matches('#'))
        .filter(|s| !s.is_empty())
    {
        return c.to_ascii_uppercase();
    }
    let sid = style
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(crate::control::DEFAULT_DRIVE_SESSION);
    session_cursor_fill_hex(sid)
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
    let color = resolve_color_hex(&style);
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
        color,
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
    let color = resolve_color_hex(&style);
    let mut extra = vec![
        "--inset".into(),
        "4".into(),
        "--color".into(),
        color,
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
    let style = HighlightStyle {
        blink: false,
        ..Default::default()
    };
    let color = resolve_color_hex(&style);
    let mut extra = vec![
        "--x".into(),
        format!("{x}"),
        "--y".into(),
        format!("{y}"),
        "--label".into(),
        label.into(),
        "--color".into(),
        color,
    ];
    push_style(&mut extra, &style);
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
        Ok(mut child) => {
            let pid = child.id();
            // Reap the child on a background thread so we do not leave zombies
            // when the overlay exits on idle / SIGTERM (do not mem::forget).
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            let (_, pid_path, meta_path, _, _) = data_paths();
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

/// Resolve owning pid for a CGWindowID from a list_windows payload.
pub fn pid_for_window_id(list_windows: &serde_json::Value, window_id: i64) -> Option<i32> {
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
        return w
            .get("pid")
            .and_then(|v| v.as_i64())
            .or_else(|| w.get("pid").and_then(|v| v.as_u64()).map(|n| n as i64))
            .map(|n| n as i32);
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

/// Build under-arrow status text as `{Agent} - {operation}`.
///
/// Prefer an explicit `--status` as the operation; otherwise describe the live
/// action + target app; final fallback operation: `Operating`.
///
/// If the explicit status already starts with `{Agent} - `, it is returned as-is
/// (agents may pass a fully formatted string).
pub fn build_status_label(
    explicit_status: Option<&str>,
    agent_name: Option<&str>,
    action: &str,
    target_app: Option<&str>,
) -> String {
    let agent = resolve_agent_name(agent_name);
    let operation = if let Some(s) = explicit_status.map(str::trim).filter(|s| !s.is_empty()) {
        // Already fully formatted by the agent.
        let prefix_dash = format!("{agent} - ");
        let prefix_dot = format!("{agent} · ");
        if s.starts_with(&prefix_dash) || s.starts_with(&prefix_dot) {
            return s.to_string();
        }
        s.to_string()
    } else {
        let app = target_app.map(str::trim).filter(|s| !s.is_empty());
        match (action, app) {
            ("click", Some(app)) => format!("Clicking {app}"),
            ("type", Some(app)) => format!("Typing in {app}"),
            ("double_click", Some(app)) => format!("Double-clicking {app}"),
            ("right_click", Some(app)) => format!("Right-clicking {app}"),
            ("window_state", Some(app)) => format!("Inspecting {app}"),
            ("screenshot", Some(app)) => format!("Capturing {app}"),
            ("highlight", Some(app)) => app.to_string(),
            (_, Some(app)) => format!("Operating {app}"),
            ("click", None) => "Clicking".into(),
            ("type", None) => "Typing".into(),
            ("double_click", None) => "Double-clicking".into(),
            ("right_click", None) => "Right-clicking".into(),
            _ => "Operating".into(),
        }
    };
    format!("{agent} - {operation}")
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
            "Claude - Open dashboard"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "click", Some("Orca")),
            "Claude - Clicking Orca"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "type", Some("Notes")),
            "Claude - Typing in Notes"
        );
        assert_eq!(
            build_status_label(None, Some("Grok"), "click", None),
            "Grok - Clicking"
        );
        assert_eq!(
            build_status_label(None, Some("Claude"), "verify", None),
            "Claude - Operating"
        );
        // Already formatted — do not double-prefix.
        assert_eq!(
            build_status_label(
                Some("Claude - Opening QQ Music"),
                Some("Claude"),
                "click",
                None
            ),
            "Claude - Opening QQ Music"
        );
    }

    #[test]
    fn resolve_agent_defaults() {
        assert_eq!(resolve_agent_name(Some("  Claude  ")), "Claude");
        // Explicit empty falls through to env / default — isolate from developer env.
        let keys = [
            "ATMOS_DESKTOP_USE_AGENT_NAME",
            "AGENT_NAME",
            "ATMOS_AGENT_NAME",
        ];
        let saved: Vec<(String, Option<String>)> = keys
            .iter()
            .map(|k| ((*k).to_string(), std::env::var(k).ok()))
            .collect();
        for k in &keys {
            // SAFETY: test-only; single-threaded unit test process.
            unsafe { std::env::remove_var(k) };
        }
        assert_eq!(resolve_agent_name(Some("")), "Agent");
        assert_eq!(resolve_agent_name(None), "Agent");
        for (k, v) in saved {
            match v {
                Some(val) => unsafe { std::env::set_var(&k, val) },
                None => unsafe { std::env::remove_var(&k) },
            }
        }
    }

    #[test]
    fn pid_for_window_id_reads_list_windows() {
        let list = serde_json::json!({
            "windows": [
                { "window_id": 10, "pid": 111, "bounds": { "x": 0, "y": 0, "width": 10, "height": 10 } },
                { "window_id": 22, "pid": 36904, "bounds": { "x": 1, "y": 2, "width": 3, "height": 4 } }
            ]
        });
        assert_eq!(pid_for_window_id(&list, 22), Some(36904));
        assert_eq!(pid_for_window_id(&list, 99), None);
        assert_eq!(bounds_for_window_id(&list, 22), Some((1.0, 2.0, 3.0, 4.0)));
    }

    #[test]
    fn session_cursor_fill_matches_engine_palette() {
        // Mirrors cursor-overlay::theme::session_fill_hex fixtures.
        assert_eq!(session_cursor_fill_hex("default"), "5EC0E8");
        assert_eq!(session_cursor_fill_hex(""), "5EC0E8");
        assert_eq!(
            session_cursor_fill_rgb("agent-1"),
            session_cursor_fill_rgb("agent-1")
        );
        assert_ne!(
            session_cursor_fill_rgb("agent-1"),
            session_cursor_fill_rgb("agent-2")
        );
        assert_ne!(
            session_cursor_fill_rgb("agent-2"),
            session_cursor_fill_rgb("default")
        );
        // Default drive session lands on palette index 7 → lime.
        assert_eq!(session_cursor_fill_hex("atmos-desktop-use"), "B8DC36");
        // Numeric suffix shortcut: agent-1 → index 0.
        assert_eq!(session_cursor_fill_hex("agent-1"), "B284FF");
        assert_eq!(session_cursor_fill_hex("agent-2"), "F784AA");
    }

    #[test]
    fn resolve_color_prefers_explicit_hex() {
        let style = HighlightStyle {
            color_hex: Some("#aabbcc".into()),
            session_id: Some("agent-1".into()),
            ..Default::default()
        };
        assert_eq!(resolve_color_hex(&style), "AABBCC");
    }
}
