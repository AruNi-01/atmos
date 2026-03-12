use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::ApiResponse;
use crate::app_state::AppState;
use crate::error::{ApiError, ApiResult};

pub type TokenUsageOverviewDto = token_usage::TokenUsageOverview;

#[derive(Debug, Default, Deserialize)]
pub struct TokenUsageOverviewQuery {
    pub refresh: Option<bool>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub year: Option<String>,
    pub group_by: Option<token_usage::TokenUsageGroupBy>,
    pub clients: Option<String>,
}

pub async fn get_token_usage_overview(
    State(state): State<AppState>,
    Query(query): Query<TokenUsageOverviewQuery>,
) -> ApiResult<Json<ApiResponse<TokenUsageOverviewDto>>> {
    let overview = state
        .token_usage_service
        .get_overview(
            token_usage::TokenUsageQuery {
                clients: parse_clients(query.clients.as_deref()),
                since: query.since,
                until: query.until,
                year: query.year,
                group_by: query.group_by.unwrap_or_default(),
            },
            query.refresh.unwrap_or(false),
        )
        .await
        .map_err(|error| ApiError::InternalError(error.to_string()))?;

    Ok(Json(ApiResponse::success(overview)))
}

fn parse_clients(raw: Option<&str>) -> Option<Vec<String>> {
    raw.map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>()
    })
    .filter(|clients| !clients.is_empty())
}
