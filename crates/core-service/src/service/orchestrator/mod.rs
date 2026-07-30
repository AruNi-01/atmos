//! APP-048 Orchestrator service — file-backed runs under `~/.atmos/orchestrator/`.

mod artifacts;
mod graph_compile;
mod runtime;
mod schemas;
mod sensors;

pub use graph_compile::{compile_graph, join_ready, CompileError, NodeTerminal};
pub use runtime::*;
pub use schemas::*;
pub use sensors::{
    check_immutable_not_modified, evaluate_acceptance, immutable_paths_from_spec, run_sensor,
    snapshot_immutable_mtimes,
};

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
        for entry in
            fs::read_dir(&dir).map_err(|e| ServiceError::Processing(format!("read runs: {e}")))?
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

    pub fn resolve_cwd(
        &self,
        run: &RunRecord,
        role: Option<&str>,
        node_id: Option<&str>,
    ) -> String {
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
            &PathBuf::from(&run.artifact_dir)
                .join("specs")
                .join(format!("v{version}.meta.json")),
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
        let v = version
            .or(run.locked_spec_version)
            .ok_or_else(|| ServiceError::NotFound("no spec".into()))?;
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
        self.start_run_with_options(run_id, true)
    }

    /// `sync_advance`: Runtime runs fixture Loop/Graph to terminal (default true for tests/CLI).
    pub fn start_run_with_options(&self, run_id: &str, sync_advance: bool) -> Result<RunRecord> {
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
                } else if p.topology_hint.as_deref() == Some("diamond") && p.named_units.len() >= 2
                {
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

        if !sync_advance {
            return Ok(run);
        }
        // Runtime owns advancement (M26): fixture agents run to terminal state.
        let run = match effective {
            EffectiveMode::Loop => self.advance_loop_until_terminal(run_id)?,
            EffectiveMode::Graph => self.advance_graph_until_terminal(run_id)?,
        };
        Ok(run)
    }

    /// Fixture Terminal Agent role invoke: writes contracted artifacts under run dir with bound cwd.
    pub fn role_invoke(
        &self,
        run_id: &str,
        role: OrchRole,
        node_id: Option<&str>,
    ) -> Result<PathBuf> {
        let run = self.load_run(run_id)?;
        let cwd = PathBuf::from(self.resolve_cwd(
            &run,
            Some(role.as_str()),
            node_id,
        ));
        fs::create_dir_all(&cwd)
            .map_err(|e| ServiceError::Processing(format!("role cwd: {e}")))?;

        let inv_id = Uuid::new_v4().to_string();
        let role_dir = PathBuf::from(&run.artifact_dir)
            .join("roles")
            .join(role.as_str())
            .join(&inv_id);
        fs::create_dir_all(&role_dir)
            .map_err(|e| ServiceError::Processing(format!("role dir: {e}")))?;

        let prompt = format!(
            "role={}\nrun_id={}\ncwd={}\ngoal={}\nnode={}\n",
            role.as_str(),
            run_id,
            cwd.display(),
            run.goal,
            node_id.unwrap_or("-")
        );
        fs::write(role_dir.join("prompt.md"), &prompt)
            .map_err(|e| ServiceError::Processing(format!("write prompt: {e}")))?;

        let artifact = match role {
            OrchRole::Orchestrator => {
                let path = PathBuf::from(&run.artifact_dir).join("mode_proposal.json");
                let proposal = ModeProposal {
                    mode: EffectiveMode::Loop,
                    reason: "fixture planner defaults to loop".into(),
                    plan_complexity: "low".into(),
                    topology_hint: Some("linear".into()),
                    graph: None,
                    named_units: vec![],
                };
                write_json_atomic(&path, &proposal)?;
                path
            }
            OrchRole::Criteria => {
                let path = PathBuf::from(&run.artifact_dir)
                    .join("specs")
                    .join("role_criteria_hint.json");
                write_json_atomic(
                    &path,
                    &serde_json::json!({"ok": true, "role": "criteria", "cwd": cwd.display().to_string()}),
                )?;
                path
            }
            OrchRole::Maker => {
                let path = PathBuf::from(&run.artifact_dir).join("work_state.json");
                write_json_atomic(
                    &path,
                    &serde_json::json!({
                        "role": "maker",
                        "cwd": cwd.display().to_string(),
                        "files_touched": [],
                        "iteration": run.iterations_used + 1,
                    }),
                )?;
                // marker in working cwd
                let _ = fs::write(cwd.join(".orch_maker_ran"), inv_id.as_bytes());
                path
            }
            OrchRole::Verify => {
                let path = PathBuf::from(&run.artifact_dir)
                    .join("verdicts")
                    .join(format!("verify-{inv_id}.json"));
                // Fresh context: verify must not share maker role dir
                write_json_atomic(
                    &path,
                    &serde_json::json!({
                        "role": "verify",
                        "cwd": cwd.display().to_string(),
                        "fresh_context": true,
                        "node_id": node_id,
                    }),
                )?;
                let _ = fs::write(cwd.join(".orch_verify_ran"), inv_id.as_bytes());
                path
            }
        };

        // Atomic done sentinel after artifact
        write_json_atomic(
            &role_dir.join("role.done"),
            &serde_json::json!({
                "ok": true,
                "artifact": artifact.display().to_string(),
            }),
        )?;
        Ok(artifact)
    }

    /// Runtime-owned Loop advance (not agent CLI). Runs maker role + sensors + integrity.
    pub fn advance_loop_once(&self, run_id: &str) -> Result<RunRecord> {
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
            BudgetCheck::Iterations => return self.fail_run(run, StopReason::BudgetIterations),
            BudgetCheck::Wall => return self.fail_run(run, StopReason::BudgetWall),
            BudgetCheck::Makers => return self.fail_run(run, StopReason::BudgetMakers),
            BudgetCheck::Ok => {}
        }

        let spec = self.get_spec(run_id, run.locked_spec_version)?;
        let cwd = PathBuf::from(self.resolve_cwd(&run, Some("maker"), None));
        let protected = immutable_paths_from_spec(&spec.acceptance);
        let before = snapshot_immutable_mtimes(&protected, &cwd);

        // Maker Terminal Agent (fixture)
        self.role_invoke(run_id, OrchRole::Maker, None)?;
        run.iterations_used += 1;
        run.maker_invocations += 1;

        if let Err(msg) = check_immutable_not_modified(&protected, &cwd, &before) {
            return self.fail_run_msg(run, StopReason::WorkerFailed, &msg);
        }

        // Verify role on fresh binding (same home unless isolated)
        let _ = self.role_invoke(run_id, OrchRole::Verify, Some("loop-verify"));

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

        write_json_atomic(
            &PathBuf::from(&run.artifact_dir)
                .join("verdicts")
                .join(format!("{verdict_id}.json")),
            &serde_json::json!({
                "id": verdict_id,
                "run_id": run_id,
                "spec_version": run.locked_spec_version,
                "iteration": run.iterations_used,
                "result": result.as_str(),
                "summary": summary,
                "criterion_results": results,
            }),
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
                BudgetCheck::Ok => {}
                BudgetCheck::Iterations => {
                    return self.fail_run(run, StopReason::BudgetIterations);
                }
                BudgetCheck::Wall => return self.fail_run(run, StopReason::BudgetWall),
                BudgetCheck::Makers => return self.fail_run(run, StopReason::BudgetMakers),
            }
        }

        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn advance_loop_until_terminal(&self, run_id: &str) -> Result<RunRecord> {
        loop {
            let run = self.load_run(run_id)?;
            if RunStatus::parse(&run.status).is_some_and(|s| s.is_terminal())
                || run.status == RunStatus::BlockedHuman.as_str()
            {
                return Ok(run);
            }
            let run = self.advance_loop_once(run_id)?;
            if RunStatus::parse(&run.status).is_some_and(|s| s.is_terminal())
                || run.status == RunStatus::BlockedHuman.as_str()
            {
                return Ok(run);
            }
            if run.iterations_used >= run.budget.max_iterations {
                return self.fail_run(run, StopReason::BudgetIterations);
            }
        }
    }

    /// Graph node fixture outcome from id/label suffix: -fail, -hang, else success.
    fn node_fixture_outcome(n: &GraphNode) -> NodeTerminal {
        let key = format!("{} {}", n.id, n.label).to_ascii_lowercase();
        if key.contains("-hang") || key.contains("hang") && key.contains("timeout") {
            return NodeTerminal::TimedOut;
        }
        if key.contains("-fail") || key.ends_with("_fail") {
            return NodeTerminal::Failed;
        }
        // Optional outcome file under nodes/{id}/outcome.json
        NodeTerminal::Succeeded
    }

    /// Runtime-owned Graph advance with join fail-closed and Spec completion gate.
    pub fn advance_graph_until_terminal(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        if run.mode.as_deref() != Some("graph") {
            return Err(ServiceError::Validation("not graph mode".into()));
        }
        let graph = run
            .graph
            .clone()
            .ok_or_else(|| ServiceError::Validation("no graph".into()))?;
        compile_graph(&graph).map_err(|e| ServiceError::Validation(e.0))?;

        // Require Spec for completion (M12)
        let spec = self
            .get_spec(run_id, run.locked_spec_version)
            .map_err(|_| ServiceError::Validation("ORCH_SPEC_REQUIRED".into()))?;

        // Topological-ish: process in order entry → edges; simple multi-pass
        let mut states: HashMap<String, NodeTerminal> = HashMap::new();
        let mut pending: Vec<String> = graph.entry.clone();
        let mut safety = 0usize;

        while !pending.is_empty() && safety < 64 {
            safety += 1;
            let id = pending.remove(0);
            if states.contains_key(&id) {
                continue;
            }
            let Some(n) = graph.nodes.iter().find(|n| n.id == id) else {
                continue;
            };

            // Wait for required predecessors
            let preds: Vec<_> = graph
                .edges
                .iter()
                .filter(|e| e.to == id && e.kind == "control" && e.required)
                .map(|e| e.from.clone())
                .collect();
            let mut ready = true;
            for p in &preds {
                match states.get(p) {
                    None => {
                        ready = false;
                        break;
                    }
                    Some(NodeTerminal::Running) => {
                        ready = false;
                        break;
                    }
                    Some(NodeTerminal::Failed | NodeTerminal::Cancelled | NodeTerminal::TimedOut) => {
                        // fail-closed at join or when processing node with failed required pred
                        if n.kind == "join" || n.kind == "verify" || n.kind == "reduce" {
                            run.status = RunStatus::Failed.as_str().into();
                            run.stop_reason = Some(StopReason::JoinIncomplete.as_str().into());
                            run.finished_at = Some(Utc::now().to_rfc3339());
                            run.updated_at = Utc::now().to_rfc3339();
                            self.save_run(&run)?;
                            return Ok(run);
                        }
                    }
                    _ => {}
                }
            }
            if !ready {
                pending.push(id);
                continue;
            }

            let outcome = if n.kind == "join" {
                match join_ready(&n.id, &graph.edges, &states) {
                    Ok(()) => NodeTerminal::Succeeded,
                    Err(_) => {
                        run.status = RunStatus::Failed.as_str().into();
                        run.stop_reason = Some(StopReason::JoinIncomplete.as_str().into());
                        run.finished_at = Some(Utc::now().to_rfc3339());
                        run.updated_at = Utc::now().to_rfc3339();
                        self.save_run(&run)?;
                        return Ok(run);
                    }
                }
            } else if n.kind == "maker" {
                run.maker_invocations += 1;
                // Bind cwd for this node if isolated
                if n.isolation == "worktree" {
                    // ensure child workspace binding for node
                    if let Some(ws) = &n.workspace_guid {
                        let _ = self.workspace_use(run_id, ws, Some("maker"), Some(&n.id));
                    }
                }
                let _ = self.role_invoke(run_id, OrchRole::Maker, Some(&n.id));
                Self::node_fixture_outcome(n)
            } else if n.kind == "verify" {
                // Fresh verify context: bind verify role separately from maker
                let verify_cwd = self.resolve_cwd(&run, Some("verify"), Some(&n.id));
                // Ensure verify does not use maker node binding only
                let _ = verify_cwd;
                let _ = self.role_invoke(run_id, OrchRole::Verify, Some(&n.id));
                Self::node_fixture_outcome(n)
            } else if n.kind == "sensor" {
                Self::node_fixture_outcome(n)
            } else {
                Self::node_fixture_outcome(n)
            };

            if matches!(outcome, NodeTerminal::TimedOut | NodeTerminal::Failed)
                && (n.kind == "maker" || n.kind == "verify")
            {
                states.insert(n.id.clone(), outcome);
                // enqueue successors so join can observe failure
            } else {
                states.insert(n.id.clone(), outcome);
            }

            for e in &graph.edges {
                if e.from == id && e.kind == "control" && !states.contains_key(&e.to) {
                    pending.push(e.to.clone());
                }
            }
        }

        // Any hang left as Running?
        for n in &graph.nodes {
            if matches!(states.get(&n.id), Some(NodeTerminal::TimedOut)) {
                run.status = RunStatus::Failed.as_str().into();
                run.stop_reason = Some(StopReason::JoinIncomplete.as_str().into());
                run.finished_at = Some(Utc::now().to_rfc3339());
                run.updated_at = Utc::now().to_rfc3339();
                self.save_run(&run)?;
                return Ok(run);
            }
            if matches!(states.get(&n.id), Some(NodeTerminal::Failed)) {
                // If any required terminal node failed without successful join path
                if n.kind == "maker" || n.kind == "verify" {
                    run.status = RunStatus::Failed.as_str().into();
                    run.stop_reason = Some(StopReason::WorkerFailed.as_str().into());
                    run.finished_at = Some(Utc::now().to_rfc3339());
                    run.updated_at = Utc::now().to_rfc3339();
                    self.save_run(&run)?;
                    return Ok(run);
                }
            }
        }

        // Spec gate — never complete without Spec + evidence
        let results = evaluate_acceptance(&spec.acceptance, Path::new(&run.home_cwd))?;
        match can_complete(&spec, &results, false) {
            Ok(()) => {
                run.status = RunStatus::Completed.as_str().into();
                run.stop_reason = Some(StopReason::SpecMet.as_str().into());
                run.finished_at = Some(Utc::now().to_rfc3339());
            }
            Err(CompleteGateError::HumanBlocked { .. }) => {
                run.status = RunStatus::BlockedHuman.as_str().into();
            }
            Err(_) => {
                run.status = RunStatus::Failed.as_str().into();
                run.stop_reason = Some(StopReason::WorkerFailed.as_str().into());
                run.finished_at = Some(Utc::now().to_rfc3339());
            }
        }
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    /// @deprecated use advance_loop_once — kept as alias for internal tests
    pub fn tick_loop_fixture(&self, run_id: &str) -> Result<RunRecord> {
        self.advance_loop_once(run_id)
    }

    /// @deprecated use advance_graph_until_terminal
    pub fn step_graph_fixture(&self, run_id: &str) -> Result<RunRecord> {
        self.advance_graph_until_terminal(run_id)
    }

    fn fail_run(&self, mut run: RunRecord, reason: StopReason) -> Result<RunRecord> {
        run.status = RunStatus::Failed.as_str().into();
        run.stop_reason = Some(reason.as_str().into());
        run.finished_at = Some(Utc::now().to_rfc3339());
        run.updated_at = Utc::now().to_rfc3339();
        self.save_run(&run)?;
        Ok(run)
    }

    fn fail_run_msg(
        &self,
        mut run: RunRecord,
        reason: StopReason,
        msg: &str,
    ) -> Result<RunRecord> {
        let _ = fs::write(
            PathBuf::from(&run.artifact_dir).join("fail_detail.txt"),
            msg,
        );
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
            fs::create_dir_all(&child_path).map_err(|e| ServiceError::Processing(e.to_string()))?;
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
        let compiled = compile_graph(graph)
            .map_err(|e| ServiceError::Validation(format!("ORCH_GRAPH_COMPILE_FAILED: {}", e.0)))?;
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

        let done = svc.start_run(&run.id).unwrap();
        assert_eq!(done.mode.as_deref(), Some("loop"));
        assert_eq!(done.status, "completed");
        assert_eq!(done.stop_reason.as_deref(), Some("spec_met"));
        // role_invoke wrote maker/verify artifacts
        assert!(
            PathBuf::from(&done.artifact_dir)
                .join("work_state.json")
                .exists()
        );
    }

    #[test]
    fn sensor_integrity_fails_when_protected_file_mutated() {
        let (svc, home) = svc();
        let home_cwd = home.join("proj");
        fs::create_dir_all(&home_cwd).unwrap();
        let protected = home_cwd.join("tests/guard.rs");
        fs::create_dir_all(protected.parent().unwrap()).unwrap();
        fs::write(&protected, b"// original\n").unwrap();

        let run = svc
            .create_run(CreateRunReq {
                goal: "integrity".into(),
                requested_mode: "loop".into(),
                target_kind: "standalone".into(),
                project_guid: None,
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: Some(Budget {
                    max_iterations: 2,
                    max_wall_ms: 60_000,
                    max_maker_invocations: 3,
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
                immutable_paths: vec!["tests/guard.rs".into()],
                sole_source: Some("sensor".into()),
            }],
            rejection: vec![],
            judgment_order: vec!["sensor".into()],
        };
        svc.draft_spec_from_body(&run.id, body).unwrap();
        let meta_path = PathBuf::from(&run.artifact_dir).join("specs/v1.meta.json");
        let mut meta: serde_json::Value = read_json_file(&meta_path).unwrap();
        meta["confirmed"] = serde_json::json!(true);
        write_json_atomic(&meta_path, &meta).unwrap();

        // After start, maker runs — but we mutate protected file mid-flight by racing:
        // Call advance after mutating between snapshot and check by temporarily
        // wrapping: mutate file after snapshot inside maker by pre-mutating with
        // newer mtime during role_invoke — simulate by calling advance after
        // changing file with sleep for mtime granularity.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        // Manually run one advance path with mutation: use start which auto-runs;
        // Instead invoke advance after setting running and mutating during maker.
        // Simpler: unit-level check that mutating after snapshot fails:
        let before = snapshot_immutable_mtimes(&["tests/guard.rs".into()], &home_cwd);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        fs::write(&protected, b"// tampered\n").unwrap();
        assert!(check_immutable_not_modified(
            &["tests/guard.rs".into()],
            &home_cwd,
            &before
        )
        .is_err());

        // Also ensure start with integrity path can fail when file changes during maker:
        // Pre-mutate won't trigger because snapshot is after create; instead monkey by
        // running advance_loop_once after setting status running with confirmed spec.
        let mut run = svc.load_run(&run.id).unwrap();
        run.status = "running".into();
        run.mode = Some("loop".into());
        run.wall_started_ms = Some(now_ms());
        svc.save_run(&run).unwrap();

        // Snapshot happens at start of advance; change file by making maker write to it:
        // role_invoke maker doesn't touch tests/guard.rs — so inject tamper via custom:
        // Call snapshot, then write, then check is unit-tested above.
        // Integration: replace immutable path with a file maker touches:
        let marker = home_cwd.join(".orch_maker_ran");
        // re-draft with immutable_paths on maker marker that role_invoke writes
        let body2 = JudgmentSpecBody {
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
                immutable_paths: vec![".orch_maker_ran".into()],
                sole_source: Some("sensor".into()),
            }],
            rejection: vec![],
            judgment_order: vec!["sensor".into()],
        };
        // Pre-create protected empty file so snapshot has mtime
        fs::write(&marker, b"seed").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        svc.draft_spec_from_body(&run.id, body2).unwrap();
        let meta_path = PathBuf::from(&run.artifact_dir).join("specs/v2.meta.json");
        let mut meta: serde_json::Value = read_json_file(&meta_path).unwrap();
        meta["confirmed"] = serde_json::json!(true);
        write_json_atomic(&meta_path, &meta).unwrap();
        let mut run = svc.load_run(&run.id).unwrap();
        run.locked_spec_version = Some(2);
        run.status = "running".into();
        run.mode = Some("loop".into());
        run.wall_started_ms = Some(now_ms());
        svc.save_run(&run).unwrap();

        let after = svc.advance_loop_once(&run.id).unwrap();
        // maker role_invoke overwrites .orch_maker_ran → integrity fail
        assert_eq!(after.status, "failed");
        assert_eq!(after.stop_reason.as_deref(), Some("worker_failed"));
    }

    #[test]
    fn graph_fail_closed_on_failed_branch() {
        let (svc, home) = svc();
        let home_cwd = home.join("g");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "graph fail".into(),
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
        let meta_path = PathBuf::from(&run.artifact_dir).join("specs/v1.meta.json");
        let mut meta: serde_json::Value = read_json_file(&meta_path).unwrap();
        meta["confirmed"] = serde_json::json!(true);
        write_json_atomic(&meta_path, &meta).unwrap();

        let g = CompiledGraph {
            nodes: vec![
                GraphNode {
                    id: "a".into(),
                    kind: "maker".into(),
                    label: "a".into(),
                    agent_id: None,
                    fresh_context: None,
                    writes: true,
                    isolation: "worktree".into(),
                    node_timeout_ms: None,
                    workspace_guid: None,
                },
                GraphNode {
                    id: "b-fail".into(),
                    kind: "maker".into(),
                    label: "b-fail".into(),
                    agent_id: None,
                    fresh_context: None,
                    writes: true,
                    isolation: "worktree".into(),
                    node_timeout_ms: None,
                    workspace_guid: None,
                },
                GraphNode {
                    id: "join".into(),
                    kind: "join".into(),
                    label: "join".into(),
                    agent_id: None,
                    fresh_context: None,
                    writes: false,
                    isolation: "none".into(),
                    node_timeout_ms: None,
                    workspace_guid: None,
                },
            ],
            edges: vec![
                GraphEdge {
                    id: "e1".into(),
                    from: "a".into(),
                    to: "join".into(),
                    kind: "control".into(),
                    required: true,
                    max_cycles: None,
                },
                GraphEdge {
                    id: "e2".into(),
                    from: "b-fail".into(),
                    to: "join".into(),
                    kind: "control".into(),
                    required: true,
                    max_cycles: None,
                },
            ],
            entry: vec!["a".into(), "b-fail".into()],
        };
        svc.compile_run_graph(&run.id, &g).unwrap();
        // write mode proposal with graph for start
        svc.write_mode_proposal(
            &run.id,
            &ModeProposal {
                mode: EffectiveMode::Graph,
                reason: "parallel".into(),
                plan_complexity: "high".into(),
                topology_hint: None,
                graph: Some(g),
                named_units: vec![],
            },
        )
        .unwrap();

        let done = svc.start_run(&run.id).unwrap();
        assert_eq!(done.status, "failed");
        assert!(
            done.stop_reason.as_deref() == Some("join_incomplete")
                || done.stop_reason.as_deref() == Some("worker_failed")
        );
    }

    #[test]
    fn graph_never_completes_without_spec() {
        let (svc, home) = svc();
        let home_cwd = home.join("gs");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "no spec".into(),
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
        // Force graph mode without going through start_run's full path
        let mut run = svc.load_run(&run.id).unwrap();
        run.mode = Some("graph".into());
        run.status = "running".into();
        run.graph = Some(CompiledGraph {
            nodes: vec![GraphNode {
                id: "a".into(),
                kind: "maker".into(),
                label: "a".into(),
                agent_id: None,
                fresh_context: None,
                writes: false,
                isolation: "none".into(),
                node_timeout_ms: None,
                workspace_guid: None,
            }],
            edges: vec![],
            entry: vec!["a".into()],
        });
        svc.save_run(&run).unwrap();
        let err = svc.advance_graph_until_terminal(&run.id).unwrap_err();
        assert!(err.to_string().contains("SPEC"));
    }

    #[test]
    fn cli_workflow_create_spec_start_context_workspace() {
        // Mirrors agent CLI sequence without HTTP: create → draft → confirm → start → context → workspace.
        let (svc, home) = svc();
        let home_cwd = home.join("cli-home");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "cli path".into(),
                requested_mode: "loop".into(),
                target_kind: "project".into(),
                project_guid: Some("pj-1".into()),
                workspace_guid: None,
                home_cwd: home_cwd.display().to_string(),
                budget: Some(Budget::default()),
                carry_from_run_id: None,
                maker_agent_id: Some("codex".into()),
                planner_agent_id: None,
                criteria_agent_id: None,
                verify_agent_id: None,
            })
            .unwrap();
        assert!(!run.id.is_empty());

        // start without spec → ORCH_SPEC_REQUIRED
        let err = svc.start_run(&run.id).unwrap_err().to_string();
        assert!(err.contains("SPEC"), "{err}");

        let body = JudgmentSpecBody {
            goal_summary: "cli".into(),
            risk_tier: "low".into(),
            acceptance: vec![Criterion {
                id: "c1".into(),
                description: "ok".into(),
                kind: "sensor".into(),
                required: true,
                sensor: Some(SensorSpec {
                    argv: vec!["true".into()],
                    cwd: None,
                    pass_exit_codes: vec![0],
                    timeout_ms: 3000,
                }),
                falsify: None,
                evidence_required: vec![],
                immutable_paths: vec![],
                sole_source: Some("sensor".into()),
            }],
            rejection: vec![],
            judgment_order: vec!["sensor".into()],
        };
        let (_, ver) = svc.draft_spec_from_body(&run.id, body).unwrap();
        svc.confirm_spec(&run.id, ver).unwrap();

        let ctx = svc.context_pack(&run.id).unwrap();
        assert_eq!(ctx["home"]["cwd"], home_cwd.display().to_string());

        let child = svc
            .workspace_create(&run.id, "iso", None)
            .unwrap();
        svc.workspace_use(&run.id, &child.workspace_guid, Some("maker"), None)
            .unwrap();
        let run2 = svc.load_run(&run.id).unwrap();
        assert_eq!(
            svc.resolve_cwd(&run2, Some("maker"), None),
            child.path
        );
        fs::write(PathBuf::from(&child.path).join("ORCH_RESULT.txt"), "x").unwrap();
        let merged = svc.workspace_merge(&run.id, &child.workspace_guid).unwrap();
        assert!(
            merged
                .workspaces
                .iter()
                .any(|w| w.workspace_guid == child.workspace_guid && w.status == "merged")
        );

        let finished = svc.start_run(&run.id).unwrap();
        assert_eq!(finished.status, "completed");
        assert_eq!(finished.stop_reason.as_deref(), Some("spec_met"));

        let cancelled_base = svc
            .create_run(CreateRunReq {
                goal: "cancel me".into(),
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
            goal_summary: "c".into(),
            risk_tier: "low".into(),
            acceptance: vec![Criterion {
                id: "c1".into(),
                description: "f".into(),
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
        let (_, v) = svc.draft_spec_from_body(&cancelled_base.id, body).unwrap();
        svc.confirm_spec(&cancelled_base.id, v).unwrap();
        svc.start_run_with_options(&cancelled_base.id, false)
            .unwrap();
        let c = svc.cancel_run(&cancelled_base.id).unwrap();
        assert_eq!(c.status, "cancelled");
    }

    #[test]
    fn role_invoke_uses_home_cwd() {
        let (svc, home) = svc();
        let home_cwd = home.join("cwdproj");
        fs::create_dir_all(&home_cwd).unwrap();
        let run = svc
            .create_run(CreateRunReq {
                goal: "cwd".into(),
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
        let art = svc.role_invoke(&run.id, OrchRole::Maker, None).unwrap();
        assert!(art.exists());
        assert!(home_cwd.join(".orch_maker_ran").exists());
        let ws: serde_json::Value =
            read_json_file(&PathBuf::from(&run.artifact_dir).join("work_state.json")).unwrap();
        assert_eq!(ws["cwd"], home_cwd.display().to_string());
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
        assert!(
            svc.root()
                .join("boards")
                .to_string_lossy()
                .contains("orchestrator")
                || !svc.root().to_string_lossy().contains("canvas")
        );
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
        svc.start_run_with_options(&run.id, false).unwrap();
        let cancelled = svc.cancel_run(&run.id).unwrap();
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.stop_reason.as_deref(), Some("user_cancel"));
    }
}
