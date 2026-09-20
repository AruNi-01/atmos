//! Chat spawn override: `pi --mode rpc`. Ignore Terminal `-p` / launch_spec.args.

use std::collections::HashMap;
#[cfg(test)]
use std::path::PathBuf;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::contract::{AgentProviderError, AgentResult, AgentRuntimeConfig};
use crate::models::AgentLaunchSpec;

pub struct PiChild {
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
    pub child: Child,
}

/// Chat argv. Never `-p`, `--print`, `--no-session`, `--extension`, or `--mode json`.
pub fn chat_argv(model: Option<&str>) -> Vec<String> {
    let mut args = vec!["--mode".to_string(), "rpc".to_string()];
    if let Some(model) = model
        .map(str::trim)
        .filter(|value| !value.is_empty() && spawnable_model_id(value))
    {
        match model.split_once('/') {
            Some((provider, id)) if !provider.is_empty() && !id.is_empty() => {
                args.push("--provider".into());
                args.push(provider.to_string());
                args.push("--model".into());
                args.push(id.to_string());
            }
            _ => {
                args.push("--model".into());
                args.push(model.to_string());
            }
        }
    }
    args
}

/// Reject `pi --list-models` header leftovers (`"provider  model  context ..."`).
fn spawnable_model_id(model: &str) -> bool {
    !model.contains(char::is_whitespace)
        && !model.eq_ignore_ascii_case("provider")
        && !model.eq_ignore_ascii_case("model")
}

pub fn split_model_id(
    model: &str,
    fallback_provider: Option<&str>,
) -> AgentResult<(String, String)> {
    let model = model.trim();
    match model.split_once('/') {
        Some((provider, id)) if !provider.is_empty() && !id.is_empty() => {
            Ok((provider.to_string(), id.to_string()))
        }
        _ => {
            let provider = fallback_provider
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    AgentProviderError::message(format!("set_model needs provider/id, got {model}"))
                })?;
            Ok((provider.to_string(), model.to_string()))
        }
    }
}

pub fn spawn_chat(
    program: &str,
    cfg: &AgentRuntimeConfig,
    extra_env: Option<&HashMap<String, String>>,
) -> AgentResult<PiChild> {
    let args = chat_argv(cfg.model.as_deref());
    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    if cfg.cwd.exists() {
        cmd.current_dir(&cfg.cwd);
    }

    if let Some(env) = extra_env {
        for (key, value) in env {
            cmd.env(key, value);
        }
    }
    if let Some(overrides) = &cfg.env_overrides {
        for (key, value) in overrides {
            cmd.env(key, value);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|error| AgentProviderError::message(format!("failed to spawn pi: {error}")))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentProviderError::message("pi stdin not available"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentProviderError::message("pi stdout not available"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentProviderError::message("pi stderr not available"))?;
    Ok(PiChild {
        stdin,
        stdout,
        stderr,
        child,
    })
}

pub fn program_from_launch_spec(spec: &AgentLaunchSpec) -> String {
    let _ = &spec.args;
    spec.program.clone()
}

#[cfg(test)]
pub fn cwd_from_config(cfg: &AgentRuntimeConfig) -> PathBuf {
    cfg.cwd.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentRuntimeConfig;
    use crate::models::AgentLaunchSpec;
    use std::path::PathBuf;

    #[test]
    fn chat_argv_is_mode_rpc_not_print() {
        let argv = chat_argv(None);
        assert_eq!(argv, vec!["--mode", "rpc"]);
        assert!(!argv.iter().any(|arg| arg == "-p" || arg == "--print"));
        assert!(!argv
            .iter()
            .any(|arg| arg == "--no-session" || arg == "--extension"));
        assert!(!argv.windows(2).any(|pair| pair == ["--mode", "json"]));
    }

    #[test]
    fn chat_argv_splits_provider_slash_model() {
        let argv = chat_argv(Some("anthropic/claude-sonnet-4-20250514"));
        assert_eq!(
            argv,
            vec![
                "--mode",
                "rpc",
                "--provider",
                "anthropic",
                "--model",
                "claude-sonnet-4-20250514"
            ]
        );
    }

    #[test]
    fn chat_argv_omits_list_models_table_header() {
        let header = "provider  model                         context  max-out  thinking  images";
        assert_eq!(chat_argv(Some(header)), vec!["--mode", "rpc"]);
        assert_eq!(
            chat_argv(Some("deepseek/deepseek-v4-flash")),
            vec![
                "--mode",
                "rpc",
                "--provider",
                "deepseek",
                "--model",
                "deepseek-v4-flash"
            ]
        );
    }

    #[test]
    fn launch_spec_print_args_are_ignored() {
        let spec = AgentLaunchSpec {
            program: "pi".into(),
            args: vec!["-p".into()],
            env: None,
        };
        assert_eq!(program_from_launch_spec(&spec), "pi");
        assert_eq!(chat_argv(None), vec!["--mode", "rpc"]);
        let _cwd = cwd_from_config(&AgentRuntimeConfig {
            cwd: PathBuf::from("/tmp"),
            ..AgentRuntimeConfig::default()
        });
    }

    #[test]
    fn split_model_id_uses_first_slash() {
        let (provider, id) =
            split_model_id("anthropic/claude-sonnet-4-20250514", None).expect("split");
        assert_eq!(provider, "anthropic");
        assert_eq!(id, "claude-sonnet-4-20250514");
        let (provider, id) = split_model_id("only-id", Some("anthropic")).expect("fallback");
        assert_eq!(provider, "anthropic");
        assert_eq!(id, "only-id");
    }
}
