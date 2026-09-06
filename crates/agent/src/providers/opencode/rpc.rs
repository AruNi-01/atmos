//! OpenCode session RPC: prompt_async, abort, permissions, questions, providers.

use serde_json::{json, Value};

use crate::contract::AgentActionError;
use crate::contract::{AgentCurrentConfig, AgentSupportedOptions};
use crate::contract::{AgentModel, AgentThinkingSupport};
use crate::options::probe::cli::parse::agent_modes_from_value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpenApiRoutes {
    pub permission_session_scoped: bool,
    pub question_session_scoped: bool,
}

impl Default for OpenApiRoutes {
    fn default() -> Self {
        Self {
            permission_session_scoped: true,
            question_session_scoped: true,
        }
    }
}

pub fn routes_from_doc(doc: &Value) -> OpenApiRoutes {
    let keys = path_keys(doc);
    let permission_session_scoped = keys
        .iter()
        .any(|path| path.contains("/session/") && path.contains("/permissions/"));
    let permission_legacy = keys
        .iter()
        .any(|path| path.contains("/permission/") && path.contains("/reply"));
    let question_session_scoped = keys
        .iter()
        .any(|path| path.contains("/session/") && path.contains("/question/"));
    OpenApiRoutes {
        permission_session_scoped: permission_session_scoped || !permission_legacy,
        question_session_scoped,
    }
}

fn path_keys(doc: &Value) -> Vec<String> {
    doc.get("paths")
        .and_then(Value::as_object)
        .map(|object| object.keys().cloned().collect())
        .unwrap_or_default()
}

pub fn permission_path(routes: &OpenApiRoutes, session_id: &str, permission_id: &str) -> String {
    if routes.permission_session_scoped {
        format!("/session/{session_id}/permissions/{permission_id}")
    } else {
        format!("/permission/{permission_id}/reply")
    }
}

pub fn permission_response_body(option_id: &str) -> Result<Value, AgentActionError> {
    let response = match option_id {
        "once" | "allow_once" => "once",
        "always" | "allow_always" => "always",
        "reject" | "reject_once" => "reject",
        _ => return Err(AgentActionError::NotFound(option_id.to_string())),
    };
    Ok(json!({ "response": response }))
}

pub fn permission_legacy_body(option_id: &str) -> Result<Value, AgentActionError> {
    let reply = match option_id {
        "once" | "allow_once" => "once",
        "always" | "allow_always" => "always",
        "reject" | "reject_once" => "reject",
        _ => return Err(AgentActionError::NotFound(option_id.to_string())),
    };
    Ok(json!({ "reply": reply }))
}

pub fn question_reply_path(routes: &OpenApiRoutes, session_id: &str, request_id: &str) -> String {
    if routes.question_session_scoped {
        format!("/session/{session_id}/question/{request_id}/reply")
    } else {
        format!("/question/{request_id}/reply")
    }
}

pub fn question_reject_path(routes: &OpenApiRoutes, session_id: &str, request_id: &str) -> String {
    if routes.question_session_scoped {
        format!("/session/{session_id}/question/{request_id}/reject")
    } else {
        format!("/question/{request_id}/reject")
    }
}

pub fn question_answers_body(option_id: &str) -> Value {
    let labels = crate::map::labels_from_ask_option_id(option_id);
    if !labels.is_empty() {
        return json!({
            "answers": labels.into_iter().map(|label| json!([label])).collect::<Vec<_>>()
        });
    }
    json!({ "answers": [[option_id]] })
}

pub fn split_model(id: &str) -> Option<(String, String)> {
    let (provider, model) = id.split_once('/')?;
    if provider.is_empty() || model.is_empty() {
        return None;
    }
    Some((provider.to_string(), model.to_string()))
}

pub fn prompt_async_body(
    text: &str,
    attachments: &[String],
    config: &AgentCurrentConfig,
    advertised_variants: &[String],
) -> Value {
    prompt_async_body_with_delivery(text, attachments, config, advertised_variants, None)
}

pub fn session_create_body(config: &AgentCurrentConfig) -> Value {
    let mut body = json!({});
    if let Some(mode) = config.mode.as_deref().filter(|value| !value.is_empty()) {
        body["agent"] = json!(mode);
    }
    body
}

pub fn prompt_async_body_with_delivery(
    text: &str,
    attachments: &[String],
    config: &AgentCurrentConfig,
    advertised_variants: &[String],
    delivery: Option<&str>,
) -> Value {
    let mut parts = vec![json!({ "type": "text", "text": text })];
    for attachment in attachments {
        if attachment.trim().is_empty() {
            continue;
        }
        parts.push(file_part(attachment));
    }
    let mut body = json!({ "parts": parts });
    if let Some(model) = config.model.as_deref().and_then(split_model) {
        body["model"] = json!({
            "providerID": model.0,
            "modelID": model.1,
        });
    }
    if let Some(variant) = config.thinking.as_deref() {
        if advertised_variants.iter().any(|item| item == variant) {
            body["variant"] = json!(variant);
        }
    }
    if let Some(mode) = config.mode.as_deref().filter(|value| !value.is_empty()) {
        body["agent"] = json!(mode);
    }
    if let Some(delivery) = delivery.filter(|value| !value.is_empty()) {
        body["delivery"] = json!(delivery);
    }
    body
}

fn file_part(attachment: &str) -> Value {
    let path = std::path::Path::new(attachment);
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(attachment);
    let mime = mime_for_name(filename);
    let url = if attachment.starts_with("http://")
        || attachment.starts_with("https://")
        || attachment.starts_with("file:")
    {
        attachment.to_string()
    } else {
        format!("file://{attachment}")
    };
    json!({
        "type": "file",
        "mime": mime,
        "filename": filename,
        "url": url,
    })
}

fn mime_for_name(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        _ => "text/plain",
    }
}

pub fn models_from_providers(body: &Value) -> (AgentSupportedOptions, Option<String>) {
    let mut models = Vec::new();
    let providers = body
        .get("providers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let defaults = body.get("default").and_then(Value::as_object);
    for provider in providers {
        let Some(provider_id) = provider.get("id").and_then(Value::as_str) else {
            continue;
        };
        let group = provider
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
        let Some(map) = provider.get("models").and_then(Value::as_object) else {
            continue;
        };
        for (model_id, model) in map {
            let id = format!("{provider_id}/{model_id}");
            let label = model
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(model_id)
                .to_string();
            let is_default = defaults
                .and_then(|object| object.get(provider_id))
                .and_then(Value::as_str)
                == Some(model_id.as_str());
            models.push(AgentModel {
                id,
                label,
                group: group.clone(),
                is_default,
                thinking: thinking_from_model_variants(model),
            });
        }
    }
    let default_model = models
        .iter()
        .find(|model| model.is_default)
        .map(|model| model.id.clone());
    (
        AgentSupportedOptions {
            models,
            thinking: AgentThinkingSupport::None,
            modes: Vec::new(),
            ..AgentSupportedOptions::default()
        },
        default_model,
    )
}

fn thinking_from_model_variants(model: &Value) -> Option<AgentThinkingSupport> {
    let variants = model
        .get("variants")
        .or_else(|| model.get("variant"))
        .map(agent_modes_from_value)
        .unwrap_or_default();
    if variants.is_empty() {
        None
    } else {
        Some(AgentThinkingSupport::Enum {
            arg: Some("variant".into()),
            options: variants.into_iter().map(|item| item.id).collect(),
        })
    }
}

pub fn session_id_from_create(body: &Value) -> Option<String> {
    body.get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub fn session_fork_path(session_id: &str) -> String {
    format!("/session/{session_id}/fork")
}

pub fn session_fork_body(message_id: Option<&str>) -> Value {
    match message_id.filter(|id| !id.is_empty()) {
        Some(message_id) => json!({ "messageID": message_id }),
        None => json!({}),
    }
}

pub fn session_revert_path(session_id: &str) -> String {
    format!("/session/{session_id}/revert")
}

pub fn session_revert_body(message_id: &str) -> Value {
    json!({ "messageID": message_id })
}

pub fn session_unrevert_path(session_id: &str) -> String {
    format!("/session/{session_id}/unrevert")
}

pub fn last_user_message_id(body: &Value) -> Option<String> {
    let messages = if let Some(array) = body.as_array() {
        array.clone()
    } else {
        body.get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    messages.iter().rev().find_map(|message| {
        let info = message.get("info").unwrap_or(message);
        if info.get("role").and_then(Value::as_str) != Some("user") {
            return None;
        }
        info.get("id")
            .or_else(|| message.get("id"))
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_string)
    })
}

pub fn user_message_id_matching(body: &Value, target: &str) -> Option<String> {
    let messages = if let Some(array) = body.as_array() {
        array.clone()
    } else {
        body.get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    messages.iter().find_map(|message| {
        let info = message.get("info").unwrap_or(message);
        let id = info
            .get("id")
            .or_else(|| message.get("id"))
            .and_then(Value::as_str)?;
        (id == target).then(|| id.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentActionKind;

    fn recorded_doc() -> Value {
        serde_json::from_str(include_str!("testdata/openapi-doc.json")).expect("doc")
    }

    #[test]
    fn permission_once_posts_session_scoped_response_once() {
        let routes = routes_from_doc(&recorded_doc());
        assert!(routes.permission_session_scoped);
        let path = permission_path(&routes, "ses_x", "per_abc");
        assert_eq!(path, "/session/ses_x/permissions/per_abc");
        assert!(!path.contains("/permission/per_abc/reply"));
        let body = permission_response_body("once").expect("body");
        let expected: Value =
            serde_json::from_str(include_str!("testdata/permission-respond.body.json"))
                .expect("golden");
        assert_eq!(body, expected);
        assert!(body.get("remember").is_none());
        assert!(body.get("reply").is_none());
    }

    #[test]
    fn question_reply_uses_question_url_not_permission() {
        let routes = routes_from_doc(&recorded_doc());
        assert!(routes.question_session_scoped);
        let path = question_reply_path(&routes, "ses_x", "que_1");
        assert_eq!(path, "/session/ses_x/question/que_1/reply");
        assert!(!path.contains("/permissions/"));
        let reject = question_reject_path(&routes, "ses_x", "que_1");
        assert!(reject.ends_with("/reject"));
    }

    #[test]
    fn unknown_permission_option_is_not_found() {
        let error = permission_response_body("maybe").expect_err("unknown");
        assert!(matches!(error, AgentActionError::NotFound(_)));
        let _ = AgentActionKind::RespondPermission;
    }

    #[test]
    fn splits_model_on_first_slash_only() {
        assert_eq!(
            split_model("lmstudio/google/gemma-3n-e4b"),
            Some(("lmstudio".into(), "google/gemma-3n-e4b".into()))
        );
        assert_eq!(split_model("opus"), None);
    }

    #[test]
    fn providers_without_default_do_not_guess_first_model() {
        let body = json!({
            "providers": [{
                "id": "zhipuai-coding-plan",
                "name": "Zhipu",
                "models": {
                    "glm-5v-turbo": { "name": "GLM 5V Turbo" },
                    "glm-5.3-flash": { "name": "GLM 5.3 Flash" }
                }
            }]
        });
        let (options, default_model) = models_from_providers(&body);
        assert!(default_model.is_none());
        assert!(options.models.len() >= 2);
        assert!(options.models.iter().all(|model| !model.is_default));
    }

    #[test]
    fn providers_attach_per_model_variants() {
        let body = json!({
            "providers": [{
                "id": "zhipuai",
                "name": "Zhipu",
                "models": {
                    "glm-5": {
                        "name": "GLM 5",
                        "variants": [
                            { "id": "none" },
                            { "id": "low" },
                            { "id": "high" }
                        ]
                    },
                    "glm-flash": { "name": "Flash" }
                }
            }]
        });
        let (options, _) = models_from_providers(&body);
        let glm = options
            .models
            .iter()
            .find(|model| model.id == "zhipuai/glm-5")
            .unwrap();
        match &glm.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["none", "low", "high"]);
            }
            other => panic!("expected glm variants, got {other:?}"),
        }
        let flash = options
            .models
            .iter()
            .find(|model| model.id == "zhipuai/glm-flash")
            .unwrap();
        assert!(flash.thinking.is_none());
    }

    #[test]
    fn providers_explicit_default_is_stamped() {
        let body = json!({
            "default": { "anthropic": "claude-sonnet-4-5" },
            "providers": [{
                "id": "anthropic",
                "name": "Anthropic",
                "models": {
                    "claude-sonnet-4-5": { "name": "Sonnet" },
                    "claude-opus-4": { "name": "Opus" }
                }
            }]
        });
        let (_, default_model) = models_from_providers(&body);
        assert_eq!(
            default_model.as_deref(),
            Some("anthropic/claude-sonnet-4-5")
        );
    }

    #[test]
    fn omits_guessed_variant() {
        let config = AgentCurrentConfig {
            model: Some("anthropic/claude-sonnet-4-5".into()),
            thinking: Some("high".into()),
            mode: None,
            ..AgentCurrentConfig::default()
        };
        let body = prompt_async_body("hi", &[], &config, &[]);
        assert!(body.get("variant").is_none());
        let with = prompt_async_body("hi", &[], &config, &["high".into()]);
        assert_eq!(with["variant"], "high");
        assert!(body.get("format").is_none());
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn prompt_async_does_not_disable_question() {
        let body = prompt_async_body("hi", &[], &AgentCurrentConfig::default(), &[]);
        assert_eq!(body["parts"][0]["type"], "text");
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn steer_prompt_sets_delivery_steer() {
        let body = prompt_async_body_with_delivery(
            "nudge",
            &[],
            &AgentCurrentConfig::default(),
            &[],
            Some("steer"),
        );
        assert_eq!(body["delivery"], "steer");
        assert_eq!(body["parts"][0]["text"], "nudge");
        let queued = prompt_async_body("hi", &[], &AgentCurrentConfig::default(), &[]);
        assert!(queued.get("delivery").is_none());
    }

    #[test]
    fn prompt_async_sends_mode_as_agent() {
        let config = AgentCurrentConfig {
            mode: Some("plan".into()),
            ..AgentCurrentConfig::default()
        };
        let body = prompt_async_body("hi", &[], &config, &[]);
        assert_eq!(body["agent"], "plan");
        let empty = prompt_async_body("hi", &[], &AgentCurrentConfig::default(), &[]);
        assert!(empty.get("agent").is_none());
    }

    #[test]
    fn session_create_sends_mode_as_agent() {
        let config = AgentCurrentConfig {
            mode: Some("plan".into()),
            ..AgentCurrentConfig::default()
        };
        assert_eq!(session_create_body(&config)["agent"], "plan");
        assert!(session_create_body(&AgentCurrentConfig::default())
            .get("agent")
            .is_none());
    }

    #[test]
    fn fork_revert_unrevert_paths_and_bodies() {
        assert_eq!(session_fork_path("ses_x"), "/session/ses_x/fork");
        assert_eq!(session_fork_body(None), json!({}));
        assert_eq!(
            session_fork_body(Some("msg_1")),
            json!({ "messageID": "msg_1" })
        );
        assert_eq!(session_revert_path("ses_x"), "/session/ses_x/revert");
        assert_eq!(
            session_revert_body("msg_user"),
            json!({ "messageID": "msg_user" })
        );
        assert!(session_revert_body("msg_user")
            .get("conversationOnly")
            .is_none());
        assert_eq!(session_unrevert_path("ses_x"), "/session/ses_x/unrevert");
        let doc = recorded_doc();
        assert!(doc.pointer("/paths/~1session~1{id}~1fork").is_some());
        assert!(doc.pointer("/paths/~1session~1{id}~1revert").is_some());
        assert!(doc.pointer("/paths/~1session~1{id}~1unrevert").is_some());
    }
}
