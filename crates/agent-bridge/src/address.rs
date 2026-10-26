use serde::{Deserialize, Serialize};

/// Connected-Computer wildcard used when identity is unset.
pub const LOCAL_SERVER_ID: &str = "local";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentAddress {
    #[serde(default)]
    pub server_id: String,
    pub provider_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

impl AgentAddress {
    pub fn new(server_id: impl Into<String>, provider_id: impl Into<String>) -> Self {
        Self {
            server_id: server_id.into(),
            provider_id: provider_id.into(),
            chat_id: None,
            workspace_id: None,
        }
    }

    pub fn normalize_server(mut self, local_server_id: &str) -> Self {
        if is_local_wildcard(&self.server_id) {
            self.server_id = local_server_id.to_string();
        }
        self
    }
}

pub fn is_local_wildcard(server_id: &str) -> bool {
    server_id.is_empty() || server_id == LOCAL_SERVER_ID
}

/// `"local"` / empty matches the connected Computer's real id.
pub fn server_ids_match(a: &str, b: &str) -> bool {
    if is_local_wildcard(a) || is_local_wildcard(b) {
        return true;
    }
    a == b
}

/// True when `to` names a Computer other than the connected one.
pub fn is_foreign_server(to_server_id: &str, local_server_id: &str) -> bool {
    !server_ids_match(to_server_id, local_server_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_wildcard_matches_real_id() {
        assert!(server_ids_match(LOCAL_SERVER_ID, "srv-abc"));
        assert!(server_ids_match("", "srv-abc"));
        assert!(server_ids_match("srv-abc", LOCAL_SERVER_ID));
        assert!(server_ids_match("srv-abc", "srv-abc"));
        assert!(!server_ids_match("aaa", "bbb"));
        assert!(!is_foreign_server("local", "aaa"));
        assert!(is_foreign_server("bbb", "aaa"));
    }
}
