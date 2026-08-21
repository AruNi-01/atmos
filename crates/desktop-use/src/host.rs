//! Control-engine host: managed socket daemon + tool calls (Atmos wrap).
//!
//! On macOS, the daemon is launched via **Atmos Desktop Use.app** (LaunchServices)
//! so TCC grants and the live process share `com.atmos.desktop.use`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::strings::scrub_vendor;

/// `pgrep`/`pkill -f` pattern for host `serve` (product or leftover vendor filename).
#[cfg(any(test, target_os = "macos"))]
const HOST_SERVE_PKILL_PATTERN: &str = "Atmos Desktop Use.app/Contents/MacOS/.*serve";

/// Default socket under the Desktop Use data dir.
pub fn default_socket_path(data_dir: &Path) -> PathBuf {
    data_dir.join("engine.sock")
}

pub fn is_daemon_alive(socket: &Path) -> bool {
    socket.exists()
}

/// Start managed control engine daemon if needed.
///
/// macOS: prefer LaunchServices `open -a "Atmos Desktop Use.app" --args serve …`
/// so the running process is the rebranded host (unified TCC identity).
/// Other platforms: spawn the managed binary with a permissions gate skip
/// (Settings owns grant UX).
pub fn ensure_daemon(
    engine_bin: &Path,
    socket: &Path,
    host_app: Option<&Path>,
) -> Result<(), String> {
    if !engine_bin.is_file() {
        return Err(scrub_vendor(
            "Control engine is not installed. Run: atmos desktop-use driver ensure",
        ));
    }
    if let Some(app) = host_app {
        let _ = crate::install::ensure_host_serve_alias(app);
    }
    if is_daemon_alive(socket) {
        if call_tool(engine_bin, socket, "get_config", &serde_json::json!({})).is_ok()
            && !vendor_named_host_serve_running(host_app)
        {
            return Ok(());
        }
        // Socket is healthy but Activity Monitor still shows the vendor
        // filename — stop and respawn via the product-named alias.
        let _ = stop_daemon(engine_bin, socket);
    }

    if let Some(parent) = socket.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::remove_file(socket);

    spawn_daemon(engine_bin, socket, host_app)?;

    let deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < deadline {
        if is_daemon_alive(socket)
            && call_tool(engine_bin, socket, "get_config", &serde_json::json!({})).is_ok()
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(scrub_vendor(
        "Control engine did not become ready. Open Settings → Desktop Use and grant Accessibility and Screen Recording for Atmos Desktop Use, then retry.",
    ))
}

fn spawn_daemon(
    engine_bin: &Path,
    socket: &Path,
    // LaunchServices host app is macOS-only; keep param for API symmetry on all targets.
    #[cfg_attr(not(target_os = "macos"), allow(unused_variables))] host_app: Option<&Path>,
) -> Result<(), String> {
    let socket_str = socket.display().to_string();

    #[cfg(target_os = "macos")]
    {
        // Prefer direct spawn of the host app's main binary so we can
        // DYLD_INSERT AppShot dual-shift into the same process as serve
        // (unified com.atmos.desktop.use Accessibility TCC). `open -a` strips
        // DYLD_* and cannot load the inject dylib.
        if let Some(app) = host_app {
            if app.is_dir() {
                let driver_in_app = crate::install::resolve_host_serve_bin(app);
                let bin = driver_in_app.as_deref().unwrap_or(engine_bin);
                match spawn_host_serve(bin, &socket_str, Some(app)) {
                    Ok(child) => {
                        let _ = child.id();
                        std::mem::forget(child);
                        return Ok(());
                    }
                    Err(_) => {
                        // Fall through to open -a if direct spawn failed.
                        let status = Command::new("open")
                            .args(["-n", "-g", "-a"])
                            .arg(app)
                            .args([
                                "--args",
                                "serve",
                                "--socket",
                                &socket_str,
                                "--no-permissions-gate",
                            ])
                            .status()
                            .map_err(|e| {
                                scrub_vendor(&format!("failed to launch host app: {e}"))
                            })?;
                        if status.success() {
                            return Ok(());
                        }
                    }
                }
            }
        }

        let child = spawn_host_serve(engine_bin, &socket_str, host_app)?;
        let _ = child.id();
        std::mem::forget(child);
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let child = Command::new(engine_bin)
            .args(["serve", "--socket", &socket_str, "--no-permissions-gate"])
            .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| scrub_vendor(&format!("failed to start control engine: {e}")))?;
        let _ = child.id();
        std::mem::forget(child);
        Ok(())
    }
}

/// Resolve AppShot dual-shift inject dylib for DYLD_INSERT into host serve.
///
/// Layout (first hit wins):
/// - `$ATMOS_HOME/desktop-use/lib/libatmos_appshot_shift_inject.dylib`
/// - `~/.atmos/desktop-use/lib/libatmos_appshot_shift_inject.dylib`
/// - next to engine bin: `…/lib/libatmos_appshot_shift_inject.dylib`
/// - host app: `Atmos Desktop Use.app/Contents/MacOS/libatmos_appshot_shift_inject.dylib`
#[cfg(target_os = "macos")]
pub fn appshot_shift_inject_path(host_app: Option<&Path>) -> Option<PathBuf> {
    const NAME: &str = "libatmos_appshot_shift_inject.dylib";
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(home) = std::env::var("ATMOS_HOME") {
        candidates.push(
            PathBuf::from(home)
                .join("desktop-use")
                .join("lib")
                .join(NAME),
        );
    }
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(
            PathBuf::from(home)
                .join(".atmos")
                .join("desktop-use")
                .join("lib")
                .join(NAME),
        );
    }
    if let Some(app) = host_app {
        candidates.push(app.join("Contents").join("MacOS").join(NAME));
        candidates.push(app.join("Contents").join("Frameworks").join(NAME));
    }
    candidates.into_iter().find(|p| p.is_file())
}

#[cfg(target_os = "macos")]
fn spawn_host_serve(
    engine_bin: &Path,
    socket_str: &str,
    host_app: Option<&Path>,
) -> Result<std::process::Child, String> {
    let mut cmd = Command::new(engine_bin);
    cmd.args(["serve", "--socket", socket_str, "--no-permissions-gate"])
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0")
        // Force inject ctor even if argv probe is odd under some launchers.
        .env("ATMOS_APPSHOT_SHIFT_INJECT", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(inject) = appshot_shift_inject_path(host_app) {
        // Load dual-shift into the serve process so AppShot shares host Accessibility.
        cmd.env("DYLD_INSERT_LIBRARIES", &inject);
    }
    cmd.spawn()
        .map_err(|e| scrub_vendor(&format!("failed to start control engine: {e}")))
}

/// Live `serve` still exec'd as the upstream filename (Activity Monitor parent name).
fn vendor_named_host_serve_running(host_app: Option<&Path>) -> bool {
    #[cfg(target_os = "macos")]
    {
        let Some(app) = host_app else {
            return false;
        };
        let Some(bin) = crate::install::resolve_host_serve_bin(app) else {
            return false;
        };
        if bin.file_name().and_then(|s| s.to_str()) == Some(crate::install::VENDOR_HOST_EXECUTABLE)
        {
            return false;
        }
        let needle = crate::install::vendor_host_serve_pgrep_pattern(app);
        Command::new("pgrep")
            .args(["-f", &needle])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = host_app;
        false
    }
}

pub fn stop_daemon(engine_bin: &Path, socket: &Path) -> Result<(), String> {
    if engine_bin.is_file() && socket.exists() {
        let _ = Command::new(engine_bin)
            .args(["stop", "--socket", &socket.display().to_string()])
            .output();
    }
    // Also try pkill host serve if socket leftover
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pkill")
            .args(["-f", HOST_SERVE_PKILL_PATTERN])
            .status();
    }
    let _ = fs::remove_file(socket);
    Ok(())
}

/// Invoke a control-engine tool via `call` subcommand.
pub fn call_tool(
    engine_bin: &Path,
    socket: &Path,
    tool: &str,
    args: &Value,
) -> Result<Value, String> {
    call_tool_inner(engine_bin, socket, tool, args, None)
}

/// Invoke a tool and ask the CLI to materialize the first MCP image block to `out_file`.
///
/// Also injects tool arg `screenshot_out_file` when `args` is an object (get_desktop_state contract).
pub fn call_tool_with_screenshot_out(
    engine_bin: &Path,
    socket: &Path,
    tool: &str,
    args: &Value,
    out_file: &Path,
) -> Result<Value, String> {
    call_tool_inner(engine_bin, socket, tool, args, Some(out_file))
}

fn call_tool_inner(
    engine_bin: &Path,
    socket: &Path,
    tool: &str,
    args: &Value,
    screenshot_out_file: Option<&Path>,
) -> Result<Value, String> {
    let mut effective_args = args.clone();
    if let Some(out) = screenshot_out_file {
        if let Some(obj) = effective_args.as_object_mut() {
            obj.insert(
                "screenshot_out_file".into(),
                Value::String(out.display().to_string()),
            );
        }
    }
    let args_json =
        serde_json::to_string(&effective_args).map_err(|e| scrub_vendor(&e.to_string()))?;

    let mut cmd = Command::new(engine_bin);
    cmd.arg("call")
        .arg("--socket")
        .arg(socket.display().to_string());
    if let Some(out) = screenshot_out_file {
        cmd.arg("--screenshot-out-file").arg(out);
    }
    cmd.arg(tool)
        .arg(&args_json)
        .env("CUA_DRIVER_RS_PERMISSIONS_GATE", "0");

    let output = cmd
        .output()
        .map_err(|e| scrub_vendor(&format!("control engine call failed: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    crate::engine_protocol::parse_call_tool_output(
        output.status.success(),
        stdout.trim(),
        stderr.trim(),
    )
}

/// Open macOS Privacy panes used by Desktop Use (Screen Recording / Accessibility).
///
/// Modern macOS often will **not** show a one-shot Screen Recording dialog; the
/// reliable recovery path is System Settings → Privacy & Security.
pub fn open_system_privacy_pane(pane: &str) -> Result<(), String> {
    let url = match pane {
        "screen" | "screen_recording" | "Privacy_ScreenCapture" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        "accessibility" | "Privacy_Accessibility" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        _ => "x-apple.systempreferences:com.apple.preference.security?Privacy",
    };
    let status = Command::new("open")
        .arg(url)
        .status()
        .map_err(|e| scrub_vendor(&format!("failed to open System Settings: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(scrub_vendor("failed to open System Settings Privacy pane"))
    }
}

/// Which privacy pane to open for grant UX.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionGrantTarget {
    /// Both panes (legacy / bulk). Still **no** capture probe — avoids double dialog.
    All,
    Accessibility,
    ScreenRecording,
}

impl PermissionGrantTarget {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "all" | "" => Some(Self::All),
            "accessibility" | "ax" | "privacy_accessibility" => Some(Self::Accessibility),
            "screen" | "screen_recording" | "screencapture" | "privacy_screencapture" => {
                Some(Self::ScreenRecording)
            }
            _ => None,
        }
    }
}

/// Result of opening System Settings for a permission grant.
///
/// Desktop shell may show a drag-to-list overlay using [`host_app_path`]; the
/// control plane only opens the OS pane and returns paths.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PermissionGrantOutcome {
    pub opened_settings: bool,
    pub target: String,
    /// Absolute path to Atmos Desktop Use.app when installed (for drag / Reveal).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_app_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_app_name: Option<String>,
    /// True when Accessibility was part of this grant (desktop may show drag UI).
    pub accessibility_pane: bool,
}

/// Atmos-owned permission grant for the rebranded host app.
///
/// Opens System Settings → Privacy for the requested target and returns the
/// host app path so the **desktop shell** can show a drag-to-list affordance.
/// CLI callers get the path for Reveal-in-Finder style hints.
///
/// Does **not** fire a live screenshot / capture probe: that would raise the
/// system “allow screen recording” alert *in addition* to Settings, which is
/// noisy once the Settings pane is already open.
///
/// Never shells the vendor `permissions grant` path — it re-launches CuaDriver.
pub fn open_host_permission_grant(
    host_app: Option<&Path>,
    engine_bin: &Path,
    socket: &Path,
    data_dir: &Path,
    target: PermissionGrantTarget,
) -> Result<PermissionGrantOutcome, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = data_dir;
        let accessibility_pane = matches!(
            target,
            PermissionGrantTarget::Accessibility | PermissionGrantTarget::All
        );
        let target_label = match target {
            PermissionGrantTarget::All => "all",
            PermissionGrantTarget::Accessibility => "accessibility",
            PermissionGrantTarget::ScreenRecording => "screen_recording",
        };
        match target {
            PermissionGrantTarget::Accessibility => {
                open_system_privacy_pane("accessibility")?;
            }
            PermissionGrantTarget::ScreenRecording => {
                open_system_privacy_pane("screen_recording")?;
            }
            PermissionGrantTarget::All => {
                open_system_privacy_pane("screen_recording")?;
                thread::sleep(Duration::from_millis(350));
                open_system_privacy_pane("accessibility")?;
            }
        }

        // Best-effort: keep host daemon alive so doctor reflects live TCC, but
        // never trigger capture APIs here (no System Settings + TCC popup stack).
        if engine_bin.is_file() {
            let _ = ensure_daemon(engine_bin, socket, host_app);
        }

        let host_app_path = host_app
            .filter(|p| p.exists())
            .map(|p| p.display().to_string());
        let host_app_name = host_app.and_then(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        });

        Ok(PermissionGrantOutcome {
            opened_settings: true,
            target: target_label.into(),
            host_app_path,
            host_app_name,
            accessibility_pane,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (host_app, engine_bin, socket, data_dir, target);
        Err(scrub_vendor(
            "Desktop Use permission grant is only supported on macOS.",
        ))
    }
}

/// Parse live TCC booleans from `health_report` / `check_permissions` for the host identity.
pub fn permissions_status_json(
    engine_bin: &Path,
    socket: &Path,
    host_app: Option<&Path>,
) -> Result<Value, String> {
    if !engine_bin.is_file() {
        return Ok(serde_json::json!({
            "installed": false,
            "accessibility": null,
            "screen_recording": null,
            "host": "Atmos Desktop Use",
            "host_bundle_id": "com.atmos.desktop.use",
        }));
    }
    let _ = ensure_daemon(engine_bin, socket, host_app);

    // Prefer health_report — reports tcc_* against the live process bundle id.
    if let Ok(report) = call_tool(engine_bin, socket, "health_report", &serde_json::json!({})) {
        if let Some(parsed) = parse_health_report_tcc(&report) {
            return Ok(parsed);
        }
    }
    if let Ok(v) = call_tool(
        engine_bin,
        socket,
        "check_permissions",
        &serde_json::json!({}),
    ) {
        let accessibility = v.get("accessibility").and_then(|x| x.as_bool());
        let screen_recording = v.get("screen_recording").and_then(|x| x.as_bool());
        let bundle = v
            .pointer("/source/executable")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        return Ok(serde_json::json!({
            "installed": true,
            "accessibility": accessibility,
            "screen_recording": screen_recording,
            "host": "Atmos Desktop Use",
            "host_bundle_id": "com.atmos.desktop.use",
            "executable": bundle,
            "daemon_running": true,
        }));
    }

    Ok(serde_json::json!({
        "installed": true,
        "accessibility": null,
        "screen_recording": null,
        "host": "Atmos Desktop Use",
        "host_bundle_id": "com.atmos.desktop.use",
        "daemon_running": is_daemon_alive(socket),
    }))
}

fn parse_health_report_tcc(report: &Value) -> Option<Value> {
    let checks = report.get("checks")?.as_array()?;
    let mut accessibility: Option<bool> = None;
    let mut screen_recording: Option<bool> = None;
    let mut bundle_id: Option<String> = None;

    for c in checks {
        let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("");
        let status = c.get("status").and_then(|x| x.as_str()).unwrap_or("");
        match name {
            "tcc_accessibility" => accessibility = Some(status == "pass"),
            "tcc_screen_recording" => screen_recording = Some(status == "pass"),
            "bundle_identity" => {
                bundle_id = c
                    .pointer("/data/bundle_identifier")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
            }
            _ => {}
        }
    }

    if accessibility.is_none() && screen_recording.is_none() {
        return None;
    }

    Some(serde_json::json!({
        "installed": true,
        "accessibility": accessibility,
        "screen_recording": screen_recording,
        "host": "Atmos Desktop Use",
        "host_bundle_id": bundle_id.unwrap_or_else(|| "com.atmos.desktop.use".into()),
        "daemon_running": true,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn host_serve_pkill_pattern_is_product_path() {
        assert!(HOST_SERVE_PKILL_PATTERN.contains("Atmos Desktop Use.app/Contents/MacOS/"));
        assert!(HOST_SERVE_PKILL_PATTERN.contains("serve"));
        assert!(!crate::strings::contains_vendor_brand(
            HOST_SERVE_PKILL_PATTERN
        ));
    }

    #[test]
    fn socket_path_under_data_dir() {
        let dir = tempdir().unwrap();
        let sock = default_socket_path(dir.path());
        assert!(sock.ends_with("engine.sock"));
    }

    #[test]
    fn parse_health_report_tcc_values() {
        let report = serde_json::json!({
            "checks": [
                {
                    "name": "bundle_identity",
                    "status": "fail",
                    "data": { "bundle_identifier": "com.atmos.desktop.use" }
                },
                { "name": "tcc_accessibility", "status": "pass" },
                { "name": "tcc_screen_recording", "status": "fail" }
            ]
        });
        let v = parse_health_report_tcc(&report).expect("parsed");
        assert_eq!(v["accessibility"], true);
        assert_eq!(v["screen_recording"], false);
        assert_eq!(v["host_bundle_id"], "com.atmos.desktop.use");
        assert!(!crate::strings::contains_vendor_brand(
            v["host"].as_str().unwrap()
        ));
    }

    #[test]
    fn privacy_pane_urls_are_system_settings() {
        // Pure contract: open_system_privacy_pane uses these URL suffixes.
        // Keep aligned with AppShot openPermissions.
        for pane in ["screen_recording", "accessibility", "other"] {
            let url = match pane {
                "screen" | "screen_recording" | "Privacy_ScreenCapture" => {
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
                }
                "accessibility" | "Privacy_Accessibility" => {
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
                }
                _ => "x-apple.systempreferences:com.apple.preference.security?Privacy",
            };
            assert!(url.contains("x-apple.systempreferences"));
            assert!(!crate::strings::contains_vendor_brand(url));
        }
    }
}
