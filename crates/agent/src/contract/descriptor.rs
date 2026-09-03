use serde::{Deserialize, Serialize};

use super::options::{AgentMode, AgentModel, AgentThinkingSupport};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    #[default]
    Unsupported,
    Supported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentCapabilities {
    #[serde(default)]
    pub steer: Capability,
    #[serde(default)]
    pub resume: Capability,
    #[serde(default)]
    pub permission: Capability,
    #[serde(default)]
    pub configure: Capability,
    #[serde(default)]
    pub fork: Capability,
    #[serde(default)]
    pub rewind: Capability,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentOptionSupport {
    #[serde(default)]
    pub models: Capability,
    #[serde(default)]
    pub thinking: Capability,
    #[serde(default)]
    pub modes: Capability,
    #[serde(default)]
    pub permission_modes: Capability,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AgentSupportedOptions {
    #[serde(default)]
    pub models: Vec<AgentModel>,
    #[serde(default, skip_serializing_if = "AgentThinkingSupport::is_none")]
    pub thinking: AgentThinkingSupport,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modes: Vec<AgentMode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub permission_modes: Vec<AgentMode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentCurrentConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentDescriptor {
    pub identity: AgentIdentity,
    #[serde(default)]
    pub capabilities: AgentCapabilities,
    #[serde(default)]
    pub support: AgentOptionSupport,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{
        supported_options_from_catalog, AgentModelCatalog, CatalogSource, CatalogStatus,
    };
    use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
    use crate::policy::{capabilities_for_provider, option_support_for_provider};

    fn supported() -> AgentCapabilities {
        AgentCapabilities {
            steer: Capability::Supported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Supported,
        }
    }

    #[test]
    fn s1_descriptor_is_merged_product_surface() {
        let catalog = AgentModelCatalog {
            agent_id: "grok".into(),
            status: CatalogStatus::Ok,
            models: vec![AgentModel {
                id: "grok-4".into(),
                label: "Grok 4".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::Enum {
                arg: Some("--effort".into()),
                options: vec!["low".into(), "high".into()],
            },
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: CatalogSource::Live,
            message: None,
        };
        let descriptor = AgentDescriptor {
            identity: AgentIdentity {
                id: "grok".into(),
                name: "Grok".into(),
                version: Some("1".into()),
            },
            capabilities: capabilities_for_provider("grok"),
            support: option_support_for_provider("grok"),
            supported_options: supported_options_from_catalog(&catalog),
            current_config: AgentCurrentConfig {
                model: Some("grok-4".into()),
                thinking: Some("high".into()),
                mode: None,
                permission_mode: None,
            },
        };
        let json = serde_json::to_value(&descriptor).expect("serialize");
        let object = json.as_object().expect("object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "capabilities",
                "current_config",
                "identity",
                "support",
                "supported_options"
            ]
        );
        assert_eq!(json["identity"]["id"], "grok");
        assert_eq!(json["identity"]["name"], "Grok");
        assert_eq!(json["current_config"]["model"], "grok-4");
        assert_eq!(json["supported_options"]["models"][0]["id"], "grok-4");
        assert_eq!(json["supported_options"]["thinking"]["type"], "enum");
        assert!(json.get("session_list").is_none());
        assert!(json["capabilities"].get("session_list").is_none());
        assert!(json["capabilities"].get("load_session").is_none());
        assert!(json["capabilities"].get("session_resume").is_none());
        assert!(json.get("config_options").is_none());
        assert!(json.get("session_config_options").is_none());
    }

    #[test]
    fn s4_capabilities_serde_is_closed_snake_case_fields() {
        let json = serde_json::to_value(supported()).expect("serialize");
        let object = json.as_object().expect("object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "configure",
                "fork",
                "permission",
                "resume",
                "rewind",
                "steer"
            ]
        );
        assert_eq!(
            object.get("steer").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert_eq!(
            object.get("resume").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert_eq!(
            object.get("permission").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert_eq!(
            object.get("configure").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert_eq!(
            object.get("fork").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert_eq!(
            object.get("rewind").and_then(|v| v.as_str()),
            Some("supported")
        );
        assert!(object.get("session_list").is_none());
        assert!(object.get("cancel").is_none());
    }

    #[test]
    fn s5_supported_options_omits_thinking_when_none() {
        let options = AgentSupportedOptions {
            models: Vec::new(),
            thinking: AgentThinkingSupport::None,
            modes: Vec::new(),
            permission_modes: Vec::new(),
        };
        let json = serde_json::to_value(&options).expect("serialize");
        let object = json.as_object().expect("object");
        assert_eq!(object.get("models"), Some(&serde_json::json!([])));
        assert!(object.get("thinking").is_none());
        assert!(object.get("modes").is_none());
        assert!(object.get("permission_modes").is_none());
        assert!(options.thinking.is_none());
    }

    #[test]
    fn crate_root_agent_capabilities_is_closed_descriptor_shape() {
        let caps = crate::AgentCapabilities {
            steer: Capability::Unsupported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Supported,
        };
        assert_eq!(caps.steer, Capability::Unsupported);
        assert_eq!(caps.resume, Capability::Supported);
        assert_eq!(caps.permission, Capability::Supported);
        assert_eq!(caps.configure, Capability::Supported);
        assert_eq!(caps.fork, Capability::Supported);
        assert_eq!(caps.rewind, Capability::Supported);
    }

    #[test]
    fn app069_regression_missing_capability_and_support_fields_deserialize_unsupported() {
        let caps: AgentCapabilities = serde_json::from_value(serde_json::json!({
            "steer": "supported",
            "resume": "supported"
        }))
        .expect("caps");
        assert_eq!(caps.steer, Capability::Supported);
        assert_eq!(caps.resume, Capability::Supported);
        assert_eq!(caps.permission, Capability::Unsupported);
        assert_eq!(caps.configure, Capability::Unsupported);
        assert_eq!(caps.fork, Capability::Unsupported);
        assert_eq!(caps.rewind, Capability::Unsupported);

        let support: AgentOptionSupport = serde_json::from_value(serde_json::json!({
            "models": "supported"
        }))
        .expect("support");
        assert_eq!(support.models, Capability::Supported);
        assert_eq!(support.thinking, Capability::Unsupported);
        assert_eq!(support.modes, Capability::Unsupported);
        assert_eq!(support.permission_modes, Capability::Unsupported);

        let descriptor: AgentDescriptor = serde_json::from_value(serde_json::json!({
            "identity": { "id": "old", "name": "old" },
            "supported_options": {},
            "current_config": {}
        }))
        .expect("descriptor");
        assert_eq!(descriptor.support, AgentOptionSupport::default());
        assert_eq!(descriptor.capabilities.fork, Capability::Unsupported);
        assert_eq!(descriptor.capabilities.rewind, Capability::Unsupported);
        assert!(descriptor.current_config.permission_mode.is_none());
        assert!(descriptor.supported_options.permission_modes.is_empty());
    }

    #[test]
    fn permission_modes_serialize_when_present() {
        let options = AgentSupportedOptions {
            permission_modes: vec![AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            ..AgentSupportedOptions::default()
        };
        let json = serde_json::to_value(&options).expect("serialize");
        assert_eq!(json["permission_modes"][0]["id"], "default");
    }
}
