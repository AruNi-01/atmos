//! Typed BLOB reads over the Chromium / Firefox cookie SQLite databases.
//!
//! Never shells out to `sqlite3`. Two open strategies:
//!   * [`open_readonly`] — used by the import path (`extract`). MVP requires the
//!     source browser closed; a locked/busy DB combined with a process-alive
//!     check is classified as `DatabaseBusy` by the caller. `immutable=1` is
//!     deliberately NOT used (it ignores the WAL and can miss newest cookies).
//!   * [`with_snapshot`] — used by the `ai-usage` reuse path, which must keep
//!     working while the browser is open. Copies `Cookies` + `-wal` + `-shm`
//!     into a throwaway temp dir, opens the copy so the WAL is applied to a
//!     consistent snapshot, then deletes the copy.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use crate::types::ExtractError;

// --- Chromium rows --------------------------------------------------------

/// A fully-typed Chromium `cookies` row (import path).
#[derive(Debug, Clone)]
pub(crate) struct ChromiumFullRow {
    pub host_key: String,
    pub name: String,
    pub encrypted_value: Vec<u8>,
    pub value_plain: String,
    pub path: String,
    pub expires_utc: i64,
    pub is_secure: bool,
    pub is_httponly: bool,
    pub samesite: i64,
    pub is_persistent: bool,
    /// Derived: partitioned / CHIPS cookie (has a partition key).
    pub has_partition: bool,
}

/// A minimal Chromium row for the `ai-usage` Cookie-header path.
#[derive(Debug, Clone)]
pub struct ChromiumCookieRow {
    pub host_key: String,
    pub name: String,
    pub encrypted_value: Vec<u8>,
    pub value: String,
}

/// A Firefox `moz_cookies` row for the `ai-usage` path.
#[derive(Debug, Clone)]
pub struct FirefoxCookieRow {
    pub host: String,
    pub name: String,
    pub value: String,
}

/// A fully-typed Firefox row (import path).
#[derive(Debug, Clone)]
pub(crate) struct FirefoxFullRow {
    pub host: String,
    pub name: String,
    pub value: String,
    pub path: String,
    pub expiry: i64,
    pub is_secure: bool,
    pub is_httponly: bool,
    pub same_site: i64,
}

// --- Open strategies ------------------------------------------------------

/// Open the ORIGINAL database strictly read-only with a short busy timeout.
pub(crate) fn open_readonly(path: &Path) -> Result<Connection, ExtractError> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(map_open_error)?;
    conn.busy_timeout(std::time::Duration::from_millis(250))
        .map_err(map_open_error)?;
    Ok(conn)
}

/// Copy `path` (+ `-wal`/`-shm` sidecars) into a fresh temp dir, open the copy,
/// hand it to `f`, then delete the copy. Works whether or not the browser is
/// open. The temp copy is opened read-write (we own it) so the WAL is applied.
pub(crate) fn with_snapshot<T>(
    path: &Path,
    f: impl FnOnce(&Connection) -> Result<T, ExtractError>,
) -> Result<T, ExtractError> {
    let dir = make_temp_dir()?;
    let result = (|| {
        let file_name = path
            .file_name()
            .ok_or_else(|| ExtractError::Io("cookie path has no file name".to_string()))?;
        let dest = dir.join(file_name);
        copy_if_exists(path, &dest)?;
        for ext in ["-wal", "-shm"] {
            let sidecar = with_suffix(path, ext);
            let dest_sidecar = with_suffix(&dest, ext);
            copy_if_exists(&sidecar, &dest_sidecar).ok();
        }
        let conn = Connection::open(&dest).map_err(map_open_error)?;
        f(&conn)
    })();
    // Best-effort cleanup regardless of outcome.
    let _ = std::fs::remove_dir_all(&dir);
    result
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

fn copy_if_exists(src: &Path, dest: &Path) -> Result<(), ExtractError> {
    if !src.exists() {
        return Ok(());
    }
    std::fs::copy(src, dest)
        .map(|_| ())
        .map_err(|e| ExtractError::Io(format!("copy {}: {e}", src.display())))
}

fn make_temp_dir() -> Result<PathBuf, ExtractError> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "atmos-cookies-{}-{}-{}",
        std::process::id(),
        nanos,
        n
    ));
    std::fs::create_dir_all(&dir)
        .map_err(|e| ExtractError::Io(format!("create temp dir: {e}")))?;
    Ok(dir)
}

fn map_open_error(err: rusqlite::Error) -> ExtractError {
    use rusqlite::ffi::ErrorCode;
    if let rusqlite::Error::SqliteFailure(inner, _) = &err {
        match inner.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => return ExtractError::DatabaseBusy,
            ErrorCode::NotADatabase => {
                return ExtractError::InvalidSchema("not a database".to_string())
            }
            _ => {}
        }
    }
    ExtractError::Io(err.to_string())
}

fn map_query_error(err: rusqlite::Error) -> ExtractError {
    use rusqlite::ffi::ErrorCode;
    match &err {
        rusqlite::Error::SqliteFailure(inner, _) => match inner.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => ExtractError::DatabaseBusy,
            _ => ExtractError::InvalidSchema(err.to_string()),
        },
        _ => ExtractError::InvalidSchema(err.to_string()),
    }
}

// --- Column helpers -------------------------------------------------------

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, ExtractError> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(map_query_error)?;
    let cols = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(map_query_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_query_error)?;
    if cols.is_empty() {
        return Err(ExtractError::InvalidSchema(format!(
            "table `{table}` not found or has no columns"
        )));
    }
    Ok(cols)
}

// --- Chromium: full read (import path) ------------------------------------

/// Read every cookie row from a Chromium DB (already opened). Partition columns
/// are read defensively (older schemas lack them).
pub(crate) fn read_chromium_full(conn: &Connection) -> Result<Vec<ChromiumFullRow>, ExtractError> {
    let cols = table_columns(conn, "cookies")?;
    let has = |c: &str| cols.iter().any(|col| col == c);

    for required in ["host_key", "name", "encrypted_value", "path"] {
        if !has(required) {
            return Err(ExtractError::InvalidSchema(format!(
                "cookies missing column `{required}`"
            )));
        }
    }

    // Optional columns vary by Chromium version.
    let value_col = if has("value") { "value" } else { "''" };
    let expires_col = if has("expires_utc") { "expires_utc" } else { "0" };
    let secure_col = if has("is_secure") { "is_secure" } else { "0" };
    let httponly_col = if has("is_httponly") { "is_httponly" } else { "0" };
    let samesite_col = if has("samesite") { "samesite" } else { "-1" };
    let persistent_col = if has("is_persistent") { "is_persistent" } else { "0" };
    // Partition detection: presence of a non-empty top_frame_site_key or a
    // has_cross_site_ancestor flag marks a partitioned/CHIPS cookie.
    let partition_expr = match (has("top_frame_site_key"), has("has_cross_site_ancestor")) {
        (true, true) => {
            "(CASE WHEN top_frame_site_key IS NOT NULL AND top_frame_site_key != '' THEN 1 \
              WHEN has_cross_site_ancestor = 1 THEN 1 ELSE 0 END)"
        }
        (true, false) => {
            "(CASE WHEN top_frame_site_key IS NOT NULL AND top_frame_site_key != '' THEN 1 ELSE 0 END)"
        }
        (false, true) => "(CASE WHEN has_cross_site_ancestor = 1 THEN 1 ELSE 0 END)",
        (false, false) => "0",
    };

    let sql = format!(
        "SELECT host_key, name, encrypted_value, {value_col}, path, {expires_col}, \
         {secure_col}, {httponly_col}, {samesite_col}, {persistent_col}, {partition_expr} \
         FROM cookies"
    );

    let mut stmt = conn.prepare(&sql).map_err(map_query_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ChromiumFullRow {
                host_key: row.get(0)?,
                name: row.get(1)?,
                encrypted_value: row.get::<_, Vec<u8>>(2).unwrap_or_default(),
                value_plain: row.get::<_, String>(3).unwrap_or_default(),
                path: row.get(4)?,
                expires_utc: row.get::<_, i64>(5).unwrap_or(0),
                is_secure: row.get::<_, i64>(6).unwrap_or(0) != 0,
                is_httponly: row.get::<_, i64>(7).unwrap_or(0) != 0,
                samesite: row.get::<_, i64>(8).unwrap_or(-1),
                is_persistent: row.get::<_, i64>(9).unwrap_or(0) != 0,
                has_partition: row.get::<_, i64>(10).unwrap_or(0) != 0,
            })
        })
        .map_err(map_query_error)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(map_query_error)
}

// --- Firefox: full read (import path) -------------------------------------

pub(crate) fn read_firefox_full(conn: &Connection) -> Result<Vec<FirefoxFullRow>, ExtractError> {
    let cols = table_columns(conn, "moz_cookies")?;
    let has = |c: &str| cols.iter().any(|col| col == c);
    for required in ["host", "name", "value", "path"] {
        if !has(required) {
            return Err(ExtractError::InvalidSchema(format!(
                "moz_cookies missing column `{required}`"
            )));
        }
    }
    let expiry_col = if has("expiry") { "expiry" } else { "0" };
    let secure_col = if has("isSecure") { "isSecure" } else { "0" };
    let httponly_col = if has("isHttpOnly") { "isHttpOnly" } else { "0" };
    let samesite_col = if has("sameSite") { "sameSite" } else { "0" };

    let sql = format!(
        "SELECT host, name, value, path, {expiry_col}, {secure_col}, {httponly_col}, {samesite_col} \
         FROM moz_cookies"
    );
    let mut stmt = conn.prepare(&sql).map_err(map_query_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FirefoxFullRow {
                host: row.get(0)?,
                name: row.get(1)?,
                value: row.get::<_, String>(2).unwrap_or_default(),
                path: row.get(3)?,
                expiry: row.get::<_, i64>(4).unwrap_or(0),
                is_secure: row.get::<_, i64>(5).unwrap_or(0) != 0,
                is_httponly: row.get::<_, i64>(6).unwrap_or(0) != 0,
                same_site: row.get::<_, i64>(7).unwrap_or(0),
            })
        })
        .map_err(map_query_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(map_query_error)
}

// --- Filtered reads (ai-usage reuse path) ---------------------------------

/// Domain match values: for each requested domain, include the bare host and
/// the dotted (`.host`) variant, matching Chromium/Firefox `host_key`/`host`.
pub fn domain_candidates(domains: &[&str]) -> Vec<String> {
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

fn placeholders(n: usize) -> String {
    std::iter::repeat("?").take(n).collect::<Vec<_>>().join(",")
}

/// Read Chromium cookie rows filtered by domain (+ optional cookie names),
/// ordered by `last_access_utc DESC` to preserve the `ai-usage` dedup order.
/// Uses a WAL-safe snapshot so it works while the browser is open.
pub fn read_chromium_filtered(
    db_path: &Path,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
) -> Result<Vec<ChromiumCookieRow>, ExtractError> {
    let hosts = domain_candidates(domains);
    if hosts.is_empty() {
        return Ok(Vec::new());
    }
    with_snapshot(db_path, |conn| {
        let cols = table_columns(conn, "cookies")?;
        let has = |c: &str| cols.iter().any(|col| col == c);
        let value_col = if has("value") { "value" } else { "''" };
        let order = if has("last_access_utc") {
            " ORDER BY last_access_utc DESC"
        } else {
            ""
        };

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut sql = format!(
            "SELECT host_key, name, encrypted_value, {value_col} FROM cookies WHERE host_key IN ({})",
            placeholders(hosts.len())
        );
        for h in &hosts {
            params.push(Box::new(h.clone()));
        }
        if let Some(names) = cookie_names {
            let names: Vec<&&str> = names.iter().collect();
            if !names.is_empty() {
                sql.push_str(&format!(" AND name IN ({})", placeholders(names.len())));
                for n in names {
                    params.push(Box::new((*n).to_string()));
                }
            }
        }
        sql.push_str(order);

        let mut stmt = conn.prepare(&sql).map_err(map_query_error)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(ChromiumCookieRow {
                    host_key: row.get(0)?,
                    name: row.get(1)?,
                    encrypted_value: row.get::<_, Vec<u8>>(2).unwrap_or_default(),
                    value: row.get::<_, String>(3).unwrap_or_default(),
                })
            })
            .map_err(map_query_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(map_query_error)
    })
}

/// Read Firefox cookie rows filtered by domain (+ optional cookie names),
/// ordered by `lastAccessed DESC`. WAL-safe snapshot read.
pub fn read_firefox_filtered(
    db_path: &Path,
    domains: &[&str],
    cookie_names: Option<&[&str]>,
) -> Result<Vec<FirefoxCookieRow>, ExtractError> {
    let hosts = domain_candidates(domains);
    if hosts.is_empty() {
        return Ok(Vec::new());
    }
    with_snapshot(db_path, |conn| {
        let cols = table_columns(conn, "moz_cookies")?;
        let has = |c: &str| cols.iter().any(|col| col == c);
        let order = if has("lastAccessed") {
            " ORDER BY lastAccessed DESC"
        } else {
            ""
        };

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut sql = format!(
            "SELECT host, name, value FROM moz_cookies WHERE host IN ({})",
            placeholders(hosts.len())
        );
        for h in &hosts {
            params.push(Box::new(h.clone()));
        }
        if let Some(names) = cookie_names {
            let names: Vec<&&str> = names.iter().collect();
            if !names.is_empty() {
                sql.push_str(&format!(" AND name IN ({})", placeholders(names.len())));
                for n in names {
                    params.push(Box::new((*n).to_string()));
                }
            }
        }
        sql.push_str(order);

        let mut stmt = conn.prepare(&sql).map_err(map_query_error)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(FirefoxCookieRow {
                    host: row.get(0)?,
                    name: row.get(1)?,
                    value: row.get::<_, String>(2).unwrap_or_default(),
                })
            })
            .map_err(map_query_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(map_query_error)
    })
}


#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Build a unique temp path for a throwaway test database.
    fn temp_db_path(tag: &str) -> PathBuf {
        let dir = make_temp_dir().expect("temp dir");
        dir.join(format!("{tag}.db"))
    }

    /// A row inserted into a WAL journal but NOT checkpointed must still be
    /// readable through the snapshot copy (WAL applied to the copy).
    #[test]
    fn reads_row_that_lives_only_in_the_wal() {
        let db = temp_db_path("wal");
        // Writer connection kept open so the WAL is never auto-checkpointed.
        let writer = Connection::open(&db).unwrap();
        writer
            .pragma_update(None, "journal_mode", "WAL")
            .unwrap();
        writer
            .execute_batch(
                "CREATE TABLE cookies (
                    host_key TEXT, name TEXT, encrypted_value BLOB, value TEXT,
                    path TEXT, expires_utc INTEGER, is_secure INTEGER,
                    is_httponly INTEGER, samesite INTEGER, is_persistent INTEGER,
                    last_access_utc INTEGER
                 );",
            )
            .unwrap();
        writer
            .execute(
                "INSERT INTO cookies
                 (host_key, name, encrypted_value, value, path, expires_utc,
                  is_secure, is_httponly, samesite, is_persistent, last_access_utc)
                 VALUES ('example.com','sid', X'763130', '', '/', 0, 1, 1, 1, 0, 100)",
                [],
            )
            .unwrap();
        // Deliberately do NOT checkpoint; keep `writer` alive across the read.

        let rows = read_chromium_filtered(&db, &["example.com"], None).expect("read");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].host_key, "example.com");
        assert_eq!(rows[0].name, "sid");
        // 0x76 0x31 0x30 == b"v10"
        assert_eq!(rows[0].encrypted_value, b"v10");

        drop(writer);
        let _ = std::fs::remove_dir_all(db.parent().unwrap());
    }

    #[test]
    fn domain_candidates_adds_dotted_variants() {
        let got = domain_candidates(&["example.com", ".already.dotted"]);
        assert!(got.contains(&"example.com".to_string()));
        assert!(got.contains(&".example.com".to_string()));
        assert!(got.contains(&"already.dotted".to_string()));
        assert!(got.contains(&".already.dotted".to_string()));
    }

    #[test]
    fn filtered_read_applies_domain_and_name_filters() {
        let db = temp_db_path("filter");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE cookies (
                    host_key TEXT, name TEXT, encrypted_value BLOB, value TEXT,
                    last_access_utc INTEGER
                 );
                 INSERT INTO cookies VALUES ('example.com','keep', X'763130','',3);
                 INSERT INTO cookies VALUES ('example.com','skip', X'763130','',2);
                 INSERT INTO cookies VALUES ('other.com','keep', X'763130','',1);",
            )
            .unwrap();
        }
        let rows =
            read_chromium_filtered(&db, &["example.com"], Some(&["keep"])).expect("read");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].host_key, "example.com");
        assert_eq!(rows[0].name, "keep");
        let _ = std::fs::remove_dir_all(db.parent().unwrap());
    }

    #[test]
    fn invalid_schema_is_reported() {
        let db = temp_db_path("bad");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch("CREATE TABLE not_cookies (x INTEGER);")
                .unwrap();
        }
        let err = read_chromium_filtered(&db, &["example.com"], None).unwrap_err();
        assert!(matches!(err, ExtractError::InvalidSchema(_)));
        let _ = std::fs::remove_dir_all(db.parent().unwrap());
    }
}
