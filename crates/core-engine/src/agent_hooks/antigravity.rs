use serde_json::{json, Value};
use tracing::debug;

use super::{
    atmos_context_curl_headers, atmos_managed_guard, home_dir, hook_version_assignment,
    hook_version_header_shell, installed_status_from_versions, parse_hook_version_from_json,
    AgentHookToolStatus,
};

fn hooks_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".gemini").join("config").join("hooks.json"))
}

fn script_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".atmos").join("agent-hooks").join("antigravity.sh"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/antigravity", port)
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

fn build_atmos_hook_namespace(port: u16) -> Value {
    json!({
        "PreInvocation": [
            { "type": "command", "command": build_cmd(port, "BeforeAgent"), "async": true }
        ],
        "PreToolUse": [
            {
                "matcher": "*",
                "hooks": [
                    { "type": "command", "command": build_cmd(port, "BeforeTool"), "async": true }
                ]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "*",
                "hooks": [
                    { "type": "command", "command": build_cmd(port, "AfterTool"), "async": true }
                ]
            }
        ],
        "Stop": [
            { "type": "command", "command": build_cmd(port, "Stop"), "async": true }
        ]
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let path = match hooks_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let parent = path.parent().unwrap();
    let detected = parent.exists() || which_exists("agy");
    if !detected {
        debug!("Antigravity CLI not detected (no config dir, no agy in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !parent.exists() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return AgentHookToolStatus::failed(path.display().to_string(), e.to_string());
        }
    }

    // Clean up stale hooks.json in antigravity-cli dir if it exists
    if let Ok(h) = home_dir() {
        let old_hooks_path = h.join(".gemini").join("antigravity-cli").join("hooks.json");
        if old_hooks_path.exists() {
            let _ = std::fs::remove_file(old_hooks_path);
        }
    }

    // Clean up temporary script file if it exists
    if let Some(scr_path) = script_path() {
        if scr_path.exists() {
            let _ = std::fs::remove_file(scr_path);
        }
    }

    let path_str = path.display().to_string();

    let mut hooks_config: Value = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
            Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        }
    } else {
        json!({})
    };

    if !hooks_config.is_object() {
        hooks_config = json!({});
    }

    let new_atmos_namespace = build_atmos_hook_namespace(port);
    if let Some(config_obj) = hooks_config.as_object_mut() {
        config_obj.insert("atmos".to_string(), new_atmos_namespace);
    }

    match write_json(&path, &hooks_config) {
        Ok(()) => AgentHookToolStatus::success(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let path = match hooks_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = path.display().to_string();

    let mut hooks_config: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    if !hooks_config.is_object() {
        hooks_config = json!({});
    }

    if let Some(config_obj) = hooks_config.as_object_mut() {
        config_obj.remove("atmos");
    }

    // Clean up temporary script file if it exists
    if let Some(scr_path) = script_path() {
        if scr_path.exists() {
            let _ = std::fs::remove_file(scr_path);
        }
    }

    // If the config is empty now, we can delete the file, otherwise write it back
    let is_empty = hooks_config
        .as_object()
        .map(|o| o.is_empty())
        .unwrap_or(true);
    if is_empty {
        let _ = std::fs::remove_file(&path);
        AgentHookToolStatus::detected_uninstalled(&path_str)
    } else {
        match write_json(&path, &hooks_config) {
            Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
            Err(e) => AgentHookToolStatus::failed(&path_str, e),
        }
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let path = match hooks_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let parent = path.parent().unwrap();
    let detected = parent.exists() || which_exists("agy");
    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    if !path.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let hooks_config: Value = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| json!({})),
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let atmos_hooks = match hooks_config.get("atmos") {
        Some(v) => v,
        None => return AgentHookToolStatus::not_detected(), // If namespace is missing, check should report as not installed/uninstalled
    };

    let installed_versions = atmos_hooks
        .get("Stop")
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
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
