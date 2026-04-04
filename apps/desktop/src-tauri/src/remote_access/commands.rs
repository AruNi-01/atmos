use remote_access::{ProviderAccessMode, ProviderKind, ProviderStatus};
use serde::{Deserialize, Serialize};

use crate::remote_access::manager::RemoteAccessManager;
use crate::state::AppState;

const REMOTE_ACCESS_SERVICE: &str = "atmos-remote-access";

#[derive(Debug, Deserialize)]
pub struct StartRemoteAccessReq {
    pub provider: ProviderKind,
    pub mode: Option<ProviderAccessMode>,
    pub target_base_url: String,
    pub ttl_secs: Option<i64>,
    pub use_saved_credential: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SaveCredentialReq {
    pub provider: ProviderKind,
    pub credential: String,
}

#[derive(Debug, Serialize)]
pub struct DetectRemoteAccessResp {
    pub providers: Vec<remote_access::ProviderDiagnostics>,
}

#[tauri::command]
pub async fn remote_access_detect(
    state: tauri::State<'_, AppState>,
) -> Result<DetectRemoteAccessResp, String> {
    let providers = state.remote_access_manager.detect_all().await;
    Ok(DetectRemoteAccessResp { providers })
}

#[tauri::command]
pub async fn remote_access_start(
    state: tauri::State<'_, AppState>,
    req: StartRemoteAccessReq,
) -> Result<ProviderStatus, String> {
    let credential = if req.use_saved_credential.unwrap_or(false) {
        load_provider_credential(req.provider)?
    } else {
        None
    };

    state
        .remote_access_manager
        .start(
            req.provider,
            req.mode.unwrap_or(ProviderAccessMode::Private),
            req.target_base_url,
            req.ttl_secs.unwrap_or(3600),
            credential,
        )
        .await
}

#[tauri::command]
pub async fn remote_access_recover(
    state: tauri::State<'_, AppState>,
    provider: ProviderKind,
) -> Result<Option<ProviderStatus>, String> {
    let credential = load_provider_credential(provider)?;
    state.remote_access_manager.recover(credential).await
}

#[tauri::command]
pub async fn remote_access_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.remote_access_manager.stop().await
}

#[tauri::command]
pub async fn remote_access_status(
    state: tauri::State<'_, AppState>,
) -> Result<ProviderStatus, String> {
    Ok(state.remote_access_manager.status().await)
}

#[tauri::command]
pub fn remote_access_provider_guide(provider: ProviderKind) -> Vec<String> {
    RemoteAccessManager::provider_guide(provider)
}

#[tauri::command]
pub fn remote_access_save_credential(req: SaveCredentialReq) -> Result<(), String> {
    let entry = keyring::Entry::new(REMOTE_ACCESS_SERVICE, &credential_account(req.provider))
        .map_err(|err| err.to_string())?;
    entry
        .set_password(&req.credential)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn remote_access_clear_credential(provider: ProviderKind) -> Result<(), String> {
    let entry = keyring::Entry::new(REMOTE_ACCESS_SERVICE, &credential_account(provider))
        .map_err(|err| err.to_string())?;

    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn load_provider_credential(provider: ProviderKind) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(REMOTE_ACCESS_SERVICE, &credential_account(provider))
        .map_err(|err| err.to_string())?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn credential_account(provider: ProviderKind) -> String {
    format!("provider::{provider:?}")
}
