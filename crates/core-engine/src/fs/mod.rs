//! File system operations for project browsing and validation.

use std::path::{Path, PathBuf};
use std::fs;
use crate::error::EngineError;

pub type Result<T> = std::result::Result<T, EngineError>;

/// File system entry representing a file or directory
#[derive(Debug, Clone)]
pub struct FsEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_git_repo: bool,
}

/// File tree item for project file listing
#[derive(Debug, Clone)]
pub struct FileTreeItem {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub children: Option<Vec<FileTreeItem>>,
}

/// File system engine for browsing and validating directories
pub struct FsEngine;

impl FsEngine {
    pub fn new() -> Self {
        Self
    }

    /// Get the user's home directory
    pub fn get_home_dir(&self) -> Result<PathBuf> {
        dirs::home_dir()
            .ok_or_else(|| EngineError::FileSystem("Unable to determine home directory".to_string()))
    }

    /// List directory contents
    ///
    /// # Arguments
    /// * `path` - The directory path to list
    /// * `dirs_only` - If true, only return directories
    /// * `show_hidden` - If true, include hidden files/directories
    pub fn list_dir(&self, path: &Path, dirs_only: bool, show_hidden: bool) -> Result<Vec<FsEntry>> {
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

        let mut entries = Vec::new();

        let read_dir = fs::read_dir(path).map_err(|e| {
            EngineError::FileSystem(format!("Failed to read directory {}: {}", path.display(), e))
        })?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue, // Skip entries we can't read
            };

            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files unless requested
            if !show_hidden && name.starts_with('.') {
                continue;
            }

            let path = entry.path();
            let is_dir = path.is_dir();

            // Skip files if dirs_only is true
            if dirs_only && !is_dir {
                continue;
            }

            // Check if it's a git repository
            let is_git_repo = if is_dir {
                path.join(".git").exists()
            } else {
                false
            };

            entries.push(FsEntry {
                name,
                path,
                is_dir,
                is_git_repo,
            });
        }

        // Sort: directories first, then alphabetically
        entries.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

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
        let suggested_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string());

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

        // HEAD file format: "ref: refs/heads/main\n"
        if let Some(branch) = content.strip_prefix("ref: refs/heads/") {
            Ok(branch.trim().to_string())
        } else {
            // Detached HEAD state, return the commit hash
            Ok(content.trim().to_string())
        }
    }

    /// Expand tilde (~) in path to home directory
    pub fn expand_path(&self, path: &str) -> Result<PathBuf> {
        if path.starts_with('~') {
            let home = self.get_home_dir()?;
            let rest = path.strip_prefix("~/").unwrap_or(&path[1..]);
            Ok(home.join(rest))
        } else {
            Ok(PathBuf::from(path))
        }
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

        let metadata = fs::metadata(path).map_err(|e| {
            EngineError::FileSystem(format!("Failed to get file metadata: {}", e))
        })?;

        let content = fs::read_to_string(path).map_err(|e| {
            EngineError::FileSystem(format!("Failed to read file {}: {}", path.display(), e))
        })?;

        Ok((content, metadata.len()))
    }

    /// Write content to file
    pub fn write_file(&self, path: &Path, content: &str) -> Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    EngineError::FileSystem(format!(
                        "Failed to create parent directory: {}",
                        e
                    ))
                })?;
            }
        }

        fs::write(path, content).map_err(|e| {
            EngineError::FileSystem(format!("Failed to write file {}: {}", path.display(), e))
        })?;

        Ok(())
    }

    /// List project files recursively as a tree structure
    pub fn list_project_files(&self, root_path: &Path, show_hidden: bool) -> Result<Vec<FileTreeItem>> {
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

        self.build_file_tree(root_path, show_hidden, 0)
    }

    /// Build file tree recursively with depth limit
    fn build_file_tree(&self, dir_path: &Path, show_hidden: bool, depth: usize) -> Result<Vec<FileTreeItem>> {
        // Limit recursion depth to prevent excessive file listing
        const MAX_DEPTH: usize = 10;
        if depth >= MAX_DEPTH {
            return Ok(Vec::new());
        }

        let mut items = Vec::new();

        let read_dir = fs::read_dir(dir_path).map_err(|e| {
            EngineError::FileSystem(format!("Failed to read directory {}: {}", dir_path.display(), e))
        })?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files unless requested
            if !show_hidden && name.starts_with('.') {
                continue;
            }

            // Skip common non-project directories
            if self.should_skip_directory(&name) {
                continue;
            }

            let path = entry.path();
            let is_dir = path.is_dir();

            let children = if is_dir {
                Some(self.build_file_tree(&path, show_hidden, depth + 1)?)
            } else {
                None
            };

            items.push(FileTreeItem {
                name,
                path,
                is_dir,
                children,
            });
        }

        // Sort: directories first, then alphabetically
        items.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(items)
    }

    /// Check if a directory should be skipped (common non-project directories)
    fn should_skip_directory(&self, name: &str) -> bool {
        matches!(
            name,
            "node_modules"
                | "target"
                | ".git"
                | ".next"
                | "dist"
                | "build"
                | ".turbo"
                | "__pycache__"
                | ".venv"
                | "venv"
                | ".idea"
                | ".vscode"
        )
    }
}

impl Default for FsEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of validating a git path
#[derive(Debug, Clone)]
pub struct GitValidationResult {
    pub is_valid: bool,
    pub is_git_repo: bool,
    pub suggested_name: Option<String>,
    pub default_branch: Option<String>,
    pub error: Option<String>,
}
