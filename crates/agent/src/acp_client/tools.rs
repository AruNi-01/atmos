//! ACP tool handler trait - implemented by core-service to route tool calls to engines.

use std::path::Path;

use async_trait::async_trait;

/// Handler for ACP tool calls - implemented by core-service, routes to FsEngine, TerminalService, etc.
// Clippy `double_must_use` is a false positive of `async_trait`: it boxes
// the method into `Pin<Box<dyn Future>>` (already `#[must_use]`) and also
// emits a second `#[must_use]`. Keep `async_trait` because this trait is
// used as `dyn` (RPITIT is not object-safe).
#[allow(clippy::double_must_use)]
#[async_trait]
pub trait AcpToolHandler: Send + Sync {
    /// Resolve path relative to session cwd (workspace root). Returns absolute path.
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> std::path::PathBuf;

    /// Read file content. Path is absolute.
    async fn read_text_file(&self, path: &Path) -> Result<String, String>;

    /// Write file content. Path is absolute.
    async fn write_text_file(&self, path: &Path, content: &str) -> Result<(), String>;
}
