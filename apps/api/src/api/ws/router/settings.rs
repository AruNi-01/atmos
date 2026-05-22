use super::support::{function_settings_path, terminal_code_agent_path};
use super::*;
use llm::{
    config::resolve_provider_by_id, generate_text_stream, FileLlmConfigStore, GenerateTextRequest,
    LlmProviderEntry, LlmProvidersFile, ResponseFormat,
};

impl WsMessageService {
    pub(super) async fn handle_function_settings_get(&self) -> Result<Value> {
        let path = function_settings_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read function_settings.json: {}", e))
            })?;
            let val: Value = serde_json::from_str(&content).unwrap_or(json!({}));
            Ok(val)
        } else {
            Ok(json!({}))
        }
    }

    pub(super) async fn handle_function_settings_update(
        &self,
        req: FunctionSettingsUpdateRequest,
    ) -> Result<Value> {
        let path = function_settings_path();
        let mut settings: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
            serde_json::from_str(&content).unwrap_or(json!({}))
        } else {
            json!({})
        };

        if let Some(obj) = settings.as_object_mut() {
            let section = obj.entry(&req.function_name).or_insert(json!({}));
            if let Some(section_obj) = section.as_object_mut() {
                section_obj.insert(req.key.clone(), req.value.clone());
            }
        }

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&settings).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize settings: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write function_settings.json: {}", e))
        })?;

        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_workspace_gitignore_dirs_get(&self) -> Result<Value> {
        let config = core_service::service::workspace_gitignore_dirs::load_config();
        serde_json::to_value(config)
            .map_err(|e| ServiceError::Validation(format!("Serialize config: {}", e)))
    }

    pub(super) async fn handle_workspace_gitignore_dirs_update(&self, req: Value) -> Result<Value> {
        let config: core_service::service::workspace_gitignore_dirs::GitIgnoreDirsConfig =
            serde_json::from_value(req).map_err(|e| {
                ServiceError::Validation(format!("Invalid gitignore_dirs config: {}", e))
            })?;
        core_service::service::workspace_gitignore_dirs::save_config(&config)?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_code_agent_custom_get(&self) -> Result<Value> {
        let path = terminal_code_agent_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {}", e))
            })?;
            let val: Value = serde_json::from_str(&content).unwrap_or(json!({ "agents": [] }));
            Ok(val)
        } else {
            Ok(json!({ "agents": [] }))
        }
    }

    pub(super) async fn handle_code_agent_custom_update(
        &self,
        req: CodeAgentCustomUpdateRequest,
    ) -> Result<Value> {
        let path = terminal_code_agent_path();
        let deduped_agents = req
            .agents
            .as_array()
            .map(|items| {
                let mut seen = std::collections::HashSet::new();
                items
                    .iter()
                    .filter_map(|item| {
                        let id = item.get("id")?.as_str()?.trim();
                        if id.is_empty() || !seen.insert(id.to_string()) {
                            return None;
                        }
                        Some(item.clone())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let data = json!({ "agents": deduped_agents });

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos/agent dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&data).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize terminal_code_agent: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write terminal_code_agent.json: {}", e))
        })?;

        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_agent_behaviour_settings_get(&self) -> Result<Value> {
        let path = terminal_code_agent_path();
        let val: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {}", e))
            })?;
            serde_json::from_str(&content).unwrap_or(json!({}))
        } else {
            json!({})
        };
        let timeout = val
            .get("idle_session_timeout_mins")
            .and_then(|v| v.as_u64())
            .unwrap_or(30);
        Ok(json!({ "idle_session_timeout_mins": timeout }))
    }

    pub(super) async fn handle_agent_behaviour_settings_update(
        &self,
        req: AgentBehaviourSettingsUpdateRequest,
    ) -> Result<Value> {
        let path = terminal_code_agent_path();
        // Read existing file to preserve `agents` list
        let mut val: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or(json!({ "agents": [] }))
        } else {
            json!({ "agents": [] })
        };
        val["idle_session_timeout_mins"] = json!(req.idle_session_timeout_mins);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos/agent dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&val).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize settings: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write terminal_code_agent.json: {}", e))
        })?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_llm_providers_get(&self) -> Result<Value> {
        let store = FileLlmConfigStore::new()
            .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
        let config = store.load().map_err(|e| {
            ServiceError::Validation(format!("Failed to read llm providers: {}", e))
        })?;
        serde_json::to_value(config).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize llm providers: {}", e))
        })
    }

    pub(super) async fn handle_llm_providers_update(
        &self,
        req: LlmProvidersUpdateRequest,
    ) -> Result<Value> {
        let config: LlmProvidersFile = serde_json::from_value(req.config).map_err(|e| {
            ServiceError::Validation(format!("Invalid llm providers payload: {}", e))
        })?;
        let store = FileLlmConfigStore::new()
            .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
        store.save(&config).map_err(|e| {
            ServiceError::Validation(format!("Failed to save llm providers: {}", e))
        })?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_llm_provider_test(
        &self,
        conn_id: &str,
        req: LlmProviderTestRequest,
    ) -> Result<Value> {
        let provider_id = req
            .provider_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("test-provider")
            .to_string();
        let mut provider: LlmProviderEntry = serde_json::from_value(req.provider).map_err(|e| {
            ServiceError::Validation(format!("Invalid llm provider test payload: {}", e))
        })?;
        provider.enabled = true;

        let mut config = LlmProvidersFile::default();
        config.providers.insert(provider_id.clone(), provider);

        let resolved = resolve_provider_by_id(&config, Some(&provider_id))
            .map_err(|e| ServiceError::Validation(format!("Failed to resolve provider: {e}")))?
            .ok_or_else(|| {
                ServiceError::Validation("Failed to resolve provider for test".to_string())
            })?;

        let request = GenerateTextRequest {
            system: Some("Reply with a short plain-text greeting.".to_string()),
            prompt: "hello".to_string(),
            temperature: Some(0.1),
            max_output_tokens: Some(resolved.max_output_tokens.unwrap_or(64)),
            response_format: ResponseFormat::Text,
        };

        let mut rx = generate_text_stream(&resolved, request)
            .await
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to start provider test stream: {e}"))
            })?;

        let ws_manager = self.ws_manager.get().cloned();
        let mut full_text = String::new();

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    full_text.push_str(&chunk);
                    if let Some(ref mgr) = ws_manager {
                        let notification = WsMessage::notification(
                            WsEvent::LlmProviderTestChunk,
                            json!({
                                "stream_id": req.stream_id,
                                "chunk": chunk,
                            }),
                        );
                        let _ = mgr.send_to(conn_id, &notification).await;
                    }
                }
                Err(error) => {
                    return Err(ServiceError::Validation(format!(
                        "Provider test failed: {error}"
                    )));
                }
            }
        }

        let text = full_text.trim().to_string();
        if text.is_empty() {
            return Err(ServiceError::Validation(
                "Provider test returned empty output".to_string(),
            ));
        }

        Ok(json!({ "text": text }))
    }
}
