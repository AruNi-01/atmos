//! Agent Bridge orchestration (APP-084). Protocol lives in `agent-bridge`.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use agent_bridge::{
    format_inject, is_foreign_server, plan_delivery, resolve_live_targets, terminal_provider_id,
    AgentAddress, BridgeError, BridgeMessage, BridgeState, BusyPolicy, CatalogEntry, ContextBag,
    ContextBagSlices, DeliveryAck, DeliveryPlan, DeliveryStatus, LiveSession, MessageKind,
    Occupancy, ReplyRequest, SendRequest, StatusRequest, TargetResolution, DEFAULT_TTL_MS,
    LOCAL_SERVER_ID,
};
use async_trait::async_trait;
use parking_lot::Mutex;
use runtime_manager::read_server_identity;
use serde::Serialize;
use uuid::Uuid;

use super::agent::AgentService;
use super::agent_chat::{AgentChatService, TurnStatus};
use super::agent_status::{chat_status_session_id, AgentOccupancy, AgentStatusService};
use crate::error::{Result, ServiceError};

const WAIT_POLL: Duration = Duration::from_millis(200);

// `async_trait` boxes each method into `Pin<Box<dyn Future>>` (already
// `#[must_use]`) and also emits a second `#[must_use]`. Keep `async_trait`
// because this trait is used as `dyn` (RPITIT is not object-safe).
#[allow(clippy::double_must_use)]
#[async_trait]
pub trait BridgeChatHost: Send + Sync {
    fn list_chats(&self) -> Result<Vec<LiveSession>>;
    async fn occupancy(&self, chat_id: &str) -> Occupancy;
    async fn inject(&self, chat_id: &str, text: &str) -> Result<()>;
}

fn map_chat_occupancy(
    status: Option<AgentOccupancy>,
    folded_waiting_permission: bool,
    live_turn_busy: bool,
) -> Occupancy {
    match status {
        Some(AgentOccupancy::PermissionRequest) => Occupancy::PermissionRequest,
        Some(AgentOccupancy::Running) => Occupancy::Running,
        _ if folded_waiting_permission => Occupancy::PermissionRequest,
        _ if live_turn_busy => Occupancy::Running,
        _ => Occupancy::Idle,
    }
}

fn chat_folded_waiting_permission(chat: &AgentChatService, chat_id: &str) -> bool {
    chat.store()
        .folded_turns(chat_id)
        .ok()
        .and_then(|turns| {
            turns.into_iter().rev().find(|turn| {
                matches!(
                    turn.status,
                    TurnStatus::Running | TurnStatus::WaitingPermission
                )
            })
        })
        .is_some_and(|turn| turn.status == TurnStatus::WaitingPermission)
}

pub struct AgentChatBridgeHost {
    chat: Arc<AgentChatService>,
    status: Arc<AgentStatusService>,
}

#[async_trait]
impl BridgeChatHost for AgentChatBridgeHost {
    fn list_chats(&self) -> Result<Vec<LiveSession>> {
        let rows = self.chat.list(None, None, None, true, None, None)?;
        Ok(rows
            .into_iter()
            .filter(|row| !row.deleted)
            .map(|row| {
                let updated_at = row.updated_at.to_rfc3339();
                let last_activity_at = row.last_message_at.unwrap_or(row.updated_at).to_rfc3339();
                LiveSession {
                    provider_id: row.provider_id,
                    chat_id: row.id,
                    workspace_id: row.workspace_id,
                    project_id: row.project_id,
                    title: row.title,
                    updated_at: Some(updated_at),
                    last_activity_at: Some(last_activity_at),
                    occupancy_busy: false,
                }
            })
            .collect())
    }

    async fn occupancy(&self, chat_id: &str) -> Occupancy {
        let sid = chat_status_session_id(chat_id);
        let status = self
            .status
            .get_all_sessions()
            .into_iter()
            .find(|s| s.session_id == sid)
            .map(|s| s.state);
        let folded_waiting_permission = chat_folded_waiting_permission(&self.chat, chat_id);
        let live_turn_busy = self.chat.is_live_turn_busy(chat_id).await;
        map_chat_occupancy(status, folded_waiting_permission, live_turn_busy)
    }

    async fn inject(&self, chat_id: &str, text: &str) -> Result<()> {
        if self.occupancy(chat_id).await.is_busy() {
            return Err(ServiceError::Validation(
                "bridge inject refused: target is busy or waiting on permission".into(),
            ));
        }
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
                if !self.host.occupancy(&live.chat_id).await.is_busy() {
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
        let currently_busy = self.host.occupancy(&chat_id).await.is_busy();
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
        let ack = self.try_inject(&message, chat_id).await?;
        if ack.status != DeliveryStatus::Delivered {
            self.state.lock().mailbox.enqueue(message);
        }
        Ok(ack)
    }

    async fn try_inject(&self, message: &BridgeMessage, chat_id: &str) -> Result<DeliveryAck> {
        if self.host.occupancy(chat_id).await.is_busy() {
            return Ok(DeliveryAck::new(
                message.id.clone(),
                message.to.clone(),
                DeliveryStatus::Rejected,
            )
            .with_error("BUSY", "target is busy or waiting on permission"));
        }
        let text = format_inject(message);
        if let Err(err) = self.host.inject(chat_id, &text).await {
            return Ok(DeliveryAck::new(
                message.id.clone(),
                message.to.clone(),
                DeliveryStatus::Rejected,
            )
            .with_error("INJECT_FAILED", err.to_string()));
        }
        Ok(DeliveryAck::new(
            message.id.clone(),
            message.to.clone(),
            DeliveryStatus::Delivered,
        ))
    }

    async fn wait_idle(&self, chat_id: &str, ttl_ms: u64) -> bool {
        let deadline = Instant::now() + Duration::from_millis(ttl_ms);
        loop {
            if !self.host.occupancy(chat_id).await.is_busy() {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            let slice = WAIT_POLL.min(remaining);
            if slice.is_zero() {
                return !self.host.occupancy(chat_id).await.is_busy();
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
        if self.host.occupancy(&resolved.chat_id).await.is_busy() {
            return Ok(Vec::new());
        }
        let mut query = to.clone();
        query.provider_id = resolved.provider_id.clone();
        query.chat_id = Some(resolved.chat_id.clone());
        let popped = {
            let mut state = self.state.lock();
            state.mailbox.pop_matching(&query)
        };
        let Some((idx, msg)) = popped else {
            return Ok(Vec::new());
        };
        let ack = self.try_inject(&msg, &resolved.chat_id).await?;
        if ack.status != DeliveryStatus::Delivered {
            self.state.lock().mailbox.insert(idx, msg);
        }
        Ok(vec![ack])
    }

    async fn gather_catalog(&self, workspace_id: Option<&str>) -> Result<Vec<CatalogEntry>> {
        self.chat_catalog_entries(workspace_id).await
    }

    async fn chat_catalog_entries(&self, workspace_id: Option<&str>) -> Result<Vec<CatalogEntry>> {
        let mut entries = Vec::new();
        let chats = self.host.list_chats()?;
        for chat in chats {
            if let Some(ws) = workspace_id {
                if chat.workspace_id.as_deref() != Some(ws) {
                    continue;
                }
            }
            let occupancy = self.host.occupancy(&chat.chat_id).await;
            entries.push(CatalogEntry::from_live_session(
                &chat,
                &self.server_id,
                occupancy,
            ));
        }
        Ok(entries)
    }

    async fn provider_known(&self, provider_id: &str) -> Result<bool> {
        if let Some(set) = &self.known_providers {
            return Ok(set.contains(provider_id));
        }
        if self
            .host
            .list_chats()?
            .iter()
            .any(|chat| chat.provider_id == provider_id)
        {
            return Ok(true);
        }
        Ok(self.install_provider_ids().await?.contains(provider_id))
    }

    async fn install_provider_ids(&self) -> Result<HashSet<String>> {
        let mut ids = HashSet::new();
        if let Ok(native) = self.agent.list_native_chat_agents() {
            ids.extend(native.into_iter().map(|row| row.id));
        }
        if let Ok(custom) = self.agent.list_custom_agents() {
            ids.extend(custom.into_iter().map(|row| row.name));
        }
        if let Ok(registry) = self.agent.list_registry_agents(false).await {
            ids.extend(registry.into_iter().map(|row| row.id));
        }
        for row in self.agent.list_agents() {
            ids.insert(terminal_provider_id(&row.registry_id).to_string());
        }
        Ok(ids)
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
    use super::{map_chat_occupancy, AgentOccupancy};
    use crate::ServiceError;
    use agent_bridge::{
        AgentAddress, BridgeError, BusyPolicy, ContextBagSlices, DeliveryStatus, Occupancy,
        SendRequest, SendTargets, StatusRequest, LOCAL_SERVER_ID,
    };

    struct MockHost {
        chats: Mutex<Vec<LiveSession>>,
        occupancy: Mutex<std::collections::HashMap<String, Occupancy>>,
        occupancy_calls: Mutex<usize>,
        inject_failures: Mutex<usize>,
        injected: Mutex<Vec<(String, String)>>,
    }

    impl MockHost {
        fn new(chats: Vec<LiveSession>) -> Arc<Self> {
            Arc::new(Self {
                chats: Mutex::new(chats),
                occupancy: Mutex::new(std::collections::HashMap::new()),
                occupancy_calls: Mutex::new(0),
                inject_failures: Mutex::new(0),
                injected: Mutex::new(Vec::new()),
            })
        }

        fn set_occupancy(&self, chat_id: &str, occupancy: Occupancy) {
            self.occupancy.lock().insert(chat_id.to_string(), occupancy);
        }

        fn fail_next_injects(&self, n: usize) {
            *self.inject_failures.lock() = n;
        }
    }

    #[async_trait]
    impl BridgeChatHost for MockHost {
        fn list_chats(&self) -> Result<Vec<LiveSession>> {
            Ok(self.chats.lock().clone())
        }

        async fn occupancy(&self, chat_id: &str) -> Occupancy {
            *self.occupancy_calls.lock() += 1;
            self.occupancy
                .lock()
                .get(chat_id)
                .copied()
                .unwrap_or(Occupancy::Idle)
        }

        async fn inject(&self, chat_id: &str, text: &str) -> Result<()> {
            if self.occupancy(chat_id).await.is_busy() {
                return Err(ServiceError::Validation(
                    "bridge inject refused: target is busy or waiting on permission".into(),
                ));
            }
            {
                let mut remaining = self.inject_failures.lock();
                if *remaining > 0 {
                    *remaining -= 1;
                    return Err(ServiceError::Validation("inject failed".into()));
                }
            }
            self.injected
                .lock()
                .push((chat_id.to_string(), text.to_string()));
            Ok(())
        }
    }

    fn service(host: Arc<MockHost>, providers: &[&str]) -> AgentBridgeService {
        service_with_id(host, providers, "srv-local")
    }

    fn service_with_id(
        host: Arc<MockHost>,
        providers: &[&str],
        server_id: &str,
    ) -> AgentBridgeService {
        AgentBridgeService {
            agent: Arc::new(AgentService::new()),
            host,
            state: Mutex::new(BridgeState::new()),
            server_id: server_id.into(),
            known_providers: Some(providers.iter().map(|s| (*s).to_string()).collect()),
        }
    }

    fn live(provider: &str, chat: &str) -> LiveSession {
        LiveSession::new(provider, chat)
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
    async fn busy_queue_and_status_drains() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.set_occupancy("c1", Occupancy::Running);
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .send(send_to("claude", Some("c1"), "later"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::QueuedBusy);
        assert_eq!(svc.state.lock().mailbox.len(), 1);
        host.set_occupancy("c1", Occupancy::Idle);
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
        host.set_occupancy("c1", Occupancy::Running);
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
    async fn fail_fast_rejects_busy_without_queue() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.set_occupancy("c1", Occupancy::Running);
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

    #[test]
    fn occupancy_maps_permission_request_not_running() {
        assert_eq!(
            map_chat_occupancy(Some(AgentOccupancy::PermissionRequest), false, false),
            Occupancy::PermissionRequest
        );
        assert_eq!(
            map_chat_occupancy(Some(AgentOccupancy::Running), false, false),
            Occupancy::Running
        );
        assert_eq!(
            map_chat_occupancy(Some(AgentOccupancy::Idle), true, false),
            Occupancy::PermissionRequest
        );
        assert_eq!(map_chat_occupancy(None, false, true), Occupancy::Running);
        assert_eq!(map_chat_occupancy(None, false, false), Occupancy::Idle);
    }

    #[tokio::test]
    async fn permission_request_queues_instead_of_injecting() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.set_occupancy("c1", Occupancy::PermissionRequest);
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .send(send_to("claude", Some("c1"), "hold"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::QueuedBusy);
        assert!(host.injected.lock().is_empty());
        assert_eq!(svc.state.lock().mailbox.len(), 1);
    }

    #[tokio::test]
    async fn drain_delivers_one_and_leaves_the_rest_queued() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.set_occupancy("c1", Occupancy::Running);
        let svc = service(host.clone(), &["claude"]);
        svc.send(send_to("claude", Some("c1"), "one"))
            .await
            .unwrap();
        svc.send(send_to("claude", Some("c1"), "two"))
            .await
            .unwrap();
        assert_eq!(svc.state.lock().mailbox.len(), 2);
        host.set_occupancy("c1", Occupancy::Idle);
        let status = svc
            .status(StatusRequest {
                to: Some(AgentAddress::new("local", "claude")),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(status.drained.len(), 1);
        assert_eq!(status.drained[0].status, DeliveryStatus::Delivered);
        assert_eq!(host.injected.lock().len(), 1);
        assert!(host.injected.lock()[0].1.contains("one"));
        assert_eq!(svc.state.lock().mailbox.len(), 1);
        assert!(svc
            .state
            .lock()
            .mailbox
            .get(status.drained[0].message_id.as_str())
            .is_none());
    }

    #[tokio::test]
    async fn drain_requeues_all_matching_when_mid_inject_fails() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.set_occupancy("c1", Occupancy::Running);
        let svc = service(host.clone(), &["claude"]);
        let first = svc
            .send(send_to("claude", Some("c1"), "one"))
            .await
            .unwrap();
        let second = svc
            .send(send_to("claude", Some("c1"), "two"))
            .await
            .unwrap();
        host.fail_next_injects(1);
        host.set_occupancy("c1", Occupancy::Idle);
        let status = svc
            .status(StatusRequest {
                to: Some(AgentAddress::new("local", "claude")),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(status.drained.len(), 1);
        assert_eq!(status.drained[0].status, DeliveryStatus::Rejected);
        assert_eq!(
            status.drained[0].error_code.as_deref(),
            Some("INJECT_FAILED")
        );
        assert!(host.injected.lock().is_empty());
        assert_eq!(svc.state.lock().mailbox.len(), 2);
        assert!(svc.state.lock().mailbox.get(&first[0].message_id).is_some());
        assert!(svc
            .state
            .lock()
            .mailbox
            .get(&second[0].message_id)
            .is_some());
    }

    #[tokio::test]
    async fn inject_rejected_requeues_first_delivery() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        host.fail_next_injects(1);
        let svc = service(host.clone(), &["claude"]);
        let acks = svc
            .send(send_to("claude", Some("c1"), "ping"))
            .await
            .unwrap();
        assert_eq!(acks[0].status, DeliveryStatus::Rejected);
        assert_eq!(acks[0].error_code.as_deref(), Some("INJECT_FAILED"));
        assert!(host.injected.lock().is_empty());
        assert_eq!(svc.state.lock().mailbox.len(), 1);
        assert!(svc.state.lock().mailbox.get(&acks[0].message_id).is_some());
    }

    #[tokio::test]
    async fn local_identity_treats_explicit_other_server_as_foreign() {
        let host = MockHost::new(vec![live("claude", "c1")]);
        let svc = service_with_id(host, &["claude"], LOCAL_SERVER_ID);
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
        let pull = svc
            .status(StatusRequest {
                context_ref: Some("other-computer/bag:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee".into()),
                ..Default::default()
            })
            .await
            .unwrap_err();
        match pull {
            ServiceError::AgentBridge(BridgeError::ContextRefRemote { .. }) => {}
            other => panic!("{other:?}"),
        }
    }
}
