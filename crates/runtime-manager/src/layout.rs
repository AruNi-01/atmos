//! Canonical `~/.atmos` on-disk layout (no legacy root-level secret/config files).
//!
//! ```text
//! ~/.atmos/
//!   credentials/   # secrets & machine identity (mode 0600 files)
//!   state/         # sessions, discovery (non-install machine state)
//!   config/        # non-secret preferences
//!   data/          # databases, workspaces, feature data dirs
//!   bin/ runtime/ shims/ skills/ logs/ cache/   # install & ops (unchanged names)
//! ```

use std::fs;
use std::path::PathBuf;

/// `~/.atmos` root (or `./.atmos` if home is unknown only via callers that fall back).
pub fn atmos_home_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".atmos"))
}

/// Secrets and machine identity only.
pub fn credentials_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("credentials"))
}

/// Sessions and runtime discovery (not user preferences).
pub fn state_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("state"))
}

/// Non-secret user/product configuration.
pub fn config_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("config"))
}

/// Durable product data (DB, workspaces, feature stores).
pub fn data_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("data"))
}

pub fn ensure_layout_dirs() -> Result<(), String> {
    for dir in [credentials_dir()?, state_dir()?, config_dir()?, data_dir()?] {
        fs::create_dir_all(&dir)
            .map_err(|err| format!("Failed to create {}: {}", dir.display(), err))?;
    }
    Ok(())
}

// --- credentials ---

pub fn computer_client_settings_path() -> Result<PathBuf, String> {
    Ok(credentials_dir()?.join("computer-client.json"))
}

pub fn linear_local_keys_path() -> Result<PathBuf, String> {
    Ok(credentials_dir()?.join("linear_local_keys.json"))
}

pub fn relay_identity_path() -> Result<PathBuf, String> {
    Ok(credentials_dir()?.join("relay_identity.json"))
}

// --- state ---

pub fn runtime_manifest_path() -> Result<PathBuf, String> {
    Ok(state_dir()?.join("runtime_manifest.json"))
}

pub fn client_session_path() -> Result<PathBuf, String> {
    Ok(state_dir()?.join("client-session.json"))
}

/// APP-062 `pipe-pane` helper sockets (`~/.atmos/state/tmux-pipes/`).
/// Override with `ATMOS_TMUX_PIPES_DIR` (tests).
pub fn tmux_pipes_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("ATMOS_TMUX_PIPES_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(state_dir()?.join("tmux-pipes"))
}

// --- config ---

pub fn function_settings_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("function_settings.json"))
}

pub fn agent_config_dir() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("agent"))
}

pub fn terminal_code_agent_path() -> Result<PathBuf, String> {
    Ok(agent_config_dir()?.join("terminal_code_agent.json"))
}

pub fn llm_config_dir() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("llm"))
}

pub fn llm_providers_path() -> Result<PathBuf, String> {
    Ok(llm_config_dir()?.join("providers.json"))
}

// --- data (helpers for cross-crate consistency) ---

/// Product quota-usage store — always under `data/`, never `data/desktop/`.
pub fn quota_usage_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("quota-usage"))
}

/// Product token-usage store — always under `data/`, never `data/desktop/`.
pub fn token_usage_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("token-usage"))
}

pub fn workspaces_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("workspaces"))
}

pub fn review_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("review"))
}

pub fn automations_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("automations"))
}

pub fn desktop_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("desktop"))
}

pub fn desktop_use_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("desktop-use"))
}

pub fn browser_use_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("browser-use"))
}

/// Short-lived Browser Use capability bindings (not durable product data).
pub fn browser_use_state_dir() -> Result<PathBuf, String> {
    Ok(state_dir()?.join("browser-use"))
}

pub fn browser_use_bindings_dir() -> Result<PathBuf, String> {
    Ok(browser_use_state_dir()?.join("bindings"))
}

/// On-demand serve-sim helper installs: `~/.atmos/runtime/serve-sim/<version>/`.
pub fn serve_sim_runtime_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("runtime").join("serve-sim"))
}

/// Simulator session claims / leases (not product data).
pub fn simulator_state_dir() -> Result<PathBuf, String> {
    Ok(state_dir()?.join("simulator"))
}

pub fn local_model_runtime_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("local-model-runtime"))
}

pub fn db_data_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_is_under_atmos_home() {
        let home = atmos_home_dir().unwrap();
        assert!(computer_client_settings_path()
            .unwrap()
            .starts_with(home.join("credentials")));
        assert!(runtime_manifest_path()
            .unwrap()
            .starts_with(home.join("state")));
        assert!(function_settings_path()
            .unwrap()
            .starts_with(home.join("config")));
        assert!(quota_usage_data_dir()
            .unwrap()
            .starts_with(home.join("data")));
        assert!(browser_use_state_dir()
            .unwrap()
            .starts_with(home.join("state")));
        assert!(browser_use_bindings_dir()
            .unwrap()
            .starts_with(home.join("state").join("browser-use")));
        assert!(serve_sim_runtime_dir()
            .unwrap()
            .starts_with(home.join("runtime").join("serve-sim")));
        assert!(simulator_state_dir()
            .unwrap()
            .starts_with(home.join("state").join("simulator")));
        assert!(tmux_pipes_dir()
            .unwrap()
            .starts_with(home.join("state").join("tmux-pipes")));
    }
}
