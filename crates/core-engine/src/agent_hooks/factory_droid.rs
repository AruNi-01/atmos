use serde_json::{json, Value};
use tracing::debug;

use super::{
    atmos_context_curl_headers, atmos_managed_guard, home_dir, hook_version_assignment,
    hook_version_header_shell, installed_status_from_versions, parse_hook_version_from_json,
    AgentHookToolStatus,
};

fn settings_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".factory").join("settings.json"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/factory-droid", port)
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
                if let Some(url) = h.get("url").and_then(|u| u.as_str()) {
                    return url.contains(marker);
                }
                false
            })
        })
        .unwrap_or(false)
}

fn build_fixed_cmd(port: u16, event_name: &str, r#async: bool) -> Value {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    let command = format!(
        r#"{guard} && {hook_version} && curl -sf -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d '{{"hook_event_name":"{event_name}"}}' '{url}' >/dev/null 2>&1 || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        event_name = event_name,
        url = url,
    );
    let mut entry = json!({
        "matcher": "*",
        "hooks": [{
            "type": "command",
            "command": command,
            "timeout": 5,
        }]
    });
    if r#async {
        if let Some(hooks) = entry
            .get_mut("hooks")
            .and_then(|h| h.as_array_mut())
            .and_then(|a| a.first_mut())
        {
            hooks
                .as_object_mut()
                .unwrap()
                .insert("async".to_string(), json!(true));
        }
    }
    entry
}

fn build_stdin_cmd(port: u16, r#async: bool) -> Value {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    let command = format!(
        r#"{guard} && {hook_version} && cat | curl -sf -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d @- '{url}' >/dev/null 2>&1 || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        url = url,
    );
    let mut entry = json!({
        "matcher": "*",
        "hooks": [{
            "type": "command",
            "command": command,
            "timeout": 5,
        }]
    });
    if r#async {
        if let Some(hooks) = entry
            .get_mut("hooks")
            .and_then(|h| h.as_array_mut())
            .and_then(|a| a.first_mut())
        {
            hooks
                .as_object_mut()
                .unwrap()
                .insert("async".to_string(), json!(true));
        }
    }
    entry
}

fn build_hook_entries(port: u16) -> Value {
    json!({
        "SessionStart": [build_fixed_cmd(port, "SessionStart", false)],
        "SessionEnd": [build_fixed_cmd(port, "SessionEnd", true)],
        "UserPromptSubmit": [build_fixed_cmd(port, "UserPromptSubmit", false)],
        "PreToolUse": [build_stdin_cmd(port, true)],
        "PostToolUse": [build_stdin_cmd(port, true)],
        "Notification": [build_stdin_cmd(port, true)],
        "Stop": [build_fixed_cmd(port, "Stop", true)],
        "SubagentStart": [build_stdin_cmd(port, true)],
        "SubagentStop": [build_stdin_cmd(port, true)],
        "PreCompact": [build_fixed_cmd(port, "PreCompact", true)]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let path = match settings_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let factory_dir = path.parent().unwrap();

    let detected = factory_dir.exists() || which_exists("droid");
    if !detected {
        debug!("Factory Droid not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !factory_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(factory_dir) {
            return AgentHookToolStatus::failed(path.display().to_string(), e.to_string());
        }
    }

    let path_str = path.display().to_string();

    let mut settings: Value = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
            Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        }
    } else {
        json!({})
    };

    let new_hooks = build_hook_entries(port);
    let hooks_obj = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));

    if let Some(hooks_map) = hooks_obj.as_object_mut() {
        if let Some(new_map) = new_hooks.as_object() {
            for (event_name, new_entries) in new_map {
                let event_arr = hooks_map.entry(event_name).or_insert_with(|| json!([]));

                if let Some(arr) = event_arr.as_array_mut() {
                    arr.retain(|entry| !is_atmos_hook(entry));
                    if let Some(new_arr) = new_entries.as_array() {
                        arr.extend(new_arr.iter().cloned());
                    }
                }
            }
        }
    }

    match write_json(&path, &settings) {
        Ok(()) => AgentHookToolStatus::success(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let path = match settings_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = path.display().to_string();

    let mut settings: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    if let Some(hooks_map) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        let event_names: Vec<String> = hooks_map.keys().cloned().collect();
        for event_name in event_names {
            if let Some(arr) = hooks_map
                .get_mut(&event_name)
                .and_then(|v| v.as_array_mut())
            {
                arr.retain(|entry| !is_atmos_hook(entry));
                if arr.is_empty() {
                    hooks_map.remove(&event_name);
                }
            }
        }
        if hooks_map.is_empty() {
            settings.as_object_mut().unwrap().remove("hooks");
        }
    }

    match write_json(&path, &settings) {
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let path = match settings_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let factory_dir = path.parent().unwrap();
    let detected = factory_dir.exists() || which_exists("droid");
    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    if !path.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let settings: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let installed_versions = settings
        .get("hooks")
        .and_then(|h| h.get("Stop"))
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|entry| is_atmos_hook(entry))
                .map(parse_hook_version_from_json)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    installed_status_from_versions(path_str, installed_versions)
}

fn write_json(path: &std::path::Path, value: &Value) -> std::result::Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
