use std::path::PathBuf;
use std::sync::Arc;

use super::*;
use core_service::utils::path_boundary::path_or_existing_parent_within_root;
use core_service::{
    default_agent_data_dir, options_probe_plan_for, AgentChatService, CreateAgentChatRequest,
    QueueItemStatus,
};
use serde_json::{json, Value};

impl WsMessageService {
    pub fn agent_chat(&self) -> Arc<AgentChatService> {
        Arc::clone(&self.agent_chat_service)
    }

    async fn resolve_agent_chat_cwd(
        &self,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        cwd: Option<&str>,
    ) -> Result<String> {
        let requested = cwd
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from);
        if let Some(wid) = workspace_id {
            if let Some(automation_guid) = core_service::parse_standalone_scope(wid) {
                let root = core_service::standalone_definition_dir(automation_guid)?;
                std::fs::create_dir_all(&root).ok();
                return bound_cwd(requested, root);
            }
            let workspace = self
                .workspace_service
                .get_workspace(wid.to_string())
                .await?
                .ok_or_else(|| ServiceError::NotFound("Workspace not found".into()))?;
            let root = PathBuf::from(&workspace.local_path);
            return bound_cwd(requested, root);
        }
        if let Some(pid) = project_id {
            let project = self
                .project_service
                .get_project(pid.to_string())
                .await?
                .ok_or_else(|| ServiceError::NotFound("Project not found".into()))?;
            let main_path = PathBuf::from(&project.main_file_path);
            let root = if main_path.is_dir() {
                main_path
            } else {
                main_path.parent().map(PathBuf::from).unwrap_or(main_path)
            };
            return bound_cwd(requested, root);
        }
        let scratch = default_agent_data_dir().join("scratch");
        std::fs::create_dir_all(&scratch).ok();
        bound_cwd(requested, scratch)
    }

    pub(super) async fn handle_agent_chat_create(
        &self,
        req: AgentChatCreateRequest,
    ) -> Result<Value> {
        let cwd = self
            .resolve_agent_chat_cwd(
                req.workspace_id.as_deref(),
                req.project_id.as_deref(),
                req.cwd.as_deref(),
            )
            .await?;
        let meta = self.agent_chat().create(CreateAgentChatRequest {
            workspace_id: req.workspace_id,
            project_id: req.project_id,
            space_id: req.space_id,
            cwd,
            provider_id: req.provider_id.clone(),
            model: req.model.clone(),
            thinking: req.thinking.clone(),
            mode: req.mode.clone(),
            permission_mode: req.permission_mode.clone(),
            fast: req.fast.clone(),
            context: req.context.clone(),
            title: req.title,
            origin: req.origin.unwrap_or_default(),
            source: req.source,
            automation_run_guid: req.automation_run_guid,
        })?;
        agent_chat_meta_json(&meta)
            .map_err(|e| ServiceError::Processing(format!("serialize chat: {e}")))
    }

    pub(super) async fn handle_agent_chat_list(&self, req: AgentChatListRequest) -> Result<Value> {
        let mut items = self.agent_chat().list(
            req.cwd.as_deref(),
            req.workspace_id.as_deref(),
            req.project_id.as_deref(),
            req.all,
            req.origin,
        )?;
        let limit = req.limit.unwrap_or(100).clamp(1, 200) as usize;
        let skip = req
            .cursor
            .as_deref()
            .and_then(|cursor| items.iter().position(|item| item.id == cursor))
            .map(|index| index + 1)
            .unwrap_or(0);
        if skip > 0 {
            items = items.into_iter().skip(skip).collect();
        }
        items.truncate(limit);
        Ok(json!({ "items": items }))
    }

    pub(super) async fn handle_agent_chat_get(&self, req: AgentChatIdRequest) -> Result<Value> {
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        agent_chat_snapshot_json(&snapshot)
            .map_err(|e| ServiceError::Processing(format!("serialize snapshot: {e}")))
    }

    pub(super) async fn handle_agent_chat_messages(
        &self,
        req: AgentChatMessagesRequest,
    ) -> Result<Value> {
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        let mut messages = snapshot.messages;
        if let Some(limit) = req.limit {
            let keep = (limit as usize).max(1);
            let start = messages.len().saturating_sub(keep);
            messages = messages.split_off(start);
        }
        Ok(json!({ "messages": messages }))
    }

    pub(super) async fn handle_agent_chat_rename(
        &self,
        req: AgentChatRenameRequest,
    ) -> Result<Value> {
        let meta = self.agent_chat().rename(&req.chat_id, &req.title)?;
        agent_chat_meta_json(&meta)
            .map_err(|e| ServiceError::Processing(format!("serialize chat: {e}")))
    }

    pub(super) async fn handle_agent_chat_configure(
        &self,
        req: AgentChatConfigureRequest,
    ) -> Result<Value> {
        let meta = self
            .agent_chat()
            .configure(
                &req.chat_id,
                req.provider_id,
                req.model,
                req.thinking,
                req.mode,
                req.permission_mode,
                req.fast,
                req.context,
            )
            .await?;
        agent_chat_meta_json(&meta)
            .map_err(|e| ServiceError::Processing(format!("serialize chat: {e}")))
    }

    pub(super) async fn handle_agent_chat_delete(&self, req: AgentChatIdRequest) -> Result<Value> {
        self.agent_chat().delete(&req.chat_id).await?;
        Ok(json!({ "ok": true }))
    }

    /// Returns whether this call inserted `conn_id`. `false` means it was already subscribed.
    async fn register_agent_chat_sub(&self, chat_id: &str, conn_id: &str) -> bool {
        let mut subs = self.agent_chat_subs.write().await;
        subs.entry(chat_id.to_string())
            .or_default()
            .insert(conn_id.to_string())
    }

    async fn unregister_agent_chat_sub(&self, chat_id: &str, conn_id: &str) {
        let mut subs = self.agent_chat_subs.write().await;
        let Some(conns) = subs.get_mut(chat_id) else {
            return;
        };
        conns.remove(conn_id);
        if conns.is_empty() {
            subs.remove(chat_id);
        }
    }

    pub(super) async fn handle_agent_chat_subscribe(
        &self,
        conn_id: &str,
        req: AgentChatSubscribeRequest,
    ) -> Result<Value> {
        // Register before snapshot and replay. A live emit after this insert is
        // fanned out to conn_id. Replay may deliver the same event; the client
        // EventGate dedupes on event_id. This handler does not filter that overlap.
        // Roll back only a conn this call inserted. A repeat subscribe that fails
        // must leave the earlier registration in place.
        let inserted = self.register_agent_chat_sub(&req.chat_id, conn_id).await;
        if let Err(error) = self.agent_chat().get(&req.chat_id).await {
            if inserted {
                self.unregister_agent_chat_sub(&req.chat_id, conn_id).await;
            }
            return Err(error);
        }
        let after = req.after_sequence.unwrap_or(0);
        let missed = self.agent_chat().events_after(&req.chat_id, after);
        #[cfg(test)]
        subscribe_race_pause::pause(conn_id).await;
        if let Some(manager) = self.ws_manager.get() {
            for event in missed {
                if let Ok(payload) = serde_json::to_value(&event) {
                    let message = crate::api::ws::message::WsMessage::notification(
                        crate::api::ws::message::WsEvent::AgentChatEvent,
                        payload,
                    );
                    let _ = manager.send_to(conn_id, &message).await;
                }
            }
        }
        let last_event_seq = match self.agent_chat().store().get_meta(&req.chat_id) {
            Ok(meta) => meta.last_event_seq,
            Err(error) => {
                if inserted {
                    self.unregister_agent_chat_sub(&req.chat_id, conn_id).await;
                }
                return Err(error);
            }
        };
        Ok(json!({ "last_event_seq": last_event_seq }))
    }

    pub(super) async fn handle_agent_chat_backfill(
        &self,
        req: AgentChatBackfillRequest,
    ) -> Result<Value> {
        let parts: Vec<(String, u64)> = req
            .parts
            .into_iter()
            .map(|part| (part.part_id, part.from_offset))
            .collect();
        let accepted = self.agent_chat().backfill(&req.chat_id, &parts).await?;
        Ok(json!({ "accepted": accepted }))
    }

    pub(super) async fn handle_agent_chat_unsubscribe(
        &self,
        conn_id: &str,
        req: AgentChatIdRequest,
    ) -> Result<Value> {
        self.unregister_agent_chat_sub(&req.chat_id, conn_id).await;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_send(&self, req: AgentChatSendRequest) -> Result<Value> {
        let turn_id = self
            .agent_chat()
            .send_with_message_id(
                &req.chat_id,
                &req.text,
                req.attachment_paths.unwrap_or_default(),
                req.message_id,
            )
            .await?;
        Ok(json!({ "turn_id": turn_id }))
    }

    pub(super) async fn handle_agent_chat_steer(
        &self,
        req: AgentChatSteerRequest,
    ) -> Result<Value> {
        let turn_id = self
            .agent_chat()
            .steer(&req.chat_id, &req.expected_turn_id, &req.text)
            .await?;
        Ok(json!({ "turn_id": turn_id }))
    }

    pub(super) async fn handle_agent_chat_queue_add(
        &self,
        req: AgentChatQueueAddRequest,
    ) -> Result<Value> {
        let item = self.agent_chat().queue_add(
            &req.chat_id,
            &req.text,
            req.attachment_paths.unwrap_or_default(),
        )?;
        serde_json::to_value(item)
            .map_err(|e| ServiceError::Processing(format!("serialize queue item: {e}")))
    }

    pub(super) async fn handle_agent_chat_queue_update(
        &self,
        req: AgentChatQueueUpdateRequest,
    ) -> Result<Value> {
        let status = req.status.as_deref().map(|value| match value {
            "paused" => QueueItemStatus::Paused,
            _ => QueueItemStatus::Pending,
        });
        let item = self
            .agent_chat()
            .queue_update(&req.chat_id, &req.item_id, req.text, status)?;
        serde_json::to_value(item)
            .map_err(|e| ServiceError::Processing(format!("serialize queue item: {e}")))
    }

    pub(super) async fn handle_agent_chat_queue_reorder(
        &self,
        req: AgentChatQueueReorderRequest,
    ) -> Result<Value> {
        let items = self
            .agent_chat()
            .queue_reorder(&req.chat_id, &req.item_ids)?;
        Ok(json!({ "items": items }))
    }

    pub(super) async fn handle_agent_chat_queue_delete(
        &self,
        req: AgentChatQueueDeleteRequest,
    ) -> Result<Value> {
        self.agent_chat().queue_delete(&req.chat_id, &req.item_id)?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_cancel(&self, req: AgentChatIdRequest) -> Result<Value> {
        self.agent_chat().cancel(&req.chat_id).await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_permission_respond(
        &self,
        req: AgentChatPermissionRespondRequest,
    ) -> Result<Value> {
        let option_id = req
            .option_id
            .filter(|id| !id.trim().is_empty())
            .or_else(|| {
                req.allowed.map(|allowed| {
                    if allowed {
                        "allow".to_string()
                    } else {
                        "reject".to_string()
                    }
                })
            })
            .ok_or_else(|| ServiceError::Validation("option_id is required".into()))?;
        self.agent_chat()
            .permission_respond(&req.chat_id, &req.request_id, &option_id)
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_session_op_respond(
        &self,
        req: AgentChatSessionOpRespondRequest,
    ) -> Result<Value> {
        self.agent_chat()
            .session_op_respond(&req.chat_id, &req.request_id, &req.option_id)
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_options_get(
        &self,
        req: AgentOptionsGetRequest,
    ) -> Result<Value> {
        let worker = Arc::clone(&self.options_worker);
        if req.agent_id.contains('/') || req.agent_id.contains('\\') || req.agent_id.contains("..")
        {
            return Err(ServiceError::Validation("invalid agent_id".into()));
        }
        let spec = options_probe_plan_for(&req.agent_id);
        if let Some(auth_method_id) = req
            .auth_method_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        {
            worker
                .authenticate(
                    &spec,
                    auth_method_id,
                    req.auth_secret
                        .as_deref()
                        .map(str::trim)
                        .filter(|secret| !secret.is_empty()),
                )
                .await
                .map_err(ServiceError::Processing)?;
            // Authenticate RPC completing is the OAuth callback. Return last-good
            // without waiting for a second catalog probe so the dialog can show
            // Authenticated and close; the client then refreshes the selected agent.
            let catalog = worker
                .get_cached_or_probing(&spec, false)
                .after_successful_authenticate();
            return serde_json::to_value(catalog)
                .map_err(|e| ServiceError::Processing(format!("serialize catalog: {e}")));
        }
        let catalog = worker.get_cached_or_probing(&spec, req.refresh.unwrap_or(false));
        serde_json::to_value(catalog)
            .map_err(|e| ServiceError::Processing(format!("serialize catalog: {e}")))
    }

    pub(super) fn handle_agent_chat_prefs_get(&self) -> Result<Value> {
        let prefs = core_service::load_agent_chat_prefs()?;
        serde_json::to_value(prefs)
            .map_err(|e| ServiceError::Processing(format!("serialize agent chat prefs: {e}")))
    }

    pub(super) fn handle_agent_chat_prefs_set(
        &self,
        req: AgentChatPrefsSetRequest,
    ) -> Result<Value> {
        if let Some(raw) = req.last_registry_id {
            let trimmed = raw.trim();
            let last_registry_id = (!trimmed.is_empty()).then(|| trimmed.to_string());
            core_service::save_last_registry_id(last_registry_id)?;
        }
        if let Some(patch) = req.last_new_chat_config {
            if !patch.agent_id.trim().is_empty() {
                self.agent_chat().persist_last_new_chat_config(
                    &patch.agent_id,
                    patch.model.as_deref(),
                    patch.thinking.as_deref(),
                    patch.mode.as_deref(),
                    patch.permission_mode.as_deref(),
                    patch.fast.as_deref(),
                    patch.context.as_deref(),
                )?;
            }
        }
        if let Some(favorites) = req.favorite_models {
            core_service::save_favorite_models(
                favorites
                    .into_iter()
                    .map(|item| core_service::AgentChatFavoriteModel {
                        agent_id: item.agent_id,
                        model: item.model,
                        label: item.label,
                    })
                    .collect(),
            )?;
        }
        self.handle_agent_chat_prefs_get()
    }
}

fn bound_cwd(requested: Option<PathBuf>, root: PathBuf) -> Result<String> {
    let Some(candidate) = requested else {
        return Ok(root.to_string_lossy().to_string());
    };
    if path_or_existing_parent_within_root(&candidate, &root) {
        return Ok(candidate.to_string_lossy().to_string());
    }
    Err(ServiceError::Validation(
        "cwd must be inside the workspace or project".into(),
    ))
}

#[cfg(test)]
mod subscribe_race_pause {
    use std::sync::Mutex;

    use tokio::sync::oneshot;

    struct Pause {
        conn_id: String,
        entered: oneshot::Sender<()>,
        release: oneshot::Receiver<()>,
    }

    static PAUSE: Mutex<Option<Pause>> = Mutex::new(None);

    pub(super) struct Guard {
        conn_id: String,
        entered: Option<oneshot::Receiver<()>>,
        release: Option<oneshot::Sender<()>>,
    }

    impl Guard {
        pub(super) async fn entered(&mut self) -> bool {
            match self.entered.take() {
                Some(entered) => entered.await.is_ok(),
                None => false,
            }
        }

        pub(super) fn release(&mut self) {
            if let Some(release) = self.release.take() {
                let _ = release.send(());
            }
        }
    }

    impl Drop for Guard {
        fn drop(&mut self) {
            self.release();
            if let Ok(mut slot) = PAUSE.lock() {
                if slot
                    .as_ref()
                    .is_some_and(|pause| pause.conn_id == self.conn_id)
                {
                    slot.take();
                }
            }
        }
    }

    pub(super) fn arm(conn_id: &str) -> Guard {
        let (entered_tx, entered_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        *PAUSE.lock().expect("subscribe replay pause") = Some(Pause {
            conn_id: conn_id.to_string(),
            entered: entered_tx,
            release: release_rx,
        });
        Guard {
            conn_id: conn_id.to_string(),
            entered: Some(entered_rx),
            release: Some(release_tx),
        }
    }

    pub(super) async fn pause(conn_id: &str) {
        let release = {
            let mut slot = PAUSE.lock().expect("subscribe replay pause");
            let matches = slot.as_ref().is_some_and(|pause| pause.conn_id == conn_id);
            if !matches {
                return;
            }
            slot.take().map(|pause| {
                let _ = pause.entered.send(());
                pause.release
            })
        };
        if let Some(release) = release {
            let _ = release.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::Duration;

    use core_service::{
        AgentChatOrigin, AgentService, AgentStatusService, AutomationService, CanvasAgentRelay,
        CreateAgentChatRequest, GroupService, NotificationService, ProjectService, ReviewService,
        TerminalService, WorkspaceService,
    };
    use quota_usage::{QuotaProvider, QuotaUsageService};
    use sea_orm_migration::sea_orm::Database;
    use token_usage::TokenUsageService;
    use tokio::sync::mpsc;

    use super::super::WsMessageService;
    use super::subscribe_race_pause;
    use crate::api::ws::message::{AgentChatIdRequest, AgentChatSubscribeRequest};
    use crate::api::ws::{ClientType, WsManager, WsMessageHandler};

    const SEED_MARKER: &str = "subscribe-race-seed";
    const GAP_MARKER: &str = "subscribe-race-gap";

    struct TempRoot(PathBuf);

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    async fn service_at(root: &std::path::Path) -> Arc<WsMessageService> {
        let db = Arc::new(
            Database::connect("sqlite::memory:")
                .await
                .expect("sqlite memory"),
        );
        let project_service = Arc::new(ProjectService::new(Arc::clone(&db)));
        let workspace_service = Arc::new(WorkspaceService::new(Arc::clone(&db)));
        let terminal_service = Arc::new(TerminalService::new());
        let notification_service = Arc::new(NotificationService::new());
        Arc::new(WsMessageService::new_with_agent_data_dir(
            Arc::clone(&project_service),
            Arc::clone(&workspace_service),
            Arc::new(GroupService::new(Arc::clone(&db))),
            Arc::clone(&terminal_service),
            Arc::new(AgentService::new()),
            Arc::new(AutomationService::new(
                Arc::clone(&db),
                Arc::clone(&project_service),
                Arc::clone(&workspace_service),
                Arc::clone(&terminal_service),
                Arc::clone(&notification_service),
            )),
            Arc::new(ReviewService::new(Arc::clone(&db))),
            Arc::new(QuotaUsageService::new(Vec::<Arc<dyn QuotaProvider>>::new())),
            Arc::new(CanvasAgentRelay::new()),
            Arc::new(CanvasAgentRelay::new()),
            notification_service,
            Arc::new(TokenUsageService::default()),
            Arc::new(AgentStatusService::new()),
            db,
            root.to_path_buf(),
        ))
    }

    async fn recv_contains(
        rx: &mut mpsc::Receiver<String>,
        marker: &str,
        budget: Duration,
    ) -> bool {
        let deadline = tokio::time::Instant::now() + budget;
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return false;
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Some(message)) if message.contains(marker) => return true,
                Ok(Some(_)) => continue,
                _ => return false,
            }
        }
    }

    #[tokio::test]
    async fn subscribe_rolls_back_registration_when_chat_is_missing() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-subscribe-missing-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = uuid::Uuid::new_v4().to_string();
        let conn_id = "conn-missing";

        assert!(
            service
                .handle_agent_chat_subscribe(
                    conn_id,
                    AgentChatSubscribeRequest {
                        chat_id: chat_id.clone(),
                        after_sequence: Some(0),
                    },
                )
                .await
                .is_err(),
            "missing chat must not subscribe"
        );
        let subs = service.agent_chat_subs.read().await;
        assert!(
            !subs
                .get(&chat_id)
                .is_some_and(|conns| conns.contains(conn_id)),
            "failed subscribe must not leave the connection registered"
        );
    }

    #[tokio::test]
    async fn subscribe_failure_keeps_conn_that_was_already_registered() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-subscribe-repeat-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let meta = service
            .agent_chat()
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: root.0.to_string_lossy().into_owned(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                permission_mode: None,
                fast: None,
                context: None,
                title: None,
                source: None,
                automation_run_guid: None,
            })
            .expect("create chat");
        let chat_id = meta.id;
        let conn_id = "conn-repeat";
        service
            .handle_agent_chat_subscribe(
                conn_id,
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                },
            )
            .await
            .expect("first subscribe");

        std::fs::remove_dir_all(root.0.join("chats").join(&chat_id)).expect("remove chat dir");
        assert!(
            service
                .handle_agent_chat_subscribe(
                    conn_id,
                    AgentChatSubscribeRequest {
                        chat_id: chat_id.clone(),
                        after_sequence: Some(0),
                    },
                )
                .await
                .is_err(),
            "subscribe after the chat dir is gone must fail"
        );

        let subs = service.agent_chat_subs.read().await;
        assert!(
            subs.get(&chat_id)
                .is_some_and(|conns| conns.contains(conn_id)),
            "a failed repeat subscribe must keep the earlier registration"
        );
    }

    #[tokio::test]
    async fn subscribe_rollback_removes_empty_chat_key() {
        let root = TempRoot(std::env::temp_dir().join(format!(
            "atmos-subscribe-empty-key-{}",
            uuid::Uuid::new_v4()
        )));
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = uuid::Uuid::new_v4().to_string();

        assert!(
            service
                .handle_agent_chat_subscribe(
                    "conn-empty",
                    AgentChatSubscribeRequest {
                        chat_id: chat_id.clone(),
                        after_sequence: Some(0),
                    },
                )
                .await
                .is_err(),
            "missing chat must not subscribe"
        );
        let subs = service.agent_chat_subs.read().await;
        assert!(
            !subs.contains_key(&chat_id),
            "rollback of the only subscriber must drop the chat key"
        );
    }

    #[tokio::test]
    async fn subscribe_delivers_event_emitted_in_the_pre_register_gap() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-subscribe-race-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let manager = Arc::new(WsManager::new());
        let (tx_observer, mut rx_observer) = mpsc::channel(8);
        let (tx_joiner, mut rx_joiner) = mpsc::channel(8);
        let observer = manager
            .register_connection(ClientType::Web, tx_observer)
            .await;
        let joiner = manager
            .register_connection(ClientType::Web, tx_joiner)
            .await;
        service
            .set_ws_manager(Arc::clone(&manager))
            .expect("ws manager");

        let meta = service
            .agent_chat()
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: root.0.to_string_lossy().into_owned(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                permission_mode: None,
                fast: None,
                context: None,
                title: None,
                source: None,
                automation_run_guid: None,
            })
            .expect("create chat");
        let chat_id = meta.id;
        service
            .agent_chat()
            .queue_add(&chat_id, SEED_MARKER, Vec::new())
            .expect("seed queue");
        let seed_seq = service
            .agent_chat()
            .store()
            .get_meta(&chat_id)
            .expect("seed meta")
            .last_event_seq;

        service
            .handle_agent_chat_subscribe(
                &observer,
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(seed_seq),
                },
            )
            .await
            .expect("observer subscribe");

        let mut pause = subscribe_race_pause::arm(&joiner);
        let service_for_join = Arc::clone(&service);
        let chat_for_join = chat_id.clone();
        let joiner_id = joiner.clone();
        let join = tokio::spawn(async move {
            service_for_join
                .handle_agent_chat_subscribe(
                    &joiner_id,
                    AgentChatSubscribeRequest {
                        chat_id: chat_for_join,
                        after_sequence: Some(seed_seq),
                    },
                )
                .await
        });

        let entered = tokio::time::timeout(Duration::from_secs(2), pause.entered())
            .await
            .expect("subscribe did not reach the post-replay pause");
        assert!(
            entered,
            "pause gate was not armed for the joining connection"
        );

        let registered_while_paused = {
            let subs = service.agent_chat_subs.read().await;
            subs.get(&chat_id)
                .is_some_and(|conns| conns.contains(&joiner))
        };
        service
            .agent_chat()
            .queue_add(&chat_id, GAP_MARKER, Vec::new())
            .expect("gap queue");
        let gap_seq = service
            .agent_chat()
            .store()
            .get_meta(&chat_id)
            .expect("gap meta")
            .last_event_seq;

        let observer_saw_gap =
            recv_contains(&mut rx_observer, GAP_MARKER, Duration::from_secs(2)).await;
        assert!(
            observer_saw_gap,
            "observer must receive the gap so fan-out has snapshotted subscribers"
        );
        let delivered = recv_contains(&mut rx_joiner, GAP_MARKER, Duration::from_secs(2)).await;

        pause.release();
        let response = tokio::time::timeout(Duration::from_secs(2), join)
            .await
            .expect("subscribe did not finish after the pause released")
            .expect("subscribe task")
            .expect("subscribe");
        let last_event_seq = response["last_event_seq"].as_u64().expect("last_event_seq");

        assert!(
            registered_while_paused && delivered && last_event_seq >= gap_seq,
            "pre-register gap leaked: registered_while_paused={registered_while_paused} delivered={delivered} last_event_seq={last_event_seq} gap_seq={gap_seq}"
        );
    }

    fn create_chat(service: &WsMessageService, root: &std::path::Path) -> String {
        service
            .agent_chat()
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: root.to_string_lossy().into_owned(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                permission_mode: None,
                fast: None,
                context: None,
                title: None,
                source: None,
                automation_run_guid: None,
            })
            .expect("create chat")
            .id
    }

    async fn subscribe(service: &WsMessageService, conn_id: &str, chat_id: &str) {
        service
            .handle_agent_chat_subscribe(
                conn_id,
                AgentChatSubscribeRequest {
                    chat_id: chat_id.to_string(),
                    after_sequence: Some(0),
                },
            )
            .await
            .expect("subscribe");
    }

    fn assert_no_empty_sets(
        subs: &std::collections::HashMap<String, std::collections::HashSet<String>>,
    ) {
        assert!(
            subs.values().all(|conns| !conns.is_empty()),
            "agent_chat_subs must not retain an empty set, got {subs:?}"
        );
    }

    #[tokio::test]
    async fn unsubscribe_drops_empty_chat_set() {
        let root = TempRoot(std::env::temp_dir().join(format!(
            "atmos-unsubscribe-empty-set-{}",
            uuid::Uuid::new_v4()
        )));
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let only = create_chat(&service, &root.0);
        let shared = create_chat(&service, &root.0);
        subscribe(&service, "conn-a", &only).await;
        subscribe(&service, "conn-a", &shared).await;
        subscribe(&service, "conn-b", &shared).await;

        service
            .handle_agent_chat_unsubscribe(
                "conn-a",
                AgentChatIdRequest {
                    chat_id: only.clone(),
                },
            )
            .await
            .expect("unsubscribe last subscriber");
        service
            .handle_agent_chat_unsubscribe(
                "conn-a",
                AgentChatIdRequest {
                    chat_id: shared.clone(),
                },
            )
            .await
            .expect("unsubscribe one of two subscribers");

        let subs = service.agent_chat_subs.read().await;
        assert_no_empty_sets(&subs);
        assert!(
            !subs.contains_key(&only),
            "unsubscribing the last connection must drop the chat key"
        );
        assert!(
            subs.get(&shared)
                .is_some_and(|conns| conns.len() == 1 && conns.contains("conn-b")),
            "a remaining subscriber must stay registered"
        );
    }

    #[tokio::test]
    async fn disconnect_drops_empty_chat_sets() {
        let root = TempRoot(std::env::temp_dir().join(format!(
            "atmos-disconnect-empty-set-{}",
            uuid::Uuid::new_v4()
        )));
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let only = create_chat(&service, &root.0);
        let shared = create_chat(&service, &root.0);
        subscribe(&service, "conn-leaving", &only).await;
        subscribe(&service, "conn-leaving", &shared).await;
        subscribe(&service, "conn-staying", &shared).await;

        service.on_disconnect("conn-leaving").await;

        let subs = service.agent_chat_subs.read().await;
        assert_no_empty_sets(&subs);
        assert!(
            !subs.contains_key(&only),
            "disconnect of the last connection must drop the chat key"
        );
        assert!(
            subs.get(&shared).is_some_and(|conns| {
                conns.len() == 1
                    && conns.contains("conn-staying")
                    && !conns.contains("conn-leaving")
            }),
            "disconnect must drop only the closed connection"
        );
    }
}
