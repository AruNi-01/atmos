//! HTTP catalog probe: `/doc` + listed config endpoints. CLI already owns `opencode models`.

use std::path::Path;
use std::time::Duration;

use serde_json::Value;
use tokio::time::timeout;

use crate::catalog::engine::NativeProbeResult;
use crate::catalog::parse::{agent_modes_from_named_keys, commands_from_value};
use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};

use super::http::OpenCodeHttp;
use super::rpc::models_from_providers;
use super::spawn::spawn_serve;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) async fn probe(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    timeout(PROBE_TIMEOUT, probe_inner(isolated_cwd))
        .await
        .map_err(|_| "native OpenCode catalog probe timed out".to_string())?
}

async fn probe_inner(isolated_cwd: &Path) -> Result<NativeProbeResult, String> {
    let mut serve = spawn_serve("opencode", isolated_cwd, None, None)
        .await
        .map_err(|error| error.to_string())?;
    let http = match OpenCodeHttp::new(
        serve.base_url.clone(),
        serve.password().to_string(),
        isolated_cwd,
    ) {
        Ok(http) => http,
        Err(error) => {
            let closed = close_serve(&mut serve).await;
            let _ = closed;
            return Err(error.to_string());
        }
    };
    let doc = match http.wait_for_doc().await {
        Ok(doc) => doc,
        Err(error) => {
            let closed = close_serve(&mut serve).await;
            let _ = closed;
            return Err(error.to_string());
        }
    };

    let mut models = Vec::new();
    let mut thinking = AgentThinkingSupport::None;
    if let Ok((status, providers)) = http.get_json("/config/providers").await {
        if status.is_success() {
            let (options, _) = models_from_providers(&providers);
            models = options.models;
            thinking = thinking_union_from_models(&models);
        }
    }

    let mut modes = Vec::new();
    let mut permission_modes = Vec::new();
    let mut commands = Vec::new();
    if let Ok((status, body)) = http.get_json("/command").await {
        if status.is_success() {
            commands = commands_from_value(&body);
        }
    }
    for path in listed_get_paths(&doc) {
        if path == "/config/providers" || path == "/doc" || path == "/event" {
            continue;
        }
        if !is_option_list_path(&path) {
            continue;
        }
        let Ok((status, body)) = http.get_json(&path).await else {
            continue;
        };
        if !status.is_success() {
            continue;
        }
        if modes.is_empty() {
            modes = modes_from_config_body(&body);
        }
        if permission_modes.is_empty() {
            permission_modes = permission_modes_from_config_body(&body);
        }
    }
    crate::policy::merge_plan_into_modes(&mut modes, &permission_modes);
    permission_modes = crate::policy::fold_vendor_permission_modes(&permission_modes);
    if permission_modes.is_empty() {
        permission_modes = crate::policy::advertised_permission_modes("opencode");
    }
    let _ = http.post_empty("/instance/dispose").await;
    let closed = close_serve(&mut serve).await;
    if modes.is_empty() {
        modes = opencode_modes();
    }
    Ok(NativeProbeResult {
        models,
        modes,
        permission_modes,
        thinking,
        commands,
        cwd: isolated_cwd.to_path_buf(),
        closed,
    })
}

async fn close_serve(serve: &mut super::spawn::ServeChild) -> bool {
    let _ = serve.child.start_kill();
    timeout(Duration::from_secs(2), serve.child.wait())
        .await
        .is_ok()
}

pub(crate) fn listed_get_paths(doc: &Value) -> Vec<String> {
    let Some(paths) = doc.get("paths").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (path, item) in paths {
        let has_get = item.get("get").is_some();
        if has_get {
            out.push(path.clone());
        }
    }
    out
}

pub(crate) fn is_option_list_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    if lower.contains("/session/") || lower.contains("/permission/") || lower.contains("/message") {
        return false;
    }
    lower.contains("mode")
        || lower.contains("agent")
        || lower.contains("permission")
        || lower.contains("approval")
        || lower.contains("/config")
}

pub(crate) fn modes_from_config_body(body: &Value) -> Vec<AgentMode> {
    agent_modes_from_named_keys(body, &["modes", "mode", "agents", "agent"])
}

pub(crate) fn permission_modes_from_config_body(body: &Value) -> Vec<AgentMode> {
    agent_modes_from_named_keys(
        body,
        &[
            "permission_modes",
            "permissionModes",
            "permission",
            "permission_mode",
            "approval",
            "approvals",
        ],
    )
}

pub(crate) fn opencode_modes() -> Vec<AgentMode> {
    vec![
        AgentMode {
            id: "build".into(),
            label: "Build".into(),
            is_default: true,
        },
        AgentMode {
            id: "plan".into(),
            label: "Plan".into(),
            is_default: false,
        },
    ]
}

fn thinking_union_from_models(models: &[AgentModel]) -> AgentThinkingSupport {
    let mut options = Vec::new();
    for model in models {
        let Some(AgentThinkingSupport::Enum {
            options: levels, ..
        }) = &model.thinking
        else {
            continue;
        };
        for level in levels {
            if !options.iter().any(|item| item == level) {
                options.push(level.clone());
            }
        }
    }
    if options.is_empty() {
        AgentThinkingSupport::None
    } else {
        AgentThinkingSupport::Enum {
            arg: Some("variant".into()),
            options,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorded_doc() -> Value {
        serde_json::from_str(include_str!("testdata/openapi-doc.json")).expect("doc")
    }

    #[test]
    fn recorded_doc_lists_no_composer_modes_or_permission_modes() {
        let doc = recorded_doc();
        assert!(listed_get_paths(&doc).contains(&"/config/providers".to_string()));
        assert!(listed_get_paths(&doc).contains(&"/command".to_string()));
        assert!(!is_option_list_path(
            "/session/{id}/permissions/{permissionID}"
        ));
        assert!(is_option_list_path("/config/agents"));
    }

    #[test]
    fn config_body_fills_modes_only_when_listed() {
        let body = serde_json::json!({
            "agents": [
                {"id": "build", "name": "Build"},
                {"id": "plan", "name": "Plan"}
            ],
            "permission": ["ask", "allow"]
        });
        let modes = modes_from_config_body(&body);
        assert_eq!(modes[0].id, "build");
        assert_eq!(modes[1].id, "plan");
        let permission = permission_modes_from_config_body(&body);
        assert_eq!(permission[0].id, "ask");
        let folded = crate::policy::fold_vendor_permission_modes(&permission);
        assert_eq!(
            folded
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "ask_always"]
        );
        let stamped = crate::policy::advertised_permission_modes("opencode");
        assert_eq!(
            stamped
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            ["auto", "ask_always"]
        );
        let fallback_modes = if modes_from_config_body(&serde_json::json!({})).is_empty() {
            opencode_modes()
        } else {
            Vec::new()
        };
        assert_eq!(fallback_modes[0].id, "build");
        assert_eq!(fallback_modes[1].id, "plan");
        assert!(fallback_modes[0].is_default);
    }
}
