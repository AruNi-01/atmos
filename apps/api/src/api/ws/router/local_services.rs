use serde_json::{json, Value};

use core_service::{LocalServiceStopRequest, LocalServicesScanRequest, LocalServicesScope, Result};

use super::WsMessageService;

impl WsMessageService {
    pub(super) async fn handle_local_services_scan(
        &self,
        req: LocalServicesScanRequest,
    ) -> Result<Value> {
        let force = req.force;
        let is_all_projects = matches!(req.scope, LocalServicesScope::AllAtmosProjects);
        let response = self.local_services_service.scan(req).await?;
        // Manual force refresh of the footer scope should fan out to other clients.
        if force && is_all_projects {
            self.local_services_service.publish_scan_snapshot(&response);
        }
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
