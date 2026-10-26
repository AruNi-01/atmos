//! `atmos agent-bridge` — thin invoke client for the agent↔agent bus (APP-084).
//!
//! Talks only to Atmos Server via `POST /api/cli/invoke`. No mailbox logic here.

use std::path::PathBuf;

use clap::{Args, Subcommand};
use serde_json::{json, Map, Value};

use crate::api_client::ApiClientArgs;
use crate::envelope::{next, CliEnvelope, NextAction};
use crate::server_invoke::{invoke, wrap_ok, InvokeError};

#[derive(Debug, Subcommand)]
pub enum AgentBridgeCommand {
    /// List addressable agents on the connected Computer
    List {
        #[arg(long)]
        workspace: Option<String>,
    },
    /// Send a Bridge message (same Computer; explicit `--to` list = MVP broadcast)
    Send(SendArgs),
    /// Send a request (server fills correlation_id if omitted)
    Request(SendArgs),
    /// Reply to a request
    Reply(ReplyArgs),
    /// Presence, message lookup, or pull a context bag (does not push)
    Status(StatusArgs),
    /// Print the bundled system skill directory
    #[command(name = "skill-dir")]
    SkillDir,
}

#[derive(Debug, Args)]
pub struct SendArgs {
    /// JSON AgentAddress. Repeat for an explicit same-Computer list.
    #[arg(long = "to")]
    pub to: Vec<String>,
    /// Target provider_id. Repeat for an explicit list.
    #[arg(long = "to-provider")]
    pub to_provider: Vec<String>,
    #[arg(long = "to-chat")]
    pub to_chat: Option<String>,
    #[arg(long = "to-server")]
    pub to_server: Option<String>,
    #[arg(long = "from-provider")]
    pub from_provider: Option<String>,
    #[arg(long = "from-chat")]
    pub from_chat: Option<String>,
    #[arg(long)]
    pub body: String,
    /// wait | queue | fail_fast (default queue on the Server)
    #[arg(long)]
    pub busy: Option<String>,
    #[arg(long = "ttl-ms")]
    pub ttl_ms: Option<u64>,
    #[arg(long = "correlation-id")]
    pub correlation_id: Option<String>,
    /// JSON context bag slices: goals/paths/refs/artifacts/danger
    #[arg(long)]
    pub bag: Option<String>,
    #[arg(long)]
    pub workspace: Option<String>,
}

#[derive(Debug, Args)]
pub struct ReplyArgs {
    #[arg(long = "to")]
    pub to: Vec<String>,
    #[arg(long = "to-provider")]
    pub to_provider: Vec<String>,
    #[arg(long = "to-chat")]
    pub to_chat: Option<String>,
    #[arg(long = "from-provider")]
    pub from_provider: Option<String>,
    #[arg(long = "from-chat")]
    pub from_chat: Option<String>,
    #[arg(long)]
    pub body: String,
    #[arg(long = "correlation-id")]
    pub correlation_id: String,
    #[arg(long)]
    pub busy: Option<String>,
    #[arg(long = "ttl-ms")]
    pub ttl_ms: Option<u64>,
}

#[derive(Debug, Args)]
pub struct StatusArgs {
    #[arg(long = "message-id")]
    pub message_id: Option<String>,
    #[arg(long = "context-ref")]
    pub context_ref: Option<String>,
    #[arg(long = "to-provider")]
    pub to_provider: Option<String>,
    #[arg(long = "to-chat")]
    pub to_chat: Option<String>,
    #[arg(long)]
    pub workspace: Option<String>,
}

pub async fn execute_agent_bridge(api: ApiClientArgs, command: AgentBridgeCommand) -> CliEnvelope {
    match command {
        AgentBridgeCommand::List { workspace } => {
            let mut data = Map::new();
            if let Some(ws) = workspace {
                data.insert("workspace_id".into(), json!(ws));
            }
            invoke_env(
                &api,
                "atmos agent-bridge list",
                "agent_bridge_list",
                Value::Object(data),
                vec![
                    next(
                        "atmos agent-bridge send --to-provider <id> --body ...",
                        "Send to a listed provider",
                    ),
                    next("atmos agent-bridge status", "Read presence / pull a bag"),
                ],
            )
            .await
        }
        AgentBridgeCommand::Send(args) => {
            dispatch_send(&api, "atmos agent-bridge send", "agent_bridge_send", args).await
        }
        AgentBridgeCommand::Request(args) => {
            dispatch_send(
                &api,
                "atmos agent-bridge request",
                "agent_bridge_request",
                args,
            )
            .await
        }
        AgentBridgeCommand::Reply(args) => dispatch_reply(&api, args).await,
        AgentBridgeCommand::Status(args) => dispatch_status(&api, args).await,
        AgentBridgeCommand::SkillDir => match skill_dir() {
            Ok(value) => wrap_ok("atmos agent-bridge skill-dir", value, vec![]),
            Err(err) => CliEnvelope::failure(
                "atmos agent-bridge skill-dir",
                "CLI_ERROR",
                err,
                "Check that $HOME is set",
                vec![],
            ),
        },
    }
}

async fn dispatch_send(
    api: &ApiClientArgs,
    command: &str,
    action: &str,
    args: SendArgs,
) -> CliEnvelope {
    let to = match collect_targets(
        &args.to,
        &args.to_provider,
        args.to_chat.as_deref(),
        args.to_server.as_deref(),
        args.workspace.as_deref(),
    ) {
        Ok(v) => v,
        Err(env) => return env,
    };
    let mut data = Map::new();
    data.insert("to".into(), to);
    data.insert("body".into(), json!(args.body));
    if let Some(from) = from_addr(
        args.from_provider.as_deref(),
        args.from_chat.as_deref(),
        args.workspace.as_deref(),
    ) {
        data.insert("from".into(), from);
    }
    if let Some(busy) = args.busy {
        data.insert("busy".into(), json!(busy));
    }
    if let Some(ttl) = args.ttl_ms {
        data.insert("ttl_ms".into(), json!(ttl));
    }
    if let Some(cid) = args.correlation_id {
        data.insert("correlation_id".into(), json!(cid));
    }
    if let Some(bag) = args.bag {
        match serde_json::from_str::<Value>(&bag) {
            Ok(v) => {
                data.insert("bag".into(), v);
            }
            Err(err) => {
                return CliEnvelope::failure(
                    command,
                    "INVALID_BRIDGE",
                    format!("--bag must be JSON: {err}"),
                    "Pass slices: {\"goals\":[\"...\"],\"paths\":[],\"refs\":[],\"artifacts\":[],\"danger\":[]}",
                    vec![],
                );
            }
        }
    }
    invoke_env(api, command, action, Value::Object(data), send_next()).await
}

async fn dispatch_reply(api: &ApiClientArgs, args: ReplyArgs) -> CliEnvelope {
    let command = "atmos agent-bridge reply";
    let to = match collect_targets(
        &args.to,
        &args.to_provider,
        args.to_chat.as_deref(),
        None,
        None,
    ) {
        Ok(v) => v,
        Err(env) => return env,
    };
    let to_one = match to {
        Value::Array(mut arr) if arr.len() == 1 => arr.remove(0),
        Value::Object(_) => to,
        other => {
            return CliEnvelope::failure(
                command,
                "INVALID_BRIDGE",
                format!("reply needs exactly one target, got {other}"),
                "Pass --to-provider once",
                vec![],
            );
        }
    };
    let mut data = Map::new();
    data.insert("to".into(), to_one);
    data.insert("body".into(), json!(args.body));
    data.insert("correlation_id".into(), json!(args.correlation_id));
    if let Some(from) = from_addr(
        args.from_provider.as_deref(),
        args.from_chat.as_deref(),
        None,
    ) {
        data.insert("from".into(), from);
    }
    if let Some(busy) = args.busy {
        data.insert("busy".into(), json!(busy));
    }
    if let Some(ttl) = args.ttl_ms {
        data.insert("ttl_ms".into(), json!(ttl));
    }
    invoke_env(
        api,
        command,
        "agent_bridge_reply",
        Value::Object(data),
        send_next(),
    )
    .await
}

async fn dispatch_status(api: &ApiClientArgs, args: StatusArgs) -> CliEnvelope {
    let mut data = Map::new();
    if let Some(id) = args.message_id {
        data.insert("message_id".into(), json!(id));
    }
    if let Some(r) = args.context_ref {
        data.insert("context_ref".into(), json!(r));
    }
    if let Some(provider) = args.to_provider {
        let mut to = Map::new();
        to.insert("server_id".into(), json!("local"));
        to.insert("provider_id".into(), json!(provider));
        if let Some(chat) = args.to_chat {
            to.insert("chat_id".into(), json!(chat));
        }
        data.insert("to".into(), Value::Object(to));
    }
    if let Some(ws) = args.workspace {
        data.insert("workspace_id".into(), json!(ws));
    }
    invoke_env(
        api,
        "atmos agent-bridge status",
        "agent_bridge_status",
        Value::Object(data),
        vec![next(
            "atmos agent-bridge list",
            "Refresh the connected Computer directory",
        )],
    )
    .await
}

fn collect_targets(
    to_json: &[String],
    to_provider: &[String],
    to_chat: Option<&str>,
    to_server: Option<&str>,
    workspace: Option<&str>,
) -> Result<Value, CliEnvelope> {
    let mut targets: Vec<Value> = Vec::new();
    for raw in to_json {
        match serde_json::from_str::<Value>(raw) {
            Ok(v) => targets.push(v),
            Err(err) => {
                return Err(CliEnvelope::failure(
                    "atmos agent-bridge",
                    "INVALID_BRIDGE",
                    format!("--to must be JSON AgentAddress: {err}"),
                    r#"Example: --to '{"provider_id":"claude","chat_id":"..."}'"#,
                    vec![],
                ));
            }
        }
    }
    for provider in to_provider {
        let mut addr = Map::new();
        addr.insert("server_id".into(), json!(to_server.unwrap_or("local")));
        addr.insert("provider_id".into(), json!(provider));
        if let Some(chat) = to_chat {
            addr.insert("chat_id".into(), json!(chat));
        }
        if let Some(ws) = workspace {
            addr.insert("workspace_id".into(), json!(ws));
        }
        targets.push(Value::Object(addr));
    }
    if targets.is_empty() {
        return Err(CliEnvelope::failure(
            "atmos agent-bridge",
            "INVALID_BRIDGE",
            "pass --to-provider or --to JSON",
            "List peers first: atmos agent-bridge list",
            vec![next(
                "atmos agent-bridge list",
                "List agents on the connected Computer",
            )],
        ));
    }
    if targets.len() == 1 {
        Ok(targets.remove(0))
    } else {
        Ok(Value::Array(targets))
    }
}

fn from_addr(provider: Option<&str>, chat: Option<&str>, workspace: Option<&str>) -> Option<Value> {
    let provider = provider?;
    let mut addr = Map::new();
    addr.insert("server_id".into(), json!("local"));
    addr.insert("provider_id".into(), json!(provider));
    if let Some(chat) = chat {
        addr.insert("chat_id".into(), json!(chat));
    }
    if let Some(ws) = workspace {
        addr.insert("workspace_id".into(), json!(ws));
    }
    Some(Value::Object(addr))
}

fn send_next() -> Vec<NextAction> {
    vec![
        next("atmos agent-bridge list", "Confirm targets"),
        next(
            "atmos agent-bridge status --context-ref <ref>",
            "Pull a context bag (never pushed)",
        ),
    ]
}

fn skill_dir() -> Result<Value, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let dir: PathBuf = home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join("atmos-agent-bridge");
    let skill_md = dir.join("SKILL.md");
    let blurb = format!(
        "Atmos Agent Bridge skill:\n  {}\n\nNo MCP. Use `atmos agent-bridge list|send|request|reply|status`.\nRelay is a tunnel; this is the agent bus. Not Canvas/PT Design bridge.",
        dir.display()
    );
    Ok(json!({
        "ok": true,
        "skill_dir": dir,
        "skill_md": skill_md,
        "skill_dir_exists": dir.is_dir(),
        "skill_md_exists": skill_md.is_file(),
        "blurb": blurb,
    }))
}

async fn invoke_env(
    api: &ApiClientArgs,
    command: &str,
    action: &str,
    data: Value,
    next_actions: Vec<NextAction>,
) -> CliEnvelope {
    match invoke(api, action, data).await {
        Ok(result) => wrap_ok(command, result, next_actions),
        Err(e) => bridge_invoke_error(command, e),
    }
}

fn bridge_invoke_error(command: &str, err: InvokeError) -> CliEnvelope {
    match err {
        InvokeError::Action { code, message } if code == "CROSS_MACHINE_CONNECT" => {
            CliEnvelope::failure(
                command,
                code,
                message,
                "Point this CLI at that Computer first (--api-url or client-session.json), then retry the same verb",
                vec![
                    next("atmos computer", "Inspect Computer / Relay session"),
                    next("atmos status", "See which Server this CLI is talking to"),
                ],
            )
        }
        InvokeError::Action { code, message } if code == "CONTEXT_REF_REMOTE" => {
            CliEnvelope::failure(
                command,
                code,
                message,
                "Connect to the Computer that holds the bag, then: atmos agent-bridge status --context-ref <ref>",
                vec![next(
                    "atmos agent-bridge status --context-ref <ref>",
                    "Pull the bag on the Computer that stored it",
                )],
            )
        }
        InvokeError::Action { code, message } if code == "AMBIGUOUS_TARGET" => CliEnvelope::failure(
            command,
            code,
            message,
            "Pass --to-chat with the chat id from `atmos agent-bridge list`",
            vec![next(
                "atmos agent-bridge list",
                "See live chat_id values",
            )],
        ),
        other => other.to_envelope(command),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct Probe {
        #[command(subcommand)]
        command: AgentBridgeCommand,
    }

    fn parse(args: &[&str]) -> AgentBridgeCommand {
        Probe::try_parse_from(std::iter::once("agent-bridge").chain(args.iter().copied()))
            .unwrap_or_else(|e| panic!("{e}"))
            .command
    }

    #[test]
    fn parses_kebab_verbs() {
        assert!(matches!(parse(&["list"]), AgentBridgeCommand::List { .. }));
        assert!(matches!(
            parse(&["skill-dir"]),
            AgentBridgeCommand::SkillDir
        ));
        match parse(&["send", "--to-provider", "claude", "--body", "hi"]) {
            AgentBridgeCommand::Send(args) => {
                assert_eq!(args.to_provider, vec!["claude"]);
                assert_eq!(args.body, "hi");
            }
            other => panic!("{other:?}"),
        }
        match parse(&[
            "request",
            "--to-provider",
            "codex",
            "--body",
            "please",
            "--busy",
            "fail_fast",
        ]) {
            AgentBridgeCommand::Request(args) => {
                assert_eq!(args.busy.as_deref(), Some("fail_fast"));
            }
            other => panic!("{other:?}"),
        }
        match parse(&[
            "reply",
            "--to-provider",
            "claude",
            "--body",
            "done",
            "--correlation-id",
            "abc",
        ]) {
            AgentBridgeCommand::Reply(args) => assert_eq!(args.correlation_id, "abc"),
            other => panic!("{other:?}"),
        }
        match parse(&["status", "--context-ref", "bag:x"]) {
            AgentBridgeCommand::Status(args) => {
                assert_eq!(args.context_ref.as_deref(), Some("bag:x"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn skill_dir_is_local_fs() {
        let value = skill_dir().expect("home");
        let dir = value["skill_dir"].as_str().unwrap_or_default();
        assert!(dir.contains("atmos-agent-bridge"));
        assert!(dir.contains(".system"));
    }

    #[test]
    fn cli_source_has_no_crate_deps() {
        let src = include_str!("agent_bridge.rs");
        assert!(!src.contains("core_service"));
        assert!(!src.contains("agent_bridge::"));
        assert!(src.contains("POST /api/cli/invoke"));
    }

    #[test]
    fn cargo_toml_has_no_bridge_or_core_service() {
        let toml = include_str!("../../Cargo.toml");
        assert!(!toml.contains("agent-bridge"));
        assert!(!toml.contains("core-service"));
    }

    #[test]
    fn collect_targets_explicit_list() {
        let value = collect_targets(&[], &["claude".into(), "codex".into()], None, None, None)
            .expect("targets");
        assert!(value.is_array());
        assert_eq!(value.as_array().unwrap().len(), 2);
    }
}
