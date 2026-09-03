use agent::{AgentAvailableCommand, AgentDescriptor};
use chrono::{DateTime, Utc};
use core_service::service::agent_chat::SessionUsage;
use core_service::{AgentChatMeta, AgentChatOrigin, AgentChatSnapshot, RuntimeStatus};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatCreateRequest {
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    pub provider_id: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub origin: Option<AgentChatOrigin>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatListRequest {
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    /// When true, unscoped list returns every chat instead of scratch-only.
    #[serde(default)]
    pub all: bool,
    #[serde(default)]
    pub origin: Option<AgentChatOrigin>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatIdRequest {
    pub chat_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatMessagesRequest {
    pub chat_id: String,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatRenameRequest {
    pub chat_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatSubscribeRequest {
    pub chat_id: String,
    #[serde(default)]
    pub after_sequence: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatSendRequest {
    pub chat_id: String,
    pub text: String,
    #[serde(default)]
    pub attachment_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatSteerRequest {
    pub chat_id: String,
    pub expected_turn_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatQueueAddRequest {
    pub chat_id: String,
    pub text: String,
    #[serde(default)]
    pub attachment_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatQueueUpdateRequest {
    pub chat_id: String,
    pub item_id: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatQueueReorderRequest {
    pub chat_id: String,
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatQueueDeleteRequest {
    pub chat_id: String,
    pub item_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatPermissionRespondRequest {
    pub chat_id: String,
    pub request_id: String,
    #[serde(default)]
    pub option_id: Option<String>,
    #[serde(default)]
    pub allowed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatSessionOpRespondRequest {
    pub chat_id: String,
    pub request_id: String,
    pub option_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentModelCatalogGetRequest {
    pub agent_id: String,
    #[serde(default)]
    pub refresh: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatOk {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatConfigureRequest {
    pub chat_id: String,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentChatPrefsSetRequest {
    #[serde(default)]
    pub last_registry_id: Option<String>,
}

/// WS JSON for `AgentChatMeta`. Persist-only `applied_*` stay off the wire.
#[derive(Debug, Clone, Serialize)]
pub struct AgentChatMetaWire {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted: bool,
    pub title: Option<String>,
    pub cwd: String,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub space_id: Option<String>,
    pub origin: AgentChatOrigin,
    pub provider_id: String,
    pub last_message_at: Option<DateTime<Utc>>,
    pub last_event_seq: u64,
    pub persistence_handle: Option<String>,
    pub runtime_status: RuntimeStatus,
    pub available_commands: Vec<AgentAvailableCommand>,
    pub session_usage: Option<SessionUsage>,
    pub descriptor: AgentDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rewind_view: Option<AgentChatRewindViewWire>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentChatRewindViewWire {
    pub until_turn_id: String,
}

impl From<&AgentChatMeta> for AgentChatMetaWire {
    fn from(meta: &AgentChatMeta) -> Self {
        Self {
            id: meta.id.clone(),
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            deleted: meta.deleted,
            title: meta.title.clone(),
            cwd: meta.cwd.clone(),
            workspace_id: meta.workspace_id.clone(),
            project_id: meta.project_id.clone(),
            space_id: meta.space_id.clone(),
            origin: meta.origin,
            provider_id: meta.provider_id.clone(),
            last_message_at: meta.last_message_at,
            last_event_seq: meta.last_event_seq,
            persistence_handle: meta.persistence_handle.clone(),
            runtime_status: meta.runtime_status,
            available_commands: meta.available_commands.clone(),
            session_usage: meta.session_usage.clone(),
            descriptor: meta.descriptor.clone(),
            parent_chat_id: meta.parent_chat_id.clone(),
            rewind_view: meta
                .rewind_view
                .as_ref()
                .map(|view| AgentChatRewindViewWire {
                    until_turn_id: view.until_turn_id.clone(),
                }),
        }
    }
}

pub fn agent_chat_meta_json(meta: &AgentChatMeta) -> Result<Value, serde_json::Error> {
    serde_json::to_value(AgentChatMetaWire::from(meta))
}

pub fn agent_chat_snapshot_json(snapshot: &AgentChatSnapshot) -> Result<Value, serde_json::Error> {
    let mut value = serde_json::to_value(snapshot)?;
    value["meta"] = serde_json::to_value(AgentChatMetaWire::from(&snapshot.meta))?;
    Ok(value)
}

#[cfg(test)]
mod wire_tests {
    use super::*;
    use agent::{AgentCurrentConfig, AgentIdentity, AgentSupportedOptions};

    fn meta_with_applied() -> AgentChatMeta {
        AgentChatMeta {
            id: "chat-1".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted: false,
            title: Some("hello".into()),
            cwd: "/tmp".into(),
            workspace_id: None,
            project_id: None,
            space_id: None,
            origin: AgentChatOrigin::Normal,
            provider_id: "claude".into(),
            last_message_at: None,
            last_event_seq: 3,
            persistence_handle: None,
            runtime_status: RuntimeStatus::Detached,
            applied_model: Some("opus".into()),
            applied_thinking: Some("high".into()),
            applied_mode: Some("plan".into()),
            applied_permission_mode: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: AgentDescriptor {
                identity: AgentIdentity {
                    id: "claude".into(),
                    name: "Claude Code".into(),
                    version: None,
                },
                capabilities: agent::capabilities_for_provider("claude"),
                support: agent::option_support_for_provider("claude"),
                supported_options: AgentSupportedOptions::default(),
                current_config: AgentCurrentConfig {
                    model: Some("opus".into()),
                    thinking: Some("high".into()),
                    mode: None,
                    ..AgentCurrentConfig::default()
                },
            },
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
        }
    }

    #[test]
    fn meta_wire_omits_persist_only_and_legacy_keys() {
        let meta = meta_with_applied();
        let value = agent_chat_meta_json(&meta).expect("serialize");
        let object = value.as_object().expect("object");
        assert!(object.get("applied_model").is_none());
        assert!(object.get("applied_thinking").is_none());
        assert!(object.get("applied_mode").is_none());
        assert!(object.get("supports_steer").is_none());
        assert!(object.get("selected_model").is_none());
        assert!(object.get("selected_thinking").is_none());
        assert!(object.get("selected_mode").is_none());
        assert!(object.get("session_config_options").is_none());
        assert_eq!(
            object
                .get("descriptor")
                .and_then(|item| item.get("identity"))
                .and_then(|item| item.get("id"))
                .and_then(|item| item.as_str()),
            Some("claude")
        );
        assert_eq!(
            object.get("provider_id").and_then(|item| item.as_str()),
            Some("claude")
        );
        assert_eq!(
            object
                .get("descriptor")
                .and_then(|item| item.get("current_config"))
                .and_then(|item| item.get("model"))
                .and_then(|item| item.as_str()),
            Some("opus")
        );
    }

    #[test]
    fn persist_meta_still_has_applied_fields() {
        let value = serde_json::to_value(meta_with_applied()).expect("persist");
        let object = value.as_object().expect("object");
        assert_eq!(
            object.get("applied_model").and_then(|item| item.as_str()),
            Some("opus")
        );
        assert!(object.get("descriptor").is_some());
    }

    #[test]
    fn snapshot_wire_strips_applied_from_nested_meta() {
        let snapshot = AgentChatSnapshot {
            meta: meta_with_applied(),
            messages: Vec::new(),
            queue: Vec::new(),
            pending_permission: None,
            running_turn_id: None,
            running_turn_started_at: None,
        };
        let value = agent_chat_snapshot_json(&snapshot).expect("serialize");
        let meta = value
            .get("meta")
            .and_then(|item| item.as_object())
            .expect("meta");
        assert!(meta.get("applied_model").is_none());
        assert!(meta.get("applied_thinking").is_none());
        assert!(meta.get("applied_mode").is_none());
        assert!(meta.get("descriptor").is_some());
        assert!(value.get("messages").is_some());
    }
}
