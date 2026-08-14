use serde::{Deserialize, Serialize};

/// Structured error: Atmos embedded browser host control plane not reachable.
pub const ERR_EMBEDDED_HOST_UNAVAILABLE: &str = "embedded_browser_host_unavailable";

/// Browser Use has no MCP surface.
pub const ERR_NO_MCP: &str =
    "Browser Use has no MCP surface; use atmos browser-use CLI/skills only";

/// Default engine pin for Browser Use external path (must match desktop-use manifest).
pub const PINNED_ENGINE_VERSION: &str = "0.19.2";

/// Default snapshot contract for external page state (0.19+).
pub const DEFAULT_SNAPSHOT_FORMAT: &str = "semantic_v2";

/// Snapshot contract for the in-app Atmos Browser (not CUA semantic_v2).
pub const EMBEDDED_SNAPSHOT_FORMAT: &str = "embedded_dom_v1";

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
    /// hover | right_click | double_click | scroll | drag
    Pointer,
    /// inspect | accept | dismiss JS dialogs on a bound tab
    Dialog,
    /// Trigger a download through a page ref into an approved directory
    Download,
    /// Embedded-only: dispatch a key (Enter, Tab, Escape, …).
    PressKey,
    /// External: `browser_set_input_files`. Embedded: unsupported.
    Upload,
    /// End the engine session (external) and clear the scoped binding.
    End,
}

pub fn action_name(action: BrowserAction) -> &'static str {
    match action {
        BrowserAction::Prepare => "prepare",
        BrowserAction::State => "state",
        BrowserAction::Click => "click",
        BrowserAction::Type => "type",
        BrowserAction::Navigate => "navigate",
        BrowserAction::Pointer => "pointer",
        BrowserAction::Dialog => "dialog",
        BrowserAction::Download => "download",
        BrowserAction::PressKey => "press_key",
        BrowserAction::Upload => "upload",
        BrowserAction::End => "end",
    }
}

#[derive(Debug, Clone, Default)]
pub struct BrowserRequest {
    pub backend: BrowserBackendKind,
    /// True when the caller passed `--backend` explicitly (do not replace from binding).
    pub backend_explicit: bool,
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
    /// Named isolated profile when strategy is isolated_named.
    pub profile_name: Option<String>,
    /// Legacy / interactive approval token for browser_prepare (CLI browser-approve).
    pub approval_token: Option<String>,
    /// Snapshot contract: semantic_v2 (default external) | dom_refs_v1 | embedded_dom_v1
    pub snapshot_format: Option<String>,
    /// CDP tab screenshot on state snapshot.
    pub include_screenshot: bool,
    /// semantic_v2 continuation token.
    pub continuation: Option<String>,
    /// semantic_v2 query string.
    pub query: Option<String>,
    /// semantic_v2 scope_ref.
    pub scope_ref: Option<String>,
    /// Viewport CSS px (click / pointer without ref).
    pub x: Option<f64>,
    pub y: Option<f64>,
    /// browser_click / browser_pointer: trusted | dom_event
    pub input_route: Option<String>,
    /// browser_type: insert_text | keystrokes
    pub type_mode: Option<String>,
    /// browser_type: replace field contents instead of append.
    pub replace: bool,
    /// browser_pointer action name.
    pub pointer_action: Option<String>,
    pub delta_x: Option<f64>,
    pub delta_y: Option<f64>,
    pub to_x: Option<f64>,
    pub to_y: Option<f64>,
    pub destination_ref: Option<String>,
    /// browser_dialog action: inspect | accept | dismiss
    pub dialog_action: Option<String>,
    pub dialog_id: Option<String>,
    pub prompt_text: Option<String>,
    pub delivery_mode: Option<String>,
    /// User-facing download directory (`--dir`). External wire name is `destination_root`.
    pub download_dir: Option<String>,
    /// Scoped binding id (`--binding-id` or ATMOS_SIDE_CHAT_ID / ATMOS_PANE_ID).
    pub binding_id: Option<String>,
    /// press-key key name (Enter, Tab, Escape, ArrowDown, …).
    pub key: Option<String>,
    /// Local file paths for `browser_set_input_files`.
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AtmosBrowserSurface {
    pub kind: String,
    pub hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ResolvedFrom {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atmos_browser_surface: Option<AtmosBrowserSurface>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_from: Option<ResolvedFrom>,
}

impl BrowserResult {
    pub fn fail(action: &str, backend: &str, code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            action: action.to_string(),
            backend: backend.to_string(),
            error: Some(message.into()),
            error_code: Some(code.to_string()),
            ..Self::default()
        }
    }

    pub fn fail_with_recovery(
        action: &str,
        backend: &str,
        code: &str,
        message: impl Into<String>,
        recovery: Option<String>,
    ) -> Self {
        Self {
            recovery,
            ..Self::fail(action, backend, code, message)
        }
    }
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
        assert_eq!(PINNED_ENGINE_VERSION, "0.19.2");
        assert_eq!(DEFAULT_SNAPSHOT_FORMAT, "semantic_v2");
        assert_eq!(EMBEDDED_SNAPSHOT_FORMAT, "embedded_dom_v1");
    }
}
