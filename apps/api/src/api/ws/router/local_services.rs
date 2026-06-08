use serde_json::{json, Value};

use core_service::{LocalServiceStopRequest, LocalServicesScanRequest, Result};

use super::WsMessageService;

impl WsMessageService {
    pub(super) async fn handle_local_services_scan(
        &self,
        req: LocalServicesScanRequest,
    ) -> Result<Value> {
        let response = self.local_services_service.scan(req).await?;
        Ok(json!(response))
    }

    pub(super) async fn handle_local_services_stop(
        &self,
        req: LocalServiceStopRequest,
    ) -> Result<Value> {
        let response = self.local_services_service.stop(req).await?;
        Ok(json!(response))
    }
}
