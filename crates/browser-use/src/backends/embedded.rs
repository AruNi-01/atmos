//! Atmos embedded browser (APP-053 webview) — fail-closed stub until PR #203 merges.

use super::BrowserBackend;
use crate::types::{BrowserAction, BrowserError, BrowserRequest, BrowserResult};

#[derive(Debug, Default)]
pub struct EmbeddedBackend;

impl BrowserBackend for EmbeddedBackend {
    fn execute(&self, req: BrowserRequest) -> BrowserResult {
        let action = match req.action {
            BrowserAction::Prepare => "prepare",
            BrowserAction::State => "state",
            BrowserAction::Click => "click",
            BrowserAction::Type => "type",
            BrowserAction::Navigate => "navigate",
        };
        let err = BrowserError::EmbeddedNotImplemented;
        // Design reservation (PR #203):
        // - in-DOM Electron <webview>, partition persist:atmos-browser
        // - host IPC browser_bridge_*, attach policy on will-attach-webview
        // - future attach via Electron debugger / host-owned CDP endpoint
        //   (not user-Chrome browser_prepare)
        BrowserResult {
            ok: false,
            action: action.into(),
            backend: "embedded".into(),
            result: Some(serde_json::json!({
                "reserved": true,
                "app_spec": "APP-053",
                "pr": 203,
                "partition": "persist:atmos-browser",
                "attach": "electron_debugger_or_host_cdp_endpoint",
                "not": "user_chrome_browser_prepare",
            })),
            error: Some(err.message()),
            error_code: Some(err.code().into()),
        }
    }
}
