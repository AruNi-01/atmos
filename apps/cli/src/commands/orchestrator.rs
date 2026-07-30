//! `atmos orchestrator …` — APP-048 agent-facing surface.

use std::path::PathBuf;

use clap::{Args, Subcommand};
use serde_json::{json, Value};

use crate::api_client::{request_json, ApiClientArgs, DEFAULT_TIMEOUT_MS};
use reqwest::Method;
#[derive(Debug, Args)]
pub struct OrchestratorOpts {
    #[arg(long, default_value_t = DEFAULT_TIMEOUT_MS)]
    pub timeout_ms: u64,
}

#[derive(Debug, Subcommand)]
pub enum OrchestratorCommand {
    /// Print skill directory + prompt (local, no HTTP).
    SkillDir,
    /// Alias of skill-dir.
    SkillPath,
    Status,
    #[command(subcommand)]
    Run(RunCmd),
    #[command(subcommand)]
    Spec(SpecCmd),
    #[command(subcommand)]
    Evidence(EvidenceCmd),
    #[command(subcommand)]
    Graph(GraphCmd),
    #[command(subcommand)]
    Workspace(WorkspaceCmd),
    Context {
        #[arg(long)]
        run: String,
    },
    Agents,
    /// Fixture Loop tick (server-side sensors).
    Tick {
        #[arg(long)]
        run: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum RunCmd {
    Create {
        #[arg(long)]
        goal: String,
        #[arg(long, default_value = "loop")]
        mode: String,
        #[arg(long, default_value = "standalone")]
        target_kind: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        workspace: Option<String>,
        #[arg(long)]
        home_cwd: Option<String>,
    },
    List {
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    Get {
        #[arg(long)]
        run: String,
    },
    Start {
        #[arg(long)]
        run: String,
    },
    Cancel {
        #[arg(long)]
        run: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum SpecCmd {
    Draft {
        #[arg(long)]
        run: String,
        #[arg(long)]
        file: PathBuf,
    },
    Get {
        #[arg(long)]
        run: String,
        #[arg(long)]
        version: Option<i32>,
    },
    Confirm {
        #[arg(long)]
        run: String,
        #[arg(long)]
        version: i32,
    },
    Update {
        #[arg(long)]
        run: String,
        #[arg(long)]
        file: PathBuf,
    },
}

#[derive(Debug, Subcommand)]
pub enum EvidenceCmd {
    Attach {
        #[arg(long)]
        run: String,
        #[arg(long)]
        file: PathBuf,
        #[arg(long, default_value = "file")]
        kind: String,
    },
    List {
        #[arg(long)]
        run: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum GraphCmd {
    Compile {
        #[arg(long)]
        run: String,
        #[arg(long)]
        file: PathBuf,
    },
    Get {
        #[arg(long)]
        run: String,
    },
    Step {
        #[arg(long)]
        run: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum WorkspaceCmd {
    Get {
        #[arg(long)]
        run: String,
    },
    List {
        #[arg(long)]
        run: String,
    },
    Create {
        #[arg(long)]
        run: String,
        #[arg(long)]
        purpose: String,
        #[arg(long)]
        path: Option<String>,
    },
    Use {
        #[arg(long)]
        run: String,
        #[arg(long)]
        workspace: String,
        #[arg(long)]
        role: Option<String>,
        #[arg(long)]
        node: Option<String>,
    },
    Merge {
        #[arg(long)]
        run: String,
        #[arg(long)]
        workspace: String,
    },
    Abandon {
        #[arg(long)]
        run: String,
        #[arg(long)]
        workspace: String,
    },
}

pub async fn execute(
    api: ApiClientArgs,
    opts: OrchestratorOpts,
    command: OrchestratorCommand,
) -> Result<Value, String> {
    match command {
        OrchestratorCommand::SkillDir | OrchestratorCommand::SkillPath => Ok(local_skill_dir()),
        OrchestratorCommand::Status => {
            get(&api, opts.timeout_ms, "/api/orchestrator/v1/status").await
        }
        OrchestratorCommand::Agents => {
            get(&api, opts.timeout_ms, "/api/orchestrator/v1/agents").await
        }
        OrchestratorCommand::Context { run } => {
            get(
                &api,
                opts.timeout_ms,
                &format!("/api/orchestrator/v1/runs/{run}/context"),
            )
            .await
        }
        OrchestratorCommand::Tick { run } => {
            post(
                &api,
                opts.timeout_ms,
                &format!("/api/orchestrator/v1/runs/{run}/tick"),
                json!({}),
            )
            .await
        }
        OrchestratorCommand::Run(cmd) => match cmd {
            RunCmd::Create {
                goal,
                mode,
                target_kind,
                project,
                workspace,
                home_cwd,
            } => {
                post(
                    &api,
                    opts.timeout_ms,
                    "/api/orchestrator/v1/runs",
                    json!({
                        "goal": goal,
                        "requested_mode": mode,
                        "target_kind": target_kind,
                        "project_guid": project,
                        "workspace_guid": workspace,
                        "home_cwd": home_cwd,
                    }),
                )
                .await
            }
            RunCmd::List { limit } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs?limit={limit}"),
                )
                .await
            }
            RunCmd::Get { run } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}"),
                )
                .await
            }
            RunCmd::Start { run } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/start"),
                    json!({}),
                )
                .await
            }
            RunCmd::Cancel { run } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/cancel"),
                    json!({}),
                )
                .await
            }
        },
        OrchestratorCommand::Spec(cmd) => match cmd {
            SpecCmd::Draft { run, file } => {
                let body: Value = serde_json::from_str(
                    &std::fs::read_to_string(&file).map_err(|e| format!("read spec file: {e}"))?,
                )
                .map_err(|e| format!("parse spec json: {e}"))?;
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/spec/draft"),
                    body,
                )
                .await
            }
            SpecCmd::Get { run, version } => {
                let q = version.map(|v| format!("?version={v}")).unwrap_or_default();
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/spec{q}"),
                )
                .await
            }
            SpecCmd::Confirm { run, version } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/spec/confirm"),
                    json!({ "version": version }),
                )
                .await
            }
            SpecCmd::Update { run, file } => {
                let body: Value = serde_json::from_str(
                    &std::fs::read_to_string(&file).map_err(|e| format!("read spec file: {e}"))?,
                )
                .map_err(|e| format!("parse spec json: {e}"))?;
                patch(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/spec"),
                    body,
                )
                .await
            }
        },
        OrchestratorCommand::Evidence(cmd) => match cmd {
            EvidenceCmd::Attach { run, file, kind } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/evidence"),
                    json!({
                        "path": file.display().to_string(),
                        "kind": kind,
                    }),
                )
                .await
            }
            EvidenceCmd::List { run } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/evidence"),
                )
                .await
            }
        },
        OrchestratorCommand::Graph(cmd) => match cmd {
            GraphCmd::Compile { run, file } => {
                let body: Value = serde_json::from_str(
                    &std::fs::read_to_string(&file).map_err(|e| format!("read graph file: {e}"))?,
                )
                .map_err(|e| format!("parse graph: {e}"))?;
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/graph/compile"),
                    body,
                )
                .await
            }
            GraphCmd::Get { run } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/graph"),
                )
                .await
            }
            GraphCmd::Step { run } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/graph/step"),
                    json!({}),
                )
                .await
            }
        },
        OrchestratorCommand::Workspace(cmd) => match cmd {
            WorkspaceCmd::Get { run } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspace"),
                )
                .await
            }
            WorkspaceCmd::List { run } => {
                get(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspaces"),
                )
                .await
            }
            WorkspaceCmd::Create { run, purpose, path } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspaces"),
                    json!({ "purpose": purpose, "path": path }),
                )
                .await
            }
            WorkspaceCmd::Use {
                run,
                workspace,
                role,
                node,
            } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspace/use"),
                    json!({
                        "workspace_guid": workspace,
                        "role": role,
                        "node_id": node,
                    }),
                )
                .await
            }
            WorkspaceCmd::Merge { run, workspace } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspaces/{workspace}/merge"),
                    json!({}),
                )
                .await
            }
            WorkspaceCmd::Abandon { run, workspace } => {
                post(
                    &api,
                    opts.timeout_ms,
                    &format!("/api/orchestrator/v1/runs/{run}/workspaces/{workspace}/abandon"),
                    json!({}),
                )
                .await
            }
        },
    }
}

fn local_skill_dir() -> Value {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join("atmos-orchestrator");
    let dir_s = dir.display().to_string();
    let prompt = format!(
        "Read the Atmos Orchestrator skill in this directory and use `atmos orchestrator` to manage multi-step runs (Loop/Graph), Judgment Specs, and evidence. Do not invent completion without Spec + sensors.\n{dir_s}"
    );
    json!({
        "skill_dir": dir_s,
        "skill_md": format!("{dir_s}/SKILL.md"),
        "prompt": prompt,
    })
}

async fn get(api: &ApiClientArgs, _timeout_ms: u64, path: &str) -> Result<Value, String> {
    request_json(api, Method::GET, path, None, None).await
}

async fn post(
    api: &ApiClientArgs,
    _timeout_ms: u64,
    path: &str,
    body: Value,
) -> Result<Value, String> {
    request_json(api, Method::POST, path, None, Some(body)).await
}

async fn patch(
    api: &ApiClientArgs,
    _timeout_ms: u64,
    path: &str,
    body: Value,
) -> Result<Value, String> {
    request_json(api, Method::PATCH, path, None, Some(body)).await
}
