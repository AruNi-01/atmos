//! Atmos Desktop Use — local desktop capture, **inspect** (UI tree), and optional control.
//!
//! User-facing names: **Desktop Use** / `desktop-use`. Never expose third-party
//! vendor brands in public strings (see [`strings::assert_vendor_free`]).
//!
//! Capability map:
//! - [`capture`] — screenshot + window identity
//! - [`inspect`] — accessibility / UI structure tree (primary agent text context)
//! - [`control`] — drive click/type via optional engine

pub mod capture;
pub mod config;
pub mod control;
pub mod inspect;
pub mod manager;
pub mod strings;

pub use capture::{capture, CaptureRequest, CaptureResult, WindowBounds};
pub use config::{desktop_use_dir, engine_bin_path, ensure_dirs, state_path};
pub use control::{drive, DriveAction, DriveError, DriveRequest, DriveResult};
pub use inspect::{build_appshot_context_markdown, inspect, InspectRequest, InspectResult};
pub use manager::{DesktopUseManager, DesktopUseStatus, DriverPhase, DriverStatus, EnsureOutcome};
