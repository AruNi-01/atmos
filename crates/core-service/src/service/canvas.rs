//! APP-037: file-backed Canvas documents under `~/.atmos/canvas/*.atmos.tldr`.

use std::env;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::error::{Result, ServiceError};

pub const ATMOS_CANVAS_FILE_SCHEMA: &str = "atmos-canvas-file.1";
pub const CANVAS_FILE_EXTENSION: &str = ".atmos.tldr";
/// Well-known file used when pin-to-canvas has no active document preference.
pub const DEFAULT_PIN_DOCUMENT_FILE: &str = "Default.atmos.tldr";
const CANVAS_DIR_ENV: &str = "ATMOS_CANVAS_DIR";
const MAX_STEM_LEN: usize = 120;
/// Cap total document-script source size (all files) to avoid abusive payloads.
const MAX_SCRIPT_TOTAL_BYTES: usize = 2 * 1024 * 1024;
const MAX_SCRIPT_FILES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct AtmosCanvasScript {
    /// Entry module path within `files`, default `main.js`.
    #[serde(default = "default_script_entry")]
    pub entry: String,
    /// Source files keyed by relative path (e.g. `main.js`, `lib/util.js`).
    #[serde(default)]
    pub files: std::collections::BTreeMap<String, String>,
}

fn default_script_entry() -> String {
    "main.js".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AtmosCanvasFile {
    pub schema: String,
    pub title: String,
    #[serde(rename = "tldrawDocument")]
    pub tldraw_document: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<Value>,
    /// Durable document script. Runs when the doc opens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<AtmosCanvasScript>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CanvasDocumentListItem {
    pub file_name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CanvasDocumentFileDto {
    pub file_name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
    pub body: AtmosCanvasFile,
}

#[derive(Debug, Default)]
pub struct CanvasDocumentService {
    /// Optional override root (tests). Production uses `canvas_dir()`.
    root_override: Option<PathBuf>,
    /// Serializes create/overwrite so existence checks and final renames cannot race.
    write_lock: Mutex<()>,
}

impl CanvasDocumentService {
    pub fn new() -> Self {
        Self {
            root_override: None,
            write_lock: Mutex::new(()),
        }
    }

    pub fn with_root(root: PathBuf) -> Self {
        Self {
            root_override: Some(root),
            write_lock: Mutex::new(()),
        }
    }

    pub fn canvas_dir(&self) -> Result<PathBuf> {
        if let Some(root) = &self.root_override {
            return Ok(root.clone());
        }
        if let Ok(raw) = env::var(CANVAS_DIR_ENV) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return Ok(PathBuf::from(trimmed));
            }
        }
        let home = dirs::home_dir().ok_or_else(|| {
            ServiceError::Processing("Unable to resolve home directory for canvas documents".into())
        })?;
        Ok(home.join(".atmos").join("canvas"))
    }

    pub fn ensure_canvas_dir(&self) -> Result<PathBuf> {
        let dir = self.canvas_dir()?;
        fs::create_dir_all(&dir).map_err(|e| {
            ServiceError::Processing(format!(
                "Failed to create canvas directory {}: {e}",
                dir.display()
            ))
        })?;
        Ok(dir)
    }

    pub fn list_documents(&self) -> Result<Vec<CanvasDocumentListItem>> {
        let dir = self.ensure_canvas_dir()?;
        let mut items = Vec::new();

        let entries = fs::read_dir(&dir).map_err(|e| {
            ServiceError::Processing(format!(
                "Failed to read canvas directory {}: {e}",
                dir.display()
            ))
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| {
                ServiceError::Processing(format!("Failed to read canvas directory entry: {e}"))
            })?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if !file_name.ends_with(CANVAS_FILE_EXTENSION) {
                continue;
            }
            items.push(list_item_for_path(file_name, &path)?);
        }

        items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        Ok(items)
    }

    pub fn read_document(&self, file_name: &str) -> Result<CanvasDocumentFileDto> {
        let path = self.resolve_document_path(file_name)?;
        if !path.is_file() {
            return Err(ServiceError::NotFound(format!(
                "Canvas document `{file_name}` not found"
            )));
        }
        let raw = fs::read_to_string(&path).map_err(|e| {
            ServiceError::Processing(format!("Failed to read canvas document `{file_name}`: {e}"))
        })?;
        let body: AtmosCanvasFile = serde_json::from_str(&raw).map_err(|e| {
            ServiceError::Validation(format!("Invalid canvas document JSON: {e}"))
        })?;
        validate_atmos_canvas_file(&body)?;
        let meta = list_item_for_path(file_name, &path)?;
        Ok(CanvasDocumentFileDto {
            file_name: meta.file_name,
            title: body.title.clone(),
            modified_at: meta.modified_at,
            size_bytes: meta.size_bytes,
            body,
        })
    }

    /// Next free Untitled / Untitled-1 / Untitled-2… file name (with extension).
    pub fn next_untitled_file_name(&self) -> Result<String> {
        self.ensure_canvas_dir()?;
        // Untitled, Untitled-1, Untitled-2, …
        for i in 0..10_000 {
            let stem = if i == 0 {
                "Untitled".to_string()
            } else {
                format!("Untitled-{i}")
            };
            let file_name = format!("{stem}{CANVAS_FILE_EXTENSION}");
            let path = self.resolve_document_path(&file_name)?;
            if !path.exists() {
                return Ok(file_name);
            }
        }
        Err(ServiceError::Processing(
            "Could not allocate an Untitled document name".into(),
        ))
    }

    /// Create a new empty Untitled document on disk and return its list item.
    /// Retries name allocation if a concurrent create claims the same path.
    pub fn create_untitled_document(&self) -> Result<CanvasDocumentListItem> {
        for _ in 0..32 {
            let file_name = self.next_untitled_file_name()?;
            let stem = file_name
                .strip_suffix(CANVAS_FILE_EXTENSION)
                .unwrap_or(&file_name)
                .to_string();
            match self.write_document(&file_name, &Self::empty_document(&stem), false) {
                Ok(item) => return Ok(item),
                Err(ServiceError::Validation(msg)) if msg.contains("already exists") => continue,
                Err(e) => return Err(e),
            }
        }
        Err(ServiceError::Processing(
            "Could not allocate an Untitled document name".into(),
        ))
    }

    /// Write a canvas document. When `overwrite` is false and the file already
    /// exists, returns a validation error (Save As must not clobber).
    ///
    /// All writers take `write_lock` so concurrent autosave / CLI / Save As
    /// cannot interleave existence checks with finalization. Create-if-absent
    /// uses `create_new` so two Save As to the same name cannot both succeed.
    pub fn write_document(
        &self,
        file_name: &str,
        body: &AtmosCanvasFile,
        overwrite: bool,
    ) -> Result<CanvasDocumentListItem> {
        let _guard = self
            .write_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.write_document_locked(file_name, body, overwrite)
    }

    /// Caller must hold `write_lock`. Used by rename so create+unlink is atomic
    /// w.r.t. concurrent saves of the old path.
    fn write_document_locked(
        &self,
        file_name: &str,
        body: &AtmosCanvasFile,
        overwrite: bool,
    ) -> Result<CanvasDocumentListItem> {
        validate_atmos_canvas_file(body)?;
        let path = self.resolve_document_path(file_name)?;
        self.ensure_canvas_dir()?;

        let json = serde_json::to_string_pretty(body).map_err(|e| {
            ServiceError::Processing(format!("Failed to serialize canvas document: {e}"))
        })?;

        if !overwrite {
            // Atomic create: only one concurrent Save As can create the path.
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(mut file) => {
                    file.write_all(json.as_bytes()).map_err(|e| {
                        let _ = fs::remove_file(&path);
                        ServiceError::Processing(format!(
                            "Failed to write canvas document `{file_name}`: {e}"
                        ))
                    })?;
                    let _ = file.sync_all();
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Err(ServiceError::Validation(format!(
                        "Canvas document `{file_name}` already exists"
                    )));
                }
                Err(e) => {
                    return Err(ServiceError::Processing(format!(
                        "Failed to create canvas document `{file_name}`: {e}"
                    )));
                }
            }
            return list_item_for_path(file_name, &path);
        }

        // Overwrite: unique temp + rename under the write lock (serialized last-writer-wins).
        let nanos = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = path.with_extension(format!(
            "atmos.tldr.tmp.{}.{}",
            std::process::id(),
            nanos
        ));
        fs::write(&tmp, json.as_bytes()).map_err(|e| {
            ServiceError::Processing(format!("Failed to write canvas document temp file: {e}"))
        })?;
        fs::rename(&tmp, &path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            ServiceError::Processing(format!(
                "Failed to finalize canvas document `{file_name}`: {e}"
            ))
        })?;
        list_item_for_path(file_name, &path)
    }

    /// Sanitize a user display name into a safe file stem, then append extension.
    pub fn sanitize_file_name(name: &str) -> Result<String> {
        let stem = sanitize_stem(name)?;
        Ok(format!("{stem}{CANVAS_FILE_EXTENSION}"))
    }

    pub fn empty_document(title: &str) -> AtmosCanvasFile {
        AtmosCanvasFile {
            schema: ATMOS_CANVAS_FILE_SCHEMA.to_string(),
            title: title.to_string(),
            tldraw_document: None,
            session: None,
            script: None,
        }
    }

    /// Absolute path to a document file (for reveal / CLI).
    pub fn absolute_path(&self, file_name: &str) -> Result<PathBuf> {
        self.resolve_document_path(file_name)
    }

    pub fn delete_document(&self, file_name: &str) -> Result<()> {
        let path = self.resolve_document_path(file_name)?;
        let _guard = self
            .write_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !path.is_file() {
            return Err(ServiceError::NotFound(format!(
                "Canvas document `{file_name}` not found"
            )));
        }
        fs::remove_file(&path).map_err(|e| {
            ServiceError::Processing(format!("Failed to delete canvas document `{file_name}`: {e}"))
        })?;
        Ok(())
    }

    /// Rename on disk (and update body.title to the new stem).
    ///
    /// Holds `write_lock` across write-new + remove-old so a concurrent save of
    /// the old path cannot succeed and then be deleted by `remove_file`.
    pub fn rename_document(
        &self,
        file_name: &str,
        new_name: &str,
    ) -> Result<CanvasDocumentListItem> {
        let from = self.resolve_document_path(file_name)?;
        let new_file_name = Self::sanitize_file_name(new_name)?;
        if new_file_name == validate_file_name(file_name)? {
            if !from.is_file() {
                return Err(ServiceError::NotFound(format!(
                    "Canvas document `{file_name}` not found"
                )));
            }
            return list_item_for_path(&new_file_name, &from);
        }
        let to = self.resolve_document_path(&new_file_name)?;

        let _guard = self
            .write_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if !from.is_file() {
            return Err(ServiceError::NotFound(format!(
                "Canvas document `{file_name}` not found"
            )));
        }
        if to.exists() {
            return Err(ServiceError::Validation(format!(
                "Canvas document `{}` already exists",
                new_file_name
            )));
        }

        // Read under the lock so we snapshot the latest content.
        let raw = fs::read_to_string(&from).map_err(|e| {
            ServiceError::Processing(format!("Failed to read canvas document `{file_name}`: {e}"))
        })?;
        let mut body: AtmosCanvasFile = serde_json::from_str(&raw).map_err(|e| {
            ServiceError::Validation(format!("Invalid canvas document JSON: {e}"))
        })?;
        validate_atmos_canvas_file(&body)?;
        let stem = new_file_name
            .strip_suffix(CANVAS_FILE_EXTENSION)
            .unwrap_or(&new_file_name)
            .to_string();
        body.title = stem;

        self.write_document_locked(&new_file_name, &body, false)?;
        fs::remove_file(&from).map_err(|e| {
            ServiceError::Processing(format!(
                "Renamed to `{new_file_name}` but failed to remove old file: {e}"
            ))
        })?;
        list_item_for_path(&new_file_name, &to)
    }

    /// Duplicate to a new file name (or auto `Title copy.atmos.tldr`).
    pub fn duplicate_document(
        &self,
        file_name: &str,
        new_name: Option<&str>,
    ) -> Result<CanvasDocumentListItem> {
        let src = self.read_document(file_name)?;
        let target_name = if let Some(name) = new_name {
            Self::sanitize_file_name(name)?
        } else {
            unique_copy_name(self, &src.body.title)?
        };
        if self.resolve_document_path(&target_name)?.exists() {
            return Err(ServiceError::Validation(format!(
                "Canvas document `{target_name}` already exists"
            )));
        }
        let stem = target_name
            .strip_suffix(CANVAS_FILE_EXTENSION)
            .unwrap_or(&target_name)
            .to_string();
        let mut body = src.body;
        body.title = stem;
        reset_duplicated_agent_chat_widgets(&mut body);
        self.write_document(&target_name, &body, false)
    }

    fn resolve_document_path(&self, file_name: &str) -> Result<PathBuf> {
        let safe_name = validate_file_name(file_name)?;
        let dir = self.canvas_dir()?;
        let candidate = dir.join(&safe_name);

        // Reject any path that would leave the canvas directory (symlinks, etc.).
        let dir_canon = if dir.exists() {
            fs::canonicalize(&dir).unwrap_or(dir.clone())
        } else {
            dir.clone()
        };
        if let Ok(canon) = fs::canonicalize(&candidate) {
            if !canon.starts_with(&dir_canon) {
                return Err(ServiceError::Validation(
                    "Canvas document path escapes canvas directory".into(),
                ));
            }
            return Ok(canon);
        }

        // File may not exist yet — ensure parent is canvas dir and name is flat.
        if candidate
            .parent()
            .map(|p| p != dir.as_path() && p != dir_canon.as_path())
            .unwrap_or(true)
        {
            // join on dir with a flat name should always have parent == dir
        }
        Ok(candidate)
    }
}

fn reset_duplicated_agent_chat_widgets(body: &mut AtmosCanvasFile) {
    let Some(store) = body
        .tldraw_document
        .as_mut()
        .and_then(Value::as_object_mut)
        .and_then(|document| document.get_mut("store"))
        .and_then(Value::as_object_mut)
    else {
        return;
    };

    for record in store.values_mut() {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        if record.get("type").and_then(Value::as_str) != Some("canvas-widget") {
            continue;
        }
        let Some(props) = record.get_mut("props").and_then(Value::as_object_mut) else {
            continue;
        };
        let Some(source) = props.get_mut("source").and_then(Value::as_object_mut) else {
            continue;
        };
        if source.get("type").and_then(Value::as_str) != Some("agent-chat") {
            continue;
        }

        let instance_id = Uuid::new_v4().to_string();
        source.insert("instanceId".into(), Value::String(instance_id.clone()));
        source.insert("acpSessionId".into(), Value::Null);
        source.insert("registryId".into(), Value::Null);
        source.insert("sessionCwd".into(), Value::Null);
        props.insert("pinKey".into(), Value::String(format!("agent-chat:{instance_id}")));
    }
}

fn validate_file_name(file_name: &str) -> Result<String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas document file name is required".into(),
        ));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(ServiceError::Validation(
            "Canvas document file name must not contain path separators".into(),
        ));
    }
    if trimmed == "." || trimmed == ".." || trimmed.contains("..") {
        return Err(ServiceError::Validation(
            "Canvas document file name is invalid".into(),
        ));
    }
    if Path::new(trimmed)
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(ServiceError::Validation(
            "Canvas document file name must be a single path segment".into(),
        ));
    }
    if !trimmed.ends_with(CANVAS_FILE_EXTENSION) {
        return Err(ServiceError::Validation(format!(
            "Canvas document must use the `{CANVAS_FILE_EXTENSION}` extension"
        )));
    }
    Ok(trimmed.to_string())
}

fn sanitize_stem(name: &str) -> Result<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas document name is required".into(),
        ));
    }
    let without_ext = trimmed
        .strip_suffix(CANVAS_FILE_EXTENSION)
        .unwrap_or(trimmed)
        .trim();
    if without_ext.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas document name is required".into(),
        ));
    }

    let mut out = String::with_capacity(without_ext.len());
    for ch in without_ext.chars() {
        if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
            out.push('-');
        } else {
            out.push(ch);
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut stem = collapsed.trim().trim_matches('.').to_string();
    if stem.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas document name is invalid after sanitization".into(),
        ));
    }
    if stem.len() > MAX_STEM_LEN {
        // `String::truncate` panics mid-UTF-8; cut on a char boundary.
        let mut end = MAX_STEM_LEN.min(stem.len());
        while end > 0 && !stem.is_char_boundary(end) {
            end -= 1;
        }
        stem.truncate(end);
        stem = stem.trim().to_string();
        if stem.is_empty() {
            return Err(ServiceError::Validation(
                "Canvas document name is invalid after sanitization".into(),
            ));
        }
    }
    Ok(stem)
}

fn validate_atmos_canvas_file(body: &AtmosCanvasFile) -> Result<()> {
    if body.schema != ATMOS_CANVAS_FILE_SCHEMA {
        return Err(ServiceError::Validation(format!(
            "Unsupported canvas file schema `{}`",
            body.schema
        )));
    }
    if body.title.trim().is_empty() {
        return Err(ServiceError::Validation(
            "Canvas document title is required".into(),
        ));
    }
    if let Some(script) = &body.script {
        validate_atmos_canvas_script(script)?;
    }
    Ok(())
}

fn validate_atmos_canvas_script(script: &AtmosCanvasScript) -> Result<()> {
    let entry = script.entry.trim();
    if entry.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas script entry must not be empty".into(),
        ));
    }
    if entry.contains("..") || entry.starts_with('/') || entry.contains('\\') {
        return Err(ServiceError::Validation(
            "Canvas script entry must be a relative path without ..".into(),
        ));
    }
    if script.files.is_empty() {
        return Err(ServiceError::Validation(
            "Canvas script files must not be empty when script is set".into(),
        ));
    }
    if script.files.len() > MAX_SCRIPT_FILES {
        return Err(ServiceError::Validation(format!(
            "Canvas script allows at most {MAX_SCRIPT_FILES} files"
        )));
    }
    if !script.files.contains_key(entry) {
        return Err(ServiceError::Validation(format!(
            "Canvas script entry `{entry}` is missing from files"
        )));
    }
    let mut total = 0usize;
    for (path, source) in &script.files {
        if path.trim().is_empty()
            || path.contains("..")
            || path.starts_with('/')
            || path.contains('\\')
        {
            return Err(ServiceError::Validation(format!(
                "Invalid canvas script file path `{path}`"
            )));
        }
        total = total.saturating_add(source.len());
        if total > MAX_SCRIPT_TOTAL_BYTES {
            return Err(ServiceError::Validation(format!(
                "Canvas script sources exceed {MAX_SCRIPT_TOTAL_BYTES} bytes"
            )));
        }
    }
    Ok(())
}

fn unique_copy_name(svc: &CanvasDocumentService, title: &str) -> Result<String> {
    let base = sanitize_stem(&format!("{title} copy"))?;
    let mut candidate = format!("{base}{CANVAS_FILE_EXTENSION}");
    let mut n = 2;
    while svc.resolve_document_path(&candidate)?.exists() {
        candidate = format!("{base} {n}{CANVAS_FILE_EXTENSION}");
        n += 1;
        if n > 1000 {
            return Err(ServiceError::Processing(
                "Could not allocate a unique copy file name".into(),
            ));
        }
    }
    Ok(candidate)
}

fn list_item_for_path(file_name: &str, path: &Path) -> Result<CanvasDocumentListItem> {
    let meta = fs::metadata(path).map_err(|e| {
        ServiceError::Processing(format!(
            "Failed to stat canvas document `{}`: {e}",
            path.display()
        ))
    })?;
    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let modified_at: DateTime<Utc> = modified.into();
    let title = file_name
        .strip_suffix(CANVAS_FILE_EXTENSION)
        .unwrap_or(file_name)
        .to_string();
    Ok(CanvasDocumentListItem {
        file_name: file_name.to_string(),
        title,
        modified_at: modified_at.to_rfc3339(),
        size_bytes: meta.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sanitizes_stem_and_builds_file_name() {
        let name = CanvasDocumentService::sanitize_file_name("  Ops Desk  ").unwrap();
        assert_eq!(name, "Ops Desk.atmos.tldr");
        let slashy = CanvasDocumentService::sanitize_file_name("a/b").unwrap();
        assert_eq!(slashy, "a-b.atmos.tldr");
    }

    #[test]
    fn sanitize_truncates_on_char_boundary() {
        // Multibyte chars near MAX_STEM_LEN must not panic.
        let long = "名".repeat(200);
        let name = CanvasDocumentService::sanitize_file_name(&long).unwrap();
        assert!(name.ends_with(CANVAS_FILE_EXTENSION));
        let stem = name.strip_suffix(CANVAS_FILE_EXTENSION).unwrap();
        assert!(stem.len() <= MAX_STEM_LEN);
        assert!(!stem.is_empty());
    }

    #[test]
    fn rejects_empty_name() {
        assert!(CanvasDocumentService::sanitize_file_name("   ").is_err());
    }

    #[test]
    fn rejects_path_traversal_file_name() {
        let svc = CanvasDocumentService::with_root(tempdir().unwrap().path().to_path_buf());
        assert!(svc.read_document("../secrets.atmos.tldr").is_err());
        assert!(svc
            .write_document(
                "../x.atmos.tldr",
                &CanvasDocumentService::empty_document("x"),
                false,
            )
            .is_err());
    }

    #[test]
    fn list_only_atmos_tldr_files() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        fs::write(dir.path().join("notes.txt"), b"hi").unwrap();
        svc.write_document(
            "a.atmos.tldr",
            &CanvasDocumentService::empty_document("a"),
            false,
        )
        .unwrap();
        let items = svc.list_documents().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].file_name, "a.atmos.tldr");
    }

    #[test]
    fn write_read_round_trip() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        let body = AtmosCanvasFile {
            schema: ATMOS_CANVAS_FILE_SCHEMA.to_string(),
            title: "Ops Desk".to_string(),
            tldraw_document: Some(serde_json::json!({"store": {}, "schema": {}})),
            session: Some(serde_json::json!({"version": 0, "isGridMode": true})),
            script: Some(AtmosCanvasScript {
                entry: "main.js".into(),
                files: std::collections::BTreeMap::from([(
                    "main.js".into(),
                    "export default function () {}".into(),
                )]),
            }),
        };
        svc.write_document("Ops Desk.atmos.tldr", &body, false).unwrap();
        let loaded = svc.read_document("Ops Desk.atmos.tldr").unwrap();
        assert_eq!(loaded.body, body);
        assert_eq!(loaded.title, "Ops Desk");
        assert!(loaded.size_bytes > 0);
        // overwrite=false must refuse
        assert!(svc
            .write_document("Ops Desk.atmos.tldr", &body, false)
            .is_err());
        // overwrite=true updates
        assert!(svc
            .write_document("Ops Desk.atmos.tldr", &body, true)
            .is_ok());
    }

    #[test]
    fn create_new_is_exclusive() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        let a = CanvasDocumentService::empty_document("a");
        let b = CanvasDocumentService::empty_document("b");
        svc.write_document("race.atmos.tldr", &a, false).unwrap();
        // Second create-if-absent must fail rather than clobber.
        let err = svc.write_document("race.atmos.tldr", &b, false).unwrap_err();
        assert!(format!("{err}").contains("already exists"));
        let loaded = svc.read_document("race.atmos.tldr").unwrap();
        assert_eq!(loaded.body.title, "a");
    }

    #[test]
    fn rejects_bad_schema() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        let bad = AtmosCanvasFile {
            schema: "nope".into(),
            title: "x".into(),
            tldraw_document: None,
            session: None,
            script: None,
        };
        assert!(svc.write_document("x.atmos.tldr", &bad, false).is_err());
    }

    #[test]
    fn allocates_untitled_sequence() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        let a = svc.create_untitled_document().unwrap();
        assert_eq!(a.file_name, "Untitled.atmos.tldr");
        let b = svc.create_untitled_document().unwrap();
        assert_eq!(b.file_name, "Untitled-1.atmos.tldr");
        let c = svc.create_untitled_document().unwrap();
        assert_eq!(c.file_name, "Untitled-2.atmos.tldr");
    }

    #[test]
    fn rename_delete_duplicate() {
        let dir = tempdir().unwrap();
        let svc = CanvasDocumentService::with_root(dir.path().to_path_buf());
        let agent_chat_document = AtmosCanvasFile {
            schema: ATMOS_CANVAS_FILE_SCHEMA.into(),
            title: "a".into(),
            tldraw_document: Some(serde_json::json!({
                "store": {
                    "shape:agent-chat": {
                        "type": "canvas-widget",
                        "props": {
                            "pinKey": "agent-chat:original-instance",
                            "source": {
                                "type": "agent-chat",
                                "instanceId": "original-instance",
                                "acpSessionId": "acp-session-1",
                                "registryId": "codex",
                                "sessionCwd": "/repo"
                            }
                        }
                    }
                }
            })),
            session: None,
            script: None,
        };
        svc.write_document(
            "a.atmos.tldr",
            &agent_chat_document,
            false,
        )
        .unwrap();
        let renamed = svc.rename_document("a.atmos.tldr", "b").unwrap();
        assert_eq!(renamed.file_name, "b.atmos.tldr");
        assert!(!dir.path().join("a.atmos.tldr").exists());
        let dup = svc.duplicate_document("b.atmos.tldr", None).unwrap();
        assert!(dup.file_name.contains("copy"));
        assert_eq!(svc.list_documents().unwrap().len(), 2);
        let original = svc.read_document("b.atmos.tldr").unwrap();
        let duplicate = svc.read_document(&dup.file_name).unwrap();
        let original_source = &original.body.tldraw_document.as_ref().unwrap()["store"]
            ["shape:agent-chat"]["props"]["source"];
        let duplicate_props = &duplicate.body.tldraw_document.as_ref().unwrap()["store"]
            ["shape:agent-chat"]["props"];
        let duplicate_source = &duplicate_props["source"];
        let duplicate_instance_id = duplicate_source["instanceId"].as_str().unwrap();
        assert_eq!(original_source["instanceId"].as_str(), Some("original-instance"));
        assert_ne!(duplicate_instance_id, "original-instance");
        assert_eq!(duplicate_source["acpSessionId"], Value::Null);
        assert_eq!(duplicate_source["registryId"], Value::Null);
        assert_eq!(duplicate_source["sessionCwd"], Value::Null);
        assert_eq!(
            duplicate_props["pinKey"],
            format!("agent-chat:{duplicate_instance_id}")
        );
        svc.delete_document(&dup.file_name).unwrap();
        assert_eq!(svc.list_documents().unwrap().len(), 1);
    }
}
