use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::address::AgentAddress;
use crate::busy::BusyPolicy;
use crate::context::ContextBagSlices;

pub const DEFAULT_TTL_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageKind {
    Send,
    Request,
    Reply,
    Ack,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeMessage {
    pub id: String,
    pub kind: MessageKind,
    pub from: AgentAddress,
    pub to: AgentAddress,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_ref: Option<String>,
    #[serde(default)]
    pub busy: BusyPolicy,
    #[serde(default = "default_ttl")]
    pub ttl_ms: u64,
}

fn default_ttl() -> u64 {
    DEFAULT_TTL_MS
}

impl BridgeMessage {
    pub fn new(
        kind: MessageKind,
        from: AgentAddress,
        to: AgentAddress,
        body: impl Into<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            kind,
            from,
            to,
            body: body.into(),
            correlation_id: None,
            context_ref: None,
            busy: BusyPolicy::default(),
            ttl_ms: DEFAULT_TTL_MS,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SendRequest {
    pub to: SendTargets,
    #[serde(default)]
    pub from: Option<AgentAddress>,
    pub body: String,
    #[serde(default)]
    pub busy: Option<BusyPolicy>,
    #[serde(default)]
    pub ttl_ms: Option<u64>,
    #[serde(default)]
    pub correlation_id: Option<String>,
    #[serde(default)]
    pub bag: Option<ContextBagSlices>,
}

/// One address or an explicit same-Computer list (MVP broadcast).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SendTargets {
    One(AgentAddress),
    Many(Vec<AgentAddress>),
}

impl SendTargets {
    pub fn targets(&self) -> Vec<AgentAddress> {
        match self {
            Self::One(addr) => vec![addr.clone()],
            Self::Many(list) => list.clone(),
        }
    }
}

impl Default for SendTargets {
    fn default() -> Self {
        Self::Many(Vec::new())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplyRequest {
    pub to: AgentAddress,
    #[serde(default)]
    pub from: Option<AgentAddress>,
    pub body: String,
    pub correlation_id: String,
    #[serde(default)]
    pub busy: Option<BusyPolicy>,
    #[serde(default)]
    pub ttl_ms: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListRequest {
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusRequest {
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub context_ref: Option<String>,
    #[serde(default)]
    pub to: Option<AgentAddress>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::AgentAddress;
    use crate::busy::BusyPolicy;

    #[test]
    fn send_targets_untagged_one_or_many() {
        let one: SendTargets = serde_json::from_str(r#"{"provider_id":"claude"}"#).unwrap();
        assert!(matches!(one, SendTargets::One(a) if a.provider_id == "claude"));
        let many: SendTargets =
            serde_json::from_str(r#"[{"provider_id":"claude"},{"provider_id":"codex"}]"#).unwrap();
        assert_eq!(many.targets().len(), 2);
        let req: SendRequest =
            serde_json::from_str(r#"{"to":{"provider_id":"claude","chat_id":"c1"},"body":"hi"}"#)
                .unwrap();
        assert_eq!(req.body, "hi");
        assert_eq!(req.to.targets()[0].chat_id.as_deref(), Some("c1"));
    }

    #[test]
    fn default_busy_on_message_is_queue() {
        let msg = BridgeMessage::new(
            MessageKind::Send,
            AgentAddress::new("local", "cli"),
            AgentAddress::new("local", "claude"),
            "x",
        );
        assert_eq!(msg.busy, BusyPolicy::default());
        assert_eq!(msg.ttl_ms, DEFAULT_TTL_MS);
    }
}
