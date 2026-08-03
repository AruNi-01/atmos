//! Atmos Desktop Use — local desktop capture and optional control-engine lifecycle.
//!
//! User-facing names: **Desktop Use** / `desktop-use`. Never expose third-party
//! vendor brands in public strings (see [`strings::assert_vendor_free`]).

pub mod capture;
pub mod config;
pub mod control;
pub mod manager;
pub mod strings;

pub use capture::{capture, CaptureRequest, CaptureResult, WindowBounds};
pub use config::{desktop_use_dir, ensure_dirs, engine_bin_path, state_path};
pub use control::{drive, DriveAction, DriveError, DriveRequest, DriveResult};
pub use manager::{
    DesktopUseManager, DesktopUseStatus, DriverPhase, DriverStatus, EnsureOutcome,
};
