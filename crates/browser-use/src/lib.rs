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
    DEFAULT_SNAPSHOT_FORMAT, ERR_EMBEDDED_HOST_UNAVAILABLE, ERR_NO_MCP, PINNED_ENGINE_VERSION,
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
    fn external_click_requires_ref_or_xy() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Click,
            tab_id: Some("t1".into()),
            element_ref: Some("p1:2".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&missing).is_err());

        let no_target = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Click,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&no_target).is_err());

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

        let xy = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Click,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            x: Some(12.0),
            y: Some(34.0),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&xy).unwrap();
        assert_eq!(tool, "browser_click");
        assert_eq!(args["x"], 12.0);
        assert_eq!(args["y"], 34.0);
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
    fn external_prepare_defaults_to_isolated_new() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            ..Default::default()
        };
        assert!(build_external_tool_call(&req).is_err());

        // Optimal default: isolated_new + allow_launch (never mutates user profile).
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(123),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_prepare");
        assert_eq!(args["pid"], 123);
        assert_eq!(args["profile"]["mode"], "isolated_new");
        assert_eq!(args["allow_launch"], true);
        assert!(args.get("strategy").is_none());

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
        // bind mode must not force snapshot_format
        assert!(args.get("snapshot_format").is_none());

        let snap = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::State,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            include_screenshot: true,
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&snap).unwrap();
        assert_eq!(tool, "get_browser_state");
        assert_eq!(args["target_id"], "tgt");
        assert_eq!(args["tab_id"], "tab");
        assert_eq!(args["snapshot_format"], "semantic_v2");
        assert_eq!(args["include_screenshot"], true);
    }

    #[test]
    fn external_pointer_and_dialog_tools() {
        let ptr = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Pointer,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            pointer_action: Some("hover".into()),
            element_ref: Some("p1:0".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&ptr).unwrap();
        assert_eq!(tool, "browser_pointer");
        assert_eq!(args["action"], "hover");
        assert_eq!(args["ref"], "p1:0");

        let dlg = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Dialog,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            dialog_action: Some("inspect".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&dlg).unwrap();
        assert_eq!(tool, "browser_dialog");
        assert_eq!(args["action"], "inspect");
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
