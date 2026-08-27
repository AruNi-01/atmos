use tracing::{debug, info};

use super::{
    home_dir, hook_version_header_ts, installed_status_from_content, AgentHookToolStatus,
    CURRENT_HOOK_VERSION,
};

fn extension_path() -> Option<std::path::PathBuf> {
    home_dir().ok().map(|h| {
        h.join(".pi")
            .join("agent")
            .join("extensions")
            .join("atmos-hooks.ts")
    })
}

fn extension_dir_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".pi").join("agent").join("extensions"))
}

const PLUGIN_MARKER: &str = "// Atmos agent hook extension";

fn build_extension_source(port: u16) -> String {
    format!(
        r#"// Atmos agent hook extension
const ATMOS_URL = "http://localhost:{port}/hooks/pi"
const ATMOS_HOOK_VERSION = {hook_version}

export default function (pi: any) {{
  if (process.env.ATMOS_MANAGED !== "1") return

  const post = (hook_event_name: string, extra: Record<string, unknown> = {{}}) =>
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
      body: JSON.stringify({{
        hook_event_name,
        cwd: process.cwd(),
        ...extra,
      }}),
      signal: AbortSignal.timeout(3000),
    }}).catch(() => {{}})

  pi.on("session_start", (event: any) =>
    post("SessionStart", {{ reason: event?.reason }})
  )
  pi.on("before_agent_start", (event: any) =>
    post("BeforeAgentStart", {{ prompt: event?.prompt }})
  )
  pi.on("agent_start", () => post("AgentStart"))
  pi.on("tool_call", (event: any) => {{
    post("ToolCall", {{
      tool: event?.toolName,
      tool_call_id: event?.toolCallId,
      arguments: event?.args ?? event?.arguments ?? event?.input,
    }})
  }})
  pi.on("tool_result", (event: any) =>
    post("ToolResult", {{
      tool: event?.toolName,
      tool_call_id: event?.toolCallId,
      arguments: event?.args ?? event?.arguments ?? event?.input,
    }})
  )
  pi.on("agent_end", () => post("AgentEnd"))
  pi.on("session_shutdown", (event: any) =>
    post("SessionShutdown", {{ reason: event?.reason }})
  )
}}
"#,
        port = port,
        hook_version = CURRENT_HOOK_VERSION,
        hook_version_header = hook_version_header_ts(),
    )
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let extension_file = match extension_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };
    let extension_dir = match extension_dir_path() {
        Some(d) => d,
        None => return AgentHookToolStatus::not_detected(),
    };

    let pi_config_dir = extension_dir.parent().unwrap();
    let has_config = pi_config_dir.exists();
    let has_binary = which_exists("pi");
    if !has_config && !has_binary {
        debug!("Pi not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    let path_str = extension_file.display().to_string();

    if !extension_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&extension_dir) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }

    let source = build_extension_source(port);
    if extension_file.exists() {
        if let Ok(existing) = std::fs::read_to_string(&extension_file) {
            if existing == source {
                return AgentHookToolStatus::success(&path_str);
            }
        }
    }

    match std::fs::write(&extension_file, &source) {
        Ok(()) => {
            info!(
                "Pi hook extension installed at {} ({} bytes). Restart Pi to activate.",
                path_str,
                source.len()
            );
            AgentHookToolStatus::success(&path_str)
        }
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let extension_file = match extension_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = extension_file.display().to_string();

    match std::fs::read_to_string(&extension_file) {
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        Ok(content) if !content.contains(PLUGIN_MARKER) => {
            return AgentHookToolStatus::detected_uninstalled(path_str);
        }
        Ok(_) => {}
    }

    match std::fs::remove_file(&extension_file) {
        Ok(()) => AgentHookToolStatus::detected_uninstalled(&path_str),
        Err(e) => AgentHookToolStatus::failed(&path_str, e.to_string()),
    }
}

pub(super) fn check() -> AgentHookToolStatus {
    let extension_file = match extension_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let pi_config_dir = extension_file.parent().and_then(|d| d.parent());
    let has_config = pi_config_dir.is_some_and(|d| d.exists());
    let has_binary = which_exists("pi");
    if !has_config && !has_binary {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = extension_file.display().to_string();

    if !extension_file.exists() {
        return AgentHookToolStatus::detected_uninstalled(path_str);
    }

    let content = std::fs::read_to_string(&extension_file).unwrap_or_default();
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
    fn extension_posts_prompt_from_before_agent_start() {
        let source = build_extension_source(4310);
        assert!(source.contains(r#"pi.on("before_agent_start""#), "{source}");
        assert!(source.contains(r#"post("BeforeAgentStart""#), "{source}");
        assert!(source.contains("prompt: event?.prompt"), "{source}");
        assert!(source.contains(r#"pi.on("agent_start""#), "{source}");
        assert!(source.contains(r#"post("AgentStart")"#), "{source}");
        assert!(
            !source.contains(r#"post("AgentStart", { prompt:"#),
            "{source}"
        );
        assert!(source.contains(r#"post("ToolCall""#), "{source}");
        assert!(source.contains("tool: event?.toolName"), "{source}");
    }
}
