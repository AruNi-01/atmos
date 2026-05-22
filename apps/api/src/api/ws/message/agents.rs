use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstallRequest {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigGetRequest {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigSetRequest {
    pub id: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryInstallRequest {
    pub registry_id: String,
    #[serde(default)]
    pub force_overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryRemoveRequest {
    pub registry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentRegistryListRequest {
    #[serde(default)]
    pub force_refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentAddRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentRemoveRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentSetJsonRequest {
    pub json: String,
}
