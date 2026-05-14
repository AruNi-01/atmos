//! Generic on-disk cache rooted at `~/.atmos/cache/`.
//!
//! Every feature gets its own subdirectory (`~/.atmos/cache/<feature>/<key>.json`) and
//! wraps its payload in a small envelope carrying a schema version and the timestamp the
//! entry was generated. Callers drive the TTL/SWR policy themselves — this module only
//! reads, writes, and removes envelopes.
//!
//! Design goals:
//!
//! * **Crash-safe**: `put` writes to `<file>.tmp` first and then renames into place, so a
//!   crash mid-write never leaves a half-written JSON file.
//! * **Version-tolerant**: if the stored `version` doesn't match the requested payload
//!   shape, `get` returns `None` (a miss) instead of failing. Callers bump the expected
//!   version when the payload schema changes.
//! * **Best-effort**: callers read failures as misses and write failures as warnings —
//!   a broken cache must never break the real request flow.
//!
//! Concurrency: reads and writes use the filesystem directly with no in-process locks.
//! Two concurrent writers to the same key race on rename (last one wins). Readers never
//! observe a partial file because of the rename-on-write strategy.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tracing::warn;

/// Current envelope schema version. Bump this when the on-disk format itself changes
/// (e.g. you add a new required field at the envelope level). Payload schema changes
/// should be signalled by the caller through a per-feature version of their own if
/// they care about it.
const ENVELOPE_VERSION: u32 = 1;

/// Relative path inside the user's home dir where the cache lives.
const CACHE_ROOT_REL: &str = ".atmos/cache";

/// Errors from constructing a `DiskCache`. All I/O from `get`/`put`/`remove*` uses
/// `std::io::Result` or returns a miss — construction is the only thing that can fail
/// for a structural reason (no HOME dir).
#[derive(Debug, thiserror::Error)]
pub enum DiskCacheError {
    #[error("cannot determine user home directory for disk cache")]
    NoHomeDir,
}

/// A single envelope as it lives on disk.
#[derive(Serialize, Deserialize)]
struct Envelope<T> {
    version: u32,
    generated_at: String, // RFC3339 UTC
    payload: T,
}

/// A successfully read cache entry, plus metadata the caller needs to decide whether
/// to serve, refresh in the background, or ignore.
#[derive(Debug, Clone)]
pub struct CacheEntry<T> {
    pub value: T,
    pub generated_at: DateTime<Utc>,
    /// How long ago the entry was written. Computed at read time against `Utc::now()`
    /// so callers can implement TTL / stale-while-revalidate without re-parsing.
    pub age: Duration,
}

/// Rooted cache handle. Cheap to construct — holds only a base path.
#[derive(Debug, Clone)]
pub struct DiskCache {
    base: PathBuf,
}

impl DiskCache {
    /// Anchor the cache at `~/.atmos/cache/`.
    pub fn new() -> Result<Self, DiskCacheError> {
        let home = dirs::home_dir().ok_or(DiskCacheError::NoHomeDir)?;
        Ok(Self {
            base: home.join(CACHE_ROOT_REL),
        })
    }

    /// Anchor the cache at an arbitrary directory. Test-only escape hatch.
    pub fn at(base: impl Into<PathBuf>) -> Self {
        Self { base: base.into() }
    }

    fn feature_dir(&self, feature: &str) -> PathBuf {
        self.base.join(feature)
    }

    fn file_path(&self, feature: &str, key: &str) -> PathBuf {
        self.feature_dir(feature).join(format!("{key}.json"))
    }

    /// Read an entry. Returns `Ok(None)` on any recoverable miss — file absent,
    /// envelope version mismatch, unparseable timestamp, or payload type mismatch.
    ///
    /// Callers should treat a miss as "go scan for real" and not propagate errors.
    pub fn get<T: DeserializeOwned>(
        &self,
        feature: &str,
        key: &str,
    ) -> io::Result<Option<CacheEntry<T>>> {
        let path = self.file_path(feature, key);
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(err) => return Err(err),
        };

        let envelope: Envelope<T> = match serde_json::from_slice(&bytes) {
            Ok(env) => env,
            Err(err) => {
                // Corrupt / old-schema file — treat as a miss so the caller refreshes.
                warn!(
                    target: "disk_cache",
                    path = %path.display(),
                    error = %err,
                    "disk cache entry failed to deserialize; treating as miss",
                );
                return Ok(None);
            }
        };

        if envelope.version != ENVELOPE_VERSION {
            return Ok(None);
        }

        let generated_at = match DateTime::parse_from_rfc3339(&envelope.generated_at) {
            Ok(t) => t.with_timezone(&Utc),
            Err(_) => return Ok(None),
        };
        let age = Utc::now()
            .signed_duration_since(generated_at)
            .to_std()
            .unwrap_or_default();

        Ok(Some(CacheEntry {
            value: envelope.payload,
            generated_at,
            age,
        }))
    }

    /// Write an entry. Atomic: writes to `<file>.tmp` then renames over the target.
    pub fn put<T: Serialize>(&self, feature: &str, key: &str, value: &T) -> io::Result<()> {
        let dir = self.feature_dir(feature);
        fs::create_dir_all(&dir)?;

        let envelope = Envelope {
            version: ENVELOPE_VERSION,
            generated_at: Utc::now().to_rfc3339(),
            payload: value,
        };
        let bytes = serde_json::to_vec(&envelope)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let final_path = self.file_path(feature, key);
        let tmp_path = final_path.with_extension("json.tmp");
        fs::write(&tmp_path, &bytes)?;
        fs::rename(&tmp_path, &final_path)?;
        Ok(())
    }

    /// Remove a single entry. Missing file is not an error.
    pub fn remove(&self, feature: &str, key: &str) -> io::Result<()> {
        match fs::remove_file(self.file_path(feature, key)) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(err),
        }
    }

    /// Remove an entire feature directory. Missing dir is not an error.
    ///
    /// Use this after mutations that might have affected any cached key under the
    /// feature (e.g. "some skill was added/removed" — we don't know which key's hash
    /// that maps to, so we nuke the whole feature folder).
    pub fn remove_feature(&self, feature: &str) -> io::Result<()> {
        match fs::remove_dir_all(self.feature_dir(feature)) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(err),
        }
    }

    /// Expose the base directory for logging and tests.
    pub fn base_dir(&self) -> &Path {
        &self.base
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct SamplePayload {
        id: String,
        count: u32,
    }

    fn cache() -> (tempfile::TempDir, DiskCache) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let cache = DiskCache::at(tmp.path().to_path_buf());
        (tmp, cache)
    }

    #[test]
    fn get_returns_none_when_file_missing() {
        let (_tmp, cache) = cache();
        let got: Option<CacheEntry<SamplePayload>> =
            cache.get("skills", "list").expect("get should not error");
        assert!(got.is_none());
    }

    #[test]
    fn put_then_get_round_trips_with_recent_age() {
        let (_tmp, cache) = cache();
        let payload = SamplePayload {
            id: "x".into(),
            count: 3,
        };
        cache.put("skills", "list", &payload).expect("put");
        let entry = cache
            .get::<SamplePayload>("skills", "list")
            .expect("get")
            .expect("entry present");
        assert_eq!(entry.value, payload);
        // Age is measured against now-utc, so it must be tiny. Tolerant upper bound.
        assert!(
            entry.age < Duration::from_secs(5),
            "age should be sub-second after immediate put, was {:?}",
            entry.age,
        );
    }

    #[test]
    fn put_overwrites_previous_entry_atomically() {
        let (_tmp, cache) = cache();
        let v1 = SamplePayload {
            id: "a".into(),
            count: 1,
        };
        let v2 = SamplePayload {
            id: "a".into(),
            count: 42,
        };
        cache.put("skills", "list", &v1).unwrap();
        cache.put("skills", "list", &v2).unwrap();
        let entry = cache
            .get::<SamplePayload>("skills", "list")
            .unwrap()
            .unwrap();
        assert_eq!(entry.value, v2);

        // The .tmp sibling must not linger after a successful rename.
        let tmp_path = cache.file_path("skills", "list").with_extension("json.tmp");
        assert!(
            !tmp_path.exists(),
            "leftover tmp file at {}",
            tmp_path.display()
        );
    }

    #[test]
    fn remove_is_idempotent() {
        let (_tmp, cache) = cache();
        cache.remove("skills", "list").unwrap(); // no entry — ok
        cache
            .put(
                "skills",
                "list",
                &SamplePayload {
                    id: "a".into(),
                    count: 1,
                },
            )
            .unwrap();
        cache.remove("skills", "list").unwrap();
        assert!(cache
            .get::<SamplePayload>("skills", "list")
            .unwrap()
            .is_none());
    }

    #[test]
    fn remove_feature_clears_all_keys_under_feature() {
        let (_tmp, cache) = cache();
        cache
            .put(
                "skills",
                "a",
                &SamplePayload {
                    id: "a".into(),
                    count: 1,
                },
            )
            .unwrap();
        cache
            .put(
                "skills",
                "b",
                &SamplePayload {
                    id: "b".into(),
                    count: 2,
                },
            )
            .unwrap();
        // A sibling feature must be untouched.
        cache
            .put(
                "review",
                "x",
                &SamplePayload {
                    id: "x".into(),
                    count: 99,
                },
            )
            .unwrap();

        cache.remove_feature("skills").unwrap();

        assert!(cache.get::<SamplePayload>("skills", "a").unwrap().is_none());
        assert!(cache.get::<SamplePayload>("skills", "b").unwrap().is_none());
        assert!(cache.get::<SamplePayload>("review", "x").unwrap().is_some());
    }

    #[test]
    fn remove_feature_is_idempotent_when_dir_missing() {
        let (_tmp, cache) = cache();
        cache.remove_feature("skills").unwrap();
        cache.remove_feature("skills").unwrap(); // second call must still Ok
    }

    /// Writing an envelope under a mismatched version byte must turn into a miss.
    /// Guards against panics when we bump `ENVELOPE_VERSION` in the future and users
    /// still have old cache files on disk.
    #[test]
    fn get_returns_none_when_envelope_version_mismatches() {
        let (_tmp, cache) = cache();
        let dir = cache.feature_dir("skills");
        fs::create_dir_all(&dir).unwrap();
        let raw = serde_json::json!({
            "version": ENVELOPE_VERSION + 99,
            "generated_at": Utc::now().to_rfc3339(),
            "payload": { "id": "a", "count": 1 },
        });
        fs::write(dir.join("list.json"), serde_json::to_vec(&raw).unwrap()).unwrap();

        let got: Option<CacheEntry<SamplePayload>> = cache.get("skills", "list").unwrap();
        assert!(got.is_none());
    }

    #[test]
    fn get_returns_none_when_payload_type_mismatches() {
        let (_tmp, cache) = cache();
        // Write a SamplePayload, read as an unrelated type.
        cache
            .put(
                "skills",
                "list",
                &SamplePayload {
                    id: "a".into(),
                    count: 1,
                },
            )
            .unwrap();
        #[derive(Deserialize)]
        struct OtherShape {
            #[allow(dead_code)]
            field: u32,
        }
        let got: Option<CacheEntry<OtherShape>> = cache.get("skills", "list").unwrap();
        assert!(got.is_none());
    }
}
