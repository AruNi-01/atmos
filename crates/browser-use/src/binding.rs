use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::{BrowserBackendKind, BrowserResult, ResolvedFrom};

const BINDING_SCHEMA: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BrowserBinding {
    pub schema: u32,
    pub binding_id: String,
    pub backend: BrowserBackendKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub updated_at_ms: u64,
}

impl BrowserBinding {
    pub fn new(
        binding_id: impl Into<String>,
        backend: BrowserBackendKind,
        target_id: Option<String>,
        tab_id: Option<String>,
        session_id: Option<String>,
    ) -> Self {
        Self {
            schema: BINDING_SCHEMA,
            binding_id: binding_id.into(),
            backend,
            target_id,
            tab_id,
            session_id,
            updated_at_ms: now_ms(),
        }
    }
}

/// Scope lookup order for native (non-MCP) tools and the CLI.
/// First match wins: explicit id, then these environment keys.
pub const BINDING_SCOPE_ENV: &[&str] = &[
    "ATMOS_BROWSER_USE_BINDING_ID",
    "ATMOS_SIDE_CHAT_ID",
    "ATMOS_PANE_ID",
];

/// Caller-supplied route for a future native tool. Same resolver as `execute()`.
#[derive(Debug, Clone, Default)]
pub struct NativeRouteHint {
    pub backend: BrowserBackendKind,
    pub backend_explicit: bool,
    pub target_id: Option<String>,
    pub tab_id: Option<String>,
    pub session_id: Option<String>,
    pub binding_id: Option<String>,
}

/// Resolve `{backend,target_id,tab_id}` for any native Browser Use caller.
/// Do not reimplement this order in CLI / host / future tool shims.
pub fn resolve_native_route(hint: NativeRouteHint) -> AppliedBinding {
    apply_binding_defaults(
        hint.backend,
        hint.backend_explicit,
        hint.target_id,
        hint.tab_id,
        hint.session_id,
        hint.binding_id.as_deref(),
    )
}

pub fn resolve_binding_id(explicit: Option<&str>) -> Option<String> {
    resolve_binding_scope(explicit, env_nonempty)
}

/// Pure scope resolver. `lookup` is `env_nonempty` in production.
pub fn resolve_binding_scope(
    explicit: Option<&str>,
    lookup: impl Fn(&str) -> Option<String>,
) -> Option<String> {
    explicit
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| BINDING_SCOPE_ENV.iter().find_map(|key| lookup(key)))
}

pub fn load_binding(binding_id: &str) -> Option<BrowserBinding> {
    let path = binding_path(binding_id);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_binding(binding: &BrowserBinding) -> Result<(), String> {
    let dir = bindings_dir();
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = binding_path(&binding.binding_id);
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let payload = serde_json::to_vec_pretty(binding).map_err(|error| error.to_string())?;
    fs::write(&tmp, payload).map_err(|error| error.to_string())?;
    fs::rename(&tmp, path).map_err(|error| error.to_string())
}

pub fn clear_binding(binding_id: &str) -> Result<(), String> {
    let path = binding_path(binding_id);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub struct AppliedBinding {
    pub backend: BrowserBackendKind,
    pub target_id: Option<String>,
    pub tab_id: Option<String>,
    pub session_id: Option<String>,
    pub resolved_from: Option<ResolvedFrom>,
}

pub fn apply_binding_defaults(
    request_backend: BrowserBackendKind,
    backend_explicit: bool,
    target_id: Option<String>,
    tab_id: Option<String>,
    session_id: Option<String>,
    binding_id: Option<&str>,
) -> AppliedBinding {
    let binding_id = resolve_binding_id(binding_id);
    let stored = binding_id.as_deref().and_then(load_binding);
    let backend = if backend_explicit {
        request_backend
    } else if let Some(stored) = stored.as_ref() {
        stored.backend
    } else if crate::backends::embedded::embedded_host_available() {
        BrowserBackendKind::Embedded
    } else {
        request_backend
    };
    // No pane/chat scope: still pick Embedded when Desktop wrote control.json,
    // but never merge a stored target/tab (those are scope-owned).
    let Some(binding_id) = binding_id else {
        return AppliedBinding {
            backend,
            target_id,
            tab_id,
            session_id,
            resolved_from: None,
        };
    };
    if let Some(stored) = stored.as_ref() {
        if stored.backend != backend {
            return AppliedBinding {
                backend,
                target_id,
                tab_id,
                session_id,
                resolved_from: None,
            };
        }
    }
    let resolved_target = first_nonempty(
        target_id.clone(),
        stored.as_ref().and_then(|b| b.target_id.clone()),
    );
    let resolved_tab = first_nonempty(tab_id.clone(), stored.as_ref().and_then(|b| b.tab_id.clone()));
    let resolved_session = first_nonempty(
        session_id.clone(),
        stored.as_ref().and_then(|b| b.session_id.clone()),
    );
    let used_stored = stored.is_some()
        && ((target_id.is_none() && resolved_target.is_some())
            || (tab_id.is_none() && resolved_tab.is_some()));
    AppliedBinding {
        backend,
        target_id: resolved_target,
        tab_id: resolved_tab,
        session_id: resolved_session,
        resolved_from: used_stored.then(|| ResolvedFrom {
            binding_id: Some(binding_id),
            target_id: stored.as_ref().and_then(|b| b.target_id.clone()),
            tab_id: stored.as_ref().and_then(|b| b.tab_id.clone()),
        }),
    }
}

pub fn commit_binding_from_result(
    binding_id: Option<&str>,
    backend: BrowserBackendKind,
    result: &BrowserResult,
) {
    apply_result_to_binding(binding_id, backend, crate::types::BrowserAction::State, None, result);
}

/// Persist, clear, or leave the scoped binding after an action.
/// `end` / `tabs close` must not leave a dead target as "current".
pub fn apply_result_to_binding(
    binding_id: Option<&str>,
    backend: BrowserBackendKind,
    action: crate::types::BrowserAction,
    tab_action: Option<&str>,
    result: &BrowserResult,
) {
    let Some(binding_id) = resolve_binding_id(binding_id) else {
        return;
    };
    if !result.ok {
        if should_clear_dead_binding(result) {
            let _ = clear_binding(&binding_id);
        }
        return;
    }
    if action == crate::types::BrowserAction::End {
        let _ = clear_binding(&binding_id);
        return;
    }
    if action == crate::types::BrowserAction::Tabs {
        let tab_action = tab_action.map(str::trim).unwrap_or("");
        if tab_action == "list" {
            return;
        }
        if tab_action == "close" {
            let (closed_target, _, _) = extract_ids(result);
            if let Some(stored) = load_binding(&binding_id) {
                if closed_target.is_some() && stored.target_id == closed_target {
                    let _ = clear_binding(&binding_id);
                }
            }
            return;
        }
    }
    let (target_id, tab_id, session_id) = extract_ids(result);
    if target_id.is_none() && tab_id.is_none() && session_id.is_none() {
        return;
    }
    let stored = load_binding(&binding_id);
    let binding = BrowserBinding::new(
        binding_id,
        backend,
        first_nonempty(target_id, stored.as_ref().and_then(|b| b.target_id.clone())),
        first_nonempty(tab_id, stored.as_ref().and_then(|b| b.tab_id.clone())),
        first_nonempty(session_id, stored.as_ref().and_then(|b| b.session_id.clone())),
    );
    let _ = save_binding(&binding);
}

fn should_clear_dead_binding(result: &BrowserResult) -> bool {
    result.error_code.as_deref() == Some("browser_route_unavailable")
}

pub fn extract_ids(result: &BrowserResult) -> (Option<String>, Option<String>, Option<String>) {
    let from_result = result.result.as_ref();
    (
        first_nonempty(
            result.target_id.clone(),
            json_string(from_result, "target_id"),
        ),
        first_nonempty(result.tab_id.clone(), json_string(from_result, "tab_id")),
        first_nonempty(
            result.session_id.clone(),
            json_string(from_result, "session")
                .or_else(|| json_string(from_result, "session_id")),
        ),
    )
}

pub fn fill_result_ids(result: &mut BrowserResult) {
    let (target_id, tab_id, session_id) = extract_ids(result);
    if result.target_id.is_none() {
        result.target_id = target_id;
    }
    if result.tab_id.is_none() {
        result.tab_id = tab_id;
    }
    if result.session_id.is_none() {
        result.session_id = session_id;
    }
}

pub fn engine_session_id(binding_id: Option<&str>, explicit: Option<&str>) -> String {
    if let Some(session) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return session.to_string();
    }
    match resolve_binding_id(binding_id) {
        Some(id) => format!("atmos-browser-use:{id}"),
        None => "atmos-browser-use".to_string(),
    }
}

fn json_string(value: Option<&Value>, key: &str) -> Option<String> {
    value
        .and_then(|v| v.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn first_nonempty(primary: Option<String>, fallback: Option<String>) -> Option<String> {
    primary
        .filter(|value| !value.trim().is_empty())
        .or_else(|| fallback.filter(|value| !value.trim().is_empty()))
}

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn bindings_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ATMOS_BROWSER_USE_HOME") {
        if !p.is_empty() {
            return PathBuf::from(p).join("bindings");
        }
    }
    atmos_home()
        .join("state")
        .join("browser-use")
        .join("bindings")
}

fn binding_path(binding_id: &str) -> PathBuf {
    bindings_dir().join(format!("{}.json", sanitize_binding_id(binding_id)))
}

fn sanitize_binding_id(binding_id: &str) -> String {
    binding_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn atmos_home() -> PathBuf {
    std::env::var("ATMOS_HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(|| dirs::home_dir().map(|home| home.join(".atmos")))
        .unwrap_or_else(|| PathBuf::from(".atmos"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
pub(crate) static TEST_HOME_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_path_separators() {
        assert_eq!(sanitize_binding_id("a/b:c"), "a_b_c");
    }

    #[test]
    fn resolve_prefers_explicit() {
        assert_eq!(
            resolve_binding_id(Some("pane-1")),
            Some("pane-1".to_string())
        );
    }

    #[test]
    fn apply_without_scope_is_passthrough() {
        let _guard = TEST_HOME_LOCK.lock().expect("test home lock");
        let dir = tempfile::tempdir().unwrap();
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let applied = apply_binding_defaults(
            BrowserBackendKind::External,
            false,
            Some("t".into()),
            Some("tab".into()),
            None,
            None,
        );
        assert_eq!(applied.target_id.as_deref(), Some("t"));
        assert_eq!(applied.backend, BrowserBackendKind::External);
        assert!(applied.resolved_from.is_none());
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }

    #[test]
    fn apply_without_scope_defaults_embedded_when_control_json_exists() {
        let _guard = TEST_HOME_LOCK.lock().expect("test home lock");
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("control.json"), "{}").unwrap();
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let applied = apply_binding_defaults(
            BrowserBackendKind::External,
            false,
            Some("t".into()),
            Some("tab".into()),
            None,
            None,
        );
        assert_eq!(applied.backend, BrowserBackendKind::Embedded);
        assert_eq!(applied.target_id.as_deref(), Some("t"));
        assert_eq!(applied.tab_id.as_deref(), Some("tab"));
        assert!(applied.resolved_from.is_none());
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }

    #[test]
    fn scope_order_is_explicit_then_binding_then_side_chat_then_pane() {
        assert_eq!(
            BINDING_SCOPE_ENV,
            &[
                "ATMOS_BROWSER_USE_BINDING_ID",
                "ATMOS_SIDE_CHAT_ID",
                "ATMOS_PANE_ID",
            ]
        );

        let env = |key: &str| match key {
            "ATMOS_BROWSER_USE_BINDING_ID" => Some("from-binding".into()),
            "ATMOS_SIDE_CHAT_ID" => Some("from-chat".into()),
            "ATMOS_PANE_ID" => Some("from-pane".into()),
            _ => None,
        };
        assert_eq!(
            resolve_binding_scope(Some("explicit"), env),
            Some("explicit".into())
        );
        assert_eq!(
            resolve_binding_scope(None, env),
            Some("from-binding".into())
        );

        let no_binding = |key: &str| match key {
            "ATMOS_SIDE_CHAT_ID" => Some("from-chat".into()),
            "ATMOS_PANE_ID" => Some("from-pane".into()),
            _ => None,
        };
        assert_eq!(
            resolve_binding_scope(None, no_binding),
            Some("from-chat".into())
        );

        let pane_only = |key: &str| match key {
            "ATMOS_PANE_ID" => Some("from-pane".into()),
            _ => None,
        };
        assert_eq!(
            resolve_binding_scope(None, pane_only),
            Some("from-pane".into())
        );
        assert_eq!(resolve_binding_scope(Some("  "), pane_only), Some("from-pane".into()));
        assert_eq!(resolve_binding_scope(None, |_| None), None);
    }

    #[test]
    fn end_and_close_do_not_leave_a_dead_target() {
        let _guard = TEST_HOME_LOCK.lock().expect("test home lock");
        let dir = tempfile::tempdir().unwrap();
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let binding_id = "pane-close";
        let stored = BrowserBinding::new(
            binding_id,
            BrowserBackendKind::Embedded,
            Some("dead".into()),
            Some("main".into()),
            None,
        );
        save_binding(&stored).unwrap();

        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::Tabs,
            Some("close"),
            &BrowserResult {
                ok: true,
                action: "tabs".into(),
                backend: "embedded".into(),
                target_id: Some("dead".into()),
                tab_id: Some("main".into()),
                ..BrowserResult::default()
            },
        );
        assert!(load_binding(binding_id).is_none());

        save_binding(&stored).unwrap();
        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::End,
            None,
            &BrowserResult {
                ok: true,
                action: "end".into(),
                backend: "embedded".into(),
                target_id: Some("dead".into()),
                ..BrowserResult::default()
            },
        );
        assert!(load_binding(binding_id).is_none());

        save_binding(&stored).unwrap();
        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::Tabs,
            Some("list"),
            &BrowserResult {
                ok: true,
                action: "tabs".into(),
                backend: "embedded".into(),
                target_id: Some("other".into()),
                tab_id: Some("main".into()),
                ..BrowserResult::default()
            },
        );
        assert_eq!(
            load_binding(binding_id).and_then(|b| b.target_id),
            Some("dead".into())
        );

        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::Tabs,
            Some("close"),
            &BrowserResult {
                ok: true,
                action: "tabs".into(),
                backend: "embedded".into(),
                target_id: Some("other".into()),
                tab_id: Some("main".into()),
                ..BrowserResult::default()
            },
        );
        assert_eq!(
            load_binding(binding_id).and_then(|b| b.target_id),
            Some("dead".into())
        );
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }

    #[test]
    fn native_route_reuses_the_same_resolver() {
        let applied = resolve_native_route(NativeRouteHint {
            backend: BrowserBackendKind::Embedded,
            backend_explicit: true,
            target_id: Some("sess".into()),
            tab_id: Some("main".into()),
            ..Default::default()
        });
        assert_eq!(applied.backend, BrowserBackendKind::Embedded);
        assert_eq!(applied.target_id.as_deref(), Some("sess"));
        assert_eq!(applied.tab_id.as_deref(), Some("main"));
        assert!(applied.resolved_from.is_none());
    }

    #[test]
    fn click_does_not_wipe_stored_tab_id() {
        let _guard = TEST_HOME_LOCK.lock().expect("test home lock");
        let dir = tempfile::tempdir().unwrap();
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let binding_id = "pane-merge";
        save_binding(&BrowserBinding::new(
            binding_id,
            BrowserBackendKind::Embedded,
            Some("sess".into()),
            Some("main".into()),
            None,
        ))
        .unwrap();
        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::Click,
            None,
            &BrowserResult {
                ok: true,
                action: "click".into(),
                backend: "embedded".into(),
                target_id: Some("sess".into()),
                ..BrowserResult::default()
            },
        );
        let stored = load_binding(binding_id).unwrap();
        assert_eq!(stored.target_id.as_deref(), Some("sess"));
        assert_eq!(stored.tab_id.as_deref(), Some("main"));
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }

    #[test]
    fn route_unavailable_clears_dead_binding() {
        let _guard = TEST_HOME_LOCK.lock().expect("test home lock");
        let dir = tempfile::tempdir().unwrap();
        unsafe {
            std::env::set_var("ATMOS_BROWSER_USE_HOME", dir.path());
        }
        let binding_id = "pane-dead";
        save_binding(&BrowserBinding::new(
            binding_id,
            BrowserBackendKind::Embedded,
            Some("dead".into()),
            Some("main".into()),
            None,
        ))
        .unwrap();
        apply_result_to_binding(
            Some(binding_id),
            BrowserBackendKind::Embedded,
            crate::types::BrowserAction::State,
            None,
            &BrowserResult {
                ok: false,
                action: "state".into(),
                backend: "embedded".into(),
                error_code: Some("browser_route_unavailable".into()),
                ..BrowserResult::default()
            },
        );
        assert!(load_binding(binding_id).is_none());
        unsafe {
            std::env::remove_var("ATMOS_BROWSER_USE_HOME");
        }
    }
}
