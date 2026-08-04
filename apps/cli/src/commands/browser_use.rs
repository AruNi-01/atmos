//! `atmos browser-use` — page CDP control (separate from Desktop Use).

use browser_use::{execute, BrowserAction, BrowserBackendKind, BrowserRequest};
use clap::{Args, Subcommand};
use serde_json::{json, Value};

pub async fn execute_cmd(command: BrowserUseCommand) -> Result<Value, String> {
    let req = match command {
        BrowserUseCommand::Prepare(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Prepare,
            pid: a.pid,
            window_id: a.window_id,
            session: a.session,
            profile_strategy: a.strategy,
            ..Default::default()
        },
        BrowserUseCommand::State(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::State,
            pid: a.pid,
            window_id: a.window_id,
            target_id: a.target_id,
            tab_id: a.tab_id,
            session: a.session,
            ..Default::default()
        },
        BrowserUseCommand::Click(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Click,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            element_ref: Some(a.element_ref),
            session: a.session,
            ..Default::default()
        },
        BrowserUseCommand::Type(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Type,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            text: Some(a.text),
            element_ref: a.element_ref,
            session: a.session,
            ..Default::default()
        },
        BrowserUseCommand::Navigate(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Navigate,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            url: Some(a.url),
            session: a.session,
            ..Default::default()
        },
    };
    let res = execute(req);
    serde_json::to_value(res).map_err(|e| e.to_string())
}

fn parse_backend(s: &str) -> Result<BrowserBackendKind, String> {
    BrowserBackendKind::parse(s).ok_or_else(|| {
        format!(
            "invalid --backend {:?} (use cua|external|embedded|atmos)",
            s
        )
    })
}

#[derive(Debug, Subcommand)]
pub enum BrowserUseCommand {
    /// Attach / prepare a browser CDP endpoint (CUA external Chromium).
    Prepare(PrepareArgs),
    /// Read browser state / tabs / snapshot refs.
    State(StateArgs),
    /// Click a page element by ref in a bound tab.
    Click(ClickArgs),
    /// Type into the bound tab (optional ref).
    Type(TypeArgs),
    /// Navigate a bound tab to a URL.
    Navigate(NavigateArgs),
}

#[derive(Debug, Args)]
pub struct PrepareArgs {
    /// Backend: `cua` (system Chromium) | `embedded` (Atmos in-app browser / APP-053).
    #[arg(long, default_value = "cua")]
    pub backend: String,
    #[arg(long)]
    pub pid: Option<i32>,
    /// Required when --strategy existing_profile (engine 0.17).
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub session: Option<String>,
    /// existing_profile (needs --window-id) | isolated_new | isolated_named. Default: omit strategy.
    #[arg(long)]
    pub strategy: Option<String>,
}

#[derive(Debug, Args)]
pub struct StateArgs {
    #[arg(long, default_value = "cua")]
    pub backend: String,
    /// Bind mode: native browser pid (with --window-id).
    #[arg(long)]
    pub pid: Option<i32>,
    /// Bind mode: native window id (with --pid).
    #[arg(long)]
    pub window_id: Option<i64>,
    /// Snapshot mode: opaque target id from prior bind.
    #[arg(long)]
    pub target_id: Option<String>,
    /// Snapshot mode: opaque tab id from prior bind.
    #[arg(long)]
    pub tab_id: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    #[arg(long, default_value = "cua")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long = "ref")]
    pub element_ref: String,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long, default_value = "cua")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long)]
    pub text: String,
    /// Element ref from state (required for CUA; optional for embedded active element).
    #[arg(long = "ref")]
    pub element_ref: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct NavigateArgs {
    #[arg(long, default_value = "cua")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long)]
    pub url: String,
    #[arg(long)]
    pub session: Option<String>,
}

/// Helpful static note for agents (not a runtime command).
#[allow(dead_code)]
pub fn product_note() -> Value {
    json!({
        "product": "Browser Use",
        "no_mcp": true,
        "desktop_use": "separate — OS windows / keys / AX",
        "backends": ["cua", "embedded"],
        "embedded": "Atmos Desktop in-app webview (persist:atmos-browser) via host control plane",
    })
}
