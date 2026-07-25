//! APP-041 Browser Cookie Sync — desktop native layer.
//!
//! The [`BrowserCookieCoordinator`] owns the four Tauri commands
//! (`list_importable_browsers`, `import_browser_cookies`, `clear_browser_cache`,
//! `clear_browser_site_data`). It:
//!
//! - serializes the destructive/mutating ops (import + both clears) behind a
//!   single async mutex — a concurrent op returns [`CookieCmdError::Busy`];
//! - validates the calling **webview label** against a first-party allowlist
//!   (`main`, `preview-browser`, `preview-browser-*`) and rejects anything else
//!   (target-site `preview-inspector-*` child/detached webviews, `agent-chat`,
//!   remote content) with [`CookieCmdError::Forbidden`] — defense in depth on
//!   top of the dedicated capability;
//! - gates the whole feature to macOS 14+; on older macOS / non-macOS it returns
//!   [`CookieCmdError::UnsupportedPlatform`] and never falls back to the app's
//!   default WebKit store;
//! - delegates extraction to the leaf `browser-cookies` crate and injection /
//!   clearing to the [`store`] adapter, which only ever touches the dedicated
//!   [`PREVIEW_DATA_STORE_ID`] store;
//! - returns typed `{ code }` errors — never `Err(String)` — and never exposes
//!   filesystem paths or cookie values to the frontend.

mod store;

use browser_cookies::{ExtractError, ProfileHandle};
use serde::ser::{SerializeStruct, Serializer};
use serde::Serialize;
use tauri::{AppHandle, State, Webview};

use crate::state::AppState;

/// Stable identifier for the dedicated WebKit data store used **only** by
/// target-site preview webviews (the external child in `open_preview_surface`
/// and the detached window in `open_preview_detached_window`). Import/clear
/// operate exclusively on this store, never on the app's default store.
///
/// This is the single source of truth: `preview_bridge` wires it onto the two
/// target-site builders via `.data_store_identifier(PREVIEW_DATA_STORE_ID)`, and
/// the [`store`] adapter resolves the same UUID via
/// `WKWebsiteDataStore(forIdentifier:)`. wry maps these bytes to `NSUUID` with
/// `NSUUID::from_bytes`, so both sides reference the identical persistent store.
///
/// UUID: `a7f3c1e2-9b4d-4e5a-8c6f-1d2e3b4a5c6d`.
pub const PREVIEW_DATA_STORE_ID: [u8; 16] = [
    0xa7, 0xf3, 0xc1, 0xe2, 0x9b, 0x4d, 0x4e, 0x5a, 0x8c, 0x6f, 0x1d, 0x2e, 0x3b, 0x4a, 0x5c, 0x6d,
];

/// A discovered, importable browser profile exposed to the frontend. Carries an
/// opaque `profile_handle` (never a filesystem path).
///
/// Field names are serialized in `snake_case` to match the frozen cross-track
/// contract (`{ profile_handle, browser, display_name, running }`) that the
/// frontend reads verbatim. Do NOT add `#[serde(rename_all = "camelCase")]`.
#[derive(Debug, Clone, Serialize)]
pub struct BrowserProfileDto {
    pub profile_handle: String,
    pub browser: String,
    pub display_name: String,
    pub running: bool,
}

/// Outcome of an import, surfaced inline in the UI. Counts only; no values.
///
/// Field names are serialized in `snake_case` to match the frozen cross-track
/// contract (`{ discovered, imported_verified, skipped_expired, skipped_decrypt,
/// skipped_parse, skipped_unsupported, failed_injection }`) that the frontend
/// reads verbatim. Do NOT add `#[serde(rename_all = "camelCase")]`.
#[derive(Debug, Clone, Serialize)]
pub struct ImportReport {
    pub discovered: usize,
    pub imported_verified: usize,
    pub skipped_expired: usize,
    pub skipped_decrypt: usize,
    pub skipped_parse: usize,
    pub skipped_unsupported: usize,
    pub failed_injection: usize,
}

/// `{ ok: true }` response for the clear commands.
#[derive(Debug, Clone, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

/// Stable, typed command error. Always serialized as `{ "code": "<PascalCase>" }`
/// so the frontend can localize by `code` and never sees raw native text, paths,
/// or values. The `code` strings match the frozen cross-track contract variant
/// names and the `preview.toolbar.cookieSync.errors.*` i18n keys exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CookieCmdError {
    UnsupportedPlatform,
    ProfileNotFound,
    BrowserRunning,
    KeychainDenied,
    KeychainUnavailable,
    DatabaseBusy,
    /// Another cookie operation is already in progress.
    Busy,
    /// The calling webview is not a trusted first-party surface.
    Forbidden,
    Io,
    InvalidSchema,
}

impl CookieCmdError {
    /// Stable wire code. These strings are the frozen cross-track contract
    /// variant names (PascalCase) and must match the frontend
    /// `CookieCmdErrorCode` union + `preview.toolbar.cookieSync.errors.*` i18n
    /// keys. Never change them without updating the shared contract, the
    /// frontend normalizer, and both locale files.
    pub fn code(self) -> &'static str {
        match self {
            CookieCmdError::UnsupportedPlatform => "UnsupportedPlatform",
            CookieCmdError::ProfileNotFound => "ProfileNotFound",
            CookieCmdError::BrowserRunning => "BrowserRunning",
            CookieCmdError::KeychainDenied => "KeychainDenied",
            CookieCmdError::KeychainUnavailable => "KeychainUnavailable",
            CookieCmdError::DatabaseBusy => "DatabaseBusy",
            CookieCmdError::Busy => "Busy",
            CookieCmdError::Forbidden => "Forbidden",
            CookieCmdError::Io => "Io",
            CookieCmdError::InvalidSchema => "InvalidSchema",
        }
    }
}

impl Serialize for CookieCmdError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // Emit a stable `{ "code": "<PascalCase>" }` object. Never leak native
        // error text, filesystem paths, or cookie values.
        let mut state = serializer.serialize_struct("CookieCmdError", 1)?;
        state.serialize_field("code", self.code())?;
        state.end()
    }
}

impl From<ExtractError> for CookieCmdError {
    fn from(err: ExtractError) -> Self {
        // The `InvalidSchema(String)` / `Io(String)` payloads carry diagnostic
        // detail that must NOT reach the frontend — collapse to a stable code.
        match err {
            ExtractError::UnsupportedPlatform => CookieCmdError::UnsupportedPlatform,
            ExtractError::ProfileNotFound => CookieCmdError::ProfileNotFound,
            ExtractError::BrowserRunning => CookieCmdError::BrowserRunning,
            ExtractError::KeychainDenied => CookieCmdError::KeychainDenied,
            ExtractError::KeychainUnavailable => CookieCmdError::KeychainUnavailable,
            ExtractError::DatabaseBusy => CookieCmdError::DatabaseBusy,
            ExtractError::InvalidSchema(_) => CookieCmdError::InvalidSchema,
            ExtractError::Io(_) => CookieCmdError::Io,
        }
    }
}

/// Serializes import / clear operations so their WebKit-store mutations never
/// race. Stored in [`AppState`].
pub struct BrowserCookieCoordinator {
    op_lock: tokio::sync::Mutex<()>,
}

impl Default for BrowserCookieCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserCookieCoordinator {
    pub fn new() -> Self {
        Self {
            op_lock: tokio::sync::Mutex::new(()),
        }
    }
}

/// First-party allowlist for the cookie commands. Only the app-shell webviews
/// that host the run-preview UI may invoke these commands.
///
/// Explicitly rejects (returns `false` for): the target-site child/detached
/// webviews (`preview-inspector-*`, see `preview_surface_label`), `agent-chat`,
/// `appshot-permissions`, and any remote/unknown label.
fn is_first_party_caller(label: &str) -> bool {
    label == "main" || crate::commands::is_preview_browser_window_label(label)
}

fn ensure_caller_allowed(webview: &Webview) -> Result<(), CookieCmdError> {
    if is_first_party_caller(webview.label()) {
        Ok(())
    } else {
        Err(CookieCmdError::Forbidden)
    }
}

fn ensure_supported() -> Result<(), CookieCmdError> {
    if store::feature_supported() {
        Ok(())
    } else {
        Err(CookieCmdError::UnsupportedPlatform)
    }
}

// ── Commands ──────────────────────────────────────────────────────────────

/// Discover importable browser profiles. Read-only; not serialized behind the
/// op mutex (no store mutation). macOS 14+ only.
#[tauri::command]
pub async fn list_importable_browsers(
    webview: Webview,
) -> Result<Vec<BrowserProfileDto>, CookieCmdError> {
    ensure_caller_allowed(&webview)?;
    ensure_supported()?;

    let profiles = tauri::async_runtime::spawn_blocking(browser_cookies::list_profiles)
        .await
        .map_err(|_| CookieCmdError::Io)?;

    Ok(profiles
        .into_iter()
        .map(|p| BrowserProfileDto {
            profile_handle: p.handle.0,
            browser: browser_kind_str(p.browser).to_string(),
            display_name: p.display_name,
            running: p.running,
        })
        .collect())
}

/// Extract cookies for one profile (by opaque handle) and inject them into the
/// dedicated preview store, counting only cookies that round-trip by identity.
///
/// `rename_all = "snake_case"` makes Tauri read the argument from the JS payload
/// key `profile_handle` (the frozen contract wire key). Without it, Tauri's
/// default would expect camelCase `profileHandle` and this required arg would
/// fail to deserialize.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_browser_cookies(
    app: AppHandle,
    webview: Webview,
    state: State<'_, AppState>,
    profile_handle: String,
) -> Result<ImportReport, CookieCmdError> {
    ensure_caller_allowed(&webview)?;
    ensure_supported()?;

    let _guard = state
        .browser_cookies
        .op_lock
        .try_lock()
        .map_err(|_| CookieCmdError::Busy)?;

    let handle = ProfileHandle(profile_handle);

    // Extraction (SQLite + Keychain, possibly a Keychain prompt) and WebKit
    // injection are marshaled off the async runtime; injection itself hops to
    // the main thread inside the adapter.
    tauri::async_runtime::spawn_blocking(move || -> Result<ImportReport, CookieCmdError> {
        let extraction = browser_cookies::extract(&handle)?;
        let discovered = extraction.cookies.len();
        let imported_verified = store::inject(&app, &extraction.cookies)?;
        let failed_injection = discovered.saturating_sub(imported_verified);

        Ok(ImportReport {
            discovered,
            imported_verified,
            skipped_expired: extraction.skipped_expired,
            skipped_decrypt: extraction.skipped_decrypt,
            skipped_parse: extraction.skipped_parse,
            skipped_unsupported: extraction.skipped_unsupported,
            failed_injection,
        })
    })
    .await
    .map_err(|_| CookieCmdError::Io)?
}

/// Remove cache-class data only (disk/memory/fetch) from the dedicated store.
#[tauri::command]
pub async fn clear_browser_cache(
    app: AppHandle,
    webview: Webview,
    state: State<'_, AppState>,
) -> Result<OkResponse, CookieCmdError> {
    ensure_caller_allowed(&webview)?;
    ensure_supported()?;

    let _guard = state
        .browser_cookies
        .op_lock
        .try_lock()
        .map_err(|_| CookieCmdError::Busy)?;

    tauri::async_runtime::spawn_blocking(move || store::clear_cache(&app))
        .await
        .map_err(|_| CookieCmdError::Io)??;

    Ok(OkResponse { ok: true })
}

/// Remove caches **and** localStorage / IndexedDB / service workers / WebSQL /
/// cookies from the dedicated store. Destructive ("may sign you out").
#[tauri::command]
pub async fn clear_browser_site_data(
    app: AppHandle,
    webview: Webview,
    state: State<'_, AppState>,
) -> Result<OkResponse, CookieCmdError> {
    ensure_caller_allowed(&webview)?;
    ensure_supported()?;

    let _guard = state
        .browser_cookies
        .op_lock
        .try_lock()
        .map_err(|_| CookieCmdError::Busy)?;

    tauri::async_runtime::spawn_blocking(move || store::clear_site_data(&app))
        .await
        .map_err(|_| CookieCmdError::Io)??;

    Ok(OkResponse { ok: true })
}

fn browser_kind_str(kind: browser_cookies::BrowserKind) -> &'static str {
    // PascalCase to match the frozen contract `BrowserProfileKind` union and the
    // frontend `browserLabel` allowlist / `cookieSync.browsers.*` i18n keys.
    match kind {
        browser_cookies::BrowserKind::Chrome => "Chrome",
        browser_cookies::BrowserKind::Edge => "Edge",
        browser_cookies::BrowserKind::Brave => "Brave",
        browser_cookies::BrowserKind::Firefox => "Firefox",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_party_allowlist_accepts_shell_surfaces() {
        assert!(is_first_party_caller("main"));
        assert!(is_first_party_caller("preview-browser"));
        assert!(is_first_party_caller("preview-browser-abc123"));
    }

    #[test]
    fn first_party_allowlist_rejects_target_site_and_others() {
        // Target-site child / detached webviews.
        assert!(!is_first_party_caller("preview-inspector"));
        assert!(!is_first_party_caller("preview-inspector-session-1"));
        // Other app surfaces not on the allowlist.
        assert!(!is_first_party_caller("agent-chat"));
        assert!(!is_first_party_caller("appshot-permissions"));
        // Unknown / remote.
        assert!(!is_first_party_caller("github.com"));
        assert!(!is_first_party_caller(""));
    }

    #[test]
    fn error_serializes_as_stable_code_object() {
        let json = serde_json::to_string(&CookieCmdError::BrowserRunning).unwrap();
        assert_eq!(json, r#"{"code":"BrowserRunning"}"#);
        let json = serde_json::to_string(&CookieCmdError::Forbidden).unwrap();
        assert_eq!(json, r#"{"code":"Forbidden"}"#);
    }

    #[test]
    fn extract_error_payload_does_not_leak() {
        let mapped: CookieCmdError = ExtractError::Io("/Users/secret/Cookies".to_string()).into();
        assert_eq!(mapped, CookieCmdError::Io);
        let json = serde_json::to_string(&mapped).unwrap();
        assert_eq!(json, r#"{"code":"Io"}"#);

        let mapped: CookieCmdError = ExtractError::InvalidSchema("moz_cookies".into()).into();
        assert_eq!(mapped, CookieCmdError::InvalidSchema);
    }
}
