use serde::{Deserialize, Serialize};

/// Structured error: Atmos embedded browser backend not ready (APP-053).
pub const ERR_EMBEDDED_NOT_IMPLEMENTED: &str = "embedded_browser_not_implemented";

/// Product rule: Browser Use never exposes MCP.
pub const ERR_NO_MCP: &str =
    "Browser Use has no MCP surface; use atmos browser-use CLI/skills only";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserBackendKind {
    /// System Chromium via managed control engine (CUA tools). Default.
    #[default]
    Cua,
    /// Alias for Cua.
    External,
    /// Atmos in-app browser (APP-053 webview) — stub until PR #203 merges.
    Embedded,
    /// Alias for Embedded.
    Atmos,
}

impl BrowserBackendKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "cua" | "external" | "chrome" | "chromium" => Some(Self::Cua),
            "embedded" | "atmos" | "webview" | "app" => Some(Self::Embedded),
            _ => None,
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
    /// Native CGWindowID — required for existing_profile prepare and bind-mode state.
    pub window_id: Option<i64>,
    /// Opaque browser target id from get_browser_state (required for click/type/navigate).
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
    EmbeddedNotImplemented,
}

impl BrowserError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidArgs(_) => "invalid_args",
            Self::Engine(_) => "browser_engine_failed",
            Self::EmbeddedNotImplemented => ERR_EMBEDDED_NOT_IMPLEMENTED,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::InvalidArgs(m) => m.clone(),
            Self::Engine(m) => m.clone(),
            Self::EmbeddedNotImplemented => {
                "Atmos embedded browser backend is reserved until APP-053 webview (PR #203) is merged and verified. Use --backend cua for system Chromium.".into()
            }
        }
    }
}
