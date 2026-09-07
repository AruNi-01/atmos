//! Workspace-free Device Preview helper I/O.
//!
//! No claims, no `workspace_id`. Callers pass the serve-sim binary path and
//! loopback helper port.

mod coords;
mod screenshot;
mod serve_emu;
mod serve_sim;
mod simctl_io;

pub use coords::{validate_coord, validate_point};
pub use screenshot::{png_dimensions, write_png, ScreenshotSize};
pub use serve_emu::{
    serve_emu_key, serve_emu_screenshot, serve_emu_swipe, serve_emu_tap, serve_emu_text,
};
pub use serve_sim::{serve_sim_button, serve_sim_swipe, serve_sim_tap, serve_sim_type};
pub use simctl_io::simctl_screenshot;
