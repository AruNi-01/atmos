//! High-fidelity extraction: row normalization, fidelity rules, and the public
//! `list_profiles` / `extract` entry points.

use crate::decrypt::{decrypt_chromium_value, DecryptError};
use crate::discovery::{discover_chromium_profiles, discover_firefox_profiles, handle_for};
use crate::keychain::safe_storage_passphrase;
use crate::sqlite::{
    open_readonly, read_chromium_full, read_firefox_full, ChromiumFullRow, FirefoxFullRow,
};
use crate::types::{
    BrowserKind, BrowserProfile, CookieIdentity, ExtractError, ExtractionResult, ImportedCookie,
    ProfileHandle, SameSite,
};

/// Chromium epoch (1601-01-01) to Unix epoch offset, in seconds.
const CHROMIUM_EPOCH_OFFSET_SECS: i64 = 11_644_473_600;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn chromium_same_site(raw: i64) -> SameSite {
    match raw {
        0 => SameSite::None,
        1 => SameSite::Lax,
        2 => SameSite::Strict,
        // -1 (and any unexpected value) => unspecified. Never coerce to None.
        _ => SameSite::Unspecified,
    }
}

fn firefox_same_site(raw: i64) -> SameSite {
    // Firefox stores 0 for cookies with no explicit SameSite attribute, 1 Lax,
    // 2 Strict. It has no distinct encoding for explicit `None`, so 0 maps to
    // `Unspecified` (never silently coerced to `None`).
    match raw {
        1 => SameSite::Lax,
        2 => SameSite::Strict,
        _ => SameSite::Unspecified,
    }
}

fn chromium_expires_to_unix(expires_utc: i64) -> i64 {
    // expires_utc is microseconds since 1601-01-01.
    expires_utc / 1_000_000 - CHROMIUM_EPOCH_OFFSET_SECS
}

/// Enforce `__Host-` / `__Secure-` prefix rules. Returns `true` if the cookie
/// shape is legal for its prefix (or has no special prefix).
fn prefix_rules_ok(name: &str, host_only: bool, secure: bool, path: &str) -> bool {
    if let Some(_rest) = name.strip_prefix("__Host-") {
        // __Host- requires: Secure, host-only (no Domain), Path exactly "/".
        return secure && host_only && path == "/";
    }
    if name.starts_with("__Secure-") {
        return secure;
    }
    true
}

/// Normalize decrypted Chromium rows into an [`ExtractionResult`]. Pure and
/// unit-testable: every row lands in `cookies` or exactly one `skipped_*`.
pub(crate) fn normalize_chromium_rows(
    rows: Vec<ChromiumFullRow>,
    passphrase: &str,
    now: i64,
) -> ExtractionResult {
    let mut result = ExtractionResult::default();

    for row in rows {
        // 1. Partitioned / CHIPS: safe-skip (never downgrade).
        if row.has_partition {
            result.skipped_unsupported += 1;
            continue;
        }

        let host_only = !row.host_key.starts_with('.');
        let same_site = chromium_same_site(row.samesite);
        let has_expires = row.is_persistent && row.expires_utc != 0;
        let expires = if has_expires {
            Some(chromium_expires_to_unix(row.expires_utc))
        } else {
            None
        };

        // 2. Expiry (no decryption needed).
        if let Some(expiry) = expires {
            if expiry <= now {
                result.skipped_expired += 1;
                continue;
            }
        }

        // 3. Illegal prefix shape.
        if !prefix_rules_ok(&row.name, host_only, row.is_secure, &row.path) {
            result.skipped_unsupported += 1;
            continue;
        }

        // 4. Value: prefer plaintext column, else decrypt the BLOB.
        let value = if !row.value_plain.is_empty() {
            row.value_plain.clone()
        } else if !row.encrypted_value.is_empty() {
            match decrypt_chromium_value(&row.encrypted_value, &row.host_key, passphrase) {
                Ok(v) => v,
                Err(DecryptError::Utf8) => {
                    result.skipped_parse += 1;
                    continue;
                }
                Err(_) => {
                    result.skipped_decrypt += 1;
                    continue;
                }
            }
        } else {
            // No value at all.
            result.skipped_parse += 1;
            continue;
        };

        result.cookies.push(ImportedCookie {
            identity: CookieIdentity {
                name: row.name,
                domain: row.host_key,
                path: row.path,
                partition_key: None,
            },
            value,
            host_only,
            secure: row.is_secure,
            http_only: row.is_httponly,
            same_site,
            expires,
            has_expires,
        });
    }

    result
}

/// Normalize Firefox rows (plaintext values, no decryption).
pub(crate) fn normalize_firefox_rows(rows: Vec<FirefoxFullRow>, now: i64) -> ExtractionResult {
    let mut result = ExtractionResult::default();

    for row in rows {
        let host_only = !row.host.starts_with('.');
        let same_site = firefox_same_site(row.same_site);
        let has_expires = row.expiry != 0;
        let expires = if has_expires { Some(row.expiry) } else { None };

        if let Some(expiry) = expires {
            if expiry <= now {
                result.skipped_expired += 1;
                continue;
            }
        }

        if !prefix_rules_ok(&row.name, host_only, row.is_secure, &row.path) {
            result.skipped_unsupported += 1;
            continue;
        }

        if row.value.is_empty() {
            result.skipped_parse += 1;
            continue;
        }

        result.cookies.push(ImportedCookie {
            identity: CookieIdentity {
                name: row.name,
                domain: row.host,
                path: row.path,
                partition_key: None,
            },
            value: row.value,
            host_only,
            secure: row.is_secure,
            http_only: row.is_httponly,
            same_site,
            expires,
            has_expires,
        });
    }

    result
}

/// Discover importable browser profiles (the four supported kinds only).
pub fn list_profiles() -> Vec<BrowserProfile> {
    if cfg!(not(target_os = "macos")) {
        return Vec::new();
    }

    let mut profiles = Vec::new();
    for p in discover_chromium_profiles() {
        if let Some(kind) = p.kind {
            profiles.push(BrowserProfile {
                handle: handle_for(&p.cookie_db),
                browser: kind,
                display_name: p.display_name,
                running: p.running,
            });
        }
    }
    for p in discover_firefox_profiles() {
        profiles.push(BrowserProfile {
            handle: handle_for(&p.cookie_db),
            browser: BrowserKind::Firefox,
            display_name: p.display_name,
            running: p.running,
        });
    }
    profiles
}

/// Extract cookies for one profile, resolved by its opaque handle.
///
/// MVP requires the source browser closed: a running browser returns
/// `BrowserRunning`; a busy/locked DB returns `DatabaseBusy`.
pub fn extract(handle: &ProfileHandle) -> Result<ExtractionResult, ExtractError> {
    if cfg!(not(target_os = "macos")) {
        return Err(ExtractError::UnsupportedPlatform);
    }

    // Try Chromium profiles first.
    for p in discover_chromium_profiles() {
        if p.kind.is_none() {
            continue; // not an importable kind
        }
        if handle_for(&p.cookie_db) != *handle {
            continue;
        }
        if p.running {
            return Err(ExtractError::BrowserRunning);
        }
        let conn = open_readonly(&p.cookie_db)?;
        let rows = read_chromium_full(&conn)?;
        let passphrase = safe_storage_passphrase(&p.safe_storage_service)?;
        return Ok(normalize_chromium_rows(rows, &passphrase, now_unix()));
    }

    // Then Firefox.
    for p in discover_firefox_profiles() {
        if handle_for(&p.cookie_db) != *handle {
            continue;
        }
        if p.running {
            return Err(ExtractError::BrowserRunning);
        }
        let conn = open_readonly(&p.cookie_db)?;
        let rows = read_firefox_full(&conn)?;
        return Ok(normalize_firefox_rows(rows, now_unix()));
    }

    Err(ExtractError::ProfileNotFound)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decrypt::encrypt_chromium_value_v10;

    const PASS: &str = "test-passphrase";
    const NOW: i64 = 2_000_000_000; // fixed "now" for deterministic tests

    fn chromium_row(name: &str, host: &str, plaintext: &str) -> ChromiumFullRow {
        ChromiumFullRow {
            host_key: host.to_string(),
            name: name.to_string(),
            encrypted_value: encrypt_chromium_value_v10(plaintext, host, PASS, false),
            value_plain: String::new(),
            path: "/".to_string(),
            expires_utc: 0,
            is_secure: true,
            is_httponly: false,
            samesite: -1,
            is_persistent: false,
            has_partition: false,
        }
    }

    #[test]
    fn samesite_four_state_mapping_preserves_unspecified_vs_none() {
        let states = [
            (-1_i64, SameSite::Unspecified),
            (0, SameSite::None),
            (1, SameSite::Lax),
            (2, SameSite::Strict),
        ];
        for (raw, expected) in states {
            let mut row = chromium_row("c", "example.com", "v");
            row.samesite = raw;
            let out = normalize_chromium_rows(vec![row], PASS, NOW);
            assert_eq!(out.cookies.len(), 1, "raw={raw}");
            assert_eq!(out.cookies[0].same_site, expected, "raw={raw}");
        }
        // Explicitly assert the two are not conflated.
        assert_ne!(SameSite::Unspecified, SameSite::None);
    }

    #[test]
    fn per_row_decrypt_failure_is_accounted_and_does_not_abort() {
        let good = chromium_row("good", "example.com", "ok");
        // A row encrypted with a different passphrase -> decrypt failure.
        let mut bad = chromium_row("bad", "example.com", "secret");
        bad.encrypted_value = encrypt_chromium_value_v10("secret", "example.com", "other", false);
        // A row with an unsupported (non v10/v11) blob.
        let mut unsupported = chromium_row("weird", "example.com", "x");
        unsupported.encrypted_value = b"v20-abe-only".to_vec();

        let out = normalize_chromium_rows(vec![good, bad, unsupported], PASS, NOW);
        assert_eq!(out.cookies.len(), 1);
        assert_eq!(out.cookies[0].identity.name, "good");
        assert_eq!(out.skipped_decrypt, 2);
        assert_eq!(out.skipped_expired, 0);
        assert_eq!(out.skipped_unsupported, 0);
    }

    #[test]
    fn host_prefix_illegal_shape_is_safe_skipped() {
        // __Host- with a Domain cookie (leading dot) is illegal -> unsupported.
        let mut illegal = chromium_row("__Host-sid", ".example.com", "v");
        illegal.is_secure = true;
        illegal.path = "/".to_string();
        // legal __Host- cookie: host-only, secure, path "/".
        let legal = chromium_row("__Host-ok", "example.com", "v");

        let out = normalize_chromium_rows(vec![illegal, legal], PASS, NOW);
        assert_eq!(out.skipped_unsupported, 1);
        assert_eq!(out.cookies.len(), 1);
        assert_eq!(out.cookies[0].identity.name, "__Host-ok");
    }

    #[test]
    fn secure_prefix_requires_secure_flag() {
        let mut insecure = chromium_row("__Secure-tok", "example.com", "v");
        insecure.is_secure = false;
        let out = normalize_chromium_rows(vec![insecure], PASS, NOW);
        assert_eq!(out.skipped_unsupported, 1);
        assert!(out.cookies.is_empty());
    }

    #[test]
    fn partitioned_cookies_are_safe_skipped_not_downgraded() {
        let mut partitioned = chromium_row("pc", "example.com", "v");
        partitioned.has_partition = true;
        let out = normalize_chromium_rows(vec![partitioned], PASS, NOW);
        assert_eq!(out.skipped_unsupported, 1);
        assert!(out.cookies.is_empty());
    }

    #[test]
    fn expiry_session_vs_persistent_classification() {
        // Session cookie: not persistent, expires_utc == 0.
        let session = chromium_row("s", "example.com", "v");

        // Persistent, far future.
        let mut future = chromium_row("f", "example.com", "v");
        future.is_persistent = true;
        // future unix ~ NOW + 1000 => chromium micros since 1601.
        future.expires_utc = ((NOW + 1000) + CHROMIUM_EPOCH_OFFSET_SECS) * 1_000_000;

        // Persistent, already expired.
        let mut expired = chromium_row("e", "example.com", "v");
        expired.is_persistent = true;
        expired.expires_utc = ((NOW - 1000) + CHROMIUM_EPOCH_OFFSET_SECS) * 1_000_000;

        let out = normalize_chromium_rows(vec![session, future, expired], PASS, NOW);
        assert_eq!(out.skipped_expired, 1);
        assert_eq!(out.cookies.len(), 2);

        let s = out.cookies.iter().find(|c| c.identity.name == "s").unwrap();
        assert!(!s.has_expires);
        assert_eq!(s.expires, None);

        let f = out.cookies.iter().find(|c| c.identity.name == "f").unwrap();
        assert!(f.has_expires);
        assert_eq!(f.expires, Some(NOW + 1000));
    }

    #[test]
    fn host_only_derived_from_leading_dot() {
        let host_only = chromium_row("a", "example.com", "v");
        let domain = chromium_row("b", ".example.com", "v");
        let out = normalize_chromium_rows(vec![host_only, domain], PASS, NOW);
        let a = out.cookies.iter().find(|c| c.identity.name == "a").unwrap();
        let b = out.cookies.iter().find(|c| c.identity.name == "b").unwrap();
        assert!(a.host_only);
        assert!(!b.host_only);
    }

    #[test]
    fn firefox_normalization_maps_samesite_and_expiry() {
        let rows = vec![
            FirefoxFullRow {
                host: ".example.com".into(),
                name: "lax".into(),
                value: "1".into(),
                path: "/".into(),
                expiry: NOW + 500,
                is_secure: false,
                is_httponly: true,
                same_site: 1,
            },
            FirefoxFullRow {
                host: "example.com".into(),
                name: "unspec".into(),
                value: "2".into(),
                path: "/".into(),
                expiry: 0, // session
                is_secure: false,
                is_httponly: false,
                same_site: 0,
            },
            FirefoxFullRow {
                host: "example.com".into(),
                name: "old".into(),
                value: "3".into(),
                path: "/".into(),
                expiry: NOW - 10, // expired
                is_secure: false,
                is_httponly: false,
                same_site: 2,
            },
        ];
        let out = normalize_firefox_rows(rows, NOW);
        assert_eq!(out.skipped_expired, 1);
        assert_eq!(out.cookies.len(), 2);

        let lax = out.cookies.iter().find(|c| c.identity.name == "lax").unwrap();
        assert_eq!(lax.same_site, SameSite::Lax);
        assert!(!lax.host_only);
        assert!(lax.has_expires);

        let unspec = out.cookies.iter().find(|c| c.identity.name == "unspec").unwrap();
        assert_eq!(unspec.same_site, SameSite::Unspecified);
        assert!(unspec.host_only);
        assert!(!unspec.has_expires);
    }
}
