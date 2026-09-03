use thiserror::Error;

use super::error::AgentProviderError;
use super::event::AgentPermissionOption;
use super::provider::{AgentPrompt, AgentRuntimeConfigUpdate};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionOpKind {
    Fork,
    Rewind,
}

#[derive(Debug, Clone)]
pub enum AgentAction {
    Steer {
        input: AgentPrompt,
    },
    RespondPermission {
        request_id: String,
        option_id: String,
    },
    SetConfig {
        update: AgentRuntimeConfigUpdate,
    },
    PrepareSessionOp {
        kind: SessionOpKind,
        rest: String,
    },
    RespondSessionOp {
        request_id: String,
        option_id: String,
        /// Phase-two rewind: Atmos turn id, vendor checkpoint uuid, or prompt index.
        target: Option<String>,
    },
}

/// Ok payload from [`AgentRuntimeCommands::action`]. Fork Applied carries the
/// vendor session id (and optional new cwd) so the host can create a sibling.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AgentActionResult {
    pub new_session_id: Option<String>,
    pub new_cwd: Option<String>,
    /// Prepare rewind: whether the selected checkpoint has file changes.
    pub has_file_changes: Option<bool>,
    /// Prepare chrome (Pi fork entries). Empty means the host builds options.
    pub options: Vec<AgentPermissionOption>,
}

impl AgentActionResult {
    pub fn unit() -> Self {
        Self::default()
    }

    pub fn forked(session_id: impl Into<String>, cwd: Option<String>) -> Self {
        Self {
            new_session_id: Some(session_id.into()),
            new_cwd: cwd,
            ..Self::default()
        }
    }

    pub fn rewind_preview(has_file_changes: bool) -> Self {
        Self {
            has_file_changes: Some(has_file_changes),
            ..Self::default()
        }
    }

    pub fn prepared_options(options: Vec<AgentPermissionOption>) -> Self {
        Self {
            options,
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentActionKind {
    Steer,
    RespondPermission,
    SetConfig,
    PrepareSessionOp,
    RespondSessionOp,
}

#[derive(Debug, Error)]
pub enum AgentActionError {
    #[error("unsupported action {action:?}")]
    Unsupported { action: AgentActionKind },
    #[error("steer requires a matching running turn")]
    SteerTurnMismatch,
    #[error("not found: {0}")]
    NotFound(String),
}

impl From<AgentActionError> for AgentProviderError {
    fn from(error: AgentActionError) -> Self {
        match error {
            AgentActionError::Unsupported { action } => {
                AgentProviderError::Unsupported(format!("{action:?}"))
            }
            AgentActionError::SteerTurnMismatch => AgentProviderError::SteerTurnMismatch,
            AgentActionError::NotFound(id) => AgentProviderError::NotFound(id),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_error_maps_into_provider_error() {
        let unsupported = AgentProviderError::from(AgentActionError::Unsupported {
            action: AgentActionKind::Steer,
        });
        assert!(matches!(unsupported, AgentProviderError::Unsupported(_)));

        let mismatch = AgentProviderError::from(AgentActionError::SteerTurnMismatch);
        assert!(matches!(mismatch, AgentProviderError::SteerTurnMismatch));

        let missing = AgentProviderError::from(AgentActionError::NotFound("turn".into()));
        assert!(matches!(missing, AgentProviderError::NotFound(_)));
    }

    #[test]
    fn agent_action_has_five_product_variants() {
        let _steer = AgentAction::Steer {
            input: AgentPrompt::default(),
        };
        let _permission = AgentAction::RespondPermission {
            request_id: "req".into(),
            option_id: "allow".into(),
        };
        let _config = AgentAction::SetConfig {
            update: AgentRuntimeConfigUpdate::default(),
        };
        let _prepare = AgentAction::PrepareSessionOp {
            kind: SessionOpKind::Rewind,
            rest: String::new(),
        };
        let _respond = AgentAction::RespondSessionOp {
            request_id: "req".into(),
            option_id: "cancel".into(),
            target: None,
        };
    }

    #[test]
    fn action_result_carries_fork_vendor_session() {
        let applied = AgentActionResult::forked("vendor-session-1", Some("/tmp/wt".into()));
        assert_eq!(applied.new_session_id.as_deref(), Some("vendor-session-1"));
        assert_eq!(applied.new_cwd.as_deref(), Some("/tmp/wt"));
        assert_eq!(AgentActionResult::unit(), AgentActionResult::default());
    }

    #[test]
    fn session_op_kind_serializes_snake_case() {
        assert_eq!(
            serde_json::to_value(SessionOpKind::Fork).unwrap(),
            serde_json::json!("fork")
        );
        assert_eq!(
            serde_json::to_value(SessionOpKind::Rewind).unwrap(),
            serde_json::json!("rewind")
        );
    }
}
