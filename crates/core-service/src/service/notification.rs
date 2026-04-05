use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use infra::{WsEvent, WsManager, WsMessage};

use super::agent_hooks::{AgentHookState, AgentHookStateUpdate, AgentToolType};

fn notification_settings_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".atmos").join("notification_settings.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    #[serde(default)]
    pub browser_notification: bool,
    #[serde(default)]
    pub desktop_notification: bool,
    #[serde(default)]
    pub notify_on_permission_request: bool,
    #[serde(default)]
    pub notify_on_task_complete: bool,
    #[serde(default)]
    pub push_servers: Vec<PushServerConfig>,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            browser_notification: false,
            desktop_notification: false,
            notify_on_permission_request: true,
            notify_on_task_complete: true,
            push_servers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushServerConfig {
    pub id: String,
    pub enabled: bool,
    #[serde(rename = "type")]
    pub server_type: PushServerType,
    pub url: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default)]
    pub device_key: Option<String>,
    #[serde(default)]
    pub custom_body_template: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PushServerType {
    Ntfy,
    Bark,
    Gotify,
    CustomWebhook,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPayload {
    pub title: String,
    pub body: String,
    pub tool: String,
    pub state: String,
    pub session_id: String,
    #[serde(default)]
    pub project_path: Option<String>,
}

pub struct NotificationService {
    settings: RwLock<NotificationSettings>,
    ws_manager: RwLock<Option<Arc<WsManager>>>,
    http_client: reqwest::Client,
}

impl NotificationService {
    pub fn new() -> Self {
        let settings = load_settings().unwrap_or_default();
        Self {
            settings: RwLock::new(settings),
            ws_manager: RwLock::new(None),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn set_ws_manager(&self, manager: Arc<WsManager>) {
        *self.ws_manager.write() = Some(manager);
    }

    pub fn get_settings(&self) -> NotificationSettings {
        self.settings.read().clone()
    }

    pub fn update_settings(&self, new_settings: NotificationSettings) -> Result<(), String> {
        let mut guard = self.settings.write();
        save_settings(&new_settings)?;
        *guard = new_settings;
        Ok(())
    }

    pub fn on_agent_state_change(
        self: &Arc<Self>,
        update: &AgentHookStateUpdate,
        previous_state: Option<AgentHookState>,
    ) {
        let settings = self.settings.read().clone();

        let should_notify_permission = settings.notify_on_permission_request
            && update.state == AgentHookState::PermissionRequest;

        let should_notify_complete = settings.notify_on_task_complete
            && update.state == AgentHookState::Idle
            && previous_state == Some(AgentHookState::Running);

        if !should_notify_permission && !should_notify_complete {
            return;
        }

        let tool_name = format!("{}", update.tool);
        let (title, body) = if should_notify_permission {
            (
                format!("{} - Permission Required", tool_display_name(&update.tool)),
                format!(
                    "{} is requesting permission to proceed.",
                    tool_display_name(&update.tool)
                ),
            )
        } else {
            (
                format!("{} - Task Complete", tool_display_name(&update.tool)),
                format!("{} has finished running.", tool_display_name(&update.tool)),
            )
        };

        let payload = NotificationPayload {
            title: title.clone(),
            body: body.clone(),
            tool: tool_name,
            state: format!("{}", update.state),
            session_id: update.session_id.clone(),
            project_path: update.project_path.clone(),
        };

        if settings.browser_notification || settings.desktop_notification {
            self.broadcast_client_notification(&payload);
        }

        if !settings.push_servers.is_empty() {
            let service = Arc::clone(self);
            let servers = settings.push_servers.clone();
            tokio::spawn(async move {
                for server in servers {
                    if server.enabled {
                        if let Err(e) = service.send_push_notification(&server, &payload).await {
                            warn!("Failed to send push notification to {}: {}", server.url, e);
                        }
                    }
                }
            });
        }
    }

    fn broadcast_client_notification(&self, payload: &NotificationPayload) {
        let ws = self.ws_manager.read();
        if let Some(ref manager) = *ws {
            let manager = Arc::clone(manager);
            let data = serde_json::to_value(payload).unwrap_or_default();
            let msg = WsMessage::notification(WsEvent::AgentNotification, data);
            tokio::spawn(async move {
                if let Err(e) = manager.broadcast(&msg).await {
                    warn!("Failed to broadcast agent notification: {}", e);
                }
            });
        }
    }

    pub async fn test_push(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        self.send_push_notification(server, payload).await
    }

    async fn send_push_notification(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        match server.server_type {
            PushServerType::Ntfy => self.send_ntfy(server, payload).await,
            PushServerType::Bark => self.send_bark(server, payload).await,
            PushServerType::Gotify => self.send_gotify(server, payload).await,
            PushServerType::CustomWebhook => self.send_custom_webhook(server, payload).await,
        }
    }

    async fn send_ntfy(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        let topic = server.topic.as_deref().unwrap_or("atmos");
        let url = format!("{}/{}", server.url.trim_end_matches('/'), topic);

        let mut req = self
            .http_client
            .post(&url)
            .header("Title", &payload.title)
            .header("Priority", "default")
            .header("Tags", "robot")
            .body(payload.body.clone());

        if let Some(ref token) = server.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("ntfy returned status {}", resp.status()));
        }
        debug!("ntfy notification sent to {}", url);
        Ok(())
    }

    async fn send_bark(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        let device_key = server
            .device_key
            .as_deref()
            .ok_or_else(|| "Bark device key is required".to_string())?;

        let url = format!(
            "{}/{}/{}/{}",
            server.url.trim_end_matches('/'),
            device_key,
            urlencoding::encode(&payload.title),
            urlencoding::encode(&payload.body)
        );

        let resp = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Bark returned status {}", resp.status()));
        }
        debug!("Bark notification sent to {}", server.url);
        Ok(())
    }

    async fn send_gotify(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        let url = format!("{}/message", server.url.trim_end_matches('/'));
        let token = server
            .token
            .as_deref()
            .ok_or_else(|| "Gotify token is required".to_string())?;

        let body = serde_json::json!({
            "title": payload.title,
            "message": payload.body,
            "priority": 5
        });

        let resp = self
            .http_client
            .post(&url)
            .header("X-Gotify-Key", token)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Gotify returned status {}", resp.status()));
        }
        debug!("Gotify notification sent to {}", url);
        Ok(())
    }

    async fn send_custom_webhook(
        &self,
        server: &PushServerConfig,
        payload: &NotificationPayload,
    ) -> Result<(), String> {
        let body = if let Some(ref template) = server.custom_body_template {
            let rendered = template
                .replace("{{title}}", &payload.title)
                .replace("{{body}}", &payload.body)
                .replace("{{tool}}", &payload.tool)
                .replace("{{state}}", &payload.state)
                .replace("{{session_id}}", &payload.session_id)
                .replace(
                    "{{project_path}}",
                    payload.project_path.as_deref().unwrap_or(""),
                );
            rendered
        } else {
            serde_json::to_string(payload).map_err(|e| e.to_string())?
        };

        let mut req = self
            .http_client
            .post(&server.url)
            .header("Content-Type", "application/json")
            .body(body);

        if let Some(ref token) = server.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Webhook returned status {}", resp.status()));
        }
        debug!("Custom webhook notification sent to {}", server.url);
        Ok(())
    }
}

fn tool_display_name(tool: &AgentToolType) -> &'static str {
    match tool {
        AgentToolType::ClaudeCode => "Claude Code",
        AgentToolType::Codex => "Codex",
        AgentToolType::Opencode => "OpenCode",
    }
}

fn load_settings() -> Result<NotificationSettings, String> {
    let path = notification_settings_path();
    if !path.exists() {
        return Ok(NotificationSettings::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_settings(settings: &NotificationSettings) -> Result<(), String> {
    let path = notification_settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
    }
    info!("Notification settings saved to {:?}", path);
    Ok(())
}
