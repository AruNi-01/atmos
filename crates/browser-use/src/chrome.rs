//! Browser Use agent chrome — reuses Desktop Use session cursor + operation border.
//!
//! Side-effect helpers are best-effort: they never fail the page action.
//! The real click/type path stays browser CDP / host-plane (not `drive click`).

use serde_json::{json, Value};

use crate::types::BrowserAction;
use desktop_use::control::{
    drive, CoordSpace, DriveAction, DriveRequest, HighlightMode,
};
use desktop_use::highlight::bounds_for_window_id;
use desktop_use::host;
use desktop_use::manager::DesktopUseManager;

/// Session id for Browser Use agent cursor palette (distinct from desktop-use default).
pub const DEFAULT_BROWSER_USE_SESSION: &str = "atmos-browser-use";

/// Whether this browser action should show Desktop Use-class chrome.
///
/// Spatial actions only: click always; type only when a ref is present.
/// prepare / state / navigate without a point do not request chrome.
pub fn wants_action_chrome(action: BrowserAction, element_ref: Option<&str>) -> bool {
    match action {
        BrowserAction::Click => true,
        BrowserAction::Type => element_ref.map(|s| !s.trim().is_empty()).unwrap_or(false),
        BrowserAction::Prepare | BrowserAction::State | BrowserAction::Navigate => false,
    }
}

/// Target for agent cursor / operation border (logical screen points).
#[derive(Debug, Clone)]
pub struct BrowserChromeTarget {
    pub session: Option<String>,
    pub status: String,
    /// Agent cursor screen point (logical points). Optional.
    pub cursor: Option<(f64, f64)>,
    /// Window/content bounds for operation border (x, y, w, h). Optional.
    pub window_bounds: Option<(f64, f64, f64, f64)>,
    pub window_id: Option<i64>,
    pub pid: Option<i32>,
}

fn resolve_session(session: &Option<String>) -> String {
    session
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_BROWSER_USE_SESSION)
        .to_string()
}

/// Build a chrome target for a spatial browser action. Pure (no side effects).
pub fn chrome_target_for_request(
    action: BrowserAction,
    session: Option<String>,
    window_id: Option<i64>,
    pid: Option<i32>,
    window_bounds: Option<(f64, f64, f64, f64)>,
    cursor: Option<(f64, f64)>,
) -> Option<BrowserChromeTarget> {
    let status = match action {
        BrowserAction::Click => "Clicking page".to_string(),
        BrowserAction::Type => "Typing in page".to_string(),
        BrowserAction::Navigate | BrowserAction::Prepare | BrowserAction::State => return None,
    };
    let cursor = cursor.or_else(|| {
        window_bounds.map(|(x, y, w, h)| (x + w.max(1.0) / 2.0, y + h.max(1.0) / 2.0))
    });
    Some(BrowserChromeTarget {
        session,
        status,
        cursor,
        window_bounds,
        window_id,
        pid,
    })
}

/// Show Desktop Use operation border + session agent cursor at the target.
/// Best-effort: never panics; returns a JSON report for tests/logs.
pub fn show_browser_action_chrome(target: &BrowserChromeTarget) -> Value {
    let session = resolve_session(&target.session);
    let mut report = json!({
        "session": session,
        "status": target.status,
        "chrome": true,
    });
    let mgr = DesktopUseManager::new();

    // 1) Operation border (Swift overlay — no system-pointer steal).
    let hl = if let Some((x, y, w, h)) = target.window_bounds {
        if w > 0.0 && h > 0.0 {
            drive(
                &mgr,
                DriveRequest {
                    action: DriveAction::Highlight,
                    highlight: HighlightMode::Auto,
                    x: Some(x.round() as i32),
                    y: Some(y.round() as i32),
                    width: Some(w.round() as i32),
                    height: Some(h.round() as i32),
                    window_id: target.window_id,
                    status_label: Some(target.status.clone()),
                    session: Some(session.clone()),
                    coord_space: CoordSpace::Points,
                    ..Default::default()
                },
            )
        } else {
            drive(
                &mgr,
                DriveRequest {
                    action: DriveAction::Highlight,
                    highlight: HighlightMode::Desktop,
                    status_label: Some(target.status.clone()),
                    session: Some(session.clone()),
                    ..Default::default()
                },
            )
        }
    } else {
        drive(
            &mgr,
            DriveRequest {
                action: DriveAction::Highlight,
                highlight: HighlightMode::Desktop,
                window_id: target.window_id,
                pid: target.pid,
                status_label: Some(target.status.clone()),
                session: Some(session.clone()),
                ..Default::default()
            },
        )
    };
    report["highlight"] = serde_json::to_value(&hl).unwrap_or(json!(null));

    // 2) Agent session cursor via engine move_cursor (overlay, not OS arrow).
    if let Some((cx, cy)) = target.cursor {
        let mv = drive(
            &mgr,
            DriveRequest {
                action: DriveAction::MoveCursor,
                x: Some(cx.round() as i32),
                y: Some(cy.round() as i32),
                coord_space: CoordSpace::Points,
                session: Some(session),
                highlight: HighlightMode::Off,
                ..Default::default()
            },
        );
        report["cursor"] = serde_json::to_value(&mv).unwrap_or(json!(null));
    }

    report
}

/// Resolve window bounds from the live control engine when available.
pub fn resolve_window_bounds(window_id: i64) -> Option<(f64, f64, f64, f64)> {
    let mgr = DesktopUseManager::new();
    let engine = mgr.require_engine().ok()?;
    let socket = mgr.socket_path();
    let host_app = mgr.host_app_path();
    host::ensure_daemon(&engine, &socket, host_app.as_deref()).ok()?;
    let list = host::call_tool(&engine, &socket, "list_windows", &json!({})).ok()?;
    bounds_for_window_id(&list, window_id)
}

/// Status label for browser chrome.
pub fn status_for_browser_action(action: BrowserAction) -> &'static str {
    match action {
        BrowserAction::Click => "Clicking page",
        BrowserAction::Type => "Typing in page",
        BrowserAction::Navigate => "Navigating",
        BrowserAction::Prepare => "Preparing browser",
        BrowserAction::State => "Reading page state",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BrowserAction;

    #[test]
    fn chrome_only_for_spatial_actions() {
        assert!(wants_action_chrome(BrowserAction::Click, None));
        assert!(wants_action_chrome(BrowserAction::Click, Some("e0")));
        assert!(!wants_action_chrome(BrowserAction::Type, None));
        assert!(!wants_action_chrome(BrowserAction::Type, Some("")));
        assert!(wants_action_chrome(BrowserAction::Type, Some("e3")));
        assert!(!wants_action_chrome(BrowserAction::Prepare, Some("e0")));
        assert!(!wants_action_chrome(BrowserAction::State, Some("e0")));
        assert!(!wants_action_chrome(BrowserAction::Navigate, None));
    }

    #[test]
    fn chrome_target_builder_skips_prepare_state() {
        assert!(chrome_target_for_request(
            BrowserAction::Prepare,
            None,
            None,
            None,
            None,
            None
        )
        .is_none());
        assert!(chrome_target_for_request(
            BrowserAction::State,
            None,
            None,
            None,
            None,
            None
        )
        .is_none());
        let t = chrome_target_for_request(
            BrowserAction::Click,
            Some("s1".into()),
            Some(9),
            None,
            Some((10.0, 20.0, 100.0, 50.0)),
            None,
        )
        .expect("click target");
        assert_eq!(t.session.as_deref(), Some("s1"));
        assert_eq!(t.window_id, Some(9));
        // Center fallback when cursor not given
        assert_eq!(t.cursor, Some((60.0, 45.0)));
    }

    #[test]
    fn show_chrome_returns_report_without_panicking() {
        // Best-effort: even without engine/helper this must not panic.
        let report = show_browser_action_chrome(&BrowserChromeTarget {
            session: Some("test-session".into()),
            status: "Clicking page".into(),
            cursor: Some((100.0, 200.0)),
            window_bounds: Some((50.0, 50.0, 200.0, 100.0)),
            window_id: None,
            pid: None,
        });
        assert_eq!(report["chrome"], true);
        assert_eq!(report["session"], "test-session");
        assert_eq!(report["status"], "Clicking page");
        assert!(report.get("highlight").is_some());
    }
}
