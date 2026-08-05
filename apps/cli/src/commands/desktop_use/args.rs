//! Clap argument types for `atmos desktop-use`.

use clap::{Args, Subcommand};

#[derive(Debug, Subcommand)]
pub enum DesktopUseCommand {
    /// Show Desktop Use capture + control-engine status.
    Status,
    /// Permission doctor for Atmos Desktop Use host (unified TCC surface).
    Doctor,
    /// Manage the optional desktop control engine.
    Driver {
        #[command(subcommand)]
        command: DriverCommand,
    },
    /// Capture the frontmost window (screenshot + identity).
    Capture(CaptureArgs),
    /// Drive desktop actions (screenshot / click / type / verify).
    Drive {
        #[command(subcommand)]
        command: Box<DriveCommand>,
    },
    /// Read or update Desktop Use user prefs (operation border, idle clear).
    Prefs {
        #[command(subcommand)]
        command: PrefsCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum PrefsCommand {
    /// Show current prefs.
    Get,
    /// Update prefs (only provided flags are changed).
    Set(PrefsSetArgs),
}

#[derive(Debug, Args)]
pub struct PrefsSetArgs {
    /// Show blinking operation border while driving (true/false).
    #[arg(long)]
    pub operation_border: Option<String>,
    /// Auto-clear border after this many ms of idle (0 = never).
    #[arg(long)]
    pub highlight_idle_ms: Option<u64>,
}

#[derive(Debug, Subcommand)]
pub enum DriverCommand {
    /// Install or refresh the desktop control engine (pinned package).
    Ensure(EnsureArgs),
    /// Show control-engine status only.
    Status,
    /// Stop the control engine daemon (does not delete the binary).
    Stop,
    /// Remove the installed control engine binary.
    Uninstall,
    /// Open OS permission grant flow for Atmos Desktop Use host.
    GrantPermissions(GrantPermissionsArgs),
}

#[derive(Debug, Args)]
pub struct GrantPermissionsArgs {
    /// Which Privacy pane to open: accessibility | screen_recording | all
    #[arg(long, default_value = "all")]
    pub target: String,
}

#[derive(Debug, Args)]
pub struct EnsureArgs {
    /// Re-install even if a control engine is already present.
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct CaptureArgs {
    /// Write PNG to this path instead of embedding base64 only.
    #[arg(long)]
    pub out: Option<String>,
    /// Always include base64 in JSON (default when --out is omitted).
    #[arg(long, default_value_t = false)]
    pub base64: bool,
}

#[derive(Debug, Subcommand)]
pub enum DriveCommand {
    /// Capture a screenshot via Desktop Use.
    Screenshot(ScreenshotArgs),
    /// Click at screen coordinates or AX element (requires control engine).
    Click(ClickArgs),
    /// Double-click (Phase 1).
    #[command(name = "double-click")]
    DoubleClick(ClickArgs),
    /// Right-click (Phase 1).
    #[command(name = "right-click")]
    RightClick(ClickArgs),
    /// Drag from --from-x/y to --to-x/y (Phase 1).
    Drag(DragArgs),
    /// Scroll (Phase 1).
    Scroll(ScrollArgs),
    /// Hotkey chord, e.g. --keys cmd,c (Phase 1).
    Hotkey(HotkeyArgs),
    /// Single key press (Phase 1).
    Key(KeyArgs),
    /// Move cursor (Phase 1).
    Move(MoveArgs),
    /// List apps (Phase 1).
    Apps,
    /// Launch app by bundle id or name (Phase 1).
    Launch(LaunchArgs),
    /// Terminate process by pid (Phase 1).
    Quit(QuitArgs),
    /// Clipboard get/set (Phase 1).
    Clipboard {
        #[command(subcommand)]
        command: ClipboardCommand,
    },
    /// Screen size (Phase 1).
    Screen,
    /// Cursor position (Phase 1).
    Cursor,
    /// Invoke application menu path (Phase 1).
    Menu(MenuArgs),
    /// Lightweight desktop accessibility tree (Phase 1).
    #[command(name = "ax-tree")]
    AxTree,
    /// Type text (requires control engine).
    Type(TypeArgs),
    /// Verify engine is live (list windows).
    Verify,
    /// Snapshot one window's AX elements (background-friendly; prefer for element clicks).
    WindowState(WindowStateArgs),
    /// Show/clear target window or desktop border highlight.
    Highlight(HighlightArgs),
    /// End drive session: clear operation border and agent cursor session.
    SessionEnd,
    /// Bring app/window to front (Phase 2 — explicit only).
    Front(FrontArgs),
    /// Set AX value on an element (Phase 2).
    #[command(name = "set-value")]
    SetValue(SetValueArgs),
    /// Set window frame (Phase 2).
    #[command(name = "window-frame")]
    WindowFrame(WindowFrameArgs),
    /// Zoom/crop window region (Phase 2).
    Zoom(ZoomArgs),
    /// Verify structured window predicates (Phase 2).
    #[command(name = "verify-state")]
    VerifyState(VerifyStateArgs),
}

#[derive(Debug, Subcommand)]
pub enum ClipboardCommand {
    Get(ClipboardGetArgs),
    Set(ClipboardSetArgs),
}

#[derive(Debug, Args)]
pub struct ClipboardGetArgs {}

#[derive(Debug, Args)]
pub struct ClipboardSetArgs {
    #[arg(long)]
    pub text: String,
}

#[derive(Debug, Args)]
pub struct DragArgs {
    #[arg(long)]
    pub from_x: i32,
    #[arg(long)]
    pub from_y: i32,
    #[arg(long)]
    pub to_x: i32,
    #[arg(long)]
    pub to_y: i32,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct ScrollArgs {
    #[arg(long)]
    pub direction: String,
    #[arg(long)]
    pub amount: Option<i32>,
    #[arg(long)]
    pub by: Option<String>,
    #[arg(long)]
    pub x: Option<i32>,
    #[arg(long)]
    pub y: Option<i32>,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub element_token: Option<String>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct HotkeyArgs {
    /// Comma-separated keys, e.g. cmd,c or ctrl,shift,t
    #[arg(long)]
    pub keys: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct KeyArgs {
    #[arg(long)]
    pub key: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
}

#[derive(Debug, Args)]
pub struct MoveArgs {
    #[arg(long)]
    pub x: i32,
    #[arg(long)]
    pub y: i32,
    #[arg(long, default_value = "png")]
    pub coord_space: String,
    #[arg(long)]
    pub session: Option<String>,
}

#[derive(Debug, Args)]
pub struct LaunchArgs {
    #[arg(long)]
    pub bundle_id: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
}

#[derive(Debug, Args)]
pub struct QuitArgs {
    #[arg(long)]
    pub pid: i32,
}

#[derive(Debug, Args)]
pub struct MenuArgs {
    #[arg(long)]
    pub pid: i32,
    /// JSON array path, e.g. '["File","New"]'
    #[arg(long)]
    pub path: String,
    #[arg(long)]
    pub window_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct FrontArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct SetValueArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    #[arg(long)]
    pub element_token: Option<String>,
    #[arg(long)]
    pub element_index: Option<i32>,
    #[arg(long)]
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowFrameArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    #[arg(long)]
    pub x: i32,
    #[arg(long)]
    pub y: i32,
    #[arg(long)]
    pub width: i32,
    #[arg(long)]
    pub height: i32,
}

#[derive(Debug, Args)]
pub struct ZoomArgs {
    #[arg(long)]
    pub window_id: i64,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub x1: f64,
    #[arg(long)]
    pub y1: f64,
    #[arg(long)]
    pub x2: f64,
    #[arg(long)]
    pub y2: f64,
}

#[derive(Debug, Args)]
pub struct VerifyStateArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    /// Optional JSON array for expect predicates.
    #[arg(long)]
    pub expect: Option<String>,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    #[arg(long)]
    pub out: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    /// X coordinate (top-left origin). Default: PNG pixels from `drive screenshot`. With --window-id: window-local image pixels. Not required with --element-token.
    #[arg(long)]
    pub x: Option<i32>,
    /// Y coordinate (top-left origin). Default: PNG pixels from `drive screenshot`. With --window-id: window-local image pixels. Not required with --element-token.
    #[arg(long)]
    pub y: Option<i32>,
    /// Optional process id. Prefer omitting for screen-absolute pixel clicks. Required for element clicks when token alone is insufficient.
    #[arg(long)]
    pub pid: Option<i32>,
    /// Optional window id for window-local coordinates / foreground delivery / window border highlight.
    #[arg(long)]
    pub window_id: Option<i64>,
    /// background (default, no persistent fronting) or foreground (brief front→act→restore).
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
    /// Desktop-scope coord space: `png` (default, screenshot pixels, often 2× on Retina) or `points` (logical screen / AX / list_windows bounds).
    #[arg(long, default_value = "png")]
    pub coord_space: String,
    /// Agent cursor session id (default atmos-desktop-use). Pass empty string to disable cursor chrome.
    #[arg(long)]
    pub session: Option<String>,
    /// AX element token from `drive window-state` (true background path; preferred).
    #[arg(long)]
    pub element_token: Option<String>,
    /// AX element index (requires --snapshot-id). Prefer --element-token.
    #[arg(long)]
    pub element_index: Option<i32>,
    /// Snapshot id from `drive window-state` (with --element-index).
    #[arg(long)]
    pub snapshot_id: Option<String>,
    /// Border highlight: auto (default) | desktop | clear | off
    #[arg(long, default_value = "auto")]
    pub highlight: String,
    /// Under-arrow status text (what the agent is doing). Overrides auto copy.
    #[arg(long)]
    pub status: Option<String>,
    /// Agent display name for fallback "{name} Operating". Also reads ATMOS_DESKTOP_USE_AGENT_NAME.
    #[arg(long)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub pid: Option<i32>,
    #[arg(long)]
    pub window_id: Option<i64>,
    /// background (default) or foreground.
    #[arg(long, default_value = "background")]
    pub delivery_mode: String,
    /// AX element token from `drive window-state` (preferred for focused fields).
    #[arg(long)]
    pub element_token: Option<String>,
    /// AX element index (requires --snapshot-id + --window-id). Prefer --element-token.
    #[arg(long)]
    pub element_index: Option<i32>,
    /// Snapshot id from `drive window-state` (with --element-index).
    #[arg(long)]
    pub snapshot_id: Option<String>,
    #[arg(long, default_value = "auto")]
    pub highlight: String,
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowStateArgs {
    #[arg(long)]
    pub pid: i32,
    #[arg(long)]
    pub window_id: i64,
    /// Include window screenshot (heavier; default false). Use when AX is empty (pixel path).
    #[arg(long, default_value_t = false)]
    pub screenshot: bool,
    /// Cap AX nodes walked (engine default ~2000). Lower for heavy Electron trees.
    #[arg(long)]
    pub max_elements: Option<i32>,
    /// Cap AX walk depth (engine default ~25). Lower for deep Electron menus.
    #[arg(long)]
    pub max_depth: Option<i32>,
    /// Case-insensitive substring filter over role / name / text (engine `query`).
    #[arg(long)]
    pub query: Option<String>,
}

#[derive(Debug, Args)]
pub struct HighlightArgs {
    /// auto | desktop | clear | window (window needs --x --y --width --height)
    #[arg(long, default_value = "desktop")]
    pub mode: String,
    #[arg(long)]
    pub x: Option<i32>,
    #[arg(long)]
    pub y: Option<i32>,
    #[arg(long)]
    pub width: Option<i32>,
    #[arg(long)]
    pub height: Option<i32>,
    /// Target CGWindowID — border stacks just above this window (covered when app is covered).
    #[arg(long)]
    pub window_id: Option<i64>,
    /// Under-arrow / border status text.
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long)]
    pub agent_name: Option<String>,
}
