use serde_json::Value;

use core_service::{Result, ServiceError};

use super::{
    DiskAnalyzerCancelScanRequest, DiskAnalyzerDeleteRequest, DiskAnalyzerDiskInfoRequest,
    DiskAnalyzerGetTreeRequest, DiskAnalyzerStartScanRequest, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_disk_analyzer_start_scan(
        &self,
        conn_id: &str,
        req: DiskAnalyzerStartScanRequest,
    ) -> Result<Value> {
        self.disk_analyzer_service
            .start_scan(conn_id, req.path.as_deref(), req.max_children)
            .await
    }

    pub(super) fn handle_disk_analyzer_cancel_scan(
        &self,
        conn_id: &str,
        req: DiskAnalyzerCancelScanRequest,
    ) -> Result<Value> {
        self.disk_analyzer_service
            .cancel_scan(conn_id, &req.scan_id)
    }

    pub(super) fn handle_disk_analyzer_get_tree(
        &self,
        conn_id: &str,
        req: DiskAnalyzerGetTreeRequest,
    ) -> Result<Value> {
        self.disk_analyzer_service.get_tree(
            conn_id,
            &req.scan_id,
            req.path.as_deref(),
            req.max_children,
        )
    }

    pub(super) async fn handle_disk_analyzer_delete(
        &self,
        conn_id: &str,
        req: DiskAnalyzerDeleteRequest,
    ) -> Result<Value> {
        self.disk_analyzer_service
            .delete_path(conn_id, &req.scan_id, &req.path, req.permanent)
            .await
    }

    pub(super) fn handle_disk_analyzer_disk_info(
        &self,
        req: DiskAnalyzerDiskInfoRequest,
    ) -> Result<Value> {
        let info = self.disk_analyzer_service.disk_info(req.path.as_deref())?;
        serde_json::to_value(info).map_err(|e| ServiceError::Processing(e.to_string()))
    }
}
