pub mod agent_hooks;
pub mod app;
pub mod code_ast;
pub mod error;
pub mod fs;
pub mod git;
pub mod github;
pub mod search;
pub mod shims;
pub mod test_engine;
pub mod tmux;

pub use app::AppEngine;
pub use code_ast::{build_code_ast_artifacts, CodeAstBuildResult};
pub use error::EngineError;
pub use fs::{FileTreeItem, FsEngine, FsEntry, GitValidationResult};
pub use git::{
    ChangedFileInfo, ChangedFilesInfo, CommitInfo, FileDiffInfo, GitEngine, GitStatus, WorktreeInfo,
};
pub use github::GithubEngine;
pub use search::{search_content, SearchMatch, SearchResult};
pub use test_engine::TestEngine;
pub use tmux::{
    TmuxEngine, TmuxInstallPlan, TmuxPaneSnapshot, TmuxSessionInfo, TmuxVersion, TmuxWindowInfo,
};
