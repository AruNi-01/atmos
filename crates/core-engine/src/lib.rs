pub mod agent_hooks;
pub mod app;
pub mod disk_analyzer;
pub mod error;
pub mod fs;
pub mod git;
pub mod github;
pub mod local_services;
pub mod search;
pub mod shims;
pub mod test_engine;
pub mod tmux;

pub use app::AppEngine;
pub use disk_analyzer::{
    cleanup_suggestions, clear_path_cache, finalize_tree, invalidate_path_cache, limit_tree_depth,
    prune_tree, CleanupSuggestion, DiskAnalyzerEngine, DiskNode, DiskVolumeInfo, ProgressCallback,
    ScanProgress, ScanStats, ScanStatus, CACHE_TTL, DEFAULT_TREE_DEPTH,
};
pub use error::EngineError;
pub use fs::{
    compensate_path, CompensateStrategy, FileTreeItem, FsEngine, FsEntry, GitValidationResult,
};
pub use git::{
    list_ignored_paths, list_ignored_paths_for_many, show_git_blob_bytes,
    sync_worktree_local_excludes, ChangedFileInfo, ChangedFilesInfo, CommitInfo, DiffContentKind,
    DiffPreviewKind, FileDiffInfo, GitBlobLocator, GitEngine, GitStatus, WorktreeInfo,
};
pub use github::GithubEngine;
pub use local_services::{
    LocalHttpProbeResult, LocalServiceProtocol, LocalServicesEngine, LocalTcpListener,
};
pub use search::{search_content, SearchMatch, SearchResult};
pub use test_engine::TestEngine;
pub use tmux::{
    is_inline_mouse_tui_command, is_shell_command, pane_command_basename,
    resolve_mouse_tracking_restore, should_restore_tui_mouse_tracking, MouseEventMode, MouseFormat,
    MouseModeState, TmuxEngine, TmuxInstallPlan, TmuxPaneCapturePage, TmuxPaneSnapshot,
    TmuxSessionInfo, TmuxVersion, TmuxWindowAtmosMetadata, TmuxWindowInfo,
    ATMOS_MOUSE_TRACKING_OPTION, DEFAULT_TUI_MOUSE_RESTORE,
};
