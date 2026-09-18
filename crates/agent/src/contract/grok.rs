use serde::{Deserialize, Serialize};

/// Synthesized spawn rows for Grok `/goal` and workflow children (no ACP `tool_call`).
/// Hidden from the parent transcript; the Grok chrome panels are the roster.
pub const GROK_CHROME_SUBAGENT_NAME: &str = "grok_chrome";

pub fn is_grok_chrome_subagent_name(name: &str) -> bool {
    name == GROK_CHROME_SUBAGENT_NAME
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrokGoalChild {
    pub id: String,
    pub label: String,
    /// `planning` | `verifying` | `summarizing`
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrokGoal {
    pub goal_id: String,
    pub objective: String,
    pub status: String,
    pub phase: String,
    #[serde(default)]
    pub planning: bool,
    #[serde(default)]
    pub verifying_completion: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event: Option<String>,
    #[serde(default)]
    pub tokens_used: i64,
    #[serde(default)]
    pub elapsed_ms: u64,
    #[serde(default)]
    pub children: Vec<GrokGoalChild>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrokWorkflowPhase {
    pub id: String,
    pub title: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrokWorkflowAgent {
    pub id: String,
    pub label: String,
    pub phase_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrokWorkflow {
    pub run_id: String,
    pub name: String,
    pub objective: String,
    pub status: String,
    #[serde(default)]
    pub phases: Vec<GrokWorkflowPhase>,
    #[serde(default)]
    pub agents: Vec<GrokWorkflowAgent>,
}
