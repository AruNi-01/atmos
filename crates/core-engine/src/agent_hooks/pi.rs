use tracing::{debug, info};

use super::{home_dir, AgentHookToolStatus};

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

export default function (pi: any) {{
  if (process.env.ATMOS_MANAGED !== "1") return

  const post = (hook_event_name: string, extra: Record<string, unknown> = {{}}) =>
    fetch(ATMOS_URL, {{
      method: "POST",
      headers: {{
        "Content-Type": "application/json",
        "X-Atmos-Context": process.env.ATMOS_CONTEXT_ID ?? "",
        "X-Atmos-Pane": process.env.ATMOS_PANE_ID ?? "",
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
  pi.on("before_agent_start", () => post("BeforeAgentStart"))
  pi.on("agent_start", () => post("AgentStart"))
  pi.on("tool_call", (event: any) => {{
    post("ToolCall", {{ tool: event?.toolName, tool_call_id: event?.toolCallId }})
  }})
  pi.on("tool_result", (event: any) =>
    post("ToolResult", {{ tool: event?.toolName, tool_call_id: event?.toolCallId }})
  )
  pi.on("agent_end", () => post("AgentEnd"))
  pi.on("session_shutdown", (event: any) =>
    post("SessionShutdown", {{ reason: event?.reason }})
  )
}}
"#,
        port = port,
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
            return AgentHookToolStatus {
                detected: true,
                installed: false,
                config_path: Some(path_str),
                error: None,
            };
        }
        Ok(_) => {}
    }

    match std::fs::remove_file(&extension_file) {
        Ok(()) => {
            let mut status = AgentHookToolStatus::success(&path_str);
            status.installed = false;
            status
        }
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
        return AgentHookToolStatus {
            detected: true,
            installed: false,
            config_path: Some(path_str),
            error: None,
        };
    }

    let installed = std::fs::read_to_string(&extension_file)
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
