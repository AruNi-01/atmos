use super::support::{function_settings_path, terminal_code_agent_path};
use super::*;
use llm::{
    config::resolve_provider_by_id, FileLlmConfigStore, GenerateTextRequest, LlmProviderEntry,
    LlmProvidersFile, ResponseFormat,
};

impl WsMessageService {
    pub(super) fn handle_notification_settings_get(&self) -> Result<Value> {
        let settings = self.notification_service.get_settings();
        serde_json::to_value(settings).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize notification settings: {e}"))
        })
    }

    pub(super) fn handle_notification_settings_update(
        &self,
        req: NotificationSettingsUpdateRequest,
    ) -> Result<Value> {
        let settings: core_service::service::notification::NotificationSettings =
            serde_json::from_value(req.settings).map_err(|e| {
                ServiceError::Validation(format!("Invalid notification settings: {e}"))
            })?;
        self.notification_service
            .update_settings(settings)
            .map_err(ServiceError::Processing)?;
        Ok(json!({ "ok": true }))
    }

    pub(super) async fn handle_notification_test_push(
        &self,
        req: NotificationTestPushRequest,
    ) -> Result<Value> {
        let settings = self.notification_service.get_settings();
        let Some(server) = settings.push_servers.get(req.server_index) else {
            return Err(ServiceError::Validation("Invalid server index".to_string()));
        };

        let test_payload = core_service::service::notification::NotificationPayload {
            title: "Atmos Test Notification".to_string(),
            body: "This is a test notification from Atmos.".to_string(),
            tool: "test".to_string(),
            state: "test".to_string(),
            session_id: "test".to_string(),
            project_path: None,
            context_id: None,
            pane_id: None,
            side_chat_id: None,
            source_pane_id: None,
        };

        match self
            .notification_service
            .test_push(server, &test_payload)
            .await
        {
            Ok(()) => Ok(json!({ "ok": true })),
            Err(e) => Ok(json!({ "ok": false, "error": e })),
        }
    }

    fn read_function_settings() -> Result<Value> {
        let path = function_settings_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read function_settings.json: {}", e))
            })?;
            Ok(serde_json::from_str(&content).unwrap_or(json!({})))
        } else {
            Ok(json!({}))
        }
    }

    fn read_code_agent_custom() -> Result<Value> {
        // Smart-upgrade non-customized built-in flags when manifest version bumps.
        // YOLO mode is global and does not count as a per-agent command edit.
        let _ = core_service::ensure_builtin_terminal_agents_upgraded();
        let path = terminal_code_agent_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {}", e))
            })?;
            Ok(serde_json::from_str(&content).unwrap_or(json!({ "agents": [] })))
        } else {
            Ok(json!({ "agents": [] }))
        }
    }

    fn read_agent_behaviour_settings() -> Result<Value> {
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
        let summary_settings = core_service::AttentionSummarySettings::from_json(&val);
        Ok(json!({
            "idle_session_timeout_mins": timeout,
            "attention_summary_enabled": summary_settings.enabled,
            "attention_summary_delay_mins": summary_settings.delay_mins,
            "attention_summary_agent_id": summary_settings.agent_id,
            "attention_summary_model": summary_settings.model,
        }))
    }

    fn read_llm_providers() -> Result<Value> {
        let store = FileLlmConfigStore::new()
            .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
        let config = store.load().map_err(|e| {
            ServiceError::Validation(format!("Failed to read llm providers: {}", e))
        })?;
        serde_json::to_value(config).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize llm providers: {}", e))
        })
    }

    pub(super) async fn handle_settings_bootstrap_get(&self) -> Result<Value> {
        // Run before reading function_settings so builtin_manifest_version is current.
        let _ = core_service::ensure_builtin_terminal_agents_upgraded();
        Ok(json!({
            "function_settings": Self::read_function_settings()?,
            "llm_providers": Self::read_llm_providers()?,
            "code_agent_custom": Self::read_code_agent_custom()?,
            "agent_behaviour_settings": Self::read_agent_behaviour_settings()?,
        }))
    }

    pub(super) async fn handle_function_settings_get(&self) -> Result<Value> {
        Self::read_function_settings()
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
        Self::read_code_agent_custom()
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
        Self::read_agent_behaviour_settings()
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
        if let Some(enabled) = req.attention_summary_enabled {
            val["attention_summary_enabled"] = json!(enabled);
        }
        if let Some(delay) = req.attention_summary_delay_mins {
            let delay = delay.clamp(1, 24 * 60);
            val["attention_summary_delay_mins"] = json!(delay);
        }
        if let Some(agent_id) = req.attention_summary_agent_id {
            let trimmed = agent_id.trim();
            if trimmed.is_empty() {
                if let Some(obj) = val.as_object_mut() {
                    obj.remove("attention_summary_agent_id");
                }
            } else {
                val["attention_summary_agent_id"] = json!(trimmed);
            }
        }
        if let Some(model) = req.attention_summary_model {
            let trimmed = model.trim();
            if trimmed.is_empty() {
                if let Some(obj) = val.as_object_mut() {
                    obj.remove("attention_summary_model");
                }
            } else {
                val["attention_summary_model"] = json!(trimmed);
            }
        }
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
        Self::read_llm_providers()
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

        let mut rx =
            core_service::service::llm_text_generation::generate_text_stream(&resolved, request)
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
