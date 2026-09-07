use serde_json::{json, Value};

use core_service::{DevicePreviewSwipeInput, Result, ServiceError};

use super::{
    parse_request, SimulatorListRequest, SimulatorPressRequest, SimulatorScreenshotRequest,
    SimulatorStartRequest, SimulatorSwipeRequest, SimulatorTapRequest, SimulatorTypeRequest,
    SimulatorWorkspaceRequest, WsEvent, WsMessage, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_simulator_probe(&self) -> Result<Value> {
        serde_json::to_value(self.simulator.probe().await)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_start(&self, data: Value) -> Result<Value> {
        let req: SimulatorStartRequest = parse_request(data)?;
        let ws_manager = self.ws_manager.get().cloned();
        let ws_id = req.workspace_id.clone();
        let result = self
            .simulator
            .start(
                &req.workspace_id,
                req.platform,
                req.udid.as_deref(),
                move |helper, downloaded, total| {
                    if let Some(mgr) = &ws_manager {
                        let notification = WsMessage::notification(
                            WsEvent::SimulatorDownloadProgress,
                            json!({
                                "workspace_id": ws_id,
                                "helper": helper.as_wire(),
                                "downloaded": downloaded,
                                "total": total,
                            }),
                        );
                        let mgr = mgr.clone();
                        tokio::spawn(async move {
                            let _ = mgr.broadcast(&notification).await;
                        });
                    }
                },
            )
            .await
            .map_err(ServiceError::Processing)?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_stop(&self, data: Value) -> Result<Value> {
        let req: SimulatorWorkspaceRequest = parse_request(data)?;
        self.simulator
            .stop(&req.workspace_id)
            .await
            .map_err(ServiceError::Processing)?;
        Ok(json!({ "stopped": true }))
    }

    pub(super) async fn handle_simulator_status(&self, data: Value) -> Result<Value> {
        let req: SimulatorWorkspaceRequest = parse_request(data)?;
        let claim = self.simulator.status(&req.workspace_id).await;
        serde_json::to_value(claim).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_list(&self, data: Value) -> Result<Value> {
        let req: SimulatorListRequest = parse_request(data)?;
        let list = self.device_control.list(req.workspace_id.as_deref()).await;
        serde_json::to_value(list).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_screenshot(&self, data: Value) -> Result<Value> {
        let req: SimulatorScreenshotRequest = parse_request(data)?;
        let result = self
            .device_control
            .screenshot(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.out.as_deref(),
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_tap(&self, data: Value) -> Result<Value> {
        let req: SimulatorTapRequest = parse_request(data)?;
        let result = self
            .device_control
            .tap(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.x,
                req.y,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_swipe(&self, data: Value) -> Result<Value> {
        let req: SimulatorSwipeRequest = parse_request(data)?;
        let result = self
            .device_control
            .swipe(DevicePreviewSwipeInput {
                workspace_id: &req.workspace_id,
                udid: req.udid.as_deref(),
                platform: req.platform,
                x1: req.x1,
                y1: req.y1,
                x2: req.x2,
                y2: req.y2,
                duration_ms: req.duration_ms,
            })
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_type(&self, data: Value) -> Result<Value> {
        let req: SimulatorTypeRequest = parse_request(data)?;
        let result = self
            .device_control
            .type_text(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                &req.text,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_press(&self, data: Value) -> Result<Value> {
        let req: SimulatorPressRequest = parse_request(data)?;
        let result = self
            .device_control
            .press(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.key,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }
}
