//! Append-only text-part bookkeeping shared by every provider adapter.
//!
//! A part's text only ever grows, so the bytes already emitted for a `part_id`
//! are the offset of its next chunk. Adapter-synthesized bytes travel through the
//! same counter as vendor bytes — that is what keeps a part's offsets contiguous.
//! A vendor that genuinely revises a part closes it and continues under a new
//! `part_id`; `current` resolves a vendor key to the part it currently addresses.

use std::collections::{HashMap, VecDeque};

use crate::contract::{AgentEvent, AgentEventEnvelope, TextKind};

#[derive(Debug, Default)]
pub(crate) struct TextParts {
    parts: HashMap<String, PartState>,
    /// Next ordinal per `message_id`, shared by Answer and Thinking parts.
    next_ordinal: HashMap<String, u32>,
    /// Open part ids in creation order.
    open: Vec<(String, TextKind)>,
    /// Open part for vendors that expose no part index of their own.
    synthesized: HashMap<(String, TextKind), String>,
    /// Vendor key → the revised part it now addresses.
    redirect: HashMap<String, String>,
    revisions: HashMap<String, u32>,
}

#[derive(Debug, Default)]
struct PartState {
    ordinal: u32,
    text: String,
}

/// How a vendor snapshot relates to what a part already holds.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Snapshot<'a> {
    /// The snapshot only adds bytes, so it applies as an ordinary append.
    Appends(&'a str),
    /// The part already holds the whole snapshot.
    Unchanged,
    /// The vendor replaced content it had already sent. Close the part and
    /// continue under `revise`, because a part's text only ever grows.
    Revised,
}

impl TextParts {
    /// Text already emitted for `part_id`. Its byte length is the next offset.
    pub(crate) fn text(&self, part_id: &str) -> &str {
        self.parts
            .get(part_id)
            .map(|part| part.text.as_str())
            .unwrap_or("")
    }

    /// Classify a vendor full-text snapshot against what `part_id` already holds.
    pub(crate) fn snapshot<'a>(&self, part_id: &str, snapshot: &'a str) -> Snapshot<'a> {
        let emitted = self.text(part_id);
        match snapshot.strip_prefix(emitted) {
            Some("") => Snapshot::Unchanged,
            Some(suffix) => Snapshot::Appends(suffix),
            None => Snapshot::Revised,
        }
    }

    /// Append `text` to `part_id` and stamp the chunk with its byte offset.
    /// Creates the part — assigning its ordinal — the first time it is seen.
    pub(crate) fn chunk(
        &mut self,
        part_id: &str,
        message_id: &str,
        parent_part_id: Option<String>,
        kind: TextKind,
        text: String,
    ) -> AgentEvent {
        let ordinal = self.ensure(part_id, message_id, kind);
        let part = self.parts.get_mut(part_id).expect("part created above");
        let offset = part.text.len() as u64;
        part.text.push_str(&text);
        AgentEvent::TextChunk {
            part_id: part_id.to_string(),
            message_id: message_id.to_string(),
            parent_part_id,
            ordinal,
            kind,
            offset,
            text,
        }
    }

    /// Chunk a nested subagent stream, which hangs off its parent tool call.
    /// These parts stay out of the open set: the pairwise "close the other kind"
    /// rules apply to the host stream only, and would otherwise close and reopen
    /// a subagent part on every tool event.
    pub(crate) fn nested_chunk(
        &mut self,
        message_id: &str,
        parent_tool_call_id: String,
        kind: TextKind,
        text: String,
    ) -> AgentEvent {
        let key = (message_id.to_string(), kind);
        let part_id = match self.synthesized.get(&key) {
            Some(part_id) => part_id.clone(),
            None => {
                let part_id = format!("{message_id}:{}", self.peek_ordinal(message_id));
                self.synthesized.insert(key, part_id.clone());
                part_id
            }
        };
        let ordinal = self.ensure_part(&part_id, message_id);
        let part = self.parts.get_mut(&part_id).expect("part created above");
        let offset = part.text.len() as u64;
        part.text.push_str(&text);
        AgentEvent::TextChunk {
            part_id,
            message_id: message_id.to_string(),
            parent_part_id: Some(parent_tool_call_id),
            ordinal,
            kind,
            offset,
            text,
        }
    }

    /// Close `part_id`. A later chunk for the same vendor key opens a new part.
    pub(crate) fn close(&mut self, part_id: String, duration_ms: Option<u64>) -> AgentEvent {
        self.open.retain(|(id, _)| id != &part_id);
        self.synthesized.retain(|_, id| id != &part_id);
        AgentEvent::PartClosed {
            part_id,
            duration_ms,
        }
    }

    /// Open part ids of `kind`, oldest first.
    pub(crate) fn open_of(&self, kind: TextKind) -> Vec<String> {
        self.open
            .iter()
            .filter(|(_, open_kind)| *open_kind == kind)
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// `part_id` for the open `kind` stream of `message_id`, synthesizing
    /// `{message_id}:{ordinal}` when none is open. For vendors with no part index.
    pub(crate) fn synthesized_id(&mut self, message_id: &str, kind: TextKind) -> String {
        let key = (message_id.to_string(), kind);
        if let Some(part_id) = self.synthesized.get(&key) {
            return part_id.clone();
        }
        let part_id = format!("{message_id}:{}", self.peek_ordinal(message_id));
        self.ensure(&part_id, message_id, kind);
        self.synthesized.insert(key, part_id.clone());
        part_id
    }

    /// The part a vendor key currently addresses, following earlier revisions.
    pub(crate) fn current(&self, vendor_key: &str) -> String {
        self.redirect
            .get(vendor_key)
            .cloned()
            .unwrap_or_else(|| vendor_key.to_string())
    }

    /// Resolve a vendor part id, first time included. A vendor can stream a part's
    /// opening bytes before the frame that names it (OpenCode's `message.part.delta`
    /// arrives without a `partID`), so a newly named part adopts the synthesized
    /// stream already in flight instead of restarting the same bytes as a second part.
    pub(crate) fn adopt_or_current(
        &mut self,
        vendor_key: &str,
        message_id: &str,
        kind: TextKind,
    ) -> String {
        if self.redirect.contains_key(vendor_key) || self.parts.contains_key(vendor_key) {
            return self.current(vendor_key);
        }
        let in_flight = self
            .synthesized
            .get(&(message_id.to_string(), kind))
            .cloned();
        match in_flight {
            Some(part_id) => {
                self.redirect
                    .insert(vendor_key.to_string(), part_id.clone());
                part_id
            }
            None => vendor_key.to_string(),
        }
    }

    /// Point `vendor_key` at a fresh part because the vendor revised its content.
    /// The caller must close the previous part first.
    pub(crate) fn revise(&mut self, vendor_key: &str) -> String {
        let revision = self.revisions.entry(vendor_key.to_string()).or_insert(0);
        *revision += 1;
        let part_id = format!("{vendor_key}#{revision}");
        self.redirect
            .insert(vendor_key.to_string(), part_id.clone());
        part_id
    }

    fn ensure(&mut self, part_id: &str, message_id: &str, kind: TextKind) -> u32 {
        let ordinal = self.ensure_part(part_id, message_id);
        if !self.open.iter().any(|(id, _)| id == part_id) {
            self.open.push((part_id.to_string(), kind));
        }
        ordinal
    }

    fn ensure_part(&mut self, part_id: &str, message_id: &str) -> u32 {
        match self.parts.get(part_id) {
            Some(part) => part.ordinal,
            None => {
                let ordinal = self.take_ordinal(message_id);
                self.parts.insert(
                    part_id.to_string(),
                    PartState {
                        ordinal,
                        text: String::new(),
                    },
                );
                ordinal
            }
        }
    }

    fn peek_ordinal(&self, message_id: &str) -> u32 {
        self.next_ordinal.get(message_id).copied().unwrap_or(0)
    }

    fn take_ordinal(&mut self, message_id: &str) -> u32 {
        let next = self.next_ordinal.entry(message_id.to_string()).or_insert(0);
        let ordinal = *next;
        *next += 1;
        ordinal
    }
}

/// Close every open part of `kind` ahead of `next`, keeping the existing
/// "terminator first, then the event that displaced it" ordering.
pub(crate) fn close_open_parts(
    parts: &mut TextParts,
    pending: &mut VecDeque<AgentEventEnvelope>,
    turn_id: Option<String>,
    kind: TextKind,
    next: AgentEventEnvelope,
) -> AgentEventEnvelope {
    let open = parts.open_of(kind);
    let Some((first, rest)) = open.split_first() else {
        return next;
    };
    let head = AgentEventEnvelope::new(turn_id.clone(), parts.close(first.clone(), None));
    for part_id in rest {
        pending.push_back(AgentEventEnvelope::new(
            turn_id.clone(),
            parts.close(part_id.clone(), None),
        ));
    }
    pending.push_back(next);
    head
}

/// Reassemble emitted chunks by writing each `text` at its stated `offset`,
/// asserting every part's offsets form one contiguous run — no gap, no overlap.
/// Returns `(part_id, kind, text)` in the order the parts first appeared.
#[cfg(test)]
pub(crate) fn reassemble(events: &[AgentEvent]) -> Vec<(String, TextKind, String)> {
    let mut order: Vec<String> = Vec::new();
    let mut built: HashMap<String, (TextKind, String)> = HashMap::new();
    for event in events {
        let AgentEvent::TextChunk {
            part_id,
            kind,
            offset,
            text,
            ..
        } = event
        else {
            continue;
        };
        let entry = built.entry(part_id.clone()).or_insert_with(|| {
            order.push(part_id.clone());
            (*kind, String::new())
        });
        assert_eq!(
            entry.0, *kind,
            "part {part_id} changed kind mid-stream: {:?} then {kind:?}",
            entry.0
        );
        assert_eq!(
            *offset,
            entry.1.len() as u64,
            "part {part_id} chunk at offset {offset} does not continue {} emitted bytes",
            entry.1.len()
        );
        entry.1.push_str(text);
    }
    order
        .into_iter()
        .map(|part_id| {
            let (kind, text) = built.remove(&part_id).expect("built above");
            (part_id, kind, text)
        })
        .collect()
}

/// Concatenated reassembled text for one `TextKind`, parts in creation order.
#[cfg(test)]
pub(crate) fn reassembled_text(events: &[AgentEvent], kind: TextKind) -> String {
    reassemble(events)
        .into_iter()
        .filter(|(_, part_kind, _)| *part_kind == kind)
        .map(|(_, _, text)| text)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_are_contiguous_and_ordinals_are_shared_per_message() {
        let mut parts = TextParts::default();
        let answer = parts.chunk("m:0", "m", None, TextKind::Answer, "ab".into());
        let thinking = parts.chunk("m:think", "m", None, TextKind::Thinking, "x".into());
        let answer_more = parts.chunk("m:0", "m", None, TextKind::Answer, "cd".into());

        assert!(matches!(
            answer,
            AgentEvent::TextChunk { ordinal: 0, offset: 0, ref text, .. } if text == "ab"
        ));
        assert!(matches!(
            thinking,
            AgentEvent::TextChunk {
                ordinal: 1,
                offset: 0,
                ..
            }
        ));
        assert!(matches!(
            answer_more,
            AgentEvent::TextChunk { ordinal: 0, offset: 2, ref text, .. } if text == "cd"
        ));
        assert_eq!(parts.text("m:0"), "abcd");
    }

    #[test]
    fn multibyte_text_advances_the_offset_by_bytes() {
        let mut parts = TextParts::default();
        parts.chunk("p", "m", None, TextKind::Answer, "héllo".into());
        let next = parts.chunk("p", "m", None, TextKind::Answer, "!".into());
        assert!(matches!(next, AgentEvent::TextChunk { offset: 6, .. }));
    }

    #[test]
    fn close_frees_the_synthesized_slot_so_the_next_chunk_opens_a_new_part() {
        let mut parts = TextParts::default();
        let first = parts.synthesized_id("m", TextKind::Answer);
        assert_eq!(first, "m:0");
        assert_eq!(parts.open_of(TextKind::Answer), vec!["m:0".to_string()]);
        parts.close(first, None);
        assert!(parts.open_of(TextKind::Answer).is_empty());
        assert_eq!(parts.synthesized_id("m", TextKind::Answer), "m:1");
    }

    #[test]
    fn a_named_part_adopts_the_synthesized_stream_already_in_flight() {
        let mut parts = TextParts::default();
        let streamed = parts.synthesized_id("msg_a", TextKind::Answer);
        parts.chunk(&streamed, "msg_a", None, TextKind::Answer, "Hello".into());

        // The frame that finally names the part must not restart the same bytes.
        let named = parts.adopt_or_current("prt_text", "msg_a", TextKind::Answer);
        assert_eq!(named, streamed);
        assert_eq!(parts.snapshot(&named, "Hello"), Snapshot::Unchanged);

        // A part named before anything streamed keeps its own id.
        assert_eq!(
            parts.adopt_or_current("prt_other", "msg_b", TextKind::Answer),
            "prt_other"
        );
    }

    #[test]
    fn revise_redirects_the_vendor_key_to_a_fresh_part() {
        let mut parts = TextParts::default();
        parts.chunk("prt_1", "m", None, TextKind::Answer, "hello".into());
        assert_eq!(parts.current("prt_1"), "prt_1");
        let revised = parts.revise("prt_1");
        assert_eq!(revised, "prt_1#1");
        assert_eq!(parts.current("prt_1"), "prt_1#1");
        let chunk = parts.chunk(&revised, "m", None, TextKind::Answer, "hi".into());
        assert!(matches!(chunk, AgentEvent::TextChunk { offset: 0, .. }));
    }
}
