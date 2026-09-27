//! Remove one host session's on-disk record without touching shared stores.

use std::fs;
use std::path::Path;

use rusqlite::Connection;

/// Delete the transcript that belongs to `native_id`.
///
/// A missing path is success. Shared sqlite files lose only this session's
/// rows. Other files and directories are removed only when the path names
/// this session, and directories that are too shallow are refused.
pub fn delete_host_session_source(native_id: &str, source_path: &Path) -> Result<(), String> {
    let native_id = native_id.trim();
    if native_id.is_empty() {
        return Err("missing session id".into());
    }
    if source_path.as_os_str().is_empty() {
        return Err("missing source path".into());
    }
    let meta = match fs::symlink_metadata(source_path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if meta.file_type().is_symlink() {
        return Err("refusing to delete a symlink".into());
    }
    if meta.is_file() && is_sqlite_file(source_path) {
        return delete_sqlite_session(source_path, native_id);
    }
    if !path_mentions_session(source_path, native_id) {
        return Err("source path does not belong to this session".into());
    }
    if meta.is_file() {
        fs::remove_file(source_path).map_err(|error| error.to_string())?;
        return Ok(());
    }
    if meta.is_dir() {
        let name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if name != native_id && !name.contains(native_id) {
            return Err("refusing to delete a directory that is not this session".into());
        }
        if source_path.components().count() < 4 {
            return Err("refusing to delete a shallow directory".into());
        }
        fs::remove_dir_all(source_path).map_err(|error| error.to_string())?;
        return Ok(());
    }
    Err("unsupported source path".into())
}

fn is_sqlite_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            ext.eq_ignore_ascii_case("db")
                || ext.eq_ignore_ascii_case("sqlite")
                || ext.eq_ignore_ascii_case("sqlite3")
        })
}

fn path_mentions_session(path: &Path, native_id: &str) -> bool {
    path.to_string_lossy().contains(native_id)
}

fn delete_sqlite_session(path: &Path, native_id: &str) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let mut ids = vec![native_id.to_string()];
    {
        let mut stmt = tx
            .prepare("SELECT id FROM session WHERE parent_id = ?1")
            .map_err(|error| error.to_string())?;
        let children = stmt
            .query_map([native_id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        for child in children {
            ids.push(child.map_err(|error| error.to_string())?);
        }
    }
    for id in &ids {
        ignore_missing_table(tx.execute("DELETE FROM part WHERE session_id = ?1", [id]))?;
        ignore_missing_table(tx.execute("DELETE FROM message WHERE session_id = ?1", [id]))?;
    }
    let mut removed = 0;
    for id in &ids {
        removed += tx
            .execute("DELETE FROM session WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;
    }
    if removed == 0 {
        return Err("session row was not in the database".into());
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn ignore_missing_table(result: Result<usize, rusqlite::Error>) -> Result<(), String> {
    match result {
        Ok(_) => Ok(()),
        Err(error) if error.to_string().contains("no such table") => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("atmos-hs-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn deletes_a_session_jsonl_and_refuses_unrelated_files() {
        let dir = scratch();
        let file = dir.join("abc-session-id.jsonl");
        fs::write(&file, "hi").unwrap();
        delete_host_session_source("abc-session-id", &file).unwrap();
        assert!(!file.exists());

        let other = dir.join("other.jsonl");
        fs::write(&other, "keep").unwrap();
        assert!(delete_host_session_source("abc-session-id", &other).is_err());
        assert_eq!(fs::read_to_string(&other).unwrap(), "keep");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn deletes_only_the_named_session_directory() {
        let dir = scratch();
        let session_dir = dir.join("nested").join("abc-session-id");
        fs::create_dir_all(&session_dir).unwrap();
        fs::write(session_dir.join("summary.json"), "{}").unwrap();
        delete_host_session_source("abc-session-id", &session_dir).unwrap();
        assert!(!session_dir.exists());

        let other = dir.join("nested").join("not-the-id");
        fs::create_dir_all(&other).unwrap();
        assert!(delete_host_session_source("abc-session-id", &other).is_err());
        assert!(other.is_dir());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn deletes_sqlite_session_rows_and_leaves_the_database() {
        let dir = scratch();
        let db = dir.join("opencode.db");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT);
            CREATE TABLE message (id TEXT, session_id TEXT);
            CREATE TABLE part (id TEXT, session_id TEXT);
            INSERT INTO session VALUES ('parent', NULL), ('child', 'parent'), ('other', NULL);
            INSERT INTO message VALUES ('m1', 'parent'), ('m2', 'child'), ('m3', 'other');
            INSERT INTO part VALUES ('p1', 'parent'), ('p2', 'other');
            ",
        )
        .unwrap();
        drop(conn);

        delete_host_session_source("parent", &db).unwrap();
        assert!(db.is_file());
        let conn = Connection::open(&db).unwrap();
        let ids: Vec<String> = conn
            .prepare("SELECT id FROM session ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();
        assert_eq!(ids, vec!["other".to_string()]);
        let messages: i64 = conn
            .query_row("SELECT COUNT(*) FROM message", [], |row| row.get(0))
            .unwrap();
        assert_eq!(messages, 1);
        let _ = fs::remove_dir_all(&dir);
    }
}
