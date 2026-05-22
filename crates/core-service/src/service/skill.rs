//! Skills scanning and management service.

#[path = "skill/metadata.rs"]
mod metadata;
#[path = "skill/scanner.rs"]
mod scanner;
#[path = "skill/support.rs"]
mod support;
#[path = "skill/types.rs"]
mod types;

use self::support::{
    delete_entry_without_following_symlink, ensure_selection_applied,
    move_entry_without_following_symlink, placement_matches_selection, project_records,
    selected_placement_ids, ProjectPathRecord,
};
pub use self::types::ScanMode;
use crate::error::{Result, ServiceError};
use crate::{SkillInfo, SkillPlacement};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const DISABLED_STORAGE_REL_PATH: &str = ".atmos/skills/.disabled";

pub struct SkillScanner;

pub struct SkillManager;

impl SkillManager {
    pub fn set_enabled(
        project_paths: &[(String, String, String)],
        skill_id: &str,
        enabled: bool,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        let project_records = project_records(project_paths);
        let skill = Self::load_managed_skill(project_paths, skill_id)?;
        let desired_status = if enabled { "enabled" } else { "disabled" };
        let selected_placement_ids = selected_placement_ids(placement_ids)?;

        let mut seen_paths = HashSet::new();
        for placement in skill.placements.iter().filter(|placement| {
            placement.can_toggle
                && placement.status != desired_status
                && placement_matches_selection(placement, &selected_placement_ids)
        }) {
            if !seen_paths.insert(placement.path.clone()) {
                continue;
            }

            let from = PathBuf::from(&placement.path);
            let to = if enabled {
                PathBuf::from(&placement.original_path)
            } else {
                Self::disabled_path_for(&project_records, placement)?
            };

            move_entry_without_following_symlink(&from, &to)?;
        }

        ensure_selection_applied(&skill, &selected_placement_ids, |placement| {
            placement.can_toggle && placement.status != desired_status
        })?;

        Ok(())
    }

    pub fn delete(
        project_paths: &[(String, String, String)],
        skill_id: &str,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        let skill = Self::load_managed_skill(project_paths, skill_id)?;
        let selected_placement_ids = selected_placement_ids(placement_ids)?;
        let mut seen_paths = HashSet::new();

        for placement in skill.placements.iter().filter(|placement| {
            placement.can_delete && placement_matches_selection(placement, &selected_placement_ids)
        }) {
            if !seen_paths.insert(placement.path.clone()) {
                continue;
            }
            delete_entry_without_following_symlink(Path::new(&placement.path))?;
        }

        ensure_selection_applied(&skill, &selected_placement_ids, |placement| {
            placement.can_delete
        })?;

        Ok(())
    }

    fn load_managed_skill(
        project_paths: &[(String, String, String)],
        skill_id: &str,
    ) -> Result<SkillInfo> {
        let skill = SkillScanner::scan_all(project_paths)
            .into_iter()
            .find(|skill| skill.id == skill_id)
            .ok_or_else(|| ServiceError::Validation("Skill not found".to_string()))?;

        if !skill.manageable || skill.scope == "inside_project" {
            return Err(ServiceError::Validation(
                "InsideTheProject skills are read-only".to_string(),
            ));
        }

        Ok(skill)
    }

    fn disabled_path_for(
        project_records: &[ProjectPathRecord],
        placement: &SkillPlacement,
    ) -> Result<PathBuf> {
        let original_path = PathBuf::from(&placement.original_path);
        let scope_root = match placement.scope.as_str() {
            "global" => dirs::home_dir().ok_or_else(|| {
                ServiceError::Validation("Cannot determine home directory".to_string())
            })?,
            "project" => project_records
                .iter()
                .find(|record| Some(record.project_id.as_str()) == placement.project_id.as_deref())
                .map(|record| record.root_path.clone())
                .ok_or_else(|| {
                    ServiceError::Validation("Project root not found for skill".to_string())
                })?,
            _ => {
                return Err(ServiceError::Validation(
                    "This skill cannot be disabled".to_string(),
                ));
            }
        };

        let relative = original_path.strip_prefix(&scope_root).map_err(|_| {
            ServiceError::Validation("Skill path is outside of its managed root".to_string())
        })?;

        Ok(scope_root.join(DISABLED_STORAGE_REL_PATH).join(relative))
    }
}

#[cfg(test)]
#[path = "skill/tests.rs"]
mod tests;
