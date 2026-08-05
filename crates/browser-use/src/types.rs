use serde::{Deserialize, Serialize};

/// Structured error: Atmos embedded browser host control plane not reachable.
pub const ERR_EMBEDDED_HOST_UNAVAILABLE: &str = "embedded_browser_host_unavailable";

/// Browser Use has no MCP surface.
pub const ERR_NO_MCP: &str =
    "Browser Use has no MCP surface; use atmos browser-use CLI/skills only";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserBackendKind {
    /// System Chrome/Chromium via managed Desktop Use control engine.
    #[default]
    External,
    /// Atmos in-app browser (Desktop webview + host control plane).
    Embedded,
}

impl BrowserBackendKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "external" => Some(Self::External),
            "embedded" => Some(Self::Embedded),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::External => "external",
            Self::Embedded => "embedded",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserAction {
    #[default]
    Prepare,
    State,
    Click,
    Type,
    Navigate,
}

#[derive(Debug, Clone, Default)]
pub struct BrowserRequest {
    pub backend: BrowserBackendKind,
    pub action: BrowserAction,
    pub pid: Option<i32>,
    /// Native window id — required for existing_profile prepare and bind-mode state.
    pub window_id: Option<i64>,
    /// Opaque browser target id (external bind target or embedded session id).
    pub target_id: Option<String>,
    pub tab_id: Option<String>,
    pub element_ref: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub session: Option<String>,
    /// existing_profile (requires window_id) | isolated_new | isolated_named | omit
    pub profile_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BrowserResult {
    pub ok: bool,
    pub action: String,
    pub backend: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrowserError {
    InvalidArgs(String),
    Engine(String),
    EmbeddedHostUnavailable(String),
}

impl BrowserError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidArgs(_) => "invalid_args",
            Self::Engine(_) => "browser_engine_failed",
            Self::EmbeddedHostUnavailable(_) => ERR_EMBEDDED_HOST_UNAVAILABLE,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::InvalidArgs(m) | Self::Engine(m) | Self::EmbeddedHostUnavailable(m) => m.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_as_str() {
        assert_eq!(
            BrowserBackendKind::parse("external"),
            Some(BrowserBackendKind::External)
        );
        assert_eq!(
            BrowserBackendKind::parse("embedded"),
            Some(BrowserBackendKind::Embedded)
        );
        assert_eq!(BrowserBackendKind::parse("nope"), None);
        assert_eq!(BrowserBackendKind::External.as_str(), "external");
        assert_eq!(BrowserBackendKind::Embedded.as_str(), "embedded");
        assert_eq!(BrowserBackendKind::default().as_str(), "external");
    }
}
