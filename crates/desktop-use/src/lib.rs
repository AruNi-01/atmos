//! Atmos Desktop Use — capture, optional control engine (pinned sidecar), and lifecycle.
//!
//! User-facing names: **Desktop Use** / `desktop-use` / **Atmos Desktop Use** host.
//! Never expose third-party vendor brands in public strings.

pub mod capture;
pub mod config;
pub mod control;
pub mod doctor;
pub mod drive_tools;
pub mod engine_manifest;
pub mod engine_protocol;
pub mod highlight;
pub mod host;
pub mod install;
pub mod manager;
pub mod prefs;
pub mod strings;
pub mod window_surface;

pub use capture::{capture, CaptureRequest, CaptureResult, WindowBounds};
pub use config::{desktop_use_dir, engine_bin_path, ensure_dirs, state_path};
pub use control::{
    drive, CoordSpace, DriveAction, DriveError, DriveRequest, DriveResult, HighlightMode,
    DEFAULT_DRIVE_SESSION,
};
pub use doctor::{permission_doctor, PermissionDoctor};
pub use drive_tools::build_engine_call;
pub use engine_manifest::{current_platform, EngineManifest};
// engine_protocol is used by browser-use for soft-failure detection.
pub use highlight::{
    bounds_for_window_id, build_status_label, clear_highlight, operation_border_enabled,
    pid_for_window_id, resolve_agent_name, session_cursor_fill_hex, show_cursor_caption,
    show_desktop_highlight, show_window_highlight, HighlightResult, HighlightStyle,
};
pub use host::{PermissionGrantOutcome, PermissionGrantTarget};
pub use manager::{
    DesktopUseManager, DesktopUseStatus, DriverPhase, DriverStatus, EnsureOutcome, RuntimeCheck,
};
pub use prefs::{load_prefs, save_prefs, update_prefs, DesktopUsePrefs};
pub use window_surface::{classify_surface, enrich_window_state, SurfaceKind};
