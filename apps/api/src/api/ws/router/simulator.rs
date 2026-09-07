use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{
    parse_request, SimulatorStartRequest, SimulatorWorkspaceRequest, WsEvent, WsMessage,
    WsMessageService,
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
}
