//! Atmos **Browser Use** — page-level control, orthogonal to Desktop Use.
//!
//! Backends:
//! - [`ExternalBackend`]: system Chrome/Chromium via managed Desktop Use host/engine
//! - [`EmbeddedBackend`]: Atmos in-app browser via host control plane
//!
//! **No MCP.**

mod backends;
mod chrome;
mod types;

pub use backends::{EmbeddedBackend, ExternalBackend};
pub use chrome::{
    chrome_target_for_request, show_browser_action_chrome, status_for_browser_action,
    wants_action_chrome, BrowserChromeTarget, DEFAULT_BROWSER_USE_SESSION,
};
pub use types::{
    BrowserAction, BrowserBackendKind, BrowserError, BrowserRequest, BrowserResult,
    ERR_EMBEDDED_HOST_UNAVAILABLE, ERR_NO_MCP,
};

use backends::BrowserBackend;

/// Dispatch a browser-use request to the selected backend.
pub fn execute(req: BrowserRequest) -> BrowserResult {
    match req.backend {
        BrowserBackendKind::External => ExternalBackend.execute(req),
        BrowserBackendKind::Embedded => EmbeddedBackend.execute(req),
    }
}

/// Map a browser request to control-engine tool + args (external path).
pub fn build_external_tool_call(
    req: &BrowserRequest,
) -> Result<(&'static str, serde_json::Value), String> {
    backends::external::build_tool_call(req)
}

/// Build the embedded host request body.
pub fn build_embedded_body(req: &BrowserRequest) -> Result<serde_json::Value, String> {
    backends::embedded::build_embedded_body(req)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn embedded_without_host_fails_closed() {
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
    fn external_navigate_requires_target_id_tab_url() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Navigate,
            tab_id: Some("t1".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&missing).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Navigate,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_navigate");
        assert_eq!(args["url"], "https://example.com");
        assert_eq!(args["tab_id"], "t1");
        assert_eq!(args["target_id"], "tgt");
    }

    #[test]
    fn external_click_requires_target_tab_ref() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Click,
            tab_id: Some("t1".into()),
            element_ref: Some("p1:2".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&missing).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Click,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            element_ref: Some("p1:2".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_click");
        assert_eq!(args["ref"], "p1:2");
        assert_eq!(args["target_id"], "tgt");
        assert_eq!(args["tab_id"], "t1");
    }

    #[test]
    fn external_type_requires_ref_and_target() {
        let missing_ref = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Type,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            text: Some("hi".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&missing_ref).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Type,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            element_ref: Some("p1:0".into()),
            text: Some("hi".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_type");
        assert_eq!(args["ref"], "p1:0");
        assert_eq!(args["text"], "hi");
        assert_eq!(args["target_id"], "tgt");
    }

    #[test]
    fn external_prepare_needs_pid_no_default_existing_profile() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            ..Default::default()
        };
        assert!(build_external_tool_call(&req).is_err());

        // pid only: detect-only, must NOT inject existing_profile without window_id
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(123),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_prepare");
        assert_eq!(args["pid"], 123);
        assert!(args.get("strategy").is_none());
        assert!(args.get("window_id").is_none());

        // existing_profile without window_id is invalid
        let bad = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(123),
            profile_strategy: Some("existing_profile".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&bad).is_err());

        // existing_profile + window_id
        let ok = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(123),
            window_id: Some(99),
            profile_strategy: Some("existing_profile".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&ok).unwrap();
        assert_eq!(tool, "browser_prepare");
        assert_eq!(args["window_id"], 99);
        assert_eq!(args["strategy"]["kind"], "existing_profile");
    }

    #[test]
    fn external_state_bind_or_snapshot_required() {
        let bare = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::State,
            ..Default::default()
        };
        assert!(build_external_tool_call(&bare).is_err());

        let bind = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::State,
            pid: Some(1),
            window_id: Some(2),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&bind).unwrap();
        assert_eq!(tool, "get_browser_state");
        assert_eq!(args["pid"], 1);
        assert_eq!(args["window_id"], 2);

        let snap = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::State,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&snap).unwrap();
        assert_eq!(tool, "get_browser_state");
        assert_eq!(args["target_id"], "tgt");
        assert_eq!(args["tab_id"], "tab");
    }

    #[test]
    fn no_mcp_in_error_strings() {
        let _ = json!({ "note": ERR_NO_MCP });
        assert!(ERR_NO_MCP.contains("MCP"));
    }

    #[test]
    fn result_backend_is_external_or_embedded() {
        let res = execute(BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            ..Default::default()
        });
        assert_eq!(res.backend, "external");
    }
}
