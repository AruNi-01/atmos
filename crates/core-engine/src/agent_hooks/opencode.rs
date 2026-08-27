use tracing::{debug, info};

use super::{
    home_dir, hook_version_header_ts, installed_status_from_content, AgentHookToolStatus,
    CURRENT_HOOK_VERSION,
};

fn plugin_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| {
        h.join(".config")
            .join("opencode")
            .join("plugins")
            .join("atmos_plugin.ts")
    })
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
const ATMOS_URL = "http://localhost:{port}/hooks/opencode"
const ATMOS_HOOK_VERSION = {hook_version}

async function post(event: object) {{
  if (typeof process !== "undefined" && process.env?.ATMOS_MANAGED !== "1") return
  try {{
    await fetch(ATMOS_URL, {{
      method: "POST",
      headers: {{
        "Content-Type": "application/json",
        "X-Atmos-Context": process.env?.ATMOS_CONTEXT_ID ?? "",
        "X-Atmos-Pane": process.env?.ATMOS_PANE_ID ?? "",
        "X-Atmos-Terminal-Kind": process.env?.ATMOS_TERMINAL_KIND ?? "",
        "X-Atmos-Side-Chat-Id": process.env?.ATMOS_SIDE_CHAT_ID ?? "",
        "X-Atmos-Source-Pane": process.env?.ATMOS_SOURCE_PANE_ID ?? "",
        {hook_version_header}
      }},
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    }})
  }} catch {{
    // silent — Atmos service may not be running
  }}
}}

export const AtmosPlugin = async (_ctx: any) => {{
  let phase: "idle" | "running" = "idle"
  let lastStateTs = 0
  return {{
    event: async ({{ event }}) => {{
      const t = event.type
      const now = Date.now()

      if (t === "session.created") {{
        phase = "idle"
        lastStateTs = now
        await post(event)
        return
      }}

      if (t === "session.idle" || t === "session.error") {{
        phase = "idle"
        lastStateTs = now
        await post(event)
        return
      }}

      if (t === "permission.asked" || t === "permission.updated" || t === "question.asked") {{
        phase = "idle"
        lastStateTs = now
        await post(event)
        return
      }}

      if (t === "permission.replied") {{
        phase = "idle"
        lastStateTs = now
        await post(event)
        return
      }}
    }},
    "chat.message": async (input: any, output: any) => {{
      const role = output?.message?.role
      if (role && role !== "user") return
      phase = "running"
      lastStateTs = Date.now()
      void post({{
        type: "chat.message",
        input,
        output: {{ message: output?.message, parts: output?.parts }},
      }})
    }},
    "tool.execute.before": async (input: any, output: any) => {{
      phase = "running"
      lastStateTs = Date.now()
      void post({{
        type: "tool.execute.before",
        input,
        output,
      }})
    }},
    "tool.execute.after": async (input: any, output: any) => {{
      void post({{
        type: "tool.execute.after",
        input,
        output,
      }})
    }},
  }}
}}
"#,
        PLUGIN_MARKER = PLUGIN_MARKER,
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
            info!(
                "opencode plugin installed at {} ({} bytes). Restart opencode to activate.",
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
            return AgentHookToolStatus::detected_uninstalled(path_str);
        }
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

    let opencode_config_dir = plugin_file.parent().and_then(|d| d.parent());
    let has_config = opencode_config_dir.is_some_and(|d| d.exists());
    let has_binary = which_exists("opencode");
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
    fn plugin_posts_chat_message_and_tool_execute_hooks() {
        let source = build_plugin_source(4310);
        assert!(source.contains(r#""chat.message""#), "{source}");
        assert!(source.contains("output?.message"), "{source}");
        assert!(source.contains("output?.parts"), "{source}");
        assert!(source.contains(r#""tool.execute.before""#), "{source}");
        assert!(source.contains("type: \"tool.execute.before\""), "{source}");
        assert!(source.contains("void post({"), "{source}");
        assert!(source.contains("input,"), "{source}");
        assert!(source.contains("output,"), "{source}");
        assert!(!source.contains("UserPromptSubmit"), "{source}");
        assert!(!source.contains("message.updated"), "{source}");
    }
}
