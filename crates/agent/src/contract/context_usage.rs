//! Unified session context-window occupancy (used tokens + optional total).

use serde::{Deserialize, Serialize};

/// Provider-normalized context fill for Chat UI.
///
/// Emit after each turn completes (and on resume/load when available).
/// Frontend only needs `used` + `context_window` (when both present → show %).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentContextUsage {
    pub used: u64,
    /// Total context window size in tokens. Omit when the host does not report one
    /// (UI hides the control until known).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
}

impl AgentContextUsage {
    pub fn new(used: u64, context_window: Option<u64>) -> Self {
        Self {
            used,
            context_window: context_window.filter(|window| *window > 0),
        }
    }

    /// True when both used and a positive window are present (UI can show %).
    pub fn is_displayable(self) -> bool {
        self.context_window.is_some_and(|window| window > 0)
    }
}
