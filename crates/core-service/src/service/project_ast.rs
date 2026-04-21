use crate::error::{Result, ServiceError};
use core_engine::{build_code_ast_artifacts, CodeAstBuildResult, GitEngine};
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use parking_lot::Mutex;
use sea_orm::DatabaseConnection;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex as AsyncMutex;

const PROJECT_WIKI_AST_DIR: &str = ".atmos/wiki/_ast";

pub struct ProjectAstService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
    build_locks: Mutex<HashMap<PathBuf, Arc<AsyncMutex<()>>>>,
}

impl ProjectAstService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
            build_locks: Mutex::new(HashMap::new()),
        }
    }

    pub async fn build_project_wiki_ast(
        &self,
        context_id: String,
        project_path: String,
    ) -> Result<CodeAstBuildResult> {
        let project_root = self
            .resolve_project_ast_root(&context_id, PathBuf::from(project_path))
            .await?;
        let artifact_dir = project_root.join(PROJECT_WIKI_AST_DIR);
        let build_lock = self.build_lock_for(&artifact_dir);
        let _build_guard = build_lock.lock().await;

        Ok(tokio::task::spawn_blocking(move || {
            build_code_ast_artifacts(&project_root, &artifact_dir)
        })
        .await
        .map_err(|error| {
            ServiceError::Processing(format!("AST worker join failed: {}", error))
        })??)
    }

    async fn resolve_project_ast_root(
        &self,
        context_id: &str,
        requested_path: PathBuf,
    ) -> Result<PathBuf> {
        let requested_path = canonical_project_dir(requested_path)?;
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let mut allowed_roots = Vec::new();

        if let Some(workspace) = workspace_repo.find_by_guid(context_id).await? {
            if let Ok(local_path) = self.git_engine.get_worktree_path(&workspace.name) {
                allowed_roots.push(local_path);
            }
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                allowed_roots.push(PathBuf::from(project.main_file_path));
            }
        }

        if let Some(project) = project_repo.find_by_guid(context_id).await? {
            allowed_roots.push(PathBuf::from(project.main_file_path));
        }

        if allowed_roots.is_empty() {
            return Err(ServiceError::Validation(format!(
                "Unknown workspace or project: {}",
                context_id
            )));
        }

        for allowed_root in allowed_roots {
            if let Ok(allowed_root) = canonical_project_dir(allowed_root) {
                if requested_path == allowed_root {
                    return Ok(requested_path);
                }
                if requested_path.starts_with(&allowed_root) {
                    return Ok(requested_path);
                }
            }
        }

        Err(ServiceError::Validation(
            "Project path is outside the resolved workspace/project root".to_string(),
        ))
    }

    fn build_lock_for(&self, artifact_dir: &Path) -> Arc<AsyncMutex<()>> {
        let mut locks = self.build_locks.lock();
        Arc::clone(
            locks
                .entry(artifact_dir.to_path_buf())
                .or_insert_with(|| Arc::new(AsyncMutex::new(()))),
        )
    }
}

fn canonical_project_dir(path: PathBuf) -> Result<PathBuf> {
    let trimmed = path.to_string_lossy().trim().to_string();
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(ServiceError::Validation(format!(
            "Invalid project path: {}",
            path.display()
        )));
    }
    std::fs::canonicalize(&path).map_err(|error| {
        ServiceError::Validation(format!(
            "Failed to resolve project path {}: {}",
            path.display(),
            error
        ))
    })
}

pub fn project_wiki_ast_dir() -> &'static Path {
    Path::new(PROJECT_WIKI_AST_DIR)
}
