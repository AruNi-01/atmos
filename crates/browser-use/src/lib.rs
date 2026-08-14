//! Atmos **Browser Use** — page-level control, orthogonal to Desktop Use.
//!
//! Backends:
//! - [`ExternalBackend`]: system Chrome/Chromium via managed Desktop Use host/engine
//! - [`EmbeddedBackend`]: Atmos in-app browser via host control plane
//!
//! **No MCP.**

mod backends;
pub mod binding;
mod chrome;
mod envelope;
mod errors;
mod surface;
mod types;

pub use backends::{EmbeddedBackend, ExternalBackend};
pub use binding::{
    apply_binding_defaults, apply_result_to_binding, clear_binding, commit_binding_from_result,
    engine_session_id, extract_ids, fill_result_ids, load_binding, resolve_binding_id,
    resolve_binding_scope, resolve_native_route, save_binding, AppliedBinding, BINDING_SCOPE_ENV,
    BrowserBinding, NativeRouteHint,
};
pub use chrome::{
    chrome_target_for_request, show_browser_action_chrome, status_for_browser_action,
    wants_action_chrome, BrowserChromeTarget, DEFAULT_BROWSER_USE_SESSION,
};
pub use envelope::{capability_flags, fill_result_envelope};
pub use types::{
    action_name, BrowserAction, BrowserBackendKind, BrowserError, BrowserRequest, BrowserResult,
    DEFAULT_SNAPSHOT_FORMAT, EMBEDDED_SNAPSHOT_FORMAT, ERR_EMBEDDED_HOST_UNAVAILABLE, ERR_NO_MCP,
    PINNED_ENGINE_VERSION,
};

use backends::BrowserBackend;

/// Dispatch a browser-use request to the selected backend.
pub fn execute(mut req: BrowserRequest) -> BrowserResult {
    let binding_id = req.binding_id.clone();
    let applied = binding::apply_binding_defaults(
        req.backend,
        req.backend_explicit,
        req.target_id.clone(),
        req.tab_id.clone(),
        req.session.clone(),
        binding_id.as_deref(),
    );
    req.backend = applied.backend;
    req.target_id = applied.target_id;
    req.tab_id = applied.tab_id;
    req.session = applied.session_id;
    let resolved_from = applied.resolved_from;

    let mut result = match req.backend {
        BrowserBackendKind::External => ExternalBackend.execute(req.clone()),
        BrowserBackendKind::Embedded => EmbeddedBackend.execute(req.clone()),
    };
    result.resolved_from = resolved_from.or(result.resolved_from);
    binding::fill_result_ids(&mut result);
    binding::apply_result_to_binding(
        binding_id.as_deref(),
        req.backend,
        req.action,
        req.tab_action.as_deref(),
        &result,
    );
    surface::attach_surface(&mut result, req.backend);
    envelope::fill_result_envelope(&mut result, req.backend);
    surface::attach_success_recovery(&mut result);
    result
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
        let _guard = binding::TEST_HOME_LOCK.lock().expect("test home lock");
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

    #[test]
    fn external_download_uses_destination_root() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Download,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            element_ref: Some("e1".into()),
            download_dir: Some("/tmp/out".into()),
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_download");
        assert_eq!(args["destination_root"], "/tmp/out");
        assert!(args.get("dir").is_none());
    }

    #[test]
    fn unknown_strategy_is_invalid_args() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(1),
            profile_strategy: Some("steal_cookies".into()),
            ..Default::default()
        };
        let err = build_external_tool_call(&req).unwrap_err();
        assert!(err.contains("unknown --strategy"));
    }

    #[test]
    fn existing_profile_fails_closed_without_grant() {
        let res = execute(BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Prepare,
            pid: Some(1),
            window_id: Some(2),
            profile_strategy: Some("existing_profile".into()),
            ..Default::default()
        });
        assert!(!res.ok);
        assert_eq!(
            res.error_code.as_deref(),
            Some(crate::errors::BROWSER_PROFILE_GRANT_REQUIRED)
        );
        assert!(res.recovery.as_deref().unwrap().contains("isolated_new"));
    }

    #[test]
    fn external_upload_maps_to_set_input_files() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Upload,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            element_ref: Some("e2".into()),
            files: vec!["/tmp/a.png".into()],
            ..Default::default()
        };
        let (tool, args) = build_external_tool_call(&req).unwrap();
        assert_eq!(tool, "browser_set_input_files");
        assert_eq!(args["paths"][0], "/tmp/a.png");
        assert_eq!(args["ref"], "e2");
    }

    #[test]
    fn press_key_is_not_an_external_tool() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::PressKey,
            target_id: Some("tgt".into()),
            tab_id: Some("tab".into()),
            key: Some("Enter".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&req).is_err());
    }

    #[test]
    fn tabs_is_embedded_only() {
        let req = BrowserRequest {
            backend: BrowserBackendKind::External,
            action: BrowserAction::Tabs,
            tab_action: Some("open".into()),
            url: Some("https://example.com".into()),
            ..Default::default()
        };
        assert!(build_external_tool_call(&req)
            .unwrap_err()
            .contains("embedded"));
        assert_eq!(action_name(BrowserAction::Tabs), "tabs");
    }
}
