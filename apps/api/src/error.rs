use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    InternalError(String),
    BadRequest(String),
    NotFound(String),
    ServiceError(core_service::ServiceError),
    InfraError(infra::InfraError),
}

impl From<core_service::ServiceError> for ApiError {
    fn from(e: core_service::ServiceError) -> Self {
        ApiError::ServiceError(e)
    }
}

impl From<infra::InfraError> for ApiError {
    fn from(e: infra::InfraError) -> Self {
        ApiError::InfraError(e)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::ServiceError(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            ApiError::InfraError(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };

        let body = Json(json!({
            "error": message
        }));

        (status, body).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
