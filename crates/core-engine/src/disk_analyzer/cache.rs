//! On-disk path cache for disk analyzer level / measure results.
//!
//! Layout (macOS): `~/Library/Caches/atmos/disk-analyzer/<key>.json`
//! Never store under `~/.atmos` — that tree is itself a primary scan target, and
//! writing cache files / touching top-level Atmos state (runtime_manifest, db, …)
//! constantly changes `~/.atmos` mtime, which used to force infinite cache misses.
//!
//! Policy:
//! - Absolute TTL: 3 days from write time
//! - Measure / level entries are **TTL-only** (no directory-mtime gate). Active
//!   app data dirs rewrite top-level files every boot; mtime invalidation made
//!   the 3-day cache useless for `~/.atmos`.
//! - Explicit invalidation: `invalidate_path` after delete; `clear_all` if needed.

use std::fs;
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tracing::warn;

use super::{DiskNode, PathMeasure};

const FEATURE: &str = "disk-analyzer";
/// Legacy location (self-polluting) — still cleared on `clear_all`.
const LEGACY_CACHE_ROOT_REL: &str = ".atmos/cache";
/// Payload schema — bump when CachedLevel / CachedMeasure fields change.
const PAYLOAD_VERSION: u32 = 2;
/// Hard expiry (user-requested).
pub const CACHE_TTL: Duration = Duration::from_secs(3 * 24 * 60 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedMeasure {
    pub version: u32,
    pub path: String,
    /// Retained for diagnostics / future soft-revalidate; not used as a hard gate.
    #[serde(default)]
    pub mtime_ms: u64,
    pub measure: PathMeasure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedLevel {
    pub version: u32,
    pub path: String,
    #[serde(default)]
    pub mtime_ms: u64,
    pub max_children: usize,
    pub node: DiskNode,
}

/// Preferred cache root: OS cache dir (outside the scanned Atmos tree).
fn cache_base() -> Option<PathBuf> {
    if let Some(cache) = dirs::cache_dir() {
        return Some(cache.join("atmos").join(FEATURE));
    }
    // Never fall back into ~/.atmos — that reintroduces self-invalidation.
    Some(std::env::temp_dir().join("atmos").join(FEATURE))
}

fn legacy_cache_base() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join(LEGACY_CACHE_ROOT_REL).join(FEATURE))
}

fn cache_key(kind: &str, path: &str, extra: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    kind.hash(&mut hasher);
    path.hash(&mut hasher);
    extra.hash(&mut hasher);
    format!("{kind}_{:016x}", hasher.finish())
}

fn file_path(key: &str) -> Option<PathBuf> {
    Some(cache_base()?.join(format!("{key}.json")))
}

/// Best-effort mtime in unix milliseconds (0 if unavailable).
pub fn path_mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn age_ok(generated_ms: u64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    now.saturating_sub(generated_ms) <= CACHE_TTL.as_millis() as u64
}

#[derive(Serialize, Deserialize)]
struct Envelope<T> {
    generated_ms: u64,
    payload: T,
}

fn read_entry<T: DeserializeOwned>(key: &str) -> Option<T> {
    let path = file_path(key)?;
    let bytes = fs::read(&path).ok()?;
    let env: Envelope<T> = match serde_json::from_slice(&bytes) {
        Ok(e) => e,
        Err(err) => {
            warn!(path = %path.display(), error = %err, "disk-analyzer cache decode failed");
            let _ = fs::remove_file(&path);
            return None;
        }
    };
    if !age_ok(env.generated_ms) {
        let _ = fs::remove_file(&path);
        return None;
    }
    Some(env.payload)
}

fn write_entry<T: Serialize>(key: &str, payload: &T) {
    let Some(dir) = cache_base() else {
        return;
    };
    if let Err(err) = fs::create_dir_all(&dir) {
        warn!(error = %err, "disk-analyzer cache mkdir failed");
        return;
    }
    let Some(final_path) = file_path(key) else {
        return;
    };
    let env = Envelope {
        generated_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        payload,
    };
    let Ok(bytes) = serde_json::to_vec(&env) else {
        return;
    };
    let tmp = final_path.with_extension("json.tmp");
    if fs::write(&tmp, &bytes).is_err() {
        return;
    }
    if let Err(err) = fs::rename(&tmp, &final_path) {
        warn!(error = %err, "disk-analyzer cache rename failed");
        let _ = fs::remove_file(&tmp);
    }
}

pub fn get_measure(path: &Path) -> Option<PathMeasure> {
    let path_str = path.to_string_lossy();
    let key = cache_key("m", &path_str, "");
    let cached: CachedMeasure = read_entry(&key)?;
    if cached.version != PAYLOAD_VERSION || cached.path != path_str {
        return None;
    }
    // TTL-only: do not gate on directory mtime (see module docs).
    Some(cached.measure)
}

pub fn put_measure(path: &Path, measure: &PathMeasure) {
    let path_str = path.to_string_lossy().to_string();
    let key = cache_key("m", &path_str, "");
    let payload = CachedMeasure {
        version: PAYLOAD_VERSION,
        path: path_str,
        mtime_ms: path_mtime_ms(path),
        measure: *measure,
    };
    write_entry(&key, &payload);
}

pub fn get_level(path: &Path, max_children: usize) -> Option<DiskNode> {
    let path_str = path.to_string_lossy();
    let key = cache_key("l", &path_str, &max_children.to_string());
    let cached: CachedLevel = read_entry(&key)?;
    if cached.version != PAYLOAD_VERSION
        || cached.path != path_str
        || cached.max_children != max_children
    {
        return None;
    }
    // TTL-only (same rationale as measure — active dirs thrash mtime).
    Some(cached.node)
}

pub fn put_level(path: &Path, max_children: usize, node: &DiskNode) {
    let path_str = path.to_string_lossy().to_string();
    let key = cache_key("l", &path_str, &max_children.to_string());
    let payload = CachedLevel {
        version: PAYLOAD_VERSION,
        path: path_str,
        mtime_ms: path_mtime_ms(path),
        max_children,
        node: node.clone(),
    };
    write_entry(&key, &payload);
}

fn remove_key(key: &str) -> io::Result<()> {
    let Some(path) = file_path(key) else {
        return Ok(());
    };
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

fn remove_dir_best_effort(dir: &Path) {
    match fs::remove_dir_all(dir) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => warn!(path = %dir.display(), error = %e, "disk-analyzer cache clear failed"),
    }
}

/// Drop all disk-analyzer cache entries (force refresh / after bulk delete).
pub fn clear_all() {
    if let Some(dir) = cache_base() {
        remove_dir_best_effort(&dir);
    }
    // Drop legacy ~/.atmos/cache/disk-analyzer so it no longer pollutes size / confuses ops.
    if let Some(dir) = legacy_cache_base() {
        remove_dir_best_effort(&dir);
    }
}

/// Invalidate cache for one path (both measure + common max_children levels).
pub fn invalidate_path(path: &Path) {
    let path_str = path.to_string_lossy();
    let _ = remove_key(&cache_key("m", &path_str, ""));
    for n in [10usize, 20, 30, 50, 100] {
        let _ = remove_key(&cache_key("l", &path_str, &n.to_string()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn measure_cache_roundtrip_ttl_only() {
        let dir = std::env::temp_dir().join(format!("da-cache-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("f.txt");
        fs::File::create(&file)
            .unwrap()
            .write_all(b"hello")
            .unwrap();

        let measure = PathMeasure {
            size: 5,
            file_count: 1,
            dir_count: 0,
            error_count: 0,
        };
        put_measure(&dir, &measure);

        // Touch directory mtime — old policy would miss; TTL-only must still hit.
        std::thread::sleep(Duration::from_millis(20));
        fs::File::create(dir.join("g.txt"))
            .unwrap()
            .write_all(b"x")
            .unwrap();

        let hit = get_measure(&dir).expect("cache hit after mtime change");
        assert_eq!(hit.size, 5);

        let k1 = cache_key("m", &dir.to_string_lossy(), "");
        let k2 = cache_key("m", &dir.to_string_lossy(), "");
        assert_eq!(k1, k2);

        invalidate_path(&dir);
        assert!(get_measure(&dir).is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_base_is_outside_atmos_home() {
        let base = cache_base().expect("cache base");
        let s = base.to_string_lossy();
        assert!(
            !s.contains("/.atmos/cache"),
            "cache must not live under ~/.atmos/cache, got {s}"
        );
    }
}
