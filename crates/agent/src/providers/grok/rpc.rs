//! JSON-RPC 2.0 shapes for Grok ACP stdio (`session/*` + `_x.ai/*` extensions).
#![allow(dead_code)] // Classifier + session params; runtime session I/O is acp_client.

use serde_json::{json, Value};

use crate::contract::AgentEvent;

/// Logical extension names (docs). Wire JSON-RPC `method` must be `_x.ai/...`.
pub const METHOD_REWIND_POINTS: &str = "x.ai/rewind/points";
pub const METHOD_REWIND_EXECUTE: &str = "x.ai/rewind/execute";
pub const METHOD_SESSION_FORK: &str = "x.ai/session/fork";
pub const METHOD_WORKTREE_CREATE: &str = "x.ai/git/worktree/create";
pub const METHOD_WORKTREE_STATUS: &str = "x.ai/git/worktree/status";
pub const METHOD_INTERJECT: &str = "x.ai/interject";

/// ACP extension methods must start with `_`. Logical `x.ai/...` becomes `_x.ai/...`.
pub fn wire_method(logical: &str) -> String {
    if logical.starts_with('_') {
        logical.to_string()
    } else {
        format!("_{logical}")
    }
}

/// Strip at most one leading `_`, then match `x.ai/...`.
pub fn normalize_xai_method(method: &str) -> &str {
    method.strip_prefix('_').unwrap_or(method)
}

/// `session/new` params. Always send empty `mcpServers`.
pub fn session_new_params(cwd: &str) -> Value {
    json!({
        "cwd": cwd,
        "mcpServers": []
    })
}

/// `session/load` params. `persistence_handle` is Grok `sessionId`.
pub fn session_load_params(session_id: &str, cwd: &str) -> Value {
    json!({
        "sessionId": session_id,
        "cwd": cwd,
        "mcpServers": []
    })
}

pub fn jsonrpc_request(id: u64, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    })
}

/// ACP initialize. Live Grok 1.0.17 returns `_meta.availableCommands` (builtins).
pub fn initialize_request(id: u64) -> Value {
    jsonrpc_request(
        id,
        "initialize",
        json!({
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": { "readTextFile": true, "writeTextFile": true },
                "terminal": true
            },
            "clientInfo": {
                "name": "atmos",
                "version": "0.1.0",
                "title": "ATMOS"
            }
        }),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionDisposition {
    /// Session-op traffic is handled by the adapter, not as a chat event.
    Skip,
    /// Emit one `AgentEvent::Unknown` and keep the session alive.
    Unknown,
}

/// Classify Grok `x.ai/*` extension methods. Non-extension methods return `None`.
pub fn map_xai_method(method: &str) -> Option<ExtensionDisposition> {
    let method = normalize_xai_method(method);
    if !method.starts_with("x.ai/") {
        return None;
    }
    if is_session_op_method(method) || is_telemetry_method(method) {
        Some(ExtensionDisposition::Skip)
    } else {
        Some(ExtensionDisposition::Unknown)
    }
}

fn is_telemetry_method(method: &str) -> bool {
    matches!(
        method,
        "x.ai/sessions/changed"
            | "x.ai/session_notification"
            | "x.ai/mcp_initialized"
            | "x.ai/session/prompt_complete"
            | "x.ai/session/interjection"
    ) || method.starts_with("x.ai/sessions/")
        || method.starts_with("x.ai/queue/")
        || method.starts_with("x.ai/mcp/")
        || method.starts_with("x.ai/models/")
        || method.starts_with("x.ai/settings/")
        || method.starts_with("x.ai/announcements/")
}

fn is_session_op_method(method: &str) -> bool {
    matches!(
        method,
        "x.ai/rewind/points"
            | "x.ai/rewind/execute"
            | "x.ai/session/fork"
            | "x.ai/git/worktree/create"
            | "x.ai/git/worktree/status"
    )
}

/// Map an inbound `x.ai/*` notification. Skip session-op and telemetry; one Unknown otherwise.
pub fn map_xai_notification(method: &str, params: Value) -> Option<AgentEvent> {
    match map_xai_method(method) {
        Some(ExtensionDisposition::Unknown) => Some(AgentEvent::Unknown {
            event_type: normalize_xai_method(method).to_string(),
            payload: params,
        }),
        Some(ExtensionDisposition::Skip) | None => None,
    }
}

pub fn interject_params(session_id: &str, text: &str) -> Value {
    json!({
        "sessionId": session_id,
        "text": text,
    })
}

pub fn rewind_points_params(session_id: &str) -> Value {
    json!({ "sessionId": session_id })
}

/// ACP `session/request_permission` JSON-RPC **result** when the user picks an option.
/// Live grok 1.0.17 chrome uses hyphenated `optionId`s (`allow-once`); kinds stay ACP snake_case.
pub fn permission_selected_result(option_id: &str) -> Value {
    json!({
        "outcome": {
            "outcome": "selected",
            "optionId": option_id
        }
    })
}

/// ACP cancel outcome. Required when the client sends `session/cancel` with a
/// pending permission (schema 1.5.0). Not a live Grok capture.
pub fn permission_cancelled_result() -> Value {
    json!({
        "outcome": {
            "outcome": "cancelled"
        }
    })
}

pub fn rewind_mode_for_option(option_id: &str) -> Option<&'static str> {
    match option_id {
        "rewind_conversation" => Some("conversation_only"),
        "rewind_code" => Some("files_only"),
        "rewind_both" => Some("all"),
        _ => None,
    }
}

pub fn rewind_execute_params(
    session_id: &str,
    target_prompt_index: u64,
    force: bool,
    mode: &str,
) -> Value {
    json!({
        "sessionId": session_id,
        "targetPromptIndex": target_prompt_index,
        "force": force,
        "mode": mode,
    })
}

pub fn fork_session_params(
    source_session_id: &str,
    source_cwd: &str,
    new_cwd: &str,
    session_kind: Option<&str>,
) -> Value {
    let mut params = json!({
        "sourceSessionId": source_session_id,
        "sourceCwd": source_cwd,
        "newCwd": new_cwd,
    });
    if let Some(kind) = session_kind {
        params["sessionKind"] = json!(kind);
    }
    params
}

pub fn worktree_create_params(session_id: &str, source_path: &str) -> Value {
    json!({
        "sessionId": session_id,
        "sourcePath": source_path,
    })
}

/// Grok worktree ACP responses wrap the payload as `{ "result": { ... } }`
/// (`ExtMethodResult`). Fork/rewind results are unwrapped objects.
pub fn unwrap_ext_payload(value: &Value) -> &Value {
    match value.get("result") {
        Some(inner) if inner.is_object() || inner.is_array() => inner,
        _ => value,
    }
}

pub fn forked_session_id(result: &Value) -> Option<String> {
    let payload = unwrap_ext_payload(result);
    payload
        .get("newSessionId")
        .or_else(|| payload.get("sessionId"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub fn worktree_path(result: &Value) -> Option<String> {
    let payload = unwrap_ext_payload(result);
    payload
        .get("worktreePath")
        .or_else(|| payload.get("newCwd"))
        .or_else(|| payload.get("path"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub fn worktree_create_is_pending(result: &Value) -> bool {
    unwrap_ext_payload(result)
        .get("status")
        .and_then(Value::as_str)
        == Some("creating")
}

/// JSON-RPC 2.0 still returns `result` when Grok's rewind body has `success: false`.
pub fn rewind_execute_failed(result: &Value) -> Option<String> {
    let payload = unwrap_ext_payload(result);
    if payload.get("success").and_then(Value::as_bool) != Some(false) {
        return None;
    }
    Some(
        payload
            .get("error")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .unwrap_or("rewind failed")
            .to_string(),
    )
}

fn json_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|n| u64::try_from(n).ok()))
        .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
}

pub fn prompt_index_from_point(point: &Value) -> Option<u64> {
    point
        .get("promptIndex")
        .or_else(|| point.get("prompt_index"))
        .or_else(|| point.get("index"))
        .and_then(json_u64)
}

pub fn rewind_point_entries(result: &Value) -> Vec<&Value> {
    let payload = unwrap_ext_payload(result);
    payload
        .get("rewind_points")
        .or_else(|| payload.get("points"))
        .or_else(|| payload.get("rewindPoints"))
        .and_then(Value::as_array)
        .map(|entries| entries.iter().collect())
        .or_else(|| payload.as_array().map(|entries| entries.iter().collect()))
        .unwrap_or_default()
}

fn point_matches_token(point: &Value, token: &str) -> bool {
    if prompt_index_from_point(point)
        .map(|index| index.to_string())
        .as_deref()
        == Some(token)
    {
        return true;
    }
    for key in [
        "id",
        "turnId",
        "turn_id",
        "checkpointId",
        "checkpoint_id",
        "uuid",
    ] {
        if point.get(key).and_then(Value::as_str) == Some(token) {
            return true;
        }
    }
    false
}

pub fn rewind_point_has_file_changes(points: &Value, token: &str) -> Option<bool> {
    let entries = rewind_point_entries(points);
    let matched = entries.iter().copied().find(|point| {
        point_matches_token(point, token)
            || prompt_index_from_point(point)
                .map(|index| index.to_string())
                .as_deref()
                == Some(token)
    })?;
    Some(
        matched
            .get("hasFileChanges")
            .or_else(|| matched.get("has_file_changes"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
    )
}

/// `target` is a prompt index or a token from `_x.ai/rewind/points`.
pub fn resolve_target_prompt_index(target: &str, points: &Value) -> Option<u64> {
    let entries = rewind_point_entries(points);
    if let Ok(index) = target.parse::<u64>() {
        return Some(index);
    }
    for point in entries {
        if point_matches_token(point, target) {
            return prompt_index_from_point(point);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::{LoadSessionRequest, NewSessionRequest, SessionId};

    #[test]
    fn session_new_sends_cwd_and_empty_mcp_servers() {
        let params = session_new_params("/tmp/project");
        assert_eq!(params["cwd"], "/tmp/project");
        assert_eq!(params["mcpServers"], json!([]));
        assert!(params.get("_meta").is_none());
        assert!(params.get("yoloMode").is_none());
        let request = jsonrpc_request(1, "session/new", params);
        assert_eq!(request["jsonrpc"], "2.0");
        assert_eq!(request["method"], "session/new");

        let schema = serde_json::to_value(NewSessionRequest::new("/tmp/project")).expect("schema");
        assert_eq!(schema["cwd"], "/tmp/project");
        assert_eq!(schema["mcpServers"], json!([]));
        assert!(schema.get("yoloMode").is_none());
        assert!(
            schema
                .get("_meta")
                .and_then(|meta| meta.get("yoloMode"))
                .is_none(),
            "Chat session/new must not set yoloMode; Atmos owns permission chrome"
        );
    }

    #[test]
    fn request_permission_fixture_is_live_hyphenated_chrome() {
        use agent_client_protocol::schema::v1::{
            PermissionOptionKind, RequestPermissionRequest, ToolKind,
        };

        let fixture: Value = serde_json::from_str(include_str!("testdata/request_permission.json"))
            .expect("fixture");
        assert_eq!(fixture["jsonrpc"], "2.0");
        assert_eq!(fixture["method"], "session/request_permission");
        let params = fixture["params"].clone();
        let request: RequestPermissionRequest =
            serde_json::from_value(params).expect("ACP RequestPermissionRequest");
        assert_eq!(request.session_id.to_string(), "sess_grok_1");
        assert_eq!(
            request.tool_call.fields.title.as_deref(),
            Some("Write `/tmp/atmos-grok-perm.txt`")
        );
        assert_eq!(request.tool_call.fields.kind, Some(ToolKind::Edit));
        let kinds: Vec<_> = request.options.iter().map(|option| option.kind).collect();
        assert_eq!(
            kinds,
            [
                PermissionOptionKind::AllowAlways,
                PermissionOptionKind::AllowOnce,
                PermissionOptionKind::RejectOnce,
            ]
        );
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|option| option.option_id.to_string())
            .collect();
        assert_eq!(ids, ["allow-edits-session", "allow-once", "reject-once"]);
        assert_ne!(
            ids,
            ["allow_once", "allow_always", "reject_once", "reject_always"]
        );
    }

    #[test]
    fn request_permission_respond_fixtures_match_acp_selected_and_cancelled() {
        use agent_client_protocol::schema::v1::{
            PermissionOptionId, RequestPermissionOutcome, RequestPermissionResponse,
            SelectedPermissionOutcome,
        };

        let selected: Value =
            serde_json::from_str(include_str!("testdata/request_permission_response.json"))
                .expect("selected fixture");
        assert_eq!(selected["jsonrpc"], "2.0");
        assert_eq!(selected["id"], 12);
        assert_eq!(selected["result"], permission_selected_result("allow-once"));
        let selected_schema = serde_json::to_value(RequestPermissionResponse::new(
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                PermissionOptionId::new("allow-once"),
            )),
        ))
        .expect("selected schema");
        assert_eq!(selected["result"], selected_schema);
        assert_eq!(selected_schema["outcome"]["outcome"], "selected");
        assert_eq!(selected_schema["outcome"]["optionId"], "allow-once");
        assert!(selected_schema["outcome"].get("option_id").is_none());

        let cancelled: Value =
            serde_json::from_str(include_str!("testdata/request_permission_cancelled.json"))
                .expect("cancelled fixture");
        assert_eq!(cancelled["id"], 12);
        assert_eq!(cancelled["result"], permission_cancelled_result());
        let cancelled_schema = serde_json::to_value(RequestPermissionResponse::new(
            RequestPermissionOutcome::Cancelled,
        ))
        .expect("cancelled schema");
        assert_eq!(cancelled["result"], cancelled_schema);
        assert_eq!(cancelled_schema["outcome"]["outcome"], "cancelled");
        assert!(cancelled_schema["outcome"].get("optionId").is_none());
    }

    #[test]
    fn tool_call_write_fixture_is_session_update_edit() {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/tool_call_write.json")).expect("fixture");
        assert_eq!(fixture["method"], "session/update");
        let update = &fixture["params"]["update"];
        assert_eq!(update["sessionUpdate"], "tool_call");
        assert_eq!(update["kind"], "edit");
        assert_eq!(update["rawInput"]["type"], "Write");
        assert_eq!(update["rawInput"]["path"], "atmos-probe.txt");
        assert_eq!(update["status"], "pending");
    }

    #[test]
    fn tool_call_execute_fixture_is_session_update_bash() {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/tool_call_execute.json")).expect("fixture");
        assert_eq!(fixture["method"], "session/update");
        let update = &fixture["params"]["update"];
        assert_eq!(update["sessionUpdate"], "tool_call");
        assert_eq!(update["kind"], "execute");
        assert_eq!(update["rawInput"]["type"], "Bash");
        assert_eq!(update["rawInput"]["command"], "ls -la");
        assert_eq!(update["status"], "pending");
    }

    #[test]
    fn initialize_request_is_jsonrpc_v1() {
        let request = initialize_request(1);
        assert_eq!(request["method"], "initialize");
        assert_eq!(request["id"], 1);
        assert_eq!(request["params"]["protocolVersion"], 1);
        assert_eq!(request["params"]["clientInfo"]["name"], "atmos");
    }

    #[test]
    fn session_load_uses_grok_session_id() {
        let params = session_load_params("sess_grok_1", "/tmp/project");
        assert_eq!(params["sessionId"], "sess_grok_1");
        assert_eq!(params["cwd"], "/tmp/project");
        let request = jsonrpc_request(2, "session/load", params);
        assert_eq!(request["method"], "session/load");

        let schema = serde_json::to_value(LoadSessionRequest::new(
            SessionId::new("sess_grok_1"),
            "/tmp/project",
        ))
        .expect("schema");
        assert_eq!(schema["sessionId"], "sess_grok_1");
        assert_eq!(schema["cwd"], "/tmp/project");
    }

    #[test]
    fn wire_method_prepends_one_underscore() {
        assert_eq!(wire_method("x.ai/session/fork"), "_x.ai/session/fork");
        assert_eq!(wire_method("_x.ai/session/fork"), "_x.ai/session/fork");
        assert_eq!(
            normalize_xai_method("_x.ai/rewind/execute"),
            "x.ai/rewind/execute"
        );
        assert_eq!(
            normalize_xai_method("x.ai/rewind/execute"),
            "x.ai/rewind/execute"
        );
    }

    #[test]
    fn xai_session_ops_are_skipped_on_both_prefixes() {
        for method in [
            "x.ai/rewind/points",
            "x.ai/rewind/execute",
            "x.ai/session/fork",
            "x.ai/git/worktree/create",
            "x.ai/git/worktree/status",
            "_x.ai/rewind/points",
            "_x.ai/rewind/execute",
            "_x.ai/session/fork",
            "_x.ai/git/worktree/create",
            "_x.ai/git/worktree/status",
        ] {
            assert_eq!(
                map_xai_method(method),
                Some(ExtensionDisposition::Skip),
                "{method}"
            );
            assert!(map_xai_notification(method, json!({"sessionId": "s"})).is_none());
        }
    }

    #[test]
    fn unmapped_xai_method_is_one_unknown() {
        let event = map_xai_notification("x.ai/billing/status", json!({"ok": true}))
            .expect("unknown extension");
        match event {
            AgentEvent::Unknown {
                event_type,
                payload,
            } => {
                assert_eq!(event_type, "x.ai/billing/status");
                assert_eq!(payload["ok"], true);
            }
            other => panic!("expected Unknown, got {other:?}"),
        }
        let underscored = map_xai_notification("_x.ai/billing/status", json!({"ok": true}))
            .expect("unknown extension");
        match underscored {
            AgentEvent::Unknown { event_type, .. } => {
                assert_eq!(event_type, "x.ai/billing/status");
            }
            other => panic!("expected Unknown, got {other:?}"),
        }
        assert!(map_xai_method("session/prompt").is_none());
        assert!(map_xai_method("_session/prompt").is_none());
        assert_eq!(
            map_xai_method("x.ai/sessions/changed"),
            Some(ExtensionDisposition::Skip)
        );
        assert_eq!(
            map_xai_method("_x.ai/sessions/changed"),
            Some(ExtensionDisposition::Skip)
        );
        assert!(map_xai_notification("x.ai/sessions/changed", json!({"upserted": []})).is_none());
        assert_eq!(
            map_xai_method("x.ai/queue/updated"),
            Some(ExtensionDisposition::Skip)
        );
        for method in [
            "x.ai/models/update",
            "x.ai/settings/update",
            "x.ai/announcements/update",
            "x.ai/mcp_initialized",
            "x.ai/session/prompt_complete",
            "x.ai/session/interjection",
            "x.ai/session_notification",
            "x.ai/mcp/init_progress",
            "x.ai/mcp/server_status",
            "x.ai/mcp/servers_updated",
            "_x.ai/models/update",
            "_x.ai/mcp/init_progress",
            "_x.ai/session_notification",
        ] {
            assert_eq!(
                map_xai_method(method),
                Some(ExtensionDisposition::Skip),
                "{method}"
            );
            assert!(
                map_xai_notification(method, json!({})).is_none(),
                "{method}"
            );
        }
    }

    #[test]
    fn unknown_xai_fixture_keeps_method_prefix() {
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/unknown_xai.json")).expect("fixture");
        assert_eq!(fixture["method"], "_x.ai/billing/status");
        let event = map_xai_notification(
            fixture["method"].as_str().expect("method"),
            fixture["params"].clone(),
        )
        .expect("unknown");
        match event {
            AgentEvent::Unknown { event_type, .. } => {
                assert_eq!(event_type, "x.ai/billing/status");
            }
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    #[test]
    fn app069_s19_rewind_execute_always_sends_explicit_snake_case_mode() {
        assert_eq!(
            rewind_mode_for_option("rewind_conversation"),
            Some("conversation_only")
        );
        assert_eq!(rewind_mode_for_option("rewind_code"), Some("files_only"));
        assert_eq!(rewind_mode_for_option("rewind_both"), Some("all"));
        for mode in ["conversation_only", "files_only", "all"] {
            let params = rewind_execute_params("sess_grok_1", 2, true, mode);
            assert_eq!(params["mode"], mode);
            assert_ne!(params["mode"], "ConversationOnly");
            assert_ne!(params["mode"], "All");
            assert!(params.get("mode").is_some());
            let request = jsonrpc_request(10, &wire_method(METHOD_REWIND_EXECUTE), params);
            assert_eq!(request["method"], "_x.ai/rewind/execute");
        }
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/rewind_execute.json")).expect("fixture");
        assert_eq!(fixture["method"], "_x.ai/rewind/execute");
        assert_eq!(fixture["params"]["mode"], "conversation_only");
        assert_eq!(fixture["params"]["force"], true);
        assert_eq!(fixture["params"]["targetPromptIndex"], 2);
        let dry = rewind_execute_params("sess_grok_1", 2, false, "files_only");
        assert_eq!(dry["force"], false);
        let points = jsonrpc_request(
            9,
            &wire_method(METHOD_REWIND_POINTS),
            rewind_points_params("sess_grok_1"),
        );
        let points_fixture: Value =
            serde_json::from_str(include_str!("testdata/rewind_points.json")).expect("points");
        assert_eq!(points["method"], points_fixture["method"]);
        assert_eq!(points["params"], points_fixture["params"]);
        assert_eq!(points_fixture["method"], "_x.ai/rewind/points");
    }

    #[test]
    fn interject_is_session_id_and_text() {
        let params = interject_params("sess_grok_1", "nudge");
        assert_eq!(params["sessionId"], "sess_grok_1");
        assert_eq!(params["text"], "nudge");
        let request = jsonrpc_request(11, &wire_method(METHOD_INTERJECT), params);
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/interject.json")).expect("fixture");
        assert_eq!(request["method"], fixture["method"]);
        assert_eq!(request["params"], fixture["params"]);
        assert_eq!(fixture["method"], "_x.ai/interject");
    }

    #[test]
    fn fork_session_is_camel_case_and_omits_kind_for_no_worktree() {
        let no_wt = fork_session_params("sess_grok_1", "/tmp/project", "/tmp/project", None);
        assert_eq!(no_wt["sourceSessionId"], "sess_grok_1");
        assert_eq!(no_wt["sourceCwd"], "/tmp/project");
        assert_eq!(no_wt["newCwd"], "/tmp/project");
        assert!(no_wt.get("sessionKind").is_none());
        let fixture: Value =
            serde_json::from_str(include_str!("testdata/fork_session.json")).expect("fixture");
        assert_eq!(fixture["method"], "_x.ai/session/fork");
        assert_eq!(fixture["params"], no_wt);
        let wt = fork_session_params("sess_grok_1", "/tmp/project", "/tmp/wt", Some("worktree"));
        assert_eq!(wt["sessionKind"], "worktree");
        assert_eq!(wt["newCwd"], "/tmp/wt");
        assert_eq!(
            forked_session_id(&json!({ "newSessionId": "sess_child" })).as_deref(),
            Some("sess_child")
        );
        assert_eq!(
            worktree_path(&json!({ "newCwd": "/tmp/wt" })).as_deref(),
            Some("/tmp/wt")
        );
        assert_eq!(
            worktree_path(&json!({ "worktreePath": "/tmp/wt2" })).as_deref(),
            Some("/tmp/wt2")
        );
        assert_eq!(
            worktree_path(&json!({ "path": "/tmp/wt3" })).as_deref(),
            Some("/tmp/wt3")
        );
        let create = worktree_create_params("sess_grok_1", "/tmp/project");
        assert_eq!(create["sessionId"], "sess_grok_1");
        assert_eq!(create["sourcePath"], "/tmp/project");
        assert!(create.get("label").is_none());
        assert!(create.get("name").is_none());
        assert!(create.get("branch").is_none());
        let create_fixture: Value =
            serde_json::from_str(include_str!("testdata/worktree_create.json")).expect("create");
        assert_eq!(create_fixture["method"], "_x.ai/git/worktree/create");
        assert_eq!(create_fixture["params"], create);
        assert!(worktree_create_is_pending(&json!({ "status": "creating" })));
        assert!(worktree_create_is_pending(
            &json!({ "status": "creating", "worktreePath": "/tmp/wt" })
        ));
        let create_response: Value =
            serde_json::from_str(include_str!("testdata/worktree_create_response.json"))
                .expect("create response");
        assert!(worktree_create_is_pending(&create_response));
        assert_eq!(worktree_path(&create_response).as_deref(), Some("/tmp/wt"));
        let created_status: Value =
            serde_json::from_str(include_str!("testdata/worktree_status_created.json"))
                .expect("created status");
        assert!(!worktree_create_is_pending(&created_status));
        assert_eq!(worktree_path(&created_status).as_deref(), Some("/tmp/wt"));
        assert_eq!(
            forked_session_id(&json!({
                "newSessionId": "sess_child",
                "parentSessionId": "sess_grok_1",
                "newCwd": "/tmp/project"
            }))
            .as_deref(),
            Some("sess_child")
        );
    }

    #[test]
    fn resolve_prompt_index_from_points_or_numeric_target() {
        let points = json!({
            "points": [
                { "promptIndex": 1, "id": "turn-a", "hasFileChanges": false },
                { "prompt_index": 2, "uuid": "uu-2", "has_file_changes": true }
            ]
        });
        assert_eq!(resolve_target_prompt_index("2", &points), Some(2));
        assert_eq!(resolve_target_prompt_index("turn-a", &points), Some(1));
        assert_eq!(resolve_target_prompt_index("uu-2", &points), Some(2));
        assert_eq!(resolve_target_prompt_index("missing", &points), None);
        assert_eq!(
            rewind_point_has_file_changes(&points, "turn-a"),
            Some(false)
        );
        assert_eq!(rewind_point_has_file_changes(&points, "uu-2"), Some(true));
        let live: Value =
            serde_json::from_str(include_str!("testdata/rewind_points_response.json"))
                .expect("live rewind points");
        assert_eq!(resolve_target_prompt_index("0", &live), Some(0));
        assert_eq!(rewind_point_has_file_changes(&live, "0"), Some(false));
        assert!(rewind_execute_failed(&json!({ "success": true })).is_none());
        assert_eq!(
            rewind_execute_failed(&json!({
                "success": false,
                "mode": "all",
                "error": "Cannot rewind to prompt #0"
            }))
            .as_deref(),
            Some("Cannot rewind to prompt #0")
        );
    }
}
