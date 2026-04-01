use tracing::{debug, info};

use super::{home_dir, AgentHookToolStatus};

fn plugin_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".config").join("opencode").join("plugins").join("atmos_plugin.ts"))
}

fn plugin_dir_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".config").join("opencode").join("plugins"))
}

const PLUGIN_MARKER: &str = "// Atmos agent hook plugin";

fn build_plugin_source(port: u16) -> String {
    format!(
        r#"{PLUGIN_MARKER}
import type {{ Plugin }} from "@opencode-ai/plugin"

const ATMOS_URL = "http://localhost:{port}/hooks/opencode"

async function post(event: object) {{
  if (typeof process !== "undefined" && process.env?.ATMOS_MANAGED !== "1") return
  try {{
    await fetch(ATMOS_URL, {{
      method: "POST",
      headers: {{
        "Content-Type": "application/json",
        "X-Atmos-Context": process.env?.ATMOS_CONTEXT_ID ?? "",
        "X-Atmos-Pane": process.env?.ATMOS_PANE_ID ?? "",
      }},
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    }})
  }} catch {{
    // silent — Atmos service may not be running
  }}
}}

export const AtmosPlugin: Plugin = async () => {{
  return {{
    event: async ({{ event }}) => {{
      const type = event.type

      if (
        type === "session.created" ||
        type === "session.idle" ||
        type === "session.error" ||
        type === "permission.asked" ||
        type === "permission.replied" ||
        type === "tool.execute.before" ||
        type === "tool.execute.after"
      ) {{
        await post(event)
      }}

      if (type === "message.updated" && (event as any).properties?.role === "user") {{
        await post(event)
      }}
    }},
  }}
}}
"#,
        PLUGIN_MARKER = PLUGIN_MARKER,
        port = port,
    )
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let plugin_file = match plugin_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let plugin_dir = match plugin_dir_path() {
        Some(d) => d,
        None => return AgentHookToolStatus::not_detected(),
    };

    // Detect by config dir OR binary in PATH
    let opencode_config_dir = plugin_dir.parent().unwrap();
    let has_config = opencode_config_dir.exists();
    let has_binary = which_exists("opencode");
    if !has_config && !has_binary {
        debug!("opencode not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    let path_str = plugin_file.display().to_string();

    if !plugin_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&plugin_dir) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }

    let source = build_plugin_source(port);

    if plugin_file.exists() {
        if let Ok(existing) = std::fs::read_to_string(&plugin_file) {
            if existing == source {
                return AgentHookToolStatus::success(&path_str);
            }
        }
    }

    match std::fs::write(&plugin_file, &source) {
        Ok(()) => {
            info!("opencode plugin installed at {} ({} bytes). Restart opencode to activate.", path_str, source.len());
            AgentHookToolStatus::success(&path_str)
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let plugin_file = match plugin_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = plugin_file.display().to_string();

    if let Ok(content) = std::fs::read_to_string(&plugin_file) {
        if !content.contains(PLUGIN_MARKER) {
            return AgentHookToolStatus { detected: true, installed: false, config_path: Some(path_str), error: None };
        }
    }

    match std::fs::remove_file(&plugin_file) {
        Ok(()) => {
            let mut status = AgentHookToolStatus::success(&path_str);
            status.installed = false;
            status
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let plugin_file = match plugin_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let opencode_config_dir = plugin_file.parent().and_then(|d| d.parent());
    let has_config = opencode_config_dir.is_some_and(|d| d.exists());
    let has_binary = which_exists("opencode");
    if !has_config && !has_binary {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = plugin_file.display().to_string();

    if !plugin_file.exists() {
        return AgentHookToolStatus { detected: true, installed: false, config_path: Some(path_str), error: None };
    }

    let installed = std::fs::read_to_string(&plugin_file)
        .map(|content| content.contains(PLUGIN_MARKER))
        .unwrap_or(false);

    AgentHookToolStatus { detected: true, installed, config_path: Some(path_str), error: None }
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
