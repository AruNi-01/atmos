use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent::{source_fingerprint, SessionSource};
use infra::{
    host_session_root_key, HostSessionIndexQuery, HostSessionIndexRow, HostSessionRepo,
    HostSessionSearchCursor, HostSessionSearchDoc, HostSessionSearchMatch,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use crate::error::{Result, ServiceError};
use crate::service::agent_chat::store::fold_agent_events;
use crate::service::agent_chat::types::{flatten_messages, FoldedMessage, MessagePart};

pub const SEARCH_TEXT_MAX_BYTES: usize = 32 * 1024;
const SNIPPET_MAX_CHARS: usize = 160;
const SNIPPET_PAD_CHARS: usize = 80;
const CATCHUP_CONCURRENCY: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionSearchHit {
    pub session_key: String,
    pub root_session_key: String,
    pub kind: String,
    pub message_id: Option<String>,
    pub seq: i32,
    pub snippet: String,
}

pub fn looks_like_task_notification(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("<task-notification>") || trimmed.contains("<task-notification>")
}

pub fn extract_search_docs(
    session_key: &str,
    root_session_key: &str,
    title: &str,
    messages: &[FoldedMessage],
) -> Vec<HostSessionSearchDoc> {
    let mut docs = Vec::new();
    if !title.trim().is_empty() {
        docs.push(HostSessionSearchDoc {
            session_key: session_key.to_string(),
            root_session_key: root_session_key.to_string(),
            kind: "title".into(),
            message_id: None,
            seq: -1,
            chunk: 0,
            text: title.to_string(),
        });
    }
    for (seq, message) in messages.iter().enumerate() {
        let kind = match message.role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            _ => continue,
        };
        let text = visible_text(message);
        if text.trim().is_empty() {
            continue;
        }
        if kind == "user" && looks_like_task_notification(&text) {
            continue;
        }
        for (chunk, piece) in chunk_utf8(&text, SEARCH_TEXT_MAX_BYTES)
            .into_iter()
            .enumerate()
        {
            docs.push(HostSessionSearchDoc {
                session_key: session_key.to_string(),
                root_session_key: root_session_key.to_string(),
                kind: kind.to_string(),
                message_id: Some(message.id.clone()).filter(|id| !id.trim().is_empty()),
                seq: seq as i32,
                chunk: chunk as i32,
                text: piece,
            });
        }
    }
    docs
}

pub fn snippet(text: &str, query: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    let term = query.split_whitespace().next().unwrap_or(query);
    let hay = text.to_lowercase();
    let needle = term.to_lowercase();
    let byte_idx = if needle.is_empty() {
        0
    } else {
        hay.find(&needle)
            .filter(|idx| text.is_char_boundary(*idx))
            .unwrap_or(0)
    };
    let char_idx = text
        .get(..byte_idx)
        .map(|prefix| prefix.chars().count())
        .unwrap_or(0);
    let start = char_idx.saturating_sub(SNIPPET_PAD_CHARS);
    let end = (char_idx + needle.chars().count() + SNIPPET_PAD_CHARS).min(chars.len());
    let mut out: String = chars[start..end].iter().collect();
    if start > 0 {
        out.insert_str(0, "…");
    }
    if end < chars.len() {
        out.push('…');
    }
    if out.chars().count() > SNIPPET_MAX_CHARS {
        out = out.chars().take(SNIPPET_MAX_CHARS).collect();
        out.push('…');
    }
    out
}

pub fn primary_hits(
    matches: &[HostSessionSearchMatch],
    query: &str,
) -> (Vec<String>, Vec<HostSessionSearchHit>) {
    let mut seen = std::collections::HashSet::new();
    let mut keys = Vec::new();
    let mut hits = Vec::new();
    for row in matches {
        if !seen.insert(row.root_session_key.clone()) {
            continue;
        }
        keys.push(row.root_session_key.clone());
        hits.push(HostSessionSearchHit {
            session_key: row.session_key.clone(),
            root_session_key: row.root_session_key.clone(),
            kind: row.kind.clone(),
            message_id: row.message_id.clone(),
            seq: row.seq,
            snippet: snippet(&row.text, query),
        });
    }
    (keys, hits)
}

pub fn cursor_is_fresh(cursor: Option<&HostSessionSearchCursor>, mtime_ms: i64, size: i64) -> bool {
    match cursor {
        Some(cursor) => {
            cursor.body_ready && cursor.source_mtime_ms == mtime_ms && cursor.source_size == size
        }
        None => false,
    }
}

pub fn visible_message_count(messages: &[FoldedMessage]) -> u32 {
    messages
        .iter()
        .filter(|message| matches!(message.role.as_str(), "user" | "assistant"))
        .filter(|message| {
            let text = visible_text(message);
            if text.trim().is_empty() {
                return false;
            }
            !(message.role == "user" && looks_like_task_notification(&text))
        })
        .count() as u32
}

struct CatchupParsed {
    session_key: String,
    mtime_ms: i64,
    size: i64,
    message_count: u32,
    docs: Vec<HostSessionSearchDoc>,
}

pub async fn run_search_catchup(
    repo: &HostSessionRepo<'_>,
    roster: Arc<Vec<Box<dyn SessionSource>>>,
) -> Result<bool> {
    let page = repo
        .query(&HostSessionIndexQuery {
            roots_only: false,
            limit: 50_000,
            ..Default::default()
        })
        .await?;
    let mut dirty = Vec::new();
    for row in page.sessions {
        let (mtime, size) = source_fingerprint(Path::new(row.source_path.trim()));
        let cursor = repo.search_cursor(&row.session_key).await?;
        if cursor_is_fresh(cursor.as_ref(), mtime, size) {
            continue;
        }
        dirty.push(row);
    }
    if dirty.is_empty() {
        return Ok(false);
    }

    let sem = Arc::new(Semaphore::new(CATCHUP_CONCURRENCY));
    let mut joins = Vec::with_capacity(dirty.len());
    for row in dirty {
        let permit = sem.clone().acquire_owned().await.map_err(|error| {
            ServiceError::Processing(format!("host session search permit: {error}"))
        })?;
        let roster = Arc::clone(&roster);
        joins.push(tokio::spawn(async move {
            let _permit = permit;
            parse_session_docs(roster, row).await
        }));
    }

    let mut changed = false;
    for join in joins {
        let Ok(Some(parsed)) = join.await else {
            continue;
        };
        repo.replace_session_docs(&parsed.session_key, &parsed.docs)
            .await?;
        repo.set_search_cursor(&parsed.session_key, parsed.mtime_ms, parsed.size, true)
            .await?;
        repo.set_message_count(&parsed.session_key, Some(parsed.message_count))
            .await?;
        changed = true;
    }
    Ok(changed)
}

async fn parse_session_docs(
    roster: Arc<Vec<Box<dyn SessionSource>>>,
    row: HostSessionIndexRow,
) -> Option<CatchupParsed> {
    let session_key = row.session_key.clone();
    let title = row.title.clone();
    let root = host_session_root_key(&row);
    let native_id = row.native_id.clone();
    let provider_id = row.provider_id.clone();
    let source_path = row.source_path.clone();
    let (mtime_ms, size) = source_fingerprint(Path::new(source_path.trim()));
    let envelopes = tokio::task::spawn_blocking(move || {
        let source = roster
            .iter()
            .find(|source| source.provider_id() == provider_id)?;
        let path = if source_path.trim().is_empty() {
            None
        } else {
            Some(PathBuf::from(source_path))
        };
        source.parse_at(&native_id, path.as_deref()).ok()
    })
    .await
    .ok()
    .flatten()?;
    let (messages, _, _) = flatten_messages(fold_agent_events(&envelopes));
    Some(CatchupParsed {
        session_key: session_key.clone(),
        mtime_ms,
        size,
        message_count: visible_message_count(&messages),
        docs: extract_search_docs(&session_key, &root, &title, &messages),
    })
}

fn visible_text(message: &FoldedMessage) -> String {
    let mut out = String::new();
    for part in &message.parts {
        if let MessagePart::Text { text, .. } = part {
            out.push_str(text);
        }
    }
    out
}

fn chunk_utf8(text: &str, max_bytes: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    if text.len() <= max_bytes {
        return vec![text.to_string()];
    }
    let mut out = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + max_bytes).min(text.len());
        while end > start && !text.is_char_boundary(end) {
            end -= 1;
        }
        if end == start {
            end = text[start..]
                .chars()
                .next()
                .map(|ch| start + ch.len_utf8())
                .unwrap_or(text.len());
        }
        out.push(text[start..end].to_string());
        start = end;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_chat::types::FoldedMessage;
    use agent::UserMessageKind;
    use chrono::Utc;

    fn message(id: &str, role: &str, parts: Vec<MessagePart>) -> FoldedMessage {
        FoldedMessage {
            id: id.into(),
            role: role.into(),
            kind: UserMessageKind::Normal,
            parts,
            created_at: Utc::now(),
            streaming: false,
            worked_ms: None,
            thinking_ms: None,
            completed_at: None,
            usage: None,
            checkpoint_id: None,
        }
    }

    #[test]
    fn extract_indexes_title_user_assistant_and_skips_tools_think_task() {
        let docs = extract_search_docs(
            "claude:a",
            "claude:a",
            "Fix sidebar",
            &[
                message(
                    "u1",
                    "user",
                    vec![MessagePart::Text {
                        text: "hello from host".into(),
                        parent_tool_call_id: None,
                        message_id: None,
                    }],
                ),
                message(
                    "a1",
                    "assistant",
                    vec![
                        MessagePart::Thinking {
                            text: "ponder secretly".into(),
                            tool_call_id: None,
                            duration_ms: None,
                            parent_tool_call_id: None,
                        },
                        MessagePart::Text {
                            text: "hi there 你好世界".into(),
                            parent_tool_call_id: None,
                            message_id: None,
                        },
                    ],
                ),
                message(
                    "u2",
                    "user",
                    vec![MessagePart::Text {
                        text: "<task-notification>\n<task-id>x</task-id>\n</task-notification>"
                            .into(),
                        parent_tool_call_id: None,
                        message_id: None,
                    }],
                ),
            ],
        );
        assert_eq!(docs[0].kind, "title");
        assert_eq!(docs[0].seq, -1);
        assert_eq!(docs[1].kind, "user");
        assert_eq!(docs[1].message_id.as_deref(), Some("u1"));
        assert_eq!(docs[1].seq, 0);
        assert_eq!(docs[2].kind, "assistant");
        assert_eq!(docs[2].seq, 1);
        assert!(docs[2].text.contains("你好世界"));
        assert!(!docs.iter().any(|doc| doc.text.contains("ponder")));
        assert!(!docs
            .iter()
            .any(|doc| doc.text.contains("task-notification")));
        assert_eq!(docs.len(), 3);
        assert_eq!(
            visible_message_count(&[
                message(
                    "u1",
                    "user",
                    vec![MessagePart::Text {
                        text: "hello from host".into(),
                        parent_tool_call_id: None,
                        message_id: None,
                    }],
                ),
                message(
                    "a1",
                    "assistant",
                    vec![
                        MessagePart::Thinking {
                            text: "ponder secretly".into(),
                            tool_call_id: None,
                            duration_ms: None,
                            parent_tool_call_id: None,
                        },
                        MessagePart::Text {
                            text: "hi there 你好世界".into(),
                            parent_tool_call_id: None,
                            message_id: None,
                        },
                    ],
                ),
                message(
                    "u2",
                    "user",
                    vec![MessagePart::Text {
                        text: "<task-notification>\n<task-id>x</task-id>\n</task-notification>"
                            .into(),
                        parent_tool_call_id: None,
                        message_id: None,
                    }],
                ),
            ]),
            2
        );
    }

    #[test]
    fn extract_chunks_long_text_on_utf8_boundaries() {
        let text = "你".repeat(20_000);
        assert!(text.len() > SEARCH_TEXT_MAX_BYTES);
        let docs = extract_search_docs(
            "claude:a",
            "claude:a",
            "t",
            &[message(
                "u1",
                "user",
                vec![MessagePart::Text {
                    text,
                    parent_tool_call_id: None,
                    message_id: None,
                }],
            )],
        );
        let chunks: Vec<_> = docs.iter().filter(|doc| doc.kind == "user").collect();
        assert!(chunks.len() > 1);
        for (i, chunk) in chunks.iter().enumerate() {
            assert!(chunk.text.len() <= SEARCH_TEXT_MAX_BYTES);
            assert_eq!(chunk.chunk, i as i32);
            assert_eq!(chunk.seq, 0);
            assert_eq!(chunk.message_id.as_deref(), Some("u1"));
        }
    }

    #[test]
    fn snippet_centers_first_term() {
        let text = format!("{}UNIQUE_PHRASE{}", "aa ".repeat(80), " bb".repeat(80));
        let out = snippet(&text, "UNIQUE_PHRASE");
        assert!(out.contains("UNIQUE_PHRASE"));
        assert!(out.starts_with('…'));
        assert!(out.ends_with('…'));
        assert!(out.chars().count() <= SNIPPET_MAX_CHARS + 1);
    }
}
