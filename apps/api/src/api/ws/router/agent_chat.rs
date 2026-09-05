use std::path::PathBuf;
use std::sync::Arc;

use super::*;
use core_service::utils::path_boundary::path_or_existing_parent_within_root;
use core_service::{
    catalog_spec_for, default_agent_data_dir, AgentChatService, CreateAgentChatRequest,
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
            provider_id: req.provider_id,
            model: req.model,
            thinking: req.thinking,
            mode: req.mode,
            title: req.title,
            origin: req.origin.unwrap_or_default(),
        })?;
        serde_json::to_value(meta)
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
        serde_json::to_value(snapshot)
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
        serde_json::to_value(meta)
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
            )
            .await?;
        serde_json::to_value(meta)
            .map_err(|e| ServiceError::Processing(format!("serialize chat: {e}")))
    }

    pub(super) async fn handle_agent_chat_delete(&self, req: AgentChatIdRequest) -> Result<Value> {
        self.agent_chat().delete(&req.chat_id).await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_subscribe(
        &self,
        conn_id: &str,
        req: AgentChatSubscribeRequest,
    ) -> Result<Value> {
        let snapshot = self.agent_chat().get(&req.chat_id).await?;
        let after = req.after_sequence.unwrap_or(0);
        let missed = self.agent_chat().events_after(&req.chat_id, after);
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
        let mut subs = self.agent_chat_subs.write().await;
        subs.entry(req.chat_id.clone())
            .or_default()
            .insert(conn_id.to_string());
        Ok(json!({ "last_event_seq": snapshot.meta.last_event_seq }))
    }

    pub(super) async fn handle_agent_chat_unsubscribe(
        &self,
        conn_id: &str,
        req: AgentChatIdRequest,
    ) -> Result<Value> {
        let mut subs = self.agent_chat_subs.write().await;
        if let Some(conns) = subs.get_mut(&req.chat_id) {
            conns.remove(conn_id);
        }
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_chat_send(&self, req: AgentChatSendRequest) -> Result<Value> {
        let turn_id = self
            .agent_chat()
            .send(
                &req.chat_id,
                &req.text,
                req.attachment_paths.unwrap_or_default(),
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
            .permission_respond(
                &req.chat_id,
                &req.request_id,
                &option_id,
                req.answers,
                req.updated_input,
            )
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_model_catalog_get(
        &self,
        req: AgentModelCatalogGetRequest,
    ) -> Result<Value> {
        let worker = Arc::clone(&self.catalog_worker);
        if req.agent_id.contains('/') || req.agent_id.contains('\\') || req.agent_id.contains("..")
        {
            return Err(ServiceError::Validation("invalid agent_id".into()));
        }
        let spec = catalog_spec_for(&req.agent_id);
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
        let last_registry_id = req
            .last_registry_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        core_service::save_agent_chat_prefs(&core_service::AgentChatPrefs { last_registry_id })?;
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
