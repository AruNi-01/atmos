pub mod agent_hooks;
pub mod app;
pub mod error;
pub mod fs;
pub mod git;
pub mod github;
pub mod search;
pub mod shims;
pub mod test_engine;
pub mod tmux;

pub use app::AppEngine;
pub use error::EngineError;
pub use fs::{
    compensate_path, CompensateStrategy, FileTreeItem, FsEngine, FsEntry, GitValidationResult,
};
pub use git::{
    list_ignored_paths, list_ignored_paths_for_many, sync_worktree_local_excludes, ChangedFileInfo,
    ChangedFilesInfo, CommitInfo, FileDiffInfo, GitEngine, GitStatus, WorktreeInfo,
};
pub use github::GithubEngine;
pub use search::{search_content, SearchMatch, SearchResult};
pub use test_engine::TestEngine;
pub use tmux::{
    TmuxEngine, TmuxInstallPlan, TmuxPaneCapturePage, TmuxPaneSnapshot, TmuxSessionInfo,
    TmuxVersion, TmuxWindowInfo,
};
