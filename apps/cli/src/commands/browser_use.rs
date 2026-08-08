//! `atmos browser-use` — page CDP control (separate from Desktop Use).
//! Engine pin: cua-driver-rs 0.19.2 (extension-free browser tools).

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
            profile_name: a.profile_name,
            approval_token: a.approval_token,
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
            snapshot_format: a.snapshot_format,
            include_screenshot: a.include_screenshot,
            continuation: a.continuation,
            query: a.query,
            scope_ref: a.scope_ref,
            ..Default::default()
        },
        BrowserUseCommand::Click(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Click,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            element_ref: a.element_ref,
            session: a.session,
            x: a.x,
            y: a.y,
            input_route: a.input_route,
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
            type_mode: a.mode,
            replace: a.replace,
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
        BrowserUseCommand::Pointer(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Pointer,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            pointer_action: Some(a.action),
            element_ref: a.element_ref,
            session: a.session,
            x: a.x,
            y: a.y,
            delta_x: a.delta_x,
            delta_y: a.delta_y,
            to_x: a.to_x,
            to_y: a.to_y,
            destination_ref: a.destination_ref,
            input_route: a.input_route,
            ..Default::default()
        },
        BrowserUseCommand::Dialog(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Dialog,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            dialog_action: Some(a.action),
            dialog_id: a.dialog_id,
            prompt_text: a.prompt_text,
            delivery_mode: a.delivery_mode,
            session: a.session,
            ..Default::default()
        },
        BrowserUseCommand::Download(a) => BrowserRequest {
            backend: parse_backend(&a.backend)?,
            action: BrowserAction::Download,
            target_id: Some(a.target_id),
            tab_id: Some(a.tab_id),
            element_ref: Some(a.element_ref),
            download_dir: Some(a.dir),
            session: a.session,
            ..Default::default()
        },
    };
    let res = execute(req);
    serde_json::to_value(res).map_err(|e| e.to_string())
}

fn parse_backend(s: &str) -> Result<BrowserBackendKind, String> {
    BrowserBackendKind::parse(s)
        .ok_or_else(|| format!("invalid --backend {:?} (use external|embedded)", s))
}

#[derive(Debug, Subcommand)]
pub enum BrowserUseCommand {
    /// Prepare a browser profile / DevTools endpoint (isolated by default).
    Prepare(PrepareArgs),
    /// Bind native window or snapshot a bound tab (semantic_v2 by default).
    State(StateArgs),
    /// Click by ref or viewport CSS coordinates.
    Click(ClickArgs),
    /// Type into an editable ref.
    Type(TypeArgs),
    /// Navigate a bound tab (http/https/about).
    Navigate(NavigateArgs),
    /// Hover / right-click / double-click / scroll / drag.
    Pointer(PointerArgs),
    /// Inspect or resolve page JS dialogs.
    Dialog(DialogArgs),
    /// Download via a page ref into an approved directory.
    Download(DownloadArgs),
}

#[derive(Debug, Args)]
pub struct PrepareArgs {
    /// Backend: `external` (system Chrome/Chromium) | `embedded` (Atmos in-app browser).
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub pid: Option<i32>,
    /// Required when --strategy existing_profile.
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub session: Option<String>,
    /// Default: isolated_new. Also: existing_profile | isolated_named.
    #[arg(long)]
    pub strategy: Option<String>,
    /// Name for isolated_named profiles.
    #[arg(long)]
    pub profile_name: Option<String>,
    /// Token from `atmos-desktop-control browser-approve` when required.
    #[arg(long)]
    pub approval_token: Option<String>,
}

#[derive(Debug, Args)]
pub struct StateArgs {
    #[arg(long, default_value = "external")]
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
    /// semantic_v2 (default) | dom_refs_v1
    #[arg(long)]
    pub snapshot_format: Option<String>,
    /// Capture tab viewport PNG via CDP.
    #[arg(long, default_value_t = false)]
    pub include_screenshot: bool,
    /// Opaque continuation from a prior semantic_v2 response.
    #[arg(long)]
    pub continuation: Option<String>,
    /// Semantic query over role / name / visible text.
    #[arg(long)]
    pub query: Option<String>,
    /// Scope later reads to a content/action ref.
    #[arg(long)]
    pub scope_ref: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long = "ref")]
    pub element_ref: Option<String>,
    /// Viewport CSS px (alternative to --ref).
    #[arg(long)]
    pub x: Option<f64>,
    #[arg(long)]
    pub y: Option<f64>,
    /// trusted (default) | dom_event
    #[arg(long)]
    pub input_route: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long)]
    pub text: String,
    /// Element ref from state (required for external).
    #[arg(long = "ref")]
    pub element_ref: Option<String>,
    /// insert_text (default) | keystrokes
    #[arg(long)]
    pub mode: Option<String>,
    /// Replace field contents instead of inserting at caret.
    #[arg(long, default_value_t = false)]
    pub replace: bool,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct NavigateArgs {
    #[arg(long, default_value = "external")]
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

#[derive(Debug, Args)]
pub struct PointerArgs {
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    /// hover | right_click | double_click | scroll | drag
    #[arg(long)]
    pub action: String,
    #[arg(long = "ref")]
    pub element_ref: Option<String>,
    #[arg(long)]
    pub x: Option<f64>,
    #[arg(long)]
    pub y: Option<f64>,
    #[arg(long)]
    pub delta_x: Option<f64>,
    #[arg(long)]
    pub delta_y: Option<f64>,
    #[arg(long)]
    pub to_x: Option<f64>,
    #[arg(long)]
    pub to_y: Option<f64>,
    #[arg(long)]
    pub destination_ref: Option<String>,
    #[arg(long)]
    pub input_route: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct DialogArgs {
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    /// inspect | accept | dismiss
    #[arg(long)]
    pub action: String,
    #[arg(long)]
    pub dialog_id: Option<String>,
    #[arg(long)]
    pub prompt_text: Option<String>,
    /// background (default) | foreground
    #[arg(long)]
    pub delivery_mode: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct DownloadArgs {
    #[arg(long, default_value = "external")]
    pub backend: String,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub tab_id: String,
    #[arg(long = "ref")]
    pub element_ref: String,
    /// Approved destination directory for the download.
    #[arg(long)]
    pub dir: String,
    #[arg(long)]
    pub session: Option<String>,
}

/// Helpful static note for agents (not a runtime command).
#[allow(dead_code)]
pub fn product_note() -> Value {
    json!({
        "product": "Browser Use",
        "no_mcp": true,
        "engine_pin": "0.19.2",
        "desktop_use": "separate — OS windows / keys / AX",
        "backends": ["external", "embedded"],
        "external_loop": [
            "prepare (isolated_new default)",
            "state bind pid+window_id",
            "state snapshot semantic_v2",
            "click/type/navigate/pointer/dialog/download",
        ],
        "embedded": "Atmos Desktop in-app browser via host control plane",
    })
}
