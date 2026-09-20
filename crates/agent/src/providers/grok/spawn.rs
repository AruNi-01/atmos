//! Chat spawn override: `grok --permission-mode <selected|default> agent stdio`.
//! Ignore Terminal `-p` / streaming-json args.

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::contract::{AgentProviderError, AgentResult, AgentRuntimeConfig};
use crate::models::AgentLaunchSpec;

/// Chat permission overlay default. `default` is the published ask mode (not
/// `--always-approve` / `--yolo`). Must sit **before** `agent`;
/// `grok agent --permission-mode` is rejected by the CLI.
pub const CHAT_PERMISSION_MODE: &str = "default";

/// Live `grok --help` values (1.0.17). Picker stamps a subset; unknown ids fall back.
const GROK_PERMISSION_MODE_IDS: &[&str] = &[
    "default",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
    "plan",
];

/// Session-only Chat env overlay. Never write `~/.grok/config.toml`.
///
/// Grok 1.0.17 scans Cursor `mcp.json` and Claude MCP config by default
/// (`compat.cursor.mcps` / `compat.claude.mcps`). Empty `session/new`
/// `mcpServers` does not stop that scan. HTTP MCP Connection refused and
/// Cloudflare-plugin OAuth `AuthRequired` can `worker quit with fatal` even
/// after `session/new` succeeds.
///
/// Names confirmed against grok 1.0.17 (`grok --help` / docs /
/// `GROK_CURSOR_MCPS_ENABLED` + `GROK_CLAUDE_MCPS_ENABLED` in the binary).
/// Values `0`/`false` disable (same as `GROK_MEMORY` / `GROK_WORKFLOWS`).
pub const CHAT_MCP_ISOLATION_ENV: &[(&str, &str)] = &[
    ("GROK_CURSOR_MCPS_ENABLED", "0"),
    ("GROK_CLAUDE_MCPS_ENABLED", "0"),
];

pub fn apply_chat_env_overlay(env: &mut HashMap<String, String>) {
    for (key, value) in CHAT_MCP_ISOLATION_ENV {
        env.insert((*key).to_string(), (*value).to_string());
    }
}

fn apply_chat_env_to_command(cmd: &mut Command) {
    for (key, value) in CHAT_MCP_ISOLATION_ENV {
        cmd.env(*key, *value);
    }
}

pub fn resolved_permission_mode(value: Option<&str>) -> String {
    let Some(raw) = value.map(str::trim).filter(|mode| !mode.is_empty()) else {
        return CHAT_PERMISSION_MODE.to_string();
    };
    if GROK_PERMISSION_MODE_IDS.contains(&raw) {
        return raw.to_string();
    }
    crate::policy::atmos_permission_to_vendor("grok", raw)
        .filter(|vendor| GROK_PERMISSION_MODE_IDS.contains(&vendor.as_str()))
        .unwrap_or_else(|| CHAT_PERMISSION_MODE.to_string())
}

/// Chat argv. `--permission-mode` is a parent flag. Optional `--model <id>`
/// is inserted before `stdio`.
/// Never `-p`, `--output-format streaming-json`, `serve`, `--always-approve`, or `--yolo`.
pub fn chat_argv(model: Option<&str>, permission_mode: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "--permission-mode".into(),
        resolved_permission_mode(permission_mode),
        "agent".to_string(),
    ];
    if let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--model".into());
        args.push(model.to_string());
    }
    args.push("stdio".into());
    args
}

pub fn launch_spec(
    program: &str,
    model: Option<&str>,
    permission_mode: Option<&str>,
    env: Option<HashMap<String, String>>,
) -> AgentLaunchSpec {
    let mut env = env.unwrap_or_default();
    apply_chat_env_overlay(&mut env);
    AgentLaunchSpec {
        program: program.to_string(),
        args: chat_argv(model, permission_mode),
        env: Some(env),
    }
}

pub fn program_from_launch_spec(spec: &AgentLaunchSpec) -> String {
    let _ = &spec.args;
    spec.program.clone()
}

pub fn merge_env(
    provider_env: Option<&HashMap<String, String>>,
    cfg: &AgentRuntimeConfig,
) -> Option<HashMap<String, String>> {
    let mut env = match (provider_env.cloned(), cfg.env_overrides.clone()) {
        (Some(mut a), Some(b)) => {
            a.extend(b);
            a
        }
        (Some(a), None) => a,
        (None, Some(b)) => b,
        (None, None) => HashMap::new(),
    };
    apply_chat_env_overlay(&mut env);
    Some(env)
}

pub(crate) struct SpawnedGrok {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
}

/// Short-lived `grok agent stdio` for catalog probe. Same argv as Chat, no model flag.
pub(crate) fn spawn_stdio(program: &Path, cwd: &Path) -> AgentResult<SpawnedGrok> {
    let mut cmd = Command::new(program);
    cmd.args(chat_argv(None, None))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if cwd.exists() {
        cmd.current_dir(cwd);
    }
    apply_chat_env_to_command(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|error| AgentProviderError::message(format!("failed to spawn grok: {error}")))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentProviderError::message("grok stdin not available"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentProviderError::message("grok stdout not available"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentProviderError::message("grok stderr not available"))?;
    Ok(SpawnedGrok {
        child,
        stdin,
        stdout,
        stderr,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app069_s4_chat_argv_is_agent_stdio_without_terminal_flags() {
        let argv = chat_argv(None, None);
        assert_eq!(argv, vec!["--permission-mode", "default", "agent", "stdio"]);
        assert_eq!(CHAT_PERMISSION_MODE, "default");
        let permission = argv
            .iter()
            .position(|arg| arg == "--permission-mode")
            .expect("--permission-mode");
        let agent = argv.iter().position(|arg| arg == "agent").expect("agent");
        assert!(permission < agent, "parent flag must precede agent");
        assert!(!argv.iter().any(|arg| arg == "-p" || arg == "--print"));
        assert!(!argv.iter().any(|arg| arg == "streaming-json"
            || arg == "--output-format"
            || arg == "serve"
            || arg == "--always-approve"
            || arg == "--yolo"));
    }

    #[test]
    fn chat_argv_uses_selected_permission_mode() {
        assert_eq!(
            chat_argv(None, Some("plan")),
            vec!["--permission-mode", "plan", "agent", "stdio"]
        );
        assert_eq!(
            chat_argv(None, Some("bypassPermissions")),
            vec!["--permission-mode", "bypassPermissions", "agent", "stdio"]
        );
        assert_eq!(
            chat_argv(None, Some("yolo")),
            vec!["--permission-mode", "bypassPermissions", "agent", "stdio"]
        );
        assert_eq!(
            chat_argv(None, Some("ask_always")),
            vec!["--permission-mode", "default", "agent", "stdio"]
        );
        assert_eq!(
            chat_argv(None, Some("not-a-mode")),
            vec!["--permission-mode", "default", "agent", "stdio"]
        );
        let argv = chat_argv(None, Some("bypassPermissions"));
        assert!(!argv
            .iter()
            .any(|arg| arg == "--always-approve" || arg == "--yolo"));
        let spec = launch_spec("/opt/grok", None, Some("auto"), None);
        assert_eq!(
            spec.args,
            vec!["--permission-mode", "auto", "agent", "stdio"]
        );
    }

    #[test]
    fn app069_s4_chat_argv_puts_model_before_stdio() {
        let argv = chat_argv(Some("grok-4.5"), None);
        assert_eq!(
            argv,
            vec![
                "--permission-mode",
                "default",
                "agent",
                "--model",
                "grok-4.5",
                "stdio"
            ]
        );
        let stdio = argv.iter().position(|arg| arg == "stdio").expect("stdio");
        let model_flag = argv
            .iter()
            .position(|arg| arg == "--model")
            .expect("--model");
        let agent = argv.iter().position(|arg| arg == "agent").expect("agent");
        assert!(model_flag > agent);
        assert!(model_flag < stdio);
        assert_eq!(argv[model_flag + 1], "grok-4.5");
    }

    #[test]
    fn launch_spec_ignores_terminal_print_args() {
        let spec = AgentLaunchSpec {
            program: "/opt/grok".into(),
            args: vec![
                "--output-format".into(),
                "streaming-json".into(),
                "-p".into(),
            ],
            env: None,
        };
        assert_eq!(program_from_launch_spec(&spec), "/opt/grok");
        let chat = launch_spec("/opt/grok", None, None, None);
        assert_eq!(
            chat.args,
            vec!["--permission-mode", "default", "agent", "stdio"]
        );
        assert_eq!(chat.program, "/opt/grok");
        let env = chat.env.expect("chat spawn env overlay");
        assert_eq!(
            env.get("GROK_CURSOR_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert_eq!(
            env.get("GROK_CLAUDE_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert!(!chat
            .args
            .iter()
            .any(|arg| arg == "--always-approve" || arg == "--yolo"));
    }

    #[test]
    fn chat_spawn_env_disables_cursor_and_claude_mcps() {
        assert_eq!(
            CHAT_MCP_ISOLATION_ENV,
            &[
                ("GROK_CURSOR_MCPS_ENABLED", "0"),
                ("GROK_CLAUDE_MCPS_ENABLED", "0"),
            ]
        );
        let empty = merge_env(None, &AgentRuntimeConfig::default()).expect("overlay");
        assert_eq!(
            empty.get("GROK_CURSOR_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert_eq!(
            empty.get("GROK_CLAUDE_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert!(!empty.contains_key("GROK_MANAGED_MCPS_ENABLED"));

        let mut inherited = HashMap::new();
        inherited.insert("GROK_CURSOR_MCPS_ENABLED".into(), "1".into());
        inherited.insert("GROK_CLAUDE_MCPS_ENABLED".into(), "true".into());
        inherited.insert("KEEP".into(), "yes".into());
        let cfg = AgentRuntimeConfig {
            env_overrides: Some(inherited),
            ..AgentRuntimeConfig::default()
        };
        let merged = merge_env(None, &cfg).expect("merged");
        assert_eq!(
            merged.get("GROK_CURSOR_MCPS_ENABLED").map(String::as_str),
            Some("0"),
            "Chat overlay must win over inherited Cursor MCP enable"
        );
        assert_eq!(
            merged.get("GROK_CLAUDE_MCPS_ENABLED").map(String::as_str),
            Some("0"),
            "Chat overlay must win over inherited Claude MCP enable"
        );
        assert_eq!(merged.get("KEEP").map(String::as_str), Some("yes"));

        let spec = launch_spec("/opt/grok", Some("grok-4.6"), None, Some(merged));
        let env = spec.env.expect("launch env");
        assert_eq!(
            env.get("GROK_CURSOR_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert_eq!(
            env.get("GROK_CLAUDE_MCPS_ENABLED").map(String::as_str),
            Some("0")
        );
        assert_eq!(env.get("KEEP").map(String::as_str), Some("yes"));
        assert_eq!(
            spec.args,
            vec![
                "--permission-mode",
                "default",
                "agent",
                "--model",
                "grok-4.6",
                "stdio"
            ]
        );
    }

    #[tokio::test]
    async fn spawn_stdio_injects_mcp_isolation_env() {
        use std::os::unix::fs::PermissionsExt;
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

        let dir = tempfile::tempdir().expect("tempdir");
        let program = dir.path().join("grok");
        std::fs::write(
            &program,
            r#"#!/usr/bin/env python3
import os, sys
sys.stdout.write(os.environ.get("GROK_CURSOR_MCPS_ENABLED", "") + "\n")
sys.stdout.write(os.environ.get("GROK_CLAUDE_MCPS_ENABLED", "") + "\n")
sys.stdout.flush()
sys.stdin.read()
"#,
        )
        .expect("write");
        let mut perms = std::fs::metadata(&program).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&program, perms).unwrap();

        let mut spawned = spawn_stdio(&program, dir.path()).expect("spawn fake grok");
        let mut reader = BufReader::new(spawned.stdout);
        let mut cursor = String::new();
        let mut claude = String::new();
        reader.read_line(&mut cursor).await.expect("cursor env");
        reader.read_line(&mut claude).await.expect("claude env");
        let _ = spawned.stdin.shutdown().await;
        let _ = spawned.child.start_kill();
        assert_eq!(cursor.trim(), "0");
        assert_eq!(claude.trim(), "0");
    }

    #[test]
    fn app069_s4_cargo_toml_has_no_xai_grok_crate_and_terminal_argv_untouched() {
        let manifest = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"));
        assert!(
            !manifest.contains("xai-grok"),
            "Grok Chat must not embed xai-grok-* crates"
        );
        let builtin = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../resources/terminal-agents/builtin_agents.json"
        ));
        assert!(
            builtin.contains("--output-format streaming-json -p"),
            "Terminal grok-build argv must stay APP-036 streaming-json -p"
        );
        assert!(
            !builtin.contains("grok agent stdio"),
            "Chat `grok agent stdio` must not leak into Terminal builtin_agents.json"
        );
    }
}
