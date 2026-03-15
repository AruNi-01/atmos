use crate::error::{Result, ServiceError};
use crate::utils::workspace_name_generator;
use core_engine::{FsEngine, GitEngine};
use infra::GithubIssuePayload;
use infra::db::entities::workspace;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use llm::{
    FileLlmConfigStore, GenerateTextRequest, LlmFeature, ResponseFormat, generate_text,
    generate_text_stream, render_prompt_template,
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

#[derive(Serialize)]
pub struct WorkspaceDto {
    #[serde(flatten)]
    pub model: workspace::Model,
    pub local_path: String,
    pub github_issue: Option<GithubIssuePayload>,
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

    fn to_dto(&self, model: workspace::Model) -> Result<WorkspaceDto> {
        let local_path = self
            .git_engine
            .get_worktree_path(&model.name)?
            .to_string_lossy()
            .to_string();
        let github_issue = self.parse_github_issue(&model.github_issue_data)?;
        Ok(WorkspaceDto {
            model,
            local_path,
            github_issue,
        })
    }

    fn to_dto_lenient(&self, model: workspace::Model) -> WorkspaceDto {
        let local_path = self
            .git_engine
            .get_worktree_path(&model.name)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let github_issue = model
            .github_issue_data
            .as_deref()
            .and_then(|raw| serde_json::from_str::<GithubIssuePayload>(raw).ok());
        WorkspaceDto {
            model,
            local_path,
            github_issue,
        }
    }

    fn to_dtos(&self, models: Vec<workspace::Model>) -> Result<Vec<WorkspaceDto>> {
        models.into_iter().map(|m| self.to_dto(m)).collect()
    }

    fn to_dtos_lenient(&self, models: Vec<workspace::Model>) -> Vec<WorkspaceDto> {
        models.into_iter().map(|m| self.to_dto_lenient(m)).collect()
    }

    pub async fn list_by_project(&self, project_guid: String) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_by_project(&project_guid).await?;
        self.to_dtos(models)
    }

    pub async fn get_workspace(&self, guid: String) -> Result<Option<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let model = repo.find_by_guid(&guid).await?;
        model.map(|m| self.to_dto(m)).transpose()
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

    /// 创建新工作区
    ///
    /// If `name` is empty, a unique Pokemon-based name will be generated.
    /// If `name` is provided, it will be used (with conflict resolution if needed).
    pub async fn create_workspace(
        &self,
        project_guid: String,
        display_name: Option<String>,
        branch: String,
        sidebar_order: i32,
        github_issue: Option<GithubIssuePayload>,
    ) -> Result<WorkspaceDto> {
        // Get project to find the repository path and name
        let project_repo = ProjectRepo::new(&self.db);
        let project = project_repo
            .find_by_guid(&project_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", project_guid)))?;

        let repo_path = Path::new(&project.main_file_path);

        // Get the default branch from the repository
        let _base_branch = self
            .git_engine
            .get_default_branch(repo_path)
            .unwrap_or_else(|_| "main".to_string());

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
        let requested_branch = branch.trim().to_string();

        let initial_handle = if !requested_branch.is_empty() {
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
            let mut final_name = format!("{project_scope}/{}", initial_handle);
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
                final_name = format!("{project_scope}/{generated}");
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

        if existing_branches.contains(&final_branch) {
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
        let model = workspace_repo
            .create(
                project_guid,
                final_name.clone(),
                requested_display_name,
                final_branch,
                sidebar_order,
                github_issue_url,
                github_issue_data,
            )
            .await?;

        self.to_dto(model)
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
        let base_branch = self
            .git_engine
            .get_default_branch(repo_path)
            .unwrap_or("main".to_string());

        tracing::info!(
            "[ensure_worktree_ready] Base branch: {}, existing branches count: {}",
            base_branch,
            existing_branches.len()
        );

        if existing_branches.contains(&workspace.branch) {
            return Err(ServiceError::Validation(format!(
                "Branch `{}` already exists. Please choose a different branch name.",
                workspace.branch
            )));
        }

        match self
            .git_engine
            .create_worktree(repo_path, &workspace.name, &workspace.branch, &base_branch)
        {
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

    pub async fn write_workspace_requirement(
        &self,
        guid: String,
        initial_requirement: Option<String>,
        github_issue: Option<GithubIssuePayload>,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        let workspace = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Workspace {} not found", guid)))?;
        let workspace_path = self.git_engine.get_worktree_path(&workspace.name)?;

        if let Some(requirement) =
            self.render_requirement_markdown(initial_requirement.as_deref(), github_issue.as_ref())
        {
            let requirement_path = workspace_path.join(".atmos/context/requirement.md");
            self.fs_engine.write_file(&requirement_path, &requirement)?;
        }

        Ok(())
    }

    pub async fn write_workspace_task_markdown(&self, guid: String, markdown: String) -> Result<()> {
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
        generate_text_stream(&provider, request).await.map_err(|error| {
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
        let Some(language) = output_language.map(str::trim).filter(|value| !value.is_empty()) else {
            return String::new();
        };

        format!(
            "Output language requirement:\n- Write every TODO item strictly in {language}.\n- This output-language requirement overrides the language of the issue title, body, logs, and examples.\n- Do not mix in any other natural language.\n- Keep only the markdown checkbox syntax unchanged."
        )
    }

    fn build_todo_user_language_instruction(output_language: Option<&str>) -> String {
        let Some(language) = output_language.map(str::trim).filter(|value| !value.is_empty()) else {
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

                if let Some((_, content)) = trimmed.split_once(". ") {
                    let content = content.trim();
                    return (!content.is_empty()).then(|| format!("- [ ] {}", content));
                }

                Some(format!("- [ ] {}", trimmed))
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn render_requirement_markdown(
        &self,
        initial_requirement: Option<&str>,
        github_issue: Option<&GithubIssuePayload>,
    ) -> Option<String> {
        let trimmed_requirement = initial_requirement
            .map(str::trim)
            .filter(|value| !value.is_empty());

        if github_issue.is_none() && trimmed_requirement.is_none() {
            return None;
        }

        let mut sections = vec!["# Requirement Specification".to_string()];

        if let Some(issue) = github_issue {
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
        }

        if let Some(requirement) = trimmed_requirement {
            sections.push(format!("## Additional Notes\n\n{}\n", requirement));
        }

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

    /// 更新工作区名称
    pub async fn update_name(&self, guid: String, name: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_name(&guid, name).await?)
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: String, branch: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_branch(&guid, branch).await?)
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_order(&guid, order).await?)
    }

    /// 删除工作区
    pub async fn delete_workspace(&self, guid: String) -> Result<()> {
        let workspace_repo = WorkspaceRepo::new(&self.db);

        // Get workspace info before deleting
        if let Some(workspace) = workspace_repo.find_by_guid(&guid).await? {
            // Get project to find repo path
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                let repo_path = Path::new(&project.main_file_path);

                // Remove the git worktree (ignore errors - workspace may not have worktree)
                if let Err(e) =
                    self.git_engine
                        .remove_worktree(repo_path, &workspace.name, &workspace.branch)
                {
                    tracing::warn!(
                        "Failed to remove worktree for workspace {}: {}",
                        workspace.name,
                        e
                    );
                }
            }
        }

        // Soft delete from database
        Ok(workspace_repo.soft_delete(&guid).await?)
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
        Ok(self.to_dtos_lenient(models))
    }

    pub async fn list_all_by_project(&self, project_guid: String) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_all_by_project(&project_guid).await?;
        Ok(self.to_dtos_lenient(models))
    }

    /// 删除工作区的 worktree（仅清理 git worktree，不删除数据库记录）
    pub async fn cleanup_worktree(
        &self,
        workspace_name: &str,
        project_main_path: &str,
    ) -> Result<()> {
        let repo_path = Path::new(project_main_path);
        if let Err(e) = self
            .git_engine
            .remove_worktree(repo_path, workspace_name, workspace_name)
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
