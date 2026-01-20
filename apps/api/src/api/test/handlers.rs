use axum::{extract::State, Json};

use crate::{app_state::AppState, error::ApiResult};

use super::dto::HelloResponse;

pub async fn hello(State(state): State<AppState>) -> ApiResult<Json<HelloResponse>> {
    let message = "Hello ATMOS!".to_string();
    let processed = state.test_service.process_hello(&message).await?;

    Ok(Json(HelloResponse { message, processed }))
}
