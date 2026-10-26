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
    if !server_ids_match(&stored.server_id, &query.server_id) {
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

    #[test]
    fn enqueue_and_drain_independent_of_other_state() {
        let mut box_a = Mailbox::new();
        let box_b = Mailbox::new();
        let msg = BridgeMessage::new(
            MessageKind::Send,
            AgentAddress::new("local", "cli"),
            AgentAddress::new("local", "claude"),
            "hi",
        );
        box_a.enqueue(msg.clone());
        assert_eq!(box_a.len(), 1);
        assert!(box_b.is_empty());
        let drained = box_a.drain_matching(&AgentAddress::new("local", "claude"));
        assert_eq!(drained.len(), 1);
        assert!(box_a.is_empty());
        assert!(box_b.is_empty());
    }
}
