//! Atmos Desktop Use — capture, optional control engine (pinned sidecar), and lifecycle.
//!
//! User-facing names: **Desktop Use** / `desktop-use` / **Atmos Desktop Use** host.
//! Never expose third-party vendor brands in public strings.

pub mod capture;
pub mod config;
pub mod control;
pub mod doctor;
pub mod engine_manifest;
pub mod engine_protocol;
pub mod highlight;
pub mod host;
pub mod install;
pub mod manager;
pub mod prefs;
pub mod strings;

pub use capture::{capture, CaptureRequest, CaptureResult, WindowBounds};
pub use config::{desktop_use_dir, engine_bin_path, ensure_dirs, state_path};
pub use control::{
    drive, CoordSpace, DriveAction, DriveError, DriveRequest, DriveResult, HighlightMode,
    DEFAULT_DRIVE_SESSION,
};
pub use doctor::{permission_doctor, PermissionDoctor};
pub use engine_manifest::{current_platform, EngineManifest};
pub use highlight::{
    build_status_label, clear_highlight, operation_border_enabled, resolve_agent_name,
    show_cursor_caption, show_desktop_highlight, show_window_highlight, HighlightResult,
    HighlightStyle,
};
pub use host::PermissionGrantTarget;
pub use manager::{DesktopUseManager, DesktopUseStatus, DriverPhase, DriverStatus, EnsureOutcome};
pub use prefs::{load_prefs, save_prefs, update_prefs, DesktopUsePrefs};
