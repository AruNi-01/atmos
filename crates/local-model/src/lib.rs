pub mod config;
pub mod download;
pub mod error;
pub mod manifest;
pub mod runtime;

pub use error::{LocalModelError, Result};
pub use manifest::{ModelManifest, ModelEntry, BinaryEntry, fetch_manifest, current_platform};
pub use runtime::{LocalModelState, LocalRuntimeManager};
