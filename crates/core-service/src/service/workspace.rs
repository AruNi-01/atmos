use crate::error::{Result, ServiceError};
use crate::service::workspace_support::{
    pr_as_issue_payload, sanitize_workspace_handle, validate_workspace_priority,
    validate_workspace_workflow_status, with_project_scope,
};
use crate::service::workspace_todos::{
    build_issue_todo_request, normalize_task_markdown, render_requirement_markdown,
};
use crate::utils::workspace_name_generator;
use core_engine::{FsEngine, GitEngine};
use infra::db::entities::{workspace, workspace_label};
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use infra::{GithubIssuePayload, GithubPrPayload};
use llm::{FileLlmConfigStore, LlmFeature, generate_text, generate_text_stream};
use sea_orm::DatabaseConnection;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;

mod management;

pub use crate::service::workspace_support::{
    WORKSPACE_PRIORITIES, WORKSPACE_WORKFLOW_STATUSES, WorkspaceDto, WorkspaceLabelDto,
};

pub struct WorkspaceService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
    fs_engine: FsEngine,
}

impl WorkspaceService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
            fs_engine: FsEngine::new(),
        }
    }

    fn to_dto(
        &self,
        model: workspace::Model,
        labels: Vec<workspace_label::Model>,
    ) -> Result<WorkspaceDto> {
        let local_path = self
            .git_engine
            .get_worktree_path(&model.name)?
            .to_string_lossy()
            .to_string();
        let github_issue = self.parse_github_issue(&model.github_issue_data)?;
        let github_pr = self.parse_github_pr(&model.github_pr_data)?;
        Ok(WorkspaceDto {
            model,
            local_path,
            github_issue,
            github_pr,
            labels: labels.into_iter().map(Into::into).collect(),
        })
    }

    fn to_dto_lenient(
        &self,
        model: workspace::Model,
        labels: Vec<workspace_label::Model>,
    ) -> WorkspaceDto {
        let local_path = self
            .git_engine
            .get_worktree_path(&model.name)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let github_issue = model
            .github_issue_data
            .as_deref()
            .and_then(|raw| serde_json::from_str::<GithubIssuePayload>(raw).ok());
        let github_pr = model
            .github_pr_data
            .as_deref()
            .and_then(|raw| serde_json::from_str::<GithubPrPayload>(raw).ok());
        WorkspaceDto {
            model,
            local_path,
            github_issue,
            github_pr,
            labels: labels.into_iter().map(Into::into).collect(),
        }
    }

    pub async fn list_by_project(
        &self,
        project_guid: String,
        include_issue_only: bool,
    ) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo
            .list_by_project(&project_guid, include_issue_only)
            .await?;
        let workspace_guids: Vec<String> = models.iter().map(|model| model.guid.clone()).collect();
        let mut labels_by_workspace = repo
            .list_labels_by_workspace_guids(&workspace_guids)
            .await?;
        models
            .into_iter()
            .map(|model| {
                let labels = labels_by_workspace.remove(&model.guid).unwrap_or_default();
                self.to_dto(model, labels)
            })
            .collect()
    }

    pub async fn get_workspace(&self, guid: String) -> Result<Option<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let model = repo.find_by_guid(&guid).await?;
        if let Some(model) = model {
            let labels = repo
                .list_labels_by_workspace_guids(std::slice::from_ref(&model.guid))
                .await?
                .remove(&model.guid)
                .unwrap_or_default();
            Ok(Some(self.to_dto(model, labels)?))
        } else {
            Ok(None)
        }
    }

    fn parse_github_issue(&self, raw: &Option<String>) -> Result<Option<GithubIssuePayload>> {
        raw.as_deref()
            .map(|value| {
                serde_json::from_str::<GithubIssuePayload>(value).map_err(|error| {
                    ServiceError::Validation(format!(
                        "Failed to deserialize stored GitHub issue metadata: {error}"
                    ))
                })
            })
            .transpose()
    }

    fn parse_github_pr(&self, raw: &Option<String>) -> Result<Option<GithubPrPayload>> {
        raw.as_deref()
            .map(|value| {
                serde_json::from_str::<GithubPrPayload>(value).map_err(|error| {
                    ServiceError::Validation(format!(
                        "Failed to deserialize stored GitHub PR metadata: {error}"
                    ))
                })
            })
            .transpose()
    }

    /// 创建新工作区
    ///
    /// If `name` is empty, a unique Pokemon-based name will be generated.
    /// If `name` is provided, it will be used (with conflict resolution if needed).
    pub async fn create_workspace(
        &self,
        project_guid: String,
        display_name: Option<String>,
        branch: String,
        base_branch: Option<String>,
        sidebar_order: i32,
        github_issue: Option<GithubIssuePayload>,
        github_pr: Option<GithubPrPayload>,
        auto_extract_todos: bool,
        priority: Option<String>,
        workflow_status: Option<String>,
        labels: Option<Vec<String>>,
    ) -> Result<WorkspaceDto> {
        // PR linking is mutually exclusive with issue linking. PR takes precedence
        // over an explicit issue payload.
        let github_pr_payload = github_pr;
        let effective_github_issue = if github_pr_payload.is_some() {
            github_pr_payload.as_ref().map(pr_as_issue_payload)
        } else {
            github_issue
        };
        let github_issue = effective_github_issue;
        // Get project to find the repository path and name
        let project_repo = ProjectRepo::new(&self.db);
        let project = project_repo
            .find_by_guid(&project_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", project_guid)))?;

        let repo_path = Path::new(&project.main_file_path);
        let workflow_status = validate_workspace_workflow_status(workflow_status)?;
        let priority = validate_workspace_priority(priority)?;

        // When linking a PR, prefer the PR's base ref unless the caller explicitly
        // provides another base branch.
        let base_branch = match (&github_pr_payload, base_branch.as_deref().map(str::trim)) {
            (Some(pr), Some(value)) if !value.is_empty() => Some(value.to_string()),
            (Some(pr), _) => Some(pr.base_ref.clone()),
            (None, _) => base_branch,
        };
        let requested_base_branch = base_branch
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let resolved_base_branch = if let Some(base_branch) = requested_base_branch {
            let remote_branches =
                self.git_engine
                    .list_remote_branches(repo_path)
                    .map_err(|error| {
                        ServiceError::Validation(format!(
                            "Failed to load remote branches for base branch selection: {error}"
                        ))
                    })?;

            if !remote_branches.iter().any(|branch| branch == &base_branch) {
                return Err(ServiceError::Validation(format!(
                    "Remote branch `origin/{}` does not exist.",
                    base_branch
                )));
            }

            base_branch
        } else {
            self.git_engine
                .get_default_branch(repo_path)
                .unwrap_or(None)
                .unwrap_or_else(|| "main".to_string())
        };

        let existing_branches: HashSet<String> = self
            .git_engine
            .list_branches(repo_path)
            .unwrap_or_default()
            .into_iter()
            .collect();
        let mut existing_names = existing_branches.clone();

        let workspace_repo = WorkspaceRepo::new(&self.db);
        let db_workspaces = workspace_repo.list_all_by_project(&project_guid).await?;
        for ws in &db_workspaces {
            existing_names.insert(ws.name.clone());
        }

        let existing_vec: Vec<String> = existing_names.iter().cloned().collect();
        let project_scope = sanitize_workspace_handle(&project.name);
        let project_scope = if project_scope.is_empty() {
            "project".to_string()
        } else {
            project_scope
        };
        let requested_display_name = display_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        // When a PR is linked, the workspace must reuse the PR's head branch as-is.
        let requested_branch = if let Some(pr) = github_pr_payload.as_ref() {
            pr.head_ref.clone()
        } else {
            branch.trim().to_string()
        };

        let initial_handle = if let Some(pr) = github_pr_payload.as_ref() {
            sanitize_workspace_handle(&pr.head_ref)
        } else if !requested_branch.is_empty() {
            sanitize_workspace_handle(&requested_branch)
        } else if let Some(issue) = github_issue.as_ref() {
            format!("issue-{}", issue.number)
        } else if let Some(display_name) = requested_display_name.as_deref() {
            sanitize_workspace_handle(display_name)
        } else {
            workspace_name_generator::generate_workspace_handle(&project_scope, &existing_vec)
        };

        let user_visible_generation = !requested_branch.is_empty()
            || requested_display_name.is_some()
            || github_issue.is_some();

        let final_name = if user_visible_generation {
            let handle = initial_handle.trim().to_string();
            if handle.is_empty() {
                return Err(ServiceError::Validation(
                    "Auto-generated workspace directory name is invalid. Please enter a custom branch name."
                        .to_string(),
                ));
            }
            let candidate = format!("{project_scope}/{handle}");

            if existing_names.contains(&candidate) {
                return Err(ServiceError::Validation(format!(
                    "Auto-generated workspace directory name `{}` conflicts with an existing branch or workspace. Please enter a custom branch name.",
                    candidate
                )));
            }

            let worktree_path = self.git_engine.get_worktree_path(&candidate)?;
            if worktree_path.exists() {
                return Err(ServiceError::Validation(format!(
                    "Workspace directory `{}` already exists. Please enter a custom branch name.",
                    candidate
                )));
            }

            candidate
        } else {
            let mut final_name = with_project_scope(&project_scope, initial_handle.as_str());
            let mut attempt = 0;
            const MAX_ATTEMPTS: u32 = 50;

            loop {
                if attempt >= MAX_ATTEMPTS {
                    return Err(ServiceError::Validation(
                        "Failed to create workspace: too many naming conflicts".to_string(),
                    ));
                }

                if !existing_names.contains(&final_name) {
                    let worktree_path = self.git_engine.get_worktree_path(&final_name)?;
                    if !worktree_path.exists() {
                        break;
                    }
                }

                attempt += 1;
                let generated = workspace_name_generator::generate_workspace_handle(
                    &project_scope,
                    &existing_vec,
                );
                final_name = with_project_scope(&project_scope, generated.as_str());
            }

            final_name
        };

        let final_branch = if requested_branch.is_empty() {
            final_name
                .rsplit('/')
                .next()
                .unwrap_or(final_name.as_str())
                .to_string()
        } else {
            requested_branch
        };

        // Apply configurable branch prefix (e.g. "atmos/") from function settings
        let final_branch = {
            let branch_prefix = {
                let path = dirs::home_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join(".atmos")
                    .join("function_settings.json");
                if path.exists() {
                    std::fs::read_to_string(&path)
                        .ok()
                        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
                        .and_then(|v| {
                            v.get("workspace_settings")?
                                .get("branch_prefix")?
                                .as_str()
                                .map(String::from)
                        })
                        .unwrap_or_else(|| "atmos".to_string())
                } else {
                    "atmos".to_string()
                }
            };

            // Skip prefixing for PR-linked workspaces — use PR branch as-is
            if github_pr_payload.is_some() {
                final_branch
            } else if !branch_prefix.is_empty() {
                let prefix_normalized = branch_prefix.trim_end_matches('/');
                let prefix_with_slash = format!("{}/", prefix_normalized);
                if !final_branch.starts_with(&prefix_with_slash) {
                    format!("{}{}", prefix_with_slash, final_branch)
                } else {
                    final_branch
                }
            } else {
                final_branch
            }
        };

        // For PR-linked workspaces, reusing the existing local branch is expected.
        if github_pr_payload.is_none() && existing_branches.contains(&final_branch) {
            return Err(ServiceError::Validation(format!(
                "Branch `{}` already exists. Please enter a different branch name.",
                final_branch
            )));
        }

        // Save to database with the final name (use it as both name and branch)
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let github_issue_url = github_issue.as_ref().map(|issue| issue.url.clone());
        let github_issue_data = github_issue
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| {
                ServiceError::Validation(format!(
                    "Failed to serialize GitHub issue metadata: {error}"
                ))
            })?;
        let github_pr_url = github_pr_payload.as_ref().map(|pr| pr.url.clone());
        let github_pr_data = github_pr_payload
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to serialize GitHub PR metadata: {error}"))
            })?;
        let model = workspace_repo
            .create(
                project_guid,
                final_name.clone(),
                requested_display_name,
                final_branch,
                resolved_base_branch,
                sidebar_order,
                github_issue_url,
                github_issue_data,
                github_pr_url,
                github_pr_data,
                auto_extract_todos,
                workflow_status,
                priority,
                labels,
                "manual".to_string(),
            )
            .await?;

        let labels = workspace_repo
            .list_labels_by_workspace_guids(std::slice::from_ref(&model.guid))
            .await?
            .remove(&model.guid)
            .unwrap_or_default();

        self.to_dto(model, labels)
    }

    /// 创建 Issue Only 工作区（从 GitHub Issue 导入）
    /// 不创建分支、不初始化 worktree、不运行 setup flow
    pub async fn create_issue_only_workspace(
        &self,
        project_guid: String,
        display_name: Option<String>,
        github_issue_url: String,
        github_issue_data: String,
        workflow_status: Option<String>,
        priority: Option<String>,
        labels: Option<Vec<String>>,
    ) -> Result<WorkspaceDto> {
        let workflow_status = validate_workspace_workflow_status(workflow_status)?;
        let priority = validate_workspace_priority(priority)?;

        let workspace_repo = WorkspaceRepo::new(&self.db);

        let model = workspace_repo
            .create_issue_only(
                project_guid,
                display_name,
                github_issue_url,
                github_issue_data,
                workflow_status,
                priority,
                labels,
            )
            .await?;

        let workspace_labels = workspace_repo
            .list_labels_by_workspace_guids(std::slice::from_ref(&model.guid))
            .await?
            .remove(&model.guid)
            .unwrap_or_default();

        self.to_dto(model, workspace_labels)
    }

    /// 确保 Worktree 已就绪（不存在则创建）
    /// 这是耗时操作，应在后台异步任务中调用
    pub async fn ensure_worktree_ready(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;

        let project_repo = ProjectRepo::new(&self.db);
        let project = project_repo
            .find_by_guid(&workspace.project_guid)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Project {} not found", workspace.project_guid))
            })?;

        let repo_path = Path::new(&project.main_file_path);

        tracing::info!(
            "[ensure_worktree_ready] Starting for workspace: {}, branch: {}",
            workspace.name,
            workspace.branch
        );

        // Get the worktree path
        let worktree_path = self.git_engine.get_worktree_path(&workspace.name)?;
        tracing::info!(
            "[ensure_worktree_ready] Worktree path: {}",
            worktree_path.display()
        );

        // Check if worktree directory already exists and has content
        if worktree_path.exists() {
            let has_files = std::fs::read_dir(&worktree_path)
                .map(|mut entries| entries.next().is_some())
                .unwrap_or(false);

            if has_files {
                tracing::info!(
                    "[ensure_worktree_ready] Worktree already exists and has files, skipping creation"
                );
                return Ok(());
            } else {
                tracing::warn!(
                    "[ensure_worktree_ready] Worktree directory exists but is empty, will attempt to remove and recreate"
                );
                // Try to remove the empty directory
                if let Err(e) = std::fs::remove_dir(&worktree_path) {
                    tracing::error!(
                        "[ensure_worktree_ready] Failed to remove empty worktree directory: {}",
                        e
                    );
                }
            }
        }

        let existing_branches = self.git_engine.list_branches(repo_path)?;
        let base_branch = if workspace.base_branch.trim().is_empty() {
            self.git_engine
                .get_default_branch(repo_path)
                .unwrap_or(None)
                .unwrap_or_else(|| "main".to_string())
        } else {
            workspace.base_branch.clone()
        };

        tracing::info!(
            "[ensure_worktree_ready] Base branch: {}, existing branches count: {}",
            base_branch,
            existing_branches.len()
        );

        // PR-linked workspaces reuse the existing PR head branch directly.
        let is_pr_linked = workspace.github_pr_data.is_some();

        if !is_pr_linked && existing_branches.contains(&workspace.branch) {
            return Err(ServiceError::Validation(format!(
                "Branch `{}` already exists. Please choose a different branch name.",
                workspace.branch
            )));
        }

        let create_result = if is_pr_linked {
            self.git_engine.create_worktree_from_remote_branch(
                repo_path,
                &workspace.name,
                &workspace.branch,
            )
        } else {
            self.git_engine.create_worktree(
                repo_path,
                &workspace.name,
                &workspace.branch,
                &base_branch,
            )
        };

        match create_result {
            Ok(created_path) => {
                tracing::info!(
                    "[ensure_worktree_ready] Successfully created worktree at: {}",
                    created_path.display()
                );

                // Verify the worktree was actually created with files
                if !created_path.exists() {
                    return Err(ServiceError::Validation(format!(
                        "Worktree was reported as created but directory does not exist: {}",
                        created_path.display()
                    )));
                }

                let has_files = std::fs::read_dir(&created_path)
                    .map(|mut entries| entries.next().is_some())
                    .unwrap_or(false);

                if !has_files {
                    return Err(ServiceError::Validation(format!(
                        "Worktree directory was created but is empty: {}",
                        created_path.display()
                    )));
                }

                Ok(())
            }
            Err(e) => {
                let err_msg = e.to_string();

                // If it already exists, verify it's actually ready
                if err_msg.contains("already exists") {
                    let worktree_path = self.git_engine.get_worktree_path(&workspace.name)?;
                    let has_files = worktree_path.exists()
                        && std::fs::read_dir(&worktree_path)
                            .map(|mut entries| entries.next().is_some())
                            .unwrap_or(false);

                    if has_files {
                        tracing::warn!(
                            "[ensure_worktree_ready] Worktree already exists and is ready, treating as success. Details: {}",
                            err_msg
                        );
                        return Ok(());
                    } else {
                        tracing::error!(
                            "[ensure_worktree_ready] Worktree reported as 'already exists' but directory is missing or empty: {}",
                            err_msg
                        );
                        return Err(ServiceError::Validation(format!(
                            "Worktree conflict: {}. Try deleting the workspace and recreating it.",
                            err_msg
                        )));
                    }
                }

                tracing::error!(
                    "[ensure_worktree_ready] Failed to create worktree: {}",
                    err_msg
                );
                Err(e.into())
            }
        }
    }

    pub async fn write_workspace_attachments(
        &self,
        guid: String,
        attachments: Vec<infra::WorkspaceAttachmentPayload>,
    ) -> Result<()> {
        if attachments.is_empty() {
            return Ok(());
        }
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;
        let workspace_path = self.git_engine.get_worktree_path(&workspace.name)?;
        let attachments_dir = workspace_path.join(".atmos/attachments");
        for attachment in attachments {
            // Sanitize the filename — only allow simple names without separators.
            let safe = attachment
                .filename
                .replace(['/', '\\'], "_")
                .trim()
                .to_string();
            if safe.is_empty() {
                continue;
            }
            let bytes = base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                attachment.data_base64.as_bytes(),
            )
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to decode attachment {}: {}", safe, error))
            })?;
            let target = attachments_dir.join(&safe);
            self.fs_engine.write_bytes(&target, &bytes)?;
        }
        Ok(())
    }

    pub async fn write_workspace_requirement(
        &self,
        guid: String,
        _initial_requirement: Option<String>,
        github_issue: Option<GithubIssuePayload>,
        github_pr: Option<GithubPrPayload>,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;
        let workspace_path = self.git_engine.get_worktree_path(&workspace.name)?;

        if let Some(requirement) =
            render_requirement_markdown(github_issue.as_ref(), github_pr.as_ref())
        {
            let requirement_path = workspace_path.join(".atmos/context/requirement.md");
            self.fs_engine.write_file(&requirement_path, &requirement)?;
        }

        Ok(())
    }

    pub async fn write_workspace_task_markdown(
        &self,
        guid: String,
        markdown: String,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;
        let workspace_path = self.git_engine.get_worktree_path(&workspace.name)?;
        let normalized = normalize_task_markdown(&markdown);

        if normalized.is_empty() {
            return Err(ServiceError::Validation(
                "No valid TODO items were generated. Please retry TODO extraction.".to_string(),
            ));
        }

        let task_path = workspace_path.join(".atmos/context/task.md");
        self.fs_engine.write_file(&task_path, &normalized)?;

        Ok(())
    }

    pub async fn write_workspace_issue_todos(
        &self,
        guid: String,
        issue: GithubIssuePayload,
    ) -> Result<()> {
        let markdown = self.generate_issue_todos_markdown(&issue).await?;
        self.write_workspace_task_markdown(guid, markdown).await
    }

    pub async fn stream_workspace_issue_todos(
        &self,
        issue: &GithubIssuePayload,
    ) -> Result<mpsc::Receiver<llm::Result<String>>> {
        let store = FileLlmConfigStore::new().map_err(|error| {
            ServiceError::Processing(format!("Failed to initialize LLM config store: {error}"))
        })?;
        let provider = store
            .resolve_for_feature(LlmFeature::WorkspaceIssueTodo)
            .map_err(|error| {
                ServiceError::Validation(format!(
                    "Failed to resolve workspace issue TODO provider: {error}"
                ))
            })?
            .ok_or_else(|| {
                ServiceError::Validation(
                    "No LLM provider is enabled for workspace issue TODO extraction".to_string(),
                )
            })?;

        let request = build_issue_todo_request(issue)?;
        generate_text_stream(&provider, request)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to start TODO extraction stream: {error}"))
            })
    }

    async fn generate_issue_todos_markdown(&self, issue: &GithubIssuePayload) -> Result<String> {
        let store = FileLlmConfigStore::new().map_err(|error| {
            ServiceError::Processing(format!("Failed to initialize LLM config store: {error}"))
        })?;
        let provider = store
            .resolve_for_feature(LlmFeature::WorkspaceIssueTodo)
            .map_err(|error| {
                ServiceError::Validation(format!(
                    "Failed to resolve workspace issue TODO provider: {error}"
                ))
            })?
            .ok_or_else(|| {
                ServiceError::Validation(
                    "No LLM provider is enabled for workspace issue TODO extraction".to_string(),
                )
            })?;

        let request = build_issue_todo_request(issue)?;
        let response = generate_text(&provider, request).await.map_err(|error| {
            ServiceError::Validation(format!("Failed to extract TODOs with LLM: {error}"))
        })?;

        let normalized = normalize_task_markdown(&response.text);
        if normalized.is_empty() {
            return Err(ServiceError::Validation(
                "LLM returned no valid markdown TODO items".to_string(),
            ));
        }

        Ok(normalized)
    }
}
