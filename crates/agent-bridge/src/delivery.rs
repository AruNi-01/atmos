use serde::{Deserialize, Serialize};

use crate::address::AgentAddress;
use crate::busy::{plan_delivery, BusyPolicy, DeliveryPlan};
use crate::error::BridgeError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryStatus {
    Accepted,
    QueuedBusy,
    Offline,
    Timeout,
    Rejected,
    Delivered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeliveryAck {
    pub message_id: String,
    pub to: AgentAddress,
    pub status: DeliveryStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl DeliveryAck {
    pub fn new(message_id: impl Into<String>, to: AgentAddress, status: DeliveryStatus) -> Self {
        Self {
            message_id: message_id.into(),
            to,
            status,
            error_code: None,
            detail: None,
        }
    }

    pub fn with_error(mut self, code: impl Into<String>, detail: impl Into<String>) -> Self {
        self.error_code = Some(code.into());
        self.detail = Some(detail.into());
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LiveSession {
    pub provider_id: String,
    pub chat_id: String,
    pub workspace_id: Option<String>,
    pub occupancy_busy: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetResolution {
    Unique(LiveSession),
    None,
    Ambiguous(usize),
}

pub fn resolve_live_targets(
    to: &AgentAddress,
    sessions: &[LiveSession],
    local_server_id: &str,
) -> Result<TargetResolution, BridgeError> {
    if crate::address::is_foreign_server(&to.server_id, local_server_id) {
        return Err(BridgeError::CrossMachineConnect {
            server_id: to.server_id.clone(),
        });
    }
    let matched: Vec<LiveSession> = sessions
        .iter()
        .filter(|s| {
            s.provider_id == to.provider_id
                && to
                    .chat_id
                    .as_ref()
                    .map(|id| &s.chat_id == id)
                    .unwrap_or(true)
                && to
                    .workspace_id
                    .as_ref()
                    .map(|ws| s.workspace_id.as_ref() == Some(ws))
                    .unwrap_or(true)
        })
        .cloned()
        .collect();
    Ok(match matched.len() {
        0 => TargetResolution::None,
        1 => TargetResolution::Unique(matched.into_iter().next().expect("len 1")),
        n => {
            if to.chat_id.is_some() {
                TargetResolution::Unique(matched.into_iter().next().expect("chat_id pins one"))
            } else {
                TargetResolution::Ambiguous(n)
            }
        }
    })
}

pub fn plan_for_busy(busy: bool, policy: BusyPolicy) -> DeliveryPlan {
    plan_delivery(busy, policy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::AgentAddress;

    fn sess(provider: &str, chat: &str) -> LiveSession {
        LiveSession {
            provider_id: provider.into(),
            chat_id: chat.into(),
            workspace_id: None,
            occupancy_busy: false,
        }
    }

    #[test]
    fn unique_and_ambiguous_and_foreign() {
        let sessions = vec![sess("claude", "a"), sess("claude", "b"), sess("codex", "c")];
        let local = "srv-1";
        let unique =
            resolve_live_targets(&AgentAddress::new("local", "codex"), &sessions, local).unwrap();
        assert!(matches!(unique, TargetResolution::Unique(s) if s.chat_id == "c"));

        let amb =
            resolve_live_targets(&AgentAddress::new("local", "claude"), &sessions, local).unwrap();
        assert!(matches!(amb, TargetResolution::Ambiguous(2)));

        let pinned = resolve_live_targets(
            &AgentAddress {
                server_id: "local".into(),
                provider_id: "claude".into(),
                chat_id: Some("b".into()),
                workspace_id: None,
            },
            &sessions,
            local,
        )
        .unwrap();
        assert!(matches!(pinned, TargetResolution::Unique(s) if s.chat_id == "b"));

        let err = resolve_live_targets(&AgentAddress::new("other", "claude"), &sessions, local)
            .unwrap_err();
        assert_eq!(err.code(), "CROSS_MACHINE_CONNECT");
    }

    #[test]
    fn explicit_target_list_is_independent() {
        let sessions = vec![sess("claude", "a"), sess("codex", "c")];
        let local = "srv-1";
        let tos = [
            AgentAddress::new("local", "claude"),
            AgentAddress::new("local", "codex"),
        ];
        let plans: Vec<_> = tos
            .iter()
            .map(|to| resolve_live_targets(to, &sessions, local).unwrap())
            .collect();
        assert_eq!(plans.len(), 2);
        assert!(matches!(plans[0], TargetResolution::Unique(_)));
        assert!(matches!(plans[1], TargetResolution::Unique(_)));
    }
}
