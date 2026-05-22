use crate::error::{Result, ServiceError};
use infra::{SkillInfo, SkillPlacement};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub(super) struct ProjectPathRecord {
    pub(super) project_id: String,
    pub(super) root_path: PathBuf,
}

pub(super) fn is_manageable_scope(scope: &str) -> bool {
    matches!(scope, "global" | "project")
}

pub(super) fn build_skill_id(scope: &str, project_id: Option<&str>, name: &str) -> String {
    let project_key = project_id.unwrap_or("-");
    format!("{scope}::{project_key}::{name}")
}

pub(super) fn build_placement_id(
    scope: &str,
    project_id: Option<&str>,
    agent: &str,
    original_path: &Path,
    status: &str,
) -> String {
    let project_key = project_id.unwrap_or("-");
    format!(
        "{}::{}::{}::{}::{}",
        scope,
        project_key,
        agent,
        status,
        original_path.to_string_lossy()
    )
}

pub(super) fn project_records(
    project_paths: &[(String, String, String)],
) -> Vec<ProjectPathRecord> {
    project_paths
        .iter()
        .map(|(project_id, _project_name, root_path)| ProjectPathRecord {
            project_id: project_id.clone(),
            root_path: PathBuf::from(root_path),
        })
        .collect()
}

pub(super) fn selected_placement_ids(
    placement_ids: Option<&[String]>,
) -> Result<Option<HashSet<&str>>> {
    let Some(placement_ids) = placement_ids else {
        return Ok(None);
    };

    if placement_ids.is_empty() {
        return Err(ServiceError::Validation(
            "Please choose at least one skill location".to_string(),
        ));
    }

    Ok(Some(
        placement_ids
            .iter()
            .map(std::string::String::as_str)
            .collect(),
    ))
}

pub(super) fn placement_matches_selection(
    placement: &SkillPlacement,
    selected_placement_ids: &Option<HashSet<&str>>,
) -> bool {
    selected_placement_ids
        .as_ref()
        .is_none_or(|selected| selected.contains(placement.id.as_str()))
}

pub(super) fn ensure_selection_applied(
    skill: &SkillInfo,
    selected_placement_ids: &Option<HashSet<&str>>,
    predicate: impl Fn(&SkillPlacement) -> bool,
) -> Result<()> {
    if selected_placement_ids.is_none() {
        return Ok(());
    }

    let matched = skill.placements.iter().any(|placement| {
        predicate(placement) && placement_matches_selection(placement, selected_placement_ids)
    });

    if matched {
        Ok(())
    } else {
        Err(ServiceError::Validation(
            "No matching skill locations were available for this action".to_string(),
        ))
    }
}

pub(super) fn move_entry_without_following_symlink(from: &Path, to: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(from).map_err(|e| {
        ServiceError::Validation(format!(
            "Failed to inspect skill entry '{}': {}",
            from.display(),
            e
        ))
    })?;

    if fs::symlink_metadata(to).is_ok() {
        return Err(ServiceError::Validation(format!(
            "Target path already exists: {}",
            to.display()
        )));
    }

    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create destination directory '{}': {}",
                parent.display(),
                e
            ))
        })?;
    }

    match fs::rename(from, to) {
        Ok(_) => Ok(()),
        Err(_) => {
            copy_entry_without_following_symlink(from, to, &metadata)?;
            delete_entry_without_following_symlink(from)?;
            Ok(())
        }
    }
}

fn copy_entry_without_following_symlink(
    from: &Path,
    to: &Path,
    metadata: &fs::Metadata,
) -> Result<()> {
    if metadata.file_type().is_symlink() {
        let target = fs::read_link(from).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to read symlink '{}': {}",
                from.display(),
                e
            ))
        })?;
        create_symlink(&target, to, from.is_dir())?;
        return Ok(());
    }

    if metadata.is_dir() {
        fs::create_dir_all(to).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create directory '{}': {}",
                to.display(),
                e
            ))
        })?;
        let entries = fs::read_dir(from).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to read directory '{}': {}",
                from.display(),
                e
            ))
        })?;
        for entry in entries.filter_map(|entry| entry.ok()) {
            let child_from = entry.path();
            let child_to = to.join(entry.file_name());
            let child_metadata = fs::symlink_metadata(&child_from).map_err(|e| {
                ServiceError::Validation(format!(
                    "Failed to inspect nested skill entry '{}': {}",
                    child_from.display(),
                    e
                ))
            })?;
            copy_entry_without_following_symlink(&child_from, &child_to, &child_metadata)?;
        }
        return Ok(());
    }

    fs::copy(from, to).map_err(|e| {
        ServiceError::Validation(format!(
            "Failed to copy skill file '{}' to '{}': {}",
            from.display(),
            to.display(),
            e
        ))
    })?;
    Ok(())
}

pub(super) fn delete_entry_without_following_symlink(path: &Path) -> Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => {
            return Err(ServiceError::Validation(format!(
                "Failed to inspect skill entry '{}': {}",
                path.display(),
                err
            )));
        }
    };

    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to remove skill link '{}': {}",
                path.display(),
                e
            ))
        })?;
        return Ok(());
    }

    fs::remove_dir_all(path).map_err(|e| {
        ServiceError::Validation(format!(
            "Failed to remove skill directory '{}': {}",
            path.display(),
            e
        ))
    })?;
    Ok(())
}

fn create_symlink(target: &Path, link: &Path, _target_is_dir: bool) -> Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create symlink '{}' -> '{}': {}",
                link.display(),
                target.display(),
                e
            ))
        })?;
    }

    #[cfg(windows)]
    {
        let result = if _target_is_dir {
            std::os::windows::fs::symlink_dir(target, link)
        } else {
            std::os::windows::fs::symlink_file(target, link)
        };
        result.map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create symlink '{}' -> '{}': {}",
                link.display(),
                target.display(),
                e
            ))
        })?;
    }

    Ok(())
}
