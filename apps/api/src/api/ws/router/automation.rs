use serde_json::{json, Value};

use super::*;
use core_service::{
    AutomationArtifactGetReq, AutomationCancelRunReq, AutomationCreateReq, AutomationDeleteReq,
    AutomationGetReq, AutomationListReq, AutomationRunGetReq, AutomationRunListReq,
    AutomationRunNowReq, AutomationSchedulePreviewReq, AutomationUpdateReq,
};

impl WsMessageService {
    pub(super) async fn handle_automation_list(&self, req: AutomationListReq) -> Result<Value> {
        let result = self.automation_service.list_automations(req).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_get(&self, req: AutomationGetReq) -> Result<Value> {
        let result = self
            .automation_service
            .get_automation(&req.automation_guid)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_create(&self, req: AutomationCreateReq) -> Result<Value> {
        let result = self.automation_service.create_automation(req).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_update(&self, req: AutomationUpdateReq) -> Result<Value> {
        let result = self.automation_service.update_automation(req).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_delete(&self, req: AutomationDeleteReq) -> Result<Value> {
        self.automation_service
            .delete_automation(&req.automation_guid)
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_automation_run_now(
        &self,
        req: AutomationRunNowReq,
    ) -> Result<Value> {
        let result = self
            .automation_service
            .run_now(&req.automation_guid)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_pause(&self, req: AutomationGetReq) -> Result<Value> {
        let result = self
            .automation_service
            .pause_schedule(&req.automation_guid)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_resume(&self, req: AutomationGetReq) -> Result<Value> {
        let result = self
            .automation_service
            .resume_schedule(&req.automation_guid)
            .await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_cancel_run(
        &self,
        req: AutomationCancelRunReq,
    ) -> Result<Value> {
        let result = self.automation_service.cancel_run(&req.run_guid).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_run_list(
        &self,
        req: AutomationRunListReq,
    ) -> Result<Value> {
        let result = self.automation_service.list_runs(req).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_run_get(
        &self,
        req: AutomationRunGetReq,
    ) -> Result<Value> {
        let result = self.automation_service.get_run(&req.run_guid).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_artifact_get(
        &self,
        req: AutomationArtifactGetReq,
    ) -> Result<Value> {
        let result = self.automation_service.read_artifact(req).await?;
        Ok(json!(result))
    }

    pub(super) async fn handle_automation_agent_capabilities(&self) -> Result<Value> {
        Ok(json!({
            "agents": self.automation_service.agent_capabilities()?,
        }))
    }

    pub(super) async fn handle_automation_schedule_preview(
        &self,
        req: AutomationSchedulePreviewReq,
    ) -> Result<Value> {
        let result = self.automation_service.schedule_preview(req).await?;
        Ok(json!(result))
    }
}
