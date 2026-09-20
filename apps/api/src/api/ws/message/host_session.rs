use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HostSessionListRequest {
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub sort_field: Option<String>,
    #[serde(default)]
    pub sort_order: Option<String>,
    #[serde(default)]
    pub updated_after: Option<String>,
    #[serde(default)]
    pub updated_before: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
    #[serde(default)]
    pub sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionGetRequest {
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionResumeChatRequest {
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionResumeTuiRequest {
    pub key: String,
}
