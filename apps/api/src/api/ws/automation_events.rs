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
        AutomationEvent::RunOutput {
            automation_guid,
            run_guid,
            ts,
            stream,
            chunk,
            final_chunk,
        } => (
            WsEvent::AutomationRunOutput,
            json!({
                "automation_guid": automation_guid,
                "run_guid": run_guid,
                "ts": ts,
                "stream": stream,
                "chunk": chunk,
                "final_chunk": final_chunk,
            }),
        ),
        AutomationEvent::Notification(payload) => (WsEvent::AutomationNotification, json!(payload)),
        AutomationEvent::StalePrompt {
            automation_guid,
            run_guid,
            display_name,
            execute_mode,
            surface_scope_id,
            surface_session_id,
        } => (
            WsEvent::AutomationStalePrompt,
            json!({
                "automation_guid": automation_guid,
                "run_guid": run_guid,
                "display_name": display_name,
                "execute_mode": execute_mode,
                "surface_scope_id": surface_scope_id,
                "surface_session_id": surface_session_id,
            }),
        ),
    };

    Some(WsMessage::notification(ws_event, data))
}
