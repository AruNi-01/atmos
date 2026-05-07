use tracing::{debug, info};

use super::{home_dir, AgentHookToolStatus};

fn plugin_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| {
        h.join(".config")
            .join("amp")
            .join("plugins")
            .join("atmos-hook.ts")
    })
}

fn plugin_dir_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".config").join("amp").join("plugins"))
}

const PLUGIN_MARKER: &str = "// Atmos agent hook plugin";

fn build_plugin_source(port: u16) -> String {
    // All 5 AmpCode plugin events are handled:
    //   session.start  → Idle   (session init, idempotent baseline)
    //   agent.start    → Running
    //   tool.call      → Running (idempotent: skip broadcast if already Running)
    //   tool.result    → Running (idempotent: skip broadcast if already Running)
    //   agent.end      → Idle   (done/error/cancelled all map to Idle — compensates for any missed event)
    format!(
        r#"// Atmos agent hook plugin
import type {{ PluginAPI }} from "@ampcode/plugin"

const ATMOS_URL = "http://localhost:{port}/hooks/ampcode"

export default function (amp: PluginAPI) {{
  if (process.env.ATMOS_MANAGED !== "1") return

  const post = (body: object) =>
    fetch(ATMOS_URL, {{
      method: "POST",
      headers: {{
        "Content-Type": "application/json",
        "X-Atmos-Context": process.env.ATMOS_CONTEXT_ID ?? "",
        "X-Atmos-Pane": process.env.ATMOS_PANE_ID ?? "",
      }},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    }}).catch(() => {{}})

  amp.on("session.start", async (_event, _ctx) => {{
    await post({{ hook_event_name: "SessionStart" }})
  }})

  amp.on("agent.start", async (_event, _ctx) => {{
    await post({{ hook_event_name: "AgentStart" }})
  }})

  amp.on("tool.call", async (event, _ctx) => {{
    await post({{ hook_event_name: "ToolCall", tool: event.tool }})
    return {{ action: "allow" }}
  }})

  amp.on("tool.result", async (_event, _ctx) => {{
    await post({{ hook_event_name: "ToolResult" }})
  }})

  amp.on("agent.end", async (event, _ctx) => {{
    await post({{ hook_event_name: "AgentEnd", status: event.status }})
  }})
}}
"#,
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
    let amp_config_dir = plugin_dir.parent().unwrap();
    let has_config = amp_config_dir.exists();
    let has_binary = which_exists("amp");
    if !has_config && !has_binary {
        debug!("amp not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    let path_str = plugin_file.display().to_string();

    if !plugin_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&plugin_dir) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }

    let source = build_plugin_source(port);

    // Idempotent write: skip if content unchanged
    if plugin_file.exists() {
        if let Ok(existing) = std::fs::read_to_string(&plugin_file) {
            if existing == source {
                return AgentHookToolStatus::success(&path_str);
            }
        }
    }

    match std::fs::write(&plugin_file, &source) {
        Ok(()) => {
            info!(
                "ampcode plugin installed at {} ({} bytes). Run `plugins: reload` in amp to activate.",
                path_str,
                source.len()
            );
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
            return AgentHookToolStatus {
                detected: true,
                installed: false,
                config_path: Some(path_str),
                error: None,
            };
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

    let amp_config_dir = plugin_file.parent().and_then(|d| d.parent());
    let has_config = amp_config_dir.is_some_and(|d| d.exists());
    let has_binary = which_exists("amp");
    if !has_config && !has_binary {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = plugin_file.display().to_string();

    if !plugin_file.exists() {
        return AgentHookToolStatus {
            detected: true,
            installed: false,
            config_path: Some(path_str),
            error: None,
        };
    }

    let installed = std::fs::read_to_string(&plugin_file)
        .map(|content| content.contains(PLUGIN_MARKER))
        .unwrap_or(false);

    AgentHookToolStatus {
        detected: true,
        installed,
        config_path: Some(path_str),
        error: None,
    }
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
