use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::ApiResponse;
use crate::app_state::AppState;
use crate::error::ApiResult;

pub type UsageOverviewDto = ai_usage::UsageOverview;
#[allow(dead_code)]
pub type UsageProviderDto = ai_usage::ProviderStatus;
#[allow(dead_code)]
pub type UsageAggregateDto = ai_usage::UsageAggregate;
#[allow(dead_code)]
pub type UsageDetailSectionDto = ai_usage::DetailSection;
#[allow(dead_code)]
pub type UsageFetchIssueDto = ai_usage::UsageFetchIssue;

#[derive(Debug, Default, Deserialize)]
pub struct UsageOverviewQuery {
    pub refresh: Option<bool>,
    pub provider_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UsageProviderSwitchReq {
    pub enabled: bool,
}

pub async fn get_usage_overview(
    State(state): State<AppState>,
    Query(query): Query<UsageOverviewQuery>,
) -> ApiResult<Json<ApiResponse<UsageOverviewDto>>> {
    let overview = state
        .usage_service
        .get_overview(query.refresh.unwrap_or(false), query.provider_id.as_deref())
        .await;

    Ok(Json(ApiResponse::success(overview)))
}

pub async fn set_provider_switch(
    State(state): State<AppState>,
    Path(provider_id): Path<String>,
    Json(payload): Json<UsageProviderSwitchReq>,
) -> ApiResult<Json<ApiResponse<UsageOverviewDto>>> {
    let overview = state
        .usage_service
        .set_provider_switch(&provider_id, payload.enabled)
        .await;

    Ok(Json(ApiResponse::success(overview)))
}
