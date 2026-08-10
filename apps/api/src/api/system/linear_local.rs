//! `~/.atmos/credentials/linear_local_keys.json` HTTP surface (machine-local Linear API keys).

use axum::http::HeaderMap;
use axum::Json;
use runtime_manager::{
    clear_linear_local_keys, linear_local_keys_path, read_linear_local_keys,
    write_linear_local_keys, LinearLocalApiKeyRecord, LinearLocalAuthSelection,
    LinearLocalKeysFile, LINEAR_LOCAL_KEYS_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::dto::ApiResponse;
use crate::error::{ApiError, ApiResult};

fn is_relay_gateway_request(headers: &HeaderMap) -> bool {
    headers
        .get("x-atmos-relay-gateway")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == "1")
}

fn is_hosted_web_request(headers: &HeaderMap) -> bool {
    headers
        .get("x-atmos-hosted-web")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == "1")
}

fn expose_secrets(headers: &HeaderMap) -> bool {
    !is_relay_gateway_request(headers) && !is_hosted_web_request(headers)
}

fn selection_to_json(selection: &LinearLocalAuthSelection) -> Value {
    match selection {
        LinearLocalAuthSelection::None => json!({ "mode": "none" }),
        LinearLocalAuthSelection::Oauth => json!({ "mode": "oauth" }),
        LinearLocalAuthSelection::Local { key_id } => {
            json!({ "mode": "local", "keyId": key_id })
        }
    }
}

fn key_to_json(key: &LinearLocalApiKeyRecord, expose: bool) -> Value {
    json!({
        "id": key.id,
        "name": key.name,
        "api_key": if expose { key.api_key.clone() } else { String::new() },
        "api_key_configured": !key.api_key.trim().is_empty(),
        "viewer_name": key.viewer_name,
        "viewer_email": key.viewer_email,
        "created_at": key.created_at,
    })
}

/// GET /api/system/linear-local-keys
pub async fn get_linear_local_keys(headers: HeaderMap) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = linear_local_keys_path();
    let expose = expose_secrets(&headers);
    let file = read_linear_local_keys().map_err(ApiError::BadRequest)?;
    let file = file.unwrap_or_default();
    Ok(Json(ApiResponse::success(json!({
        "path": path.display().to_string(),
        "keys": file
            .keys
            .iter()
            .map(|k| key_to_json(k, expose))
            .collect::<Vec<_>>(),
        "selection": selection_to_json(&file.selection),
    }))))
}

#[derive(Debug, Deserialize)]
pub struct PutLinearLocalKeyWire {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub viewer_name: Option<String>,
    #[serde(default)]
    pub viewer_email: Option<String>,
    #[serde(default)]
    pub created_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PutLinearLocalSelectionWire {
    pub mode: String,
    #[serde(default, alias = "keyId", alias = "key_id")]
    pub key_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PutLinearLocalKeysPayload {
    #[serde(default)]
    pub clear: bool,
    #[serde(default)]
    pub keys: Option<Vec<PutLinearLocalKeyWire>>,
    #[serde(default)]
    pub selection: Option<PutLinearLocalSelectionWire>,
}

/// PUT /api/system/linear-local-keys — replace store or clear file.
pub async fn put_linear_local_keys(
    headers: HeaderMap,
    Json(payload): Json<PutLinearLocalKeysPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let path = linear_local_keys_path();
    let expose = expose_secrets(&headers);

    if payload.clear {
        let removed = clear_linear_local_keys().map_err(ApiError::BadRequest)?;
        return Ok(Json(ApiResponse::success(json!({
            "ok": true,
            "action": if removed { "cleared" } else { "absent" },
            "path": path.display().to_string(),
            "keys": [],
            "selection": { "mode": "none" },
        }))));
    }

    let existing = read_linear_local_keys()
        .map_err(ApiError::BadRequest)?
        .unwrap_or_default();

    let keys = if let Some(incoming) = payload.keys {
        let mut out = Vec::with_capacity(incoming.len());
        for row in incoming {
            let id = row.id.trim().to_string();
            if id.is_empty() {
                return Err(ApiError::BadRequest("key id is required".into()));
            }
            let name = row.name.trim().to_string();
            if name.is_empty() {
                return Err(ApiError::BadRequest("key name is required".into()));
            }
            let prev = existing.keys.iter().find(|k| k.id == id);
            let api_key = row
                .api_key
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| prev.map(|k| k.api_key.clone()))
                .unwrap_or_default();
            if api_key.is_empty() {
                return Err(ApiError::BadRequest(format!(
                    "api_key is required for new key {id}"
                )));
            }
            out.push(LinearLocalApiKeyRecord {
                id,
                name,
                api_key,
                viewer_name: row
                    .viewer_name
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .or_else(|| prev.and_then(|k| k.viewer_name.clone())),
                viewer_email: row
                    .viewer_email
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .or_else(|| prev.and_then(|k| k.viewer_email.clone())),
                created_at: row
                    .created_at
                    .or_else(|| prev.map(|k| k.created_at))
                    .unwrap_or_else(|| chrono_like_now()),
            });
        }
        out
    } else {
        existing.keys.clone()
    };

    let selection = if let Some(sel) = payload.selection {
        match sel.mode.trim().to_ascii_lowercase().as_str() {
            "oauth" => LinearLocalAuthSelection::Oauth,
            "local" => {
                let key_id = sel
                    .key_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| {
                        ApiError::BadRequest("selection.keyId required for local mode".into())
                    })?
                    .to_string();
                if !keys.iter().any(|k| k.id == key_id) {
                    return Err(ApiError::BadRequest(format!(
                        "selection.keyId {key_id} not found in keys"
                    )));
                }
                LinearLocalAuthSelection::Local { key_id }
            }
            _ => LinearLocalAuthSelection::None,
        }
    } else {
        existing.selection.clone()
    };

    // Drop local selection if key list no longer contains it.
    let selection = match &selection {
        LinearLocalAuthSelection::Local { key_id } if !keys.iter().any(|k| k.id == *key_id) => {
            LinearLocalAuthSelection::None
        }
        other => other.clone(),
    };

    let file = LinearLocalKeysFile {
        version: LINEAR_LOCAL_KEYS_VERSION,
        keys,
        selection,
    };
    let written = write_linear_local_keys(&file).map_err(ApiError::BadRequest)?;

    Ok(Json(ApiResponse::success(json!({
        "ok": true,
        "path": written.display().to_string(),
        "keys": file
            .keys
            .iter()
            .map(|k| key_to_json(k, expose))
            .collect::<Vec<_>>(),
        "selection": selection_to_json(&file.selection),
    }))))
}

fn chrono_like_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
