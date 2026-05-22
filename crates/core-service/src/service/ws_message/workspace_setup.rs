use std::ffi::CStr;
use std::io::Read;
use std::time::Duration;

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde_json::{Value, json};

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum WorkspaceSetupStep {
    CreateWorktree,
    WriteRequirement,
    ExtractTodos,
    RunSetupScript,
    Ready,
}

impl WorkspaceSetupStep {
    pub(super) fn key(self) -> &'static str {
        match self {
            Self::CreateWorktree => "create_worktree",
            Self::WriteRequirement => "write_requirement",
            Self::ExtractTodos => "extract_todos",
            Self::RunSetupScript => "run_setup_script",
            Self::Ready => "ready",
        }
    }

    pub(super) fn from_key(value: &str) -> Option<Self> {
        match value {
            "create_worktree" => Some(Self::CreateWorktree),
            "write_requirement" => Some(Self::WriteRequirement),
            "extract_todos" => Some(Self::ExtractTodos),
            "run_setup_script" => Some(Self::RunSetupScript),
            "ready" => Some(Self::Ready),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct WorkspaceSetupPlan {
    pub(super) steps: Vec<WorkspaceSetupStep>,
    context: WorkspaceSetupContextNotification,
    requirement_step_title: String,
    project_main_file_path: String,
    setup_script: Option<String>,
}

impl WsMessageService {
    #[cfg(unix)]
    fn detect_login_shell_from_system() -> Option<String> {
        let uid = unsafe { libc::geteuid() };
        let mut pwd = std::mem::MaybeUninit::<libc::passwd>::uninit();
        let mut result = std::ptr::null_mut();
        let mut buf = vec![0u8; 4096];

        loop {
            let rc = unsafe {
                libc::getpwuid_r(
                    uid,
                    pwd.as_mut_ptr(),
                    buf.as_mut_ptr().cast(),
                    buf.len(),
                    &mut result,
                )
            };

            if rc == 0 {
                if result.is_null() {
                    return None;
                }

                let pwd = unsafe { pwd.assume_init() };
                if pwd.pw_shell.is_null() {
                    return None;
                }

                let shell = unsafe { CStr::from_ptr(pwd.pw_shell) }
                    .to_string_lossy()
                    .trim()
                    .to_string();

                return (!shell.is_empty()).then_some(shell);
            }

            if rc == libc::ERANGE {
                buf.resize(buf.len() * 2, 0);
                continue;
            }

            return None;
        }
    }

    #[cfg(not(unix))]
    fn detect_login_shell_from_system() -> Option<String> {
        None
    }

    pub(super) async fn build_workspace_setup_plan(
        project_service: &Arc<ProjectService>,
        project_guid: &str,
        _initial_requirement: Option<&str>,
        github_issue: Option<&GithubIssuePayload>,
        has_github_pr: bool,
        auto_extract_todos: bool,
    ) -> Option<WorkspaceSetupPlan> {
        let project = project_service
            .get_project(project_guid.to_string())
            .await
            .ok()
            .flatten()?;

        let has_requirement_step = github_issue.is_some();

        let project_root = std::path::Path::new(&project.main_file_path);
        let scripts_path = project_root.join(".atmos/scripts/atmos.json");
        let setup_script = if scripts_path.exists() {
            std::fs::read_to_string(&scripts_path)
                .ok()
                .and_then(|content| serde_json::from_str::<Value>(&content).ok())
                .and_then(|json| {
                    json["setup"]
                        .as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned)
                })
        } else {
            None
        };

        // NOTE: WriteRequirement is intentionally NOT pushed into the plan.
        // The composer pre-fills .atmos/context/requirement.md synchronously
        // during workspace creation, so the setup flow surfaces no separate
        // "Fill Requirement Spec" step.
        let mut steps = vec![WorkspaceSetupStep::CreateWorktree];
        if auto_extract_todos {
            steps.push(WorkspaceSetupStep::ExtractTodos);
        }
        if setup_script.is_some() {
            steps.push(WorkspaceSetupStep::RunSetupScript);
        }
        steps.push(WorkspaceSetupStep::Ready);

        Some(WorkspaceSetupPlan {
            steps,
            context: WorkspaceSetupContextNotification {
                has_github_issue: github_issue.is_some() && !has_github_pr,
                has_github_pr,
                has_requirement_step,
                auto_extract_todos,
                has_setup_script: setup_script.is_some(),
            },
            requirement_step_title: if has_github_pr {
                "Filling PR Specification".to_string()
            } else if github_issue.is_some() {
                "Filling Issue Specification".to_string()
            } else {
                "Writing Requirement Specification".to_string()
            },
            project_main_file_path: project.main_file_path,
            setup_script,
        })
    }

    async fn send_setup_failure(
        manager: &Arc<infra::WsManager>,
        conn_id: &str,
        workspace_id: &str,
        plan: &WorkspaceSetupPlan,
        step: WorkspaceSetupStep,
        step_title: &str,
        output: String,
        replace_output: bool,
    ) {
        Self::send_workspace_setup_progress(
            manager,
            conn_id,
            WorkspaceSetupProgressNotification {
                workspace_id: workspace_id.to_string(),
                status: "error".to_string(),
                step_key: Some(step.key().to_string()),
                failed_step_key: Some(step.key().to_string()),
                step_title: step_title.to_string(),
                output: Some(output),
                replace_output,
                requires_confirmation: false,
                success: false,
                countdown: None,
                setup_context: Some(plan.context.clone()),
            },
        )
        .await;
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) async fn execute_setup_state_machine(
        manager: Arc<infra::WsManager>,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        conn_id: String,
        project_guid: String,
        workspace_id: String,
        workspace_name: String,
        initial_requirement: Option<String>,
        github_issue: Option<GithubIssuePayload>,
        has_github_pr: bool,
        auto_extract_todos: bool,
        start_step: Option<WorkspaceSetupStep>,
        cached_plan: Option<WorkspaceSetupPlan>,
    ) {
        let plan = if let Some(p) = cached_plan {
            p
        } else {
            let Some(plan) = Self::build_workspace_setup_plan(
                &project_service,
                &project_guid,
                initial_requirement.as_deref(),
                github_issue.as_ref(),
                has_github_pr,
                auto_extract_todos,
            )
            .await
            else {
                tracing::error!(
                    "[execute_setup_state_machine] Failed to build setup plan for workspace {}",
                    workspace_id
                );
                let message = WsMessage::notification(
                    WsEvent::WorkspaceSetupProgress,
                    json!(WorkspaceSetupProgressNotification {
                        workspace_id: workspace_id.clone(),
                        status: "error".to_string(),
                        step_key: Some("create_worktree".to_string()),
                        failed_step_key: Some("create_worktree".to_string()),
                        step_title: "Workspace Setup Failed".to_string(),
                        output: Some(
                            "\r\n\x1b[31mFailed to initialize workspace setup: could not load project configuration.\x1b[0m\r\n"
                                .to_string()
                        ),
                        replace_output: true,
                        requires_confirmation: false,
                        success: false,
                        countdown: None,
                        setup_context: None,
                    }),
                );
                let _ = manager.broadcast(&message).await;
                return;
            };
            plan
        };

        let start_index = match start_step {
            Some(step) => match plan.steps.iter().position(|candidate| *candidate == step) {
                Some(index) => index,
                None => {
                    tracing::error!(
                        workspace_id = %workspace_id,
                        start_step = ?step,
                        plan_steps = ?plan.steps,
                        "setup start step not found in plan; notifying client instead of silent return"
                    );
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "error".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: Some(step.key().to_string()),
                            step_title: "Workspace Setup Failed".to_string(),
                            output: Some(format!(
                                "\r\n\x1b[31mSetup plan changed while initializing (missing step `{}` in {:?}). Try creating the workspace again.\x1b[0m\r\n",
                                step.key(),
                                plan.steps
                            )),
                            replace_output: true,
                            requires_confirmation: false,
                            success: false,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;
                    return;
                }
            },
            None => 0,
        };

        for step in plan.steps.iter().copied().skip(start_index) {
            match step {
                WorkspaceSetupStep::CreateWorktree => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Creating Workspace".to_string(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = workspace_service
                        .ensure_worktree_ready(workspace_id.clone())
                        .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Workspace Creation Failed",
                            format!("\r\n\x1b[31mError creating worktree: {}\x1b[0m\r\n", error),
                            true,
                        )
                        .await;
                        return;
                    }
                }
                WorkspaceSetupStep::WriteRequirement => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: plan.requirement_step_title.clone(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = workspace_service
                        .write_workspace_requirement(
                            workspace_id.clone(),
                            initial_requirement.clone(),
                            github_issue.clone(),
                            None,
                        )
                        .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Requirement Initialization Failed",
                            format!(
                                "\r\n\x1b[31mError writing requirement: {}\x1b[0m\r\n",
                                error
                            ),
                            true,
                        )
                        .await;
                        return;
                    }
                }
                WorkspaceSetupStep::ExtractTodos => {
                    let Some(issue) = github_issue.clone() else {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "TODO Extraction Failed",
                            "\r\n\x1b[31mNo GitHub issue is available for TODO extraction.\x1b[0m\r\n"
                                .to_string(),
                            true,
                        )
                        .await;
                        return;
                    };

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Extracting Initial TODOs".to_string(),
                            output: None,
                            replace_output: true,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    let mut streamed_markdown = String::new();
                    let mut rx = match workspace_service.stream_workspace_issue_todos(&issue).await
                    {
                        Ok(rx) => rx,
                        Err(error) => {
                            Self::send_setup_failure(
                                &manager,
                                &conn_id,
                                &workspace_id,
                                &plan,
                                step,
                                "TODO Extraction Failed",
                                format!(
                                    "\r\n\x1b[31mError starting TODO extraction: {}\x1b[0m\r\n",
                                    error
                                ),
                                true,
                            )
                            .await;
                            return;
                        }
                    };

                    while let Some(chunk) = rx.recv().await {
                        match chunk {
                            Ok(text) => {
                                streamed_markdown.push_str(&text);
                                Self::send_workspace_setup_progress(
                                    &manager,
                                    &conn_id,
                                    WorkspaceSetupProgressNotification {
                                        workspace_id: workspace_id.clone(),
                                        status: "creating".to_string(),
                                        step_key: Some(step.key().to_string()),
                                        failed_step_key: None,
                                        step_title: "Extracting Initial TODOs".to_string(),
                                        output: Some(text),
                                        replace_output: false,
                                        requires_confirmation: false,
                                        success: true,
                                        countdown: None,
                                        setup_context: Some(plan.context.clone()),
                                    },
                                )
                                .await;
                            }
                            Err(error) => {
                                Self::send_setup_failure(
                                    &manager,
                                    &conn_id,
                                    &workspace_id,
                                    &plan,
                                    step,
                                    "TODO Extraction Failed",
                                    format!(
                                        "\r\n\x1b[31mError streaming TODO extraction: {}\x1b[0m\r\n",
                                        error
                                    ),
                                    true,
                                )
                                .await;
                                return;
                            }
                        }
                    }

                    let normalized_markdown =
                        crate::service::workspace_todos::normalize_task_markdown(
                            &streamed_markdown,
                        );
                    if normalized_markdown.is_empty() {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "TODO Extraction Failed",
                            "\r\n\x1b[31mThe model returned no valid TODO items.\x1b[0m\r\n"
                                .to_string(),
                            true,
                        )
                        .await;
                        return;
                    }

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Review Initial TODOs".to_string(),
                            output: Some(normalized_markdown),
                            replace_output: true,
                            requires_confirmation: true,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;
                    return;
                }
                WorkspaceSetupStep::RunSetupScript => {
                    let effective_workspace_name = workspace_service
                        .get_workspace(workspace_id.clone())
                        .await
                        .ok()
                        .flatten()
                        .map(|workspace| workspace.model.name)
                        .unwrap_or_else(|| workspace_name.clone());
                    let workspace_path = GitEngine::new()
                        .get_worktree_path(&effective_workspace_name)
                        .unwrap_or_default();
                    let Some(script) = plan.setup_script.clone() else {
                        continue;
                    };

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(format!("\r\n$ Running setup script: {}\r\n", script)),
                            replace_output: true,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = Self::execute_script_in_pty(
                        &manager,
                        &conn_id,
                        &workspace_id,
                        &script,
                        &workspace_path,
                        &plan.project_main_file_path,
                    )
                    .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Setup Failed",
                            format!("\r\n\x1b[31mError: {}\x1b[0m\r\n", error),
                            false,
                        )
                        .await;
                        return;
                    }

                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                WorkspaceSetupStep::Ready => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "completed".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Ready to Build".to_string(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;
                    return;
                }
            }
        }
    }

    async fn execute_script_in_pty(
        manager: &Arc<infra::WsManager>,
        conn_id: &str,
        workspace_id: &str,
        script: &str,
        cwd: &std::path::Path,
        project_root: &str,
    ) -> anyhow::Result<()> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell = std::env::var("SHELL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(Self::detect_login_shell_from_system)
            .unwrap_or_else(|| "/bin/sh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        if shell.contains("zsh") || shell.contains("bash") {
            cmd.arg("-i");
            cmd.arg("-l");
        }
        cmd.arg("-c");
        let wrapper = r#"
PS4='$ '
echo() { { set +x; } 2>/dev/null; builtin echo "$@"; { set -x; } 2>/dev/null; }
printf() { { set +x; } 2>/dev/null; builtin printf "$@"; { set -x; } 2>/dev/null; }
set -x
"#;
        let script_with_wrapper = format!("{}{}", wrapper, script);
        cmd.arg(script_with_wrapper);
        cmd.cwd(cwd);

        cmd.env("ATMOS_ROOT_PROJECT_PATH", project_root);
        cmd.env("ATMOS_WORKSPACE_PATH", cwd.to_string_lossy().to_string());
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }

        let mut child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        drop(pair.master);

        let manager_clone = manager.clone();
        let conn_id_clone = conn_id.to_string();
        let workspace_id_clone = workspace_id.to_string();

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let s = String::from_utf8_lossy(&buf[..n]).to_string();
                        if tx.send(s).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut wait_handle = tokio::task::spawn_blocking(move || child.wait());

        let exit_status = loop {
            tokio::select! {
                biased;
                Some(output) = rx.recv() => {
                    Self::send_workspace_setup_progress(
                        &manager_clone,
                        &conn_id_clone,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id_clone.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some("run_setup_script".to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(output),
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: None,
                        },
                    )
                    .await;
                }
                result = &mut wait_handle => {
                    break result??;
                }
            }
        };

        let drain_deadline = tokio::time::Instant::now() + Duration::from_millis(500);
        loop {
            let remaining = drain_deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Some(output)) => {
                    Self::send_workspace_setup_progress(
                        &manager_clone,
                        &conn_id_clone,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id_clone.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some("run_setup_script".to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(output),
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: None,
                        },
                    )
                    .await;
                }
                Ok(None) | Err(_) => break,
            }
        }

        if !exit_status.success() {
            anyhow::bail!("Script exited with status {}", exit_status);
        }

        Ok(())
    }
}
