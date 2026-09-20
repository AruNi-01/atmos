//! Host Desktop Use lifecycle on Atmos Server (APP-076).
//! REST: not a workbench session stream (same class as `/api/system/cli-*`).

use axum::{
    extract::Query,
    routing::{get, post},
    Json, Router,
};
use desktop_use::{
    load_prefs, permission_doctor, update_prefs, DesktopUseManager, DesktopUsePrefs,
};
use serde::Deserialize;
use serde_json::Value;

use crate::api::dto::ApiResponse;
use crate::app_state::AppState;
use crate::error::{ApiError, ApiResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(status))
        .route("/doctor", get(doctor))
        .route("/driver/ensure", post(driver_ensure))
        .route("/driver/stop", post(driver_stop))
        .route("/driver/restart", post(driver_restart))
        .route("/driver/check", post(driver_check))
        .route("/driver/uninstall", post(driver_uninstall))
        .route("/prefs", get(prefs_get).put(prefs_put))
}

async fn status() -> ApiResult<Json<ApiResponse<Value>>> {
    let value =
        tokio::task::spawn_blocking(|| serde_json::to_value(DesktopUseManager::new().status()))
            .await
            .map_err(|e| ApiError::InternalError(e.to_string()))?
            .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn doctor() -> ApiResult<Json<ApiResponse<Value>>> {
    let value = tokio::task::spawn_blocking(|| {
        let mgr = DesktopUseManager::new();
        serde_json::to_value(permission_doctor(&mgr))
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

#[derive(Debug, Default, Deserialize)]
struct EnsureQuery {
    #[serde(default)]
    force: bool,
}

async fn driver_ensure(Query(query): Query<EnsureQuery>) -> ApiResult<Json<ApiResponse<Value>>> {
    let force = query.force;
    let value = tokio::task::spawn_blocking(move || {
        let mgr = DesktopUseManager::new();
        let outcome = mgr.ensure_driver(force);
        serde_json::json!({
            "outcome": outcome,
            "status": mgr.status().driver,
        })
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn driver_stop() -> ApiResult<Json<ApiResponse<Value>>> {
    let value = tokio::task::spawn_blocking(|| {
        let mgr = DesktopUseManager::new();
        serde_json::to_value(mgr.stop_driver())
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn driver_restart() -> ApiResult<Json<ApiResponse<Value>>> {
    let value = tokio::task::spawn_blocking(|| {
        let mgr = DesktopUseManager::new();
        match mgr.restart_driver() {
            Ok(driver) => serde_json::json!({"ok": true, "status": driver}),
            Err(error) => serde_json::json!({"ok": false, "error": error}),
        }
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn driver_check() -> ApiResult<Json<ApiResponse<Value>>> {
    let value = tokio::task::spawn_blocking(|| {
        serde_json::to_value(DesktopUseManager::new().runtime_check())
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn driver_uninstall() -> ApiResult<Json<ApiResponse<Value>>> {
    let value = tokio::task::spawn_blocking(|| {
        serde_json::to_value(DesktopUseManager::new().uninstall_driver())
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(value)))
}

async fn prefs_get() -> ApiResult<Json<ApiResponse<DesktopUsePrefs>>> {
    let prefs = tokio::task::spawn_blocking(load_prefs)
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(Json(ApiResponse::success(prefs)))
}

async fn prefs_put(
    Json(prefs): Json<DesktopUsePrefs>,
) -> ApiResult<Json<ApiResponse<DesktopUsePrefs>>> {
    let updated = tokio::task::spawn_blocking(move || {
        update_prefs(
            Some(prefs.operation_border_enabled),
            Some(prefs.highlight_idle_ms),
        )
    })
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?
    .map_err(ApiError::BadRequest)?;
    Ok(Json(ApiResponse::success(updated)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_payload_is_desktop_use_product() {
        let mgr = DesktopUseManager::new();
        let v = serde_json::to_value(mgr.status()).expect("json");
        assert_eq!(
            v.get("product").and_then(|p| p.as_str()),
            Some("Desktop Use")
        );
    }
}
