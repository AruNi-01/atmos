use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use aes::Aes128;
use cbc::Decryptor;
use pbkdf2::pbkdf2_hmac;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::ProviderError;
use crate::support::{run_command, run_sqlite_query};

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
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("ai-usage")
        .join(format!("{file_stem}.cookie"))
}

#[derive(Debug, Clone)]
pub(crate) struct BrowserCookieSource {
    pub(crate) cookie_header: String,
    pub(crate) source_label: String,
}

#[derive(Debug, Clone)]
struct ChromiumCookieDbCandidate {
    label: String,
    path: PathBuf,
    safe_storage_service: &'static str,
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
        &["bigmodel.cn", "open.bigmodel.cn", "chat.z.ai", "z.ai", "api.z.ai"],
        &["bigmodel_token_production", "token", "TDC_itoken"],
    )
}

pub(crate) fn load_workos_browser_cookie_source() -> Result<Option<BrowserCookieSource>, ProviderError>
{
    load_browser_cookie_source_with_session_detection(
        &["workos.com"],
        &["__wuid", "__kduid", "wos-session"],
    )
}

fn load_browser_cookie_source(
    domains: &[&str],
    cookie_names: &[&str],
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let mut last_error = None;

    for candidate in chromium_cookie_db_candidates() {
        match load_chromium_cookie_source(&candidate, domains, Some(cookie_names), None) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    for (label, path) in firefox_cookie_db_candidates() {
        match load_firefox_cookie_source(&label, &path, domains, Some(cookie_names), None) {
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

    for candidate in chromium_cookie_db_candidates() {
        match load_chromium_cookie_source(
            &candidate,
            domains,
            None,
            Some(session_cookie_names),
        ) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    for (label, path) in firefox_cookie_db_candidates() {
        match load_firefox_cookie_source(
            &label,
            &path,
            domains,
            None,
            Some(session_cookie_names),
        ) {
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
    candidate: &ChromiumCookieDbCandidate,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
    required_cookie_names: Option<&[&str]>,
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let rows = query_chromium_cookie_rows(&candidate.path, domains, cookie_names)?;
    if rows.is_empty() {
        return Ok(None);
    }

    let passphrase = load_safe_storage_passphrase(candidate.safe_storage_service)?;
    let mut cookie_pairs = Vec::new();
    for (host, name, encrypted_hex, plain_value) in rows {
        let value = if !plain_value.is_empty() {
            plain_value
        } else if !encrypted_hex.is_empty() {
            decrypt_chromium_cookie_value(&encrypted_hex, &host, &passphrase)?
        } else {
            continue;
        };
        if value.is_empty() || cookie_pairs.iter().any(|(existing, _)| existing == &name) {
            continue;
        }
        cookie_pairs.push((name, value));
    }

    if let Some(required_cookie_names) = required_cookie_names {
        let has_required_cookie = cookie_pairs.iter().any(|(name, _)| {
            required_cookie_names.iter().any(|required| required == name)
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
        source_label: candidate.label.clone(),
    }))
}

fn load_firefox_cookie_source(
    label: &str,
    path: &Path,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
    required_cookie_names: Option<&[&str]>,
) -> Result<Option<BrowserCookieSource>, ProviderError> {
    let rows = query_firefox_cookie_rows(path, domains, cookie_names)?;
    if rows.is_empty() {
        return Ok(None);
    }

    let mut cookie_pairs = Vec::new();
    for (_, name, value) in rows {
        if value.is_empty() || cookie_pairs.iter().any(|(existing, _)| existing == &name) {
            continue;
        }
        cookie_pairs.push((name, value));
    }

    if let Some(required_cookie_names) = required_cookie_names {
        let has_required_cookie = cookie_pairs.iter().any(|(name, _)| {
            required_cookie_names.iter().any(|required| required == name)
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
        source_label: label.to_string(),
    }))
}

fn chromium_cookie_db_candidates() -> Vec<ChromiumCookieDbCandidate> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };

    let bases = [
        (
            "Google Chrome",
            "Chrome Safe Storage",
            home.join("Library/Application Support/Google/Chrome"),
        ),
        (
            "Google Chrome Beta",
            "Chrome Safe Storage",
            home.join("Library/Application Support/Google/Chrome Beta"),
        ),
        (
            "Google Chrome Canary",
            "Chrome Safe Storage",
            home.join("Library/Application Support/Google/Chrome Canary"),
        ),
        (
            "Microsoft Edge",
            "Microsoft Edge Safe Storage",
            home.join("Library/Application Support/Microsoft Edge"),
        ),
        (
            "Microsoft Edge Beta",
            "Microsoft Edge Safe Storage",
            home.join("Library/Application Support/Microsoft Edge Beta"),
        ),
        (
            "Microsoft Edge Dev",
            "Microsoft Edge Safe Storage",
            home.join("Library/Application Support/Microsoft Edge Dev"),
        ),
        (
            "Microsoft Edge Canary",
            "Microsoft Edge Safe Storage",
            home.join("Library/Application Support/Microsoft Edge Canary"),
        ),
        (
            "Arc",
            "Arc Safe Storage",
            home.join("Library/Application Support/Arc/User Data"),
        ),
        (
            "Arc Beta",
            "Arc Safe Storage",
            home.join("Library/Application Support/Arc Beta/User Data"),
        ),
        (
            "Arc Canary",
            "Arc Safe Storage",
            home.join("Library/Application Support/Arc Canary/User Data"),
        ),
        (
            "Chromium",
            "Chromium Safe Storage",
            home.join("Library/Application Support/Chromium"),
        ),
        (
            "Brave",
            "Brave Safe Storage",
            home.join("Library/Application Support/BraveSoftware/Brave-Browser"),
        ),
        (
            "Brave Beta",
            "Brave Safe Storage",
            home.join("Library/Application Support/BraveSoftware/Brave-Browser-Beta"),
        ),
        (
            "Helium",
            "Helium Safe Storage",
            home.join("Library/Application Support/net.imput.helium"),
        ),
        (
            "Dia",
            "Dia Safe Storage",
            home.join("Library/Application Support/com.electron.dia"),
        ),
        (
            "ChatGPT Atlas",
            "ChatGPT Atlas Safe Storage",
            home.join("Library/Application Support/ChatGPT Atlas"),
        ),
    ];

    let mut candidates = Vec::new();
    for (browser_label, safe_storage_service, base) in bases {
        if !base.exists() {
            continue;
        }
        let mut profile_dirs = profile_dirs_with_cookie_db(&base, "Cookies");
        if profile_dirs.is_empty() {
            continue;
        }
        profile_dirs.sort_by_key(|(profile_name, _)| chromium_profile_priority(profile_name));
        candidates.extend(profile_dirs.into_iter().map(|(profile_name, path)| {
            ChromiumCookieDbCandidate {
                label: format!("{browser_label} / {profile_name}"),
                path,
                safe_storage_service,
            }
        }));
    }
    candidates
}

fn firefox_cookie_db_candidates() -> Vec<(String, PathBuf)> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let root = home.join("Library/Application Support/Firefox/Profiles");
    if !root.exists() {
        return Vec::new();
    }

    profile_dirs_with_cookie_db(&root, "cookies.sqlite")
        .into_iter()
        .map(|(profile_name, path)| (format!("Firefox / {profile_name}"), path))
        .collect()
}

fn profile_dirs_with_cookie_db(root: &Path, cookie_file_name: &str) -> Vec<(String, PathBuf)> {
    let mut profiles = Vec::new();

    let direct_path = root.join(cookie_file_name);
    if direct_path.exists() {
        profiles.push(("Default".to_string(), direct_path));
    }

    let Ok(entries) = fs::read_dir(root) else {
        return profiles;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let cookie_path = path.join(cookie_file_name);
        if !cookie_path.exists() {
            continue;
        }
        let profile_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Profile")
            .to_string();
        profiles.push((profile_name, cookie_path));
    }

    profiles
}

fn chromium_profile_priority(profile_name: &str) -> (usize, String) {
    let lower = profile_name.to_lowercase();
    let rank = match lower.as_str() {
        "default" => 0,
        "profile 1" => 1,
        "profile 2" => 2,
        "guest profile" => 90,
        _ => 10,
    };
    (rank, lower)
}

fn query_chromium_cookie_rows(
    path: &Path,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
) -> Result<Vec<(String, String, String, String)>, ProviderError> {
    let host_filter = sql_in_clause_values(&browser_cookie_domain_candidates(domains));
    let query = if let Some(cookie_names) = cookie_names {
        let cookie_filter = sql_in_clause_values(
            &cookie_names
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
        format!(
            "select host_key || char(9) || name || char(9) || hex(encrypted_value) || char(9) || value from cookies where host_key in ({host_filter}) and name in ({cookie_filter}) order by last_access_utc desc;"
        )
    } else {
        format!(
            "select host_key || char(9) || name || char(9) || hex(encrypted_value) || char(9) || value from cookies where host_key in ({host_filter}) order by last_access_utc desc;"
        )
    };

    run_sqlite_query(path, &query).map(|output| {
        output
            .lines()
            .filter_map(|line| {
                let mut parts = line.splitn(4, '\t');
                Some((
                    parts.next()?.to_string(),
                    parts.next()?.to_string(),
                    parts.next().unwrap_or_default().to_string(),
                    parts.next().unwrap_or_default().to_string(),
                ))
            })
            .collect()
    })
}

fn query_firefox_cookie_rows(
    path: &Path,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
) -> Result<Vec<(String, String, String)>, ProviderError> {
    let host_filter = sql_in_clause_values(&browser_cookie_domain_candidates(domains));
    let query = if let Some(cookie_names) = cookie_names {
        let cookie_filter = sql_in_clause_values(
            &cookie_names
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
        format!(
            "select host || char(9) || name || char(9) || value from moz_cookies where host in ({host_filter}) and name in ({cookie_filter}) order by lastAccessed desc;"
        )
    } else {
        format!(
            "select host || char(9) || name || char(9) || value from moz_cookies where host in ({host_filter}) order by lastAccessed desc;"
        )
    };

    run_sqlite_query(path, &query).map(|output| {
        output
            .lines()
            .filter_map(|line| {
                let mut parts = line.splitn(3, '\t');
                Some((
                    parts.next()?.to_string(),
                    parts.next()?.to_string(),
                    parts.next().unwrap_or_default().to_string(),
                ))
            })
            .collect()
    })
}

fn browser_cookie_domain_candidates(domains: &[&str]) -> Vec<String> {
    let mut values = Vec::new();
    for domain in domains {
        let trimmed = domain.trim().trim_start_matches('.').to_string();
        if trimmed.is_empty() {
            continue;
        }
        if !values.contains(&trimmed) {
            values.push(trimmed.clone());
        }
        let dotted = format!(".{trimmed}");
        if !values.contains(&dotted) {
            values.push(dotted);
        }
    }
    values
}

fn sql_in_clause_values(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("'{}'", value.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",")
}

fn load_safe_storage_passphrase(service_name: &str) -> Result<String, ProviderError> {
    let output = run_command(
        "security",
        &["find-generic-password", "-s", service_name, "-w"],
    )?;
    let value = output.trim().to_string();
    if value.is_empty() {
        return Err(ProviderError::Fetch(format!(
            "Keychain item {service_name} is empty"
        )));
    }
    Ok(value)
}

fn decrypt_chromium_cookie_value(
    encrypted_hex: &str,
    host_key: &str,
    passphrase: &str,
) -> Result<String, ProviderError> {
    let encrypted = hex::decode(encrypted_hex.trim()).map_err(|error| {
        ProviderError::Fetch(format!("Invalid Chromium cookie payload: {error}"))
    })?;
    let Some(ciphertext) = encrypted
        .strip_prefix(b"v10")
        .or_else(|| encrypted.strip_prefix(b"v11"))
    else {
        return Err(ProviderError::Fetch(
            "Unsupported Chromium cookie format".to_string(),
        ));
    };

    let key = chromium_cookie_key(passphrase);
    let iv = [b' '; 16];
    let mut buffer = ciphertext.to_vec();
    let plaintext = Decryptor::<Aes128>::new(&key.into(), &iv.into())
        .decrypt_padded_mut::<Pkcs7>(&mut buffer)
        .map_err(|error| ProviderError::Fetch(format!("Chromium cookie decrypt failed: {error}")))?
        .to_vec();

    let plaintext = strip_chromium_cookie_host_prefix(host_key, plaintext);
    String::from_utf8(plaintext)
        .map_err(|error| ProviderError::Fetch(format!("Chromium cookie utf8 failed: {error}")))
}

fn chromium_cookie_key(passphrase: &str) -> [u8; 16] {
    let mut key = [0u8; 16];
    pbkdf2_hmac::<Sha1>(passphrase.as_bytes(), b"saltysalt", 1003, &mut key);
    key
}

fn strip_chromium_cookie_host_prefix(host_key: &str, plaintext: Vec<u8>) -> Vec<u8> {
    if plaintext.len() <= 32 {
        return plaintext;
    }
    let normalized_host = host_key.trim_start_matches('.');
    let digest = Sha256::digest(normalized_host.as_bytes());
    if plaintext[..32] == digest[..] {
        return plaintext[32..].to_vec();
    }
    plaintext
}
