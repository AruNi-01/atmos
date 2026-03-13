use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    #[allow(dead_code)]
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// Generic response for mutation endpoints that only return a status message.
#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: &'static str,
}

/// Response wrapper for git validation.
#[derive(Debug, Serialize)]
pub struct GitValidationResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Response for terminal layout queries.
#[derive(Debug, Serialize)]
pub struct TerminalLayoutResponse {
    pub layout: Option<String>,
    pub maximized_terminal_id: Option<String>,
}
