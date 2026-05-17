//! Local Atmos runtime: manifest discovery, relay identity, optional process supervisor.
//!
//! - **`client`**: `runtime_manifest.json`, `relay_identity.json`, control-plane registration.
//! - **`supervisor`**: install layout, ensure/stop/status for `~/.atmos/runtime/current/bin/api`.

mod client_session;
mod computer_client_settings;
mod computer_name;
mod identity;
mod manifest;
mod register;
mod registration_meta;

#[cfg(feature = "supervisor")]
pub mod supervisor;

pub use identity::{
    clear_server_identity, read_server_identity, relay_identity_path,
    resolve_server_identity_path, server_identity_env_path_override, write_server_identity,
    ServerIdentity, RELAY_IDENTITY_FILE_NAME,
};
pub use client_session::{
    clear_client_session, client_session_path, read_client_session, write_client_session,
    ClientSession, CLIENT_SESSION_FILE_NAME, CLIENT_SESSION_VERSION,
};
pub use computer_client_settings::{
    clear_computer_client_settings, computer_client_settings_path, read_computer_client_settings,
    resolved_control_plane_url, write_computer_client_settings, ComputerClientSettings,
    COMPUTER_CLIENT_SETTINGS_FILE_NAME, COMPUTER_CLIENT_SETTINGS_VERSION,
};
pub use manifest::{
    atmos_home_dir, read_runtime_manifest, remove_runtime_manifest, resolve_api_base_url,
    resolve_api_bearer_token, runtime_manifest_path, write_runtime_manifest, ApiEndpoint,
    RuntimeManifest, RUNTIME_MANIFEST_FILE_NAME, RUNTIME_MANIFEST_VERSION,
};
pub use computer_name::{local_computer_display_name, local_computer_display_name_opt};
pub use register::{
    default_control_plane_url, normalize_control_plane_url, register_computer,
};
pub use registration_meta::RegistrationMeta;
