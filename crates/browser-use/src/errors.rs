use serde_json::Value;

use crate::types::BrowserResult;

pub const BROWSER_ENGINE_FAILED: &str = "browser_engine_failed";
pub const BROWSER_REF_STALE: &str = "browser_ref_stale";
pub const BROWSER_AMBIGUOUS_TARGET: &str = "browser_ambiguous_target";
pub const BROWSER_ROUTE_UNAVAILABLE: &str = "browser_route_unavailable";
pub const BROWSER_SETUP_REQUIRED: &str = "browser_setup_required";
pub const BROWSER_PROFILE_GRANT_REQUIRED: &str = "browser_profile_grant_required";
pub const BROWSER_UNTRUSTED_CONTENT: &str = "browser_untrusted_content";
pub const BROWSER_UNSUPPORTED: &str = "browser_unsupported";
pub const BROWSER_INVALID_ARGS: &str = "invalid_args";
pub const BROWSER_CONTROL_UNAVAILABLE: &str = "embedded_browser_host_unavailable";
pub const BROWSER_CONTROL_AUTH_FAILED: &str = "browser_control_auth_failed";
pub const BROWSER_DOWNLOAD_DENIED: &str = "browser_download_denied";
pub const BROWSER_NAVIGATE_DENIED: &str = "browser_navigate_denied";

pub fn fail(action: &str, backend: &str, code: &str, message: impl Into<String>) -> BrowserResult {
    BrowserResult::fail(action, backend, code, message)
}

pub fn fail_with_recovery(
    action: &str,
    backend: &str,
    code: &str,
    message: impl Into<String>,
    recovery: Option<String>,
) -> BrowserResult {
    BrowserResult::fail_with_recovery(action, backend, code, message, recovery)
}

pub fn map_engine_failure(
    action: &str,
    backend: &str,
    payload: &Value,
    fallback: &str,
) -> BrowserResult {
    let engine_code = desktop_use::engine_protocol::engine_failure_code(payload);
    let raw_message = payload
        .get("error")
        .and_then(Value::as_str)
        .or_else(|| payload.get("message").and_then(Value::as_str))
        .or_else(|| payload.pointer("/refusal/message").and_then(Value::as_str))
        .unwrap_or(fallback);
    let (code, recovery) = classify_engine_message(engine_code.as_deref(), raw_message);
    let mut result = fail_with_recovery(action, backend, code, raw_message, recovery);
    result.result = Some(payload.clone());
    result
}

pub fn classify_engine_message(
    engine_code: Option<&str>,
    message: &str,
) -> (&'static str, Option<String>) {
    if let Some(code) = engine_code {
        let mapped = map_known_engine_code(code);
        if mapped != BROWSER_ENGINE_FAILED {
            return (mapped, recovery_for(mapped));
        }
    }
    let lower = message.to_ascii_lowercase();
    if matches_any(
        &lower,
        &[
            "stale",
            "unknown ref",
            "ref not found",
            "element not found",
            "no longer available",
            "snapshot expired",
            "run state snapshot first",
        ],
    ) {
        return (BROWSER_REF_STALE, recovery_for(BROWSER_REF_STALE));
    }
    if matches_any(
        &lower,
        &[
            "ambiguous",
            "multiple targets",
            "more than one",
            "multiple tabs",
        ],
    ) {
        return (
            BROWSER_AMBIGUOUS_TARGET,
            recovery_for(BROWSER_AMBIGUOUS_TARGET),
        );
    }
    if matches_any(&lower, &["not trusted", "untrusted", "user gesture"]) {
        return (
            BROWSER_UNTRUSTED_CONTENT,
            recovery_for(BROWSER_UNTRUSTED_CONTENT),
        );
    }
    if matches_any(&lower, &["existing-profile", "existing_profile"])
        && matches_any(&lower, &["grant", "not allowed", "denied", "not granted"])
    {
        return (
            BROWSER_PROFILE_GRANT_REQUIRED,
            recovery_for(BROWSER_PROFILE_GRANT_REQUIRED),
        );
    }
    if matches_any(
        &lower,
        &[
            "setup required",
            "accessibility",
            "screen recording",
            "tcc",
            "not granted",
        ],
    ) {
        return (BROWSER_SETUP_REQUIRED, recovery_for(BROWSER_SETUP_REQUIRED));
    }
    if matches_any(
        &lower,
        &[
            "no target",
            "target not found",
            "tab not found",
            "window not found",
            "no browser",
            "no guest",
            "no bound",
        ],
    ) {
        return (
            BROWSER_ROUTE_UNAVAILABLE,
            recovery_for(BROWSER_ROUTE_UNAVAILABLE),
        );
    }
    if engine_code == Some("invalid_args")
        || engine_code == Some("invalid_arguments")
        || matches_any(&lower, &["invalid argument", "invalid_args"])
    {
        return (BROWSER_INVALID_ARGS, recovery_for(BROWSER_INVALID_ARGS));
    }
    (BROWSER_ENGINE_FAILED, recovery_for(BROWSER_ENGINE_FAILED))
}

fn map_known_engine_code(code: &str) -> &'static str {
    match code.trim() {
        "browser_ref_stale" | "stale_ref" => BROWSER_REF_STALE,
        "browser_ambiguous_target" | "ambiguous" => BROWSER_AMBIGUOUS_TARGET,
        "browser_route_unavailable" => BROWSER_ROUTE_UNAVAILABLE,
        "browser_setup_required" | "setup_required" => BROWSER_SETUP_REQUIRED,
        "browser_profile_grant_required" => BROWSER_PROFILE_GRANT_REQUIRED,
        "browser_untrusted_content" => BROWSER_UNTRUSTED_CONTENT,
        "browser_unsupported" | "unsupported" => BROWSER_UNSUPPORTED,
        "invalid_args" | "invalid_arguments" => BROWSER_INVALID_ARGS,
        "browser_download_denied" => BROWSER_DOWNLOAD_DENIED,
        "browser_navigate_denied" => BROWSER_NAVIGATE_DENIED,
        "browser_control_auth_failed" => BROWSER_CONTROL_AUTH_FAILED,
        "embedded_browser_host_unavailable" => BROWSER_CONTROL_UNAVAILABLE,
        _ => BROWSER_ENGINE_FAILED,
    }
}

pub fn recovery_for(code: &str) -> Option<String> {
    Some(
        match code {
            BROWSER_REF_STALE => {
                "Call `atmos browser-use state` again, then use a ref from that snapshot. Do not reuse a previous eN or click e0 after a failed lookup."
            }
            BROWSER_AMBIGUOUS_TARGET => {
                "Pass `--target-id` and `--tab-id` from `atmos browser-use state`, or wait until only one matching surface remains."
            }
            BROWSER_UNTRUSTED_CONTENT => {
                "Ask the user to confirm the page action, or use a trusted snapshot instead of guessing a click."
            }
            BROWSER_SETUP_REQUIRED => {
                "Desktop Use / system permissions are missing. Ask the user to complete setup, then retry."
            }
            BROWSER_PROFILE_GRANT_REQUIRED => {
                "`existing_profile` is not granted on this host. Use `--strategy isolated_new` (default) or ask the user to enable the existing-profile grant."
            }
            BROWSER_ROUTE_UNAVAILABLE => {
                "Run `atmos browser-use state` or `tabs --action list` and pass `--target-id`. On external, `prepare` a new isolated session if no window is bound."
            }
            BROWSER_INVALID_ARGS => "Check the tool arguments against `atmos browser-use --help`.",
            BROWSER_UNSUPPORTED => {
                "This action is not available on the selected backend. Use the other backend or a supported action."
            }
            BROWSER_DOWNLOAD_DENIED => {
                "Downloads must stay under your system Downloads folder. Omit `--dir` to use it, or pass a folder inside it."
            }
            BROWSER_NAVIGATE_DENIED => {
                "Only http, https, and about:blank navigations are allowed."
            }
            BROWSER_CONTROL_AUTH_FAILED => {
                "Restart Atmos Desktop so the embedded Browser Use control plane can issue a fresh token."
            }
            BROWSER_CONTROL_UNAVAILABLE => {
                "Open Atmos Desktop so the in-app Browser host can write control.json, then retry `atmos browser-use state`. Do not prepare a system Chrome session."
            }
            "control_engine_not_installed" | "control_engine_failed" => {
                "Install or pin Desktop Use control engine 0.19.2 for system Chrome, or open Atmos Desktop and omit `--backend` to use the in-app Browser."
            }
            _ => "Retry after `atmos browser-use state`. If the surface disappeared, start a new isolated session.",
        }
        .to_string(),
    )
}

fn matches_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_stale_ref() {
        let (code, recovery) = classify_engine_message(None, "ref e3 is stale");
        assert_eq!(code, BROWSER_REF_STALE);
        assert!(recovery.unwrap().contains("state"));
    }

    #[test]
    fn classifies_ambiguous() {
        let (code, _) = classify_engine_message(None, "Multiple targets matched");
        assert_eq!(code, BROWSER_AMBIGUOUS_TARGET);
    }

    #[test]
    fn prefers_engine_code() {
        let (code, _) = classify_engine_message(Some("browser_ref_stale"), "boom");
        assert_eq!(code, BROWSER_REF_STALE);
    }

    #[test]
    fn maps_embedded_host_and_unknown_target() {
        assert_eq!(
            map_known_engine_code("embedded_browser_host_unavailable"),
            BROWSER_CONTROL_UNAVAILABLE
        );
        let (code, recovery) = classify_engine_message(None, "no bound webview guest");
        assert_eq!(code, BROWSER_ROUTE_UNAVAILABLE);
        assert!(recovery.unwrap().contains("target-id"));
    }

    #[test]
    fn existing_profile_grant_beats_generic_not_granted() {
        let (code, _) =
            classify_engine_message(None, "existing_profile is not granted on this host");
        assert_eq!(code, BROWSER_PROFILE_GRANT_REQUIRED);
    }

    #[test]
    fn embedded_host_recovery_does_not_suggest_prepare() {
        let recovery = recovery_for(BROWSER_CONTROL_UNAVAILABLE).unwrap();
        assert!(recovery.contains("Desktop"));
        assert!(!recovery.to_ascii_lowercase().contains("isolated"));
    }
}
