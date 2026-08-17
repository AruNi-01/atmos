//! Saved Prototype Design documents under `~/.atmos/data/pt-design/`.

use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use runtime_manager::pt_design_data_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    api::dto::ApiResponse,
    app_state::AppState,
    error::{ApiError, ApiResult},
};

const FILE_SUFFIX: &str = ".ptdesign.json";

#[derive(Debug, Serialize)]
pub struct PtDesignListItem {
    pub name: String,
    pub modified_at: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct PtDesignListResponse {
    pub dir: String,
    pub items: Vec<PtDesignListItem>,
}

#[derive(Debug, Serialize)]
pub struct PtDesignFileResponse {
    pub name: String,
    pub body: Value,
}

#[derive(Debug, Serialize)]
pub struct PtDesignWriteResponse {
    pub name: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct PutQuery {
    #[serde(default)]
    pub overwrite: bool,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/documents", get(list_documents))
        .route("/documents/{name}", get(get_document).put(put_document))
        .route("/agent/invoke", post(crate::api::pt_design_agent::invoke))
        .route("/agent/status", get(crate::api::pt_design_agent::status))
}

fn ensure_dir() -> Result<std::path::PathBuf, ApiError> {
    let dir = pt_design_data_dir().map_err(ApiError::InternalError)?;
    fs::create_dir_all(&dir).map_err(|err| {
        ApiError::InternalError(format!("Failed to create {}: {err}", dir.display()))
    })?;
    Ok(dir)
}

pub fn sanitize_name(raw: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim();
    let stem = trimmed
        .strip_suffix(FILE_SUFFIX)
        .or_else(|| trimmed.strip_suffix(".json"))
        .unwrap_or(trimmed);
    let cleaned: String = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches('-');
    if cleaned.is_empty() {
        return Err(ApiError::BadRequest("Document name is required".into()));
    }
    Ok(format!("{cleaned}{FILE_SUFFIX}"))
}

fn modified_secs(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub async fn list_documents(
    State(_state): State<AppState>,
) -> ApiResult<Json<ApiResponse<PtDesignListResponse>>> {
    let dir = ensure_dir()?;
    let mut items = Vec::new();
    let read = fs::read_dir(&dir).map_err(|err| {
        ApiError::InternalError(format!("Failed to read {}: {err}", dir.display()))
    })?;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(FILE_SUFFIX) {
            continue;
        }
        let meta = entry.metadata().ok();
        items.push(PtDesignListItem {
            name,
            modified_at: meta.as_ref().map(modified_secs).unwrap_or(0),
            size_bytes: meta.map(|m| m.len()).unwrap_or(0),
        });
    }
    items.sort_by_key(|b| std::cmp::Reverse(b.modified_at));
    Ok(Json(ApiResponse::success(PtDesignListResponse {
        dir: dir.display().to_string(),
        items,
    })))
}

pub async fn get_document(
    State(_state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<Json<ApiResponse<PtDesignFileResponse>>> {
    let name = sanitize_name(&name)?;
    let path = ensure_dir()?.join(&name);
    let raw = fs::read_to_string(&path)
        .map_err(|_| ApiError::NotFound(format!("Prototype Design file not found: {name}")))?;
    let body: Value = serde_json::from_str(&raw)
        .map_err(|err| ApiError::BadRequest(format!("Invalid JSON: {err}")))?;
    Ok(Json(ApiResponse::success(PtDesignFileResponse {
        name,
        body,
    })))
}

pub async fn put_document(
    State(_state): State<AppState>,
    Path(name): Path<String>,
    Query(query): Query<PutQuery>,
    Json(body): Json<Value>,
) -> ApiResult<Json<ApiResponse<PtDesignWriteResponse>>> {
    let name = sanitize_name(&name)?;
    let path = ensure_dir()?.join(&name);
    if path.exists() && !query.overwrite {
        return Err(ApiError::BadRequest(format!(
            "{name} already exists. Save with overwrite to replace it."
        )));
    }
    let encoded = serde_json::to_string_pretty(&body)
        .map_err(|err| ApiError::BadRequest(format!("Could not encode document: {err}")))?;
    let tmp = path.with_extension(format!(
        "json.{}.tmp",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::write(&tmp, format!("{encoded}\n")).map_err(|err| {
        ApiError::InternalError(format!("Failed to write {}: {err}", tmp.display()))
    })?;
    fs::rename(&tmp, &path).map_err(|err| {
        let _ = fs::remove_file(&tmp);
        ApiError::InternalError(format!("Failed to save {}: {err}", path.display()))
    })?;
    Ok(Json(ApiResponse::success(PtDesignWriteResponse { name })))
}

#[cfg(test)]
mod tests {
    use super::sanitize_name;

    #[test]
    fn sanitizes_document_names() {
        assert_eq!(
            sanitize_name("Login flow").unwrap(),
            "Login-flow.ptdesign.json"
        );
        assert_eq!(
            sanitize_name("board.ptdesign.json").unwrap(),
            "board.ptdesign.json"
        );
        assert!(sanitize_name("   ").is_err());
    }
}
