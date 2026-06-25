use axum::Json;
use runtime_manager::{
    fetch_latest_cli_release, install_latest_cli, installed_cli_path, modify_shell_config,
    read_cli_version, version_gt,
};
use serde::{Deserialize, Serialize};

use crate::api::dto::ApiResponse;
use crate::error::{ApiError, ApiResult};

/// GET /api/system/cli-version-check
pub async fn check_cli_version() -> ApiResult<Json<ApiResponse<CliVersionCheckResponse>>> {
    let cli_path = installed_cli_path();
    let current_version = cli_path.as_deref().and_then(read_cli_version);
    let latest = fetch_latest_cli_release().await.ok();
    let latest_version = latest.as_ref().map(|release| release.version.clone());
    let update_available = current_version
        .as_deref()
        .zip(latest_version.as_deref())
        .map(|(current, latest)| version_gt(latest, current))
        .unwrap_or(false);

    Ok(Json(ApiResponse::success(CliVersionCheckResponse {
        installed: current_version.is_some(),
        current_version,
        latest_version,
        latest_tag: latest.as_ref().map(|release| release.tag.clone()),
        release_url: latest.as_ref().map(|release| release.url.clone()),
        update_available,
        install_path: cli_path.map(|path| path.to_string_lossy().to_string()),
    })))
}

#[derive(Debug, Serialize)]
pub struct CliVersionCheckResponse {
    installed: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
    latest_tag: Option<String>,
    release_url: Option<String>,
    update_available: bool,
    install_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InstallCliRequest {
    #[serde(default)]
    modify_path: bool,
}

#[derive(Debug, Serialize)]
pub struct CliInstallResponse {
    success: bool,
    version: Option<String>,
    message: String,
    path_modified: Option<bool>,
    path_modified_file: Option<String>,
}

/// POST /api/system/cli-install
///
/// Download and install the latest Atmos CLI from the Atmos release manifest.
pub async fn install_cli(
    Json(payload): Json<InstallCliRequest>,
) -> ApiResult<Json<ApiResponse<CliInstallResponse>>> {
    let install = install_latest_cli()
        .await
        .map_err(|error| ApiError::InternalError(format!("Failed to install CLI: {}", error)))?;

    let mut path_modified = false;
    let mut path_modified_file = None::<String>;

    if payload.modify_path {
        if let Some(bin_dir) = install.install_path.parent() {
            let result = modify_shell_config(bin_dir);
            path_modified = result.modified;
            path_modified_file = result.config_file;
        }
    }

    let mut message = format!(
        "CLI installed successfully to {}",
        install.install_path.display()
    );
    if path_modified {
        if let Some(file) = &path_modified_file {
            message.push_str(&format!(". Added to PATH in {}", file));
        }
    }

    Ok(Json(ApiResponse::success(CliInstallResponse {
        success: true,
        version: Some(install.version),
        message,
        path_modified: Some(path_modified),
        path_modified_file,
    })))
}
