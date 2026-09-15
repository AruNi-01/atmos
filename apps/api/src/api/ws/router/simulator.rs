use serde_json::{json, Value};

use core_engine::CAMERA_PNG_MAX_BYTES;
use core_service::{DevicePreviewSwipeInput, Result, ServiceError, SimulatorOpError};

use super::{
    parse_request, SimulatorAppearanceGetRequest, SimulatorAppearanceSetRequest,
    SimulatorCameraClearRequest, SimulatorCameraInjectRequest, SimulatorCreateRequest,
    SimulatorDeviceOpRequest, SimulatorInventoryRequest, SimulatorListRequest,
    SimulatorPressRequest, SimulatorScreenshotRequest, SimulatorStartRequest,
    SimulatorSwipeRequest, SimulatorTapRequest, SimulatorTypeRequest, SimulatorWorkspaceRequest,
    WsEvent, WsMessage, WsMessageService,
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

    pub(super) async fn handle_simulator_inventory(&self, data: Value) -> Result<Value> {
        let _: SimulatorInventoryRequest = parse_request(data)?;
        serde_json::to_value(self.simulator.inventory().await)
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_create(&self, data: Value) -> Result<Value> {
        let req: SimulatorCreateRequest = parse_request(data)?;
        let device = self
            .simulator
            .create(
                req.platform,
                &req.device_type,
                &req.runtime,
                req.name.as_deref(),
            )
            .await
            .map_err(map_simulator_op)?;
        self.broadcast_simulator_devices_changed(req.platform);
        Ok(json!({ "device": device }))
    }

    pub(super) async fn handle_simulator_boot(&self, data: Value) -> Result<Value> {
        let req: SimulatorDeviceOpRequest = parse_request(data)?;
        let device = self
            .simulator
            .boot(&req.workspace_id, &req.udid, req.platform)
            .await
            .map_err(map_simulator_op)?;
        self.broadcast_simulator_devices_changed(req.platform);
        Ok(json!({ "device": device }))
    }

    pub(super) async fn handle_simulator_shutdown(&self, data: Value) -> Result<Value> {
        let req: SimulatorDeviceOpRequest = parse_request(data)?;
        let device = self
            .simulator
            .shutdown(&req.workspace_id, &req.udid, req.platform)
            .await
            .map_err(map_simulator_op)?;
        self.broadcast_simulator_devices_changed(req.platform);
        Ok(json!({ "device": device }))
    }

    pub(super) async fn handle_simulator_delete(&self, data: Value) -> Result<Value> {
        let req: SimulatorDeviceOpRequest = parse_request(data)?;
        let udid = self
            .simulator
            .delete(&req.workspace_id, &req.udid, req.platform)
            .await
            .map_err(map_simulator_op)?;
        self.broadcast_simulator_devices_changed(req.platform);
        Ok(json!({ "deleted": true, "udid": udid }))
    }

    pub(super) async fn handle_simulator_appearance_get(&self, data: Value) -> Result<Value> {
        let req: SimulatorAppearanceGetRequest = parse_request(data)?;
        let result = self
            .device_control
            .appearance_get(&req.workspace_id, req.udid.as_deref(), req.platform)
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_appearance_set(&self, data: Value) -> Result<Value> {
        let req: SimulatorAppearanceSetRequest = parse_request(data)?;
        let result = self
            .device_control
            .appearance_set(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.appearance,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_camera_inject(&self, data: Value) -> Result<Value> {
        let req: SimulatorCameraInjectRequest = parse_request(data)?;
        let png = resolve_camera_png(req.path.as_deref(), req.png_base64.as_deref())?;
        let result = self
            .device_control
            .camera_inject(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.lens,
                &png,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_simulator_camera_clear(&self, data: Value) -> Result<Value> {
        let req: SimulatorCameraClearRequest = parse_request(data)?;
        let result = self
            .device_control
            .camera_clear(
                &req.workspace_id,
                req.udid.as_deref(),
                req.platform,
                req.lens,
            )
            .await?;
        serde_json::to_value(result).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    fn broadcast_simulator_devices_changed(&self, platform: core_engine::DevicePlatform) {
        let Some(mgr) = self.ws_manager.get().cloned() else {
            return;
        };
        let notification = WsMessage::notification(
            WsEvent::SimulatorDevicesChanged,
            json!({ "platform": platform }),
        );
        tokio::spawn(async move {
            let _ = mgr.broadcast(&notification).await;
        });
    }
}

fn map_simulator_op(err: SimulatorOpError) -> ServiceError {
    ServiceError::Processing(err.reason.as_code().to_string())
}

fn nonempty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

fn resolve_camera_png(path: Option<&str>, png_base64: Option<&str>) -> Result<Vec<u8>> {
    match (nonempty(path), nonempty(png_base64)) {
        (Some(_), Some(_)) | (None, None) => Err(ServiceError::Validation(
            "exactly one of path or png_base64 is required".into(),
        )),
        (Some(path), None) => read_camera_path(path),
        (None, Some(encoded)) => decode_camera_png_base64(encoded),
    }
}

fn read_camera_path(path: &str) -> Result<Vec<u8>> {
    let meta = std::fs::metadata(path)
        .map_err(|_| ServiceError::Validation(format!("failed to read camera file {path}")))?;
    if meta.len() > CAMERA_PNG_MAX_BYTES as u64 {
        return Err(ServiceError::Validation("camera PNG exceeds 32 MiB".into()));
    }
    let bytes = std::fs::read(path)
        .map_err(|_| ServiceError::Validation(format!("failed to read camera file {path}")))?;
    if bytes.len() > CAMERA_PNG_MAX_BYTES {
        return Err(ServiceError::Validation("camera PNG exceeds 32 MiB".into()));
    }
    Ok(bytes)
}

fn decode_camera_png_base64(encoded: &str) -> Result<Vec<u8>> {
    // Reject oversized payloads before decode so we never log or retain the body.
    if encoded.len() > CAMERA_PNG_MAX_BYTES.saturating_mul(4).saturating_div(3) + 8 {
        return Err(ServiceError::Validation("camera PNG exceeds 32 MiB".into()));
    }
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = STANDARD
        .decode(cleaned.as_bytes())
        .map_err(|_| ServiceError::Validation("invalid png_base64".into()))?;
    if bytes.len() > CAMERA_PNG_MAX_BYTES {
        return Err(ServiceError::Validation("camera PNG exceeds 32 MiB".into()));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulator_camera_inject_rejects_both_and_neither() {
        let neither = resolve_camera_png(None, None).unwrap_err();
        assert!(matches!(neither, ServiceError::Validation(_)));
        let both = resolve_camera_png(Some("/tmp/a.png"), Some("aaaa")).unwrap_err();
        assert!(matches!(both, ServiceError::Validation(_)));
        let empty = resolve_camera_png(Some("  "), Some("")).unwrap_err();
        assert!(matches!(empty, ServiceError::Validation(_)));
    }

    #[test]
    fn simulator_camera_inject_rejects_invalid_base64() {
        let err = resolve_camera_png(None, Some("!!!not-base64!!!")).unwrap_err();
        match err {
            ServiceError::Validation(msg) => assert_eq!(msg, "invalid png_base64"),
            other => panic!("expected validation, got {other}"),
        }
    }

    #[test]
    fn simulator_camera_inject_reads_computer_local_path() {
        let dir = std::env::temp_dir();
        let path = dir.join("atmos-simulator-camera-inject-test.png");
        std::fs::write(&path, b"png-bytes").unwrap();
        let bytes = resolve_camera_png(path.to_str(), None).unwrap();
        let _ = std::fs::remove_file(&path);
        assert_eq!(bytes, b"png-bytes");
    }

    #[test]
    fn simulator_op_error_maps_reason_code() {
        let err = map_simulator_op(SimulatorOpError::new(
            core_service::SimulatorReason::BootFailed,
        ));
        match err {
            ServiceError::Processing(code) => assert_eq!(code, "boot_failed"),
            other => panic!("expected processing, got {other}"),
        }
    }
}
