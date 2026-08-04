//! Atmos **Browser Use** — page-level control, orthogonal to Desktop Use.
//!
//! Backends:
//! - [`CuaExternalBackend`]: system Chromium via managed control engine tools
//! - [`EmbeddedBackend`]: Atmos in-app browser (APP-053 webview) via host control plane
//!
//! **No MCP.**

mod backends;
mod engine_client;
mod types;

pub use backends::{CuaExternalBackend, EmbeddedBackend};
pub use types::{
    BrowserAction, BrowserBackendKind, BrowserError, BrowserRequest, BrowserResult,
    ERR_EMBEDDED_HOST_UNAVAILABLE, ERR_EMBEDDED_NOT_IMPLEMENTED, ERR_NO_MCP,
};

use backends::BrowserBackend;

/// Dispatch a browser-use request to the selected backend.
pub fn execute(req: BrowserRequest) -> BrowserResult {
    match req.backend {
        BrowserBackendKind::Cua | BrowserBackendKind::External => CuaExternalBackend.execute(req),
        BrowserBackendKind::Embedded | BrowserBackendKind::Atmos => EmbeddedBackend.execute(req),
    }
}

/// Pure mapping of browser request → engine tool + args (CUA path). Unit-tested.
pub fn build_cua_tool_call(
    req: &BrowserRequest,
) -> Result<(&'static str, serde_json::Value), String> {
    backends::build_tool_call(req)
}

/// Pure body builder for embedded host (unit-tested).
pub fn build_embedded_body(req: &BrowserRequest) -> Result<serde_json::Value, String> {
    backends::embedded::build_embedded_body(req)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_without_host_fails_closed() {
        // Ensure no control meta from a previous run in test env
        let dir = tempfile::tempdir().unwrap();
        // SAFETY: test isolation via env override
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let res = execute(BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Prepare,
            ..Default::default()
        });
        assert!(!res.ok);
        assert_eq!(
            res.error_code.as_deref(),
            Some(ERR_EMBEDDED_HOST_UNAVAILABLE)
        );
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }

    #[test]
    fn cua_navigate_requires_ids() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Navigate,
            tab_id: Some("t1".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        assert!(build_cua_tool_call(&missing).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Navigate,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_navigate");
        assert_eq!(args["url"], "https://example.com");
    }
}
