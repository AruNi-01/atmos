use crate::error::{Result, ServiceError};
use crate::utils::workspace_name_generator;
use core_engine::{FsEngine, GitEngine, TmuxEngine};
use infra::db::entities::{workspace, workspace_label};
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use infra::{GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload};
use llm::{
    generate_text, generate_text_stream, render_prompt_template, FileLlmConfigStore,
    GenerateTextRequest, LlmFeature, ResponseFormat,
};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;

const WORKSPACE_ISSUE_TODO_SYSTEM_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/workspace/workspace-issue-todo-generator.md");
const WORKSPACE_ISSUE_TODO_USER_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/workspace/workspace-issue-todo-user.md");
pub const WORKSPACE_WORKFLOW_STATUSES: &[&str] = &[
    "backlog",
    "todo",
    "in_progress",
    "in_review",
    "blocked",
    "completed",
    "canceled",
];
pub const WORKSPACE_PRIORITIES: &[&str] = &["no_priority", "urgent", "high", "medium", "low"];

#[derive(Serialize)]
pub struct WorkspaceLabelDto {
    pub guid: String,
    pub name: String,
    pub color: String,
}

impl From<workspace_label::Model> for WorkspaceLabelDto {
    fn from(model: workspace_label::Model) -> Self {
        Self {
            guid: model.guid,
            name: model.name,
            color: model.color,
        }
    }
}

#[derive(Serialize)]
pub struct WorkspaceDto {
    #[serde(flatten)]
    pub model: workspace::Model,
    pub local_path: String,
    pub github_issue: Option<GithubIssuePayload>,
    pub github_pr: Option<GithubPrPayload>,
    pub labels: Vec<WorkspaceLabelDto>,
}

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

    pub async fn list_by_project(&self, project_guid: String) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_by_project(&project_guid).await?;
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

    /// Synthesize a GithubIssuePayload from a PR so the existing requirement/TODO
    /// pipeline (which is keyed on issue title/body/labels) can ingest PR content.
    fn pr_as_issue_payload(pr: &GithubPrPayload) -> GithubIssuePayload {
        GithubIssuePayload {
            owner: pr.owner.clone(),
            repo: pr.repo.clone(),
            number: pr.number,
            title: pr.title.clone(),
            body: pr.body.clone(),
            url: pr.url.clone(),
            state: pr.state.clone(),
            labels: pr
                .labels
                .iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name.clone(),
                    color: label.color.clone(),
                    description: label.description.clone(),
                })
                .collect(),
        }
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
            github_pr_payload.as_ref().map(Self::pr_as_issue_payload)
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
        let workflow_status = match workflow_status {
            Some(status)
                if WORKSPACE_WORKFLOW_STATUSES
                    .iter()
                    .any(|candidate| *candidate == status) =>
            {
                Some(status)
            }
            Some(status) => {
                return Err(ServiceError::Validation(format!(
                    "Unsupported workspace workflow status: {status}"
                )));
            }
            None => None,
        };
        let priority = match priority {
            Some(value)
                if WORKSPACE_PRIORITIES
                    .iter()
                    .any(|candidate| *candidate == value) =>
            {
                Some(value)
            }
            Some(value) => {
                return Err(ServiceError::Validation(format!(
                    "Unsupported workspace priority: {value}"
                )));
            }
            None => None,
        };

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
            Self::sanitize_workspace_handle(&pr.head_ref)
        } else if !requested_branch.is_empty() {
            Self::sanitize_workspace_handle(&requested_branch)
        } else if let Some(issue) = github_issue.as_ref() {
            format!("issue-{}", issue.number)
        } else if let Some(display_name) = requested_display_name.as_deref() {
            Self::sanitize_workspace_handle(display_name)
        } else {
            let prefix = workspace_name_generator::extract_repo_prefix(&project.name);
            workspace_name_generator::generate_workspace_name(&existing_vec, &prefix)
        };
        let project_scope = Self::sanitize_workspace_handle(&project.name);
        let project_scope = if project_scope.is_empty() {
            "project".to_string()
        } else {
            project_scope
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
            let mut final_name = Self::with_project_scope(&project_scope, initial_handle.as_str());
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
                let prefix = workspace_name_generator::extract_repo_prefix(&project.name);
                let generated =
                    workspace_name_generator::generate_workspace_name(&existing_vec, &prefix);
                final_name = Self::with_project_scope(&project_scope, generated.as_str());
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
                ServiceError::Validation(format!(
                    "Failed to serialize GitHub PR metadata: {error}"
                ))
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
            )
            .await?;

        let labels = workspace_repo
            .list_labels_by_workspace_guids(std::slice::from_ref(&model.guid))
            .await?
            .remove(&model.guid)
            .unwrap_or_default();

        self.to_dto(model, labels)
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
                tracing::info!("[ensure_worktree_ready] Worktree already exists and has files, skipping creation");
                return Ok(());
            } else {
                tracing::warn!("[ensure_worktree_ready] Worktree directory exists but is empty, will attempt to remove and recreate");
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
                        tracing::warn!("[ensure_worktree_ready] Worktree already exists and is ready, treating as success. Details: {}", err_msg);
                        return Ok(());
                    } else {
                        tracing::error!("[ensure_worktree_ready] Worktree reported as 'already exists' but directory is missing or empty: {}", err_msg);
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
                ServiceError::Validation(format!(
                    "Failed to decode attachment {}: {}",
                    safe, error
                ))
            })?;
            let target = attachments_dir.join(&safe);
            self.fs_engine.write_bytes(&target, &bytes)?;
        }
        Ok(())
    }

    pub async fn write_workspace_requirement(
        &self,
        guid: String,
        initial_requirement: Option<String>,
        github_issue: Option<GithubIssuePayload>,
        github_pr: Option<GithubPrPayload>,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;
        let workspace_path = self.git_engine.get_worktree_path(&workspace.name)?;

        if let Some(requirement) = self.render_requirement_markdown(
            initial_requirement.as_deref(),
            github_issue.as_ref(),
            github_pr.as_ref(),
        ) {
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
        let normalized = Self::normalize_task_markdown(&markdown);

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

        let request = self.build_issue_todo_request(issue)?;
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

        let request = self.build_issue_todo_request(issue)?;
        let response = generate_text(&provider, request).await.map_err(|error| {
            ServiceError::Validation(format!("Failed to extract TODOs with LLM: {error}"))
        })?;

        let normalized = Self::normalize_task_markdown(&response.text);
        if normalized.is_empty() {
            return Err(ServiceError::Validation(
                "LLM returned no valid markdown TODO items".to_string(),
            ));
        }

        Ok(normalized)
    }

    fn build_issue_todo_request(&self, issue: &GithubIssuePayload) -> Result<GenerateTextRequest> {
        let store = FileLlmConfigStore::new().map_err(|error| {
            ServiceError::Processing(format!("Failed to initialize LLM config store: {error}"))
        })?;
        let output_language = store
            .load_feature_language(LlmFeature::WorkspaceIssueTodo)
            .map_err(|error| {
                ServiceError::Validation(format!(
                    "Failed to load workspace issue TODO output language: {error}"
                ))
            })?;
        let prompt = render_prompt_template(
            WORKSPACE_ISSUE_TODO_USER_PROMPT_TEMPLATE,
            &[
                (
                    "output_language_requirement",
                    &Self::build_todo_user_language_instruction(output_language.as_deref()),
                ),
                ("issue_title", issue.title.as_str()),
                ("issue_body", issue.body.as_deref().unwrap_or_default()),
            ],
        );
        let system_prompt = render_prompt_template(
            WORKSPACE_ISSUE_TODO_SYSTEM_PROMPT_TEMPLATE,
            &[(
                "output_language_instruction",
                &Self::build_todo_output_language_instruction(output_language.as_deref()),
            )],
        );
        Ok(GenerateTextRequest {
            system: Some(system_prompt.trim().to_string()),
            prompt,
            temperature: Some(0.1),
            max_output_tokens: Some(2048),
            response_format: ResponseFormat::Text,
        })
    }

    fn build_todo_output_language_instruction(output_language: Option<&str>) -> String {
        let Some(language) = output_language
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return String::new();
        };

        format!(
            "Output language requirement:\n- Write every TODO item strictly in {language}.\n- This output-language requirement overrides the language of the issue title, body, logs, and examples.\n- Do not mix in any other natural language.\n- Keep only the markdown checkbox syntax unchanged."
        )
    }

    fn build_todo_user_language_instruction(output_language: Option<&str>) -> String {
        let Some(language) = output_language
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return String::new();
        };

        format!(
            "Output language: {language}\nReturn the markdown TODO list in {language} even if the issue content is written in another language."
        )
    }

    pub(crate) fn normalize_task_markdown(markdown: &str) -> String {
        markdown
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return None;
                }

                if let Some(content) = trimmed.strip_prefix("- [ ]") {
                    let content = content.trim();
                    return (!content.is_empty()).then(|| format!("- [ ] {}", content));
                }

                if let Some(content) = trimmed.strip_prefix("- ") {
                    let content = content.trim();
                    return (!content.is_empty()).then(|| format!("- [ ] {}", content));
                }

                if trimmed.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                    if let Some((prefix, content)) = trimmed.split_once(". ") {
                        if prefix.chars().all(|c| c.is_ascii_digit()) {
                            let content = content.trim();
                            return (!content.is_empty()).then(|| format!("- [ ] {}", content));
                        }
                    }
                }

                Some(format!("- [ ] {}", trimmed))
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn render_requirement_markdown(
        &self,
        _initial_requirement: Option<&str>,
        github_issue: Option<&GithubIssuePayload>,
        github_pr: Option<&GithubPrPayload>,
    ) -> Option<String> {
        // Prefer PR linkage when both are present — the welcome composer keeps
        // them mutually exclusive but the data layer may still hold a synthesized
        // issue alongside a real PR.
        if let Some(pr) = github_pr {
            let mut sections = vec!["# Requirement Specification".to_string()];

            sections.push(format!(
                "## GitHub Pull Request\n\n- Source: {}\n- Title: {}\n- Branch: {} → {}\n",
                pr.url, pr.title, pr.head_ref, pr.base_ref
            ));

            let body = pr
                .body
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("No PR description provided.");
            sections.push(format!("## PR Description\n\n{}\n", body));

            return Some(sections.join("\n"));
        }

        let issue = github_issue?;

        let mut sections = vec!["# Requirement Specification".to_string()];

        sections.push(format!(
            "## GitHub Issue\n\n- Source: {}\n- Title: {}\n",
            issue.url, issue.title
        ));

        let issue_body = issue
            .body
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No issue description provided.");
        sections.push(format!("## Issue Description\n\n{}\n", issue_body));

        Some(sections.join("\n"))
    }

    fn sanitize_workspace_handle(value: &str) -> String {
        let mut sanitized = String::with_capacity(value.len());
        let mut previous_dash = false;

        for ch in value.chars() {
            let next = if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            };

            if next == '-' {
                if previous_dash {
                    continue;
                }
                previous_dash = true;
            } else {
                previous_dash = false;
            }

            sanitized.push(next);
            if sanitized.len() >= 48 {
                break;
            }
        }

        let sanitized = sanitized.trim_matches('-').to_string();
        if sanitized.is_empty() {
            "workspace".to_string()
        } else {
            sanitized
        }
    }

    fn with_project_scope(project_scope: &str, workspace_name: &str) -> String {
        let scoped_prefix = format!("{project_scope}/");
        if workspace_name.starts_with(&scoped_prefix) {
            workspace_name.to_string()
        } else {
            format!("{project_scope}/{workspace_name}")
        }
    }

    /// 更新工作区显示名称
    pub async fn update_display_name(&self, guid: String, display_name: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_display_name(&guid, display_name).await?)
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: String, branch: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_branch(&guid, branch).await?)
    }

    pub async fn mark_visited(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .update_last_visited_at(&guid, chrono::Utc::now().naive_utc())
            .await?)
    }

    pub async fn update_workflow_status(
        &self,
        guid: String,
        workflow_status: String,
    ) -> Result<()> {
        if !WORKSPACE_WORKFLOW_STATUSES
            .iter()
            .any(|candidate| *candidate == workflow_status)
        {
            return Err(ServiceError::Validation(format!(
                "Unsupported workspace workflow status: {workflow_status}"
            )));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_workflow_status(&guid, workflow_status).await?)
    }

    pub async fn update_priority(&self, guid: String, priority: String) -> Result<()> {
        if !WORKSPACE_PRIORITIES
            .iter()
            .any(|candidate| *candidate == priority)
        {
            return Err(ServiceError::Validation(format!(
                "Unsupported workspace priority: {priority}"
            )));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_priority(&guid, priority).await?)
    }

    pub async fn list_labels(&self) -> Result<Vec<WorkspaceLabelDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .list_labels()
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    pub async fn create_label(&self, name: String, color: String) -> Result<WorkspaceLabelDto> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label name cannot be empty".to_string(),
            ));
        }
        if color.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label color cannot be empty".to_string(),
            ));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.create_label(name, color).await?.into())
    }

    pub async fn update_label(
        &self,
        guid: String,
        name: String,
        color: String,
    ) -> Result<WorkspaceLabelDto> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label name cannot be empty".to_string(),
            ));
        }
        if color.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label color cannot be empty".to_string(),
            ));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_label(&guid, name, color).await?.into())
    }

    pub async fn update_labels(&self, guid: String, label_guids: Vec<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_workspace_labels(&guid, label_guids).await?)
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_order(&guid, order).await?)
    }

    /// 删除工作区（仅软删除数据库记录，不清理 worktree）
    pub async fn soft_delete_workspace(&self, guid: &str) -> Result<()> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        Ok(workspace_repo.soft_delete(guid).await?)
    }

    /// 获取工作区的 GitHub PR/Issue 数据用于删除时清理
    pub async fn get_workspace_for_github_cleanup(
        &self,
        guid: &str,
    ) -> Result<Option<(Option<String>, Option<String>)>> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            return Ok(Some((
                workspace.github_pr_data,
                workspace.github_issue_data,
            )));
        }
        Ok(None)
    }

    /// 获取工作区的 worktree 清理所需信息
    pub async fn get_workspace_cleanup_info(
        &self,
        guid: &str,
    ) -> Result<Option<(String, String, String)>> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                return Ok(Some((
                    project.main_file_path.clone(),
                    workspace.name.clone(),
                    workspace.branch.clone(),
                )));
            }
        }
        Ok(None)
    }

    /// Resolve the tmux session name used for a workspace.
    ///
    /// This prefers the human-readable `{project}_{workspace}` naming scheme and
    /// falls back to the legacy workspace-id-based session name when lookup fails.
    pub async fn resolve_tmux_session_name(
        &self,
        guid: &str,
        tmux_engine: &TmuxEngine,
    ) -> Result<String> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                return Ok(tmux_engine.get_session_name_from_names(&project.name, &workspace.name));
            }
        }

        Ok(tmux_engine.get_session_name(guid))
    }

    /// 删除工作区（软删除 + 后台清理 worktree）
    pub async fn delete_workspace(&self, guid: String) -> Result<()> {
        // Get cleanup info before deleting
        let cleanup_info = self.get_workspace_cleanup_info(&guid).await?;

        // Soft delete from database first (instant)
        self.soft_delete_workspace(&guid).await?;

        // Clean up worktree in background (non-blocking)
        if let Some((repo_path_str, workspace_name, branch)) = cleanup_info {
            tokio::task::spawn_blocking(move || {
                let repo_path = Path::new(&repo_path_str);
                if let Err(e) =
                    GitEngine::new().remove_worktree(repo_path, &workspace_name, &branch, false)
                {
                    tracing::warn!(
                        "Failed to remove worktree for workspace {}: {}",
                        workspace_name,
                        e
                    );
                }
            });
        }

        Ok(())
    }

    /// 置顶工作区
    pub async fn pin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.pin_workspace(&guid).await?)
    }

    /// 取消置顶工作区
    pub async fn unpin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.unpin_workspace(&guid).await?)
    }

    /// 更新置顶工作区顺序
    pub async fn update_workspace_pin_order(&self, workspace_ids: Vec<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_pin_order(workspace_ids).await?)
    }

    /// 归档工作区（不删除 worktree）
    pub async fn archive_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.archive_workspace(&guid).await?)
    }

    /// 取消归档工作区
    pub async fn unarchive_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.unarchive_workspace(&guid).await?)
    }

    /// 获取所有已归档的工作区
    pub async fn list_archived_workspaces(&self) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_archived().await?;
        let workspace_guids: Vec<String> = models.iter().map(|model| model.guid.clone()).collect();
        let mut labels_by_workspace = repo
            .list_labels_by_workspace_guids(&workspace_guids)
            .await?;
        Ok(models
            .into_iter()
            .map(|model| {
                let labels = labels_by_workspace.remove(&model.guid).unwrap_or_default();
                self.to_dto_lenient(model, labels)
            })
            .collect())
    }

    pub async fn list_all_by_project(&self, project_guid: String) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_all_by_project(&project_guid).await?;
        let workspace_guids: Vec<String> = models.iter().map(|model| model.guid.clone()).collect();
        let mut labels_by_workspace = repo
            .list_labels_by_workspace_guids(&workspace_guids)
            .await?;
        Ok(models
            .into_iter()
            .map(|model| {
                let labels = labels_by_workspace.remove(&model.guid).unwrap_or_default();
                self.to_dto_lenient(model, labels)
            })
            .collect())
    }

    /// 删除工作区的 worktree（仅清理 git worktree，不删除数据库记录）
    pub async fn cleanup_worktree(
        &self,
        workspace_name: &str,
        branch_name: &str,
        project_main_path: &str,
    ) -> Result<()> {
        let repo_path = Path::new(project_main_path);
        if let Err(e) = self
            .git_engine
            .remove_worktree(repo_path, workspace_name, branch_name, false)
        {
            tracing::warn!(
                "Failed to remove worktree for workspace {}: {}",
                workspace_name,
                e
            );
        }
        Ok(())
    }

    /// 获取工作区终端布局
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.get_terminal_layout(&guid).await?)
    }

    /// 更新工作区终端布局
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_terminal_layout(&guid, layout).await?)
    }

    /// 更新工作区最大化终端 ID
    pub async fn update_maximized_terminal_id(
        &self,
        guid: String,
        terminal_id: Option<String>,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .update_maximized_terminal_id(&guid, terminal_id)
            .await?)
    }
}
