use crate::context::ContextStore;
use crate::mailbox::Mailbox;

/// Per-Server Bridge memory. Two instances never share mail or bags (V1).
#[derive(Debug, Default, Clone)]
pub struct BridgeState {
    pub mailbox: Mailbox,
    pub bags: ContextStore,
}

impl BridgeState {
    pub fn new() -> Self {
        Self {
            mailbox: Mailbox::new(),
            bags: ContextStore::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::AgentAddress;
    use crate::context::{ContextBag, ContextBagSlices};
    use crate::envelope::{BridgeMessage, MessageKind};

    #[test]
    fn two_states_do_not_share_mailbox_or_bags() {
        let mut a = BridgeState::new();
        let b = BridgeState::new();
        a.mailbox.enqueue(BridgeMessage::new(
            MessageKind::Send,
            AgentAddress::new("a", "cli"),
            AgentAddress::new("a", "claude"),
            "x",
        ));
        let bag = a
            .bags
            .put(ContextBag::new("a", ContextBagSlices::default()));
        assert_eq!(a.mailbox.len(), 1);
        assert!(b.mailbox.is_empty());
        assert!(a.bags.get(&bag.id).is_some());
        assert!(b.bags.get(&bag.id).is_none());
        let err = b.bags.pull(&bag.qualified_ref(), "b").unwrap_err();
        assert_eq!(err.code(), "CONTEXT_REF_REMOTE");
    }
}
