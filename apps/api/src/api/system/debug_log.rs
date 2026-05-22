use axum::{http::StatusCode, response::IntoResponse, Json};
use infra::utils::debug_logging::DebugLogger;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
pub struct FrontendLogEntry {
    pub ts: String,
    pub cat: String,
    pub msg: String,
    pub data: Option<Value>,
}

#[derive(Deserialize)]
pub struct FrontendLogPayload {
    /// Logger prefix, e.g. "terminal" -> writes to frontend-terminal-YYYY-MM-DD.log
    pub prefix: String,
    pub entries: Vec<FrontendLogEntry>,
}

/// POST /api/system/debug-log
pub async fn ingest_frontend_debug_log(
    Json(payload): Json<FrontendLogPayload>,
) -> impl IntoResponse {
    let safe_prefix: String = payload
        .prefix
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe_prefix.is_empty() {
        return StatusCode::BAD_REQUEST;
    }

    let logger = DebugLogger::new(&format!("frontend-{}", safe_prefix));
    for entry in &payload.entries {
        let msg = format!("[fe:{}] {}", entry.ts, entry.msg);
        logger.log(&entry.cat, &msg, entry.data.clone());
    }
    StatusCode::NO_CONTENT
}
