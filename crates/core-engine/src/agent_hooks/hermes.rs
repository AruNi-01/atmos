use std::os::unix::fs::PermissionsExt;

use tracing::{debug, info};

use super::{home_dir, AgentHookToolStatus};

const CONFIG_MARKER_PREFIX: &str = "    # ATMOS_MANAGED hook:";
const SCRIPT_MARKER: &str = "# Atmos agent hook script";
const HOOK_EVENTS: [&str; 6] = [
    "on_session_start",
    "pre_llm_call",
    "pre_tool_call",
    "post_tool_call",
    "post_llm_call",
    "on_session_end",
];

fn config_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".hermes").join("config.yaml"))
}

fn hook_script_path() -> Option<std::path::PathBuf> {
    home_dir()
        .ok()
        .map(|h| h.join(".hermes").join("agent-hooks").join("atmos-hook.sh"))
}

fn hook_url(port: u16) -> String {
    format!("http://localhost:{}/hooks/hermes", port)
}

fn build_hook_script(port: u16) -> String {
    let url = hook_url(port);
    format!(
        r#"#!/bin/sh
# Atmos agent hook script
[ "$ATMOS_MANAGED" = "1" ] || exit 0

payload="$(cat)"
[ -n "$payload" ] || exit 0

curl -sf -X POST \
  -H 'Content-Type: application/json' \
  -H "X-Atmos-Context: $ATMOS_CONTEXT_ID" \
  -H "X-Atmos-Pane: $ATMOS_PANE_ID" \
  -d "$payload" \
  '{url}' >/dev/null 2>&1 || true
"#,
        url = url,
    )
}

fn build_hook_entry(event: &str, script_path: &std::path::Path) -> Vec<String> {
    let command = shell_quote_str(&script_path.to_string_lossy());
    vec![
        format!("{CONFIG_MARKER_PREFIX} {event}"),
        format!("    - command: \"{command}\""),
        "      timeout: 5".to_string(),
    ]
}

pub(super) fn install(port: u16) -> AgentHookToolStatus {
    let config_file = match config_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };
    let script_file = match hook_script_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let hermes_dir = config_file.parent().unwrap();
    let has_config = hermes_dir.exists();
    let has_binary = which_exists("hermes");
    if !has_config && !has_binary {
        debug!("Hermes not detected (no config dir, not in PATH), skipping");
        return AgentHookToolStatus::not_detected();
    }

    let path_str = config_file.display().to_string();

    if let Some(script_dir) = script_file.parent() {
        if let Err(e) = std::fs::create_dir_all(script_dir) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }
    if let Err(e) = std::fs::create_dir_all(hermes_dir) {
        return AgentHookToolStatus::failed(&path_str, e.to_string());
    }

    let script = build_hook_script(port);
    if let Err(e) = std::fs::write(&script_file, script) {
        return AgentHookToolStatus::failed(&path_str, e.to_string());
    }
    if let Err(e) = make_executable(&script_file) {
        return AgentHookToolStatus::failed(&path_str, e);
    }

    let current_config = if config_file.exists() {
        match std::fs::read_to_string(&config_file) {
            Ok(content) => content,
            Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
        }
    } else {
        String::new()
    };
    let next_config = install_config_entries(&current_config, &script_file);

    if next_config != current_config {
        if let Err(e) = std::fs::write(&config_file, next_config) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }

    info!(
        "Hermes shell hooks installed at {} and {}. Restart Hermes to activate.",
        path_str,
        script_file.display()
    );
    AgentHookToolStatus::success(path_str)
}

pub(super) fn uninstall() -> AgentHookToolStatus {
    let config_file = match config_path() {
        Some(p) if p.exists() => p,
        _ => return AgentHookToolStatus::not_detected(),
    };

    let path_str = config_file.display().to_string();
    let config = match std::fs::read_to_string(&config_file) {
        Ok(content) => content,
        Err(e) => return AgentHookToolStatus::failed(&path_str, e.to_string()),
    };

    let next_config = remove_config_block(&config);
    if next_config != config {
        if let Err(e) = std::fs::write(&config_file, next_config) {
            return AgentHookToolStatus::failed(&path_str, e.to_string());
        }
    }

    if let Some(script_file) = hook_script_path() {
        if script_file.exists() {
            let should_remove = std::fs::read_to_string(&script_file)
                .map(|content| content.contains(SCRIPT_MARKER))
                .unwrap_or(false);
            if should_remove {
                let _ = std::fs::remove_file(script_file);
            }
        }
    }

    let mut status = AgentHookToolStatus::success(path_str);
    status.installed = false;
    status
}

pub(super) fn check() -> AgentHookToolStatus {
    let config_file = match config_path() {
        Some(p) => p,
        None => return AgentHookToolStatus::not_detected(),
    };

    let hermes_dir = config_file.parent().unwrap();
    let has_config = hermes_dir.exists();
    let has_binary = which_exists("hermes");
    if !has_config && !has_binary {
        return AgentHookToolStatus::not_detected();
    }

    let path_str = config_file.display().to_string();
    let config_installed = config_file
        .exists()
        .then(|| std::fs::read_to_string(&config_file).ok())
        .flatten()
        .map(|content| content.contains(CONFIG_MARKER_PREFIX))
        .unwrap_or(false);
    let script_installed = hook_script_path()
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|content| content.contains(SCRIPT_MARKER))
        .unwrap_or(false);

    AgentHookToolStatus {
        detected: true,
        installed: config_installed && script_installed,
        config_path: Some(path_str),
        error: None,
    }
}

fn install_config_entries(current: &str, script_path: &std::path::Path) -> String {
    let without_existing = remove_config_block(current);
    let mut lines: Vec<String> = without_existing.lines().map(String::from).collect();
    if !lines.iter().any(|line| line.trim() == "hooks:") {
        let mut next = without_existing.trim_end().to_string();
        if !next.is_empty() {
            next.push_str("\n\n");
        }
        next.push_str("hooks:\n");
        for event in HOOK_EVENTS {
            next.push_str(&format!("  {event}:\n"));
            for line in build_hook_entry(event, script_path) {
                next.push_str(&line);
                next.push('\n');
            }
        }
        return next;
    }

    for event in HOOK_EVENTS {
        lines = insert_hook_entry(lines, event, script_path);
    }

    let mut next = lines.join("\n");
    next.push('\n');
    next
}

fn insert_hook_entry(
    mut lines: Vec<String>,
    event: &str,
    script_path: &std::path::Path,
) -> Vec<String> {
    let event_line = format!("  {event}:");
    if let Some(idx) = lines.iter().position(|line| line == &event_line) {
        let entry = build_hook_entry(event, script_path);
        for (offset, line) in entry.into_iter().enumerate() {
            lines.insert(idx + 1 + offset, line);
        }
        return lines;
    }

    let hooks_idx = lines
        .iter()
        .position(|line| line.trim() == "hooks:")
        .unwrap_or(lines.len());
    let end_idx = lines
        .iter()
        .enumerate()
        .skip(hooks_idx + 1)
        .find(|(_, line)| !line.trim().is_empty() && !line.starts_with(' '))
        .map(|(idx, _)| idx)
        .unwrap_or(lines.len());
    let mut event_block = vec![event_line];
    event_block.extend(build_hook_entry(event, script_path));
    for (offset, line) in event_block.into_iter().enumerate() {
        lines.insert(end_idx + offset, line);
    }
    lines
}

fn remove_config_block(current: &str) -> String {
    let mut out = Vec::new();
    let mut skip_remaining = 0usize;
    for line in current.lines() {
        if skip_remaining > 0 {
            skip_remaining -= 1;
            continue;
        }
        if line.starts_with(CONFIG_MARKER_PREFIX) {
            // Managed entries are always one list item with a timeout child.
            skip_remaining = 2;
            continue;
        }
        out.push(line);
    }
    let mut next = out.join("\n");
    if current.ends_with('\n') && !next.is_empty() {
        next.push('\n');
    }
    next
}

fn make_executable(path: &std::path::Path) -> std::result::Result<(), String> {
    let mut perms = std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
    perms.set_mode(perms.mode() | 0o700);
    std::fs::set_permissions(path, perms).map_err(|error| error.to_string())
}

fn shell_quote_str(raw: &str) -> String {
    format!("'{}'", raw.replace('\'', "'\\''"))
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
    fn install_config_entries_preserves_existing_hooks() {
        let current = "model: hermes\nhooks:\n  post_tool_call:\n    - command: old\n";

        let next = install_config_entries(current, std::path::Path::new("/tmp/atmos-hook.sh"));

        assert!(next.contains(CONFIG_MARKER_PREFIX));
        assert!(next.contains("    - command: old"));
        assert_eq!(next.matches("hooks:").count(), 1);
        assert_eq!(next.matches("post_tool_call:").count(), 1);
    }

    #[test]
    fn install_config_entries_creates_hooks_section() {
        let next = install_config_entries(
            "model: hermes\n",
            std::path::Path::new("/tmp/atmos-hook.sh"),
        );

        assert!(next.contains("hooks:\n"));
        assert!(next.contains(CONFIG_MARKER_PREFIX));
    }

    #[test]
    fn remove_config_block_is_idempotent() {
        let current = install_config_entries(
            "hooks:\n  post_tool_call:\n    - command: old\n",
            std::path::Path::new("/tmp/atmos-hook.sh"),
        );

        let once = remove_config_block(&current);
        let twice = remove_config_block(&once);

        assert_eq!(once, twice);
        assert!(!once.contains(CONFIG_MARKER_PREFIX));
        assert!(once.contains("    - command: old"));
    }
}
