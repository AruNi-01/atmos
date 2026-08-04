//! Atmos **Browser Use** — page-level CDP control, orthogonal to Desktop Use.
//!
//! Backends:
//! - [`CuaExternalBackend`]: system Chromium via managed desktop-use engine tools
//! - [`EmbeddedBackend`]: reserved stub until APP-053 webview (PR #203) ships
//!
//! **No MCP.**

mod backends;
mod types;

pub use backends::{CuaExternalBackend, EmbeddedBackend};
pub use types::{
    BrowserAction, BrowserBackendKind, BrowserError, BrowserRequest, BrowserResult,
    ERR_EMBEDDED_NOT_IMPLEMENTED, ERR_NO_MCP,
};

use backends::BrowserBackend;

/// Dispatch a browser-use request to the selected backend.
pub fn execute(req: BrowserRequest) -> BrowserResult {
    match req.backend {
        BrowserBackendKind::Cua | BrowserBackendKind::External => {
            CuaExternalBackend::default().execute(req)
        }
        BrowserBackendKind::Embedded | BrowserBackendKind::Atmos => {
            EmbeddedBackend::default().execute(req)
        }
    }
}

/// Pure mapping of browser request → engine tool + args (CUA path). Unit-tested.
pub fn build_cua_tool_call(
    req: &BrowserRequest,
) -> Result<(&'static str, serde_json::Value), String> {
    backends::cua::build_tool_call(req)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn embedded_prepare_fails_closed() {
        let res = execute(BrowserRequest {
            backend: BrowserBackendKind::Embedded,
            action: BrowserAction::Prepare,
            ..Default::default()
        });
        assert!(!res.ok);
        assert_eq!(
            res.error_code.as_deref(),
            Some(ERR_EMBEDDED_NOT_IMPLEMENTED)
        );
        assert!(!res.ok);
    }

    #[test]
    fn cua_navigate_requires_target_id_tab_url() {
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
        assert_eq!(args["tab_id"], "t1");
        assert_eq!(args["target_id"], "tgt");
    }

    #[test]
    fn cua_click_requires_target_tab_ref() {
        let missing = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Click,
            tab_id: Some("t1".into()),
            element_ref: Some("p1:2".into()),
            ..Default::default()
        };
        assert!(build_cua_tool_call(&missing).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Click,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            element_ref: Some("p1:2".into()),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_click");
        assert_eq!(args["ref"], "p1:2");
        assert_eq!(args["target_id"], "tgt");
        assert_eq!(args["tab_id"], "t1");
    }

    #[test]
    fn cua_type_requires_ref_and_target() {
        let missing_ref = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Type,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            text: Some("hi".into()),
            ..Default::default()
        };
        assert!(build_cua_tool_call(&missing_ref).is_err());

        let req = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Type,
            target_id: Some("tgt".into()),
            tab_id: Some("t1".into()),
            element_ref: Some("p1:0".into()),
            text: Some("hi".into()),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_type");
        assert_eq!(args["ref"], "p1:0");
        assert_eq!(args["text"], "hi");
        assert_eq!(args["target_id"], "tgt");
    }

    #[test]
    fn cua_prepare_needs_pid_no_default_existing_profile() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Prepare,
            ..Default::default()
        };
        assert!(build_cua_tool_call(&req).is_err());

        // pid only: detect-only, must NOT inject existing_profile without window_id
        let req = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Prepare,
            pid: Some(123),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_prepare");
        assert_eq!(args["pid"], 123);
        assert!(args.get("strategy").is_none());
        assert!(args.get("window_id").is_none());

        // existing_profile without window_id is invalid
        let bad = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Prepare,
            pid: Some(123),
            profile_strategy: Some("existing_profile".into()),
            ..Default::default()
        };
        assert!(build_cua_tool_call(&bad).is_err());

        // existing_profile + window_id
        let ok = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::Prepare,
            pid: Some(123),
            window_id: Some(99),
            profile_strategy: Some("existing_profile".into()),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&ok).unwrap();
        assert_eq!(tool, "browser_prepare");
        assert_eq!(args["window_id"], 99);
        assert_eq!(args["strategy"]["kind"], "existing_profile");
    }

    #[test]
    fn cua_state_bind_or_snapshot_required() {
        let bare = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::State,
            ..Default::default()
        };
        assert!(build_cua_tool_call(&bare).is_err());

        let bind = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::State,
            pid: Some(1),
            window_id: Some(2),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&bind).unwrap();
        assert_eq!(tool, "get_browser_state");
        assert_eq!(args["pid"], 1);
        assert_eq!(args["window_id"], 2);

        let snap = BrowserRequest {
            backend: BrowserBackendKind::Cua,
            action: BrowserAction::State,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            ..Default::default()
        };
        let (tool, args) = build_cua_tool_call(&snap).unwrap();
        assert_eq!(tool, "get_browser_state");
        assert_eq!(args["target_id"], "tgt");
        assert_eq!(args["tab_id"], "tab");
    }

    #[test]
    fn no_mcp_in_error_strings() {
        let _ = json!({ "note": ERR_NO_MCP });
        assert!(ERR_NO_MCP.contains("MCP"));
    }
}
