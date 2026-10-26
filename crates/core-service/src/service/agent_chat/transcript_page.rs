use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use chrono::{DateTime, Utc};

use crate::error::{Result, ServiceError};

use super::store::{
    fold_envelopes, merge_live_into_transcript, parse_transcript_envelope_line, read_envelopes,
};
use super::transcript_view::page_messages;
use super::types::{
    apply_rewind_view, flatten_messages, FoldedMessage, PendingPermission, RewindView,
    TranscriptEnvelope, TranscriptEvent,
};

/// Reverse-scan bound for leftover `PartFinished` lookup (QUALITY-035).
pub(super) const LEFTOVER_TRANSCRIPT_TAIL_MAX: usize = 64;

const REVERSE_BLOCK: usize = 64 * 1024;

pub(super) enum ReverseControl {
    Continue,
    Stop,
}

pub(super) struct ReverseWalk {
    pub envelopes_read: u64,
    pub stopped_early: bool,
}

pub(super) struct MessagePage {
    pub messages: Vec<FoldedMessage>,
    pub has_more: bool,
    pub running_turn_id: Option<String>,
    pub running_turn_started_at: Option<DateTime<Utc>>,
    pub pending_permission: Option<PendingPermission>,
    pub fold_envelopes: u64,
    pub transcript_envelopes_read: u64,
}

pub(super) fn for_each_jsonl_envelope_reverse(
    path: &Path,
    mut visit: impl FnMut(TranscriptEnvelope) -> Result<ReverseControl>,
) -> Result<ReverseWalk> {
    if !path.exists() {
        return Ok(ReverseWalk {
            envelopes_read: 0,
            stopped_early: false,
        });
    }
    let mut file = File::open(path).map_err(io_err)?;
    let file_len = file.metadata().map_err(io_err)?.len();
    if file_len == 0 {
        return Ok(ReverseWalk {
            envelopes_read: 0,
            stopped_early: false,
        });
    }

    let mut pos = file_len;
    let mut carry: Vec<u8> = Vec::new();
    let mut envelopes_read = 0u64;

    while pos > 0 {
        let start = pos.saturating_sub(REVERSE_BLOCK as u64);
        let size = (pos - start) as usize;
        file.seek(SeekFrom::Start(start)).map_err(io_err)?;
        let mut chunk = vec![0u8; size];
        file.read_exact(&mut chunk).map_err(io_err)?;
        chunk.extend_from_slice(&carry);

        let mut lines: Vec<Vec<u8>> = Vec::new();
        let mut new_carry = Vec::new();
        for (index, part) in chunk.split(|byte| *byte == b'\n').enumerate() {
            if start > 0 && index == 0 {
                new_carry = part.to_vec();
                continue;
            }
            if !part.is_empty() {
                lines.push(part.to_vec());
            }
        }
        carry = new_carry;

        for part in lines.into_iter().rev() {
            let Ok(line) = String::from_utf8(part) else {
                continue;
            };
            let Some(envelope) = parse_transcript_envelope_line(&line) else {
                continue;
            };
            envelopes_read += 1;
            if matches!(visit(envelope)?, ReverseControl::Stop) {
                return Ok(ReverseWalk {
                    envelopes_read,
                    stopped_early: true,
                });
            }
        }
        pos = start;
    }

    Ok(ReverseWalk {
        envelopes_read,
        stopped_early: false,
    })
}

pub(super) fn fold_message_page(
    dir: &Path,
    rewind: Option<&RewindView>,
    limit: usize,
    before_message_id: Option<&str>,
) -> Result<MessagePage> {
    let limit = limit.max(1);
    let mut live = Vec::new();
    read_envelopes(&dir.join("live.jsonl"), &mut live)?;

    let until_turn = rewind.map(|view| view.until_turn_id.as_str());
    let mut seen_rewind_end = rewind.is_none();
    let mut collecting = before_message_id.is_none();
    let mut collected_rev: Vec<TranscriptEnvelope> = Vec::new();
    let mut turn_starts = 0usize;

    let walk = for_each_jsonl_envelope_reverse(&dir.join("transcript.jsonl"), |envelope| {
        if !seen_rewind_end {
            if envelope.turn_id.as_deref() == until_turn {
                seen_rewind_end = true;
            } else {
                return Ok(ReverseControl::Continue);
            }
        }
        if !collecting {
            if before_message_id.is_some_and(|cursor| envelope_has_message_id(&envelope, cursor)) {
                collecting = true;
            } else {
                return Ok(ReverseControl::Continue);
            }
        }
        let started = matches!(envelope.event, TranscriptEvent::TurnStarted);
        collected_rev.push(envelope);
        if started {
            turn_starts += 1;
            if turn_starts >= limit.saturating_add(2)
                && try_build_page(
                    &collected_rev,
                    &live,
                    rewind,
                    limit,
                    before_message_id,
                    false,
                )
                .is_some()
            {
                return Ok(ReverseControl::Stop);
            }
        }
        Ok(ReverseControl::Continue)
    })?;

    let reached_start = !walk.stopped_early;
    if let Some(page) = try_build_page(
        &collected_rev,
        &live,
        rewind,
        limit,
        before_message_id,
        reached_start,
    ) {
        return Ok(with_read_count(page, walk.envelopes_read));
    }

    if collected_rev.is_empty() && before_message_id.is_none() && !live.is_empty() {
        if let Some(page) = try_build_page(&[], &live, rewind, limit, None, true) {
            return Ok(with_read_count(page, walk.envelopes_read));
        }
    }

    Ok(MessagePage {
        messages: Vec::new(),
        has_more: false,
        running_turn_id: None,
        running_turn_started_at: None,
        pending_permission: None,
        fold_envelopes: 0,
        transcript_envelopes_read: walk.envelopes_read,
    })
}

fn with_read_count(mut page: MessagePage, transcript_envelopes_read: u64) -> MessagePage {
    page.transcript_envelopes_read = transcript_envelopes_read;
    page
}

fn try_build_page(
    collected_rev: &[TranscriptEnvelope],
    live: &[TranscriptEnvelope],
    rewind: Option<&RewindView>,
    limit: usize,
    before_message_id: Option<&str>,
    reached_start: bool,
) -> Option<MessagePage> {
    let window: Vec<TranscriptEnvelope> = collected_rev.iter().rev().cloned().collect();
    let turn_ids: HashSet<String> = window
        .iter()
        .filter_map(|envelope| envelope.turn_id.clone())
        .collect();
    let live_filtered: Vec<TranscriptEnvelope> = if window.is_empty() {
        live.to_vec()
    } else {
        live.iter()
            .filter(|envelope| {
                envelope
                    .turn_id
                    .as_ref()
                    .is_some_and(|turn_id| turn_ids.contains(turn_id))
            })
            .cloned()
            .collect()
    };
    let merged = merge_live_into_transcript(window, live_filtered);
    let pending_permission = last_pending_permission_from(&merged);
    let fold_envelopes_count = merged.len() as u64;
    let turns = apply_rewind_view(fold_envelopes(merged), rewind);
    let (messages, running_turn_id, running_turn_started_at) = flatten_messages(turns);

    if let Some(cursor) = before_message_id {
        if !messages.iter().any(|message| message.id == cursor) {
            return if reached_start {
                Some(MessagePage {
                    messages: Vec::new(),
                    has_more: false,
                    running_turn_id: None,
                    running_turn_started_at: None,
                    pending_permission: None,
                    fold_envelopes: fold_envelopes_count,
                    transcript_envelopes_read: 0,
                })
            } else {
                None
            };
        }
    }

    let (page, more_in_window) = page_messages(&messages, limit, before_message_id);
    if page.len() < limit && !reached_start {
        return None;
    }
    Some(MessagePage {
        messages: page,
        has_more: more_in_window || !reached_start,
        running_turn_id,
        running_turn_started_at,
        pending_permission,
        fold_envelopes: fold_envelopes_count,
        transcript_envelopes_read: 0,
    })
}

fn last_pending_permission_from(envelopes: &[TranscriptEnvelope]) -> Option<PendingPermission> {
    let mut pending = None;
    for envelope in envelopes {
        if let TranscriptEvent::Permission { request } = &envelope.event {
            pending = if request.status == "pending" {
                Some(request.clone())
            } else {
                None
            };
        }
    }
    pending
}

fn envelope_has_message_id(envelope: &TranscriptEnvelope, id: &str) -> bool {
    match &envelope.event {
        TranscriptEvent::UserMessage { message_id, .. }
        | TranscriptEvent::TextChunk { message_id, .. }
        | TranscriptEvent::PartFinished { message_id, .. }
        | TranscriptEvent::ThinkingSnapshot { message_id, .. }
        | TranscriptEvent::AssistantSnapshot { message_id, .. }
        | TranscriptEvent::SessionLifecycle { message_id, .. }
        | TranscriptEvent::SessionConfigChange { message_id, .. }
        | TranscriptEvent::SessionHint { message_id, .. } => message_id == id,
        TranscriptEvent::TurnCompleted { error, .. } => {
            error.as_ref().is_some_and(|value| !value.trim().is_empty())
                && envelope
                    .turn_id
                    .as_deref()
                    .is_some_and(|turn_id| id == format!("error-{turn_id}"))
        }
        _ => false,
    }
}

fn io_err(error: std::io::Error) -> ServiceError {
    ServiceError::Processing(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_chat::types::TranscriptEnvelope;
    use agent::UserMessageKind;
    use std::fs::File;

    fn write_jsonl(path: &Path, envelopes: &[TranscriptEnvelope]) {
        let mut body = String::new();
        for envelope in envelopes {
            body.push_str(&serde_json::to_string(envelope).unwrap());
            body.push('\n');
        }
        std::fs::write(path, body).unwrap();
    }

    fn user_turn(n: usize) -> Vec<TranscriptEnvelope> {
        let turn = format!("t{n}");
        vec![
            TranscriptEnvelope::with_id(
                format!("e-start-{n}"),
                &turn,
                TranscriptEvent::TurnStarted,
            ),
            TranscriptEnvelope::with_id(
                format!("e-user-{n}"),
                &turn,
                TranscriptEvent::UserMessage {
                    message_id: format!("m{n}"),
                    kind: UserMessageKind::Normal,
                    text: format!("msg {n}"),
                    attachments: Vec::new(),
                },
            ),
            TranscriptEnvelope::with_id(
                format!("e-done-{n}"),
                &turn,
                TranscriptEvent::TurnCompleted {
                    status: crate::service::agent_chat::types::TurnStatus::Completed,
                    error: None,
                    worked_ms: None,
                    thinking_ms: None,
                    usage: None,
                },
            ),
        ]
    }

    #[test]
    fn reverse_reader_yields_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("transcript.jsonl");
        let mut records = Vec::new();
        for n in 1..=3 {
            records.extend(user_turn(n));
        }
        write_jsonl(&path, &records);

        let mut seen = Vec::new();
        for_each_jsonl_envelope_reverse(&path, |envelope| {
            if let TranscriptEvent::UserMessage { message_id, .. } = envelope.event {
                seen.push(message_id);
            }
            Ok(ReverseControl::Continue)
        })
        .unwrap();
        assert_eq!(seen, ["m3", "m2", "m1"]);
    }

    #[test]
    fn fold_page_keeps_tail_without_all_turns() {
        let dir = tempfile::tempdir().unwrap();
        let mut records = Vec::new();
        for n in 1..=40 {
            records.extend(user_turn(n));
        }
        write_jsonl(&dir.path().join("transcript.jsonl"), &records);
        File::create(dir.path().join("live.jsonl")).unwrap();

        let page = fold_message_page(dir.path(), None, 20, None).unwrap();
        assert_eq!(page.messages.len(), 20);
        assert!(page.has_more);
        assert_eq!(page.messages[0].id, "m21");
        assert_eq!(page.messages[19].id, "m40");
        assert!(
            page.fold_envelopes < 80,
            "expected O(page) fold, got {}",
            page.fold_envelopes
        );
    }

    #[test]
    fn fold_page_before_id_skips_newer_turns() {
        let dir = tempfile::tempdir().unwrap();
        let mut records = Vec::new();
        for n in 1..=40 {
            records.extend(user_turn(n));
        }
        write_jsonl(&dir.path().join("transcript.jsonl"), &records);
        File::create(dir.path().join("live.jsonl")).unwrap();

        let page = fold_message_page(dir.path(), None, 20, Some("m21")).unwrap();
        let ids: Vec<String> = page
            .messages
            .iter()
            .map(|message| message.id.clone())
            .collect();
        let expected: Vec<String> = (1..=20).map(|n| format!("m{n}")).collect();
        assert_eq!(ids, expected);
        assert!(!page.has_more);
        assert!(
            page.fold_envelopes < 80,
            "older page must not fold skipped newer turns, got {}",
            page.fold_envelopes
        );
    }

    #[test]
    fn unknown_before_id_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        write_jsonl(&dir.path().join("transcript.jsonl"), &user_turn(1));
        File::create(dir.path().join("live.jsonl")).unwrap();
        let page = fold_message_page(dir.path(), None, 20, Some("missing")).unwrap();
        assert!(page.messages.is_empty());
        assert!(!page.has_more);
    }
}
