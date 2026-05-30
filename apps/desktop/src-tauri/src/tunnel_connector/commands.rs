use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tunnel_connector::{ProviderAccessMode, ProviderKind, TunnelConnectorStatus};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use crate::logging;

use crate::state::AppState;
use crate::tunnel_connector::manager::TunnelConnectorManager;

#[derive(Debug, Deserialize)]
pub struct StartTunnelConnectorReq {
    pub provider: ProviderKind,
    pub mode: Option<ProviderAccessMode>,
    pub target_base_url: String,
    pub ttl_secs: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StopTunnelConnectorReq {
    pub provider: ProviderKind,
}

#[derive(Debug, Deserialize)]
pub struct SaveCredentialReq {
    pub provider: ProviderKind,
    pub credential: String,
}

#[derive(Debug, Serialize)]
pub struct DetectTunnelConnectorResp {
    pub providers: Vec<tunnel_connector::ProviderDiagnostics>,
}

#[tauri::command]
pub async fn tunnel_connector_detect(
    state: tauri::State<'_, AppState>,
) -> Result<DetectTunnelConnectorResp, String> {
    let mut providers = state.tunnel_connector_manager.detect_all().await;

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

    Ok(DetectTunnelConnectorResp { providers })
}

#[tauri::command]
pub async fn tunnel_connector_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    req: StartTunnelConnectorReq,
) -> Result<TunnelConnectorStatus, String> {
    let log_path = logging::app_log_path(&app, "desktop.log");
    let credential = load_provider_credential(req.provider).unwrap_or(None);
    logging::append_log(
        &log_path,
        &format!(
            "[tunnel-connector] command start provider={:?} mode={:?} ttl_secs={:?} target={}",
            req.provider, req.mode, req.ttl_secs, req.target_base_url
        ),
    );

    let app_handle = app.clone();
    let result = state
        .tunnel_connector_manager
        .start(
            req.provider,
            req.mode.unwrap_or(ProviderAccessMode::Private),
            req.target_base_url,
            req.ttl_secs.unwrap_or(3600),
            credential,
            move |err| {
                let _ = app_handle.emit("tunnel-connector-gateway-error", err);
            },
        )
        .await;

    match result {
        Ok(status) => {
            logging::append_log(
                &log_path,
                &format!(
                    "[tunnel-connector] start success provider={:?} public_url={:?}",
                    status.provider, status.public_url
                ),
            );
            Ok(status)
        }
        Err(err) => {
            logging::append_log(
                &log_path,
                &format!("[tunnel-connector] start failed err={err}"),
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn tunnel_connector_recover(
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, TunnelConnectorStatus>, String> {
    let provider_kinds = state
        .tunnel_connector_manager
        .persisted_provider_kinds()
        .await;

    let mut credentials: HashMap<tunnel_connector::ProviderKind, Option<String>> = HashMap::new();
    for kind in provider_kinds {
        credentials.insert(
            kind,
            load_provider_credential(kind).map_err(|e| e.to_string())?,
        );
    }

    let port = state
        .api_port
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .unwrap_or(30303);
    let target_base_url = format!("http://127.0.0.1:{port}");
    state
        .tunnel_connector_manager
        .recover_with_target(credentials, target_base_url)
        .await
}

#[derive(Debug, Deserialize)]
pub struct RenewTunnelConnectorReq {
    pub provider: ProviderKind,
    pub ttl_secs: Option<i64>,
    pub reuse_token: Option<bool>,
}

#[tauri::command]
pub async fn tunnel_connector_renew(
    state: tauri::State<'_, AppState>,
    req: RenewTunnelConnectorReq,
) -> Result<TunnelConnectorStatus, String> {
    state
        .tunnel_connector_manager
        .renew(
            req.provider,
            req.ttl_secs.unwrap_or(3600),
            req.reuse_token.unwrap_or(true),
        )
        .await
}

#[tauri::command]
pub async fn tunnel_connector_stop(
    state: tauri::State<'_, AppState>,
    req: StopTunnelConnectorReq,
) -> Result<(), String> {
    state.tunnel_connector_manager.stop(req.provider).await
}

#[tauri::command]
pub async fn tunnel_connector_status(
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, TunnelConnectorStatus>, String> {
    Ok(state.tunnel_connector_manager.status_all().await)
}

#[tauri::command]
pub fn tunnel_connector_provider_guide(provider: ProviderKind) -> Vec<String> {
    TunnelConnectorManager::provider_guide(provider)
}

#[tauri::command]
pub fn tunnel_connector_save_credential(req: SaveCredentialReq) -> Result<(), String> {
    let mut creds = load_all_credentials()?;
    creds.insert(credential_key(req.provider), req.credential);
    save_all_credentials(&creds)
}

#[tauri::command]
pub fn tunnel_connector_clear_credential(provider: ProviderKind) -> Result<(), String> {
    let mut creds = load_all_credentials()?;
    creds.remove(&credential_key(provider));
    save_all_credentials(&creds)
}

// ---------------------------------------------------------------------------
// File-based credential storage (~/.atmos/tunnel-connector/credentials.json)
// ---------------------------------------------------------------------------

fn credentials_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;
    Ok(home
        .join(".atmos")
        .join("tunnel-connector")
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
        #[cfg(unix)]
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn credential_key(provider: ProviderKind) -> String {
    format!("{provider:?}").to_lowercase()
}

fn load_provider_credential(provider: ProviderKind) -> Result<Option<String>, String> {
    let creds = load_all_credentials()?;
    Ok(creds.get(&credential_key(provider)).cloned())
}

/// Public helper for startup recovery (called from mod.rs).
pub fn load_credential_for_provider(provider: ProviderKind) -> Option<String> {
    load_provider_credential(provider).unwrap_or(None)
}
