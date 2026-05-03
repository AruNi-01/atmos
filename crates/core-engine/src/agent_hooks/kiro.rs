use serde_json::{json, Value};
use tracing::debug;

use super::{home_dir, AgentHookToolStatus};

const ATMOS_AGENT_NAME: &str = "atmos";
const ATMOS_MARKER: &str = "ATMOS_MANAGED";

fn agent_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".kiro").join("agents").join("atmos.json"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/kiro", port)
}

fn is_atmos_agent(content: &str) -> bool {
    if let Ok(val) = serde_json::from_str::<Value>(content) {
        if let Some(hooks) = val.get("hooks").and_then(|h| h.as_object()) {
            for (_event, entries) in hooks {
                if let Some(arr) = entries.as_array() {
                    for entry in arr {
                        let cmd = entry.get("command").and_then(|c| c.as_str()).unwrap_or("");
                        if cmd.contains(ATMOS_MARKER) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

fn build_agent_config(port: u16) -> Value {
    let url = hook_url(port);
    let agent_spawn_cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d '{{"hook_event_name":"agentSpawn"}}' '{url}' >/dev/null 2>&1 || true"#,
    );
    let prompt_submit_cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d '{{"hook_event_name":"userPromptSubmit"}}' '{url}' >/dev/null 2>&1 || true"#,
    );
    let pre_tool_cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && cat | curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d @- '{url}' >/dev/null 2>&1 || true"#,
    );
    let post_tool_cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && cat | curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d @- '{url}' >/dev/null 2>&1 || true"#,
    );
    let stop_cmd = format!(
        r#"[ "$ATMOS_MANAGED" = "1" ] && curl -sf -X POST -H 'Content-Type: application/json' -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" -H "X-Atmos-Pane: $ATMOS_PANE_ID" -d '{{"hook_event_name":"stop"}}' '{url}' >/dev/null 2>&1 || true"#,
    );

    json!({
        "name": ATMOS_AGENT_NAME,
        "description": "Atmos integration — relays agent lifecycle events to Atmos for status tracking. Launch with `kiro --agent atmos`.",
        "welcomeMessage": "Kiro agent in Atmos — lifecycle events are relayed to Atmos.",
        "tools": ["*"],
        "allowedTools": ["*"],
        "hooks": {
            "agentSpawn": [
                {
                    "command": agent_spawn_cmd,
                    "timeout_ms": 5000
                }
            ],
            "userPromptSubmit": [
                {
                    "command": prompt_submit_cmd,
                    "timeout_ms": 5000
                }
            ],
            "preToolUse": [
                {
                    "command": pre_tool_cmd,
                    "matcher": "*",
                    "timeout_ms": 3000
                }
            ],
            "postToolUse": [
                {
                    "command": post_tool_cmd,
                    "matcher": "*",
                    "timeout_ms": 3000
                }
            ],
            "stop": [
                {
                    "command": stop_cmd,
                    "timeout_ms": 5000
                }
            ]
        }
    })
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let path = match agent_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let kiro_dir = path.parent().unwrap();
    let kiro_root = kiro_dir.parent().unwrap();

    let detected = kiro_root.exists()
        || kiro_dir.exists()
        || which_exists("kiro")
        || which_exists("kiro-cli")
        || std::path::Path::new("/Applications/Kiro CLI.app").exists();

    if !detected {
        debug!("Kiro CLI not detected, skipping");
        return AgentHookToolStatus::not_detected();
    }

    if !kiro_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(kiro_dir) {
            return AgentHookToolStatus::failed(path.display().to_string(), e.to_string());
        }
    }

    let path_str = path.display().to_string();
    let new_config = build_agent_config(port);

    if path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&path) {
            if is_atmos_agent(&existing) {
                let existing_config: Value =
                    serde_json::from_str(&existing).unwrap_or_else(|_| json!({}));
                if let Some(existing_desc) =
                    existing_config.get("description").and_then(|d| d.as_str())
                {
                    if let Some(new_desc) = new_config.get("description").and_then(|d| d.as_str()) {
                        if existing_desc == new_desc {
                            if let Ok(new_str) = serde_json::to_string_pretty(&new_config) {
                                if let Ok(existing_str) =
                                    serde_json::to_string_pretty(&existing_config)
                                {
                                    if new_str == existing_str {
                                        return AgentHookToolStatus::success(&path_str);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    match write_json(&path, &new_config) {
        Ok(()) => {
            debug!("Kiro CLI agent config installed at {}", path_str);
            AgentHookToolStatus::success(&path_str)
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let path = match agent_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = path.display().to_string();

    if let Ok(content) = std::fs::read_to_string(&path) {
        if !is_atmos_agent(&content) {
            return AgentHookToolStatus {
                detected: true,
                installed: false,
                config_path: Some(path_str),
                error: None,
            };
        }
    }

    match std::fs::remove_file(&path) {
        Ok(()) => {
            let mut status = AgentHookToolStatus::success(&path_str);
            status.installed = false;
            status
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let path = match agent_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let kiro_dir = path.parent().unwrap();
    let kiro_root = kiro_dir.parent().unwrap();
    let detected = kiro_root.exists()
        || kiro_dir.exists()
        || which_exists("kiro")
        || which_exists("kiro-cli")
        || std::path::Path::new("/Applications/Kiro CLI.app").exists();

    if !detected {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = path.display().to_string();

    if !path.exists() {
        return AgentHookToolStatus {
            detected: true,
            installed: false,
            config_path: Some(path_str),
            error: None,
        };
    }

    let installed = std::fs::read_to_string(&path)
        .map(|content| is_atmos_agent(&content))
        .unwrap_or(false);

    AgentHookToolStatus {
        detected: true,
        installed,
        config_path: Some(path_str),
        error: None,
    }
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
