//! APP-058 typed L1 product commands (project, workspace, group, settings, terminal, run, git, context).

use std::collections::BTreeMap;
use std::path::PathBuf;

use clap::{Args, Subcommand};
use serde_json::{json, Value};

use crate::api_client::ApiClientArgs;
use crate::context::{self, CliContext};
use crate::envelope::{
    extract_id, next, next_with_params, param_required, param_value, truncate_list, CliEnvelope,
    NextAction,
};
use crate::rpc::{call_rpc, wrap_ok, RpcError};

fn cmd_str(parts: &[&str]) -> String {
    parts.join(" ")
}

fn require_yes(yes: bool, command: &str, what: &str) -> Result<(), CliEnvelope> {
    if yes {
        return Ok(());
    }
    Err(CliEnvelope::failure(
        command,
        "CONFIRMATION_REQUIRED",
        format!("Refusing to {what} without --yes"),
        format!("Re-run with --yes to confirm: {command} --yes"),
        vec![],
    ))
}

async fn rpc_env(
    api: &ApiClientArgs,
    command: &str,
    action: &str,
    data: Value,
    next_actions: Vec<NextAction>,
) -> CliEnvelope {
    match call_rpc(api, action, data).await {
        Ok(result) => wrap_ok(command, result, next_actions),
        Err(e) => e.to_envelope(command),
    }
}

// ─── context ───────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum ContextCommand {
    /// Show sticky project/workspace context
    Get,
    /// Set sticky project and/or workspace ids
    Set(ContextSetArgs),
    /// Clear sticky context
    Clear,
}

#[derive(Debug, Args)]
pub struct ContextSetArgs {
    #[arg(long)]
    pub project: Option<String>,
    #[arg(long)]
    pub workspace: Option<String>,
}

pub fn execute_context(command: ContextCommand) -> CliEnvelope {
    match command {
        ContextCommand::Get => {
            let ctx = context::load();
            wrap_ok(
                "atmos context get",
                json!(ctx),
                vec![next(
                    "atmos context set --project <id> [--workspace <id>]",
                    "Update sticky context",
                )],
            )
        }
        ContextCommand::Set(args) => {
            let mut ctx = context::load();
            if let Some(p) = args.project {
                ctx.project_id = Some(p);
            }
            if let Some(w) = args.workspace {
                ctx.workspace_id = Some(w);
            }
            match context::save(&ctx) {
                Ok(()) => wrap_ok(
                    "atmos context set",
                    json!(ctx),
                    vec![next("atmos context get", "Show context")],
                ),
                Err(e) => CliEnvelope::failure(
                    "atmos context set",
                    "CLI_ERROR",
                    e,
                    "Ensure ~/.atmos is writable",
                    vec![],
                ),
            }
        }
        ContextCommand::Clear => match context::clear() {
            Ok(()) => wrap_ok("atmos context clear", json!(CliContext::default()), vec![]),
            Err(e) => CliEnvelope::failure(
                "atmos context clear",
                "CLI_ERROR",
                e,
                "Ensure ~/.atmos is writable",
                vec![],
            ),
        },
    }
}

// ─── project ───────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum ProjectCommand {
    List,
    Create(ProjectCreateArgs),
    Update(ProjectUpdateArgs),
    Delete(ProjectDeleteArgs),
    #[command(name = "validate-path")]
    ValidatePath(ProjectValidateArgs),
    #[command(name = "check-can-delete")]
    CheckCanDelete(ProjectIdArgs),
}

#[derive(Debug, Args)]
pub struct ProjectCreateArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub path: PathBuf,
    #[arg(long, default_value_t = 0)]
    pub order: i32,
}

#[derive(Debug, Args)]
pub struct ProjectUpdateArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long)]
    pub name: Option<String>,
    #[arg(long)]
    pub order: Option<i32>,
}

#[derive(Debug, Args)]
pub struct ProjectDeleteArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long, default_value_t = false)]
    pub yes: bool,
}

#[derive(Debug, Args)]
pub struct ProjectValidateArgs {
    #[arg(long)]
    pub path: PathBuf,
}

#[derive(Debug, Args)]
pub struct ProjectIdArgs {
    #[arg(long)]
    pub id: String,
}

pub async fn execute_project(api: ApiClientArgs, command: ProjectCommand) -> CliEnvelope {
    match command {
        ProjectCommand::List => {
            let env = rpc_env(
                &api,
                "atmos project list",
                "project_list",
                json!({}),
                vec![next(
                    "atmos project create --name <name> --path <path>",
                    "Create a project",
                )],
            )
            .await;
            if env.ok {
                if let Some(result) = &env.result {
                    let items = result
                        .as_array()
                        .cloned()
                        .unwrap_or_else(|| vec![result.clone()]);
                    return wrap_ok(
                        "atmos project list",
                        truncate_list(items, 50),
                        vec![next(
                            "atmos project create --name <name> --path <path>",
                            "Create a project",
                        )],
                    );
                }
            }
            env
        }
        ProjectCommand::Create(args) => {
            let path = args.path.expand_and_string();
            let command = format!("atmos project create --name {} --path {}", args.name, path);
            match call_rpc(
                &api,
                "project_create",
                json!({
                    "name": args.name,
                    "main_file_path": path,
                    "sidebar_order": args.order,
                }),
            )
            .await
            {
                Ok(result) => {
                    let id = extract_id(&result, &["guid", "id"]).unwrap_or_default();
                    let mut params = BTreeMap::new();
                    if !id.is_empty() {
                        params.insert(
                            "project-id".into(),
                            param_value(json!(id), "Project guid", true),
                        );
                    }
                    params.insert("name".into(), param_required("Workspace name"));
                    wrap_ok(
                        &command,
                        result,
                        vec![next_with_params(
                            "atmos workspace create --project <project-id> --name <name> --branch <branch>",
                            "Create a workspace in this project",
                            params,
                        )],
                    )
                }
                Err(e) => e.to_envelope(&command),
            }
        }
        ProjectCommand::Update(args) => {
            let command = format!("atmos project update --id {}", args.id);
            if args.name.is_none() && args.order.is_none() {
                return CliEnvelope::failure(
                    &command,
                    "INVALID_ARGUMENT",
                    "provide --name and/or --order",
                    "Example: atmos project update --id <guid> --name new-name",
                    vec![next("atmos project list", "List projects")],
                );
            }
            // project_update applies name, sidebar_order, color, logo (server-side).
            rpc_env(
                &api,
                &command,
                "project_update",
                json!({
                    "guid": args.id,
                    "name": args.name,
                    "sidebar_order": args.order,
                }),
                vec![next("atmos project list", "List projects")],
            )
            .await
        }
        ProjectCommand::Delete(args) => {
            let command = format!("atmos project delete --id {}", args.id);
            if let Err(env) = require_yes(args.yes, &command, "delete project") {
                return env;
            }
            rpc_env(
                &api,
                &format!("{command} --yes"),
                "project_delete",
                json!({ "guid": args.id }),
                vec![next("atmos project list", "List remaining projects")],
            )
            .await
        }
        ProjectCommand::ValidatePath(args) => {
            let path = args.path.expand_and_string();
            let command = format!("atmos project validate-path --path {path}");
            rpc_env(
                &api,
                &command,
                "project_validate_path",
                json!({ "path": path }),
                vec![next(
                    "atmos project create --name <name> --path <path>",
                    "Create project if path is valid",
                )],
            )
            .await
        }
        ProjectCommand::CheckCanDelete(args) => {
            let command = format!("atmos project check-can-delete --id {}", args.id);
            rpc_env(
                &api,
                &command,
                "project_check_can_delete",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
    }
}

// ─── workspace ─────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum WorkspaceCommand {
    List(WorkspaceListArgs),
    Create(WorkspaceCreateArgs),
    #[command(name = "update-name")]
    UpdateName(WorkspaceUpdateNameArgs),
    Delete(WorkspaceDeleteArgs),
    Archive(WorkspaceIdArgs),
    Unarchive(WorkspaceIdArgs),
    Pin(WorkspaceIdArgs),
    Unpin(WorkspaceIdArgs),
}

#[derive(Debug, Args)]
pub struct WorkspaceListArgs {
    #[arg(long)]
    pub project: Option<String>,
}

#[derive(Debug, Args)]
pub struct WorkspaceCreateArgs {
    #[arg(long)]
    pub project: Option<String>,
    #[arg(long)]
    pub name: String,
    #[arg(long, default_value = "main")]
    pub branch: String,
    #[arg(long)]
    pub base_branch: Option<String>,
}

#[derive(Debug, Args)]
pub struct WorkspaceUpdateNameArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct WorkspaceDeleteArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long, default_value_t = false)]
    pub yes: bool,
}

#[derive(Debug, Args)]
pub struct WorkspaceIdArgs {
    #[arg(long)]
    pub id: String,
}

pub async fn execute_workspace(api: ApiClientArgs, command: WorkspaceCommand) -> CliEnvelope {
    match command {
        WorkspaceCommand::List(args) => {
            let Some(project) = context::resolve_project(args.project.as_deref()) else {
                return CliEnvelope::failure(
                    "atmos workspace list",
                    "CONTEXT_REQUIRED",
                    "project id required",
                    "Pass --project <id> or run: atmos context set --project <id>",
                    vec![next(
                        "atmos context set --project <id>",
                        "Set sticky project context",
                    )],
                );
            };
            let command = format!("atmos workspace list --project {project}");
            match call_rpc(&api, "workspace_list", json!({ "project_guid": project })).await {
                Ok(result) => {
                    let items = result
                        .as_array()
                        .cloned()
                        .unwrap_or_else(|| vec![result.clone()]);
                    wrap_ok(
                        &command,
                        truncate_list(items, 50),
                        vec![next(
                            "atmos workspace create --project <id> --name <name>",
                            "Create workspace",
                        )],
                    )
                }
                Err(e) => e.to_envelope(&command),
            }
        }
        WorkspaceCommand::Create(args) => {
            let Some(project) = context::resolve_project(args.project.as_deref()) else {
                return CliEnvelope::failure(
                    "atmos workspace create",
                    "CONTEXT_REQUIRED",
                    "project id required",
                    "Pass --project <id>",
                    vec![],
                );
            };
            let command = format!(
                "atmos workspace create --project {project} --name {} --branch {}",
                args.name, args.branch
            );
            match call_rpc(
                &api,
                "workspace_create",
                json!({
                    "project_guid": project,
                    "name": args.name,
                    "branch": args.branch,
                    "base_branch": args.base_branch,
                }),
            )
            .await
            {
                Ok(result) => {
                    let id = extract_id(&result, &["guid", "id"])
                        .or_else(|| {
                            result
                                .pointer("/model/guid")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .unwrap_or_default();
                    let mut params = BTreeMap::new();
                    if !id.is_empty() {
                        params.insert(
                            "workspace-id".into(),
                            param_value(json!(id), "Workspace guid", true),
                        );
                    }
                    wrap_ok(
                        &command,
                        result,
                        vec![next_with_params(
                            "atmos terminal create --workspace <workspace-id>",
                            "Create a terminal in this workspace",
                            params,
                        )],
                    )
                }
                Err(e) => e.to_envelope(&command),
            }
        }
        WorkspaceCommand::UpdateName(args) => {
            let command = format!(
                "atmos workspace update-name --id {} --name {}",
                args.id, args.name
            );
            rpc_env(
                &api,
                &command,
                "workspace_update_name",
                json!({ "guid": args.id, "name": args.name }),
                vec![],
            )
            .await
        }
        WorkspaceCommand::Delete(args) => {
            let command = format!("atmos workspace delete --id {}", args.id);
            if let Err(env) = require_yes(args.yes, &command, "delete workspace") {
                return env;
            }
            rpc_env(
                &api,
                &format!("{command} --yes"),
                "workspace_delete",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
        WorkspaceCommand::Archive(args) => {
            rpc_env(
                &api,
                &format!("atmos workspace archive --id {}", args.id),
                "workspace_archive",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
        WorkspaceCommand::Unarchive(args) => {
            rpc_env(
                &api,
                &format!("atmos workspace unarchive --id {}", args.id),
                "workspace_unarchive",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
        WorkspaceCommand::Pin(args) => {
            rpc_env(
                &api,
                &format!("atmos workspace pin --id {}", args.id),
                "workspace_pin",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
        WorkspaceCommand::Unpin(args) => {
            rpc_env(
                &api,
                &format!("atmos workspace unpin --id {}", args.id),
                "workspace_unpin",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
    }
}

// ─── group ─────────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum GroupCommand {
    List,
    Create(GroupCreateArgs),
    Update(GroupUpdateArgs),
    Delete(GroupDeleteArgs),
}

#[derive(Debug, Args)]
pub struct GroupCreateArgs {
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct GroupUpdateArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct GroupDeleteArgs {
    #[arg(long)]
    pub id: String,
    #[arg(long, default_value_t = false)]
    pub yes: bool,
}

pub async fn execute_group(api: ApiClientArgs, command: GroupCommand) -> CliEnvelope {
    match command {
        GroupCommand::List => {
            rpc_env(
                &api,
                "atmos group list",
                "group_list",
                json!({}),
                vec![next("atmos group create --name <name>", "Create a group")],
            )
            .await
        }
        GroupCommand::Create(args) => {
            rpc_env(
                &api,
                &format!("atmos group create --name {}", args.name),
                "group_create",
                json!({ "name": args.name }),
                vec![],
            )
            .await
        }
        GroupCommand::Update(args) => {
            rpc_env(
                &api,
                &format!("atmos group update --id {} --name {}", args.id, args.name),
                "group_update",
                json!({ "guid": args.id, "name": args.name }),
                vec![],
            )
            .await
        }
        GroupCommand::Delete(args) => {
            let command = format!("atmos group delete --id {}", args.id);
            if let Err(env) = require_yes(args.yes, &command, "delete group") {
                return env;
            }
            rpc_env(
                &api,
                &format!("{command} --yes"),
                "group_delete",
                json!({ "guid": args.id }),
                vec![],
            )
            .await
        }
    }
}

// ─── settings ──────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum SettingsCommand {
    Bootstrap,
    Get(SettingsGetArgs),
    Set(SettingsSetArgs),
}

#[derive(Debug, Args)]
pub struct SettingsGetArgs {
    /// Scope: function (default)
    #[arg(long, default_value = "function")]
    pub scope: String,
}

#[derive(Debug, Args)]
pub struct SettingsSetArgs {
    #[arg(long)]
    pub function: String,
    #[arg(long)]
    pub key: String,
    /// JSON value (string, number, bool, or object)
    #[arg(long)]
    pub value: String,
}

pub async fn execute_settings(api: ApiClientArgs, command: SettingsCommand) -> CliEnvelope {
    match command {
        SettingsCommand::Bootstrap => {
            rpc_env(
                &api,
                "atmos settings bootstrap",
                "settings_bootstrap_get",
                json!({}),
                vec![next("atmos settings get", "Get function settings")],
            )
            .await
        }
        SettingsCommand::Get(_args) => {
            rpc_env(
                &api,
                "atmos settings get",
                "function_settings_get",
                json!({}),
                vec![],
            )
            .await
        }
        SettingsCommand::Set(args) => {
            let value: Value = serde_json::from_str(&args.value)
                .unwrap_or_else(|_| Value::String(args.value.clone()));
            let command = format!(
                "atmos settings set --function {} --key {} --value {}",
                args.function, args.key, args.value
            );
            rpc_env(
                &api,
                &command,
                "function_settings_update",
                json!({
                    "function_name": args.function,
                    "key": args.key,
                    "value": value,
                }),
                vec![next("atmos settings get", "Confirm settings")],
            )
            .await
        }
    }
}

// ─── terminal ──────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum TerminalCommand {
    List(TerminalListArgs),
    Create(TerminalCreateArgs),
    Close(TerminalSessionArgs),
    Destroy(TerminalDestroyArgs),
    Candidates(TerminalCandidatesArgs),
}

#[derive(Debug, Args)]
pub struct TerminalListArgs {
    #[arg(long)]
    pub workspace: Option<String>,
}

#[derive(Debug, Args)]
pub struct TerminalCreateArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
    #[arg(long)]
    pub cwd: Option<String>,
    #[arg(long)]
    pub shell: Option<String>,
}

#[derive(Debug, Args)]
pub struct TerminalSessionArgs {
    #[arg(long)]
    pub session: String,
}

#[derive(Debug, Args)]
pub struct TerminalDestroyArgs {
    #[arg(long)]
    pub session: String,
    #[arg(long, default_value_t = false)]
    pub yes: bool,
}

#[derive(Debug, Args)]
pub struct TerminalCandidatesArgs {
    #[arg(long)]
    pub workspace: Option<String>,
}

pub async fn execute_terminal(api: ApiClientArgs, command: TerminalCommand) -> CliEnvelope {
    match command {
        TerminalCommand::List(args) => {
            let mut data = json!({});
            if let Some(ws) = context::resolve_workspace(args.workspace.as_deref()) {
                data = json!({ "workspace_id": ws });
            }
            rpc_env(
                &api,
                "atmos terminal list",
                "terminal_session_list",
                data,
                vec![next(
                    "atmos terminal create --workspace <id>",
                    "Create a terminal",
                )],
            )
            .await
        }
        TerminalCommand::Create(args) => {
            let Some(ws) = context::resolve_workspace(args.workspace.as_deref()) else {
                return CliEnvelope::failure(
                    "atmos terminal create",
                    "CONTEXT_REQUIRED",
                    "workspace id required",
                    "Pass --workspace <id> or set context",
                    vec![],
                );
            };
            let command = format!("atmos terminal create --workspace {ws}");
            match call_rpc(
                &api,
                "terminal_session_create",
                json!({
                    "workspace_id": ws,
                    "name": args.name,
                    "cwd": args.cwd,
                    "shell": args.shell,
                    "detach_after_create": true,
                }),
            )
            .await
            {
                Ok(result) => {
                    let mut params = BTreeMap::new();
                    if let Some(sid) = extract_id(&result, &["session_id"]) {
                        params.insert(
                            "session".into(),
                            param_value(json!(sid), "Session id", true),
                        );
                    }
                    wrap_ok(
                        &command,
                        result,
                        vec![
                            next_with_params(
                                "atmos terminal close --session <session>",
                                "Detach terminal session",
                                params,
                            ),
                            next(
                                "atmos run resolve-latest --project-root <path>",
                                "Resolve run logs",
                            ),
                        ],
                    )
                }
                Err(e) => e.to_envelope(&command),
            }
        }
        TerminalCommand::Close(args) => {
            rpc_env(
                &api,
                &format!("atmos terminal close --session {}", args.session),
                "terminal_session_close",
                json!({ "session_id": args.session }),
                vec![],
            )
            .await
        }
        TerminalCommand::Destroy(args) => {
            let command = format!("atmos terminal destroy --session {}", args.session);
            if let Err(env) = require_yes(args.yes, &command, "destroy terminal") {
                return env;
            }
            rpc_env(
                &api,
                &format!("{command} --yes"),
                "terminal_session_destroy",
                json!({ "session_id": args.session }),
                vec![],
            )
            .await
        }
        TerminalCommand::Candidates(args) => {
            let Some(ws) = context::resolve_workspace(args.workspace.as_deref()) else {
                return CliEnvelope::failure(
                    "atmos terminal candidates",
                    "CONTEXT_REQUIRED",
                    "workspace id required",
                    "Pass --workspace <id>",
                    vec![],
                );
            };
            rpc_env(
                &api,
                &format!("atmos terminal candidates --workspace {ws}"),
                "terminal_workspace_candidates",
                json!({ "workspace_id": ws }),
                vec![],
            )
            .await
        }
    }
}

// ─── run ───────────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum RunCommand {
    #[command(name = "resolve-latest")]
    ResolveLatest(RunResolveArgs),
    Start(RunStartArgs),
    Status(RunResolveArgs),
    Logs(RunResolveArgs),
}

#[derive(Debug, Args)]
pub struct RunResolveArgs {
    #[arg(long)]
    pub project_root: PathBuf,
    #[arg(long)]
    pub window_name: Option<String>,
}

#[derive(Debug, Args)]
pub struct RunStartArgs {
    #[arg(long)]
    pub project_root: PathBuf,
    #[arg(long)]
    pub window_name: String,
    #[arg(long)]
    pub command: Option<String>,
}

pub async fn execute_run(api: ApiClientArgs, command: RunCommand) -> CliEnvelope {
    match command {
        RunCommand::ResolveLatest(args) | RunCommand::Status(args) | RunCommand::Logs(args) => {
            let root = args.project_root.expand_and_string();
            let command = format!("atmos run resolve-latest --project-root {root}");
            match call_rpc(
                &api,
                "run_log_resolve_latest",
                json!({ "project_root": root }),
            )
            .await
            {
                Ok(result) => {
                    // Optionally read a small tail of the log file for point-in-time logs.
                    let mut out = result.clone();
                    if let Some(path) = result.get("latest_path").and_then(|v| v.as_str()) {
                        if let Ok(content) = std::fs::read_to_string(path) {
                            let lines: Vec<&str> = content.lines().collect();
                            let total = lines.len();
                            let start = total.saturating_sub(40);
                            let tail: Vec<String> =
                                lines[start..].iter().map(|s| s.to_string()).collect();
                            out = json!({
                                "latest_path": path,
                                "lines": tail,
                                "total_lines": total,
                                "truncated": total > 40,
                            });
                        }
                    }
                    wrap_ok(&command, out, vec![])
                }
                Err(e) => e.to_envelope(&command),
            }
        }
        RunCommand::Start(args) => {
            let root = args.project_root.expand_and_string();
            let command = format!(
                "atmos run start --project-root {root} --window-name {}",
                args.window_name
            );
            rpc_env(
                &api,
                &command,
                "run_log_start",
                json!({
                    "project_root": root,
                    "window_name": args.window_name,
                    "command": args.command,
                }),
                vec![next(
                    &format!("atmos run logs --project-root {root}"),
                    "Read run logs",
                )],
            )
            .await
        }
    }
}

// ─── git ───────────────────────────────────────────────────────────────────

#[derive(Debug, Subcommand)]
pub enum GitCommand {
    Status(GitPathArgs),
    Branches(GitPathArgs),
    Log(GitLogArgs),
    Stage(GitFilesArgs),
    Unstage(GitFilesArgs),
    Commit(GitCommitArgs),
    Push(GitPathArgs),
    Pull(GitPathArgs),
    Fetch(GitPathArgs),
}

#[derive(Debug, Args)]
pub struct GitPathArgs {
    #[arg(long)]
    pub path: PathBuf,
}

#[derive(Debug, Args)]
pub struct GitLogArgs {
    #[arg(long)]
    pub path: PathBuf,
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
}

#[derive(Debug, Args)]
pub struct GitFilesArgs {
    #[arg(long)]
    pub path: PathBuf,
    #[arg(long)]
    pub files: Vec<String>,
}

#[derive(Debug, Args)]
pub struct GitCommitArgs {
    #[arg(long)]
    pub path: PathBuf,
    #[arg(long)]
    pub message: String,
}

pub async fn execute_git(api: ApiClientArgs, command: GitCommand) -> CliEnvelope {
    match command {
        GitCommand::Status(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                &format!("atmos git status --path {path}"),
                "git_get_status",
                json!({ "path": path }),
                vec![],
            )
            .await
        }
        GitCommand::Branches(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                &format!("atmos git branches --path {path}"),
                "git_list_branches",
                json!({ "path": path }),
                vec![],
            )
            .await
        }
        GitCommand::Log(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                &format!("atmos git log --path {path}"),
                "git_log",
                json!({ "path": path, "limit": args.limit }),
                vec![],
            )
            .await
        }
        GitCommand::Stage(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git stage",
                "git_stage",
                json!({ "path": path, "files": args.files }),
                vec![],
            )
            .await
        }
        GitCommand::Unstage(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git unstage",
                "git_unstage",
                json!({ "path": path, "files": args.files }),
                vec![],
            )
            .await
        }
        GitCommand::Commit(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git commit",
                "git_commit",
                json!({ "path": path, "message": args.message }),
                vec![],
            )
            .await
        }
        GitCommand::Push(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git push",
                "git_push",
                json!({ "path": path }),
                vec![],
            )
            .await
        }
        GitCommand::Pull(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git pull",
                "git_pull",
                json!({ "path": path }),
                vec![],
            )
            .await
        }
        GitCommand::Fetch(args) => {
            let path = args.path.expand_and_string();
            rpc_env(
                &api,
                "atmos git fetch",
                "git_fetch",
                json!({ "path": path }),
                vec![],
            )
            .await
        }
    }
}

// ─── call / actions / status / discovery ───────────────────────────────────

#[derive(Debug, Args)]
pub struct CallArgs {
    pub action: String,
    #[arg(long)]
    pub data: Option<String>,
    #[arg(long)]
    pub file: Option<PathBuf>,
}

pub async fn execute_call(api: ApiClientArgs, args: CallArgs) -> CliEnvelope {
    let command = format!("atmos call {}", args.action);
    let data = match parse_data_input(args.data.as_deref(), args.file.as_ref()) {
        Ok(v) => v,
        Err(e) => {
            return CliEnvelope::failure(
                &command,
                "INVALID_ARGUMENT",
                e,
                "Pass valid JSON via --data or --file",
                vec![],
            );
        }
    };
    match call_rpc(&api, &args.action, data).await {
        Ok(result) => wrap_ok(
            &command,
            result,
            vec![
                next("atmos actions list", "List available wire actions"),
                next("atmos status", "Check server health"),
            ],
        ),
        Err(e) => e.to_envelope(&command),
    }
}

#[derive(Debug, Args)]
pub struct ActionsListArgs {
    #[arg(long)]
    pub filter: Option<String>,
}

pub async fn execute_actions_list(api: ApiClientArgs, args: ActionsListArgs) -> CliEnvelope {
    let mut path = "/api/cli/actions".to_string();
    if let Some(f) = &args.filter {
        path = format!("/api/cli/actions?filter={}", urlencoding::encode(f));
    }
    match crate::rpc::get_json(&api, &path).await {
        Ok(result) => wrap_ok(
            "atmos actions list",
            result,
            vec![next(
                "atmos call <action> --data '{}'",
                "Invoke a wire action (escape hatch)",
            )],
        ),
        Err(e) => e.to_envelope("atmos actions list"),
    }
}

pub async fn execute_status(api: ApiClientArgs) -> CliEnvelope {
    match crate::rpc::get_json(&api, "/api/cli/health").await {
        Ok(result) => wrap_ok(
            "atmos status",
            result,
            vec![
                next("atmos project list", "List projects"),
                next("atmos", "Show command tree"),
            ],
        ),
        Err(e) => e.to_envelope("atmos status"),
    }
}

pub fn discovery_tree(health: Option<Value>) -> CliEnvelope {
    let commands = vec![
        json!({"name": "status", "description": "Server health", "usage": "atmos status"}),
        json!({"name": "context", "description": "Sticky project/workspace context", "usage": "atmos context get|set|clear"}),
        json!({"name": "project", "description": "Manage projects", "usage": "atmos project <list|create|…>"}),
        json!({"name": "workspace", "description": "Manage workspaces", "usage": "atmos workspace <list|create|…>"}),
        json!({"name": "group", "description": "Manage groups", "usage": "atmos group <list|create|…>"}),
        json!({"name": "settings", "description": "Read/update settings", "usage": "atmos settings <bootstrap|get|set>"}),
        json!({"name": "terminal", "description": "Terminal sessions", "usage": "atmos terminal <list|create|…>"}),
        json!({"name": "run", "description": "Run logs", "usage": "atmos run <start|logs|…>"}),
        json!({"name": "git", "description": "Git operations via Atmos Server", "usage": "atmos git <status|…>"}),
        json!({"name": "call", "description": "Escape hatch: invoke wire action", "usage": "atmos call <action> --data '{}'"}),
        json!({"name": "actions", "description": "List wire actions", "usage": "atmos actions list"}),
        json!({"name": "runtime", "description": "Local Atmos Server lifecycle", "usage": "atmos runtime ensure|stop|status"}),
        json!({"name": "computer", "description": "Relay computer registration", "usage": "atmos computer start|status"}),
        json!({"name": "review", "description": "Code review sessions", "usage": "atmos review …"}),
        json!({"name": "canvas", "description": "Canvas agent control", "usage": "atmos canvas …"}),
        json!({"name": "desktop-use", "description": "Local desktop capture/control", "usage": "atmos desktop-use …"}),
        json!({"name": "browser-use", "description": "Browser page control", "usage": "atmos browser-use …"}),
        json!({"name": "update", "description": "CLI self-update", "usage": "atmos update"}),
    ];
    wrap_ok(
        "atmos",
        json!({
            "description": "Atmos CLI — agent-first product and host control",
            "version": env!("CARGO_PKG_VERSION"),
            "health": health.unwrap_or(json!({"server": "unknown"})),
            "commands": commands,
        }),
        vec![
            next("atmos status", "Check Atmos Server health"),
            next("atmos project list", "List projects"),
        ],
    )
}

fn parse_data_input(data: Option<&str>, file: Option<&PathBuf>) -> Result<Value, String> {
    if let Some(path) = file {
        let raw = std::fs::read_to_string(path).map_err(|e| format!("read --file: {e}"))?;
        return serde_json::from_str(&raw).map_err(|e| format!("parse --file json: {e}"));
    }
    if let Some(raw) = data {
        return serde_json::from_str(raw).map_err(|e| format!("parse --data json: {e}"));
    }
    Ok(json!({}))
}

trait ExpandPath {
    fn expand_and_string(&self) -> String;
}

impl ExpandPath for PathBuf {
    fn expand_and_string(&self) -> String {
        let s = self.to_string_lossy();
        if let Some(rest) = s.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(rest).to_string_lossy().to_string();
            }
        }
        // Prefer absolute if possible
        std::fs::canonicalize(self)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| s.to_string())
    }
}

// silence unused import warning for RpcError if only used via methods
#[allow(dead_code)]
fn _rpc_error_typecheck(_: RpcError) {}

#[allow(dead_code)]
fn _cmd_str_use() {
    let _ = cmd_str(&["atmos", "status"]);
}
