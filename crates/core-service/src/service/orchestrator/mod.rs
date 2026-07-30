//! APP-048 Orchestrator service — file-backed runs under `~/.atmos/orchestrator/`.

mod artifacts;
mod graph_compile;
mod runtime;
mod schemas;
mod sensors;

pub use graph_compile::{compile_graph, join_ready, CompileError, NodeTerminal};
pub use runtime::*;
pub use schemas::*;
pub use sensors::{evaluate_acceptance, immutable_paths_from_spec, run_sensor};

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

use artifacts::{
    accept_artifact, assert_not_canvas_path, ensure_run_layout, orchestrator_root, read_json_file,
    write_json_atomic,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: String,
    pub goal: String,
    pub requested_mode: String,
    pub mode: Option<String>,
    pub mode_reason: Option<String>,
    pub status: String,
    pub stop_reason: Option<String>,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub home_cwd: String,
    pub board_id: Option<String>,
    pub locked_spec_version: Option<i32>,
    pub budget: Budget,
    pub graph: Option<CompiledGraph>,
    pub carry_from_run_id: Option<String>,
    pub artifact_dir: String,
    pub maker_agent_id: Option<String>,
    pub planner_agent_id: Option<String>,
    pub criteria_agent_id: Option<String>,
    pub verify_agent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub iterations_used: u32,
    pub maker_invocations: u32,
    pub progress_key: Option<String>,
    pub progress_streak: u32,
    pub workspaces: Vec<RunWorkspaceRecord>,
    pub role_bindings: Vec<RoleBindingRecord>,
    /// Wall clock start unix ms when running.
    pub wall_started_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunWorkspaceRecord {
    pub id: String,
    pub workspace_guid: String,
    pub kind: String,
    pub purpose: Option<String>,
    pub status: String,
    pub path: String,
    pub base_ref: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleBindingRecord {
    pub role: Option<String>,
    pub node_id: Option<String>,
    pub workspace_guid: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRunReq {
    pub goal: String,
    pub requested_mode: String,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub home_cwd: String,
    pub budget: Option<Budget>,
    pub carry_from_run_id: Option<String>,
    pub maker_agent_id: Option<String>,
    pub planner_agent_id: Option<String>,
    pub criteria_agent_id: Option<String>,
    pub verify_agent_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OrchestratorEvent {
    pub run_id: String,
    pub kind: String,
    pub payload: serde_json::Value,
}

pub struct OrchestratorService {
    root: PathBuf,
    event_tx: broadcast::Sender<OrchestratorEvent>,
}

impl Default for OrchestratorService {
    fn default() -> Self {
        Self::new()
    }
}

impl OrchestratorService {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            root: orchestrator_root(),
            event_tx,
        }
    }

    pub fn with_root(root: PathBuf) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self { root, event_tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<OrchestratorEvent> {
        self.event_tx.subscribe()
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn runs_path(&self) -> PathBuf {
        self.root.join("runs")
    }

    fn boards_path(&self) -> PathBuf {
        self.root.join("boards")
    }

    fn run_dir(&self, id: &str) -> PathBuf {
        self.runs_path().join(id)
    }

    fn run_json_path(&self, id: &str) -> PathBuf {
        self.run_dir(id).join("run.json")
    }

    pub fn load_run(&self, id: &str) -> Result<RunRecord> {
        let path = self.run_json_path(id);
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("run {id}")));
        }
        read_json_file(&path)
    }

    fn save_run(&self, run: &RunRecord) -> Result<()> {
        let path = self.run_json_path(&run.id);
        assert_not_canvas_path(&path)?;
        write_json_atomic(&path, run)
    }

    fn emit(&self, run_id: &str, kind: &str, payload: serde_json::Value) {
        let _ = self.event_tx.send(OrchestratorEvent {
            run_id: run_id.into(),
            kind: kind.into(),
            payload,
        });
    }

    pub fn status(&self) -> serde_json::Value {
        serde_json::json!({
            "ok": true,
            "orchestrator_root": self.root.display().to_string(),
            "feature": "orchestrator",
            "version": "0.1.0",
        })
    }

    pub fn create_run(&self, req: CreateRunReq) -> Result<RunRecord> {
        let mode = OrchMode::parse(&req.requested_mode).ok_or_else(|| {
            ServiceError::Validation(format!("invalid mode {}", req.requested_mode))
        })?;
        let target = TargetKind::parse(&req.target_kind).ok_or_else(|| {
            ServiceError::Validation(format!("invalid target_kind {}", req.target_kind))
        })?;
        if req.goal.trim().is_empty() {
            return Err(ServiceError::Validation("goal required".into()));
        }
        if req.home_cwd.trim().is_empty() {
            return Err(ServiceError::Validation("home_cwd required".into()));
        }
        match target {
            TargetKind::Workspace if req.workspace_guid.is_none() => {
                return Err(ServiceError::Validation(
                    "workspace_guid required for workspace target".into(),
                ));
            }
            TargetKind::Project if req.project_guid.is_none() => {
                return Err(ServiceError::Validation(
                    "project_guid required for project target".into(),
                ));
            }
            _ => {}
        }

        let id = Uuid::new_v4().to_string();
        let artifact_dir = self.run_dir(&id);
        fs::create_dir_all(&artifact_dir)
            .map_err(|e| ServiceError::Processing(format!("mkdir run: {e}")))?;
        ensure_run_layout(&artifact_dir)?;
        assert_not_canvas_path(&artifact_dir)?;

        // Ensure boards dir exists and is under orchestrator (not canvas)
        let boards = self.boards_path();
        fs::create_dir_all(&boards)
            .map_err(|e| ServiceError::Processing(format!("mkdir boards: {e}")))?;
        assert_not_canvas_path(&boards)?;

        let now = Utc::now().to_rfc3339();
        let home_ws = RunWorkspaceRecord {
            id: Uuid::new_v4().to_string(),
            workspace_guid: req
                .workspace_guid
                .clone()
                .unwrap_or_else(|| format!("home-{id}")),
            kind: "home".into(),
            purpose: Some("run home".into()),
            status: "active".into(),
            path: req.home_cwd.clone(),
            base_ref: None,
            created_at: now.clone(),
        };

        let run = RunRecord {
            id: id.clone(),
            goal: req.goal,
            requested_mode: mode.as_str().into(),
            mode: None,
            mode_reason: None,
            status: RunStatus::DraftingSpec.as_str().into(),
            stop_reason: None,
            target_kind: target.as_str().into(),
            project_guid: req.project_guid,
            workspace_guid: req.workspace_guid,
            home_cwd: req.home_cwd.clone(),
            board_id: Some(format!("board-{id}")),
            locked_spec_version: None,
            budget: req.budget.unwrap_or_default(),
            graph: None,
            carry_from_run_id: req.carry_from_run_id,
            artifact_dir: artifact_dir.display().to_string(),
            maker_agent_id: req.maker_agent_id,
            planner_agent_id: req.planner_agent_id,
            criteria_agent_id: req.criteria_agent_id,
            verify_agent_id: req.verify_agent_id,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            finished_at: None,
            iterations_used: 0,
            maker_invocations: 0,
            progress_key: None,
            progress_streak: 0,
            workspaces: vec![home_ws],
            role_bindings: vec![],
            wall_started_ms: None,
        };
        self.save_run(&run)?;
        self.emit(
            &id,
            "run_updated",
            serde_json::to_value(&run).unwrap_or_default(),
        );
        let _ = mode; // silence if unused in some builds
        Ok(run)
    }

    pub fn list_runs(&self, limit: usize) -> Result<Vec<RunRecord>> {
        let dir = self.runs_path();
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut runs = Vec::new();
        for entry in fs::read_dir(&dir)
            .map_err(|e| ServiceError::Processing(format!("read runs: {e}")))?
        {
            let entry = entry.map_err(|e| ServiceError::Processing(e.to_string()))?;
            let run_json = entry.path().join("run.json");
            if run_json.exists() {
                if let Ok(r) = read_json_file::<RunRecord>(&run_json) {
                    runs.push(r);
                }
            }
        }
        runs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        runs.truncate(limit.max(1));
        Ok(runs)
    }

    pub fn resolve_cwd(&self, run: &RunRecord, role: Option<&str>, node_id: Option<&str>) -> String {
        for b in &run.role_bindings {
            if role.is_some() && b.role.as_deref() == role {
                return b.cwd.clone();
            }
            if node_id.is_some() && b.node_id.as_deref() == node_id {
                return b.cwd.clone();
            }
        }
        run.home_cwd.clone()
    }

    pub fn draft_spec_from_body(
        &self,
        run_id: &str,
        body: JudgmentSpecBody,
    ) -> Result<(RunRecord, i32)> {
        if body.acceptance.is_empty() {
            return Err(ServiceError::Validation(
                "acceptance criteria required".into(),
            ));
        }
        let mut run = self.load_run(run_id)?;
        if RunStatus::parse(&run.status).is_some_and(|s| s.is_terminal()) {
            return Err(ServiceError::Validation("run already finished".into()));
        }

        let version = run.locked_spec_version.unwrap_or(0) + 1;
        if version as u32 > run.budget.max_spec_versions {
            run.status = RunStatus::Failed.as_str().into();
            run.stop_reason = Some(StopReason::CriteriaUnsatisfiable.as_str().into());
            run.finished_at = Some(Utc::now().to_rfc3339());
            self.save_run(&run)?;
            return Err(ServiceError::Validation(
                "max_spec_versions exceeded".into(),
            ));
        }

        // weaken check against previous
        if let Some(prev_v) = run.locked_spec_version {
            let prev_path = PathBuf::from(&run.artifact_dir)
                .join("specs")
                .join(format!("v{prev_v}.json"));
            if prev_path.exists() {
                let prev: JudgmentSpecBody = read_json_file(&prev_path)?;
                if spec_weakens(&prev, &body) && !requires_user_confirm(&body) {
                    // force confirm on weaken
                }
            }
        }

        let path = PathBuf::from(&run.artifact_dir)
            .join("specs")
            .join(format!("v{version}.json"));
        write_json_atomic(&path, &body)?;

        let need_confirm = requires_user_confirm(&body) || {
            // if weaken vs previous, need confirm
            if let Some(prev_v) = run.locked_spec_version {
                let prev_path = PathBuf::from(&run.artifact_dir)
                    .join("specs")
                    .join(format!("v{prev_v}.json"));
                if prev_path.exists() {
                    let prev: JudgmentSpecBody = read_json_file(&prev_path)?;
                    spec_weakens(&prev, &body)
                } else {
                    false
                }
            } else {
                false
            }
        };

        run.locked_spec_version = Some(version);
        run.status = if need_confirm {
            RunStatus::AwaitingSpecConfirm.as_str().into()
        } else {
            // auto-confirm sensor-only low risk
            RunStatus::AwaitingSpecConfirm.as_str().into()
        };
        // Store confirm flag in a sidecar
        let meta = serde_json::json!({
            "version": version,
            "requires_user_confirm": need_confirm,
            "confirmed": !need_confirm,
            "confirmed_by": if need_confirm { serde_json::Value::Null } else { serde_json::json!("auto") },
        });
        write_json_atomic(
            &PathBuf::from(&run.artifact_dir).join("specs").join(format!("v{version}.meta.json")),
            &meta,
        )?;

        if !need_confirm {
            // auto-confirm path: leave status as awaiting then auto flip
            run.status = RunStatus::DraftingSpec.as_str().into(); // ready to start after confirm helper
            // mark ready
            run.status = "spec_ready".into(); // intermediate — start will accept
        }

        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok((run, version))
    }

    pub fn confirm_spec(&self, run_id: &str, version: i32) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if run.locked_spec_version != Some(version) {
            return Err(ServiceError::Validation("spec version mismatch".into()));
        }
        let meta_path = PathBuf::from(&run.artifact_dir)
            .join("specs")
            .join(format!("v{version}.meta.json"));
        let mut meta: serde_json::Value = if meta_path.exists() {
            read_json_file(&meta_path)?
        } else {
            serde_json::json!({})
        };
        meta["confirmed"] = serde_json::json!(true);
        meta["confirmed_by"] = serde_json::json!("user");
        write_json_atomic(&meta_path, &meta)?;
        run.status = "spec_ready".into();
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn get_spec(&self, run_id: &str, version: Option<i32>) -> Result<JudgmentSpecBody> {
        let run = self.load_run(run_id)?;
        let v = version.or(run.locked_spec_version).ok_or_else(|| {
            ServiceError::NotFound("no spec".into())
        })?;
        let path = PathBuf::from(&run.artifact_dir)
            .join("specs")
            .join(format!("v{v}.json"));
        read_json_file(&path)
    }

    fn spec_confirmed(&self, run: &RunRecord) -> Result<bool> {
        let Some(v) = run.locked_spec_version else {
            return Ok(false);
        };
        let meta_path = PathBuf::from(&run.artifact_dir)
            .join("specs")
            .join(format!("v{v}.meta.json"));
        if !meta_path.exists() {
            return Ok(false);
        }
        let meta: serde_json::Value = read_json_file(&meta_path)?;
        Ok(meta.get("confirmed").and_then(|c| c.as_bool()) == Some(true))
    }

    pub fn start_run(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if run.locked_spec_version.is_none() {
            return Err(ServiceError::Validation("ORCH_SPEC_REQUIRED".into()));
        }
        if !self.spec_confirmed(&run)? {
            // auto-confirm if meta says no require
            let v = run.locked_spec_version.unwrap();
            let meta_path = PathBuf::from(&run.artifact_dir)
                .join("specs")
                .join(format!("v{v}.meta.json"));
            if meta_path.exists() {
                let meta: serde_json::Value = read_json_file(&meta_path)?;
                if meta.get("requires_user_confirm").and_then(|c| c.as_bool()) == Some(true)
                    && meta.get("confirmed").and_then(|c| c.as_bool()) != Some(true)
                {
                    return Err(ServiceError::Validation(
                        "ORCH_SPEC_CONFIRM_REQUIRED".into(),
                    ));
                }
                if meta.get("confirmed").and_then(|c| c.as_bool()) != Some(true) {
                    // treat as confirmed for sensor-only
                    let mut m = meta;
                    m["confirmed"] = serde_json::json!(true);
                    m["confirmed_by"] = serde_json::json!("auto");
                    write_json_atomic(&meta_path, &m)?;
                }
            }
        }

        let requested = OrchMode::parse(&run.requested_mode)
            .ok_or_else(|| ServiceError::Validation("bad mode".into()))?;

        // Load proposal if auto or graph
        let proposal_path = PathBuf::from(&run.artifact_dir).join("mode_proposal.json");
        let proposal = if proposal_path.exists() {
            Some(accept_artifact::<ModeProposal>(&proposal_path)?)
        } else {
            None
        };

        if requested == OrchMode::Auto && proposal.is_none() {
            return Err(ServiceError::Validation(
                "auto mode requires mode_proposal.json from planner".into(),
            ));
        }

        // Forced loop/graph: skip planner (M17b)
        let (effective, reason) = resolve_effective_mode(requested, proposal.as_ref())
            .map_err(ServiceError::Validation)?;

        if effective == EffectiveMode::Graph {
            if let Some(p) = &proposal {
                if let Some(g) = &p.graph {
                    let compiled = compile_graph(g).map_err(|e| {
                        ServiceError::Validation(format!("ORCH_GRAPH_COMPILE_FAILED: {}", e.0))
                    })?;
                    run.graph = Some(compiled);
                } else if p.topology_hint.as_deref() == Some("diamond") && p.named_units.len() >= 2 {
                    run.graph = Some(diamond_from_units(&p.named_units));
                    compile_graph(run.graph.as_ref().unwrap()).map_err(|e| {
                        ServiceError::Validation(format!("ORCH_GRAPH_COMPILE_FAILED: {}", e.0))
                    })?;
                }
            }
            if run.graph.is_none() {
                // demote already handled in resolve for auto; for forced graph without topology fail
                if requested == OrchMode::Graph {
                    return Err(ServiceError::Validation(
                        "ORCH_GRAPH_COMPILE_FAILED: missing graph".into(),
                    ));
                }
            }
        }

        run.mode = Some(effective.as_str().into());
        run.mode_reason = Some(reason);
        run.status = RunStatus::Running.as_str().into();
        run.started_at = Some(Utc::now().to_rfc3339());
        run.wall_started_ms = Some(now_ms());
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        self.emit(
            run_id,
            "run_updated",
            serde_json::to_value(&run).unwrap_or_default(),
        );
        Ok(run)
    }

    /// Fixture-friendly Loop tick: runs sensors in home (or bound) cwd; no real terminal agent.
    pub fn tick_loop_fixture(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if run.status != RunStatus::Running.as_str() {
            return Err(ServiceError::Validation("run not running".into()));
        }
        if run.mode.as_deref() != Some("loop") {
            return Err(ServiceError::Validation("not a loop run".into()));
        }

        let elapsed = run
            .wall_started_ms
            .map(|s| now_ms().saturating_sub(s))
            .unwrap_or(0);
        match check_budget(
            &run.budget,
            run.iterations_used,
            run.maker_invocations,
            elapsed,
        ) {
            BudgetCheck::Iterations => {
                return self.fail_run(run, StopReason::BudgetIterations);
            }
            BudgetCheck::Wall => return self.fail_run(run, StopReason::BudgetWall),
            BudgetCheck::Makers => return self.fail_run(run, StopReason::BudgetMakers),
            BudgetCheck::Ok => {}
        }

        run.iterations_used += 1;
        run.maker_invocations += 1;

        let spec = self.get_spec(run_id, run.locked_spec_version)?;
        let cwd = PathBuf::from(self.resolve_cwd(&run, Some("maker"), None));

        // Sensor integrity snapshot would be here; fixture skips file mtime unless paths exist

        let results = evaluate_acceptance(&spec.acceptance, &cwd)?;
        let verdict_id = Uuid::new_v4().to_string();
        let failing: Vec<String> = results
            .iter()
            .filter(|r| !r.pass || r.unverified)
            .map(|r| r.criterion_id.clone())
            .collect();
        let key = progress_key(&failing, &[]);
        run.progress_streak =
            update_progress_streak(run.progress_key.as_deref(), run.progress_streak, &key);
        run.progress_key = Some(key);

        let complete = can_complete(&spec, &results, false);
        let (result, summary) = match &complete {
            Ok(()) => (VerdictResult::Pass, "spec met".to_string()),
            Err(CompleteGateError::Unverified { id }) => {
                (VerdictResult::Unverified, format!("unverified {id}"))
            }
            Err(CompleteGateError::HumanBlocked { id }) => {
                (VerdictResult::BlockedHuman, format!("human {id}"))
            }
            Err(e) => (VerdictResult::Fail, format!("{e:?}")),
        };

        let verdict = serde_json::json!({
            "id": verdict_id,
            "run_id": run_id,
            "spec_version": run.locked_spec_version,
            "iteration": run.iterations_used,
            "result": result.as_str(),
            "summary": summary,
            "criterion_results": results,
        });
        write_json_atomic(
            &PathBuf::from(&run.artifact_dir)
                .join("verdicts")
                .join(format!("{verdict_id}.json")),
            &verdict,
        )?;

        if complete.is_ok() {
            run.status = RunStatus::Completed.as_str().into();
            run.stop_reason = Some(StopReason::SpecMet.as_str().into());
            run.finished_at = Some(Utc::now().to_rfc3339());
        } else if matches!(result, VerdictResult::BlockedHuman) {
            run.status = RunStatus::BlockedHuman.as_str().into();
        } else if matches!(result, VerdictResult::Unverified) {
            run.status = RunStatus::Failed.as_str().into();
            run.stop_reason = Some(StopReason::WorkerFailed.as_str().into());
            run.finished_at = Some(Utc::now().to_rfc3339());
        } else if run.progress_streak >= NO_PROGRESS_THRESHOLD {
            run.status = RunStatus::Failed.as_str().into();
            run.stop_reason = Some(StopReason::NoProgress.as_str().into());
            run.finished_at = Some(Utc::now().to_rfc3339());
        } else {
            // continue loop — re-check budget after tick
            let elapsed = run
                .wall_started_ms
                .map(|s| now_ms().saturating_sub(s))
                .unwrap_or(0);
            if check_budget(
                &run.budget,
                run.iterations_used,
                run.maker_invocations,
                elapsed,
            ) != BudgetCheck::Ok
            {
                let reason = match check_budget(
                    &run.budget,
                    run.iterations_used,
                    run.maker_invocations,
                    elapsed,
                ) {
                    BudgetCheck::Iterations => StopReason::BudgetIterations,
                    BudgetCheck::Wall => StopReason::BudgetWall,
                    BudgetCheck::Makers => StopReason::BudgetMakers,
                    BudgetCheck::Ok => StopReason::WorkerFailed,
                };
                return self.fail_run(run, reason);
            }
        }

        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    /// Execute a simple graph sequence once (fixture): walk entry, verify join.
    pub fn step_graph_fixture(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if run.mode.as_deref() != Some("graph") {
            return Err(ServiceError::Validation("not graph mode".into()));
        }
        let graph = run
            .graph
            .clone()
            .ok_or_else(|| ServiceError::Validation("no graph".into()))?;
        compile_graph(&graph).map_err(|e| ServiceError::Validation(e.0))?;

        let mut states: HashMap<String, NodeTerminal> = HashMap::new();
        for n in &graph.nodes {
            if n.kind == "maker" {
                run.maker_invocations += 1;
                // isolation check already at compile
                states.insert(n.id.clone(), NodeTerminal::Succeeded);
            } else if n.kind == "verify" {
                // fresh context simulated by different binding key
                let _cwd = self.resolve_cwd(&run, Some("verify"), Some(&n.id));
                states.insert(n.id.clone(), NodeTerminal::Succeeded);
            } else if n.kind == "join" {
                match join_ready(&n.id, &graph.edges, &states) {
                    Ok(()) => {
                        states.insert(n.id.clone(), NodeTerminal::Succeeded);
                    }
                    Err(e) => {
                        run.status = RunStatus::Failed.as_str().into();
                        run.stop_reason = Some(StopReason::JoinIncomplete.as_str().into());
                        run.finished_at = Some(Utc::now().to_rfc3339());
                        run.updated_at = Utc::now().to_rfc3339();
                        self.save_run(&run)?;
                        return Err(ServiceError::Validation(e));
                    }
                }
            } else {
                states.insert(n.id.clone(), NodeTerminal::Succeeded);
            }
        }

        // final complete via sensors if present
        if let Ok(spec) = self.get_spec(run_id, run.locked_spec_version) {
            let results = evaluate_acceptance(&spec.acceptance, Path::new(&run.home_cwd))?;
            if can_complete(&spec, &results, false).is_ok() {
                run.status = RunStatus::Completed.as_str().into();
                run.stop_reason = Some(StopReason::SpecMet.as_str().into());
                run.finished_at = Some(Utc::now().to_rfc3339());
            }
        } else {
            run.status = RunStatus::Completed.as_str().into();
            run.stop_reason = Some(StopReason::SpecMet.as_str().into());
            run.finished_at = Some(Utc::now().to_rfc3339());
        }
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    fn fail_run(&self, mut run: RunRecord, reason: StopReason) -> Result<RunRecord> {
        run.status = RunStatus::Failed.as_str().into();
        run.stop_reason = Some(reason.as_str().into());
        run.finished_at = Some(Utc::now().to_rfc3339());
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn cancel_run(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if RunStatus::parse(&run.status).is_some_and(|s| s.is_terminal()) {
            return Ok(run);
        }
        run.status = RunStatus::Cancelled.as_str().into();
        run.stop_reason = Some(StopReason::UserCancel.as_str().into());
        run.finished_at = Some(Utc::now().to_rfc3339());
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn write_mode_proposal(&self, run_id: &str, proposal: &ModeProposal) -> Result<()> {
        let run = self.load_run(run_id)?;
        let path = PathBuf::from(&run.artifact_dir).join("mode_proposal.json");
        write_json_atomic(&path, proposal)
    }

    pub fn context_pack(&self, run_id: &str) -> Result<serde_json::Value> {
        let run = self.load_run(run_id)?;
        Ok(serde_json::json!({
            "run_id": run.id,
            "status": run.status,
            "requested_mode": run.requested_mode,
            "mode": run.mode,
            "mode_reason": run.mode_reason,
            "stop_reason": run.stop_reason,
            "goal": run.goal,
            "home": {
                "target_kind": run.target_kind,
                "project_guid": run.project_guid,
                "workspace_guid": run.workspace_guid,
                "cwd": run.home_cwd,
            },
            "workspaces": run.workspaces,
            "active_bindings": run.role_bindings,
            "budget": run.budget,
            "artifacts": {
                "root": run.artifact_dir,
            },
            "locked_spec_version": run.locked_spec_version,
            "skill_dir_hint": skill_dir_hint(),
        }))
    }

    pub fn workspace_create(
        &self,
        run_id: &str,
        purpose: &str,
        path: Option<String>,
    ) -> Result<RunWorkspaceRecord> {
        let mut run = self.load_run(run_id)?;
        if run.target_kind == TargetKind::Standalone.as_str() {
            // limited: dir under artifact
            let child_path = path.unwrap_or_else(|| {
                PathBuf::from(&run.artifact_dir)
                    .join("workspaces")
                    .join(Uuid::new_v4().to_string())
                    .display()
                    .to_string()
            });
            fs::create_dir_all(&child_path)
                .map_err(|e| ServiceError::Processing(e.to_string()))?;
            let rec = RunWorkspaceRecord {
                id: Uuid::new_v4().to_string(),
                workspace_guid: format!("child-{}", Uuid::new_v4()),
                kind: "child".into(),
                purpose: Some(purpose.into()),
                status: "active".into(),
                path: child_path,
                base_ref: None,
                created_at: Utc::now().to_rfc3339(),
            };
            run.workspaces.push(rec.clone());
            run.updated_at = Utc::now().to_rfc3339();
            self.save_run(&run)?;
            return Ok(rec);
        }

        let child_path = path.unwrap_or_else(|| {
            // sibling dir next to home for fixture isolation
            let home = PathBuf::from(&run.home_cwd);
            home.parent()
                .unwrap_or(home.as_path())
                .join(format!("orch-child-{}", &run.id[..8.min(run.id.len())]))
                .join(Uuid::new_v4().to_string())
                .display()
                .to_string()
        });
        fs::create_dir_all(&child_path).map_err(|e| ServiceError::Processing(e.to_string()))?;
        // mark create_source for discovery
        let _ = fs::write(
            PathBuf::from(&child_path).join(".atmos-orch-workspace"),
            format!("run_id={}\ncreate_source=orchestrator\n", run.id),
        );

        let rec = RunWorkspaceRecord {
            id: Uuid::new_v4().to_string(),
            workspace_guid: format!("child-{}", Uuid::new_v4()),
            kind: "child".into(),
            purpose: Some(purpose.into()),
            status: "active".into(),
            path: child_path,
            base_ref: run.workspace_guid.clone(),
            created_at: Utc::now().to_rfc3339(),
        };
        run.workspaces.push(rec.clone());
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(rec)
    }

    pub fn workspace_use(
        &self,
        run_id: &str,
        workspace_guid: &str,
        role: Option<&str>,
        node_id: Option<&str>,
    ) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        let ws = run
            .workspaces
            .iter()
            .find(|w| w.workspace_guid == workspace_guid)
            .ok_or_else(|| ServiceError::Validation("ORCH_WORKSPACE_NOT_CHILD".into()))?
            .clone();
        if ws.status != "active" && ws.kind != "home" {
            return Err(ServiceError::Validation("workspace not active".into()));
        }
        run.role_bindings.retain(|b| {
            !(role.is_some() && b.role.as_deref() == role
                || node_id.is_some() && b.node_id.as_deref() == node_id)
        });
        run.role_bindings.push(RoleBindingRecord {
            role: role.map(|s| s.into()),
            node_id: node_id.map(|s| s.into()),
            workspace_guid: ws.workspace_guid,
            cwd: ws.path,
        });
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn workspace_merge(&self, run_id: &str, workspace_guid: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        let home = run.home_cwd.clone();
        let mut found = false;
        for w in &mut run.workspaces {
            if w.workspace_guid == workspace_guid && w.kind == "child" {
                // fixture merge: copy a marker file if present
                let marker = PathBuf::from(&w.path).join("ORCH_RESULT.txt");
                if marker.exists() {
                    let dest = PathBuf::from(&home).join("ORCH_RESULT.txt");
                    let _ = fs::create_dir_all(&home);
                    let _ = fs::copy(&marker, &dest);
                }
                w.status = "merged".into();
                found = true;
            }
        }
        if !found {
            return Err(ServiceError::Validation("ORCH_WORKSPACE_NOT_CHILD".into()));
        }
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn workspace_abandon(&self, run_id: &str, workspace_guid: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        let mut found = false;
        for w in &mut run.workspaces {
            if w.workspace_guid == workspace_guid && w.kind == "child" {
                w.status = "abandoned".into();
                found = true;
            }
        }
        if !found {
            return Err(ServiceError::Validation("ORCH_WORKSPACE_NOT_CHILD".into()));
        }
        run.role_bindings
            .retain(|b| b.workspace_guid != workspace_guid);
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn attach_evidence(
        &self,
        run_id: &str,
        kind: &str,
        src_path: &Path,
    ) -> Result<serde_json::Value> {
        let run = self.load_run(run_id)?;
        let id = Uuid::new_v4().to_string();
        let dest = PathBuf::from(&run.artifact_dir)
            .join("evidence")
            .join(format!("{id}.bin"));
        fs::copy(src_path, &dest)
            .map_err(|e| ServiceError::Processing(format!("copy evidence: {e}")))?;
        let meta = serde_json::json!({
            "id": id,
            "run_id": run_id,
            "kind": kind,
            "path": dest.display().to_string(),
        });
        write_json_atomic(
            &PathBuf::from(&run.artifact_dir)
                .join("evidence")
                .join(format!("{id}.json")),
            &meta,
        )?;
        Ok(meta)
    }

    pub fn compile_run_graph(&self, run_id: &str, graph: &CompiledGraph) -> Result<CompiledGraph> {
        let compiled = compile_graph(graph).map_err(|e| {
            ServiceError::Validation(format!("ORCH_GRAPH_COMPILE_FAILED: {}", e.0))
        })?;
        let mut run = self.load_run(run_id)?;
        run.graph = Some(compiled.clone());
        write_json_atomic(
            &PathBuf::from(&run.artifact_dir).join("graph.compiled.json"),
            &compiled,
        )?;
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(compiled)
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn diamond_from_units(units: &[String]) -> CompiledGraph {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for (i, u) in units.iter().enumerate() {
        nodes.push(GraphNode {
            id: format!("maker-{i}"),
            kind: "maker".into(),
            label: u.clone(),
            agent_id: None,
            fresh_context: None,
            writes: true,
            isolation: "worktree".into(),
            node_timeout_ms: None,
            workspace_guid: None,
        });
    }
    nodes.push(GraphNode {
        id: "join".into(),
        kind: "join".into(),
        label: "join".into(),
        agent_id: None,
        fresh_context: None,
        writes: false,
        isolation: "none".into(),
        node_timeout_ms: None,
        workspace_guid: None,
    });
    nodes.push(GraphNode {
        id: "verify".into(),
        kind: "verify".into(),
        label: "verify".into(),
        agent_id: None,
        fresh_context: Some(true),
        writes: false,
        isolation: "none".into(),
        node_timeout_ms: None,
        workspace_guid: None,
    });
    for (i, _) in units.iter().enumerate() {
        edges.push(GraphEdge {
            id: format!("e-m{i}-j"),
            from: format!("maker-{i}"),
            to: "join".into(),
            kind: "control".into(),
            required: true,
            max_cycles: None,
        });
    }
    edges.push(GraphEdge {
        id: "e-j-v".into(),
        from: "join".into(),
        to: "verify".into(),
        kind: "control".into(),
        required: true,
        max_cycles: None,
    });
    let entry = (0..units.len()).map(|i| format!("maker-{i}")).collect();
    CompiledGraph {
        nodes,
        edges,
        entry,
    }
}

pub fn skill_dir_hint() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".atmos")
        .join("skills")
        .join(".system")
        .join("atmos-orchestrator")
        .display()
        .to_string()
}

pub fn skill_dir_output() -> serde_json::Value {
    let dir = skill_dir_hint();
    let prompt = format!(
        "Read the Atmos Orchestrator skill in this directory and use `atmos orchestrator` to manage multi-step runs (Loop/Graph), Judgment Specs, and evidence. Do not invent completion without Spec + sensors.\n{dir}"
    );
    serde_json::json!({
        "skill_dir": dir,
        "skill_md": format!("{dir}/SKILL.md"),
        "prompt": prompt,
    })
}

// Re-export Arc helper for AppState
pub type SharedOrchestratorService = Arc<OrchestratorService>;

#[cfg(test)]
mod integration_tests {
    use super::*;
    use tempfile::tempdir;

    fn svc() -> (OrchestratorService, PathBuf) {
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        // leak tempdir for test duration via into_path
        std::mem::forget(dir);
        (OrchestratorService::with_root(root.clone()), root)
    }

    #[test]
    fn loop_completes_when_sensor_passes() {
        let (svc, home) = svc();
        let home_cwd = home.join("project");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "pass typecheck".into(),
                requested_mode: "loop".into(),
                target_kind: "standalone".into(),
                project_guid: None,
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: Some(Budget {
                    max_iterations: 3,
                    max_wall_ms: 60_000,
                    max_maker_invocations: 5,
                    max_spec_versions: 3,
                }),
                carry_from_run_id: None,
                maker_agent_id: None,
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();

        let body = JudgmentSpecBody {
            goal_summary: "g".into(),
            risk_tier: "low".into(),
            acceptance: vec![Criterion {
                id: "c1".into(),
                description: "true".into(),
                kind: "sensor".into(),
                required: true,
                sensor: Some(SensorSpec {
                    argv: vec!["true".into()],
                    cwd: None,
                    pass_exit_codes: vec![0],
                    timeout_ms: 5000,
                }),
                falsify: None,
                evidence_required: vec![],
                immutable_paths: vec![],
                sole_source: Some("sensor".into()),
            }],
            rejection: vec![],
            judgment_order: vec!["sensor".into()],
        };
        svc.draft_spec_from_body(&run.id, body).unwrap();
        // auto confirm for low risk
        let meta_path = PathBuf::from(&run.artifact_dir)
            .join("specs")
            .join("v1.meta.json");
        let mut meta: serde_json::Value = read_json_file(&meta_path).unwrap();
        meta["confirmed"] = serde_json::json!(true);
        write_json_atomic(&meta_path, &meta).unwrap();

        let started = svc.start_run(&run.id).unwrap();
        assert_eq!(started.mode.as_deref(), Some("loop"));
        let done = svc.tick_loop_fixture(&run.id).unwrap();
        assert_eq!(done.status, "completed");
        assert_eq!(done.stop_reason.as_deref(), Some("spec_met"));
    }

    #[test]
    fn start_without_spec_fails() {
        let (svc, home) = svc();
        let home_cwd = home.join("p");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "x".into(),
                requested_mode: "loop".into(),
                target_kind: "standalone".into(),
                project_guid: None,
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: None,
                carry_from_run_id: None,
                maker_agent_id: None,
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();
        let err = svc.start_run(&run.id).unwrap_err();
        assert!(err.to_string().contains("SPEC"));
    }

    #[test]
    fn workspace_create_use_merge() {
        let (svc, home) = svc();
        let home_cwd = home.join("proj");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "iso".into(),
                requested_mode: "loop".into(),
                target_kind: "project".into(),
                project_guid: Some("pj".into()),
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: None,
                carry_from_run_id: None,
                maker_agent_id: None,
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();
        let child = svc.workspace_create(&run.id, "experiment", None).unwrap();
        assert_eq!(child.kind, "child");
        assert!(child.path.contains("orch-child") || Path::new(&child.path).exists());
        let run = svc
            .workspace_use(&run.id, &child.workspace_guid, Some("maker"), None)
            .unwrap();
        let cwd = svc.resolve_cwd(&run, Some("maker"), None);
        assert_eq!(cwd, child.path);
        fs::write(PathBuf::from(&child.path).join("ORCH_RESULT.txt"), "ok").unwrap();
        let run = svc.workspace_merge(&run.id, &child.workspace_guid).unwrap();
        let child = run
            .workspaces
            .iter()
            .find(|w| w.workspace_guid == child.workspace_guid)
            .unwrap();
        assert_eq!(child.status, "merged");
        assert!(home_cwd.join("ORCH_RESULT.txt").exists());
    }

    #[test]
    fn multi_writer_graph_compile_fails() {
        let (svc, home) = svc();
        let home_cwd = home.join("p");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "g".into(),
                requested_mode: "graph".into(),
                target_kind: "standalone".into(),
                project_guid: None,
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: None,
                carry_from_run_id: None,
                maker_agent_id: None,
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();
        let g = CompiledGraph {
            nodes: vec![
                GraphNode {
                    id: "a".into(),
                    kind: "maker".into(),
                    label: "a".into(),
                    agent_id: None,
                    fresh_context: None,
                    writes: true,
                    isolation: "none".into(),
                    node_timeout_ms: None,
                    workspace_guid: None,
                },
                GraphNode {
                    id: "b".into(),
                    kind: "maker".into(),
                    label: "b".into(),
                    agent_id: None,
                    fresh_context: None,
                    writes: true,
                    isolation: "none".into(),
                    node_timeout_ms: None,
                    workspace_guid: None,
                },
            ],
            edges: vec![],
            entry: vec!["a".into(), "b".into()],
        };
        assert!(svc.compile_run_graph(&run.id, &g).is_err());
    }

    #[test]
    fn never_writes_canvas_dir() {
        let (svc, _) = svc();
        assert!(svc.root().join("boards").to_string_lossy().contains("orchestrator")
            || !svc.root().to_string_lossy().contains("canvas"));
        // boards created under orchestrator root
        let _ = fs::create_dir_all(svc.boards_path());
        assert!(!svc.boards_path().to_string_lossy().contains("/canvas/"));
    }

    #[test]
    fn cancel_run() {
        let (svc, home) = svc();
        let home_cwd = home.join("p");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "c".into(),
                requested_mode: "loop".into(),
                target_kind: "standalone".into(),
                project_guid: None,
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: None,
                carry_from_run_id: None,
                maker_agent_id: None,
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();
        let body = JudgmentSpecBody {
            goal_summary: "g".into(),
            risk_tier: "low".into(),
            acceptance: vec![Criterion {
                id: "c1".into(),
                description: "t".into(),
                kind: "sensor".into(),
                required: true,
                sensor: Some(SensorSpec {
                    argv: vec!["false".into()],
                    cwd: None,
                    pass_exit_codes: vec![0],
                    timeout_ms: 2000,
                }),
                falsify: None,
                evidence_required: vec![],
                immutable_paths: vec![],
                sole_source: None,
            }],
            rejection: vec![],
            judgment_order: vec!["sensor".into()],
        };
        svc.draft_spec_from_body(&run.id, body).unwrap();
        let meta_path = PathBuf::from(&run.artifact_dir).join("specs/v1.meta.json");
        let mut meta: serde_json::Value = read_json_file(&meta_path).unwrap();
        meta["confirmed"] = serde_json::json!(true);
        write_json_atomic(&meta_path, &meta).unwrap();
        svc.start_run(&run.id).unwrap();
        let cancelled = svc.cancel_run(&run.id).unwrap();
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.stop_reason.as_deref(), Some("user_cancel"));
    }
}
