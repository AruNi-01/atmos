//! Cheap per-session size and visible user/assistant-text counts for list rows.
//!
//! Walk metadata and jsonl only. Do not fold transcripts here. Count the same
//! bubbles the preview shows: user prompts and assistant text, not tool_result,
//! thinking-only, tool-only, or vendor stream/update totals.

use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::HostSessionRef;

const SKIP_DIR: &str = "subagents";
const SKIP_JSONL: &[&str] = &["chat_history.jsonl"];
const TEXT_BLOCK_TYPES: &[&str] = &["text", "input_text", "output_text"];

pub fn enrich_host_session_stats(mut row: HostSessionRef) -> HostSessionRef {
    let path = Path::new(row.source_path.trim());
    if path.as_os_str().is_empty() {
        return row;
    }
    if row.byte_size.is_none() {
        row.byte_size = source_byte_size(path);
    }
    if let Some(count) = count_visible_messages(path) {
        row.message_count = Some(count);
    }
    row
}

fn is_sqlite(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "db" | "sqlite" | "sqlite3"
            )
        })
}

/// mtime+size used to skip unchanged jsonl. Directories with `updates.jsonl`
/// (Grok) fingerprint that file so appends are visible.
pub fn source_fingerprint(path: &Path) -> (i64, i64) {
    if path.as_os_str().is_empty() {
        return (0, 0);
    }
    let target = fingerprint_target(path);
    let Ok(meta) = fs::metadata(&target) else {
        return (0, 0);
    };
    let mtime = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    (mtime, i64::try_from(meta.len()).unwrap_or(0))
}

fn fingerprint_target(path: &Path) -> PathBuf {
    if path.is_dir() {
        let updates = path.join("updates.jsonl");
        if updates.is_file() {
            return updates;
        }
    }
    path.to_path_buf()
}

pub fn source_byte_size(path: &Path) -> Option<u64> {
    if is_sqlite(path) {
        return None;
    }
    let meta = fs::metadata(path).ok()?;
    if meta.is_file() {
        return Some(meta.len());
    }
    if meta.is_dir() {
        return Some(dir_size(path, 0));
    }
    None
}

fn dir_size(dir: &Path, depth: usize) -> u64 {
    if depth > 6 {
        return 0;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_symlink() {
            continue;
        }
        if entry.file_name() == SKIP_DIR {
            continue;
        }
        if path.is_dir() {
            total = total.saturating_add(dir_size(&path, depth + 1));
        } else if let Ok(meta) = entry.metadata() {
            total = total.saturating_add(meta.len());
        }
    }
    total
}

fn count_visible_messages(path: &Path) -> Option<u32> {
    if is_sqlite(path) {
        return None;
    }
    if path.is_file() {
        return count_jsonl_file(path);
    }
    if path.is_dir() {
        let updates = path.join("updates.jsonl");
        if updates.is_file() {
            return count_jsonl_file(&updates);
        }
        return Some(count_jsonl_dir(path, 0));
    }
    None
}

fn count_jsonl_dir(dir: &Path, depth: usize) -> u32 {
    if depth > 4 {
        return 0;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut n = 0u32;
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name() == SKIP_DIR {
            continue;
        }
        if skip_jsonl_name(&path) {
            continue;
        }
        if path.is_dir() {
            n = n.saturating_add(count_jsonl_dir(&path, depth + 1));
            continue;
        }
        let is_jsonl = path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"));
        if is_jsonl {
            if let Some(count) = count_jsonl_file(&path) {
                n = n.saturating_add(count);
            }
        }
    }
    n
}

fn skip_jsonl_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            SKIP_JSONL
                .iter()
                .any(|skip| name.eq_ignore_ascii_case(skip))
        })
}

fn count_jsonl_file(path: &Path) -> Option<u32> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut n = 0u32;
    let mut last = LastVisible::None;
    let mut last_user_text: Option<String> = None;
    for line in reader.lines() {
        let Ok(line) = line else {
            continue;
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match classify_visible(&value) {
            Some(Visible::UserChunk) => {
                if last != LastVisible::UserChunk {
                    n = n.saturating_add(1);
                }
                last = LastVisible::UserChunk;
            }
            Some(Visible::User { text }) => {
                // Cursor snapshot logs re-emit the in-flight user prompt.
                if last_user_text.as_deref() == Some(text.as_str()) {
                    continue;
                }
                n = n.saturating_add(1);
                last = LastVisible::User;
                last_user_text = Some(text);
            }
            Some(Visible::Assistant) => {
                if last != LastVisible::Assistant {
                    n = n.saturating_add(1);
                }
                last = LastVisible::Assistant;
            }
            None => {}
        }
    }
    Some(n)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LastVisible {
    None,
    User,
    UserChunk,
    Assistant,
}

enum Visible {
    User { text: String },
    UserChunk,
    Assistant,
}

fn classify_visible(value: &Value) -> Option<Visible> {
    if is_nested_line(value) || is_meta(value) {
        return None;
    }
    if let Some(update) = grok_session_update(value) {
        let text = grok_chunk_text(value);
        return match update {
            "user_message_chunk" if !text.is_empty() => Some(Visible::UserChunk),
            "agent_message_chunk" if !text.is_empty() => Some(Visible::Assistant),
            _ => None,
        };
    }
    if value.get("type").and_then(Value::as_str) == Some("response_item") {
        let payload = value.get("payload").unwrap_or(&Value::Null);
        if payload.get("type").and_then(Value::as_str) != Some("message") {
            return None;
        }
        return classify_role_content(payload, payload);
    }
    classify_role_content(value, value.get("message").unwrap_or(value))
}

fn classify_role_content(role_src: &Value, message: &Value) -> Option<Visible> {
    let role = role_of(role_src).or_else(|| role_of(message))?;
    match role {
        "user" | "human" => {
            let text = visible_user_text(message);
            if text.is_empty() || skip_user_text(&text) {
                None
            } else {
                Some(Visible::User { text })
            }
        }
        "assistant" | "ai" => has_assistant_text(message).then_some(Visible::Assistant),
        _ => None,
    }
}

fn grok_session_update(value: &Value) -> Option<&str> {
    value
        .pointer("/params/update/sessionUpdate")
        .and_then(Value::as_str)
}

fn grok_chunk_text(value: &Value) -> String {
    collect_text(
        value
            .pointer("/params/update/content")
            .unwrap_or(&Value::Null),
        TEXT_BLOCK_TYPES,
    )
}

fn role_of(value: &Value) -> Option<&str> {
    value
        .get("role")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/payload/role").and_then(Value::as_str))
        .or_else(|| value.pointer("/message/role").and_then(Value::as_str))
        .or_else(|| {
            let ty = value.get("type").and_then(Value::as_str)?;
            matches!(ty, "user" | "assistant" | "human" | "ai").then_some(ty)
        })
}

fn is_nested_line(value: &Value) -> bool {
    ["parent_tool_use_id", "parent_tool_call_id"]
        .iter()
        .any(|key| {
            value
                .get(*key)
                .and_then(Value::as_str)
                .is_some_and(|id| !id.trim().is_empty())
        })
}

fn is_meta(value: &Value) -> bool {
    value
        .get("isMeta")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn visible_user_text(message: &Value) -> String {
    collect_text(message.get("content").unwrap_or(message), TEXT_BLOCK_TYPES)
        .trim()
        .to_string()
}

fn has_assistant_text(message: &Value) -> bool {
    !collect_text(message.get("content").unwrap_or(message), TEXT_BLOCK_TYPES)
        .trim()
        .is_empty()
}

fn collect_text(content: &Value, types: &[&str]) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| {
                let block_type = block.get("type").and_then(Value::as_str).unwrap_or("text");
                if block_type == "tool_result" || block_type == "tool_use" {
                    return None;
                }
                if types.contains(&block_type) || block_type == "text" {
                    block
                        .get("text")
                        .and_then(Value::as_str)
                        .or_else(|| block.as_str())
                        .map(ToString::to_string)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(""),
        Value::Object(_) => content
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn skip_user_text(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    if is_environment_context_only(trimmed) {
        return true;
    }
    let start = trimmed.trim_start();
    start.starts_with("<local-command-caveat>") || start.contains("<task-notification>")
}

fn is_environment_context_only(text: &str) -> bool {
    let trimmed = text.trim();
    let Some(rest) = trimmed.strip_prefix("<environment_context>") else {
        return false;
    };
    rest.trim_end()
        .strip_suffix("</environment_context>")
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;

    fn testdata(rel: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/session_source/testdata")
            .join(rel)
    }

    #[test]
    fn counts_visible_user_and_assistant_text_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.jsonl");
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            r#"{{"type":"user","message":{{"role":"user","content":"hi"}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"tool_use","id":"t1","name":"Bash"}}]}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"user","message":{{"role":"user","content":[{{"type":"tool_result","tool_use_id":"t1","content":"ok"}}]}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"text","text":"done"}}]}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"response_item","payload":{{"type":"function_call","role":"assistant"}}}}"#
        )
        .unwrap();
        writeln!(file, r#"{{"type":"progress"}}"#).unwrap();
        drop(file);

        assert_eq!(count_jsonl_file(&path), Some(2));
        assert_eq!(
            source_byte_size(&path),
            Some(fs::metadata(&path).unwrap().len())
        );
    }

    #[test]
    fn counts_host_fixtures_as_visible_bubbles() {
        assert_eq!(count_jsonl_file(&testdata("claude/parent.jsonl")), Some(3));
        assert_eq!(
            count_jsonl_file(&testdata("claude/task_parent.jsonl")),
            Some(2)
        );
        assert_eq!(count_jsonl_file(&testdata("cursor/session.jsonl")), Some(2));
        assert_eq!(
            count_jsonl_file(&testdata("cursor/snapshots.jsonl")),
            Some(4)
        );
        assert_eq!(
            count_jsonl_file(&testdata("cursor/turn_ended_only.jsonl")),
            Some(0)
        );
        assert_eq!(count_jsonl_file(&testdata("grok/updates.jsonl")), Some(2));
        assert_eq!(
            count_jsonl_file(&testdata("codex/user_thread.jsonl")),
            Some(3)
        );
        assert_eq!(count_jsonl_file(&testdata("pi/basic.jsonl")), Some(2));
    }

    #[test]
    fn grok_dir_counts_updates_not_chat_history_or_num_messages() {
        let dir = tempfile::tempdir().unwrap();
        fs::copy(
            testdata("grok/updates.jsonl"),
            dir.path().join("updates.jsonl"),
        )
        .unwrap();
        fs::copy(
            testdata("grok/chat_history.jsonl"),
            dir.path().join("chat_history.jsonl"),
        )
        .unwrap();
        let row = HostSessionRef {
            key: "grok:demo".into(),
            provider_id: "grok".into(),
            native_id: "demo".into(),
            title: "demo".into(),
            cwd: "/tmp/demo".into(),
            project_name: "demo".into(),
            started_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            message_count: Some(515),
            byte_size: None,
            model: None,
            source_path: dir.path().to_string_lossy().into_owned(),
            parent_native_id: None,
        };
        let row = enrich_host_session_stats(row);
        assert_eq!(row.message_count, Some(2));
        assert!(row.byte_size.is_some_and(|size| size > 0));
    }

    #[test]
    fn skips_shared_sqlite_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("opencode.db");
        fs::write(&path, b"not-a-real-db").unwrap();
        assert_eq!(source_byte_size(&path), None);
        assert_eq!(count_visible_messages(&path), None);
    }

    #[test]
    fn fingerprint_uses_updates_jsonl_inside_session_dir() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("updates.jsonl"), b"abc").unwrap();
        let (mtime, size) = source_fingerprint(dir.path());
        let (file_mtime, file_size) = source_fingerprint(&dir.path().join("updates.jsonl"));
        assert_eq!((mtime, size), (file_mtime, file_size));
        assert_eq!(file_size, 3);
        assert_eq!(source_fingerprint(Path::new("")), (0, 0));
        assert_eq!(
            source_fingerprint(&dir.path().join("missing.jsonl")),
            (0, 0)
        );
    }
}
