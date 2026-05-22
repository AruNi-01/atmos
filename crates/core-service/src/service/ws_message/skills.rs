use super::*;

impl WsMessageService {
    /// Best-effort invalidation of the skills disk cache. Called after any mutation
    /// (enable/disable, delete, system sync) so the next list call returns fresh data.
    fn invalidate_skills_cache() {
        if let Ok(cache) = infra::utils::disk_cache::DiskCache::new() {
            if let Err(e) = cache.remove_feature("skills") {
                tracing::warn!(error = %e, "failed to invalidate skills disk cache");
            }
        }
    }

    pub(super) async fn handle_skills_list(&self, req: SkillsListRequest) -> Result<Value> {
        use crate::service::skill::{ScanMode, SkillScanner};
        use infra::utils::disk_cache::DiskCache;
        use std::time::Duration;

        const FEATURE: &str = "skills";
        const CACHE_KEY: &str = "list";
        const TTL: Duration = Duration::from_secs(30 * 60);

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        let cache = DiskCache::new().ok();

        async fn run_scan(
            project_paths: Vec<(String, String, String)>,
        ) -> Result<Vec<infra::SkillInfo>> {
            tokio::task::spawn_blocking(move || {
                SkillScanner::scan_all_with_mode(&project_paths, ScanMode::Lazy)
            })
            .await
            .map_err(|e| ServiceError::Processing(format!("skills scan join error: {e}")))
        }

        fn strip_for_cache(skills: &[infra::SkillInfo]) -> Vec<infra::SkillInfo> {
            skills
                .iter()
                .map(|s| {
                    let mut s = s.clone();
                    for f in &mut s.files {
                        f.content = None;
                    }
                    s
                })
                .collect()
        }

        if req.force_refresh {
            let skills = run_scan(project_paths).await?;
            if let Some(cache) = cache.as_ref() {
                if let Err(e) = cache.put(FEATURE, CACHE_KEY, &strip_for_cache(&skills)) {
                    tracing::warn!(error = %e, "disk_cache put (force) failed");
                }
            }
            return Ok(json!({ "skills": skills }));
        }

        if let Some(cache) = cache.as_ref() {
            match cache.get::<Vec<infra::SkillInfo>>(FEATURE, CACHE_KEY) {
                Ok(Some(entry)) => {
                    if entry.age >= TTL {
                        let project_paths_bg = project_paths.clone();
                        let cache_bg = cache.clone();
                        tokio::spawn(async move {
                            match run_scan(project_paths_bg).await {
                                Ok(fresh) => {
                                    if let Err(e) =
                                        cache_bg.put(FEATURE, CACHE_KEY, &strip_for_cache(&fresh))
                                    {
                                        tracing::warn!(
                                            error = %e,
                                            "background disk_cache put failed"
                                        );
                                    }
                                }
                                Err(e) => tracing::warn!(
                                    error = %e,
                                    "background skills rescan failed"
                                ),
                            }
                        });
                    }
                    return Ok(json!({ "skills": entry.value }));
                }
                Ok(None) => {}
                Err(e) => tracing::warn!(error = %e, "disk_cache get failed; scanning"),
            }
        }

        let skills = run_scan(project_paths).await?;
        if let Some(cache) = cache.as_ref() {
            if let Err(e) = cache.put(FEATURE, CACHE_KEY, &strip_for_cache(&skills)) {
                tracing::warn!(error = %e, "disk_cache put (miss) failed");
            }
        }
        Ok(json!({ "skills": skills }))
    }

    pub(super) async fn handle_skills_get(&self, req: SkillsGetRequest) -> Result<Value> {
        use crate::service::skill::SkillScanner;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        let skill = SkillScanner::scan_one(&project_paths, &req.scope, &req.id);

        if let Some(skill) = skill {
            Ok(json!(skill))
        } else {
            Err(ServiceError::Validation("Skill not found".to_string()))
        }
    }

    pub(super) async fn handle_skills_set_enabled(
        &self,
        req: SkillsSetEnabledRequest,
    ) -> Result<Value> {
        use crate::service::skill::SkillManager;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        SkillManager::set_enabled(
            &project_paths,
            &req.id,
            req.enabled,
            req.placement_ids.as_deref(),
        )?;

        Self::invalidate_skills_cache();
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_skills_delete(&self, req: SkillsDeleteRequest) -> Result<Value> {
        use crate::service::skill::SkillManager;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        SkillManager::delete(&project_paths, &req.id, req.placement_ids.as_deref())?;

        Self::invalidate_skills_cache();
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_wiki_skill_install(&self) -> Result<Value> {
        let home = dirs::home_dir().ok_or_else(|| {
            ServiceError::Validation("Cannot determine home directory".to_string())
        })?;
        let system_dir = home.join(".atmos").join("skills").join(".system");
        let target_dir = system_dir.join("project-wiki");

        if target_dir.exists() {
            let temp_to_clean =
                Self::install_missing_wiki_skills_from_project_then_github(&system_dir).await?;
            if let Some(temp) = temp_to_clean {
                let _ = std::fs::remove_dir_all(temp);
            }
            return Ok(json!({
                "success": true,
                "path": target_dir.to_string_lossy(),
                "message": "Skill already installed"
            }));
        }

        if let Some(parent) = target_dir.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create directory: {}", e))
            })?;
        }

        let project_root = std::env::current_dir().unwrap_or_default();
        let source_in_project = project_root.join("skills").join("project-wiki");
        if source_in_project.exists() && source_in_project.is_dir() {
            Self::copy_dir_all(&source_in_project, &target_dir)
                .map_err(|e| ServiceError::Validation(format!("Failed to copy skill: {}", e)))?;
            Self::install_project_wiki_update_if_needed(&system_dir)?;
            Self::install_project_wiki_specify_if_needed(&system_dir)?;
            return Ok(json!({
                "success": true,
                "path": target_dir.to_string_lossy(),
                "message": "Skill installed from project"
            }));
        }

        let temp_dir =
            std::env::temp_dir().join(format!("atmos-wiki-skill-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let clone_path = temp_dir.join("atmos");

        let clone_status = tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth",
                "1",
                "https://github.com/AruNi-01/atmos.git",
                clone_path.to_str().unwrap_or("atmos"),
            ])
            .current_dir(temp_dir.parent().unwrap_or(&std::env::temp_dir()))
            .status()
            .await
            .map_err(|e| ServiceError::Validation(format!("Git clone failed: {}", e)))?;

        if !clone_status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(ServiceError::Validation(
                "Failed to clone from GitHub. Check network and git installation.".to_string(),
            ));
        }

        let skill_src = clone_path.join("skills").join("project-wiki");
        if skill_src.exists() {
            Self::copy_dir_all(&skill_src, &target_dir)
                .map_err(|e| ServiceError::Validation(format!("Failed to copy skill: {}", e)))?;
        }
        let update_src = clone_path.join("skills").join("project-wiki-update");
        if update_src.exists() && update_src.is_dir() {
            let update_dst = system_dir.join("project-wiki-update");
            let _ = std::fs::create_dir_all(system_dir.as_path());
            let _ = Self::copy_dir_all(&update_src, &update_dst);
        }
        let specify_src = clone_path.join("skills").join("project-wiki-specify");
        if specify_src.exists() && specify_src.is_dir() {
            let specify_dst = system_dir.join("project-wiki-specify");
            let _ = std::fs::create_dir_all(system_dir.as_path());
            let _ = Self::copy_dir_all(&specify_src, &specify_dst);
        }
        Self::install_project_wiki_update_if_needed(&system_dir)?;
        Self::install_project_wiki_specify_if_needed(&system_dir)?;
        let _ = std::fs::remove_dir_all(&temp_dir);

        Ok(json!({
            "success": true,
            "path": target_dir.to_string_lossy(),
            "message": "Skill installed from GitHub"
        }))
    }

    async fn install_missing_wiki_skills_from_project_then_github(
        system_dir: &std::path::Path,
    ) -> Result<Option<std::path::PathBuf>> {
        Self::install_project_wiki_update_if_needed(system_dir)?;
        Self::install_project_wiki_specify_if_needed(system_dir)?;

        let update_ok = system_dir
            .join("project-wiki-update")
            .join("SKILL.md")
            .exists();
        let specify_ok = system_dir
            .join("project-wiki-specify")
            .join("SKILL.md")
            .exists();
        if update_ok && specify_ok {
            return Ok(None);
        }

        let temp_dir =
            std::env::temp_dir().join(format!("atmos-wiki-skill-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let clone_path = temp_dir.join("atmos");

        let clone_status = tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth",
                "1",
                "https://github.com/AruNi-01/atmos.git",
                clone_path.to_str().unwrap_or("atmos"),
            ])
            .current_dir(temp_dir.parent().unwrap_or(&std::env::temp_dir()))
            .status()
            .await
            .map_err(|e| ServiceError::Validation(format!("Git clone failed: {}", e)))?;

        if !clone_status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(ServiceError::Validation(
                "Failed to clone from GitHub. Check network and git installation.".to_string(),
            ));
        }

        if !update_ok {
            let update_src = clone_path.join("skills").join("project-wiki-update");
            if update_src.exists() && update_src.is_dir() {
                let update_dst = system_dir.join("project-wiki-update");
                let _ = std::fs::create_dir_all(system_dir);
                Self::copy_dir_all(&update_src, &update_dst).map_err(|e| {
                    ServiceError::Validation(format!("Failed to copy project-wiki-update: {}", e))
                })?;
            }
        }
        if !specify_ok {
            let specify_src = clone_path.join("skills").join("project-wiki-specify");
            if specify_src.exists() && specify_src.is_dir() {
                let specify_dst = system_dir.join("project-wiki-specify");
                let _ = std::fs::create_dir_all(system_dir);
                Self::copy_dir_all(&specify_src, &specify_dst).map_err(|e| {
                    ServiceError::Validation(format!("Failed to copy project-wiki-specify: {}", e))
                })?;
            }
        }

        Ok(Some(temp_dir))
    }

    fn install_project_wiki_update_if_needed(system_dir: &std::path::Path) -> Result<()> {
        let target = system_dir.join("project-wiki-update");
        if target.exists() {
            return Ok(());
        }
        let project_root = std::env::current_dir().unwrap_or_default();
        let source = project_root.join("skills").join("project-wiki-update");
        if source.exists() && source.is_dir() {
            Self::copy_dir_all(&source, &target).map_err(|e| {
                ServiceError::Validation(format!("Failed to copy project-wiki-update: {}", e))
            })?;
        }
        Ok(())
    }

    fn install_project_wiki_specify_if_needed(system_dir: &std::path::Path) -> Result<()> {
        let target = system_dir.join("project-wiki-specify");
        if target.exists() {
            return Ok(());
        }
        let project_root = std::env::current_dir().unwrap_or_default();
        let source = project_root.join("skills").join("project-wiki-specify");
        if source.exists() && source.is_dir() {
            Self::copy_dir_all(&source, &target).map_err(|e| {
                ServiceError::Validation(format!("Failed to copy project-wiki-specify: {}", e))
            })?;
        }
        Ok(())
    }

    pub(super) async fn handle_wiki_skill_system_status(&self) -> Result<Value> {
        let system_dir = dirs::home_dir().map(|h| h.join(".atmos").join("skills").join(".system"));
        let installed = system_dir
            .map(|d| {
                let skill_ok = |name: &str| {
                    let skill_path = d.join(name);
                    let skill_md = skill_path.join("SKILL.md");
                    skill_path.exists()
                        && skill_path.is_dir()
                        && skill_md.exists()
                        && skill_md.is_file()
                };
                skill_ok("project-wiki")
                    && skill_ok("project-wiki-update")
                    && skill_ok("project-wiki-specify")
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    pub(super) async fn handle_code_review_skill_system_status(&self) -> Result<Value> {
        let system_dir = dirs::home_dir().map(|h| {
            h.join(".atmos")
                .join("skills")
                .join(".system")
                .join("code_review_skills")
        });
        let installed = system_dir
            .map(|d| {
                let skill_ok = |name: &str| {
                    let skill_path = d.join(name);
                    let skill_md = skill_path.join("SKILL.md");
                    skill_path.exists()
                        && skill_path.is_dir()
                        && skill_md.exists()
                        && skill_md.is_file()
                };
                skill_ok("fullstack-reviewer")
                    && skill_ok("code-review-expert")
                    && skill_ok("typescript-react-reviewer")
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    pub(super) async fn handle_git_commit_skill_system_status(&self) -> Result<Value> {
        let installed = dirs::home_dir()
            .map(|h| {
                let skill_md = h
                    .join(".atmos")
                    .join("skills")
                    .join(".system")
                    .join("git-commit")
                    .join("SKILL.md");
                skill_md.exists() && skill_md.is_file()
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    pub(super) async fn handle_sync_single_system_skill(
        &self,
        req: SyncSingleSystemSkillRequest,
    ) -> Result<Value> {
        let skill_name = req.skill_name;
        let result = tokio::task::spawn_blocking(move || {
            infra::utils::system_skill_sync::sync_single_system_skill(&skill_name)
        })
        .await
        .map_err(|e| ServiceError::Processing(format!("Task join error: {}", e)))?;

        match result {
            Ok(()) => Ok(json!({ "success": true })),
            Err(msg) => Err(ServiceError::Processing(msg)),
        }
    }

    pub(super) async fn handle_skills_system_sync(&self) -> Result<Value> {
        tokio::task::spawn_blocking(move || {
            let report = infra::utils::system_skill_sync::sync_system_skills_with_report();
            tracing::info!(
                "System skill sync background result: versions={:?}, missing={:?}",
                report.versions,
                report.missing_skills
            );
            Self::invalidate_skills_cache();
        });

        Ok(json!({ "initiated": true }))
    }

    fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            if ty.is_symlink() {
                let target = std::fs::read_link(&src_path)?;
                #[cfg(unix)]
                std::os::unix::fs::symlink(&target, &dst_path)?;
                #[cfg(windows)]
                {
                    let target_is_dir = std::fs::metadata(&src_path)
                        .map(|m| m.is_dir())
                        .unwrap_or(false);
                    if target_is_dir {
                        std::os::windows::fs::symlink_dir(&target, &dst_path)?;
                    } else {
                        std::os::windows::fs::symlink_file(&target, &dst_path)?;
                    }
                }
            } else if ty.is_dir() {
                Self::copy_dir_all(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }
}
