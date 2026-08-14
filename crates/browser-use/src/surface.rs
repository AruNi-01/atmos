use crate::types::{AtmosBrowserSurface, BrowserBackendKind, BrowserResult};

pub fn attach_surface(result: &mut BrowserResult, backend: BrowserBackendKind) {
    if result.atmos_browser_surface.is_some() {
        return;
    }
    result.atmos_browser_surface = Some(match backend {
        BrowserBackendKind::Embedded => AtmosBrowserSurface {
            kind: "embedded".into(),
            hint: "This target is the in-app Atmos Browser pane. Prefer state/snapshot before click; do not assume a system Chrome window exists.".into(),
        },
        BrowserBackendKind::External => AtmosBrowserSurface {
            kind: "external".into(),
            hint: "This target is a system browser window owned by Desktop Use. Keep using the same --target-id/--tab-id until state shows it is gone.".into(),
        },
    });
}

pub fn attach_success_recovery(result: &mut BrowserResult) {
    if !result.ok || result.recovery.is_some() || result.action != "state" {
        return;
    }
    let Some(value) = result.result.as_ref() else {
        return;
    };
    if value.get("mode").and_then(|m| m.as_str()) == Some("bind") {
        return;
    }
    let has_snapshot = value.get("elements").is_some()
        || value.get("mode").and_then(|m| m.as_str()) == Some("snapshot");
    if has_snapshot {
        result.recovery = Some(
            "Use only refs from this snapshot. The next snapshot invalidates previous refs."
                .into(),
        );
    }
}
