#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// 获取 Git 状态请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusRequest {
    /// 仓库/工作区路径
    pub path: String,
}

/// 批量获取 Git 状态请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusBatchRequest {
    pub paths: Vec<String>,
}

/// 获取 HEAD 提交 hash 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetHeadCommitRequest {
    /// 仓库/工作区路径
    pub path: String,
}

/// 获取 base..head 提交数量请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetCommitCountRequest {
    pub path: String,
    pub base_commit: String,
    pub head_commit: String,
}

/// Git 状态响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusResponse {
    /// 是否有未提交的更改
    pub has_uncommitted_changes: bool,
    /// 是否存在未解决的 merge conflicts
    pub has_merge_conflicts: bool,
    /// 是否有未推送的提交
    pub has_unpushed_commits: bool,
    /// 未提交更改的数量
    pub uncommitted_count: u32,
    /// 未推送提交的数量
    pub unpushed_count: u32,
    /// 当前分支落后其远程跟踪分支的提交数
    pub upstream_behind_count: Option<u32>,
    /// 默认远程分支名
    pub default_branch: Option<String>,
    /// 当前分支对应的远程分支领先 origin/<default_branch> 的提交数
    pub default_branch_ahead: Option<u32>,
    /// 当前分支对应的远程分支落后 origin/<default_branch> 的提交数
    pub default_branch_behind: Option<u32>,
    /// 当前分支名
    pub current_branch: Option<String>,
    /// Github owner
    pub github_owner: Option<String>,
    /// Github repo
    pub github_repo: Option<String>,
}

/// 单个批量 Git 状态结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusBatchResult {
    pub path: String,
    pub status: Option<GitStatusResponse>,
    pub error: Option<String>,
}

/// 批量 Git 状态响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusBatchResponse {
    pub results: Vec<GitGetStatusBatchResult>,
}

/// 列出 Git 分支请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitListBranchesRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 分支列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranchesResponse {
    /// 分支列表
    pub branches: Vec<String>,
}

/// 重命名 Git 分支请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRenameBranchRequest {
    /// 仓库路径
    pub path: String,
    /// 旧分支名
    pub old_name: String,
    /// 新分支名
    pub new_name: String,
}

/// 获取变更文件列表请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFilesRequest {
    /// 仓库路径
    pub path: String,
    /// Remote branch name used for branch comparison.
    #[serde(default)]
    pub base_branch: Option<String>,
    /// Explicit Git ref used for commit/hash comparison.
    #[serde(default)]
    pub base_ref: Option<String>,
    /// Commit whose own patch should be displayed.
    #[serde(default)]
    pub commit_ref: Option<String>,
    #[serde(default)]
    pub use_preferred_compare: bool,
}

/// 变更文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFile {
    /// 文件路径
    pub path: String,
    /// 文件状态: M(修改), A(新增), D(删除), R(重命名), C(复制), U(未合并)
    pub status: String,
    /// 新增行数（二进制时为 0）
    pub additions: u32,
    /// 删除行数（二进制时为 0）
    pub deletions: u32,
    /// Git/内容判定的二进制文件
    #[serde(default)]
    pub is_binary: bool,
}

/// 获取变更文件列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFilesResponse {
    /// 变更文件列表
    pub files: Vec<GitChangedFile>,
    /// 总新增行数
    pub total_additions: u32,
    /// 总删除行数
    pub total_deletions: u32,
}

/// 获取单个文件 diff 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiffRequest {
    /// 仓库路径
    pub path: String,
    /// 文件相对路径
    pub file_path: String,
    /// Remote branch name used for branch comparison.
    #[serde(default)]
    pub base_branch: Option<String>,
    /// Explicit Git ref used for commit/hash comparison.
    #[serde(default)]
    pub base_ref: Option<String>,
    /// Commit whose own patch should be displayed.
    #[serde(default)]
    pub commit_ref: Option<String>,
    /// 为 true 时对比 index 与工作区（仅未暂存部分）；默认 false 表示对比 compare_ref 与工作区
    #[serde(default)]
    pub against_index: bool,
}

/// 批量获取文件 diff 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFilesDiffRequest {
    /// 仓库路径
    pub path: String,
    /// 文件相对路径列表
    pub file_paths: Vec<String>,
    /// Remote branch name used for branch comparison.
    #[serde(default)]
    pub base_branch: Option<String>,
    /// Explicit Git ref used for commit/hash comparison.
    #[serde(default)]
    pub base_ref: Option<String>,
    /// Commit whose own patch should be displayed.
    #[serde(default)]
    pub commit_ref: Option<String>,
    /// 为 true 时对比 index 与工作区（仅未暂存部分）
    #[serde(default)]
    pub against_index: bool,
}

/// 针对单个变更块的补丁应用请求（unified diff 文本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPatchChunkRequest {
    pub path: String,
    pub file_path: String,
    pub patch: String,
    /// 来自 `git_file_diff` 的 status（例如 M / A）
    pub file_status: String,
}

/// 补丁应用响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPatchChunkResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Diff content classification for the client renderer.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffContentKind {
    Text,
    Binary,
    TooLarge,
}

/// Preview affordance for non-text files.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffPreviewKind {
    None,
    Image,
    Media,
}

/// How the client fetches raw bytes for a binary/image preview.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GitBlobLocator {
    Worktree {
        path: String,
    },
    /// `rev` is a git revision (`HEAD`, `abc123`, `origin/main`) or an index
    /// show-spec (`:path`) when the side is the index.
    Git {
        rev: String,
        path: String,
    },
}

/// 获取单个文件 diff 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiffResponse {
    /// 文件相对路径
    pub file_path: String,
    /// 文件状态
    pub status: String,
    /// 实际使用的 compare ref
    pub compare_ref: Option<String>,
    pub kind: DiffContentKind,
    pub preview_kind: DiffPreviewKind,
    /// Present only when `kind == text`
    pub old_text: Option<String>,
    /// Present only when `kind == text`
    pub new_text: Option<String>,
    pub old_size: Option<u64>,
    pub new_size: Option<u64>,
    pub old_sha256: Option<String>,
    pub new_sha256: Option<String>,
    pub old_blob: Option<GitBlobLocator>,
    pub new_blob: Option<GitBlobLocator>,
}

/// 单个批量文件 diff 结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFilesDiffResult {
    pub file_path: String,
    pub diff: Option<GitFileDiffResponse>,
    pub error: Option<String>,
}

/// 批量文件 diff 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFilesDiffResponse {
    pub results: Vec<GitFilesDiffResult>,
}

/// Git 提交请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitRequest {
    /// 仓库路径
    pub path: String,
    /// 提交信息
    pub message: String,
}

/// Git commit message 生成请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGenerateCommitMessageRequest {
    /// 仓库路径
    pub path: String,
}

/// Git commit message 生成响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGenerateCommitMessageResponse {
    /// 生成的 commit message
    pub message: String,
}

/// Git 提交响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitResponse {
    /// 是否成功
    pub success: bool,
    /// 提交 hash
    pub commit_hash: Option<String>,
}

/// Git 推送请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPushRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 推送响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPushResponse {
    /// 是否成功
    pub success: bool,
}

/// Git 暂存文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStageRequest {
    /// 仓库路径
    pub path: String,
    /// 要暂存的文件路径列表
    pub files: Vec<String>,
}

/// Git 取消暂存请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitUnstageRequest {
    /// 仓库路径
    pub path: String,
    /// 要取消暂存的文件路径列表
    pub files: Vec<String>,
}

/// Git 放弃工作区更改请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiscardUnstagedRequest {
    /// 仓库路径
    pub path: String,
    /// 要放弃更改的文件路径列表
    pub files: Vec<String>,
}

/// Git 放弃未追踪文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiscardUntrackedRequest {
    /// 仓库路径
    pub path: String,
    /// 要删除的未追踪文件路径列表
    pub files: Vec<String>,
}

/// Git 拉取请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPullRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 获取请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFetchRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 同步请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSyncRequest {
    /// 仓库路径
    pub path: String,
}

/// 获取 Git 提交日志请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogRequest {
    /// 仓库路径
    pub path: String,
    /// 每页条数（默认 30）
    #[serde(default = "default_git_log_limit")]
    pub limit: usize,
    /// 跳过的条数（用于分页，默认 0）
    #[serde(default)]
    pub offset: usize,
}

fn default_git_log_limit() -> usize {
    30
}

/// 获取拓扑 Git 历史（带 parent hashes 与 refs）请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHistoryRequest {
    /// 仓库路径
    pub path: String,
    /// 每页条数（默认 100，最大 1000）
    #[serde(default = "default_git_history_limit")]
    pub limit: usize,
    /// 跳过的条数（cursor，默认 0）
    #[serde(default)]
    pub cursor: usize,
}

fn default_git_history_limit() -> usize {
    100
}
