use std::sync::Arc;
use std::time::Duration;

use local_model_runtime::{
    custom::{load_custom_models, merge_custom_models, remove_custom_model, upsert_custom_model},
    fetch_manifest,
    huggingface::{resolve_hf_model_url, HfResolveResult},
    LocalModelState, ModelManifest,
};
use serde_json::{json, Value};

use super::support::{delete_local_managed_provider, upsert_local_managed_provider};
use core_service::{Result, ServiceError};

use super::{
    LocalModelCustomAddRequest, LocalModelCustomDeleteRequest, LocalModelDeleteRequest,
    LocalModelDeleteRuntimeRequest, LocalModelDownloadRequest, LocalModelResolveHfUrlRequest,
    LocalModelStartRequest, WsEvent, WsMessage, WsMessageService,
};

impl WsMessageService {
    async fn fetch_local_model_manifest(&self, force_refresh: bool) -> Result<ModelManifest> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let mut manifest = fetch_manifest(&http, force_refresh).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to fetch local model manifest: {e}"))
        })?;
        merge_custom_models(&mut manifest).map_err(|e| {
            ServiceError::Processing(format!("Failed to load custom local models: {e}"))
        })?;
        Ok(manifest)
    }

    pub(super) async fn handle_local_model_list(&self) -> Result<Value> {
        let manifest = self.fetch_local_model_manifest(false).await?;
        let runtime_installed = self.local_model_manager.is_runtime_file_present();
        let state = self.local_model_manager.state();
        let state_json =
            serde_json::to_value(&state).map_err(|e| ServiceError::Processing(e.to_string()))?;
        let mut models_json = Vec::with_capacity(manifest.models.len());
        for model in &manifest.models {
            let mut value =
                serde_json::to_value(model).map_err(|e| ServiceError::Processing(e.to_string()))?;
            let installed = self.local_model_manager.is_model_file_present(&model.id);
            if let Some(object) = value.as_object_mut() {
                object.insert("installed".to_string(), json!(installed));
            }
            models_json.push(value);
        }
        Ok(json!({
            "runtime": {
                "installed": runtime_installed,
            },
            "models": models_json,
            "state": state_json,
        }))
    }

    pub(super) async fn handle_local_model_refresh(&self) -> Result<Value> {
        let manifest = self.fetch_local_model_manifest(true).await?;
        let runtime_installed = self.local_model_manager.is_runtime_file_present();
        let state = self.local_model_manager.state();
        let state_json =
            serde_json::to_value(&state).map_err(|e| ServiceError::Processing(e.to_string()))?;
        let mut models_json = Vec::with_capacity(manifest.models.len());
        for model in &manifest.models {
            let mut value =
                serde_json::to_value(model).map_err(|e| ServiceError::Processing(e.to_string()))?;
            let installed = self.local_model_manager.is_model_file_present(&model.id);
            if let Some(object) = value.as_object_mut() {
                object.insert("installed".to_string(), json!(installed));
            }
            models_json.push(value);
        }
        Ok(json!({
            "runtime": {
                "installed": runtime_installed,
            },
            "models": models_json,
            "state": state_json,
        }))
    }

    pub(super) async fn handle_local_model_runtime_download(
        &self,
        _conn_id: &str,
    ) -> Result<Value> {
        let manifest = self.fetch_local_model_manifest(false).await?;

        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();

        let mut state_rx = manager.subscribe();
        let ws_mgr_notify = ws_manager.clone();
        tokio::spawn(async move {
            while let Ok(state) = state_rx.recv().await {
                if let Some(ref mgr) = ws_mgr_notify {
                    if let Ok(state_json) = serde_json::to_value(&state) {
                        let notification = WsMessage::notification(
                            WsEvent::LocalModelStateChanged,
                            json!({ "state": state_json }),
                        );
                        let _ = mgr.broadcast(&notification).await;
                    }
                    if matches!(
                        state,
                        LocalModelState::NotInstalled | LocalModelState::Failed { .. }
                    ) {
                        break;
                    }
                }
            }
        });

        tokio::spawn(async move {
            if let Err(e) = manager.ensure_binary(&manifest).await {
                tracing::error!("[LocalModel] runtime download failed: {e}");
                manager.mark_failed(format!("Runtime download failed: {e}"));
                return;
            }
            manager.mark_not_installed();
        });

        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_download(
        &self,
        _conn_id: &str,
        req: LocalModelDownloadRequest,
    ) -> Result<Value> {
        let manifest = self.fetch_local_model_manifest(false).await?;

        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        let model_id = req.model_id.clone();

        let mut state_rx = manager.subscribe();
        let ws_mgr_notify = ws_manager.clone();
        tokio::spawn(async move {
            while let Ok(state) = state_rx.recv().await {
                if let Some(ref mgr) = ws_mgr_notify {
                    if let Ok(state_json) = serde_json::to_value(&state) {
                        let notification = WsMessage::notification(
                            WsEvent::LocalModelStateChanged,
                            json!({ "state": state_json }),
                        );
                        let _ = mgr.broadcast(&notification).await;
                    }
                    if matches!(
                        state,
                        LocalModelState::InstalledNotRunning { .. }
                            | LocalModelState::Failed { .. }
                    ) {
                        break;
                    }
                }
            }
        });

        tokio::spawn(async move {
            if let Err(e) = manager.ensure_model(&manifest, &model_id).await {
                tracing::error!("[LocalModel] model download failed: {e}");
                manager.mark_failed(format!("Model download failed: {e}"));
                return;
            }
            manager.mark_installed_not_running(model_id);
        });

        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_start(
        &self,
        _conn_id: &str,
        req: LocalModelStartRequest,
    ) -> Result<Value> {
        let manifest = self.fetch_local_model_manifest(false).await?;

        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        let model_id = req.model_id.clone();

        let mut state_rx = manager.subscribe();
        let ws_mgr_notify = ws_manager.clone();
        tokio::spawn(async move {
            while let Ok(state) = state_rx.recv().await {
                if let Some(ref mgr) = ws_mgr_notify {
                    if let Ok(state_json) = serde_json::to_value(&state) {
                        let notification = WsMessage::notification(
                            WsEvent::LocalModelStateChanged,
                            json!({ "state": state_json }),
                        );
                        let _ = mgr.broadcast(&notification).await;
                    }
                    if matches!(
                        state,
                        LocalModelState::Running { .. } | LocalModelState::Failed { .. }
                    ) {
                        break;
                    }
                }
            }
        });

        tokio::spawn(async move {
            if let Err(e) = manager.start(&manifest, &model_id).await {
                tracing::error!("[LocalModel] start failed: {e}");
                return;
            }
            if let Some(endpoint) = manager.endpoint() {
                let display_name = manifest
                    .models
                    .iter()
                    .find(|m| m.id == model_id)
                    .map(|m| m.display_name.as_str())
                    .unwrap_or(&model_id);
                if let Err(e) = upsert_local_managed_provider(&model_id, display_name, &endpoint) {
                    tracing::warn!("[LocalModel] failed to update provider config: {e}");
                }
            }
        });

        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_stop(&self, _conn_id: &str) -> Result<Value> {
        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        manager
            .stop()
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        if let Some(ref mgr) = ws_manager {
            let state_json = serde_json::to_value(&manager.state()).unwrap_or(json!(null));
            let notification = WsMessage::notification(
                WsEvent::LocalModelStateChanged,
                json!({ "state": state_json }),
            );
            let _ = mgr.broadcast(&notification).await;
        }
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_delete(
        &self,
        _conn_id: &str,
        req: LocalModelDeleteRequest,
    ) -> Result<Value> {
        let manager = Arc::clone(&self.local_model_manager);
        manager
            .delete_model(&req.model_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;

        if let Err(e) = delete_local_managed_provider(&req.model_id) {
            tracing::warn!("[LocalModel] failed to delete provider config: {e}");
        }

        if let Some(ref mgr) = self.ws_manager.get() {
            let state_json = serde_json::to_value(&manager.state()).unwrap_or(json!(null));
            let notification = WsMessage::notification(
                WsEvent::LocalModelStateChanged,
                json!({ "state": state_json }),
            );
            let _ = mgr.broadcast(&notification).await;
        }
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_delete_runtime(
        &self,
        _conn_id: &str,
        _req: LocalModelDeleteRuntimeRequest,
    ) -> Result<Value> {
        let manager = Arc::clone(&self.local_model_manager);
        manager
            .delete_runtime()
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        if let Some(ref mgr) = self.ws_manager.get() {
            let state_json = serde_json::to_value(&manager.state()).unwrap_or(json!(null));
            let notification = WsMessage::notification(
                WsEvent::LocalModelStateChanged,
                json!({ "state": state_json }),
            );
            let _ = mgr.broadcast(&notification).await;
        }
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_local_model_resolve_hf_url(
        &self,
        req: LocalModelResolveHfUrlRequest,
    ) -> Result<Value> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let resolved = resolve_hf_model_url(&http, &req.url).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to resolve Hugging Face URL: {e}"))
        })?;
        serde_json::to_value(resolved).map_err(|e| ServiceError::Processing(e.to_string()))
    }

    pub(super) async fn handle_local_model_custom_add(
        &self,
        req: LocalModelCustomAddRequest,
    ) -> Result<Value> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let resolved = resolve_hf_model_url(&http, &req.url).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to resolve Hugging Face URL: {e}"))
        })?;
        let HfResolveResult::Model { mut model } = resolved else {
            return Err(ServiceError::Validation(
                "Choose a specific GGUF file before adding the custom model".to_string(),
            ));
        };

        if let Some(display_name) = req
            .display_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            model.display_name = display_name.to_string();
        }
        if let Some(ram_footprint_mb) = req.ram_footprint_mb.filter(|value| *value > 0) {
            model.ram_footprint_mb = ram_footprint_mb;
        }

        let model = upsert_custom_model(model).map_err(|e| {
            ServiceError::Processing(format!("Failed to save custom local model: {e}"))
        })?;
        Ok(json!({ "ok": true, "model": model }))
    }

    pub(super) async fn handle_local_model_custom_delete(
        &self,
        req: LocalModelCustomDeleteRequest,
    ) -> Result<Value> {
        let custom_models = load_custom_models().map_err(|e| {
            ServiceError::Processing(format!("Failed to read custom local models: {e}"))
        })?;
        if !custom_models.iter().any(|model| model.id == req.model_id) {
            return Err(ServiceError::Validation(
                "Custom local model not found".to_string(),
            ));
        }

        self.local_model_manager
            .delete_model(&req.model_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let removed = remove_custom_model(&req.model_id).map_err(|e| {
            ServiceError::Processing(format!("Failed to remove custom local model: {e}"))
        })?;
        Ok(json!({ "ok": removed }))
    }

    pub(super) async fn handle_local_model_status(&self) -> Result<Value> {
        let state = self.local_model_manager.state();
        serde_json::to_value(&state).map_err(|e| ServiceError::Processing(e.to_string()))
    }
}
