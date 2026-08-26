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

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AtmosCanvasScriptPayload {
    #[serde(default = "default_script_entry")]
    pub entry: String,
    #[serde(default)]
    pub files: std::collections::BTreeMap<String, String>,
}

fn default_script_entry() -> String {
    "main.js".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AtmosCanvasFilePayload {
    pub schema: String,
    pub title: String,
    #[serde(rename = "tldrawDocument")]
    pub tldraw_document: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<AtmosCanvasScriptPayload>,
}

#[derive(Debug, Serialize)]
pub struct CanvasDocumentListItemDto {
    pub file_name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct CanvasDocumentListResponse {
    /// Absolute canvas directory path (e.g. ~/.atmos/canvas).
    pub dir: String,
    pub items: Vec<CanvasDocumentListItemDto>,
}

#[derive(Debug, Serialize)]
pub struct CanvasDocumentFileResponse {
    pub file_name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    pub body: AtmosCanvasFilePayload,
}

#[derive(Debug, Serialize)]
pub struct CanvasDocumentWriteResponse {
    pub item: CanvasDocumentListItemDto,
}
