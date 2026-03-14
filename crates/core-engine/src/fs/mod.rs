//! File system operations for project browsing and validation.

use ignore::{gitignore::GitignoreBuilder, WalkBuilder};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{EngineError, Result};

/// File system entry representing a file or directory
#[derive(Debug, Clone, Serialize)]
pub struct FsEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub is_ignored: bool,
    pub symlink_target: Option<String>,
    pub is_git_repo: bool,
}

/// File tree item for project file listing
#[derive(Debug, Clone, Serialize)]
pub struct FileTreeItem {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub is_ignored: bool,
    pub symlink_target: Option<String>,
    pub children: Option<Vec<FileTreeItem>>,
}

/// Sort directories first, then alphabetically by name (case-insensitive).
fn dir_first_alpha_sort(a: &FsEntry, b: &FsEntry) -> std::cmp::Ordering {
    match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    }
}

/// Sort FileTreeItems: directories first, then alphabetically by name (case-insensitive).
fn dir_first_alpha_sort_tree(a: &FileTreeItem, b: &FileTreeItem) -> std::cmp::Ordering {
    match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    }
}

/// File system engine for browsing and validating directories
pub struct FsEngine;

impl FsEngine {
    pub fn new() -> Self {
        Self
    }

    /// Get the user's home directory
    pub fn get_home_dir(&self) -> Result<PathBuf> {
        dirs::home_dir().ok_or_else(|| {
            EngineError::FileSystem("Unable to determine home directory".to_string())
        })
    }

    /// List directory contents
    ///
    /// # Arguments
    /// * `path` - The directory path to list
    /// * `dirs_only` - If true, only return directories
    /// * `show_hidden` - If true, include hidden files/directories
    pub fn list_dir(
        &self,
        path: &Path,
        dirs_only: bool,
        show_hidden: bool,
    ) -> Result<Vec<FsEntry>> {
        if !path.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                path.display()
            )));
        }

        if !path.is_dir() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a directory: {}",
                path.display()
            )));
        }

        let gitignore = self.load_gitignore(path);

        let mut entries = Vec::new();

        let read_dir = fs::read_dir(path).map_err(|e| {
            EngineError::FileSystem(format!(
                "Failed to read directory {}: {}",
                path.display(),
                e
            ))
        })?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();

            if !show_hidden && name.starts_with('.') {
                continue;
            }

            let entry_path = entry.path();
            let is_dir = entry_path.is_dir();
            let file_type = entry.file_type().ok();
            let is_symlink = file_type.map(|ft| ft.is_symlink()).unwrap_or(false);

            let symlink_target = if is_symlink {
                fs::read_link(&entry_path)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            if dirs_only && !is_dir {
                continue;
            }

            let is_git_repo = if is_dir {
                entry_path.join(".git").exists()
            } else {
                false
            };

            let is_ignored = self.is_path_ignored(&gitignore, &entry_path, is_dir);

            entries.push(FsEntry {
                name,
                path: entry_path,
                is_dir,
                is_symlink,
                is_ignored,
                symlink_target,
                is_git_repo,
            });
        }

        entries.sort_by(dir_first_alpha_sort);

        Ok(entries)
    }

    /// Get the parent directory of a path
    pub fn get_parent(&self, path: &Path) -> Option<PathBuf> {
        path.parent().map(|p| p.to_path_buf())
    }

    /// Validate if a path is a valid Git repository
    pub fn validate_git_path(&self, path: &Path) -> GitValidationResult {
        if !path.exists() {
            return GitValidationResult {
                is_valid: false,
                is_git_repo: false,
                suggested_name: None,
                default_branch: None,
                error: Some("Path does not exist".to_string()),
            };
        }

        if !path.is_dir() {
            return GitValidationResult {
                is_valid: false,
                is_git_repo: false,
                suggested_name: None,
                default_branch: None,
                error: Some("Path is not a directory".to_string()),
            };
        }

        let is_git_repo = path.join(".git").exists();
        let suggested_name = path.file_name().map(|n| n.to_string_lossy().to_string());

        let default_branch = if is_git_repo {
            self.get_default_branch(path).ok()
        } else {
            None
        };

        GitValidationResult {
            is_valid: true,
            is_git_repo,
            suggested_name,
            default_branch,
            error: None,
        }
    }

    /// Get the default branch of a git repository
    fn get_default_branch(&self, path: &Path) -> Result<String> {
        let head_path = path.join(".git").join("HEAD");

        if !head_path.exists() {
            return Err(EngineError::FileSystem("Not a git repository".to_string()));
        }

        let content = fs::read_to_string(&head_path)
            .map_err(|e| EngineError::FileSystem(format!("Failed to read HEAD file: {}", e)))?;

        if let Some(branch) = content.strip_prefix("ref: refs/heads/") {
            Ok(branch.trim().to_string())
        } else {
            Ok(content.trim().to_string())
        }
    }

    /// Expand tilde (~) in path to home directory
    pub fn expand_path(&self, path: &str) -> Result<PathBuf> {
        if path == "~" {
            return self.get_home_dir();
        }

        if let Some(rest) = path.strip_prefix("~/") {
            let home = self.get_home_dir()?;
            return Ok(home.join(rest));
        }

        if let Some(rest) = path.strip_prefix('~') {
            let home = self.get_home_dir()?;
            return Ok(home.join(rest));
        }

        Ok(PathBuf::from(path))
    }

    /// Read file content
    pub fn read_file(&self, path: &Path) -> Result<(String, u64)> {
        if !path.exists() {
            return Err(EngineError::FileSystem(format!(
                "File does not exist: {}",
                path.display()
            )));
        }

        if !path.is_file() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a file: {}",
                path.display()
            )));
        }

        let metadata = fs::metadata(path)
            .map_err(|e| EngineError::FileSystem(format!("Failed to get file metadata: {}", e)))?;

        match fs::read_to_string(path) {
            Ok(content) => Ok((content, metadata.len())),
            Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                let bytes = fs::read(path).map_err(|e| {
                    EngineError::FileSystem(format!(
                        "Failed to read binary file {}: {}",
                        path.display(),
                        e
                    ))
                })?;
                use base64::Engine as _;
                let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Ok((
                    format!("data:application/octet-stream;base64,{}", encoded),
                    metadata.len(),
                ))
            }
            Err(e) => Err(EngineError::FileSystem(format!(
                "Failed to read file {}: {}",
                path.display(),
                e
            ))),
        }
    }

    /// Write content to file
    pub fn write_file(&self, path: &Path, content: &str) -> Result<()> {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    EngineError::FileSystem(format!("Failed to create parent directory: {}", e))
                })?;
            }
        }

        fs::write(path, content).map_err(|e| {
            EngineError::FileSystem(format!("Failed to write file {}: {}", path.display(), e))
        })?;

        Ok(())
    }

    /// List project files recursively as a tree structure
    pub fn list_project_files(
        &self,
        root_path: &Path,
        show_hidden: bool,
    ) -> Result<Vec<FileTreeItem>> {
        if !root_path.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                root_path.display()
            )));
        }

        if !root_path.is_dir() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a directory: {}",
                root_path.display()
            )));
        }

        let gitignore = self.load_gitignore(root_path);

        self.build_file_tree(root_path, show_hidden, 0, &gitignore)
    }

    /// Build file tree recursively with depth limit
    fn build_file_tree(
        &self,
        dir_path: &Path,
        show_hidden: bool,
        depth: usize,
        gitignore: &Option<ignore::gitignore::Gitignore>,
    ) -> Result<Vec<FileTreeItem>> {
        const MAX_DEPTH: usize = 10;
        if depth >= MAX_DEPTH {
            return Ok(Vec::new());
        }

        let mut items = Vec::new();

        let read_dir = fs::read_dir(dir_path).map_err(|e| {
            EngineError::FileSystem(format!(
                "Failed to read directory {}: {}",
                dir_path.display(),
                e
            ))
        })?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();

            if !show_hidden && name.starts_with('.') {
                continue;
            }

            let path = entry.path();
            let is_dir = path.is_dir();
            let file_type = entry.file_type().ok();
            let is_symlink = file_type.map(|ft| ft.is_symlink()).unwrap_or(false);

            let symlink_target = if is_symlink {
                fs::read_link(&path)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            let is_ignored = self.is_path_ignored(gitignore, &path, is_dir);

            let should_recurse = is_dir && !is_ignored;

            let children = if should_recurse {
                Some(self.build_file_tree(&path, show_hidden, depth + 1, gitignore)?)
            } else {
                None
            };

            items.push(FileTreeItem {
                name,
                path,
                is_dir,
                is_symlink,
                is_ignored,
                symlink_target,
                children,
            });
        }

        items.sort_by(dir_first_alpha_sort_tree);

        Ok(items)
    }

    /// Load .gitignore files from the git repository root and all parent directories
    fn load_gitignore(&self, root_path: &Path) -> Option<ignore::gitignore::Gitignore> {
        let mut builder = GitignoreBuilder::new(root_path);

        let mut current = Some(root_path);
        let mut found_any = false;

        while let Some(path) = current {
            let gitignore_path = path.join(".gitignore");
            if gitignore_path.exists() {
                let _ = builder.add(gitignore_path);
                found_any = true;
            }

            if path.join(".git").exists() {
                break;
            }

            if path.parent().is_none() {
                break;
            }

            current = path.parent();
        }

        if !found_any {
            return None;
        }

        builder.build().ok()
    }

    /// Check if a path is ignored using .gitignore
    fn is_path_ignored(
        &self,
        gitignore: &Option<ignore::gitignore::Gitignore>,
        path: &Path,
        is_dir: bool,
    ) -> bool {
        if let Some(gi) = gitignore {
            let base = gi.path();
            if let Ok(rel_path) = path.strip_prefix(base) {
                if gi.matched(rel_path, is_dir).is_ignore() {
                    return true;
                }
            }
        }
        false
    }

    /// Recursively search for directories by name pattern using the `ignore` crate
    pub fn search_dirs(
        &self,
        root_path: &Path,
        pattern: &str,
        max_results: usize,
        max_depth: usize,
    ) -> Result<Vec<FsEntry>> {
        if !root_path.exists() {
            return Err(EngineError::FileSystem(format!(
                "Path does not exist: {}",
                root_path.display()
            )));
        }

        if !root_path.is_dir() {
            return Err(EngineError::FileSystem(format!(
                "Path is not a directory: {}",
                root_path.display()
            )));
        }

        if pattern.is_empty() {
            return Ok(Vec::new());
        }

        let pattern_lower = pattern.to_lowercase();
        let mut results = Vec::new();

        let parallelism = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1);

        let walker = WalkBuilder::new(root_path)
            .max_depth(Some(max_depth))
            .hidden(false)
            .git_ignore(false)
            .parents(false)
            .follow_links(false)
            .threads(parallelism)
            .build();

        for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            let ft = entry.file_type();

            let Some(ft) = ft else {
                continue;
            };
            if !ft.is_dir() {
                continue;
            }

            if path == root_path {
                continue;
            }

            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if name.starts_with('.') {
                continue;
            }

            if !name.to_lowercase().contains(&pattern_lower) {
                continue;
            }

            let is_symlink = ft.is_symlink();
            let symlink_target = if is_symlink {
                fs::read_link(path)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            let is_git_repo = path.join(".git").exists();

            results.push(FsEntry {
                name,
                path: path.to_path_buf(),
                is_dir: true,
                is_symlink,
                is_ignored: false,
                symlink_target,
                is_git_repo,
            });

            if results.len() >= max_results {
                break;
            }
        }

        // Sort: Git repos first, then alphabetically
        results.sort_by(|a, b| match (a.is_git_repo, b.is_git_repo) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(results)
    }
}

impl Default for FsEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of validating a git path
#[derive(Debug, Clone, Serialize)]
pub struct GitValidationResult {
    pub is_valid: bool,
    pub is_git_repo: bool,
    pub suggested_name: Option<String>,
    pub default_branch: Option<String>,
    pub error: Option<String>,
}
