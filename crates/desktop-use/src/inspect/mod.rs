//! Desktop Use **Inspect** — UI structure / accessibility tree (not pixels, not input).
//!
//! This is the primary agent-readable content for AppShot `context.md` and for
//! agents that need to understand on-screen structure before `drive` actions.
//!
//! Capability split:
//! - **capture** — screenshot + window identity (Screen Recording)
//! - **inspect** — accessibility tree / UI nodes (Accessibility)  ← this module
//! - **control** — click / type / optional engine

use serde::{Deserialize, Serialize};

use crate::strings::{scrub_vendor, PRODUCT_NAME};

/// Default redaction terms for secure/password-like fields (case-insensitive).
pub const DEFAULT_REDACTION_TERMS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "token",
    "api key",
    "apikey",
    "credit card",
    "ssn",
    "secure text",
];

/// Limits matching AppShot APP-021 macOS v1 defaults.
pub const DEFAULT_NODE_LIMIT: usize = 420;
pub const DEFAULT_DEPTH_LIMIT: usize = 8;
pub const DEFAULT_CHILD_LIMIT: usize = 40;
pub const DEFAULT_BYTE_LIMIT: usize = 24 * 1024;
pub const DEFAULT_TIMEOUT_MS: u64 = 1_500;

#[cfg(target_os = "macos")]
mod macos_ax;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InspectRequest {
    pub process_id: i32,
    #[serde(default)]
    pub app_name: Option<String>,
    #[serde(default)]
    pub node_limit: Option<usize>,
    #[serde(default)]
    pub depth_limit: Option<usize>,
    #[serde(default)]
    pub child_limit: Option<usize>,
    #[serde(default)]
    pub byte_limit: Option<usize>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InspectResult {
    pub ok: bool,
    /// Compact accessibility tree (markdown-ish lines), agent-readable.
    pub tree_markdown: String,
    pub node_count_estimate: usize,
    pub quality: String,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl InspectResult {
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            tree_markdown: String::new(),
            node_count_estimate: 0,
            quality: "unavailable".into(),
            warnings: vec![],
            error: Some(scrub_vendor(&error.into())),
        }
    }
}

/// Inspect the UI accessibility tree of a process (macOS AX).
pub fn inspect(req: InspectRequest) -> InspectResult {
    #[cfg(target_os = "macos")]
    {
        inspect_macos(req)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = req;
        InspectResult::failure("Desktop inspect (accessibility tree) is only supported on macOS")
    }
}

/// Build AppShot-style context.md from window meta + inspect tree.
pub fn build_appshot_context_markdown(
    app_name: &str,
    window_title: Option<&str>,
    process_id: Option<i32>,
    bounds: Option<(i32, i32, i32, i32)>,
    tree_markdown: &str,
    quality: &str,
    warnings: &[String],
) -> String {
    let mut lines = vec![
        "# Appshot Context".to_string(),
        String::new(),
        format!("- App: {app_name}"),
    ];
    if let Some(t) = window_title.filter(|s| !s.is_empty()) {
        lines.push(format!("- Window: {t}"));
    }
    if let Some(pid) = process_id {
        lines.push(format!("- Process ID: {pid}"));
    }
    if let Some((x, y, w, h)) = bounds {
        lines.push(format!("- Bounds: {x},{y} {w}×{h}"));
    }
    lines.push(format!("- Quality: {quality}"));
    lines.push(format!("- Source: {PRODUCT_NAME} inspect"));
    lines.push(String::new());
    lines.push("## UI structure".to_string());
    lines.push(String::new());
    let tree = tree_markdown.trim();
    if tree.is_empty() {
        lines.push("Accessibility tree unavailable.".into());
    } else {
        lines.push(tree.to_string());
    }
    if !warnings.is_empty() {
        lines.push(String::new());
        lines.push("## Warnings".into());
        for w in warnings {
            lines.push(format!("- {w}"));
        }
    }
    lines.push(String::new());
    lines.join("\n")
}

#[cfg(target_os = "macos")]
fn inspect_macos(req: InspectRequest) -> InspectResult {
    use std::time::Duration;

    if req.process_id <= 0 {
        return InspectResult::failure("inspect requires a positive process_id");
    }
    let app_name = req
        .app_name
        .clone()
        .unwrap_or_else(|| "Unknown".to_string());
    let config = macos_ax::AccessibilityCaptureConfig {
        timeout: Duration::from_millis(req.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)),
        node_limit: req.node_limit.unwrap_or(DEFAULT_NODE_LIMIT),
        depth_limit: req.depth_limit.unwrap_or(DEFAULT_DEPTH_LIMIT),
        child_limit: req.child_limit.unwrap_or(DEFAULT_CHILD_LIMIT),
        byte_limit: req.byte_limit.unwrap_or(DEFAULT_BYTE_LIMIT),
        redaction_terms: DEFAULT_REDACTION_TERMS,
    };
    match macos_ax::capture_accessibility_tree(Some(req.process_id as u32), &app_name, config) {
        Ok(tree) if !tree.trim().is_empty() => {
            let node_count_estimate = tree.lines().filter(|l| !l.trim().is_empty()).count();
            InspectResult {
                ok: true,
                tree_markdown: tree,
                node_count_estimate,
                quality: "accessibility".into(),
                warnings: vec![],
                error: None,
            }
        }
        Ok(_) => InspectResult {
            ok: false,
            tree_markdown: String::new(),
            node_count_estimate: 0,
            quality: "empty".into(),
            warnings: vec!["Accessibility tree was empty.".into()],
            error: Some("Accessibility tree was empty.".into()),
        },
        Err(e) => InspectResult::failure(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_markdown_includes_tree_section() {
        let md = build_appshot_context_markdown(
            "Notes",
            Some("Todo"),
            Some(42),
            Some((0, 0, 100, 100)),
            "Button Title: Save\nTextField Value: hello",
            "screenshot_and_accessibility",
            &[],
        );
        assert!(md.contains("# Appshot Context"));
        assert!(md.contains("## UI structure"));
        assert!(md.contains("Button Title: Save"));
        assert!(!crate::strings::contains_vendor_brand(&md));
    }

    #[test]
    fn failure_is_vendor_free() {
        let r = InspectResult::failure("talk to cua");
        assert!(!r.ok);
        assert!(!crate::strings::contains_vendor_brand(
            r.error.as_deref().unwrap()
        ));
    }
}
