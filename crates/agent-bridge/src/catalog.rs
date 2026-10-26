use serde::{Deserialize, Serialize};

use crate::busy::Occupancy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogKind {
    Native,
    Registry,
    Custom,
    Terminal,
    Chat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub kind: CatalogKind,
    pub provider_id: String,
    pub display_name: String,
    pub server_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub occupancy: Occupancy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

/// Terminal install rows must expose `registry_id` (`claude`), never `AgentId` (`claude_code`).
pub fn terminal_provider_id(registry_id: &str) -> &str {
    registry_id
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListResponse {
    pub server_id: String,
    pub entries: Vec<CatalogEntry>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_ids_use_registry_not_install_enum() {
        assert_eq!(terminal_provider_id("claude"), "claude");
        assert_ne!(terminal_provider_id("claude"), "claude_code");
    }

    #[test]
    fn catalog_kinds_are_snake_case() {
        for (kind, wire) in [
            (CatalogKind::Native, "native"),
            (CatalogKind::Registry, "registry"),
            (CatalogKind::Custom, "custom"),
            (CatalogKind::Terminal, "terminal"),
            (CatalogKind::Chat, "chat"),
        ] {
            assert_eq!(serde_json::to_value(kind).unwrap(), wire);
        }
    }
}
