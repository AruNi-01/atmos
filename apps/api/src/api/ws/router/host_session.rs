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
}
