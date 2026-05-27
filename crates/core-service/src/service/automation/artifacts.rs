use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::error::{Result, ServiceError};

pub const AUTOMATIONS_DIR: &str = "automations";
pub const DEFINITIONS_DIR: &str = "definitions";
pub const RUNS_DIR: &str = "runs";
pub const INSTRUCTIONS_FILE: &str = "instructions.md";

pub fn automation_root() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| ServiceError::Validation("Home directory not found".to_string()))?;
    Ok(home.join(".atmos").join(AUTOMATIONS_DIR))
}

pub fn definitions_root() -> Result<PathBuf> {
    Ok(automation_root()?.join(DEFINITIONS_DIR))
}

pub fn runs_root() -> Result<PathBuf> {
    Ok(automation_root()?.join(RUNS_DIR))
}

pub fn definition_dir(automation_guid: &str) -> Result<PathBuf> {
    Ok(definitions_root()?.join(automation_guid))
}

pub fn instructions_path(automation_guid: &str) -> Result<PathBuf> {
    Ok(definition_dir(automation_guid)?.join(INSTRUCTIONS_FILE))
}

pub fn write_instructions(automation_guid: &str, instructions: &str) -> Result<PathBuf> {
    let path = instructions_path(automation_guid)?;
    write_user_private_file(&path, instructions)?;
    Ok(path)
}

pub struct StagedInstructions {
    temp_path: PathBuf,
    final_path: PathBuf,
}

pub fn stage_instructions(automation_guid: &str, instructions: &str) -> Result<StagedInstructions> {
    let final_path = instructions_path(automation_guid)?;
    let temp_path = definition_dir(automation_guid)?.join(format!(
        "{}.pending-{}",
        INSTRUCTIONS_FILE,
        Uuid::new_v4()
    ));
    write_user_private_file(&temp_path, instructions)?;
    Ok(StagedInstructions {
        temp_path,
        final_path,
    })
}

pub fn commit_staged_instructions(staged: StagedInstructions) -> Result<PathBuf> {
    fs::rename(&staged.temp_path, &staged.final_path).map_err(|error| {
        ServiceError::Validation(format!("Failed to update automation instructions: {error}"))
    })?;
    set_file_permissions(&staged.final_path)?;
    Ok(staged.final_path)
}

pub fn discard_staged_instructions(staged: &StagedInstructions) {
    let _ = fs::remove_file(&staged.temp_path);
}

pub fn ensure_user_private_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path).map_err(|error| {
        ServiceError::Validation(format!("Failed to create automation directory: {error}"))
    })?;
    set_dir_permissions(path)?;
    Ok(())
}

pub fn read_instructions(path: &str) -> Result<String> {
    let path = PathBuf::from(path);
    let root = automation_root()?;
    ensure_path_under_root(&path, &root)?;
    fs::read_to_string(&path)
        .map_err(|error| ServiceError::Validation(format!("Failed to read instructions: {error}")))
}

pub fn read_artifact(path: &str) -> Result<String> {
    let path = PathBuf::from(path);
    let root = automation_root()?;
    ensure_path_under_root(&path, &root)?;
    fs::read_to_string(&path)
        .map_err(|error| ServiceError::Validation(format!("Failed to read artifact: {error}")))
}

pub fn write_user_private_file(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_user_private_dir(parent)?;
    }

    fs::write(path, content).map_err(|error| {
        ServiceError::Validation(format!("Failed to write automation file: {error}"))
    })?;
    set_file_permissions(path)?;
    Ok(())
}

fn ensure_path_under_root(path: &Path, root: &Path) -> Result<()> {
    let canonical_root = root.canonicalize().map_err(|error| {
        ServiceError::Validation(format!("Failed to resolve automation root: {error}"))
    })?;
    let canonical_path = path.canonicalize().map_err(|error| {
        ServiceError::Validation(format!("Failed to resolve artifact: {error}"))
    })?;

    if canonical_path.starts_with(canonical_root) {
        Ok(())
    } else {
        Err(ServiceError::Validation(
            "Artifact path is outside ~/.atmos/automations.".to_string(),
        ))
    }
}

#[cfg(unix)]
fn set_dir_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
        ServiceError::Validation(format!("Failed to set directory permissions: {error}"))
    })
}

#[cfg(not(unix))]
fn set_dir_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
fn set_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| {
        ServiceError::Validation(format!("Failed to set file permissions: {error}"))
    })
}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}
