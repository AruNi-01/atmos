//! Local Atmos runtime: manifest discovery, relay identity, optional process supervisor.
//!
//! - **`client`**: `runtime_manifest.json`, `relay_identity.json`, control-plane registration.
//! - **`supervisor`**: install layout, ensure/stop/status for `~/.atmos/runtime/current/bin/api`.

mod client_state;
mod identity;
mod manifest;
mod register;

#[cfg(feature = "supervisor")]
pub mod supervisor;

pub use identity::{
    read_server_identity, relay_identity_path, resolve_server_identity_path,
    server_identity_env_path_override, write_server_identity, ServerIdentity,
    RELAY_IDENTITY_FILE_NAME,
};
pub use client_state::{
    clear_client_state, client_state_path, read_client_state, write_client_state, ClientState,
};
pub use manifest::{
    atmos_home_dir, read_runtime_manifest, remove_runtime_manifest, resolve_api_base_url,
    resolve_api_bearer_token, runtime_manifest_path, write_runtime_manifest, ApiEndpoint,
    RuntimeManifest, RUNTIME_MANIFEST_FILE_NAME, RUNTIME_MANIFEST_VERSION,
};
pub use register::{
    default_control_plane_url, normalize_control_plane_url, register_computer,
};
