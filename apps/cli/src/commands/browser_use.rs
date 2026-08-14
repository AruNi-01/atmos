//! `atmos browser-use` — page CDP control (separate from Desktop Use).
//! Engine pin: cua-driver-rs 0.19.2 (extension-free browser tools).

use browser_use::{execute, BrowserAction, BrowserBackendKind, BrowserRequest, BrowserResult};
use clap::{Args, Subcommand};
use serde_json::{json, Value};

pub async fn execute_cmd(command: BrowserUseCommand) -> Result<Value, String> {
    let req = match build_request(command) {
        Ok(req) => req,
        Err(message) => {
            return serde_json::to_value(BrowserResult::fail(
                "browser-use",
                "external",
                "invalid_args",
                message,
            ))
            .map_err(|e| e.to_string());
        }
    };
    let res = execute(req);
    serde_json::to_value(res).map_err(|e| e.to_string())
}

fn build_request(command: BrowserUseCommand) -> Result<BrowserRequest, String> {
    Ok(match command {
        BrowserUseCommand::Prepare(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Prepare,
            pid: a.pid,
            window_id: a.window_id,
            session: a.route.session,
            profile_strategy: a.strategy,
            profile_name: a.profile_name,
            approval_token: a.approval_token,
            binding_id: a.route.binding_id,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            ..Default::default()
        },
        BrowserUseCommand::State(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::State,
            pid: a.pid,
            window_id: a.window_id,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            session: a.route.session,
            snapshot_format: a.snapshot_format,
            include_screenshot: a.include_screenshot,
            continuation: a.continuation,
            query: a.query,
            scope_ref: a.scope_ref,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Click(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Click,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            element_ref: a.element_ref,
            session: a.route.session,
            x: a.x,
            y: a.y,
            input_route: a.input_route,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Type(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Type,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            text: Some(a.text),
            element_ref: a.element_ref,
            session: a.route.session,
            type_mode: a.mode,
            replace: a.replace,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Navigate(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Navigate,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            url: Some(a.url),
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Pointer(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Pointer,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            pointer_action: Some(a.action),
            element_ref: a.element_ref,
            session: a.route.session,
            x: a.x,
            y: a.y,
            delta_x: a.delta_x,
            delta_y: a.delta_y,
            to_x: a.to_x,
            to_y: a.to_y,
            destination_ref: a.destination_ref,
            input_route: a.input_route,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Dialog(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Dialog,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            dialog_action: Some(a.action),
            dialog_id: a.dialog_id,
            prompt_text: a.prompt_text,
            delivery_mode: a.delivery_mode,
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Download(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Download,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            element_ref: Some(a.element_ref),
            download_dir: a.dir,
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::PressKey(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::PressKey,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            element_ref: a.element_ref,
            key: Some(a.key),
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::Upload(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Upload,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            element_ref: Some(a.element_ref),
            files: a.file,
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
        BrowserUseCommand::End(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::End,
            session: a.route.session,
            binding_id: a.route.binding_id,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            ..Default::default()
        },
        BrowserUseCommand::Tabs(a) => BrowserRequest {
            backend: parse_backend_opt(a.route.backend.as_deref())?.0,
            backend_explicit: a.route.backend.is_some(),
            action: BrowserAction::Tabs,
            tab_action: Some(a.action),
            url: a.url,
            target_id: a.route.target_id,
            tab_id: a.route.tab_id,
            session: a.route.session,
            binding_id: a.route.binding_id,
            ..Default::default()
        },
    })
}

fn parse_backend_opt(s: Option<&str>) -> Result<(BrowserBackendKind, bool), String> {
    match s {
        None => Ok((BrowserBackendKind::External, false)),
        Some(raw) => BrowserBackendKind::parse(raw)
            .map(|kind| (kind, true))
            .ok_or_else(|| format!("invalid --backend {:?} (use external|embedded)", raw)),
    }
}

#[derive(Debug, Args)]
pub struct RouteArgs {
    /// Backend: `external` (system Chrome) | `embedded` (Atmos in-app browser).
    /// Omit to reuse the scoped binding, or default to embedded when Desktop is open.
    #[arg(long)]
    pub backend: Option<String>,
    /// Opaque target from a prior `state` / `prepare`. Omit to reuse the scoped binding.
    #[arg(long)]
    pub target_id: Option<String>,
    /// Opaque tab from a prior `state`. Omit to reuse the scoped binding.
    #[arg(long)]
    pub tab_id: Option<String>,
    #[arg(long)]
    pub session: Option<String>,
    /// Binding scope. Defaults to ATMOS_BROWSER_USE_BINDING_ID, ATMOS_SIDE_CHAT_ID, or ATMOS_PANE_ID.
    #[arg(long)]
    pub binding_id: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum BrowserUseCommand {
    /// Prepare a browser profile / DevTools endpoint (isolated by default).
    Prepare(PrepareArgs),
    /// Snapshot the current page. Desktop embedded: no prepare; empty state snapshots last-active or ensures chrome.
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
    /// Press a key in the in-app browser (embedded only).
    PressKey(PressKeyArgs),
    /// Set files on a file input (external `browser_set_input_files`).
    Upload(UploadArgs),
    /// End the engine session and clear the scoped binding.
    End(EndArgs),
    /// Open / close / select / list in-app Browser tabs (embedded only).
    Tabs(TabsArgs),
}

#[derive(Debug, Args)]
pub struct PrepareArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    #[arg(long)]
    pub pid: Option<i32>,
    /// Required when --strategy existing_profile.
    #[arg(long)]
    pub window_id: Option<i64>,
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
    #[command(flatten)]
    pub route: RouteArgs,
    /// External only: system Chrome pid (with --window-id) when setup is required.
    #[arg(long)]
    pub pid: Option<i32>,
    /// External only: system Chrome window id (with --pid).
    #[arg(long)]
    pub window_id: Option<i64>,
    /// semantic_v2 (external default) | dom_refs_v1 | embedded_dom_v1
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
    #[command(flatten)]
    pub route: RouteArgs,
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
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[command(flatten)]
    pub route: RouteArgs,
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
}

#[derive(Debug, Args)]
pub struct NavigateArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    #[arg(long)]
    pub url: String,
}

#[derive(Debug, Args)]
pub struct PointerArgs {
    #[command(flatten)]
    pub route: RouteArgs,
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
}

#[derive(Debug, Args)]
pub struct DialogArgs {
    #[command(flatten)]
    pub route: RouteArgs,
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
}

#[derive(Debug, Args)]
pub struct DownloadArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    #[arg(long = "ref")]
    pub element_ref: String,
    /// Approved destination directory. External wire name is destination_root.
    #[arg(long)]
    pub dir: Option<String>,
}

#[derive(Debug, Args)]
pub struct PressKeyArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    /// Key name: Enter, Tab, Escape, ArrowDown, …
    #[arg(long)]
    pub key: String,
    #[arg(long = "ref")]
    pub element_ref: Option<String>,
}

#[derive(Debug, Args)]
pub struct UploadArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    #[arg(long = "ref")]
    pub element_ref: String,
    /// Local file path (repeatable).
    #[arg(long = "file")]
    pub file: Vec<String>,
}

#[derive(Debug, Args)]
pub struct EndArgs {
    #[command(flatten)]
    pub route: RouteArgs,
}

#[derive(Debug, Args)]
pub struct TabsArgs {
    #[command(flatten)]
    pub route: RouteArgs,
    /// list | open | close | select
    #[arg(long)]
    pub action: String,
    /// Required for open (http / https / about:blank).
    #[arg(long)]
    pub url: Option<String>,
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
        "loop": "state → act → state. Desktop defaults to embedded when control.json exists.",
        "embedded": "Atmos Desktop in-app browser via host control plane",
        "tabs": "embedded only — renderer owns tab CRUD; main process does not create webviews",
        "json_flag": "browser-use always prints JSON; do not pass --json",
    })
}
