//! Classify window AX surfaces and attach agent guidance for Electron / empty trees.
//!
//! Pure JSON transforms — unit-tested without a daemon. Mirrors engine 0.17
//! `get_window_state` shapes (`elements`, `element_count`, `degraded_reason`).

use serde_json::{json, Value};

/// How usable the accessibility tree is for the requested window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SurfaceKind {
    /// Actionable AX elements present — prefer element_token.
    AxOk,
    /// Empty tree or unresolved AX surface — pixel path only.
    AxEmpty,
    /// Very few elements (shell-only) — try token then fall back to pixel.
    AxSparse,
    /// Huge tree (Electron / Obsidian-style) — cap walk + prefer token carefully.
    AxHeavy,
}

impl SurfaceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AxOk => "ax_ok",
            Self::AxEmpty => "ax_empty",
            Self::AxSparse => "ax_sparse",
            Self::AxHeavy => "ax_heavy",
        }
    }
}

const HEAVY_THRESHOLD: usize = 800;
const SPARSE_THRESHOLD: usize = 3;

/// Count actionable elements from a `get_window_state` payload.
pub fn element_count(payload: &Value) -> usize {
    if let Some(n) = payload
        .get("element_count")
        .and_then(|v| v.as_u64())
        .or_else(|| {
            payload
                .get("returned_element_count")
                .and_then(|v| v.as_u64())
        })
        .or_else(|| payload.get("total_element_count").and_then(|v| v.as_u64()))
    {
        return n as usize;
    }
    payload
        .get("elements")
        .and_then(|e| e.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

pub fn degraded_reason(payload: &Value) -> Option<&str> {
    payload
        .get("degraded_reason")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// True when the engine (or app name) suggests a Chromium/Electron-style surface.
pub fn electron_likely(payload: &Value, app_name: Option<&str>) -> bool {
    if let Some(reason) = degraded_reason(payload) {
        let r = reason.to_ascii_lowercase();
        if r.contains("ax_window_unresolved")
            || r.contains("electron")
            || r.contains("chromium")
            || r.contains("catalyst")
        {
            return true;
        }
    }
    let name = app_name
        .or_else(|| payload.get("app_name").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_ascii_lowercase();
    // Common Electron / Chromium desktop shells (not page CDP targets).
    const HINTS: &[&str] = &[
        "slack",
        "discord",
        "code",
        "visual studio code",
        "cursor",
        "electron",
        "figma",
        "notion",
        "obsidian",
        "spotify",
        "postman",
        "1password",
        "orca",
        "chrome",
        "chromium",
        "edge",
        "brave",
        "arc",
    ];
    HINTS.iter().any(|h| name.contains(h))
}

pub fn classify_surface(payload: &Value) -> SurfaceKind {
    let count = element_count(payload);
    let degraded = degraded_reason(payload).is_some()
        || payload
            .get("degraded")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

    if count == 0 || (degraded && count == 0) {
        return SurfaceKind::AxEmpty;
    }
    if count >= HEAVY_THRESHOLD {
        return SurfaceKind::AxHeavy;
    }
    if count <= SPARSE_THRESHOLD {
        return SurfaceKind::AxSparse;
    }
    SurfaceKind::AxOk
}

fn preferred_path(kind: SurfaceKind) -> &'static str {
    match kind {
        SurfaceKind::AxOk | SurfaceKind::AxSparse | SurfaceKind::AxHeavy => "element_token",
        SurfaceKind::AxEmpty => "pixel",
    }
}

fn next_steps(kind: SurfaceKind, electron: bool) -> Vec<&'static str> {
    match kind {
        SurfaceKind::AxEmpty => {
            if electron {
                vec![
                    "AX tree empty (common for Electron/Chromium shells) — do NOT retry element_token on this window.",
                    "Take drive screenshot (or window-state --screenshot) and click PNG / window-local pixels.",
                    "Keep the window on-screen; try --delivery-mode background first.",
                    "If click ok but UI unchanged: --delivery-mode foreground --window-id <id> (brief front).",
                    "Do not use atmos browser-use unless this is a real browser tab with a DevTools endpoint.",
                ]
            } else {
                vec![
                    "AX tree empty for this window_id — use pixel path from screenshot.",
                    "Confirm window_id/pid match list_windows; retry window-state once if mis-bound.",
                    "background pixel → re-screenshot → foreground only if needed.",
                ]
            }
        }
        SurfaceKind::AxSparse => vec![
            "Very few AX nodes (likely window chrome only). Prefer element_token when a control exists.",
            "Otherwise screenshot + pixel click for content regions.",
        ],
        SurfaceKind::AxHeavy => vec![
            "Large AX tree — use --max-elements / --max-depth to bound window-state.",
            "Pick element_token from elements[] (true background). Avoid dumping full tree_markdown into context.",
            "Cross-check with screenshot; trees can lie on Electron-style UIs.",
        ],
        SurfaceKind::AxOk => vec![
            "Prefer: drive click --element-token <token> [--pid] [--window-id] (true background).",
            "Re-run window-state every turn before element actions (indices/tokens go stale).",
            "Pixel path only for canvas / missing controls.",
        ],
    }
}

/// First element_token in the payload for agent convenience (if any).
pub fn first_element_token(payload: &Value) -> Option<String> {
    let elements = payload.get("elements")?.as_array()?;
    for el in elements {
        if let Some(t) = el
            .get("element_token")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Some(t.to_string());
        }
    }
    None
}

/// Attach `atmos_surface` guidance onto a window-state engine payload (mutates object).
pub fn enrich_window_state(payload: &mut Value, app_name: Option<&str>) {
    let kind = classify_surface(payload);
    let electron = electron_likely(payload, app_name);
    let count = element_count(payload);
    let degraded = degraded_reason(payload).map(|s| s.to_string());
    let snapshot_id = payload
        .get("snapshot_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let sample_token = first_element_token(payload);
    let steps = next_steps(kind, electron);

    let guidance = json!({
        "kind": kind.as_str(),
        "element_count": count,
        "electron_likely": electron,
        "preferred_path": preferred_path(kind),
        "degraded_reason": degraded,
        "snapshot_id": snapshot_id,
        "sample_element_token": sample_token,
        "action_ladder": [
            "background AX element_token (when elements non-empty)",
            "re-snapshot / re-screenshot",
            "background pixel (window on-screen)",
            "delivery_mode foreground + window_id (last resort)"
        ],
        "next_steps": steps,
        "cli_examples": match kind {
            SurfaceKind::AxEmpty => json!([
                "atmos desktop-use --json drive screenshot --out /tmp/du.png",
                "atmos desktop-use --json drive click --x <png_x> --y <png_y>",
                "atmos desktop-use --json drive click --x <png_x> --y <png_y> --delivery-mode foreground --window-id <id>"
            ]),
            _ => json!([
                "atmos desktop-use --json drive window-state --pid <pid> --window-id <id>",
                "atmos desktop-use --json drive click --element-token '<token>' --pid <pid> --window-id <id>",
                "atmos desktop-use --json drive type --text '…' --element-token '<token>' --pid <pid> --window-id <id>"
            ]),
        },
    });

    if let Some(obj) = payload.as_object_mut() {
        obj.insert("atmos_surface".into(), guidance);
    }
}

/// Soft note for successful pixel-path clicks so agents remember the ladder.
pub fn pixel_path_note() -> Value {
    json!({
        "path": "pixel",
        "note": "Pixel path used (no element_token). Window must be on-screen. Prefer window-state → element_token when AX is non-empty. If UI unchanged: retry --delivery-mode foreground --window-id.",
        "action_ladder": [
            "background AX element_token",
            "background pixel",
            "foreground + window_id"
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_ax_electron_orca() {
        let mut v = json!({
            "degraded": true,
            "degraded_reason": "ax_window_unresolved: window_id 93163 …",
            "element_count": 0,
            "elements": [],
            "pid": 1,
            "window_id": 2,
        });
        assert_eq!(classify_surface(&v), SurfaceKind::AxEmpty);
        assert!(electron_likely(&v, Some("Orca")));
        enrich_window_state(&mut v, Some("Orca"));
        let s = &v["atmos_surface"];
        assert_eq!(s["kind"], "ax_empty");
        assert_eq!(s["preferred_path"], "pixel");
        assert_eq!(s["electron_likely"], true);
        assert!(s["next_steps"].as_array().unwrap().len() >= 3);
    }

    #[test]
    fn ax_ok_with_token() {
        let mut v = json!({
            "element_count": 12,
            "snapshot_id": "snap-1",
            "elements": [
                {"element_index": 0, "element_token": "tok-abc", "role": "button", "label": "OK"}
            ]
        });
        assert_eq!(classify_surface(&v), SurfaceKind::AxOk);
        enrich_window_state(&mut v, Some("Finder"));
        assert_eq!(v["atmos_surface"]["preferred_path"], "element_token");
        assert_eq!(v["atmos_surface"]["sample_element_token"], "tok-abc");
        assert_eq!(v["atmos_surface"]["snapshot_id"], "snap-1");
        assert_eq!(v["atmos_surface"]["electron_likely"], false);
    }

    #[test]
    fn heavy_tree() {
        let elements: Vec<Value> = (0..900)
            .map(|i| json!({"element_index": i, "element_token": format!("t{i}")}))
            .collect();
        let v = json!({ "elements": elements, "element_count": 900 });
        assert_eq!(classify_surface(&v), SurfaceKind::AxHeavy);
        assert!(electron_likely(&v, Some("Visual Studio Code")));
    }

    #[test]
    fn sparse_shell() {
        let v = json!({
            "element_count": 2,
            "elements": [
                {"element_token": "a"},
                {"element_token": "b"}
            ]
        });
        assert_eq!(classify_surface(&v), SurfaceKind::AxSparse);
    }
}
