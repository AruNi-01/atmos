pub mod commands;
pub mod manager;

use std::collections::HashMap;

use remote_access::{ProviderKind, RemoteAccessStatus};
use tauri::{Emitter, Manager};

use crate::state::AppState;

/// Called once at startup (after the sidecar API is ready) to asynchronously
/// restore any tunnel providers that were running when the app was last closed.
/// Emits `remote-access-recovered` with the status map on the app handle so
/// the frontend can update its state without polling.
pub async fn startup_recover(app: tauri::AppHandle, target_base_url: String) {
    let state = app.state::<AppState>();
    let manager = &state.remote_access_manager;

    let provider_kinds: Vec<ProviderKind> = manager.persisted_provider_kinds().await;

    if provider_kinds.is_empty() {
        return;
    }

    log_startup(
        &app,
        &format!(
            "[remote-access] startup_recover: recovering {} provider(s): {:?}",
            provider_kinds.len(),
            provider_kinds
        ),
    );

    // Load credentials for each persisted provider.
    let mut credentials: HashMap<ProviderKind, Option<String>> = HashMap::new();
    for kind in &provider_kinds {
        let cred = commands::load_credential_for_provider(*kind);
        credentials.insert(*kind, cred);
    }

    // Recover passes target_base_url to the gateway — update the manager's
    // gateway config to point at the now-known sidecar port.
    match manager
        .recover_with_target(credentials, target_base_url)
        .await
    {
        Ok(recovered) if !recovered.is_empty() => {
            let recovered: HashMap<String, RemoteAccessStatus> = recovered;
            log_startup(
                &app,
                &format!(
                    "[remote-access] startup_recover: recovered providers: {:?}",
                    recovered.keys().collect::<Vec<_>>()
                ),
            );
            let _ = app.emit("remote-access-recovered", &recovered);
        }
        Ok(_) => {
            log_startup(&app, "[remote-access] startup_recover: nothing to recover");
        }
        Err(err) => {
            log_startup(
                &app,
                &format!("[remote-access] startup_recover: failed: {err}"),
            );
        }
    }
}

fn log_startup(app: &tauri::AppHandle, msg: &str) {
    let log_path = crate::logging::app_log_path(app, "desktop.log");
    crate::logging::append_log(&log_path, msg);
}
