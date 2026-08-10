#![allow(dead_code)]

//! Provider-domain cookie filtering + Cookie-header assembly for `quota-usage`.
//!
//! The generic discovery / snapshot / typed-read / Keychain / decrypt
//! primitives now live in the `browser-cookies` leaf crate (APP-041). This
//! module keeps only the `quota-usage`-specific concerns: env/file overrides,
//! provider domain + cookie-name filtering, session detection, and assembling
//! the `Cookie:` request header consumed by the usage providers.

use std::env;
use std::fs;
use std::path::PathBuf;

use browser_cookies::{
    chromium_profile_candidates, decrypt_chromium_value, firefox_profile_candidates,
    read_chromium_filtered, read_firefox_filtered, safe_storage_passphrase,
    ChromiumProfileCandidate, ExtractError, FirefoxProfileCandidate,
};

use crate::constants::COMMANDCODE_COOKIE_NAMES;
use crate::models::ProviderError;

fn map_extract_error(error: ExtractError) -> ProviderError {
    ProviderError::Fetch(format!("browser cookie extraction failed: {error}"))
}

pub(crate) fn load_cookie_header(
    env_keys: &[&str],
    file_stem: Option<&str>,
) -> Result<Option<String>, ProviderError> {
    for key in env_keys {
        if let Some(value) = env::var(key).ok().filter(|value| !value.trim().is_empty()) {
            return Ok(Some(normalize_cookie_header(&value)));
        }
    }

    let Some(file_stem) = file_stem else {
        return Ok(None);
    };
    let path = cookie_override_path(file_stem);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    Ok(Some(normalize_cookie_header(&contents)))
}

pub(crate) fn normalize_cookie_header(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("Cookie:")
        .trim_start_matches("cookie:")
        .trim()
        .to_string()
}

pub(crate) fn cookie_override_path(file_stem: &str) -> PathBuf {
    let file_name = format!("{file_stem}.cookie");
    crate::paths::resolve_data_file(&file_name).unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".atmos")
            .join("data")
            .join("quota-usage")
            .join(file_name)
    })
}

#[derive(Debug, Clone)]
pub struct BrowserCookieSource {
    pub cookie_header: String,
    pub source_label: String,
}

pub(crate) fn load_amp_session_cookie_source(
    browser_source: Option<&BrowserCookieSource>,
) -> Result<BrowserCookieSource, ProviderError> {
    if let Some(cookie_header) = load_cookie_header(
        &["ATMOS_USAGE_AMP_COOKIE_HEADER", "AMP_COOKIE_HEADER"],
        Some("amp"),
    )? {
        return Ok(BrowserCookieSource {
            cookie_header,
            source_label: "manual cookie header".to_string(),
        });
    }

    if let Some(source) = browser_source.cloned() {
        return Ok(source);
    }

    load_amp_browser_cookie_source()?
        .ok_or_else(|| ProviderError::Fetch("Amp session cookie not found".to_string()))
}

pub(crate) fn load_amp_browser_cookie_source() -> Result<Option<BrowserCookieSource>, ProviderError>
{
    load_browser_cookie_source(&["ampcode.com", "www.ampcode.com"], &["session"])
}

pub(crate) fn load_factory_session_cookie_source(
    browser_source: Option<&BrowserCookieSource>,
) -> Result<BrowserCookieSource, ProviderError> {
    if let Some(cookie_header) = load_cookie_header(
        &["ATMOS_USAGE_FACTORY_COOKIE_HEADER", "FACTORY_COOKIE_HEADER"],
        Some("factory"),
    )? {
        return Ok(BrowserCookieSource {
            cookie_header,
            source_label: "manual cookie header".to_string(),
        });
    }

    if let Some(source) = browser_source.cloned() {
        return Ok(source);
    }

    load_factory_browser_cookie_source()?
        .ok_or_else(|| ProviderError::Fetch("Factory session cookie not found".to_string()))
}

pub(crate) fn load_factory_browser_cookie_source(
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    load_browser_cookie_source_with_session_detection(
        &["factory.ai", "app.factory.ai", "auth.factory.ai"],
        &[
            "wos-session",
            "__Secure-next-auth.session-token",
            "next-auth.session-token",
            "__Secure-authjs.session-token",
            "__Host-authjs.csrf-token",
            "authjs.session-token",
            "session",
            "access-token",
        ],
    )
}

pub(crate) fn load_mimo_browser_cookie_source() -> Result<Option<BrowserCookieSource>, ProviderError>
{
    load_browser_cookie_source_with_session_detection(
        &["platform.xiaomimimo.com", "xiaomimimo.com"],
        &["api-platform_serviceToken"],
    )
}

pub(crate) fn load_minimax_browser_cookie_source(
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    load_browser_cookie_source_with_session_detection(
        &[
            "platform.minimax.io",
            "openplatform.minimax.io",
            "minimax.io",
            "platform.minimaxi.com",
            "openplatform.minimaxi.com",
            "minimaxi.com",
        ],
        &["HERTZ-SESSION"],
    )
}

pub(crate) fn load_zai_browser_cookie_source() -> Result<Option<BrowserCookieSource>, ProviderError>
{
    load_browser_cookie_source_with_session_detection(
        &[
            "bigmodel.cn",
            "open.bigmodel.cn",
            "chat.z.ai",
            "z.ai",
            "api.z.ai",
        ],
        &["bigmodel_token_production", "token", "TDC_itoken"],
    )
}

pub(crate) fn load_zed_browser_cookie_source() -> Result<Option<BrowserCookieSource>, ProviderError>
{
    load_browser_cookie_source(
        &["zed.dev", "cloud.zed.dev", "dashboard.zed.dev"],
        &["zed.session"],
    )
}

pub(crate) fn load_opencode_browser_cookie_source(
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    load_browser_cookie_source(&["opencode.ai", "www.opencode.ai"], &["auth"])
}

pub(crate) fn load_workos_browser_cookie_source(
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    load_browser_cookie_source_with_session_detection(
        &["workos.com"],
        &["__wuid", "__kduid", "wos-session"],
    )
}

pub(crate) fn load_commandcode_browser_cookie_source(
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    load_browser_cookie_source_with_session_detection(
        &["commandcode.ai", "www.commandcode.ai"],
        COMMANDCODE_COOKIE_NAMES,
    )
}

pub fn load_cursor_session_token() -> Result<Option<BrowserCookieSource>, ProviderError> {
    for key in &["ATMOS_CURSOR_SESSION_TOKEN", "CURSOR_SESSION_TOKEN"] {
        if let Some(value) = env::var(key).ok().filter(|v| !v.trim().is_empty()) {
            return Ok(Some(BrowserCookieSource {
                cookie_header: format!("WorkosCursorSessionToken={}", value.trim()),
                source_label: format!("env ${key}"),
            }));
        }
    }

    let cookie_path = cookie_override_path("cursor");
    if cookie_path.exists() {
        let contents = fs::read_to_string(&cookie_path)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", cookie_path.display())))?;
        let value = contents.trim();
        if !value.is_empty() {
            let cookie_header = if value.contains("WorkosCursorSessionToken") {
                normalize_cookie_header(value)
            } else {
                format!("WorkosCursorSessionToken={value}")
            };
            return Ok(Some(BrowserCookieSource {
                cookie_header,
                source_label: format!("{}", cookie_path.display()),
            }));
        }
    }

    load_browser_cookie_source(
        &["cursor.com", "www.cursor.com"],
        &["WorkosCursorSessionToken", "team_id"],
    )
}

fn load_browser_cookie_source(
    domains: &[&str],
    cookie_names: &[&str],
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let mut last_error = None;

    for candidate in chromium_profile_candidates() {
        match load_chromium_cookie_source(&candidate, domains, Some(cookie_names), None) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    for candidate in firefox_profile_candidates() {
        match load_firefox_cookie_source(&candidate, domains, Some(cookie_names), None) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    if let Some(error) = last_error {
        return Err(error);
    }

    Ok(None)
}

fn load_browser_cookie_source_with_session_detection(
    domains: &[&str],
    session_cookie_names: &[&str],
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let mut last_error = None;

    for candidate in chromium_profile_candidates() {
        match load_chromium_cookie_source(&candidate, domains, None, Some(session_cookie_names)) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    for candidate in firefox_profile_candidates() {
        match load_firefox_cookie_source(&candidate, domains, None, Some(session_cookie_names)) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    if let Some(error) = last_error {
        return Err(error);
    }

    Ok(None)
}

fn load_chromium_cookie_source(
    candidate: &ChromiumProfileCandidate,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
    required_cookie_names: Option<&[&str]>,
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let rows = read_chromium_filtered(&candidate.cookie_db, domains, cookie_names)
        .map_err(map_extract_error)?;
    if rows.is_empty() {
        return Ok(None);
    }

    // Lazy Keychain access: only fetch the Safe Storage passphrase when a row
    // actually needs decryption. The passphrase is memoized in browser-cookies
    // for the process lifetime so multi-provider quota-usage scans do not re-prompt.
    let mut passphrase: Option<String> = None;
    let mut cookie_pairs: Vec<(String, String)> = Vec::new();
    for row in rows {
        let value = if !row.value.is_empty() {
            row.value
        } else if !row.encrypted_value.is_empty() {
            let pass = match &passphrase {
                Some(p) => p.clone(),
                None => {
                    let fetched = safe_storage_passphrase(&candidate.safe_storage_service)
                        .map_err(map_extract_error)?;
                    passphrase = Some(fetched.clone());
                    fetched
                }
            };
            match decrypt_chromium_value(&row.encrypted_value, &row.host_key, &pass) {
                Ok(value) => value,
                Err(_) => continue,
            }
        } else {
            continue;
        };
        if value.is_empty()
            || cookie_pairs
                .iter()
                .any(|(existing, _)| existing == &row.name)
        {
            continue;
        }
        cookie_pairs.push((row.name, value));
    }

    finalize_cookie_source(cookie_pairs, required_cookie_names, candidate.label.clone())
}

fn load_firefox_cookie_source(
    candidate: &FirefoxProfileCandidate,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
    required_cookie_names: Option<&[&str]>,
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let rows = read_firefox_filtered(&candidate.cookie_db, domains, cookie_names)
        .map_err(map_extract_error)?;
    if rows.is_empty() {
        return Ok(None);
    }

    let mut cookie_pairs: Vec<(String, String)> = Vec::new();
    for row in rows {
        if row.value.is_empty()
            || cookie_pairs
                .iter()
                .any(|(existing, _)| existing == &row.name)
        {
            continue;
        }
        cookie_pairs.push((row.name, row.value));
    }

    finalize_cookie_source(cookie_pairs, required_cookie_names, candidate.label.clone())
}

/// Apply the required-cookie gate and assemble the `Cookie:` header value.
fn finalize_cookie_source(
    cookie_pairs: Vec<(String, String)>,
    required_cookie_names: Option<&[&str]>,
    source_label: String,
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    if let Some(required_cookie_names) = required_cookie_names {
        let has_required_cookie = cookie_pairs.iter().any(|(name, _)| {
            required_cookie_names
                .iter()
                .any(|required| required == name)
        });
        if !has_required_cookie {
            return Ok(None);
        }
    }

    if cookie_pairs.is_empty() {
        return Ok(None);
    }

    Ok(Some(BrowserCookieSource {
        cookie_header: cookie_pairs
            .into_iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; "),
        source_label,
    }))
}
