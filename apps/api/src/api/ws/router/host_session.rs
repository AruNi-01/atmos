use super::*;
use core_service::HostSessionListFilter;
use serde_json::Value;

impl WsMessageService {
    pub(super) async fn handle_host_session_list(
        &self,
        req: HostSessionListRequest,
    ) -> Result<Value> {
        let HostSessionListRequest {
            provider_id,
            project,
            query,
            sort_field,
            sort_order,
            updated_after,
            updated_before,
            limit,
            offset,
            sync,
            include_archived,
        } = req;
        let result = self
            .host_session_service
            .list(HostSessionListFilter {
                provider_id,
                project,
                query,
                sort_field,
                sort_order,
                updated_after,
                updated_before,
                limit,
                offset: offset.unwrap_or(0),
                sync,
                include_archived,
            })
            .await?;
        serde_json::to_value(result)
            .map_err(|e| ServiceError::Processing(format!("serialize host sessions: {e}")))
    }

    pub(super) async fn handle_host_session_get(
        &self,
        req: HostSessionGetRequest,
    ) -> Result<Value> {
        let result = self.host_session_service.get(&req.key).await?;
        serde_json::to_value(result)
            .map_err(|e| ServiceError::Processing(format!("serialize host session: {e}")))
    }

    pub(super) async fn handle_host_session_resume_chat(
        &self,
        req: HostSessionResumeChatRequest,
    ) -> Result<Value> {
        let result = self.host_session_service.resume_chat(&req.key).await?;
        serde_json::to_value(result).map_err(|e| {
            ServiceError::Processing(format!("serialize host session resume chat: {e}"))
        })
    }

    pub(super) async fn handle_host_session_resume_tui(
        &self,
        req: HostSessionResumeTuiRequest,
    ) -> Result<Value> {
        let result = self.host_session_service.resume_tui(&req.key).await?;
        serde_json::to_value(result).map_err(|e| {
            ServiceError::Processing(format!("serialize host session resume tui: {e}"))
        })
    }

    pub(super) async fn handle_host_session_set_archived(
        &self,
        req: HostSessionSetArchivedRequest,
    ) -> Result<Value> {
        let keys = self
            .host_session_service
            .set_archived(&req.keys, req.archived)
            .await?;
        serde_json::to_value(serde_json::json!({ "keys": keys }))
            .map_err(|e| ServiceError::Processing(format!("serialize host session archive: {e}")))
    }

    pub(super) async fn handle_host_session_delete(
        &self,
        req: HostSessionDeleteRequest,
    ) -> Result<Value> {
        let result = self
            .host_session_service
            .delete_sessions(&req.keys, req.include_atmos_chat, req.include_source)
            .await?;
        let mut failures = result.failures;
        for chat_id in result.atmos_chat_ids {
            match self.agent_chat_service.delete(&chat_id).await {
                Ok(_) | Err(ServiceError::NotFound(_)) => {}
                Err(error) => failures.push(format!("Atmos Chat {chat_id}: {error}")),
            }
        }
        serde_json::to_value(serde_json::json!({
            "deleted_keys": result.deleted_keys,
            "failures": failures,
        }))
        .map_err(|e| ServiceError::Processing(format!("serialize host session delete: {e}")))
    }
}
