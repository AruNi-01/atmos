use crate::address::{server_ids_match, AgentAddress};
use crate::envelope::BridgeMessage;

/// In-memory mailbox. Callers serialize access; this type has **no** Mutex.
#[derive(Debug, Default, Clone)]
pub struct Mailbox {
    messages: Vec<BridgeMessage>,
}

impl Mailbox {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    pub fn enqueue(&mut self, message: BridgeMessage) {
        self.messages.push(message);
    }

    pub fn len(&self) -> usize {
        self.messages.len()
    }

    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }

    pub fn get(&self, message_id: &str) -> Option<&BridgeMessage> {
        self.messages.iter().find(|m| m.id == message_id)
    }

    /// Remove and return the first message whose `to` matches `addr`.
    pub fn pop_matching(&mut self, addr: &AgentAddress) -> Option<(usize, BridgeMessage)> {
        let idx = self
            .messages
            .iter()
            .position(|m| address_matches(&m.to, addr))?;
        let msg = self.messages.remove(idx);
        Some((idx, msg))
    }

    /// Put a previously popped message back at `index` (FIFO for that slot).
    pub fn insert(&mut self, index: usize, message: BridgeMessage) {
        let index = index.min(self.messages.len());
        self.messages.insert(index, message);
    }

    /// Remove and return messages whose `to` matches `addr` (provider + optional chat/workspace).
    pub fn drain_matching(&mut self, addr: &AgentAddress) -> Vec<BridgeMessage> {
        let mut kept = Vec::new();
        let mut drained = Vec::new();
        for msg in self.messages.drain(..) {
            if address_matches(&msg.to, addr) {
                drained.push(msg);
            } else {
                kept.push(msg);
            }
        }
        self.messages = kept;
        drained
    }
}

fn address_matches(stored: &AgentAddress, query: &AgentAddress) -> bool {
    // Query is the client-filled side (`to`); stored identity is never a wildcard.
    if !server_ids_match(&query.server_id, &stored.server_id) {
        return false;
    }
    if stored.provider_id != query.provider_id {
        return false;
    }
    if let (Some(a), Some(b)) = (&stored.chat_id, &query.chat_id) {
        if a != b {
            return false;
        }
    }
    if let (Some(a), Some(b)) = (&stored.workspace_id, &query.workspace_id) {
        if a != b {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::MessageKind;

    fn msg(id: &str, to_server: &str, to_provider: &str, body: &str) -> BridgeMessage {
        let mut m = BridgeMessage::new(
            MessageKind::Send,
            AgentAddress::new("local", "cli"),
            AgentAddress::new(to_server, to_provider),
            body,
        );
        m.id = id.into();
        m
    }

    #[test]
    fn enqueue_and_drain_independent_of_other_state() {
        let mut box_a = Mailbox::new();
        let box_b = Mailbox::new();
        box_a.enqueue(msg("1", "local", "claude", "hi"));
        assert_eq!(box_a.len(), 1);
        assert!(box_b.is_empty());
        let drained = box_a.drain_matching(&AgentAddress::new("local", "claude"));
        assert_eq!(drained.len(), 1);
        assert!(box_a.is_empty());
        assert!(box_b.is_empty());
    }

    #[test]
    fn pop_matching_leaves_later_mail_and_insert_restores_order() {
        let mut mailbox = Mailbox::new();
        mailbox.enqueue(msg("a", "srv-local", "claude", "one"));
        mailbox.enqueue(msg("b", "srv-local", "claude", "two"));
        mailbox.enqueue(msg("c", "srv-local", "codex", "other"));
        let query = AgentAddress::new("local", "claude");
        let (idx, first) = mailbox.pop_matching(&query).expect("first matching");
        assert_eq!(first.id, "a");
        assert_eq!(idx, 0);
        assert_eq!(mailbox.len(), 2);
        assert!(mailbox.get("b").is_some());
        mailbox.insert(idx, first);
        assert_eq!(mailbox.len(), 3);
        let ids: Vec<_> = ["a", "b", "c"]
            .iter()
            .filter_map(|id| mailbox.get(id).map(|m| m.id.as_str()))
            .collect();
        assert_eq!(ids, vec!["a", "b", "c"]);
        let (_, again) = mailbox.pop_matching(&query).unwrap();
        assert_eq!(again.id, "a");
        let (_, second) = mailbox.pop_matching(&query).unwrap();
        assert_eq!(second.id, "b");
        assert_eq!(mailbox.len(), 1);
        assert_eq!(mailbox.get("c").unwrap().id, "c");
    }

    #[test]
    fn query_local_matches_stored_real_id_but_not_foreign_identity() {
        let mut mailbox = Mailbox::new();
        mailbox.enqueue(msg("local-mail", "srv-abc", "claude", "hi"));
        assert_eq!(
            mailbox
                .drain_matching(&AgentAddress::new("local", "claude"))
                .len(),
            1
        );

        let mut foreign = Mailbox::new();
        foreign.enqueue(msg("parked", "local", "claude", "hi"));
        assert!(foreign
            .drain_matching(&AgentAddress::new("other-computer", "claude"))
            .is_empty());
        assert_eq!(foreign.len(), 1);
    }
}
