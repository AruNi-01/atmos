pub mod agent_hooks;
pub mod app;
pub mod device_control;
pub mod disk_analyzer;
pub mod error;
pub mod fs;
pub mod git;
pub mod github;
pub mod host_devices;
pub mod linear;
pub mod local_services;
pub mod project_atmos;
pub mod resource_metrics;
pub mod search;
pub mod shims;
pub mod test_engine;
pub mod tmux;

pub use app::AppEngine;
pub use device_control::{
    android_appearance_get, android_appearance_get_args, android_appearance_set,
    android_appearance_set_args, ios_appearance_get, ios_appearance_get_args, ios_appearance_set,
    ios_appearance_set_args, parse_android_uimode_night, parse_ios_appearance, png_dimensions,
    serve_emu_key, serve_emu_screenshot, serve_emu_swipe, serve_emu_tap, serve_emu_text,
    serve_sim_button, serve_sim_swipe, serve_sim_tap, serve_sim_type, simctl_screenshot,
    validate_coord, validate_point, write_png, Appearance, ScreenshotSize,
};
pub use disk_analyzer::{
    agent_data_roots, cleanup_suggestions, clear_path_cache, clear_suggestions, finalize_tree,
    invalidate_path_cache, limit_tree_depth, node_needs_wider_children, prune_tree, CleanupKind,
    CleanupSuggestion, DiskAnalyzerEngine, DiskNode, DiskPathKind, DiskScanRoots, DiskVolumeInfo,
    MeasureBudget, ProgressCallback, ScanProgress, ScanStats, ScanStatus, CACHE_TTL,
    DEFAULT_TREE_DEPTH, OTHER_NAME,
};
pub use error::EngineError;
pub use fs::{
    compensate_path, CompensateStrategy, FileTreeItem, FsEngine, FsEntry, GitValidationResult,
};
pub use git::{
    list_ignored_paths, list_ignored_paths_for_many, show_git_blob_bytes,
    sync_worktree_local_excludes, ChangedFileInfo, ChangedFilesInfo, CommitInfo, DiffContentKind,
    DiffPreviewKind, FileDiffInfo, GitBlobLocator, GitEngine, GitStatus, HistoryCommit,
    HistoryPage, HistoryRef, HistoryRefKind, WorktreeInfo,
};
pub use github::GithubEngine;
pub use host_devices::{
    boot_android_argv, boot_ios_argv, camera_feed_path, camera_wiring_matches, clear_camera_png,
    collect_android_snapshot, collect_ios_snapshot, create_android_avd_argv, create_ios_argv,
    default_android_avd_name, default_ios_create_name, delete_android_avd_argv, delete_ios_argv,
    emulator_serial, free_emulator_port, ios_boot_already_booted, ios_shutdown_already_shutdown,
    is_valid_avd_name, list_android_profiles, list_android_system_images, list_ios_runtimes,
    merge_android_devices, parse_adb_devices_l, parse_avd_device_list, parse_avd_list,
    parse_emu_avd_name, parse_sdk_installed_system_images, parse_simctl_devices,
    parse_simctl_runtimes, resolve_android_toolchain_from, sanitize_camera_serial,
    seed_camera_feeds, set_camera_png, shutdown_android_argv, shutdown_ios_argv,
    validate_camera_png, AdbDeviceLine, AndroidImage, AndroidProfile, AndroidSnapshot,
    AndroidToolchain, BootState, CameraLens, DevicePlatform, HostDevice, IosDeviceType, IosRuntime,
    IosSnapshot, CAMERA_PLACEHOLDER_PNG, CAMERA_PNG_MAX_BYTES,
};
pub use linear::{
    build_issues_filter, extract_github_refs_from_urls, linear_issue_to_import_body,
    oauth_pkce_challenge, parse_rate_limit_headers, select_oauth_redirect, LinearAuth,
    LinearClient, LinearIssue, LinearIssueListOptions, LinearIssuePreset, LinearOAuthShell,
    LinearRateLimit,
};
pub use local_services::{
    kill_process_tree, orphan_hints, process_snapshot, terminate_process_tree,
    LocalHttpProbeResult, LocalServiceProtocol, LocalServicesEngine, LocalTcpListener,
    ProcessSnapshot,
};
pub use project_atmos::{
    ensure_project_atmos_dir, ensure_project_atmos_gitignore, ensure_project_atmos_ignore_rule,
    PROJECT_ATMOS_DIR, PROJECT_ATMOS_IGNORED_ENTRIES,
};
pub use resource_metrics::{
    normalize_process_cpu, ResourceDiskSample, ResourceHostCpuCoreSample, ResourceHostMemorySample,
    ResourceHostSample, ResourceMemoryAccounting, ResourceMetricsEngine, ResourceProcessSample,
    ResourceSample, DISK_CACHE_TTL,
};
pub use search::{search_content, SearchMatch, SearchResult};
pub use test_engine::TestEngine;
pub use tmux::{
    is_inline_mouse_tui_command, is_shell_command, pane_command_basename, parse_pane_processes,
    preferred_existing_session_name, resolve_mouse_tracking_restore,
    should_restore_tui_mouse_tracking, MouseEventMode, MouseFormat, MouseModeState, TmuxEngine,
    TmuxInstallPlan, TmuxPaneCapturePage, TmuxPaneProcess, TmuxPaneSnapshot, TmuxSessionInfo,
    TmuxVersion, TmuxWindowAtmosMetadata, TmuxWindowInfo, ATMOS_MOUSE_TRACKING_OPTION,
    DEFAULT_TUI_MOUSE_RESTORE,
};
