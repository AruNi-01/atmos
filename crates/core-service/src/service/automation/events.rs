use serde::{Deserialize, Serialize};

use crate::service::notification::AutomationNotificationPayload;

use super::{AutomationRunSummary, AutomationSummary};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationDefinitionChange {
    Created,
    Updated,
    Deleted,
    Paused,
    Resumed,
    ScheduleNormalized,
    NextRunAdvanced,
    PausedAfterStartFailure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AutomationEvent {
    DefinitionUpdated {
        automation_guid: String,
        change: AutomationDefinitionChange,
        automation: Option<AutomationSummary>,
    },
    RunUpdated {
        automation_guid: String,
        run_guid: String,
        status: String,
        run: AutomationRunSummary,
    },
    RunOutput {
        automation_guid: String,
        run_guid: String,
        ts: String,
        stream: String,
        chunk: String,
        final_chunk: bool,
    },
    Notification(AutomationNotificationPayload),
    StalePrompt {
        automation_guid: String,
        run_guid: String,
        display_name: String,
        execute_mode: String,
        surface_scope_id: Option<String>,
        surface_session_id: Option<String>,
    },
}
