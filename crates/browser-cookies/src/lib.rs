//! `browser-cookies` — local, on-device browser cookie extraction for macOS.
//!
//! Leaf crate for APP-041 Browser Cookie Sync. No Tauri, no app dependencies.
//! Reads a consistent snapshot of Chromium-family and Firefox cookie stores via
//! the typed `rusqlite` BLOB API (never a `sqlite3` subprocess), decrypts
//! Chromium values with the macOS Keychain Safe Storage key, and returns
//! high-fidelity cookies with per-row failure accounting.
//!
//! # Public import surface (frozen contract)
//!
//! - Types: [`BrowserKind`], [`SameSite`], [`CookieIdentity`], [`ImportedCookie`],
//!   [`ProfileHandle`], [`BrowserProfile`], [`ExtractionResult`], [`ExtractError`].
//! - [`list_profiles`] — discover importable profiles (Chrome/Edge/Brave/Firefox).
//! - [`extract`] — extract cookies for one profile by opaque handle.
//!
//! # Reuse surface (for `ai-usage`)
//!
//! In addition to the frozen contract, this crate exposes lower-level, WAL-safe
//! primitives that `ai-usage` composes into its provider-domain filtering and
//! Cookie-header assembly: [`chromium_profile_candidates`],
//! [`firefox_profile_candidates`], [`read_chromium_filtered`],
//! [`read_firefox_filtered`], [`safe_storage_passphrase`], and
//! [`decrypt_chromium_value`]. These are documented deviations from the minimal
//! contract, required by the crate-extraction refactor (TECH §7).

mod decrypt;
mod discovery;
mod extract;
mod keychain;
mod sqlite;
mod types;

// --- Frozen contract ------------------------------------------------------
pub use extract::{extract, list_profiles};
pub use types::{
    BrowserKind, BrowserProfile, CookieIdentity, ExtractError, ExtractionResult, ImportedCookie,
    ProfileHandle, SameSite,
};

// --- Reuse primitives (ai-usage) -----------------------------------------
pub use decrypt::{decrypt_chromium_value, DecryptError};
pub use discovery::{
    chromium_profile_candidates, firefox_profile_candidates, ChromiumProfileCandidate,
    FirefoxProfileCandidate,
};
pub use keychain::safe_storage_passphrase;
pub use sqlite::{
    domain_candidates, read_chromium_filtered, read_firefox_filtered, ChromiumCookieRow,
    FirefoxCookieRow,
};
