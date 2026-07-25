use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tracing::debug;

use super::{
    atmos_context_curl_headers, atmos_managed_guard, home_dir, hook_version_assignment,
    hook_version_header_shell, installed_status_from_versions, parse_hook_version_from_json,
    AgentHookToolStatus,
};

fn grok_root_for_environment(home: &Path, grok_home: Option<&OsStr>) -> PathBuf {
    grok_home
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".grok"))
}

const HOOKS_FILE_NAME: &str = "atmos-hooks.json";

fn hooks_path_for_environment(home: &Path, grok_home: Option<&OsStr>) -> PathBuf {
    grok_root_for_environment(home, grok_home)
        .join("hooks")
        .join(HOOKS_FILE_NAME)
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/grok-build", port)
}

fn hook_path_marker() -> &'static str {
    "ATMOS_MANAGED"
}

fn is_atmos_hook(hook_entry: &Value) -> bool {
    let marker = hook_path_marker();
    hook_entry
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|arr| {
            arr.iter().any(|h| {
                if let Some(cmd) = h.get("command").and_then(|c| c.as_str()) {
                    return cmd.contains(marker);
                }
                false
            })
        })
        .unwrap_or(false)
}

/// Prefer stdin forwarding so Grok's camelCase envelope is preserved.
///
/// Grok does not support Claude's `async` hook property. For high-frequency
/// events, consume stdin in the hook shell and detach the bounded HTTP sender.
fn build_stdin_cmd(port: u16, detached: bool) -> String {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    let curl = format!(
        r#"curl -sf --connect-timeout 1 --max-time 2 -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d @- '{url}'"#,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        url = url,
    );
    let delivery = if detached {
        format!(
            r#"payload=$(cat) && {{ (printf '%s' "$payload" | {curl} >/dev/null 2>&1) >/dev/null 2>&1 & }}"#
        )
    } else {
        format!(r#"cat | {curl} >/dev/null 2>&1"#)
    };
    format!(
        r#"{guard} && {hook_version} && {delivery} || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        delivery = delivery,
    )
}

fn build_hook_entries(port: u16) -> Value {
    let sync_stdin_cmd = build_stdin_cmd(port, false);
    let detached_stdin_cmd = build_stdin_cmd(port, true);
    let command_hook = |detached: bool, timeout: Option<u32>| {
        let mut hook = json!({
            "type": "command",
            "command": if detached {
                detached_stdin_cmd.clone()
            } else {
                sync_stdin_cmd.clone()
            },
        });
        if let Some(secs) = timeout {
            hook.as_object_mut()
                .unwrap()
                .insert("timeout".to_string(), json!(secs));
        }
        hook
    };

    json!({
        "SessionStart": [{
            "hooks": [command_hook(false, Some(5))]
        }],
        "UserPromptSubmit": [{
            "hooks": [command_hook(true, None)]
        }],
        "PreToolUse": [{
            "matcher": ".*",
            "hooks": [command_hook(true, None)]
        }],
        "PostToolUse": [{
            "matcher": ".*",
            "hooks": [command_hook(true, None)]
        }],
        "PostToolUseFailure": [{
            "matcher": ".*",
            "hooks": [command_hook(true, None)]
        }],
        // No restrictive matcher: Grok's regex dialect for OR is unconfirmed.
        // Server-side filter keeps only permission_prompt / elicitation_dialog.
        "Notification": [{
            "matcher": ".*",
            "hooks": [command_hook(true, None)]
        }],
        "Stop": [{
            "hooks": [command_hook(true, None)]
        }],
        "StopFailure": [{
            "hooks": [command_hook(true, None)]
        }],
        "SessionEnd": [{
            "hooks": [command_hook(false, Some(5))]
        }]
    })
}

fn command_on_path(cmd: &str, path: Option<&OsStr>) -> Option<PathBuf> {
    let path = path?;
    for dir in std::env::split_paths(&path) {
        for candidate in executable_candidates(&dir, cmd) {
            if !candidate.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = candidate.metadata() {
                    if meta.permissions().mode() & 0o111 == 0 {
                        continue;
                    }
                } else {
                    continue;
                }
            }
            return Some(candidate);
        }
    }
    None
}

fn executable_candidates(directory: &Path, command: &str) -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut candidates = vec![directory.join(command)];
        for suffix in [".exe", ".cmd", ".bat", ".com"] {
            candidates.push(directory.join(format!("{command}{suffix}")));
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        vec![directory.join(command)]
    }
}

/// Path fingerprint only — bare `agent` is contested with Cursor and must not
/// alone mean Grok is installed (APP-036 REV-001).
fn path_looks_like_grok(path: &std::path::Path) -> bool {
    let path_str = path
        .to_string_lossy()
        .to_ascii_lowercase()
        .replace('\\', "/");
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    path_str.contains("/.grok/") || file_name.starts_with("grok")
}

fn grok_detected(grok_root: &Path, path: Option<&OsStr>) -> bool {
    if grok_root.exists() {
        return true;
    }
    if command_on_path("grok", path).is_some() {
        return true;
    }
    // Contested short name: only count when the resolved binary fingerprints as Grok.
    if let Some(agent) = command_on_path("agent", path) {
        let resolved = std::fs::canonicalize(&agent).unwrap_or(agent);
        if path_looks_like_grok(&resolved) {
            return true;
        }
    }
    false
}

fn write_json(path: &std::path::Path, value: &Value) -> std::result::Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let home = match home_dir() {
        Ok(home) => home,
        Err(_) => return AgentHookToolStatus::not_detected(),
    };
    install_for_environment(
        port,
        &home,
        std::env::var_os("GROK_HOME").as_deref(),
        std::env::var_os("PATH").as_deref(),
    )
}

fn install_for_environment(
    port: u16,
    home: &Path,
    grok_home: Option<&OsStr>,
    path_env: Option<&OsStr>,
) -> AgentHookToolStatus {
    let grok_root = grok_root_for_environment(home, grok_home);
    let path = hooks_path_for_environment(home, grok_home);
    if !grok_detected(&grok_root, path_env) {
        debug!(
            "Grok Build not detected ({} missing, no grok on PATH, and agent is not a Grok binary), skipping",
            grok_root.display()
        );
        return AgentHookToolStatus::not_detected();
    }

    let parent = path.parent().unwrap();
    if !parent.exists() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return AgentHookToolStatus::failed(path.display().to_string(), e.to_string());
        }
    }

    let path_str = path.display().to_string();
    let config = json!({ "hooks": build_hook_entries(port) });

    match write_json(&path, &config) {
        Ok(()) => AgentHookToolStatus::success(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let home = match home_dir() {
        Ok(home) => home,
        Err(_) => return AgentHookToolStatus::not_detected(),
    };
    uninstall_for_environment(
        &home,
        std::env::var_os("GROK_HOME").as_deref(),
        std::env::var_os("PATH").as_deref(),
    )
}

fn uninstall_for_environment(
    home: &Path,
    grok_home: Option<&OsStr>,
    path_env: Option<&OsStr>,
) -> AgentHookToolStatus {
    let grok_root = grok_root_for_environment(home, grok_home);
    let path = hooks_path_for_environment(home, grok_home);
    if !path.exists() {
        if grok_detected(&grok_root, path_env) {
            return AgentHookToolStatus::detected_uninstalled(path.display().to_string());
        }
        return AgentHookToolStatus::not_detected();
    }
    let path_str = path.display().to_string();

    // Dedicated Atmos-managed file — remove only this file, leave other ~/.grok/hooks/*.json alone.
    match std::fs::remove_file(&path) {
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            AgentHookToolStatus::detected_uninstalled(&path_str)
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let home = match home_dir() {
        Ok(home) => home,
        Err(_) => return AgentHookToolStatus::not_detected(),
    };
    check_for_environment(
        &home,
        std::env::var_os("GROK_HOME").as_deref(),
        std::env::var_os("PATH").as_deref(),
    )
}

fn check_for_environment(
    home: &Path,
    grok_home: Option<&OsStr>,
    path_env: Option<&OsStr>,
) -> AgentHookToolStatus {
    let grok_root = grok_root_for_environment(home, grok_home);
    let path = hooks_path_for_environment(home, grok_home);
    if !grok_detected(&grok_root, path_env) {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();
    if !path.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let config: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let hooks = match config.get("hooks") {
        Some(v) => v,
        None => return AgentHookToolStatus::detected_uninstalled(path_str),
    };

    // Prefer Stop entries for version probe (always present when Atmos-managed).
    let installed_versions = hooks
        .get("Stop")
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|entry| is_atmos_hook(entry))
                .map(parse_hook_version_from_json)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if installed_versions.is_empty() {
        // File exists but no Atmos marker — treat as uninstalled so install can rewrite.
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    installed_status_from_versions(path_str, installed_versions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::Stdio;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("atmos-grok-hooks-{name}-{suffix}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn install_check_uninstall_writes_dedicated_atmos_file() {
        let dir = unique_temp_dir("lifecycle");

        // Create ~/.grok so detection succeeds without requiring a real CLI.
        std::fs::create_dir_all(dir.join(".grok")).unwrap();
        // Third-party hook file must survive uninstall.
        let third_party = dir.join(".grok/hooks/orca-status.json");
        std::fs::create_dir_all(third_party.parent().unwrap()).unwrap();
        std::fs::write(&third_party, r#"{"hooks":{}}"#).unwrap();

        let installed = install_for_environment(4310, &dir, None, None);
        assert!(installed.detected, "should detect ~/.grok");
        assert!(
            installed.installed,
            "install should succeed: {:?}",
            installed.error
        );
        let atmos_path = dir.join(".grok/hooks/atmos-hooks.json");
        assert!(atmos_path.exists());
        let content = std::fs::read_to_string(&atmos_path).unwrap();
        assert!(content.contains("ATMOS_MANAGED"));
        assert!(content.contains("/hooks/grok-build"));
        // Grok treats bare $VAR as required; optional vars must use ${VAR:-}.
        assert!(
            content.contains("${ATMOS_SIDE_CHAT_ID:-}")
                && content.contains("${ATMOS_SOURCE_PANE_ID:-}")
                && content.contains("${ATMOS_TERMINAL_KIND:-}"),
            "optional Atmos env refs must use empty-default expansion for Grok"
        );
        assert!(
            !content.contains("$ATMOS_SIDE_CHAT_ID\"")
                && !content.contains("$ATMOS_SOURCE_PANE_ID\"")
                && !content.contains("$ATMOS_TERMINAL_KIND\""),
            "must not leave bare optional $ATMOS_* refs that Grok rejects"
        );
        // Notification must not rely on unconfirmed OR-regex matcher dialect.
        assert!(
            !content.contains("permission_prompt|elicitation_dialog"),
            "install should not use restrictive OR matcher"
        );
        assert!(
            content.contains(r#""Notification""#) || content.contains("\"Notification\""),
            "Notification hook should still be installed"
        );
        assert!(
            !content.contains(r#""async""#),
            "Grok ignores Claude-style async hook properties"
        );

        let status = check_for_environment(&dir, None, None);
        assert!(status.installed);
        assert!(status.detected);

        let uninstalled = uninstall_for_environment(&dir, None, None);
        assert!(uninstalled.detected);
        assert!(!uninstalled.installed);
        assert!(!atmos_path.exists());
        assert!(third_party.exists(), "third-party hook file must remain");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn grok_home_overrides_default_hook_directory() {
        let home = unique_temp_dir("custom-home");
        let grok_home = home.join("custom-grok-root");
        std::fs::create_dir_all(&grok_home).unwrap();

        let installed = install_for_environment(4310, &home, Some(grok_home.as_os_str()), None);
        let custom_path = grok_home.join("hooks/atmos-hooks.json");
        assert!(installed.installed);
        assert!(custom_path.exists());
        assert!(!home.join(".grok/hooks/atmos-hooks.json").exists());

        assert!(check_for_environment(&home, Some(grok_home.as_os_str()), None).installed);
        assert!(!uninstall_for_environment(&home, Some(grok_home.as_os_str()), None).installed);
        assert!(!custom_path.exists());

        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn non_grok_agent_on_path_is_not_detected_and_does_not_create_home() {
        use std::os::unix::fs::PermissionsExt;

        let dir = unique_temp_dir("nongrok-agent");

        let bin = dir.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let agent = bin.join("agent");
        std::fs::write(&agent, "#!/bin/sh\necho cursor-agent 1.0\n").unwrap();
        std::fs::set_permissions(&agent, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(
            !grok_detected(&dir.join(".grok"), Some(bin.as_os_str())),
            "bare non-Grok agent on PATH must not count as Grok"
        );
        let status = install_for_environment(4310, &dir, None, Some(bin.as_os_str()));
        assert!(!status.detected);
        assert!(!status.installed);
        assert!(
            !dir.join(".grok").exists(),
            "install must not create ~/.grok for a non-Grok agent"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn agent_under_grok_home_path_is_detected() {
        use std::os::unix::fs::PermissionsExt;

        let dir = unique_temp_dir("grok-agent-path");

        // Keep the Grok-fingerprinted binary under a `.grok/bin` path segment, but
        // pass a nonexistent root so detection must use path fingerprinting (not
        // root existence).
        let nested = dir.join("opt").join(".grok").join("bin");
        std::fs::create_dir_all(&nested).unwrap();
        let agent = nested.join("agent");
        std::fs::write(&agent, "#!/bin/sh\necho grok 0.0.0\n").unwrap();
        std::fs::set_permissions(&agent, std::fs::Permissions::from_mode(0o755)).unwrap();

        let missing_root = dir.join("missing-grok-root");
        assert!(!missing_root.exists());
        assert!(grok_detected(&missing_root, Some(nested.as_os_str())));
        assert!(path_looks_like_grok(&agent));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn detached_hook_returns_before_slow_sender_and_preserves_payload() {
        use std::os::unix::fs::PermissionsExt;

        let dir = unique_temp_dir("detached");
        let bin = dir.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let capture = dir.join("payload.json");
        let curl = bin.join("curl");
        std::fs::write(
            &curl,
            "#!/bin/sh\n/bin/sleep 1\n/bin/cat > \"$CAPTURE_FILE\"\n",
        )
        .unwrap();
        std::fs::set_permissions(&curl, std::fs::Permissions::from_mode(0o755)).unwrap();

        let mut child = std::process::Command::new("sh")
            .args(["-c", &build_stdin_cmd(4310, true)])
            .env("ATMOS_MANAGED", "1")
            .env("CAPTURE_FILE", &capture)
            .env("PATH", format!("{}:/bin:/usr/bin", bin.display()))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let payload = r#"{"hookEventName":"pre_tool_use","sessionId":"grok-1"}"#;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(payload.as_bytes())
            .unwrap();

        let started = Instant::now();
        assert!(child.wait().unwrap().success());
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "detached hook shell should not wait for the sender"
        );

        // `cat > file` creates/truncates the file before writing; wait for the
        // full payload rather than mere existence to avoid a TOCTOU empty read.
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut captured = String::new();
        while Instant::now() < deadline {
            if let Ok(contents) = std::fs::read_to_string(&capture) {
                if contents == payload {
                    captured = contents;
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(captured, payload);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
