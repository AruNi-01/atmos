#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// 获取 Git 状态请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusRequest {
    /// 仓库/工作区路径
    pub path: String,
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
    #[serde(default)]
    pub base_branch: Option<String>,
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
    /// 新增行数
    pub additions: u32,
    /// 删除行数
    pub deletions: u32,
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
    #[serde(default)]
    pub base_branch: Option<String>,
    /// 为 true 时对比 index 与工作区（仅未暂存部分）；默认 false 表示对比 compare_ref 与工作区
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

/// 获取单个文件 diff 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiffResponse {
    /// 文件相对路径
    pub file_path: String,
    /// 旧文件内容 (HEAD 版本)
    pub old_content: String,
    /// 新文件内容 (工作区版本)
    pub new_content: String,
    /// 文件状态
    pub status: String,
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
