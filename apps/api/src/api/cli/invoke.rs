//! `POST /api/cli/invoke` — run a product `WsAction` by wire name on Atmos Server.

use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    api::ws::WsAction,
    app_state::AppState,
    error::{ApiError, ApiResult},
};

#[derive(Debug, Deserialize)]
pub struct CliInvokeRequest {
    /// Wire action name (snake_case), e.g. `project_list`.
    pub action: String,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub request_id: Option<String>,
}

pub async fn invoke(
    State(state): State<AppState>,
    Json(body): Json<CliInvokeRequest>,
) -> ApiResult<Json<Value>> {
    let action_name = body.action.trim();
    if action_name.is_empty() {
        return Err(ApiError::BadRequest("action is required".into()));
    }

    // Unknown wire actions use the same success:false envelope as domain errors
    // so agents can branch on `error.code = UNKNOWN_ACTION` (HTTP 200).
    let Some(action) = parse_ws_action(action_name) else {
        return Ok(Json(json!({
            "success": false,
            "error": {
                "message": format!("unknown action '{action_name}'"),
                "code": "UNKNOWN_ACTION"
            },
            "action": action_name,
            "request_id": body.request_id,
        })));
    };

    let data = if body.data.is_null() {
        json!({})
    } else {
        body.data
    };

    match state
        .ws_message_service
        .dispatch_cli_action(action, data)
        .await
    {
        Ok(result) => Ok(Json(json!({
            "success": true,
            "data": result,
            "action": action_name,
            "request_id": body.request_id,
        }))),
        Err(err) => {
            let (code, message) = service_error_parts(&err);
            Ok(Json(json!({
                "success": false,
                "error": { "message": message, "code": code },
                "action": action_name,
                "request_id": body.request_id,
            })))
        }
    }
}

pub(crate) fn parse_ws_action(name: &str) -> Option<WsAction> {
    // Wire names are the serde snake_case of WsAction variants.
    serde_json::from_value(Value::String(name.to_string())).ok()
}

pub(crate) fn service_error_parts(err: &core_service::ServiceError) -> (&'static str, String) {
    use core_service::ServiceError;
    match err {
        ServiceError::Validation(msg) => ("validation_error", msg.clone()),
        ServiceError::NotFound(msg) => ("not_found", msg.clone()),
        ServiceError::Repository(msg) => ("repository_error", msg.clone()),
        ServiceError::DeviceControl(e) => (e.code(), e.to_string()),
        other => ("ACTION_FAILED", other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_actions() {
        assert!(matches!(
            parse_ws_action("project_list"),
            Some(WsAction::ProjectList)
        ));
        assert!(matches!(
            parse_ws_action("workspace_create"),
            Some(WsAction::WorkspaceCreate)
        ));
        assert!(matches!(
            parse_ws_action("terminal_session_create"),
            Some(WsAction::TerminalSessionCreate)
        ));
        assert!(matches!(
            parse_ws_action("settings_bootstrap_get"),
            Some(WsAction::SettingsBootstrapGet)
        ));
    }

    #[test]
    fn rejects_unknown_actions() {
        assert!(parse_ws_action("definitely_not_an_action").is_none());
        assert!(parse_ws_action("").is_none());
    }

    #[test]
    fn parses_simulator_control_actions() {
        assert!(matches!(
            parse_ws_action("simulator_list"),
            Some(WsAction::SimulatorList)
        ));
        assert!(matches!(
            parse_ws_action("simulator_screenshot"),
            Some(WsAction::SimulatorScreenshot)
        ));
        assert!(matches!(
            parse_ws_action("simulator_tap"),
            Some(WsAction::SimulatorTap)
        ));
        assert!(matches!(
            parse_ws_action("simulator_swipe"),
            Some(WsAction::SimulatorSwipe)
        ));
        assert!(matches!(
            parse_ws_action("simulator_type"),
            Some(WsAction::SimulatorType)
        ));
        assert!(matches!(
            parse_ws_action("simulator_press"),
            Some(WsAction::SimulatorPress)
        ));
    }

    #[test]
    fn maps_device_control_error_codes() {
        use core_engine::DevicePlatform;
        use core_service::{DeviceControlError, PressKey, ServiceError};

        let (code, message) = service_error_parts(&ServiceError::from(DeviceControlError::NoClaim));
        assert_eq!(code, "NO_CLAIM");
        assert_eq!(message, DeviceControlError::NoClaim.to_string());

        let (code, _) = service_error_parts(&ServiceError::from(DeviceControlError::EmptyText));
        assert_eq!(code, "EMPTY_TEXT");

        let (code, _) = service_error_parts(&ServiceError::from(DeviceControlError::InvalidCoords));
        assert_eq!(code, "INVALID_COORDS");

        let (code, _) =
            service_error_parts(&ServiceError::from(DeviceControlError::DeviceUnknown {
                udid: "u".into(),
            }));
        assert_eq!(code, "DEVICE_UNKNOWN");

        let (code, _) = service_error_parts(&ServiceError::from(
            DeviceControlError::ClaimedByOtherWorkspace {
                udid: "u".into(),
                owner_workspace_id: "ws-b".into(),
            },
        ));
        assert_eq!(code, "CLAIMED_BY_OTHER_WORKSPACE");

        let (code, _) =
            service_error_parts(&ServiceError::from(DeviceControlError::PlatformMismatch {
                requested: DevicePlatform::Android,
                actual: DevicePlatform::Ios,
                udid: "u".into(),
            }));
        assert_eq!(code, "PLATFORM_MISMATCH");

        let (code, _) =
            service_error_parts(&ServiceError::from(DeviceControlError::AmbiguousDevice));
        assert_eq!(code, "AMBIGUOUS_DEVICE");

        let (code, _) = service_error_parts(&ServiceError::from(
            DeviceControlError::UnsupportedOnPlatform {
                key: PressKey::Back,
                platform: DevicePlatform::Ios,
            },
        ));
        assert_eq!(code, "UNSUPPORTED_ON_PLATFORM");

        let (code, _) = service_error_parts(&ServiceError::from(
            DeviceControlError::HelperUnreachable("down".into()),
        ));
        assert_eq!(code, "HELPER_UNREACHABLE");
    }
}
