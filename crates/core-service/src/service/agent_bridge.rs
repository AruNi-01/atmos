//! Agent Bridge orchestration (APP-084). Protocol lives in `agent-bridge`.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use agent_bridge::{
    format_inject, is_foreign_server, plan_delivery, resolve_live_targets, terminal_provider_id,
    AgentAddress, BridgeError, BridgeMessage, BridgeState, BusyPolicy, CatalogEntry, CatalogKind,
    ContextBag, ContextBagSlices, DeliveryAck, DeliveryPlan, DeliveryStatus, ListRequest,
    ListResponse, LiveSession, MessageKind, Occupancy, ReplyRequest, SendRequest, StatusRequest,
    TargetResolution, DEFAULT_TTL_MS, LOCAL_SERVER_ID,
};
use async_trait::async_trait;
use parking_lot::Mutex;
use runtime_manager::read_server_identity;
use serde::Serialize;
use uuid::Uuid;

use super::agent::AgentService;
use super::agent_chat::AgentChatService;
use super::agent_status::{chat_status_session_id, AgentOccupancy, AgentStatusService};
use crate::error::Result;

const WAIT_POLL: Duration = Duration::from_millis(200);

#[async_trait]
pub trait BridgeChatHost: Send + Sync {
    fn list_chats(&self) -> Result<Vec<LiveSession>>;
    async fn is_busy(&self, chat_id: &str) -> bool;
    async fn inject(&self, chat_id: &str, text: &str) -> Result<()>;
}

pub struct AgentChatBridgeHost {
    chat: Arc<AgentChatService>,
    status: Arc<AgentStatusService>,
}

#[async_trait]
impl BridgeChatHost for AgentChatBridgeHost {
    fn list_chats(&self) -> Result<Vec<LiveSession>> {
        let rows = self.chat.list(None, None, None, true, None)?;
        Ok(rows
            .into_iter()
            .filter(|row| !row.deleted)
            .map(|row| LiveSession {
                provider_id: row.provider_id,
                chat_id: row.id,
                workspace_id: row.workspace_id,
                occupancy_busy: false,
            })
            .collect())
    }

    async fn is_busy(&self, chat_id: &str) -> bool {
        let sid = chat_status_session_id(chat_id);
        if let Some(session) = self
            .status
            .get_all_sessions()
            .into_iter()
            .find(|s| s.session_id == sid)
        {
            if matches!(
                session.state,
                AgentOccupancy::Running | AgentOccupancy::PermissionRequest
            ) {
                return true;
            }
        }
        self.chat.is_live_turn_busy(chat_id).await
    }

    async fn inject(&self, chat_id: &str, text: &str) -> Result<()> {
        self.chat.send(chat_id, text, Vec::new()).await.map(|_| ())
    }
}

pub struct AgentBridgeService {
    agent: Arc<AgentService>,
    host: Arc<dyn BridgeChatHost>,
    state: Mutex<BridgeState>,
    server_id: String,
    known_providers: Option<HashSet<String>>,
}

impl AgentBridgeService {
    pub fn new(
        agent: Arc<AgentService>,
        chat: Arc<AgentChatService>,
        status: Arc<AgentStatusService>,
    ) -> Self {
        let server_id = read_server_identity()
            .ok()
            .flatten()
            .map(|id| id.server_id)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| LOCAL_SERVER_ID.to_string());
        Self {
            agent,
            host: Arc::new(AgentChatBridgeHost { chat, status }),
            state: Mutex::new(BridgeState::new()),
            server_id,
            known_providers: None,
        }
    }

    pub fn server_id(&self) -> &str {
        &self.server_id
    }

    pub async fn list(&self, req: ListRequest) -> Result<ListResponse> {
        let entries = self.gather_catalog(req.workspace_id.as_deref()).await?;
        Ok(ListResponse {
            server_id: self.server_id.clone(),
            entries,
        })
    }

    pub async fn send(&self, req: SendRequest) -> Result<Vec<DeliveryAck>> {
        self.dispatch_kind(MessageKind::Send, req).await
    }

    pub async fn request(&self, req: SendRequest) -> Result<Vec<DeliveryAck>> {
        self.dispatch_kind(MessageKind::Request, req).await
    }

    pub async fn reply(&self, req: ReplyRequest) -> Result<Vec<DeliveryAck>> {
        if req.correlation_id.trim().is_empty() {
            return Err(BridgeError::Invalid("correlation_id is required".into()).into());
        }
        let send = SendRequest {
            to: agent_bridge::SendTargets::One(req.to),
            from: req.from,
            body: req.body,
            busy: req.busy,
            ttl_ms: req.ttl_ms,
            correlation_id: Some(req.correlation_id),
            bag: None,
        };
        self.dispatch_kind(MessageKind::Reply, send).await
    }

    pub async fn status(&self, req: StatusRequest) -> Result<StatusResponse> {
        if let Some(context_ref) = req.context_ref.as_deref() {
            let bag = {
                let state = self.state.lock();
                state.bags.pull(context_ref, &self.server_id)?
            };
            return Ok(StatusResponse {
                server_id: self.server_id.clone(),
                bag: Some(bag),
                message: None,
                entries: Vec::new(),
                drained: Vec::new(),
            });
        }
        if let Some(message_id) = req.message_id.as_deref() {
            let message = {
                let state = self.state.lock();
                state.mailbox.get(message_id).cloned()
            };
            return Ok(StatusResponse {
                server_id: self.server_id.clone(),
                bag: None,
                message,
                entries: Vec::new(),
                drained: Vec::new(),
            });
        }
        let drained = if let Some(to) = req.to.clone() {
            self.drain_if_idle(&to).await?
        } else {
            Vec::new()
        };
        let entries = self.gather_catalog(req.workspace_id.as_deref()).await?;
        Ok(StatusResponse {
            server_id: self.server_id.clone(),
            bag: None,
            message: None,
            entries,
            drained,
        })
    }

    async fn dispatch_kind(&self, kind: MessageKind, req: SendRequest) -> Result<Vec<DeliveryAck>> {
        let targets = req.to.targets();
        if targets.is_empty() {
            return Err(
                BridgeError::Invalid("at least one `to` address is required".into()).into(),
            );
        }
        let from = req.from.clone().unwrap_or_else(|| AgentAddress {
            server_id: self.server_id.clone(),
            provider_id: "cli".into(),
            chat_id: None,
            workspace_id: None,
        });
        let mut acks = Vec::new();
        for to in targets {
            acks.push(
                self.deliver_one(
                    kind,
                    from.clone(),
                    &to,
                    &req.body,
                    req.busy.unwrap_or_default(),
                    req.ttl_ms.unwrap_or(DEFAULT_TTL_MS),
                    req.correlation_id.clone(),
                    req.bag.clone(),
                )
                .await?,
            );
        }
        Ok(acks)
    }

    #[allow(clippy::too_many_arguments)]
    async fn deliver_one(
        &self,
        kind: MessageKind,
        from: AgentAddress,
        to: &AgentAddress,
        body: &str,
        busy: BusyPolicy,
        ttl_ms: u64,
        correlation_id: Option<String>,
        bag: Option<ContextBagSlices>,
    ) -> Result<DeliveryAck> {
        if is_foreign_server(&to.server_id, &self.server_id) {
            return Err(BridgeError::CrossMachineConnect {
                server_id: to.server_id.clone(),
            }
            .into());
        }
        if to.provider_id.trim().is_empty() {
            return Err(BridgeError::Invalid("to.provider_id is required".into()).into());
        }
        if !self.provider_known(&to.provider_id).await? {
            return Err(BridgeError::UnknownProvider {
                provider_id: to.provider_id.clone(),
            }
            .into());
        }

        let context_ref = if let Some(slices) = bag {
            let stored = {
                let mut state = self.state.lock();
                state
                    .bags
                    .put(ContextBag::new(self.server_id.clone(), slices))
            };
            Some(stored.qualified_ref())
        } else {
            None
        };

        let mut message = BridgeMessage::new(kind, from, to.clone(), body);
        message.to.server_id = self.server_id.clone();
        message.from.server_id = if message.from.server_id.is_empty() {
            self.server_id.clone()
        } else {
            message.from.server_id
        };
        message.busy = busy;
        message.ttl_ms = ttl_ms;
        message.correlation_id = correlation_id
            .or_else(|| (kind == MessageKind::Request).then(|| Uuid::new_v4().to_string()));
        message.context_ref = context_ref;

        let sessions = self.host.list_chats()?;
        let resolved = resolve_live_targets(&message.to, &sessions, &self.server_id)?;
        match resolved {
            TargetResolution::Ambiguous(count) => {
                Err(BridgeError::AmbiguousTarget { count }.into())
            }
            TargetResolution::None => {
                let ack = DeliveryAck::new(
                    message.id.clone(),
                    message.to.clone(),
                    DeliveryStatus::Offline,
                );
                self.state.lock().mailbox.enqueue(message);
                Ok(ack)
            }
            TargetResolution::Unique(live) => {
                message.to.chat_id = Some(live.chat_id.clone());
                message.to.workspace_id = live.workspace_id.clone();
                if !self.host.is_busy(&live.chat_id).await {
                    let _ = self.drain_if_idle(&message.to).await?;
                }
                self.deliver_resolved(message, live.chat_id, busy, ttl_ms)
                    .await
            }
        }
    }

    async fn deliver_resolved(
        &self,
        message: BridgeMessage,
        chat_id: String,
        busy_policy: BusyPolicy,
        ttl_ms: u64,
    ) -> Result<DeliveryAck> {
        let to = message.to.clone();
        let id = message.id.clone();
        let currently_busy = self.host.is_busy(&chat_id).await;
        match plan_delivery(currently_busy, busy_policy) {
            DeliveryPlan::DeliverNow => self.inject_now(message, &chat_id).await,
            DeliveryPlan::Queue => {
                self.state.lock().mailbox.enqueue(message);
                Ok(DeliveryAck::new(id, to, DeliveryStatus::QueuedBusy))
            }
            DeliveryPlan::FailFast => Ok(DeliveryAck::new(id, to, DeliveryStatus::Rejected)
                .with_error("BUSY", "target is busy")),
            DeliveryPlan::Wait => {
                if self.wait_idle(&chat_id, ttl_ms).await {
                    self.inject_now(message, &chat_id).await
                } else {
                    Ok(DeliveryAck::new(id, to, DeliveryStatus::Timeout)
                        .with_error("TIMEOUT", "waited until ttl"))
                }
            }
        }
    }

    async fn inject_now(&self, message: BridgeMessage, chat_id: &str) -> Result<DeliveryAck> {
        let text = format_inject(&message);
        if let Err(err) = self.host.inject(chat_id, &text).await {
            return Ok(
                DeliveryAck::new(message.id, message.to, DeliveryStatus::Rejected)
                    .with_error("INJECT_FAILED", err.to_string()),
            );
        }
        Ok(DeliveryAck::new(
            message.id,
            message.to,
            DeliveryStatus::Delivered,
        ))
    }

    async fn wait_idle(&self, chat_id: &str, ttl_ms: u64) -> bool {
        let deadline = Instant::now() + Duration::from_millis(ttl_ms);
        loop {
            if !self.host.is_busy(chat_id).await {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            let slice = WAIT_POLL.min(remaining);
            if slice.is_zero() {
                return !self.host.is_busy(chat_id).await;
            }
            tokio::time::sleep(slice).await;
        }
    }

    async fn drain_if_idle(&self, to: &AgentAddress) -> Result<Vec<DeliveryAck>> {
        let sessions = self.host.list_chats()?;
        let resolved = match resolve_live_targets(to, &sessions, &self.server_id) {
            Ok(TargetResolution::Unique(live)) => live,
            _ => return Ok(Vec::new()),
        };
        if self.host.is_busy(&resolved.chat_id).await {
            return Ok(Vec::new());
        }
        let queued = {
            let mut state = self.state.lock();
            let mut query = to.clone();
            query.provider_id = resolved.provider_id.clone();
            query.chat_id = Some(resolved.chat_id.clone());
            state.mailbox.drain_matching(&query)
        };
        let mut acks = Vec::new();
        for msg in queued {
            acks.push(self.inject_now(msg, &resolved.chat_id).await?);
        }
        Ok(acks)
    }

    async fn gather_catalog(&self, workspace_id: Option<&str>) -> Result<Vec<CatalogEntry>> {
        let mut entries = Vec::new();
        let sid = self.server_id.clone();
        if self.known_providers.is_some() {
            return self.chat_catalog_entries(workspace_id).await;
        }
        if let Ok(native) = self.agent.list_native_chat_agents() {
            for row in native {
                entries.push(CatalogEntry {
                    kind: CatalogKind::Native,
                    provider_id: row.id.clone(),
                    display_name: row.name,
                    server_id: sid.clone(),
                    chat_id: None,
                    workspace_id: None,
                    occupancy: Occupancy::Unknown,
                    enabled: Some(row.enabled),
                });
            }
        }
        if let Ok(custom) = self.agent.list_custom_agents() {
            for row in custom {
                entries.push(CatalogEntry {
                    kind: CatalogKind::Custom,
                    provider_id: row.name.clone(),
                    display_name: row.display_name.unwrap_or_else(|| row.name.clone()),
                    server_id: sid.clone(),
                    chat_id: None,
                    workspace_id: None,
                    occupancy: Occupancy::Unknown,
                    enabled: Some(row.enabled),
                });
            }
        }
        if let Ok(registry) = self.agent.list_registry_agents(false).await {
            for row in registry {
                entries.push(CatalogEntry {
                    kind: CatalogKind::Registry,
                    provider_id: row.id.clone(),
                    display_name: row.name,
                    server_id: sid.clone(),
                    chat_id: None,
                    workspace_id: None,
                    occupancy: Occupancy::Unknown,
                    enabled: Some(row.enabled),
                });
            }
        }
        for row in self.agent.list_agents() {
            let provider_id = terminal_provider_id(&row.registry_id).to_string();
            entries.push(CatalogEntry {
                kind: CatalogKind::Terminal,
                provider_id,
                display_name: row.name,
                server_id: sid.clone(),
                chat_id: None,
                workspace_id: None,
                occupancy: Occupancy::Unknown,
                enabled: Some(row.installed),
            });
        }
        entries.extend(self.chat_catalog_entries(workspace_id).await?);
        Ok(entries)
    }

    async fn chat_catalog_entries(&self, workspace_id: Option<&str>) -> Result<Vec<CatalogEntry>> {
        let sid = self.server_id.clone();
        let mut entries = Vec::new();
        let chats = self.host.list_chats()?;
        for chat in chats {
            if let Some(ws) = workspace_id {
                if chat.workspace_id.as_deref() != Some(ws) {
                    continue;
                }
            }
            let occupancy = if self.host.is_busy(&chat.chat_id).await {
                Occupancy::Running
            } else {
                Occupancy::Idle
            };
            entries.push(CatalogEntry {
                kind: CatalogKind::Chat,
                provider_id: chat.provider_id,
                display_name: format!("chat {}", chat.chat_id),
                server_id: sid.clone(),
                chat_id: Some(chat.chat_id),
                workspace_id: chat.workspace_id,
                occupancy,
                enabled: None,
            });
        }
        Ok(entries)
    }

    async fn provider_known(&self, provider_id: &str) -> Result<bool> {
        if let Some(set) = &self.known_providers {
            return Ok(set.contains(provider_id));
        }
        let entries = self.gather_catalog(None).await?;
        Ok(entries.iter().any(|e| e.provider_id == provider_id))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusResponse {
    pub server_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bag: Option<ContextBag>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<BridgeMessage>,
    #[serde(default)]
    pub entries: Vec<CatalogEntry>,
    #[serde(default)]
    pub drained: Vec<DeliveryAck>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ServiceError;
    use agent_bridge::{
        AgentAddress, BridgeError, BusyPolicy, CatalogKind, ContextBagSlices, DeliveryStatus,
        ListRequest, Occupancy, SendRequest, SendTargets, StatusRequest,
    };

    struct MockHost {
        chats: Mutex<Vec<LiveSession>>,
        busy: Mutex<HashSet<String>>,
        injected: Mutex<Vec<(String, String)>>,
    }

    impl MockHost {
        fn new(chats: Vec<LiveSession>) -> Arc<Self> {
            Arc::new(Self {
                chats: Mutex::new(chats),
                busy: Mutex::new(HashSet::new()),
                injected: Mutex::new(Vec::new()),
            })
        }
    }

    #[async_trait]
    impl BridgeChatHost for MockHost {
        fn list_chats(&self) -> Result<Vec<LiveSession>> {
            Ok(self.chats.lock().clone())
        }

        async fn is_busy(&self, chat_id: &str) -> bool {
            self.busy.lock().contains(chat_id)
        }

        async fn inject(&self, chat_id: &str, text: &str) -> Result<()> {
            self.injected
                .lock()
                .push((chat_id.to_string(), text.to_string()));
            Ok(())
        }
    }

    fn service(host: Arc<MockHost>, providers: &[&str]) -> AgentBridgeService {
        AgentBridgeService {
            agent: Arc::new(AgentService::new()),
            host,
            state: Mutex::new(BridgeState::new()),
            server_id: "srv-local".into(),
            known_providers: Some(providers.iter().map(|s| (*s).to_string()).collect()),
        }
    }

    fn live(provider: &str, chat: &str) -> LiveSession {
        LiveSession {
            provider_id: provider.into(),
            chat_id: chat.into(),
            workspace_id: None,
            occupancy_busy: false,
        }
    }

    fn send_to(provider: &str, chat: Option<&str>, body: &str) -> SendRequest {
        SendRequest {
            to: SendTargets::One(AgentAddress {
                server_id: "local".into(),
                provider_id: provider.into(),
                chat_id: chat.map(str::to_string),
                workspace_id: None,
            }),
            from: None,
            body: body.into(),
            busy: None,
            ttl_ms: None,
            correlation_id: None,
            bag: None,
        }
    }

    #[tokio::test]
    async fn idle_send_delivers() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .send(send_to("claude", Some("c1"), "ping"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Delivered);
        assert_eq!(host.injected.lock().len(), 1);
        assert!(host.injected.lock()[0].1.contains("ping"));
    }

    #[tokio::test]
    async fn no_live_chat_parks_offline() {
        let host = MockHost::new(vec![]);
        let svc = service(host, &["claude"]);
        let acks = svc.send(send_to("claude", None, "ping")).await.unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Offline);
        assert_eq!(svc.state.lock().mailbox.len(), 1);
    }

    #[tokio::test]
    async fn ambiguous_target_errors() {
        let host = MockHost::new(vec![live("claude", "a"), live("claude", "b")]);
        let svc = service(host, &["claude"]);
        let err = svc.send(send_to("claude", None, "ping")).await.unwrap_err();
        match err {
            ServiceError::AgentBridge(BridgeError::AmbiguousTarget { count }) => {
                assert_eq!(count, 2);
            }
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn busy_queue_and_status_drains_list_does_not() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.busy.lock().insert("c1".into());
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .send(send_to("claude", Some("c1"), "later"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::QueuedBusy);
        svc.list(ListRequest::default()).await.unwrap();
        assert_eq!(svc.state.lock().mailbox.len(), 1);
        host.busy.lock().clear();
        let status = svc
            .status(StatusRequest {
                to: Some(AgentAddress::new("local", "claude")),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(status.drained.len(), 1);
        assert_eq!(status.drained[0].status, DeliveryStatus::Delivered);
        assert!(svc.state.lock().mailbox.is_empty());
    }

    #[tokio::test]
    async fn wait_timeout() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.busy.lock().insert("c1".into());
        let svc = service(host, &["claude"]);
        let mut req = send_to("claude", Some("c1"), "x");
        req.busy = Some(BusyPolicy::Wait);
        req.ttl_ms = Some(0);
        let acks = svc.send(req).await.unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Timeout);
    }

    #[tokio::test]
    async fn foreign_server_connect_hint() {
        let host = MockHost::new(vec![]);
        let svc = service(host, &["claude"]);
        let mut req = send_to("claude", None, "x");
        req.to = SendTargets::One(AgentAddress::new("other-computer", "claude"));
        let err = svc.send(req).await.unwrap_err();
        match err {
            ServiceError::AgentBridge(BridgeError::CrossMachineConnect { server_id }) => {
                assert_eq!(server_id, "other-computer");
            }
            other => panic!("{other:?}"),
        }
        assert!(svc.state.lock().mailbox.is_empty());
    }

    #[tokio::test]
    async fn context_ref_remote_is_pull_not_push() {
        let host = MockHost::new(vec![]);
        let svc = service(host, &["claude"]);
        let err = svc
            .status(StatusRequest {
                context_ref: Some("other/bag:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee".into()),
                ..Default::default()
            })
            .await
            .unwrap_err();
        match err {
            ServiceError::AgentBridge(BridgeError::ContextRefRemote { .. }) => {}
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn list_returns_connected_computer_chats() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        let svc = service(host, &["claude"]);
        let listed = svc.list(ListRequest::default()).await.unwrap();
        assert_eq!(listed.server_id, "srv-local");
        assert_eq!(listed.entries.len(), 1);
        assert_eq!(listed.entries[0].kind, CatalogKind::Chat);
        assert_eq!(listed.entries[0].provider_id, "claude");
        assert_eq!(listed.entries[0].occupancy, Occupancy::Idle);
        assert!(svc.state.lock().mailbox.is_empty());
    }

    #[tokio::test]
    async fn fail_fast_rejects_busy_without_queue() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.busy.lock().insert("c1".into());
        let svc = service(host, &["claude"]);
        let mut req = send_to("claude", Some("c1"), "nope");
        req.busy = Some(BusyPolicy::FailFast);
        let acks = svc.send(req).await.unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Rejected);
        assert_eq!(acks[0].error_code.as_deref(), Some("BUSY"));
        assert!(svc.state.lock().mailbox.is_empty());
    }

    #[tokio::test]
    async fn request_fills_correlation_id() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .request(send_to("claude", Some("c1"), "please"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Delivered);
        let text = host.injected.lock()[0].1.clone();
        assert!(text.contains("kind: request"));
        assert!(text.contains("correlation_id: "));
    }

    #[tokio::test]
    async fn explicit_broadcast_delivers_each_target() {
        let host = MockHost::new(vec![live("claude", "c1"), live("codex", "x1")]);
        let svc = service(host.clone(), &["claude", "codex"]);
        let req = SendRequest {
            to: SendTargets::Many(vec![
                AgentAddress::new("local", "claude"),
                AgentAddress::new("local", "codex"),
            ]),
            from: None,
            body: "hi both".into(),
            busy: None,
            ttl_ms: None,
            correlation_id: None,
            bag: None,
        };
        let acks = svc.send(req).await.unwrap();
        assert_eq!(acks.len(), 2);
        assert!(acks.iter().all(|a| a.status == DeliveryStatus::Delivered));
        assert_eq!(host.injected.lock().len(), 2);
    }

    #[tokio::test]
    async fn unknown_provider_errors() {
        let host = MockHost::new(vec![]);
        let svc = service(host, &["claude"]);
        let err = svc.send(send_to("missing", None, "x")).await.unwrap_err();
        match err {
            ServiceError::AgentBridge(BridgeError::UnknownProvider { provider_id }) => {
                assert_eq!(provider_id, "missing");
            }
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn local_bag_roundtrip() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        let svc = service(host.clone(), &["claude"]);
        let mut req = send_to("claude", Some("c1"), "with bag");
        req.bag = Some(ContextBagSlices {
            goals: vec!["land v1".into()],
            ..Default::default()
        });
        let acks = svc.send(req).await.unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Delivered);
        let text = host.injected.lock()[0].1.clone();
        let line = text
            .lines()
            .find(|l| l.starts_with("context_ref: "))
            .expect("context_ref line");
        let context_ref = line.trim_start_matches("context_ref: ").to_string();
        let status = svc
            .status(StatusRequest {
                context_ref: Some(context_ref),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(
            status.bag.expect("bag").slices.goals,
            vec!["land v1".to_string()]
        );
    }
}
