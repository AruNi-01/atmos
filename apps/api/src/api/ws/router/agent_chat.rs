use std::path::PathBuf;
use std::sync::Arc;

use super::*;
use core_service::utils::path_boundary::path_or_existing_parent_within_root;
use core_service::{
    clamp_message_limit, collect_tool_parts, default_agent_data_dir, mark_tool_details_omitted,
    options_probe_plan_for, strip_event_tool_details, strip_message_tool_details, AgentChatEvent,
    AgentChatService, CreateAgentChatRequest, QueueItemStatus, AGENT_CHAT_MESSAGE_PAGE_DEFAULT,
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

    pub(super) async fn handle_agent_chat_get(&self, req: AgentChatGetRequest) -> Result<Value> {
        if let Some(limit) = req.message_limit {
            let (snapshot, has_more) = self
                .agent_chat()
                .get_page(&req.chat_id, clamp_message_limit(limit), None)
                .await?;
            return agent_chat_snapshot_response(
                snapshot,
                lean_tools(req.include_tool_detail),
                has_more,
            );
        }
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        agent_chat_snapshot_response(snapshot, lean_tools(req.include_tool_detail), false)
    }

    pub(super) async fn handle_agent_chat_messages(
        &self,
        req: AgentChatMessagesRequest,
    ) -> Result<Value> {
        let lean = lean_tools(req.include_tool_detail);
        let paged = req.limit.is_some() || req.before_message_id.is_some();
        if paged {
            let limit = req
                .limit
                .map(clamp_message_limit)
                .unwrap_or(AGENT_CHAT_MESSAGE_PAGE_DEFAULT);
            let (snapshot, has_more) = self
                .agent_chat()
                .get_page(&req.chat_id, limit, req.before_message_id.as_deref())
                .await?;
            return agent_chat_messages_response(snapshot, has_more, true, lean);
        }
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        agent_chat_messages_response(snapshot, false, false, lean)
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
    async fn register_agent_chat_sub(
        &self,
        chat_id: &str,
        conn_id: &str,
        opts: super::AgentChatSubOpts,
    ) -> bool {
        let mut subs = self.agent_chat_subs.write().await;
        let conns = subs.entry(chat_id.to_string()).or_default();
        let inserted = !conns.contains_key(conn_id);
        conns.insert(conn_id.to_string(), opts);
        inserted
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
        // Register before existence and replay. A live emit after this insert is
        // fanned out to conn_id. Replay may deliver the same event; the client
        // EventGate dedupes on event_id. This handler does not filter that overlap.
        // Roll back only a conn this call inserted. A repeat subscribe that fails
        // must leave the earlier registration in place.
        // Existence is ensure_chat (get_meta + leftover-part close), not get():
        // QUALITY-018 discarded the snapshot; folding long chats times out (QUALITY-033).
        let opts = super::AgentChatSubOpts::from_flag(req.include_tool_detail);
        let inserted = self
            .register_agent_chat_sub(&req.chat_id, conn_id, opts)
            .await;
        if let Err(error) = self.agent_chat().ensure_chat(&req.chat_id).await {
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
                if let Some(payload) = agent_chat_event_payload(&event, opts.include_tool_detail) {
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

    pub(super) async fn handle_agent_chat_tool_get(
        &self,
        req: AgentChatToolGetRequest,
    ) -> Result<Value> {
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        let parts = collect_tool_parts(&snapshot.messages, &req.tool_call_ids);
        Ok(json!({ "parts": parts }))
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

fn lean_tools(flag: Option<bool>) -> bool {
    flag == Some(false)
}

fn agent_chat_snapshot_response(
    mut snapshot: core_service::AgentChatSnapshot,
    lean: bool,
    has_more: bool,
) -> Result<Value> {
    if lean {
        strip_message_tool_details(&mut snapshot.messages);
    }
    let mut value = agent_chat_snapshot_json(&snapshot)
        .map_err(|e| ServiceError::Processing(format!("serialize snapshot: {e}")))?;
    if lean {
        mark_tool_details_omitted(&mut value);
    }
    if has_more {
        value["has_more_messages"] = json!(true);
    }
    Ok(value)
}

fn agent_chat_messages_response(
    snapshot: core_service::AgentChatSnapshot,
    has_more: bool,
    paged: bool,
    lean: bool,
) -> Result<Value> {
    let mut messages = snapshot.messages;
    if lean {
        strip_message_tool_details(&mut messages);
    }
    let mut value = if paged {
        json!({ "messages": messages, "has_more": has_more })
    } else {
        json!({ "messages": messages })
    };
    if lean {
        mark_tool_details_omitted(&mut value);
    }
    Ok(value)
}

pub(super) fn agent_chat_event_payload(
    event: &AgentChatEvent,
    include_tool_detail: bool,
) -> Option<Value> {
    if include_tool_detail {
        return serde_json::to_value(event).ok();
    }
    let mut lean = event.clone();
    strip_event_tool_details(&mut lean);
    let mut value = serde_json::to_value(&lean).ok()?;
    mark_tool_details_omitted(&mut value);
    Some(value)
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
    use crate::api::ws::message::{
        AgentChatGetRequest, AgentChatIdRequest, AgentChatMessagesRequest,
        AgentChatSubscribeRequest, AgentChatToolGetRequest,
    };
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
                        include_tool_detail: None,
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
                .is_some_and(|conns| conns.contains_key(conn_id)),
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
                    include_tool_detail: None,
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
                        include_tool_detail: None,
                    },
                )
                .await
                .is_err(),
            "subscribe after the chat dir is gone must fail"
        );

        let subs = service.agent_chat_subs.read().await;
        assert!(
            subs.get(&chat_id)
                .is_some_and(|conns| conns.contains_key(conn_id)),
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
                        include_tool_detail: None,
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
                    include_tool_detail: None,
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
                        include_tool_detail: None,
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
                .is_some_and(|conns| conns.contains_key(&joiner))
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
                    include_tool_detail: None,
                },
            )
            .await
            .expect("subscribe");
    }

    fn assert_no_empty_sets(
        subs: &std::collections::HashMap<
            String,
            std::collections::HashMap<String, super::super::AgentChatSubOpts>,
        >,
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
                .is_some_and(|conns| conns.len() == 1 && conns.contains_key("conn-b")),
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
                    && conns.contains_key("conn-staying")
                    && !conns.contains_key("conn-leaving")
            }),
            "disconnect must drop only the closed connection"
        );
    }

    fn append_user_turns(chat_dir: &std::path::Path, count: usize) {
        let path = chat_dir.join("transcript.jsonl");
        let mut body = std::fs::read_to_string(&path).unwrap_or_default();
        for n in 1..=count {
            let turn = format!("t{n}");
            let mid = format!("m{n}");
            let ts = "2026-01-01T00:00:00Z";
            body.push_str(&format!(
                r#"{{"event_id":"e-start-{n}","turn_id":"{turn}","timestamp":"{ts}","event":{{"type":"turn_started"}}}}
{{"event_id":"e-user-{n}","turn_id":"{turn}","timestamp":"{ts}","event":{{"type":"user_message","message_id":"{mid}","kind":"normal","text":"msg {n}","attachments":[]}}}}
{{"event_id":"e-done-{n}","turn_id":"{turn}","timestamp":"{ts}","event":{{"type":"turn_completed","status":"completed"}}}}
"#
            ));
        }
        std::fs::write(&path, body).expect("write transcript");
    }

    fn append_tool_turn(chat_dir: &std::path::Path) {
        let path = chat_dir.join("transcript.jsonl");
        let mut body = std::fs::read_to_string(&path).unwrap_or_default();
        body.push_str(
            r#"{"event_id":"e-start-tool","turn_id":"t-tool","timestamp":"2026-01-01T00:00:00Z","event":{"type":"turn_started"}}
{"event_id":"e-user-tool","turn_id":"t-tool","timestamp":"2026-01-01T00:00:00Z","event":{"type":"user_message","message_id":"m-tool-user","kind":"normal","text":"edit","attachments":[]}}
{"event_id":"e-tool","turn_id":"t-tool","timestamp":"2026-01-01T00:00:00Z","event":{"type":"tool_call","ordinal":0,"tool":{"tool_call_id":"edit-1","status":"completed","name":"Edit","title":"src/a.ts","kind":"edit","params":{"type":"edit","path":"src/a.ts"},"result":{"type":"diff","path":"src/a.ts","old_content":"a\nb\n","new_content":"a\nb\nc\n"}}}}
{"event_id":"e-done-tool","turn_id":"t-tool","timestamp":"2026-01-01T00:00:00Z","event":{"type":"turn_completed","status":"completed"}}
"#,
        );
        std::fs::write(&path, body).expect("write tool transcript");
    }

    #[tokio::test]
    async fn get_pages_last_twenty_and_strips_tools() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-page-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        let dir = service.agent_chat().store().dir_for(&chat_id);
        append_user_turns(&dir, 24);
        append_tool_turn(&dir);

        let value = service
            .handle_agent_chat_get(AgentChatGetRequest {
                chat_id: chat_id.clone(),
                message_limit: Some(20),
                include_tool_detail: Some(false),
            })
            .await
            .expect("lean get");
        let messages = value["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 20);
        assert_eq!(value["has_more_messages"], true);
        let tool_part = messages
            .iter()
            .rev()
            .find_map(|message| {
                message["parts"]
                    .as_array()
                    .and_then(|parts| parts.iter().find(|part| part["type"] == "tool_call"))
            })
            .expect("tool part");
        assert_eq!(tool_part["detail_omitted"], true);
        assert!(tool_part["result"]["old_content"].is_null());
        assert!(tool_part["result"]["new_content"].is_null());
        assert_eq!(tool_part["result"]["type"], "diff_stats");
    }

    fn transcript_envelope_count(chat_dir: &std::path::Path) -> u64 {
        std::fs::read_to_string(chat_dir.join("transcript.jsonl"))
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count() as u64
    }

    #[tokio::test]
    async fn get_pages_last_twenty_without_full_fold() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-page-fold-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        let dir = service.agent_chat().store().dir_for(&chat_id);
        append_user_turns(&dir, 200);
        append_tool_turn(&dir);
        let total = transcript_envelope_count(&dir);
        let folds_before = service.agent_chat().store().fold_chat_dir_calls();
        let folded_before = service.agent_chat().store().paged_fold_envelopes();

        let value = service
            .handle_agent_chat_get(AgentChatGetRequest {
                chat_id: chat_id.clone(),
                message_limit: Some(20),
                include_tool_detail: Some(false),
            })
            .await
            .expect("lean get");
        let messages = value["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 20);
        assert_eq!(value["has_more_messages"], true);
        let tool_part = messages
            .iter()
            .rev()
            .find_map(|message| {
                message["parts"]
                    .as_array()
                    .and_then(|parts| parts.iter().find(|part| part["type"] == "tool_call"))
            })
            .expect("tool part");
        assert_eq!(tool_part["detail_omitted"], true);
        assert_eq!(
            service.agent_chat().store().fold_chat_dir_calls(),
            folds_before,
            "lean get must not full-fold transcript.jsonl"
        );
        let folded = service.agent_chat().store().paged_fold_envelopes() - folded_before;
        assert!(
            folded > 0 && folded * 2 < total,
            "lean get fold must be O(page), folded={folded} total={total}"
        );
    }

    #[tokio::test]
    async fn subscribe_empty_live_does_not_scan_transcript() {
        let root = TempRoot(std::env::temp_dir().join(format!(
            "atmos-subscribe-empty-live-{}",
            uuid::Uuid::new_v4()
        )));
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        let dir = service.agent_chat().store().dir_for(&chat_id);
        append_user_turns(&dir, 200);
        std::fs::write(dir.join("live.jsonl"), "").expect("empty live");
        let folds_before = service.agent_chat().store().fold_chat_dir_calls();
        let transcript_before = service
            .agent_chat()
            .store()
            .leftover_transcript_envelopes_read();

        let response = service
            .handle_agent_chat_subscribe(
                "conn-empty-live",
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                    include_tool_detail: None,
                },
            )
            .await
            .expect("subscribe");

        assert!(response["last_event_seq"].as_u64().is_some());
        assert_eq!(
            service.agent_chat().store().fold_chat_dir_calls(),
            folds_before
        );
        assert_eq!(
            service
                .agent_chat()
                .store()
                .leftover_transcript_envelopes_read(),
            transcript_before,
            "subscribe with empty live must not scan transcript.jsonl"
        );
    }

    #[tokio::test]
    async fn messages_before_id_loads_older_page() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-before-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        append_user_turns(&service.agent_chat().store().dir_for(&chat_id), 25);

        let first = service
            .handle_agent_chat_messages(AgentChatMessagesRequest {
                chat_id: chat_id.clone(),
                limit: Some(20),
                before_message_id: None,
                include_tool_detail: Some(false),
            })
            .await
            .expect("tail");
        assert_eq!(first["messages"].as_array().expect("messages").len(), 20);
        assert_eq!(first["has_more"], true);
        let oldest = first["messages"][0]["id"].as_str().expect("id").to_string();

        let older = service
            .handle_agent_chat_messages(AgentChatMessagesRequest {
                chat_id: chat_id.clone(),
                limit: Some(20),
                before_message_id: Some(oldest),
                include_tool_detail: Some(false),
            })
            .await
            .expect("older");
        let ids: Vec<_> = older["messages"]
            .as_array()
            .expect("older messages")
            .iter()
            .map(|message| message["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["m1", "m2", "m3", "m4", "m5"]);
        assert_eq!(older["has_more"], false);

        let missing = service
            .handle_agent_chat_messages(AgentChatMessagesRequest {
                chat_id,
                limit: Some(20),
                before_message_id: Some("missing".into()),
                include_tool_detail: Some(false),
            })
            .await
            .expect("missing cursor");
        assert!(missing["messages"].as_array().expect("empty").is_empty());
        assert_eq!(missing["has_more"], false);
    }

    #[tokio::test]
    async fn tool_get_returns_full_diff() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-tool-get-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        append_tool_turn(&service.agent_chat().store().dir_for(&chat_id));

        let value = service
            .handle_agent_chat_tool_get(AgentChatToolGetRequest {
                chat_id,
                tool_call_ids: vec!["missing".into(), "edit-1".into()],
            })
            .await
            .expect("tool get");
        let parts = value["parts"].as_array().expect("parts");
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0]["tool_call_id"], "edit-1");
        assert_eq!(parts[0]["result"]["type"], "diff");
        assert_eq!(parts[0]["result"]["new_content"], "a\nb\nc\n");
        assert!(parts[0].get("detail_omitted").is_none());
    }

    #[tokio::test]
    async fn subscribe_stores_lean_and_full_opts() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-sub-opts-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        service
            .handle_agent_chat_subscribe(
                "conn-full",
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                    include_tool_detail: None,
                },
            )
            .await
            .expect("full subscribe");
        service
            .handle_agent_chat_subscribe(
                "conn-lean",
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                    include_tool_detail: Some(false),
                },
            )
            .await
            .expect("lean subscribe");
        let subs = service.agent_chat_subs.read().await;
        let conns = subs.get(&chat_id).expect("chat");
        assert!(conns.get("conn-full").expect("full").include_tool_detail);
        assert!(!conns.get("conn-lean").expect("lean").include_tool_detail);
    }

    fn append_leftover_live_chunk(chat_dir: &std::path::Path) {
        std::fs::write(
            chat_dir.join("live.jsonl"),
            r#"{"event_id":"e-left","turn_id":"t-left","timestamp":"2026-01-01T00:00:00Z","event":{"type":"text_chunk","part_id":"p-left","message_id":"a-left","ordinal":0,"kind":"answer","offset":0,"text":"leftover"}}
"#,
        )
        .expect("write live leftover");
    }

    fn leftover_part_finished(chat_dir: &std::path::Path) -> bool {
        std::fs::read_to_string(chat_dir.join("transcript.jsonl"))
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.trim().is_empty())
            .any(|line| {
                let value: serde_json::Value = serde_json::from_str(line).unwrap();
                value["event"]["type"] == "part_finished"
                    && value["event"]["part_id"] == "p-left"
                    && value["event"]["text"] == "leftover"
            })
    }

    #[tokio::test]
    async fn subscribe_does_not_fold_transcript_for_existence() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-subscribe-no-fold-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        let dir = service.agent_chat().store().dir_for(&chat_id);
        append_user_turns(&dir, 24);
        let folds_before = service.agent_chat().store().fold_chat_dir_calls();

        let response = service
            .handle_agent_chat_subscribe(
                "conn-no-fold",
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                    include_tool_detail: None,
                },
            )
            .await
            .expect("subscribe");

        assert!(response["last_event_seq"].as_u64().is_some());
        assert_eq!(
            service.agent_chat().store().fold_chat_dir_calls(),
            folds_before,
            "subscribe must not fold transcript.jsonl for existence"
        );
        let subs = service.agent_chat_subs.read().await;
        assert!(
            subs.get(&chat_id)
                .is_some_and(|conns| conns.contains_key("conn-no-fold")),
            "successful subscribe must register the connection"
        );
    }

    #[tokio::test]
    async fn subscribe_closes_leftover_open_parts_without_folding() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-subscribe-leftover-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        let dir = service.agent_chat().store().dir_for(&chat_id);
        append_user_turns(&dir, 24);
        append_leftover_live_chunk(&dir);
        let folds_before = service.agent_chat().store().fold_chat_dir_calls();

        service
            .handle_agent_chat_subscribe(
                "conn-leftover",
                AgentChatSubscribeRequest {
                    chat_id: chat_id.clone(),
                    after_sequence: Some(0),
                    include_tool_detail: None,
                },
            )
            .await
            .expect("subscribe");

        assert_eq!(
            service.agent_chat().store().fold_chat_dir_calls(),
            folds_before,
            "leftover close on subscribe must not fold the transcript"
        );
        assert!(
            leftover_part_finished(&dir),
            "subscribe must persist PartFinished for leftover text"
        );
        assert!(
            std::fs::read_to_string(dir.join("live.jsonl"))
                .unwrap_or_default()
                .trim()
                .is_empty(),
            "subscribe must truncate live.jsonl after leftover close"
        );
        let subs = service.agent_chat_subs.read().await;
        assert!(subs
            .get(&chat_id)
            .is_some_and(|conns| conns.contains_key("conn-leftover")));
    }

    #[tokio::test]
    async fn get_without_flags_keeps_full_snapshot() {
        let root = TempRoot(
            std::env::temp_dir().join(format!("atmos-chat-full-get-{}", uuid::Uuid::new_v4())),
        );
        std::fs::create_dir_all(&root.0).expect("temp root");
        let service = service_at(&root.0).await;
        let chat_id = create_chat(&service, &root.0);
        append_tool_turn(&service.agent_chat().store().dir_for(&chat_id));

        let value = service
            .handle_agent_chat_get(AgentChatGetRequest {
                chat_id,
                message_limit: None,
                include_tool_detail: None,
            })
            .await
            .expect("full get");
        assert!(value.get("has_more_messages").is_none());
        let tool_part = value["messages"]
            .as_array()
            .expect("messages")
            .iter()
            .rev()
            .find_map(|message| {
                message["parts"]
                    .as_array()
                    .and_then(|parts| parts.iter().find(|part| part["type"] == "tool_call"))
            })
            .expect("tool part");
        assert!(tool_part.get("detail_omitted").is_none());
        assert_eq!(tool_part["result"]["type"], "diff");
        assert_eq!(tool_part["result"]["new_content"], "a\nb\nc\n");
    }
}
