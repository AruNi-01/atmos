//! Local Atmos runtime: manifest discovery, relay identity, optional process supervisor.
//!
//! On-disk layout: see [`layout`] (`credentials/`, `state/`, `config/`, `data/`).

mod cli_update;
mod client_session;
mod computer_client_settings;
mod computer_name;
mod device_identity;
mod identity;
mod layout;
mod linear_local_keys;
mod manifest;
mod register;
mod registration_meta;

#[cfg(feature = "supervisor")]
pub mod supervisor;

pub use cli_update::{
    ensure_standalone_cli_on_startup, fetch_latest_cli_release, install_cli_release,
    install_latest_cli, installed_cli_path, modify_shell_config, read_cli_version, version_gt,
    CliInstallResult, LatestCliRelease, ShellConfigResult,
};
pub use client_session::{
    clear_client_session, client_session_path, read_client_session, write_client_session,
    ClientSession, CLIENT_SESSION_FILE_NAME, CLIENT_SESSION_VERSION,
};
pub use computer_client_settings::{
    clear_computer_client_settings, computer_client_settings_path, read_computer_client_settings,
    resolve_relay_proxy_auth, resolved_relay_url, write_computer_client_settings,
    ComputerClientSettings, ResolvedRelayProxyAuth, COMPUTER_CLIENT_SETTINGS_FILE_NAME,
    COMPUTER_CLIENT_SETTINGS_VERSION,
};
pub use computer_name::{local_computer_display_name, local_computer_display_name_opt};
pub use device_identity::app_device_id;
pub use identity::{
    clear_server_identity, read_server_identity, relay_identity_path, resolve_server_identity_path,
    server_identity_env_path_override, write_server_identity, ServerIdentity,
    RELAY_IDENTITY_FILE_NAME,
};
pub use layout::{
    agent_config_dir, atmos_home_dir, automations_data_dir, browser_use_bindings_dir,
    browser_use_data_dir, browser_use_state_dir, config_dir, credentials_dir, data_dir,
    db_data_dir, desktop_data_dir, desktop_use_data_dir, ensure_layout_dirs,
    function_settings_path, llm_config_dir, llm_providers_path, local_model_runtime_data_dir,
    pt_design_data_dir, quota_usage_data_dir, review_data_dir, serve_sim_runtime_dir,
    simulator_state_dir, state_dir, terminal_code_agent_path, token_usage_data_dir,
    workspaces_data_dir,
};
pub use linear_local_keys::{
    clear_linear_local_keys, linear_local_keys_path, read_linear_local_keys,
    write_linear_local_keys, LinearLocalApiKeyRecord, LinearLocalAuthSelection,
    LinearLocalKeysFile, LINEAR_LOCAL_KEYS_FILE_NAME, LINEAR_LOCAL_KEYS_VERSION,
};
pub use manifest::{
    read_runtime_manifest, remove_runtime_manifest, resolve_api_base_url, resolve_api_bearer_token,
    runtime_manifest_path, write_runtime_manifest, ApiEndpoint, RuntimeManifest,
    RUNTIME_MANIFEST_FILE_NAME, RUNTIME_MANIFEST_VERSION,
};
pub use register::{default_relay_url, normalize_relay_url, register_computer};
pub use registration_meta::RegistrationMeta;
