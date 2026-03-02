//! ACP tool handler trait - implemented by core-service to route tool calls to engines.

use std::path::Path;

use async_trait::async_trait;

/// Handler for ACP tool calls - implemented by core-service, routes to FsEngine, TerminalService, etc.
#[async_trait]
pub trait AcpToolHandler: Send + Sync {
    /// Resolve path relative to session cwd (workspace root). Returns absolute path.
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> std::path::PathBuf;

    /// Read file content. Path is absolute.
    async fn read_text_file(&self, path: &Path) -> Result<String, String>;

    /// Write file content. Path is absolute.
    async fn write_text_file(&self, path: &Path, content: &str) -> Result<(), String>;
}
