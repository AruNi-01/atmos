use std::collections::HashMap;
use std::path::PathBuf;

use remote_access::{ProviderAccessMode, ProviderKind, RemoteAccessStatus};
use serde::{Deserialize, Serialize};
use crate::logging;

use crate::remote_access::manager::RemoteAccessManager;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct StartRemoteAccessReq {
    pub provider: ProviderKind,
    pub mode: Option<ProviderAccessMode>,
    pub target_base_url: String,
    pub ttl_secs: Option<i64>,
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
    let mut providers = state.remote_access_manager.detect_all().await;

    // If ngrok has no env-var authtoken but a saved credential exists in
    // keyring, mark it as ready so the user doesn't see a false negative.
    for diag in &mut providers {
        if diag.provider == ProviderKind::Ngrok && !diag.logged_in {
            if let Ok(Some(_)) = load_provider_credential(ProviderKind::Ngrok) {
                diag.binary_found = true;
                diag.logged_in = true;
                diag.warnings.clear();
            }
        }
    }

    Ok(DetectRemoteAccessResp { providers })
}

#[tauri::command]
pub async fn remote_access_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    req: StartRemoteAccessReq,
) -> Result<RemoteAccessStatus, String> {
    let log_path = logging::app_log_path(&app, "desktop.log");
    // Always try saved credentials — the user configured them for a reason.
    let credential = load_provider_credential(req.provider).unwrap_or(None);
    logging::append_log(
        &log_path,
        &format!(
            "[remote-access] command start provider={:?} mode={:?} ttl_secs={:?} target={}",
            req.provider, req.mode, req.ttl_secs, req.target_base_url
        ),
    );

    let result = tokio::time::timeout(
        tokio::time::Duration::from_secs(28),
        state
        .remote_access_manager
        .start(
            req.provider,
            req.mode.unwrap_or(ProviderAccessMode::Private),
            req.target_base_url,
            req.ttl_secs.unwrap_or(3600),
            credential,
        ),
    )
    .await;

    match result {
        Ok(Ok(status)) => {
            logging::append_log(
                &log_path,
                &format!(
                    "[remote-access] command success provider={:?} public_url={:?}",
                    status.provider, status.public_url
                ),
            );
            Ok(status)
        }
        Ok(Err(err)) => {
            logging::append_log(
                &log_path,
                &format!("[remote-access] command failed err={err}"),
            );
            Err(err)
        }
        Err(_) => {
            let err = "remote access command timed out after 28s".to_string();
            logging::append_log(
                &log_path,
                &format!("[remote-access] command timeout err={err}"),
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn remote_access_recover(
    state: tauri::State<'_, AppState>,
) -> Result<Option<RemoteAccessStatus>, String> {
    let provider = state
        .remote_access_manager
        .persisted_provider_kind()
        .await?;
    let credential = match provider {
        Some(provider) => load_provider_credential(provider)?,
        None => None,
    };
    state.remote_access_manager.recover(credential).await
}

#[tauri::command]
pub async fn remote_access_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.remote_access_manager.stop().await
}

#[tauri::command]
pub async fn remote_access_status(
    state: tauri::State<'_, AppState>,
) -> Result<RemoteAccessStatus, String> {
    Ok(state.remote_access_manager.status().await)
}

#[tauri::command]
pub fn remote_access_provider_guide(provider: ProviderKind) -> Vec<String> {
    RemoteAccessManager::provider_guide(provider)
}

#[tauri::command]
pub fn remote_access_save_credential(req: SaveCredentialReq) -> Result<(), String> {
    let mut creds = load_all_credentials()?;
    creds.insert(credential_key(req.provider), req.credential);
    save_all_credentials(&creds)
}

#[tauri::command]
pub fn remote_access_clear_credential(provider: ProviderKind) -> Result<(), String> {
    let mut creds = load_all_credentials()?;
    creds.remove(&credential_key(provider));
    save_all_credentials(&creds)
}

// ---------------------------------------------------------------------------
// File-based credential storage (~/.atmos/remote-access/credentials.json)
// ---------------------------------------------------------------------------

fn credentials_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "could not determine home directory".to_string())?;
    Ok(home
        .join(".atmos")
        .join("remote-access")
        .join("credentials.json"))
}

fn load_all_credentials() -> Result<HashMap<String, String>, String> {
    let path = credentials_file_path()?;
    match std::fs::read(&path) {
        Ok(data) => serde_json::from_slice(&data).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn save_all_credentials(creds: &HashMap<String, String>) -> Result<(), String> {
    let path = credentials_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

fn credential_key(provider: ProviderKind) -> String {
    format!("{provider:?}").to_lowercase()
}

fn load_provider_credential(provider: ProviderKind) -> Result<Option<String>, String> {
    let creds = load_all_credentials()?;
    Ok(creds.get(&credential_key(provider)).cloned())
}
