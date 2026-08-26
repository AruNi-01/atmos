use super::*;
use core_service::{load_center_layout, save_center_layout, CenterLayoutDocument};

impl WsMessageService {
    pub(super) fn handle_center_layout_get(&self) -> Result<Value> {
        let doc = load_center_layout()?;
        serde_json::to_value(&doc).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize center layout: {e}"))
        })
    }

    pub(super) fn handle_center_layout_put(&self, req: CenterLayoutPutRequest) -> Result<Value> {
        let incoming = CenterLayoutDocument::from_value(req.document)?;
        let saved = save_center_layout(incoming)?;
        Ok(json!({
            "ok": true,
            "updated_at": saved.updated_at,
        }))
    }
}
