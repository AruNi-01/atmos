//! macOS profile discovery for Chromium-family browsers and Firefox.
//!
//! The import feature (`list_profiles`) surfaces only the four supported
//! [`BrowserKind`]s, but discovery also enumerates the wider Chromium family
//! (Arc, Chromium, Helium, Dia, Atlas, betas…) for the `quota-usage` reuse path.
//! Modern Chromium keeps cookies in `<Profile>/Network/Cookies`; the legacy
//! `<Profile>/Cookies` is a fallback and is checked second.

use std::path::{Path, PathBuf};

use crate::types::{BrowserKind, ProfileHandle};

/// One discovered Chromium profile (internal, rich form).
#[derive(Debug, Clone)]
pub(crate) struct ChromiumProfile {
    pub label: String,
    pub cookie_db: PathBuf,
    pub safe_storage_service: String,
    /// `Some` only for the four supported import kinds.
    pub kind: Option<BrowserKind>,
    pub display_name: String,
    pub running: bool,
}

/// One discovered Firefox profile (internal).
#[derive(Debug, Clone)]
pub(crate) struct FirefoxProfile {
    pub label: String,
    pub cookie_db: PathBuf,
    pub display_name: String,
    pub running: bool,
}

/// Simplified Chromium candidate for the `quota-usage` Cookie-header path.
#[derive(Debug, Clone)]
pub struct ChromiumProfileCandidate {
    pub label: String,
    pub cookie_db: PathBuf,
    pub safe_storage_service: String,
}

/// Simplified Firefox candidate for the `quota-usage` Cookie-header path.
#[derive(Debug, Clone)]
pub struct FirefoxProfileCandidate {
    pub label: String,
    pub cookie_db: PathBuf,
}

struct ChromiumBase {
    label: &'static str,
    service: &'static str,
    kind: Option<BrowserKind>,
    base: PathBuf,
}

#[cfg(target_os = "macos")]
fn chromium_bases() -> Vec<ChromiumBase> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let app = home.join("Library/Application Support");
    let entries: &[(&str, &str, Option<BrowserKind>, &str)] = &[
        (
            "Google Chrome",
            "Chrome Safe Storage",
            Some(BrowserKind::Chrome),
            "Google/Chrome",
        ),
        (
            "Google Chrome Beta",
            "Chrome Safe Storage",
            Some(BrowserKind::Chrome),
            "Google/Chrome Beta",
        ),
        (
            "Google Chrome Canary",
            "Chrome Safe Storage",
            Some(BrowserKind::Chrome),
            "Google/Chrome Canary",
        ),
        (
            "Microsoft Edge",
            "Microsoft Edge Safe Storage",
            Some(BrowserKind::Edge),
            "Microsoft Edge",
        ),
        (
            "Microsoft Edge Beta",
            "Microsoft Edge Safe Storage",
            Some(BrowserKind::Edge),
            "Microsoft Edge Beta",
        ),
        (
            "Microsoft Edge Dev",
            "Microsoft Edge Safe Storage",
            Some(BrowserKind::Edge),
            "Microsoft Edge Dev",
        ),
        (
            "Microsoft Edge Canary",
            "Microsoft Edge Safe Storage",
            Some(BrowserKind::Edge),
            "Microsoft Edge Canary",
        ),
        (
            "Brave",
            "Brave Safe Storage",
            Some(BrowserKind::Brave),
            "BraveSoftware/Brave-Browser",
        ),
        (
            "Brave Beta",
            "Brave Safe Storage",
            Some(BrowserKind::Brave),
            "BraveSoftware/Brave-Browser-Beta",
        ),
        // Discovered for the quota-usage reuse path only (no import BrowserKind).
        ("Arc", "Arc Safe Storage", None, "Arc/User Data"),
        ("Arc Beta", "Arc Safe Storage", None, "Arc Beta/User Data"),
        (
            "Arc Canary",
            "Arc Safe Storage",
            None,
            "Arc Canary/User Data",
        ),
        ("Chromium", "Chromium Safe Storage", None, "Chromium"),
        ("Helium", "Helium Safe Storage", None, "net.imput.helium"),
        ("Dia", "Dia Safe Storage", None, "com.electron.dia"),
        (
            "ChatGPT Atlas",
            "ChatGPT Atlas Safe Storage",
            None,
            "ChatGPT Atlas",
        ),
    ];

    entries
        .iter()
        .map(|(label, service, kind, rel)| ChromiumBase {
            label,
            service,
            kind: *kind,
            base: app.join(rel),
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn chromium_bases() -> Vec<ChromiumBase> {
    Vec::new()
}

/// Prefer `Network/Cookies`, then legacy `Cookies`.
fn cookie_db_for_profile_dir(profile_dir: &Path) -> Option<PathBuf> {
    let network = profile_dir.join("Network/Cookies");
    if network.exists() {
        return Some(network);
    }
    let legacy = profile_dir.join("Cookies");
    if legacy.exists() {
        return Some(legacy);
    }
    None
}

fn chromium_profile_priority(profile_name: &str) -> (usize, String) {
    let lower = profile_name.to_lowercase();
    let rank = match lower.as_str() {
        "default" => 0,
        // Guest always sorts last.
        "guest profile" => usize::MAX,
        // `Profile <N>` ranks by its numeric suffix so `Profile 3` sorts before
        // `Profile 10` (a plain lexicographic fallback would invert them and
        // change which profile quota-usage's first-match selection picks).
        other => other
            .strip_prefix("profile ")
            .and_then(|n| n.trim().parse::<usize>().ok())
            .unwrap_or(usize::MAX - 1),
    };
    (rank, lower)
}

/// Read `Local State` -> `profile.info_cache[dir]` and pick the most
/// recognizable display name for each profile directory.
fn load_display_names(base: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let Ok(text) = std::fs::read_to_string(base.join("Local State")) else {
        return map;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return map;
    };
    if let Some(cache) = json
        .get("profile")
        .and_then(|p| p.get("info_cache"))
        .and_then(|c| c.as_object())
    {
        for (dir, info) in cache {
            if let Some(name) = preferred_profile_name(info) {
                map.insert(dir.clone(), name);
            }
        }
    }
    map
}

/// Pick the most user-recognizable name from a `profile.info_cache` entry.
///
/// Chrome stores the local profile label under `name`, which is often a generic
/// default like "Person 1" / "用户 1". The signed-in Google account's full name
/// lives under `gaia_name` and the account email under `user_name`. Prefer the
/// Google account name, then the email, then the local profile label — so a
/// signed-in profile shows "Jane Doe" instead of "用户 1".
fn preferred_profile_name(info: &serde_json::Value) -> Option<String> {
    ["gaia_name", "user_name", "name"]
        .iter()
        .filter_map(|key| info.get(*key).and_then(|v| v.as_str()))
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

/// Chromium running if the user-data-dir `SingletonLock` symlink is present.
fn chromium_running(base: &Path) -> bool {
    std::fs::symlink_metadata(base.join("SingletonLock")).is_ok()
}

pub(crate) fn discover_chromium_profiles() -> Vec<ChromiumProfile> {
    let mut out = Vec::new();
    for base in chromium_bases() {
        if !base.base.exists() {
            continue;
        }
        let running = chromium_running(&base.base);
        let display_names = load_display_names(&base.base);

        // Enumerate candidate profile dirs: the base itself plus subdirectories.
        let mut profile_dirs: Vec<(String, PathBuf)> = Vec::new();
        if cookie_db_for_profile_dir(&base.base).is_some() {
            profile_dirs.push(("Default".to_string(), base.base.clone()));
        }
        if let Ok(entries) = std::fs::read_dir(&base.base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                if cookie_db_for_profile_dir(&path).is_none() {
                    continue;
                }
                let dir_name = path
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("Profile")
                    .to_string();
                profile_dirs.push((dir_name, path));
            }
        }

        profile_dirs.sort_by_key(|(name, _)| chromium_profile_priority(name));

        for (dir_name, profile_dir) in profile_dirs {
            let Some(cookie_db) = cookie_db_for_profile_dir(&profile_dir) else {
                continue;
            };
            let display_name = display_names
                .get(&dir_name)
                .cloned()
                .unwrap_or_else(|| dir_name.clone());
            out.push(ChromiumProfile {
                label: format!("{} / {dir_name}", base.label),
                cookie_db,
                safe_storage_service: base.service.to_string(),
                kind: base.kind,
                display_name,
                running,
            });
        }
    }
    out
}

#[cfg(target_os = "macos")]
pub(crate) fn discover_firefox_profiles() -> Vec<FirefoxProfile> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let root = home.join("Library/Application Support/Firefox/Profiles");
    if !root.exists() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let cookie_db = path.join("cookies.sqlite");
        if !cookie_db.exists() {
            continue;
        }
        let dir_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("Profile")
            .to_string();
        let running = path.join("lock").exists() || path.join(".parentlock").exists();
        out.push(FirefoxProfile {
            label: format!("Firefox / {dir_name}"),
            cookie_db,
            display_name: dir_name,
            running,
        });
    }
    out
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn discover_firefox_profiles() -> Vec<FirefoxProfile> {
    Vec::new()
}

/// Stable, opaque handle derived from the cookie DB path (never exposed as a
/// path). Deterministic so `extract` can re-resolve the profile.
pub(crate) fn handle_for(cookie_db: &Path) -> ProfileHandle {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(cookie_db.to_string_lossy().as_bytes());
    ProfileHandle(hex::encode(digest))
}

// --- Public candidate lists (quota-usage reuse path) -------------------------

/// All Chromium cookie DBs (full browser family), in profile-priority order.
pub fn chromium_profile_candidates() -> Vec<ChromiumProfileCandidate> {
    discover_chromium_profiles()
        .into_iter()
        .map(|p| ChromiumProfileCandidate {
            label: p.label,
            cookie_db: p.cookie_db,
            safe_storage_service: p.safe_storage_service,
        })
        .collect()
}

/// All Firefox cookie DBs.
pub fn firefox_profile_candidates() -> Vec<FirefoxProfileCandidate> {
    discover_firefox_profiles()
        .into_iter()
        .map(|p| FirefoxProfileCandidate {
            label: p.label,
            cookie_db: p.cookie_db,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{chromium_profile_priority, preferred_profile_name};
    use serde_json::json;

    #[test]
    fn profile_priority_orders_numerically_not_lexicographically() {
        let mut names = vec!["Profile 10", "Profile 3", "Profile 1", "Default"];
        names.sort_by_key(|n| chromium_profile_priority(n));
        assert_eq!(
            names,
            vec!["Default", "Profile 1", "Profile 3", "Profile 10"]
        );
    }

    #[test]
    fn default_first_and_guest_last() {
        let mut names = vec!["Guest Profile", "Profile 2", "Default"];
        names.sort_by_key(|n| chromium_profile_priority(n));
        assert_eq!(names, vec!["Default", "Profile 2", "Guest Profile"]);
    }

    #[test]
    fn prefers_google_account_name_over_local_profile_label() {
        let info =
            json!({ "name": "用户 1", "gaia_name": "Jane Doe", "user_name": "jane@example.com" });
        assert_eq!(preferred_profile_name(&info).as_deref(), Some("Jane Doe"));
    }

    #[test]
    fn falls_back_to_email_then_local_name() {
        let email_only =
            json!({ "name": "用户 1", "gaia_name": "", "user_name": "jane@example.com" });
        assert_eq!(
            preferred_profile_name(&email_only).as_deref(),
            Some("jane@example.com")
        );

        let name_only = json!({ "name": "Work", "gaia_name": "", "user_name": "" });
        assert_eq!(preferred_profile_name(&name_only).as_deref(), Some("Work"));

        let empty = json!({});
        assert_eq!(preferred_profile_name(&empty), None);
    }
}
