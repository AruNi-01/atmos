use tracing::{debug, info};

use super::{
    home_dir, hook_version_header_ts, installed_status_from_content, AgentHookToolStatus,
    CURRENT_HOOK_VERSION,
};

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
const ATMOS_HOOK_VERSION = {hook_version}

export default function (amp: PluginAPI) {{
  if (process.env.ATMOS_MANAGED !== "1") return

  const post = (body: object) =>
    fetch(ATMOS_URL, {{
      method: "POST",
      headers: {{
        "Content-Type": "application/json",
        "X-Atmos-Context": process.env.ATMOS_CONTEXT_ID ?? "",
        "X-Atmos-Pane": process.env.ATMOS_PANE_ID ?? "",
        "X-Atmos-Terminal-Kind": process.env.ATMOS_TERMINAL_KIND ?? "",
        "X-Atmos-Side-Chat-Id": process.env.ATMOS_SIDE_CHAT_ID ?? "",
        "X-Atmos-Source-Pane": process.env.ATMOS_SOURCE_PANE_ID ?? "",
        {hook_version_header}
      }},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    }}).catch(() => {{}})

  amp.on("session.start", async (_event, _ctx) => {{
    await post({{ hook_event_name: "SessionStart" }})
  }})

  amp.on("agent.start", async (event, _ctx) => {{
    await post({{
      hook_event_name: "AgentStart",
      prompt: event?.prompt ?? event?.text ?? undefined,
    }})
  }})

  amp.on("tool.call", async (event, _ctx) => {{
    // Fire-and-forget: do not await so tool execution is never stalled by hook latency
    post({{
      hook_event_name: "ToolCall",
      tool: event.tool,
      arguments: event.args ?? event.arguments ?? event.input,
    }})
    return {{ action: "allow" }}
  }})

  amp.on("tool.result", async (event, _ctx) => {{
    await post({{
      hook_event_name: "ToolResult",
      tool: event?.tool,
      arguments: event?.args ?? event?.arguments ?? event?.input,
    }})
    return {{ action: "allow" }}
  }})

  amp.on("agent.end", async (event, _ctx) => {{
    await post({{ hook_event_name: "AgentEnd", status: event.status }})
  }})
}}
"#,
        port = port,
        hook_version = CURRENT_HOOK_VERSION,
        hook_version_header = hook_version_header_ts(),
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

    match std::fs::read_to_string(&plugin_file) {
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        Ok(content) if !content.contains(PLUGIN_MARKER) => {
            return AgentHookToolStatus::detected_uninstalled(path_str);
        }
        Ok(_) => {}
    }

    match std::fs::remove_file(&plugin_file) {
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
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
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let content = std::fs::read_to_string(&plugin_file).unwrap_or_default();
    installed_status_from_content(path_str, content.contains(PLUGIN_MARKER), &content)
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
    fn plugin_posts_prompt_and_tool_extras() {
        let source = build_plugin_source(4310);
        assert!(source.contains(r#"amp.on("agent.start""#), "{source}");
        assert!(source.contains("prompt: event?.prompt"), "{source}");
        assert!(source.contains(r#"amp.on("tool.call""#), "{source}");
        assert!(
            source.contains(r#"hook_event_name: "ToolCall""#),
            "{source}"
        );
        assert!(source.contains("arguments: event.args"), "{source}");
    }
}
