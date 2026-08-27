use serde_json::{json, Value};
use tracing::debug;

use super::{
    atmos_context_curl_headers, atmos_managed_guard, home_dir, hook_version_assignment,
    hook_version_header_shell, installed_status_from_versions, parse_hook_version_from_json,
    AgentHookToolStatus,
};

fn hooks_json_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| h.join(".codex").join("hooks.json"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/codex", port)
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

fn build_cmd(port: u16, event_name: &str) -> String {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    format!(
        r#"{guard} && {hook_version} && curl -sf -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d '{{"hook_event_name":"{event_name}"}}' '{url}' >/dev/null 2>&1 || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        event_name = event_name,
        url = url,
    )
}

fn build_stdin_cmd(port: u16) -> String {
    let url = hook_url(port);
    let hook_version = hook_version_assignment();
    let hook_version_header = hook_version_header_shell();
    format!(
        r#"{guard} && {hook_version} && cat | curl -sf -X POST -H 'Content-Type: application/json' {context_headers} {hook_version_header} -d @- '{url}' >/dev/null 2>&1 || true"#,
        guard = atmos_managed_guard(),
        hook_version = hook_version,
        context_headers = atmos_context_curl_headers(),
        hook_version_header = hook_version_header,
        url = url,
    )
}

fn build_hook_entries(port: u16) -> Value {
    let stdin = build_stdin_cmd(port);
    json!({
        "SessionStart": [{
            "hooks": [{ "type": "command", "command": build_cmd(port, "SessionStart"), "timeout": 5 }]
        }],
        "UserPromptSubmit": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 5 }]
        }],
        "PreToolUse": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 3 }]
        }],
        "PostToolUse": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 3 }]
        }],
        "PermissionRequest": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 3 }]
        }],
        "SubagentStart": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 3 }]
        }],
        "SubagentStop": [{
            "hooks": [{ "type": "command", "command": stdin.clone(), "timeout": 3 }]
        }],
        "Stop": [{
            "hooks": [{ "type": "command", "command": stdin, "timeout": 3 }]
        }]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let codex_dir = hooks_path.parent().unwrap();

    let detected = codex_dir.exists() || which_exists("codex");

    if !detected {
        debug!("Codex CLI not detected, skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !codex_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(codex_dir) {
            return AgentHookToolStatus::failed(hooks_path.display().to_string(), e.to_string());
        }
    }

    let path_str = hooks_path.display().to_string();

    let mut settings: Value = if hooks_path.exists() {
        match std::fs::read_to_string(&hooks_path) {
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

    if let Err(e) = write_json(&hooks_path, &settings) {
        return AgentHookToolStatus::failed(&path_str, e);
    }

    AgentHookToolStatus::success(&path_str)
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = hooks_path.display().to_string();

    let mut settings: Value = match std::fs::read_to_string(&hooks_path) {
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
    }

    match write_json(&hooks_path, &settings) {
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let hooks_path = match hooks_json_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let codex_dir = hooks_path.parent().unwrap();
    let detected = codex_dir.exists() || which_exists("codex");
    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = hooks_path.display().to_string();

    if !hooks_path.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let settings: Value = match std::fs::read_to_string(&hooks_path) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_hooks_are_stdin_and_not_bash_only() {
        let entries = build_hook_entries(4310);
        let pre = &entries["PreToolUse"][0];
        assert!(pre.get("matcher").is_none());
        let cmd = pre["hooks"][0]["command"].as_str().unwrap();
        assert!(cmd.contains("cat | curl"));
        assert!(entries.get("PostToolUse").is_some());
        let prompt = entries["UserPromptSubmit"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(prompt.contains("cat | curl"));
    }
}
