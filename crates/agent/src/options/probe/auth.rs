//! Catalog-probe auth: ACP payloads plus per-vendor native first-time login.

use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use crate::acp_client::{encode_auth_required, parse_auth_required_error, AuthMethodSummary};
use crate::models::AgentId;
use crate::options::merge::OptionsFragment;
use crate::options::probe::cli::parse::looks_like_auth_required;
use crate::options::{OptionsProbeStrategy, OptionsStatus};
use crate::policy::canonicalize_chat_provider_id;

pub const CLI_LOGIN_METHOD_PREFIX: &str = "cli_login:";
pub const NATIVE_OAUTH_METHOD_PREFIX: &str = "native_oauth:";
pub const TOKEN_METHOD_PREFIX: &str = "token:";
pub const NATIVE_LOGIN_TIMEOUT: Duration = Duration::from_secs(180);

pub fn is_cli_login_method_id(method_id: &str) -> bool {
    method_id.starts_with(CLI_LOGIN_METHOD_PREFIX)
}

pub fn is_native_oauth_method_id(method_id: &str) -> bool {
    method_id.starts_with(NATIVE_OAUTH_METHOD_PREFIX)
}

pub fn token_method_env_name(method_id: &str) -> Option<&str> {
    method_id
        .strip_prefix(TOKEN_METHOD_PREFIX)
        .filter(|name| !name.is_empty())
}

pub fn snapshot_message_needs_auth(message: Option<&str>, status: OptionsStatus) -> bool {
    status == OptionsStatus::AuthRequired || message.is_some_and(message_carries_auth_required)
}

pub fn message_carries_auth_required(message: &str) -> bool {
    parse_auth_required_error(message).is_some()
}

pub fn catalog_probe_error_fragment(
    agent_id: &str,
    error: String,
    strategy: OptionsProbeStrategy,
) -> OptionsFragment {
    let (status, message) = catalog_probe_error(agent_id, error, Vec::new());
    OptionsFragment {
        status: Some(status),
        message: Some(message),
        strategy: Some(strategy),
        ..Default::default()
    }
}

pub fn catalog_probe_error(
    agent_id: &str,
    error: String,
    advertised_methods: Vec<AuthMethodSummary>,
) -> (OptionsStatus, String) {
    if parse_auth_required_error(&error).is_some() {
        return (OptionsStatus::AuthRequired, error);
    }
    if !looks_like_auth_required(&error) && advertised_methods.is_empty() {
        return (OptionsStatus::Error, error);
    }
    let methods = if advertised_methods.is_empty() {
        fallback_auth_methods(agent_id)
    } else {
        advertised_methods
    };
    match encode_auth_required(methods, "Authentication required by agent") {
        Ok(encoded) => (OptionsStatus::AuthRequired, encoded),
        Err(_) => (OptionsStatus::AuthRequired, error),
    }
}

pub fn auth_required_from_methods(agent_id: &str, methods: Vec<AuthMethodSummary>) -> String {
    let methods = if methods.is_empty() {
        fallback_auth_methods(agent_id)
    } else {
        methods
    };
    encode_auth_required(methods, "Authentication required by agent")
        .unwrap_or_else(|_| "Authentication required by agent".into())
}

pub fn native_unsigned_auth_message(agent_id: &str, text: &str) -> Option<String> {
    if parse_native_signed_in(canonicalize_chat_provider_id(agent_id), text) == Some(false) {
        Some(auth_required_from_methods(agent_id, Vec::new()))
    } else {
        None
    }
}

fn fallback_auth_methods(agent_id: &str) -> Vec<AuthMethodSummary> {
    let methods = native_auth_methods(agent_id);
    if methods.is_empty() {
        generic_sign_in_method(agent_id)
    } else {
        methods
    }
}

fn generic_sign_in_method(agent_id: &str) -> Vec<AuthMethodSummary> {
    let folded = canonicalize_chat_provider_id(agent_id);
    vec![AuthMethodSummary {
        id: format!("{CLI_LOGIN_METHOD_PREFIX}{folded}"),
        name: "Sign in".into(),
        description: Some("Sign in from the agent CLI, then continue.".into()),
    }]
}

fn method(id: &str, name: &str, description: &str) -> AuthMethodSummary {
    AuthMethodSummary {
        id: id.to_string(),
        name: name.to_string(),
        description: Some(description.to_string()),
    }
}

/// First-time sign-in choices for Native Chat hosts. ACP registry ids stay empty
/// so initialize `authMethods` remain authoritative.
pub fn native_auth_methods(agent_id: &str) -> Vec<AuthMethodSummary> {
    match canonicalize_chat_provider_id(agent_id) {
        "claude" => vec![
            method(
                "native_oauth:claude",
                "Claude subscription",
                "claude auth login",
            ),
            method(
                "native_oauth:claude-console",
                "Anthropic console",
                "claude auth login --console",
            ),
            method("token:ANTHROPIC_API_KEY", "API key", "ANTHROPIC_API_KEY"),
        ],
        "codex" => vec![
            method("native_oauth:codex", "ChatGPT", "codex login"),
            method("token:OPENAI_API_KEY", "API key", "OPENAI_API_KEY"),
        ],
        "opencode" => vec![method(
            "cli_login:opencode",
            "Sign in",
            "opencode auth login",
        )],
        "pi" => vec![
            method("token:GEMINI_API_KEY", "Google API key", "GEMINI_API_KEY"),
            method(
                "token:ANTHROPIC_API_KEY",
                "Anthropic API key",
                "ANTHROPIC_API_KEY",
            ),
            method("token:OPENAI_API_KEY", "OpenAI API key", "OPENAI_API_KEY"),
        ],
        "grok" => vec![
            method("native_oauth:grok", "Grok", "grok login"),
            method("native_oauth:grok-oauth", "xAI", "grok login --oauth"),
        ],
        _ => Vec::new(),
    }
}

pub fn native_oauth_login_argv(method_id: &str) -> Option<Vec<String>> {
    let argv: &[&str] = match method_id {
        "native_oauth:claude" => &["claude", "auth", "login"],
        "native_oauth:claude-console" => &["claude", "auth", "login", "--console"],
        "native_oauth:codex" => &["codex", "login"],
        "native_oauth:grok" => &["grok", "login"],
        "native_oauth:grok-oauth" => &["grok", "login", "--oauth"],
        _ => return None,
    };
    Some(argv.iter().map(|part| (*part).to_string()).collect())
}

pub fn native_token_stdin_argv(agent_id: &str, method_id: &str) -> Option<Vec<String>> {
    if canonicalize_chat_provider_id(agent_id) != "codex" {
        return None;
    }
    if token_method_env_name(method_id) != Some("OPENAI_API_KEY") {
        return None;
    }
    Some(vec![
        "codex".into(),
        "login".into(),
        "--with-api-key".into(),
    ])
}

pub fn native_token_keyring_id(method_id: &str) -> Option<AgentId> {
    match token_method_env_name(method_id)? {
        "ANTHROPIC_API_KEY" => Some(AgentId::ClaudeCode),
        "OPENAI_API_KEY" => Some(AgentId::Codex),
        "GEMINI_API_KEY" => Some(AgentId::GeminiCli),
        _ => None,
    }
}

pub fn native_status_argv(agent_id: &str) -> Option<Vec<String>> {
    let argv: &[&str] = match canonicalize_chat_provider_id(agent_id) {
        "claude" => &["claude", "auth", "status", "--json"],
        "codex" => &["codex", "login", "status"],
        "opencode" => &["opencode", "auth", "list"],
        _ => return None,
    };
    Some(argv.iter().map(|part| (*part).to_string()).collect())
}

pub fn parse_native_signed_in(host: &str, text: &str) -> Option<bool> {
    match host {
        "claude" => parse_claude_auth_status(text),
        "codex" | "grok" => parse_logged_in_line(text),
        "opencode" => parse_opencode_auth_list(text),
        _ => None,
    }
}

fn parse_claude_auth_status(text: &str) -> Option<bool> {
    let json_start = text.find('{')?;
    let value: serde_json::Value = serde_json::from_str(text[json_start..].trim()).ok()?;
    value.get("loggedIn").and_then(|item| item.as_bool())
}

fn parse_logged_in_line(text: &str) -> Option<bool> {
    let lower = text.to_ascii_lowercase();
    if lower.contains("not logged in") || lower.contains("not signed in") {
        Some(false)
    } else if lower.contains("logged in") || lower.contains("signed in") {
        Some(true)
    } else {
        None
    }
}

fn parse_opencode_auth_list(text: &str) -> Option<bool> {
    let lower = text.to_ascii_lowercase();
    if lower.contains("no credentials") || lower.contains("0 credentials") {
        return Some(false);
    }
    credential_count(&lower).map(|count| count > 0)
}

fn credential_count(lower: &str) -> Option<u32> {
    let idx = lower.find(" credentials")?;
    let before = lower[..idx].as_bytes();
    let mut end = before.len();
    while end > 0 && before[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    let mut start = end;
    while start > 0 && before[start - 1].is_ascii_digit() {
        start -= 1;
    }
    if start == end {
        return None;
    }
    std::str::from_utf8(&before[start..end]).ok()?.parse().ok()
}

pub(crate) async fn run_native_login(
    argv: &[String],
    stdin_payload: Option<&str>,
    max: Duration,
) -> Result<(), String> {
    if argv.is_empty() {
        return Err("empty login command".into());
    }
    let mut cmd = Command::new(&argv[0]);
    if argv.len() > 1 {
        cmd.args(&argv[1..]);
    }
    cmd.kill_on_drop(true);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    if stdin_payload.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }
    let mut child = cmd.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!("{} is not installed", argv[0])
        } else {
            error.to_string()
        }
    })?;
    if let Some(secret) = stdin_payload {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(secret.as_bytes())
                .await
                .map_err(|error| error.to_string())?;
            if !secret.ends_with('\n') {
                stdin
                    .write_all(b"\n")
                    .await
                    .map_err(|error| error.to_string())?;
            }
            let _ = stdin.shutdown().await;
        }
    }
    let output = timeout(max, child.wait_with_output())
        .await
        .map_err(|_| "Sign in timed out".to_string())?
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = format!("{stdout}\n{stderr}");
    let detail = detail.trim();
    if detail.is_empty() {
        Err("Sign in failed".into())
    } else {
        let clipped = if detail.len() > 400 {
            format!("{}…", &detail[..400])
        } else {
            detail.to_string()
        };
        Err(format!("Sign in failed: {clipped}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_client::AUTH_REQUIRED_ERROR_PREFIX;

    #[test]
    fn acp_payload_stays_auth_required() {
        let encoded = encode_auth_required(
            vec![AuthMethodSummary {
                id: "oauth".into(),
                name: "Browser".into(),
                description: None,
            }],
            "Authentication required by agent",
        )
        .expect("encode");
        let (status, message) = catalog_probe_error("cursor", encoded.clone(), Vec::new());
        assert_eq!(status, OptionsStatus::AuthRequired);
        assert_eq!(message, encoded);
        assert!(message.starts_with(AUTH_REQUIRED_ERROR_PREFIX));
    }

    #[test]
    fn native_codex_methods_are_chatgpt_and_api_key() {
        let (status, message) =
            catalog_probe_error("codex", "please login with ChatGPT".into(), Vec::new());
        assert_eq!(status, OptionsStatus::AuthRequired);
        let payload = parse_auth_required_error(&message).expect("payload");
        let ids: Vec<_> = payload
            .methods
            .iter()
            .map(|item| item.id.as_str())
            .collect();
        assert_eq!(ids, ["native_oauth:codex", "token:OPENAI_API_KEY"]);
        assert_eq!(
            native_oauth_login_argv("native_oauth:codex").as_deref(),
            Some(["codex".to_string(), "login".into()].as_slice())
        );
    }

    #[test]
    fn native_claude_login_is_auth_login_not_slash_login() {
        let methods = native_auth_methods("claude-code");
        assert_eq!(methods[0].id, "native_oauth:claude");
        assert_eq!(
            native_oauth_login_argv("native_oauth:claude").as_deref(),
            Some(["claude".to_string(), "auth".into(), "login".into()].as_slice())
        );
        assert_eq!(
            native_oauth_login_argv("native_oauth:claude-console").as_deref(),
            Some(
                [
                    "claude".to_string(),
                    "auth".into(),
                    "login".into(),
                    "--console".into()
                ]
                .as_slice()
            )
        );
    }

    #[test]
    fn native_opencode_stays_interactive_cli() {
        let methods = native_auth_methods("opencode");
        assert_eq!(methods.len(), 1);
        assert_eq!(methods[0].id, "cli_login:opencode");
        assert!(native_oauth_login_argv("cli_login:opencode").is_none());
    }

    #[test]
    fn native_pi_is_api_keys_only() {
        let ids: Vec<_> = native_auth_methods("pi")
            .into_iter()
            .map(|item| item.id)
            .collect();
        assert_eq!(
            ids,
            [
                "token:GEMINI_API_KEY",
                "token:ANTHROPIC_API_KEY",
                "token:OPENAI_API_KEY"
            ]
        );
        assert!(native_oauth_login_argv("native_oauth:pi").is_none());
    }

    #[test]
    fn signed_in_parsers() {
        assert_eq!(
            parse_native_signed_in("claude", r#"{"loggedIn":false,"authMethod":null}"#),
            Some(false)
        );
        assert_eq!(
            parse_native_signed_in("codex", "Not logged in\n"),
            Some(false)
        );
        assert_eq!(
            parse_native_signed_in("codex", "Logged in using ChatGPT"),
            Some(true)
        );
        assert_eq!(
            parse_native_signed_in("grok", "Not logged in. Run `grok login`."),
            Some(false)
        );
        assert_eq!(
            parse_native_signed_in("opencode", "4 credentials"),
            Some(true)
        );
        assert_eq!(
            parse_native_signed_in("opencode", "0 credentials"),
            Some(false)
        );
        assert_eq!(parse_native_signed_in("pi", "any"), None);
    }

    #[test]
    fn timeout_stays_error() {
        let (status, message) = catalog_probe_error(
            "cursor",
            "temp ACP catalog probe timed out".into(),
            Vec::new(),
        );
        assert_eq!(status, OptionsStatus::Error);
        assert_eq!(message, "temp ACP catalog probe timed out");
    }

    #[test]
    fn authenticate_failed_does_not_become_cli_login() {
        let (status, message) = catalog_probe_error(
            "cursor",
            "Authenticate failed: user cancelled".into(),
            Vec::new(),
        );
        assert_eq!(status, OptionsStatus::Error);
        assert_eq!(message, "Authenticate failed: user cancelled");
    }
}
