//! Atmos Desktop Use — capture, optional control engine (pinned sidecar), and lifecycle.
//!
//! User-facing names: **Desktop Use** / `desktop-use` / **Atmos Desktop Use** host.
//! Never expose third-party vendor brands in public strings.

pub mod capture;
pub mod config;
pub mod control;
pub mod doctor;
pub mod engine_manifest;
pub mod host;
pub mod install;
pub mod manager;
pub mod strings;

pub use capture::{capture, CaptureRequest, CaptureResult, WindowBounds};
pub use config::{desktop_use_dir, engine_bin_path, ensure_dirs, state_path};
pub use control::{drive, DriveAction, DriveError, DriveRequest, DriveResult};
pub use doctor::{permission_doctor, PermissionDoctor};
pub use engine_manifest::{current_platform, EngineManifest};
pub use manager::{DesktopUseManager, DesktopUseStatus, DriverPhase, DriverStatus, EnsureOutcome};
