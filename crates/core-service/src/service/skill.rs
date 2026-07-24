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
    delete_entry_without_following_symlink, ensure_entry_local_to_root, ensure_selection_applied,
    move_entry_without_following_symlink, placement_matches_selection, project_records,
    selected_placement_ids, ProjectPathRecord,
};
pub use self::types::ScanMode;
use crate::error::{Result, ServiceError};
use crate::{SkillInfo, SkillPlacement};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const DISABLED_STORAGE_REL_PATH: &str = ".atmos/skills/.disabled";
const SKILL_DISABLED_MARKER: &str = "SKILL_DISABLED.md";

const SKILL_DISABLED_MARKER_CONTENT: &str = r#"---
atmos_skill_disabled: true
---

# Skill disabled

This skill has been disabled by the user in Atmos.

The original skill files were moved to Atmos disabled storage.
Do not use this skill. Do not search for or restore the original skill content from other paths.
"#;

pub struct SkillScanner;

pub struct SkillManager;

/// Extra manageable root (project or workspace) supplied by the caller.
#[derive(Debug, Clone)]
pub struct SkillScopeRoot {
    pub scope: String,
    pub id: String,
    pub name: String,
    pub path: String,
}

impl SkillManager {
    pub fn set_enabled(
        project_paths: &[(String, String, String)],
        skill_id: &str,
        enabled: bool,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        Self::set_enabled_with_extra_roots(project_paths, &[], skill_id, enabled, placement_ids)
    }

    pub fn set_enabled_with_extra_roots(
        project_paths: &[(String, String, String)],
        extra_roots: &[SkillScopeRoot],
        skill_id: &str,
        enabled: bool,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        let project_records = Self::merged_root_records(project_paths, extra_roots);
        let skill =
            Self::load_managed_skill_with_extra_roots(project_paths, extra_roots, skill_id)?;
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

            if placement.scope == "workspace" {
                let scope_root = Self::scope_root_for(&project_records, placement)?;
                // Localize the path that currently exists on disk before moving.
                ensure_entry_local_to_root(&scope_root, &from)?;
            }

            if enabled {
                // Clear the live-path marker so restore can recreate the skill dir.
                Self::remove_skill_disabled_marker(&to)?;
                move_entry_without_following_symlink(&from, &to)?;
            } else {
                let marker_dir = PathBuf::from(&placement.original_path);
                move_entry_without_following_symlink(&from, &to)?;
                // Leave a non-SKILL.md marker so Agents that already know this path
                // hit a dead entrypoint, while new scans skip the directory.
                Self::write_skill_disabled_marker(&marker_dir)?;
            }
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
        Self::load_managed_skill_with_extra_roots(project_paths, &[], skill_id)
    }

    fn load_managed_skill_with_extra_roots(
        project_paths: &[(String, String, String)],
        extra_roots: &[SkillScopeRoot],
        skill_id: &str,
    ) -> Result<SkillInfo> {
        let skill = SkillScanner::scan_all_with_extra_roots(project_paths, extra_roots)
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

    fn merged_root_records(
        project_paths: &[(String, String, String)],
        extra_roots: &[SkillScopeRoot],
    ) -> Vec<ProjectPathRecord> {
        let mut records = project_records(project_paths);
        for root in extra_roots {
            if root.scope != "project" && root.scope != "workspace" {
                continue;
            }
            if records.iter().any(|record| {
                record.project_id == root.id && record.root_path == Path::new(&root.path)
            }) {
                continue;
            }
            records.push(ProjectPathRecord {
                project_id: root.id.clone(),
                root_path: PathBuf::from(&root.path),
            });
        }
        records
    }

    fn scope_root_for(
        project_records: &[ProjectPathRecord],
        placement: &SkillPlacement,
    ) -> Result<PathBuf> {
        match placement.scope.as_str() {
            "global" => dirs::home_dir().ok_or_else(|| {
                ServiceError::Validation("Cannot determine home directory".to_string())
            }),
            "project" | "workspace" => project_records
                .iter()
                .find(|record| Some(record.project_id.as_str()) == placement.project_id.as_deref())
                .map(|record| record.root_path.clone())
                .ok_or_else(|| {
                    ServiceError::Validation("Managed root not found for skill".to_string())
                }),
            _ => Err(ServiceError::Validation(
                "This skill cannot be disabled".to_string(),
            )),
        }
    }

    fn disabled_path_for(
        project_records: &[ProjectPathRecord],
        placement: &SkillPlacement,
    ) -> Result<PathBuf> {
        let original_path = PathBuf::from(&placement.original_path);
        let scope_root = Self::scope_root_for(project_records, placement)?;

        let relative = original_path.strip_prefix(&scope_root).map_err(|_| {
            ServiceError::Validation("Skill path is outside of its managed root".to_string())
        })?;

        Ok(scope_root.join(DISABLED_STORAGE_REL_PATH).join(relative))
    }

    fn write_skill_disabled_marker(original_skill_dir: &Path) -> Result<()> {
        if let Some(parent) = original_skill_dir.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!(
                    "Failed to create skill marker parent '{}': {}",
                    parent.display(),
                    e
                ))
            })?;
        }
        fs::create_dir_all(original_skill_dir).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create skill disabled marker directory '{}': {}",
                original_skill_dir.display(),
                e
            ))
        })?;
        let marker_path = original_skill_dir.join(SKILL_DISABLED_MARKER);
        fs::write(&marker_path, SKILL_DISABLED_MARKER_CONTENT).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to write skill disabled marker '{}': {}",
                marker_path.display(),
                e
            ))
        })?;
        Ok(())
    }

    fn remove_skill_disabled_marker(original_skill_dir: &Path) -> Result<()> {
        let marker_path = original_skill_dir.join(SKILL_DISABLED_MARKER);
        if marker_path.is_file() {
            fs::remove_file(&marker_path).map_err(|e| {
                ServiceError::Validation(format!(
                    "Failed to remove skill disabled marker '{}': {}",
                    marker_path.display(),
                    e
                ))
            })?;
        }

        // Remove the placeholder directory when it only held the marker (or is empty).
        if original_skill_dir.is_dir() {
            let is_empty = fs::read_dir(original_skill_dir)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
            if is_empty {
                fs::remove_dir(original_skill_dir).map_err(|e| {
                    ServiceError::Validation(format!(
                        "Failed to remove skill disabled marker directory '{}': {}",
                        original_skill_dir.display(),
                        e
                    ))
                })?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
#[path = "skill/tests.rs"]
mod tests;
