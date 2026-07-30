//! Shared Orchestrator types (APP-048). Pure data — no I/O.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchMode {
    Auto,
    Loop,
    Graph,
}

impl OrchMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Loop => "loop",
            Self::Graph => "graph",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "auto" => Some(Self::Auto),
            "loop" => Some(Self::Loop),
            "graph" => Some(Self::Graph),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectiveMode {
    Loop,
    Graph,
}

impl EffectiveMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Loop => "loop",
            Self::Graph => "graph",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    DraftingSpec,
    AwaitingSpecConfirm,
    Running,
    BlockedHuman,
    RefiningSpec,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl RunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DraftingSpec => "drafting_spec",
            Self::AwaitingSpecConfirm => "awaiting_spec_confirm",
            Self::Running => "running",
            Self::BlockedHuman => "blocked_human",
            Self::RefiningSpec => "refining_spec",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "drafting_spec" => Some(Self::DraftingSpec),
            "awaiting_spec_confirm" => Some(Self::AwaitingSpecConfirm),
            "running" => Some(Self::Running),
            "blocked_human" => Some(Self::BlockedHuman),
            "refining_spec" => Some(Self::RefiningSpec),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            "interrupted" => Some(Self::Interrupted),
            _ => None,
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Interrupted
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    SpecMet,
    BudgetIterations,
    BudgetWall,
    BudgetMakers,
    NoProgress,
    UserCancel,
    CriteriaUnsatisfiable,
    GraphCompileFailed,
    WorkerFailed,
    ArtifactInvalid,
    JoinIncomplete,
    InterruptedEnvironment,
}

impl StopReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SpecMet => "spec_met",
            Self::BudgetIterations => "budget_iterations",
            Self::BudgetWall => "budget_wall",
            Self::BudgetMakers => "budget_makers",
            Self::NoProgress => "no_progress",
            Self::UserCancel => "user_cancel",
            Self::CriteriaUnsatisfiable => "criteria_unsatisfiable",
            Self::GraphCompileFailed => "graph_compile_failed",
            Self::WorkerFailed => "worker_failed",
            Self::ArtifactInvalid => "artifact_invalid",
            Self::JoinIncomplete => "join_incomplete",
            Self::InterruptedEnvironment => "interrupted_environment",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    Project,
    Workspace,
    Standalone,
}

impl TargetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Workspace => "workspace",
            Self::Standalone => "standalone",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "project" => Some(Self::Project),
            "workspace" => Some(Self::Workspace),
            "standalone" => Some(Self::Standalone),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchRole {
    Orchestrator,
    Criteria,
    Maker,
    Verify,
}

impl OrchRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Orchestrator => "orchestrator",
            Self::Criteria => "criteria",
            Self::Maker => "maker",
            Self::Verify => "verify",
        }
    }

    pub fn ui_label_en(self) -> &'static str {
        match self {
            Self::Orchestrator => "Planner",
            Self::Criteria => "Criteria",
            Self::Maker => "Maker",
            Self::Verify => "Verify",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Budget {
    pub max_iterations: u32,
    pub max_wall_ms: u64,
    pub max_maker_invocations: u32,
    pub max_spec_versions: u32,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            max_iterations: 8,
            max_wall_ms: 2_700_000,
            max_maker_invocations: 12,
            max_spec_versions: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModeProposal {
    pub mode: EffectiveMode,
    pub reason: String,
    #[serde(default = "default_plan_complexity")]
    pub plan_complexity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub topology_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub graph: Option<CompiledGraph>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub named_units: Vec<String>,
}

fn default_plan_complexity() -> String {
    "low".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SensorSpec {
    pub argv: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default = "default_pass_codes")]
    pub pass_exit_codes: Vec<i32>,
    #[serde(default = "default_sensor_timeout")]
    pub timeout_ms: u64,
}

fn default_pass_codes() -> Vec<i32> {
    vec![0]
}

fn default_sensor_timeout() -> u64 {
    120_000
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Criterion {
    pub id: String,
    pub description: String,
    pub kind: String, // sensor | llm_judge | human
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sensor: Option<SensorSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub falsify: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_required: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub immutable_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sole_source: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JudgmentSpecBody {
    pub goal_summary: String,
    pub risk_tier: String,
    pub acceptance: Vec<Criterion>,
    #[serde(default)]
    pub rejection: Vec<Criterion>,
    #[serde(default = "default_judgment_order")]
    pub judgment_order: Vec<String>,
}

fn default_judgment_order() -> Vec<String> {
    vec!["sensor".into(), "llm_judge".into(), "human".into()]
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CriterionResult {
    pub criterion_id: String,
    pub pass: bool,
    #[serde(default)]
    pub evidence_ids: Vec<String>,
    #[serde(default)]
    pub detail: String,
    /// When true, criterion could not be evaluated (timeout/error) — not a pass.
    #[serde(default)]
    pub unverified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerdictResult {
    Pass,
    Fail,
    CriteriaGap,
    BlockedHuman,
    Unverified,
}

impl VerdictResult {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::CriteriaGap => "criteria_gap",
            Self::BlockedHuman => "blocked_human",
            Self::Unverified => "unverified",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphNode {
    pub id: String,
    pub kind: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fresh_context: Option<bool>,
    #[serde(default = "default_true")]
    pub writes: bool,
    #[serde(default = "default_isolation_none")]
    pub isolation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_guid: Option<String>,
}

fn default_isolation_none() -> String {
    "none".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(default = "default_control")]
    pub kind: String,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_cycles: Option<u32>,
}

fn default_control() -> String {
    "control".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct CompiledGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    #[serde(default)]
    pub entry: Vec<String>,
}

/// Role chrome composition (M18b) — pure helper for UI/tests.
pub fn compose_role_header(
    role: OrchRole,
    agent_display: &str,
    instance: Option<&str>,
    activity: &str,
) -> String {
    let role_label = role.ui_label_en();
    let mut parts = vec![format!("[{role_label}]"), agent_display.to_string()];
    if let Some(inst) = instance.filter(|s| !s.is_empty()) {
        parts.push(inst.to_string());
    }
    if !activity.is_empty() && activity != "active" {
        parts.push(format!("({activity})"));
    }
    parts.join(" ")
}
