use std::path::PathBuf;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    api::dto::ApiResponse,
    app_state::AppState,
    error::{ApiError, ApiResult},
};
use core_service::{
    Budget, CompiledGraph, CreateRunReq, JudgmentSpecBody, ModeProposal, OrchestratorService,
};

fn orch(state: &AppState) -> &OrchestratorService {
    &state.orchestrator_service
}

fn map_err(e: core_service::ServiceError) -> ApiError {
    match e {
        core_service::ServiceError::NotFound(m) => ApiError::NotFound(m),
        core_service::ServiceError::Validation(m) => ApiError::BadRequest(m),
        other => ApiError::InternalError(other.to_string()),
    }
}

pub async fn status(State(state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    Ok(Json(ApiResponse::success(orch(&state).status())))
}

pub async fn agents_list(State(_state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    // Minimal catalog — real terminal agents come from shared manifest later
    Ok(Json(ApiResponse::success(json!({
        "agents": [
            {"id": "codex", "label": "Codex"},
            {"id": "claude-code", "label": "Claude Code"},
            {"id": "opencode", "label": "OpenCode"},
        ]
    }))))
}

pub async fn skill_dir(State(_state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    Ok(Json(ApiResponse::success(core_service::skill_dir_output())))
}

#[derive(Debug, Deserialize)]
pub struct CreateRunBody {
    pub goal: String,
    #[serde(default = "default_mode")]
    pub requested_mode: String,
    #[serde(default = "default_standalone")]
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub home_cwd: Option<String>,
    pub budget: Option<Budget>,
    pub carry_from_run_id: Option<String>,
    pub maker_agent_id: Option<String>,
    pub planner_agent_id: Option<String>,
    pub criteria_agent_id: Option<String>,
    pub verify_agent_id: Option<String>,
}

fn default_mode() -> String {
    "loop".into()
}
fn default_standalone() -> String {
    "standalone".into()
}

pub async fn create_run(
    State(state): State<AppState>,
    Json(body): Json<CreateRunBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let home_cwd = body.home_cwd.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| ".".into())
    });
    let run = orch(&state)
        .create_run(CreateRunReq {
            goal: body.goal,
            requested_mode: body.requested_mode,
            target_kind: body.target_kind,
            project_guid: body.project_guid,
            workspace_guid: body.workspace_guid,
            home_cwd,
            budget: body.budget,
            carry_from_run_id: body.carry_from_run_id,
            maker_agent_id: body.maker_agent_id,
            planner_agent_id: body.planner_agent_id,
            criteria_agent_id: body.criteria_agent_id,
            verify_agent_id: body.verify_agent_id,
        })
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    50
}

pub async fn list_runs(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let runs = orch(&state).list_runs(q.limit).map_err(map_err)?;
    Ok(Json(ApiResponse::success(json!({ "runs": runs }))))
}

pub async fn get_run(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).load_run(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn start_run(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).start_run(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn cancel_run(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).cancel_run(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn context_get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let pack = orch(&state).context_pack(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(pack)))
}

pub async fn tick_loop(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).tick_loop_fixture(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn step_graph(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).step_graph_fixture(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn spec_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<JudgmentSpecBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let (run, version) = orch(&state)
        .draft_spec_from_body(&id, body)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(json!({
        "run": run,
        "version": version,
    }))))
}

#[derive(Debug, Deserialize)]
pub struct SpecQuery {
    pub version: Option<i32>,
}

pub async fn spec_get(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<SpecQuery>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let spec = orch(&state).get_spec(&id, q.version).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(spec).unwrap_or_default(),
    )))
}

pub async fn spec_update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<JudgmentSpecBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    // Pre-lock edit = new draft version
    let (run, version) = orch(&state)
        .draft_spec_from_body(&id, body)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        json!({ "run": run, "version": version }),
    )))
}

#[derive(Debug, Deserialize)]
pub struct ConfirmBody {
    pub version: i32,
}

pub async fn spec_confirm(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ConfirmBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state)
        .confirm_spec(&id, body.version)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn write_mode_proposal(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ModeProposal>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    orch(&state)
        .write_mode_proposal(&id, &body)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(json!({ "ok": true }))))
}

#[derive(Debug, Deserialize)]
pub struct EvidenceBody {
    pub path: String,
    #[serde(default = "default_kind")]
    pub kind: String,
}

fn default_kind() -> String {
    "file".into()
}

pub async fn evidence_attach(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<EvidenceBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let meta = orch(&state)
        .attach_evidence(&id, &body.kind, PathBuf::from(&body.path).as_path())
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(meta)))
}

pub async fn evidence_list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).load_run(&id).map_err(map_err)?;
    let dir = PathBuf::from(&run.artifact_dir).join("evidence");
    let mut items = vec![];
    if dir.exists() {
        for e in std::fs::read_dir(&dir).map_err(|e| ApiError::InternalError(e.to_string()))? {
            let e = e.map_err(|e| ApiError::InternalError(e.to_string()))?;
            if e.path().extension().and_then(|x| x.to_str()) == Some("json") {
                if let Ok(v) = std::fs::read_to_string(e.path()) {
                    if let Ok(j) = serde_json::from_str::<Value>(&v) {
                        items.push(j);
                    }
                }
            }
        }
    }
    Ok(Json(ApiResponse::success(json!({ "evidence": items }))))
}

pub async fn graph_compile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CompiledGraph>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let g = orch(&state)
        .compile_run_graph(&id, &body)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(g).unwrap_or_default(),
    )))
}

pub async fn graph_get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).load_run(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(json!({ "graph": run.graph }))))
}

pub async fn workspace_get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).load_run(&id).map_err(map_err)?;
    let home = run.workspaces.iter().find(|w| w.kind == "home").cloned();
    Ok(Json(ApiResponse::success(json!({
        "home": home,
        "active_bindings": run.role_bindings,
        "home_cwd": run.home_cwd,
    }))))
}

pub async fn workspace_list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).load_run(&id).map_err(map_err)?;
    Ok(Json(ApiResponse::success(json!({
        "workspaces": run.workspaces
    }))))
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceCreateBody {
    pub purpose: String,
    pub path: Option<String>,
}

pub async fn workspace_create(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<WorkspaceCreateBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let ws = orch(&state)
        .workspace_create(&id, &body.purpose, body.path)
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(ws).unwrap_or_default(),
    )))
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceUseBody {
    pub workspace_guid: String,
    pub role: Option<String>,
    pub node_id: Option<String>,
}

pub async fn workspace_use(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<WorkspaceUseBody>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state)
        .workspace_use(
            &id,
            &body.workspace_guid,
            body.role.as_deref(),
            body.node_id.as_deref(),
        )
        .map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn workspace_merge(
    State(state): State<AppState>,
    Path((id, ws)): Path<(String, String)>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).workspace_merge(&id, &ws).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}

pub async fn workspace_abandon(
    State(state): State<AppState>,
    Path((id, ws)): Path<(String, String)>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let run = orch(&state).workspace_abandon(&id, &ws).map_err(map_err)?;
    Ok(Json(ApiResponse::success(
        serde_json::to_value(run).unwrap_or_default(),
    )))
}
