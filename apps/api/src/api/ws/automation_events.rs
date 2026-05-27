use core_service::AutomationEvent;
use serde_json::json;

use super::{WsEvent, WsMessage};

pub fn automation_event_to_ws_message(event: AutomationEvent) -> Option<WsMessage> {
    let (ws_event, data) = match event {
        AutomationEvent::DefinitionUpdated {
            automation_guid,
            change,
            automation,
        } => (
            WsEvent::AutomationDefinitionUpdated,
            json!({
                "automation_guid": automation_guid,
                "change": change,
                "automation": automation,
            }),
        ),
        AutomationEvent::RunUpdated {
            automation_guid,
            run_guid,
            status,
            run,
        } => (
            WsEvent::AutomationRunUpdated,
            json!({
                "automation_guid": automation_guid,
                "run_guid": run_guid,
                "status": status,
                "run": run,
            }),
        ),
        AutomationEvent::Notification(payload) => (WsEvent::AutomationNotification, json!(payload)),
    };

    Some(WsMessage::notification(ws_event, data))
}
