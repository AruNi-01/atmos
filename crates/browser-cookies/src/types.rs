//! Frozen shared contract types for APP-041 Browser Cookie Sync.
//!
//! These types are identical across the Rust extraction crate, the desktop
//! coordinator, and (by mapping) the web UI. Do not change field names or enum
//! variants without updating the shared contract in the spec.

use serde::{Deserialize, Serialize};

/// The four browser families supported by the MVP import feature.
///
/// Note: the crate can *discover* a wider set of Chromium-family browsers for
/// the `ai-usage` reuse path (Arc, Chromium, Helium, Dia, Atlas, betas…), but
/// the public import surface (`list_profiles`) only ever surfaces these four.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserKind {
    Chrome,
    Edge,
    Brave,
    Firefox,
}

/// SameSite policy. `Unspecified` must stay distinct from explicit `None` —
/// never coerce one into the other (that would widen a cookie's send scope).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SameSite {
    Unspecified,
    None,
    Lax,
    Strict,
}

/// Uniqueness / read-back key for a cookie.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CookieIdentity {
    pub name: String,
    pub domain: String,
    pub path: String,
    /// Present only for partitioned / CHIPS cookies. The MVP safe-skips these,
    /// so importable cookies always carry `None` here.
    pub partition_key: Option<String>,
}

/// A single, high-fidelity, decrypted cookie that is a candidate for import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportedCookie {
    pub identity: CookieIdentity,
    /// Decrypted plaintext value.
    pub value: String,
    /// `true` when the source domain had no leading dot (host-only cookie).
    pub host_only: bool,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: SameSite,
    /// Unix seconds. `None` for session cookies.
    pub expires: Option<i64>,
    /// Explicit session (`false`) vs persistent (`true`) distinction.
    pub has_expires: bool,
}

/// Opaque profile handle. NEVER a filesystem path — the frontend must never be
/// able to derive a path from it. It is a deterministic, stable id that the
/// crate can re-resolve by re-running discovery.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileHandle(pub String);

/// A discovered, importable browser profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserProfile {
    pub handle: ProfileHandle,
    pub browser: BrowserKind,
    /// Human display name, e.g. "用户1" (from Chromium `Local State`).
    pub display_name: String,
    /// Best-effort process-alive check.
    pub running: bool,
}

/// Outcome of extracting one profile. Every source row is accounted for: either
/// it lands in `cookies` or it increments exactly one `skipped_*` counter.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractionResult {
    /// Decoded, importable candidates.
    pub cookies: Vec<ImportedCookie>,
    pub skipped_expired: usize,
    pub skipped_decrypt: usize,
    pub skipped_parse: usize,
    /// Partitioned / CHIPS / container cookies safe-skipped.
    pub skipped_unsupported: usize,
}

/// Stable extraction error taxonomy. Maps 1:1 to the desktop coordinator's
/// `CookieCmdError` codes (plus `Busy`/`Forbidden`, which are coordinator-only).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ExtractError {
    #[error("browser cookie extraction is unsupported on this platform")]
    UnsupportedPlatform,
    #[error("profile not found")]
    ProfileNotFound,
    #[error("source browser is running; close it and retry")]
    BrowserRunning,
    #[error("keychain access denied")]
    KeychainDenied,
    #[error("keychain item unavailable")]
    KeychainUnavailable,
    #[error("cookie database is busy/locked")]
    DatabaseBusy,
    #[error("cookie database schema is invalid: {0}")]
    InvalidSchema(String),
    #[error("io error: {0}")]
    Io(String),
}
