//! Timer-driven lossless `TextChunk` concat for `pump_session`.

use std::collections::HashMap;

use agent::{AgentEvent, AgentEventEnvelope};

pub(super) const COALESCE_FLUSH: std::time::Duration = std::time::Duration::from_millis(150);

pub(super) struct TextChunkCoalescer {
    pending: HashMap<String, AgentEventEnvelope>,
    order: Vec<String>,
}

impl TextChunkCoalescer {
    pub(super) fn new() -> Self {
        Self {
            pending: HashMap::new(),
            order: Vec::new(),
        }
    }

    pub(super) fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    /// Hold or concat a `TextChunk`. Any other envelope flushes the whole buffer
    /// and is returned after the pending chunks.
    pub(super) fn push(&mut self, incoming: AgentEventEnvelope) -> Vec<AgentEventEnvelope> {
        let Some(part_id) = text_chunk_part_id(&incoming.payload).map(str::to_owned) else {
            let mut flushed = self.flush_all();
            flushed.push(incoming);
            return flushed;
        };
        if let Some(pending) = self.pending.get_mut(&part_id) {
            if try_concat_pending(pending, &incoming) {
                return Vec::new();
            }
            let flushed = self.pending.remove(&part_id).into_iter().collect();
            self.order.retain(|id| id != &part_id);
            self.insert(part_id, incoming);
            return flushed;
        }
        self.insert(part_id, incoming);
        Vec::new()
    }

    pub(super) fn flush_all(&mut self) -> Vec<AgentEventEnvelope> {
        let order = std::mem::take(&mut self.order);
        let mut pending = std::mem::take(&mut self.pending);
        order
            .into_iter()
            .filter_map(|id| pending.remove(&id))
            .collect()
    }

    fn insert(&mut self, part_id: String, envelope: AgentEventEnvelope) {
        if !self.pending.contains_key(&part_id) {
            self.order.push(part_id.clone());
        }
        self.pending.insert(part_id, envelope);
    }
}

/// Concatenate adjacent or overlapping incoming text onto `pending`.
///
/// `(offset=0, "ab") + (offset=2, "cd")` → `"abcd"`.
/// Overlap appends only the new tail. A gap returns `None` — no invented bytes.
pub(super) fn concat_adjacent_text(
    pending_offset: u64,
    pending_text: &str,
    incoming_offset: u64,
    incoming_text: &str,
) -> Option<String> {
    let pending_end = pending_offset.saturating_add(pending_text.len() as u64);
    let incoming_end = incoming_offset.saturating_add(incoming_text.len() as u64);
    if incoming_offset < pending_offset || incoming_offset > pending_end {
        return None;
    }
    if incoming_end <= pending_end {
        return Some(pending_text.to_string());
    }
    let skip = (pending_end - incoming_offset) as usize;
    if skip > incoming_text.len() || !incoming_text.is_char_boundary(skip) {
        return None;
    }
    let mut text = String::with_capacity(pending_text.len() + incoming_text.len() - skip);
    text.push_str(pending_text);
    text.push_str(&incoming_text[skip..]);
    Some(text)
}

fn text_chunk_part_id(payload: &AgentEvent) -> Option<&str> {
    match payload {
        AgentEvent::TextChunk { part_id, .. } => Some(part_id.as_str()),
        _ => None,
    }
}

fn try_concat_pending(pending: &mut AgentEventEnvelope, incoming: &AgentEventEnvelope) -> bool {
    let (
        AgentEvent::TextChunk {
            offset: pending_offset,
            text: pending_text,
            ..
        },
        AgentEvent::TextChunk {
            offset: incoming_offset,
            text: incoming_text,
            ..
        },
    ) = (&pending.payload, &incoming.payload)
    else {
        return false;
    };
    let Some(text) = concat_adjacent_text(
        *pending_offset,
        pending_text,
        *incoming_offset,
        incoming_text,
    ) else {
        return false;
    };
    let AgentEvent::TextChunk {
        text: pending_text, ..
    } = &mut pending.payload
    else {
        return false;
    };
    *pending_text = text;
    true
}
