use std::path::Path;

use serde_json::{json, Value};
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

function atmosHeaders() {{
  return {{
    "Content-Type": "application/json",
    "X-Atmos-Context": process.env?.ATMOS_CONTEXT_ID ?? "",
    "X-Atmos-Pane": process.env?.ATMOS_PANE_ID ?? "",
    "X-Atmos-Terminal-Kind": process.env?.ATMOS_TERMINAL_KIND ?? "",
    "X-Atmos-Side-Chat-Id": process.env?.ATMOS_SIDE_CHAT_ID ?? "",
    "X-Atmos-Source-Pane": process.env?.ATMOS_SOURCE_PANE_ID ?? "",
    {hook_version_header}
  }}
}}

async function post(event: object) {{
  if (typeof process !== "undefined" && process.env?.ATMOS_MANAGED !== "1") return null
  try {{
    await fetch(ATMOS_URL, {{
      method: "POST",
      headers: atmosHeaders(),
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    }})
  }} catch {{
    // silent — Atmos service may not be running
  }}
  return null
}}

async function postDecision(event: object) {{
  if (typeof process !== "undefined" && process.env?.ATMOS_MANAGED !== "1") return null
  try {{
    const response = await fetch(ATMOS_URL, {{
      method: "POST",
      headers: atmosHeaders(),
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(590000),
    }})
    return await response.json()
  }} catch {{
    return null
  }}
}}

export default {{
  id: "atmos",
  server: async ({{ client, serverUrl }}: any) => {{
    const heyApi = client?._client
    const serverPort = Number(serverUrl?.port) || 4096

    async function replyPermission(requestId: string, reply: string) {{
      const body = {{ reply, message: reply === "reject" ? "Denied" : "" }}
      try {{
        if (typeof heyApi?.request === "function") {{
          await heyApi.request({{
            method: "POST",
            url: "/permission/{{requestID}}/reply",
            path: {{ requestID: requestId }},
            body,
          }})
          return
        }}
      }} catch {{}}
      try {{
        await fetch(`http://127.0.0.1:${{serverPort}}/permission/${{requestId}}/reply`, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify(body),
        }})
      }} catch {{}}
    }}

    async function replyQuestion(requestId: string, answers: string[][]) {{
      const body = {{ answers }}
      try {{
        if (typeof heyApi?.request === "function") {{
          await heyApi.request({{
            method: "POST",
            url: "/question/{{requestID}}/reply",
            path: {{ requestID: requestId }},
            body,
          }})
          return
        }}
      }} catch {{}}
      try {{
        await fetch(`http://127.0.0.1:${{serverPort}}/question/${{requestId}}/reply`, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify(body),
        }})
      }} catch {{}}
    }}

    async function rejectQuestion(requestId: string) {{
      try {{
        if (typeof heyApi?.request === "function") {{
          await heyApi.request({{
            method: "POST",
            url: "/question/{{requestID}}/reject",
            path: {{ requestID: requestId }},
          }})
          return
        }}
      }} catch {{}}
      try {{
        await fetch(`http://127.0.0.1:${{serverPort}}/question/${{requestId}}/reject`, {{
          method: "POST",
        }})
      }} catch {{}}
    }}

    async function answer(event: any) {{
      const props = event?.properties ?? event ?? {{}}
      const requestId = props.id
      if (!requestId) return
      const type = String(event?.type ?? "")
      const question = type.startsWith("question.")
      const name = question ? "AskUserQuestion" : String(props.permission ?? props.action ?? "tool")
      const patterns = Array.isArray(props.patterns) ? props.patterns : []
      const questions = Array.isArray(props.questions)
        ? props.questions.map((item: any, index: number) => ({{
            id: String(item?.id ?? index),
            question: String(item?.question ?? item?.prompt ?? ""),
            header: item?.header,
            options: Array.isArray(item?.options)
              ? item.options.map((option: any) => ({{
                  label: String(option?.label ?? option ?? ""),
                  description: option?.description,
                }}))
              : [],
            multiSelect: Boolean(item?.multiple ?? item?.multiSelect),
          }}))
        : []
      const decision = await postDecision({{
        hook_event_name: "PermissionRequest",
        tool_name: name,
        tool_use_id: requestId,
        session_id: props.sessionID,
        cwd: props.cwd,
        tool_input: question
          ? {{ questions }}
          : {{
              command: patterns.join(" && "),
              patterns,
              ...(props.metadata ?? {{}}),
            }},
      }})
      const behavior = decision?.hookSpecificOutput?.decision?.behavior
      if (!behavior) return
      if (question) {{
        if (behavior === "deny") {{
          await rejectQuestion(requestId)
          return
        }}
        const answers = decision?.hookSpecificOutput?.decision?.updatedInput?.answers ?? {{}}
        const rows = Object.values(answers).map((value) => [String(value ?? "")])
        await replyQuestion(requestId, rows)
        return
      }}
      await replyPermission(requestId, behavior === "allow" ? "once" : "reject")
    }}

    return {{
      event: async ({{ event }}: any) => {{
        const t = event?.type
        if (t === "permission.asked" || t === "permission.v2.asked" || t === "question.asked" || t === "question.v2.asked") {{
          await answer(event)
          return
        }}
        if (t === "session.created" || t === "session.idle" || t === "session.error" || t === "permission.replied" || t === "permission.updated") {{
          await post(event)
        }}
      }},
      "chat.message": async (input: any, output: any) => {{
        const role = output?.message?.role
        if (role && role !== "user") return
        void post({{
          type: "chat.message",
          input,
          output: {{ message: output?.message, parts: output?.parts }},
        }})
      }},
      "tool.execute.before": async (input: any, output: any) => {{
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
  }},
}}
"#,
        PLUGIN_MARKER = PLUGIN_MARKER,
        port = port,
        hook_version = CURRENT_HOOK_VERSION,
        hook_version_header = hook_version_header_ts(),
    )
}

const PLUGIN_ID: &str = "atmos_plugin";

fn config_dir() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|home| home.join(".config").join("opencode"))
}

fn register_plugin(plugin_file: &Path) {
    let Some(dir) = config_dir() else {
        return;
    };
    if !dir.exists() {
        return;
    }
    let jsonc = dir.join("opencode.jsonc");
    let json_path = dir.join("opencode.json");
    let target = if jsonc.exists() { jsonc } else { json_path };
    let original = std::fs::read_to_string(&target).unwrap_or_default();
    let Some(next) = merge_plugin_config(&original, &plugin_file_url(plugin_file)) else {
        debug!("left OpenCode config unchanged because it is not valid JSON");
        return;
    };
    if next != original {
        let _ = std::fs::write(&target, next);
    }
}

fn unregister_plugin() {
    let Some(dir) = config_dir() else {
        return;
    };
    for name in ["opencode.jsonc", "opencode.json"] {
        let path = dir.join(name);
        let Ok(original) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Some(next) = remove_plugin_config(&original) else {
            continue;
        };
        if next != original {
            let _ = std::fs::write(&path, next);
        }
    }
}

fn plugin_file_url(plugin_file: &Path) -> String {
    format!("file://{}", plugin_file.display())
}

fn merge_plugin_config(original: &str, plugin_ref: &str) -> Option<String> {
    if original.trim().is_empty() {
        return Some(format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "$schema": "https://opencode.ai/config.json",
                "plugin": [plugin_ref],
            }))
            .ok()?
        ));
    }
    let mut value: Value = serde_json::from_str(original).ok()?;
    let obj = value.as_object_mut()?;
    let plugins = obj
        .entry("plugin")
        .or_insert_with(|| json!([]))
        .as_array_mut()?;
    plugins.retain(|entry| !entry.as_str().unwrap_or("").contains(PLUGIN_ID));
    plugins.push(json!(plugin_ref));
    let mut text = serde_json::to_string_pretty(&value).ok()?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Some(text)
}

fn remove_plugin_config(original: &str) -> Option<String> {
    let mut value: Value = serde_json::from_str(original).ok()?;
    let plugins = value.get_mut("plugin")?.as_array_mut()?;
    let before = plugins.len();
    plugins.retain(|entry| !entry.as_str().unwrap_or("").contains(PLUGIN_ID));
    if plugins.len() == before {
        return None;
    }
    if plugins.is_empty() {
        value.as_object_mut()?.remove("plugin");
    }
    let mut text = serde_json::to_string_pretty(&value).ok()?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Some(text)
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
            register_plugin(&plugin_file);
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
        Ok(()) => {
            unregister_plugin();
            AgentHookToolStatus::detected_uninstalled(&path_str)
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
        assert!(source.contains("postDecision"), "{source}");
        assert!(source.contains("/permission/{requestID}/reply"), "{source}");
        assert!(
            source.contains("hook_event_name: \"PermissionRequest\""),
            "{source}"
        );
        assert!(source.contains("input,"), "{source}");
        assert!(source.contains("output,"), "{source}");
        assert!(!source.contains("UserPromptSubmit"), "{source}");
        assert!(!source.contains("message.updated"), "{source}");
    }
}
