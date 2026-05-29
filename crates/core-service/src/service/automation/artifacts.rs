use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::error::{Result, ServiceError};
use crate::WorkspaceAttachmentPayload;

pub const AUTOMATIONS_DIR: &str = "automations";
pub const DEFINITIONS_DIR: &str = "definitions";
pub const RUNS_DIR: &str = "runs";
pub const INSTRUCTIONS_FILE: &str = "instructions.md";
pub const ATTACHMENTS_DIR: &str = "attachments";

#[derive(Debug, Clone)]
pub struct WrittenAttachment {
    pub placeholder_token: Option<String>,
    pub path: PathBuf,
}

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

pub fn attachments_dir(automation_guid: &str) -> Result<PathBuf> {
    Ok(definition_dir(automation_guid)?.join(ATTACHMENTS_DIR))
}

pub fn write_instructions(automation_guid: &str, instructions: &str) -> Result<PathBuf> {
    let path = instructions_path(automation_guid)?;
    write_user_private_file(&path, instructions)?;
    Ok(path)
}

pub struct PreparedCreateArtifacts {
    definition_dir: PathBuf,
    instructions_path: PathBuf,
    artifact_root: PathBuf,
    committed: bool,
}

impl PreparedCreateArtifacts {
    pub fn prepare(automation_guid: &str, instructions: &str) -> Result<Self> {
        let definition_dir = definition_dir(automation_guid)?;
        let instructions_path = write_instructions(automation_guid, instructions)?;
        let artifact_root = automation_root()?;
        Ok(Self {
            definition_dir,
            instructions_path,
            artifact_root,
            committed: false,
        })
    }

    pub fn instructions_path(&self) -> &Path {
        &self.instructions_path
    }

    pub fn artifact_root(&self) -> &Path {
        &self.artifact_root
    }

    pub fn commit(mut self) {
        self.committed = true;
    }
}

impl Drop for PreparedCreateArtifacts {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        cleanup_definition_dir(&self.definition_dir);
    }
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

pub fn commit_staged_instructions(staged: &StagedInstructions) -> Result<PathBuf> {
    fs::rename(&staged.temp_path, &staged.final_path).map_err(|error| {
        ServiceError::Validation(format!("Failed to update automation instructions: {error}"))
    })?;
    set_file_permissions(&staged.final_path)?;
    Ok(staged.final_path.clone())
}

pub fn discard_staged_instructions(staged: &StagedInstructions) {
    let _ = fs::remove_file(&staged.temp_path);
}

pub struct PreparedUpdateArtifacts {
    attachments: Vec<WrittenAttachment>,
    staged_instructions: Option<StagedInstructions>,
    committed: bool,
}

impl PreparedUpdateArtifacts {
    pub fn from_written_attachments(
        automation_guid: &str,
        written_attachments: Vec<WrittenAttachment>,
        instructions: Option<&str>,
    ) -> Result<Self> {
        let staged_instructions = match instructions {
            Some(instructions) => match stage_instructions(automation_guid, instructions) {
                Ok(staged) => Some(staged),
                Err(error) => {
                    discard_written_attachments(&written_attachments);
                    return Err(error);
                }
            },
            None => None,
        };

        Ok(Self {
            attachments: written_attachments,
            staged_instructions,
            committed: false,
        })
    }

    pub fn commit(mut self) -> Result<()> {
        if let Some(staged) = self.staged_instructions.as_ref() {
            commit_staged_instructions(staged)?;
        }
        self.committed = true;
        Ok(())
    }
}

impl Drop for PreparedUpdateArtifacts {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        if let Some(staged) = self.staged_instructions.as_ref() {
            discard_staged_instructions(staged);
        }
        discard_written_attachments(&self.attachments);
    }
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

pub fn write_attachments(
    automation_guid: &str,
    attachments: Vec<WorkspaceAttachmentPayload>,
) -> Result<Vec<WrittenAttachment>> {
    let dir = attachments_dir(automation_guid)?;
    write_attachments_to_dir(&dir, attachments)
}

fn write_attachments_to_dir(
    dir: &Path,
    attachments: Vec<WorkspaceAttachmentPayload>,
) -> Result<Vec<WrittenAttachment>> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }

    use base64::Engine;

    let mut seen_filenames = HashSet::new();
    let mut pending = Vec::new();
    for attachment in attachments {
        let safe = normalize_attachment_filename(&attachment.filename);
        if safe.is_empty() {
            continue;
        }
        if !seen_filenames.insert(safe.clone()) {
            return Err(ServiceError::Validation(format!(
                "Duplicate automation attachment filename: {safe}"
            )));
        }
        pending.push((safe, attachment));
    }

    if pending.is_empty() {
        return Ok(Vec::new());
    }

    ensure_user_private_dir(dir)?;
    let mut written = Vec::new();
    let mut written_paths = Vec::new();

    for (safe, attachment) in pending {
        let bytes = match base64::engine::general_purpose::STANDARD
            .decode(attachment.data_base64.as_bytes())
        {
            Ok(bytes) => bytes,
            Err(error) => {
                discard_attachment_paths(&written_paths);
                return Err(ServiceError::Validation(format!(
                    "Failed to decode attachment {safe}: {error}"
                )));
            }
        };
        let path = dir.join(&safe);
        if let Err(error) = fs::write(&path, bytes) {
            let mut cleanup_paths = written_paths.clone();
            cleanup_paths.push(path.clone());
            discard_attachment_paths(&cleanup_paths);
            return Err(ServiceError::Validation(format!(
                "Failed to write automation attachment {safe}: {error}"
            )));
        }
        written_paths.push(path.clone());
        if let Err(error) = set_file_permissions(&path) {
            discard_attachment_paths(&written_paths);
            return Err(error);
        }

        written.push(WrittenAttachment {
            placeholder_token: image_placeholder_token(&safe),
            path,
        });
    }

    Ok(written)
}

pub fn discard_written_attachments(attachments: &[WrittenAttachment]) {
    let paths = attachments
        .iter()
        .map(|attachment| attachment.path.clone())
        .collect::<Vec<_>>();
    discard_attachment_paths(&paths);
}

fn normalize_attachment_filename(filename: &str) -> String {
    filename.replace(['/', '\\'], "_").trim().to_string()
}

fn discard_attachment_paths(paths: &[PathBuf]) {
    for path in paths {
        if let Err(error) = fs::remove_file(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(
                    "Failed to clean up automation attachment {}: {}",
                    path.display(),
                    error
                );
            }
        }
    }
}

fn cleanup_definition_dir(path: &Path) {
    if let Err(error) = fs::remove_dir_all(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            tracing::warn!(
                "Failed to clean up automation definition directory {}: {}",
                path.display(),
                error
            );
        }
    }
}

fn image_placeholder_token(filename: &str) -> Option<String> {
    let stem = filename.split('.').next()?;
    let number = stem.strip_prefix("img-")?;
    if number.is_empty() || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(format!("[#img-{number}]"))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn attachment(filename: &str, data_base64: &str) -> WorkspaceAttachmentPayload {
        WorkspaceAttachmentPayload {
            filename: filename.to_string(),
            mime: Some("image/png".to_string()),
            data_base64: data_base64.to_string(),
        }
    }

    #[test]
    fn rejects_duplicate_normalized_attachment_filenames_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        let error = write_attachments_to_dir(
            dir.path(),
            vec![
                attachment("a/b.png", "aGVsbG8="),
                attachment("a\\b.png", "aGVsbG8="),
            ],
        )
        .unwrap_err();

        assert!(matches!(
            error,
            ServiceError::Validation(message) if message.contains("Duplicate automation attachment filename")
        ));
        assert!(!dir.path().join("a_b.png").exists());
    }

    #[test]
    fn rolls_back_written_attachments_when_later_decode_fails() {
        let dir = tempfile::tempdir().unwrap();
        let first_path = dir.path().join("img-1.png");
        let error = write_attachments_to_dir(
            dir.path(),
            vec![
                attachment("img-1.png", "aGVsbG8="),
                attachment("img-2.png", "not base64"),
            ],
        )
        .unwrap_err();

        assert!(matches!(
            error,
            ServiceError::Validation(message) if message.contains("Failed to decode attachment img-2.png")
        ));
        assert!(!first_path.exists());
    }
}
