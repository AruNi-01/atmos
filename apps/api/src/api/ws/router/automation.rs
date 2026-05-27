use reqwest::Method;
use serde_json::{json, Map, Value};

use super::*;
use crate::relay::control_plane_client::RelayControlRequest;
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

    pub(super) async fn handle_automation_github_setup_session(&self, req: Value) -> Result<Value> {
        let relay = RelayControlRequest::from_value(req)?;
        let body = Value::Object(relay.payload);
        relay
            .client
            .json(Method::POST, "/v1/github/setup_sessions", Some(&body))
            .await
    }

    pub(super) async fn handle_automation_github_installations(&self, req: Value) -> Result<Value> {
        let relay = RelayControlRequest::from_value(req)?;
        relay
            .client
            .json::<Value>(Method::GET, "/v1/github/installations", None)
            .await
    }

    pub(super) async fn handle_automation_github_repositories(&self, req: Value) -> Result<Value> {
        let mut relay = RelayControlRequest::from_value(req)?;
        let installation_id = take_required_i64(&mut relay.payload, "installation_id")?;
        relay
            .client
            .json::<Value>(
                Method::GET,
                &format!("/v1/github/installations/{installation_id}/repositories"),
                None,
            )
            .await
    }

    pub(super) async fn handle_automation_github_event_route_upsert(
        &self,
        req: Value,
    ) -> Result<Value> {
        let relay = RelayControlRequest::from_value(req)?;
        let body = Value::Object(relay.payload);
        relay
            .client
            .json(Method::POST, "/v1/github/event_routes", Some(&body))
            .await
    }

    pub(super) async fn handle_automation_github_event_route_delete(
        &self,
        req: Value,
    ) -> Result<Value> {
        let mut relay = RelayControlRequest::from_value(req)?;
        let route_id = take_required_string(&mut relay.payload, "route_id")?;
        relay
            .client
            .json::<Value>(
                Method::DELETE,
                &format!(
                    "/v1/github/event_routes/{}",
                    urlencoding::encode(route_id.as_str())
                ),
                None,
            )
            .await
    }
}

fn take_required_string(payload: &mut Map<String, Value>, key: &str) -> Result<String> {
    match payload.remove(key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        _ => Err(ServiceError::Validation(format!("{key} is required."))),
    }
}

fn take_required_i64(payload: &mut Map<String, Value>, key: &str) -> Result<i64> {
    match payload.remove(key) {
        Some(Value::Number(value)) => value
            .as_i64()
            .filter(|value| *value > 0)
            .ok_or_else(|| ServiceError::Validation(format!("{key} is required."))),
        Some(Value::String(value)) => value
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or_else(|| ServiceError::Validation(format!("{key} is required."))),
        _ => Err(ServiceError::Validation(format!("{key} is required."))),
    }
}
