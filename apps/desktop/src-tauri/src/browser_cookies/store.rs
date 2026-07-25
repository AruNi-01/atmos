//! `PreviewCookieStore` adapter.
//!
//! All native WebKit work goes through here so injection and clearing can never
//! diverge on which store they touch: everything resolves the **dedicated**
//! `WKWebsiteDataStore(forIdentifier:)` for [`PREVIEW_DATA_STORE_ID`] and never
//! the app's default store.
//!
//! macOS 14+ only (`WKWebsiteDataStore(forIdentifier:)`). On older macOS /
//! non-macOS, [`feature_supported`] is `false` and the coordinator returns
//! `UnsupportedPlatform` before any adapter entry point is reached.

use super::CookieCmdError;
use browser_cookies::ImportedCookie;
use tauri::AppHandle;

// ── macOS implementation ────────────────────────────────────────────────────
#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use crate::browser_cookies::PREVIEW_DATA_STORE_ID;
    use block2::RcBlock;
    use browser_cookies::SameSite;
    use core::ptr::NonNull;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::MainThreadMarker;
    use objc2_foundation::{
        NSArray, NSDate, NSDictionary, NSHTTPCookie, NSHTTPCookieDomain, NSHTTPCookieExpires,
        NSHTTPCookieName, NSHTTPCookieOriginURL, NSHTTPCookiePath, NSHTTPCookieSameSitePolicy,
        NSHTTPCookieSecure, NSHTTPCookieValue, NSProcessInfo, NSSet, NSString, NSUUID,
    };
    use objc2_web_kit::WKWebsiteDataStore;
    use std::collections::HashSet;
    use std::sync::mpsc;
    use std::time::Duration;

    /// Bounded wait for the WebKit async completion to fire on the main run loop.
    const OP_TIMEOUT: Duration = Duration::from_secs(20);

    /// WebKit data-type identifier strings. WebKit defines each
    /// `WKWebsiteDataType*` constant's runtime value to be equal to its own name
    /// (e.g. `WKWebsiteDataTypeDiskCache == @"WKWebsiteDataTypeDiskCache"`), and
    /// `objc2-web-kit 0.3.2` does not re-export the extern statics — so we build
    /// the `NSString`s from those stable literal values.
    const CACHE_TYPES: &[&str] = &[
        "WKWebsiteDataTypeDiskCache",
        "WKWebsiteDataTypeMemoryCache",
        "WKWebsiteDataTypeFetchCache",
    ];
    const SITE_DATA_TYPES: &[&str] = &[
        // caches
        "WKWebsiteDataTypeDiskCache",
        "WKWebsiteDataTypeMemoryCache",
        "WKWebsiteDataTypeFetchCache",
        // + storage + cookies
        "WKWebsiteDataTypeCookies",
        "WKWebsiteDataTypeLocalStorage",
        "WKWebsiteDataTypeSessionStorage",
        "WKWebsiteDataTypeIndexedDBDatabases",
        "WKWebsiteDataTypeServiceWorkerRegistrations",
        "WKWebsiteDataTypeWebSQLDatabases",
    ];

    pub fn feature_supported() -> bool {
        // WKWebsiteDataStore(forIdentifier:) requires macOS 14+.
        let version = NSProcessInfo::processInfo().operatingSystemVersion();
        version.majorVersion >= 14
    }

    /// Upcast any objc2 object into an erased `Retained<AnyObject>` for use as a
    /// dictionary value. Upcasting to the root class is always sound.
    fn erase<T: objc2::Message>(obj: Retained<T>) -> Retained<AnyObject> {
        // SAFETY: every objc2 object is an `AnyObject`; this is a pure upcast.
        unsafe { Retained::cast_unchecked::<AnyObject>(obj) }
    }

    /// Normalize a domain for identity comparison: strip a single leading dot and
    /// lowercase. Used on both the expected and read-back sides so a cookie is
    /// counted verified when name + path match and the base domain matches,
    /// tolerating WebKit's host-only/domain dot normalization.
    fn normalize_domain(domain: &str) -> String {
        domain
            .strip_prefix('.')
            .unwrap_or(domain)
            .to_ascii_lowercase()
    }

    /// Build the origin URL string used to bind a **host-only** cookie to a
    /// single host via `NSHTTPCookieOriginURL`. Scheme is `https` when the
    /// cookie is secure else `http`; the host is the stored domain with any
    /// leading dot stripped; the path is the cookie's path. WebKit derives a
    /// host-only `Domain` from this origin, so the cookie never leaks to
    /// subdomains and `__Host-` cookies (which forbid an explicit Domain) are
    /// accepted.
    fn host_only_origin_url(secure: bool, domain: &str, path: &str) -> String {
        let scheme = if secure { "https" } else { "http" };
        let host = domain.strip_prefix('.').unwrap_or(domain);
        format!("{scheme}://{host}{path}")
    }

    /// Build an `NSHTTPCookie` from the high-fidelity model, or `None` if WebKit
    /// rejects the property set (illegal shape). Rejected cookies simply never
    /// round-trip and are counted as `failed_injection` by the caller.
    fn build_cookie(cookie: &ImportedCookie) -> Option<Retained<NSHTTPCookie>> {
        // Undocumented-but-honored key for the HttpOnly attribute (no public
        // constant exists in NSHTTPCookie's property key set).
        let http_only_key = NSString::from_str("HttpOnly");

        let mut keys: Vec<&NSString> = Vec::new();
        let mut objects: Vec<Retained<AnyObject>> = Vec::new();

        // Required.
        keys.push(unsafe { NSHTTPCookieName });
        objects.push(erase(NSString::from_str(&cookie.identity.name)));
        keys.push(unsafe { NSHTTPCookieValue });
        objects.push(erase(NSString::from_str(&cookie.value)));

        // Host-only vs domain binding. Host-only source cookies must NOT carry
        // an explicit Domain: an NSHTTPCookieDomain attribute would widen them
        // into domain cookies (leaking to subdomains), and `__Host-` cookies are
        // rejected outright by WebKit if a Domain is present. Instead we bind
        // them to a single origin via NSHTTPCookieOriginURL, from which WebKit
        // derives a host-only Domain. Domain (non-host-only) cookies keep their
        // stored Domain, including its leading dot, so WebKit treats them as
        // subdomain-spanning.
        if cookie.host_only {
            keys.push(unsafe { NSHTTPCookieOriginURL });
            objects.push(erase(NSString::from_str(&host_only_origin_url(
                cookie.secure,
                &cookie.identity.domain,
                &cookie.identity.path,
            ))));
        } else {
            keys.push(unsafe { NSHTTPCookieDomain });
            objects.push(erase(NSString::from_str(&cookie.identity.domain)));
        }

        keys.push(unsafe { NSHTTPCookiePath });
        objects.push(erase(NSString::from_str(&cookie.identity.path)));

        if cookie.secure {
            keys.push(unsafe { NSHTTPCookieSecure });
            objects.push(erase(NSString::from_str("TRUE")));
        }

        if cookie.http_only {
            keys.push(&http_only_key);
            objects.push(erase(NSString::from_str("TRUE")));
        }

        // SameSite: only Lax / Strict have property-dict values ("lax" / "strict",
        // the values of NSHTTPCookieSameSite{Lax,Strict}). None and Unspecified
        // cannot be distinguished here, so the key is omitted for both; read-back
        // verification keys on (name, domain, path, value), which does not include
        // SameSite, so counting is unaffected.
        match cookie.same_site {
            SameSite::Lax => {
                keys.push(unsafe { NSHTTPCookieSameSitePolicy });
                objects.push(erase(NSString::from_str("lax")));
            }
            SameSite::Strict => {
                keys.push(unsafe { NSHTTPCookieSameSitePolicy });
                objects.push(erase(NSString::from_str("strict")));
            }
            SameSite::None | SameSite::Unspecified => {}
        }

        // Persistent cookies get an expiry; session cookies omit it.
        if cookie.has_expires {
            if let Some(secs) = cookie.expires {
                keys.push(unsafe { NSHTTPCookieExpires });
                objects.push(erase(NSDate::dateWithTimeIntervalSince1970(secs as f64)));
            }
        }

        let dict: Retained<NSDictionary<NSString, AnyObject>> =
            NSDictionary::from_retained_objects(&keys, &objects);

        // SAFETY: `dict` maps NSHTTPCookie property keys to valid value types.
        unsafe { NSHTTPCookie::cookieWithProperties(&dict) }
    }

    fn website_data_type_set(names: &[&str]) -> Retained<NSSet<NSString>> {
        let owned: Vec<Retained<NSString>> = names.iter().map(|n| NSString::from_str(n)).collect();
        let refs: Vec<&NSString> = owned.iter().map(|r| &**r).collect();
        NSSet::from_slice(&refs)
    }

    /// Count how many injected cookies round-tripped. The read-back key includes
    /// the cookie VALUE — `(name, normalized_domain, path, value)` — so a cookie
    /// counts as verified only when the *injected value* is what WebKit stored.
    /// On re-import, if WebKit rejects a replacement, a stale cookie with the same
    /// name/domain/path but a different value no longer masks the failure.
    fn count_verified(
        cookies: &NSArray<NSHTTPCookie>,
        expected: &HashSet<(String, String, String, String)>,
    ) -> usize {
        let mut matched: HashSet<(String, String, String, String)> = HashSet::new();
        let count = cookies.count();
        for index in 0..count {
            let cookie = cookies.objectAtIndex(index);
            let identity = (
                cookie.name().to_string(),
                normalize_domain(&cookie.domain().to_string()),
                cookie.path().to_string(),
                cookie.value().to_string(),
            );
            if expected.contains(&identity) {
                matched.insert(identity);
            }
        }
        matched.len()
    }

    pub fn inject(app: &AppHandle, cookies: &[ImportedCookie]) -> Result<usize, CookieCmdError> {
        let expected: HashSet<(String, String, String, String)> = cookies
            .iter()
            .map(|c| {
                (
                    c.identity.name.clone(),
                    normalize_domain(&c.identity.domain),
                    c.identity.path.clone(),
                    c.value.clone(),
                )
            })
            .collect();
        let cookies_owned = cookies.to_vec();

        let (tx, rx) = mpsc::channel::<usize>();

        app.run_on_main_thread(move || {
            // SAFETY: run_on_main_thread guarantees execution on the main thread.
            let mtm = MainThreadMarker::new().expect("run_on_main_thread runs on the main thread");
            let uuid = NSUUID::from_bytes(PREVIEW_DATA_STORE_ID);
            let store = unsafe { WKWebsiteDataStore::dataStoreForIdentifier(&uuid, mtm) };
            let cookie_store = unsafe { store.httpCookieStore() };

            let mut cookie_objs: Vec<Retained<NSHTTPCookie>> = Vec::new();
            for cookie in &cookies_owned {
                if let Some(obj) = build_cookie(cookie) {
                    cookie_objs.push(obj);
                }
            }
            let cookie_refs: Vec<&NSHTTPCookie> = cookie_objs.iter().map(|r| &**r).collect();
            let ns_cookies = NSArray::from_slice(&cookie_refs);

            // Captures kept alive across the async completions.
            let store_for_outer = store.clone();
            let cookie_store_for_read = cookie_store.clone();
            let expected_outer = expected.clone();
            let tx_outer = tx.clone();

            // setCookies completion → read back → count identity round-trips.
            // The cookie store serializes operations, so getAllCookies observes
            // every prior setCookie.
            let completion = RcBlock::new(move || {
                let store_for_inner = store_for_outer.clone();
                let expected_inner = expected_outer.clone();
                let tx_inner = tx_outer.clone();
                let get_all = RcBlock::new(move |arr: NonNull<NSArray<NSHTTPCookie>>| {
                    // Hold the store until read-back completes.
                    let _keepalive = &store_for_inner;
                    let arr = unsafe { arr.as_ref() };
                    let verified = count_verified(arr, &expected_inner);
                    let _ = tx_inner.send(verified);
                });
                unsafe { cookie_store_for_read.getAllCookies(&get_all) };
            });

            unsafe { cookie_store.setCookies_completionHandler(&ns_cookies, Some(&completion)) };
        })
        .map_err(|_| CookieCmdError::Io)?;

        rx.recv_timeout(OP_TIMEOUT).map_err(|_| CookieCmdError::Io)
    }

    fn remove_data(app: &AppHandle, names: &'static [&'static str]) -> Result<(), CookieCmdError> {
        let (tx, rx) = mpsc::channel::<()>();

        app.run_on_main_thread(move || {
            // SAFETY: run_on_main_thread guarantees execution on the main thread.
            let mtm = MainThreadMarker::new().expect("run_on_main_thread runs on the main thread");
            let uuid = NSUUID::from_bytes(PREVIEW_DATA_STORE_ID);
            let store = unsafe { WKWebsiteDataStore::dataStoreForIdentifier(&uuid, mtm) };
            let types = website_data_type_set(names);
            let since = NSDate::distantPast();

            let store_keepalive = store.clone();
            let tx_block = tx.clone();
            let completion = RcBlock::new(move || {
                let _keepalive = &store_keepalive;
                let _ = tx_block.send(());
            });

            unsafe {
                store.removeDataOfTypes_modifiedSince_completionHandler(&types, &since, &completion)
            };
        })
        .map_err(|_| CookieCmdError::Io)?;

        rx.recv_timeout(OP_TIMEOUT).map_err(|_| CookieCmdError::Io)
    }

    pub fn clear_cache(app: &AppHandle) -> Result<(), CookieCmdError> {
        remove_data(app, CACHE_TYPES)
    }

    pub fn clear_site_data(app: &AppHandle) -> Result<(), CookieCmdError> {
        remove_data(app, SITE_DATA_TYPES)
    }

    #[cfg(test)]
    mod tests {
        use super::{host_only_origin_url, normalize_domain, SITE_DATA_TYPES};

        #[test]
        fn normalize_domain_strips_leading_dot_and_lowercases() {
            assert_eq!(normalize_domain(".Example.com"), "example.com");
            assert_eq!(normalize_domain("Example.com"), "example.com");
            // Only a single leading dot is stripped.
            assert_eq!(normalize_domain("..example.com"), ".example.com");
        }

        #[test]
        fn normalize_domain_matches_host_only_readback_to_expected() {
            // Read-back domain for a host-only cookie is the bare host; the
            // expected side may still carry a stored dot. Both normalize equal so
            // count_verified matches them.
            assert_eq!(
                normalize_domain("example.com"),
                normalize_domain(".example.com")
            );
        }

        #[test]
        fn host_only_origin_url_uses_secure_scheme_and_strips_dot() {
            assert_eq!(
                host_only_origin_url(true, "example.com", "/"),
                "https://example.com/"
            );
            assert_eq!(
                host_only_origin_url(false, "example.com", "/app"),
                "http://example.com/app"
            );
            // A stored leading dot is stripped from the origin host.
            assert_eq!(
                host_only_origin_url(true, ".example.com", "/"),
                "https://example.com/"
            );
        }

        #[test]
        fn site_data_types_include_session_storage() {
            // Clear Site Data must wipe HTML Session Storage so an open preview
            // cannot retain session state.
            assert!(SITE_DATA_TYPES.contains(&"WKWebsiteDataTypeSessionStorage"));
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::{clear_cache, clear_site_data, feature_supported, inject};

// ── Non-macOS fallback ──────────────────────────────────────────────────────
#[cfg(not(target_os = "macos"))]
pub fn feature_supported() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn inject(_app: &AppHandle, _cookies: &[ImportedCookie]) -> Result<usize, CookieCmdError> {
    Err(CookieCmdError::UnsupportedPlatform)
}

#[cfg(not(target_os = "macos"))]
pub fn clear_cache(_app: &AppHandle) -> Result<(), CookieCmdError> {
    Err(CookieCmdError::UnsupportedPlatform)
}

#[cfg(not(target_os = "macos"))]
pub fn clear_site_data(_app: &AppHandle) -> Result<(), CookieCmdError> {
    Err(CookieCmdError::UnsupportedPlatform)
}
