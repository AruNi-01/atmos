//! `GET /api/cli/health` — lightweight reachability for `atmos status`.

use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{app_state::AppState, error::ApiResult};

pub async fn health(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let _ = state.api_port();
    Ok(Json(json!({
        "success": true,
        "data": {
            "server": "up",
            "service": "atmos-api",
            "cli_rpc": true,
        }
    })))
}
