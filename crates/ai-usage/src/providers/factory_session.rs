use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::models::ProviderError;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct FactorySessionState {
    #[serde(default)]
    pub(crate) bearer_token: Option<String>,
    #[serde(default)]
    pub(crate) refresh_token: Option<String>,
    #[serde(default)]
    pub(crate) organization_id: Option<String>,
    #[serde(default)]
    pub(crate) source_label: Option<String>,
    #[serde(default)]
    pub(crate) updated_at: Option<u64>,
}

static FACTORY_SESSION_CACHE: OnceLock<Mutex<Option<FactorySessionState>>> = OnceLock::new();

pub(crate) fn load_factory_session_state() -> Result<Option<FactorySessionState>, ProviderError> {
    let cache = FACTORY_SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache
        .lock()
        .map_err(|_| ProviderError::Fetch("Factory session cache lock poisoned".to_string()))?;
    if let Some(state) = guard.clone() {
        return Ok(Some(state));
    }

    let path = factory_session_path();
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    let state = serde_json::from_str::<FactorySessionState>(&contents)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    *guard = Some(state.clone());
    Ok(Some(state))
}

pub(crate) fn store_factory_session_state(
    state: &FactorySessionState,
) -> Result<(), ProviderError> {
    let path = factory_session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", parent.display())))?;
    }

    let payload = serde_json::to_string_pretty(state).map_err(|error| {
        ProviderError::Fetch(format!("Factory session serialize failed: {error}"))
    })?;
    fs::write(&path, payload)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;

    let cache = FACTORY_SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache
        .lock()
        .map_err(|_| ProviderError::Fetch("Factory session cache lock poisoned".to_string()))?;
    *guard = Some(state.clone());
    Ok(())
}

pub(crate) fn clear_factory_session_state() -> Result<(), ProviderError> {
    let path = factory_session_path();
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    }

    let cache = FACTORY_SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache
        .lock()
        .map_err(|_| ProviderError::Fetch("Factory session cache lock poisoned".to_string()))?;
    *guard = None;
    Ok(())
}

fn factory_session_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("ai-usage")
        .join("factory-session.json")
}
