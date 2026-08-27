use std::path::PathBuf;
use std::sync::Arc;

use super::*;
use core_service::{
    builtin_catalog_specs, ConversationService, CreateConversationRequest, QueueItemStatus,
};
use serde_json::{json, Value};

impl WsMessageService {
    fn conversation(&self) -> Arc<ConversationService> {
        Arc::clone(&self.conversation_service)
    }

    async fn resolve_conversation_cwd(
        &self,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        cwd: Option<&str>,
    ) -> Result<String> {
        if let Some(path) = cwd {
            if !path.trim().is_empty() {
                return Ok(path.to_string());
            }
        }
        if let Some(wid) = workspace_id {
            let workspace = self
                .workspace_service
                .get_workspace(wid.to_string())
                .await?
                .ok_or_else(|| ServiceError::NotFound("Workspace not found".into()))?;
            return Ok(workspace.local_path);
        }
        if let Some(pid) = project_id {
            let project = self
                .project_service
                .get_project(pid.to_string())
                .await?
                .ok_or_else(|| ServiceError::NotFound("Project not found".into()))?;
            let main_path = PathBuf::from(&project.main_file_path);
            let cwd = if main_path.is_dir() {
                main_path
            } else {
                main_path.parent().map(PathBuf::from).unwrap_or(main_path)
            };
            return Ok(cwd.to_string_lossy().to_string());
        }
        Ok(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
    }

    pub(super) async fn handle_conversation_create(
        &self,
        req: ConversationCreateRequest,
    ) -> Result<Value> {
        let cwd = self
            .resolve_conversation_cwd(
                req.workspace_id.as_deref(),
                req.project_id.as_deref(),
                req.cwd.as_deref(),
            )
            .await?;
        let meta = self.conversation().create(CreateConversationRequest {
            workspace_id: req.workspace_id,
            project_id: req.project_id,
            cwd,
            provider_id: req.provider_id,
            model: req.model,
            thinking: req.thinking,
            title: req.title,
        })?;
        serde_json::to_value(meta)
            .map_err(|e| ServiceError::Processing(format!("serialize conversation: {e}")))
    }

    pub(super) async fn handle_conversation_list(
        &self,
        req: ConversationListRequest,
    ) -> Result<Value> {
        let items = self.conversation().list(
            req.cwd.as_deref(),
            req.workspace_id.as_deref(),
            req.project_id.as_deref(),
        )?;
        Ok(json!({ "items": items }))
    }

    pub(super) async fn handle_conversation_get(
        &self,
        req: ConversationIdRequest,
    ) -> Result<Value> {
        let snapshot = self.conversation().get(&req.conversation_id)?;
        serde_json::to_value(snapshot)
            .map_err(|e| ServiceError::Processing(format!("serialize snapshot: {e}")))
    }

    pub(super) async fn handle_conversation_messages(
        &self,
        req: ConversationMessagesRequest,
    ) -> Result<Value> {
        let snapshot = self.conversation().get(&req.conversation_id)?;
        let _ = req.before_seq;
        let _ = req.limit;
        Ok(json!({ "turns": snapshot.turns }))
    }

    pub(super) async fn handle_conversation_rename(
        &self,
        req: ConversationRenameRequest,
    ) -> Result<Value> {
        let meta = self
            .conversation()
            .rename(&req.conversation_id, &req.title)?;
        serde_json::to_value(meta)
            .map_err(|e| ServiceError::Processing(format!("serialize conversation: {e}")))
    }

    pub(super) async fn handle_conversation_configure(
        &self,
        req: ConversationConfigureRequest,
    ) -> Result<Value> {
        let meta = self
            .conversation()
            .configure(
                &req.conversation_id,
                req.provider_id,
                req.model,
                req.thinking,
            )
            .await?;
        serde_json::to_value(meta)
            .map_err(|e| ServiceError::Processing(format!("serialize conversation: {e}")))
    }

    pub(super) async fn handle_conversation_delete(
        &self,
        req: ConversationIdRequest,
    ) -> Result<Value> {
        self.conversation().delete(&req.conversation_id).await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_conversation_subscribe(
        &self,
        conn_id: &str,
        req: ConversationSubscribeRequest,
    ) -> Result<Value> {
        let snapshot = self.conversation().get(&req.conversation_id)?;
        let mut subs = self.conversation_subs.write().await;
        subs.entry(req.conversation_id.clone())
            .or_default()
            .insert(conn_id.to_string());
        Ok(json!({ "last_event_seq": snapshot.meta.last_event_seq }))
    }

    pub(super) async fn handle_conversation_unsubscribe(
        &self,
        conn_id: &str,
        req: ConversationIdRequest,
    ) -> Result<Value> {
        let mut subs = self.conversation_subs.write().await;
        if let Some(conns) = subs.get_mut(&req.conversation_id) {
            conns.remove(conn_id);
        }
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_conversation_send(
        &self,
        req: ConversationSendRequest,
    ) -> Result<Value> {
        let turn_id = self
            .conversation()
            .send(
                &req.conversation_id,
                &req.text,
                req.attachment_paths.unwrap_or_default(),
            )
            .await?;
        Ok(json!({ "turn_id": turn_id }))
    }

    pub(super) async fn handle_conversation_steer(
        &self,
        req: ConversationSteerRequest,
    ) -> Result<Value> {
        let turn_id = self
            .conversation()
            .steer(&req.conversation_id, &req.expected_turn_id, &req.text)
            .await?;
        Ok(json!({ "turn_id": turn_id }))
    }

    pub(super) async fn handle_conversation_queue_add(
        &self,
        req: ConversationQueueAddRequest,
    ) -> Result<Value> {
        let item = self.conversation().queue_add(
            &req.conversation_id,
            &req.text,
            req.attachment_paths.unwrap_or_default(),
        )?;
        serde_json::to_value(item)
            .map_err(|e| ServiceError::Processing(format!("serialize queue item: {e}")))
    }

    pub(super) async fn handle_conversation_queue_update(
        &self,
        req: ConversationQueueUpdateRequest,
    ) -> Result<Value> {
        let status = req.status.as_deref().map(|value| match value {
            "paused" => QueueItemStatus::Paused,
            _ => QueueItemStatus::Pending,
        });
        let item = self.conversation().queue_update(
            &req.conversation_id,
            &req.item_id,
            req.text,
            status,
        )?;
        serde_json::to_value(item)
            .map_err(|e| ServiceError::Processing(format!("serialize queue item: {e}")))
    }

    pub(super) async fn handle_conversation_queue_reorder(
        &self,
        req: ConversationQueueReorderRequest,
    ) -> Result<Value> {
        let items = self
            .conversation()
            .queue_reorder(&req.conversation_id, &req.item_ids)?;
        Ok(json!({ "items": items }))
    }

    pub(super) async fn handle_conversation_queue_delete(
        &self,
        req: ConversationQueueDeleteRequest,
    ) -> Result<Value> {
        self.conversation()
            .queue_delete(&req.conversation_id, &req.item_id)?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_conversation_cancel(
        &self,
        req: ConversationIdRequest,
    ) -> Result<Value> {
        self.conversation().cancel(&req.conversation_id).await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_conversation_permission_respond(
        &self,
        req: ConversationPermissionRespondRequest,
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
        self.conversation()
            .permission_respond(&req.conversation_id, &req.request_id, &option_id)
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_model_catalog_get(
        &self,
        req: AgentModelCatalogGetRequest,
    ) -> Result<Value> {
        let worker = Arc::clone(&self.catalog_worker);
        let spec = builtin_catalog_specs()
            .into_iter()
            .find(|spec| spec.agent_id == req.agent_id)
            .unwrap_or(agent::AgentCatalogSpec {
                agent_id: req.agent_id.clone(),
                acp: true,
                ..Default::default()
            });
        let catalog = worker.get(&spec, req.refresh.unwrap_or(false)).await;
        serde_json::to_value(catalog)
            .map_err(|e| ServiceError::Processing(format!("serialize catalog: {e}")))
    }
}
