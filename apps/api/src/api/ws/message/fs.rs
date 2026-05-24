#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 列出目录请求数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListDirRequest {
    pub path: String,
    /// 是否只显示目录
    #[serde(default)]
    pub dirs_only: bool,
    /// 是否显示隐藏文件
    #[serde(default)]
    pub show_hidden: bool,
    /// 如果找不到目录是否忽略错误返回空列表
    #[serde(default)]
    pub ignore_not_found: bool,
}

/// 目录条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_git_repo: bool,
}

/// 列出目录响应数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListDirResponse {
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FsEntry>,
}

/// 验证 Git 路径请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsValidateGitPathRequest {
    pub path: String,
}

/// 获取默认 canvas board 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasBoardResponse {
    pub guid: String,
    pub slug: String,
    pub name: String,
    pub document_json: String,
    pub updated_at: String,
}

/// 更新默认 canvas board 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasUpdateDefaultBoardRequest {
    pub document_json: String,
}

/// Register a browser tab as terminal-agent bridge target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasBridgeRegisterRequest {
    /// Stable id for this browser tab session (UUID v4 minted client-side).
    pub client_id: String,
    /// Optional short label (e.g. window title) for status output.
    #[serde(default)]
    pub label: Option<String>,
    /// Whether this tab will accept mutating commands.
    #[serde(default = "default_accepts_commands")]
    pub accepts_commands: bool,
    /// Protocol capabilities advertised by the tab (forward-compatibility).
    #[serde(default)]
    pub capabilities: Vec<String>,
}

fn default_accepts_commands() -> bool {
    true
}

/// Unregister a browser tab from the bridge registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasBridgeUnregisterRequest {
    pub client_id: String,
}

/// Browser uplink completing an `canvas_agent_dispatch` round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasAgentDispatchResultRequest {
    /// Request id minted by the original CLI invoke.
    pub request_id: String,
    /// `true` when the command ran cleanly in the editor.
    pub success: bool,
    /// Stable error code (e.g. `STALE_SHAPE_ID`, `EDITOR_NOT_READY`, `VALIDATION_ARG`).
    #[serde(default)]
    pub error_code: Option<String>,
    /// Human-readable error message (English).
    #[serde(default)]
    pub error_message: Option<String>,
    /// Whether the agent can recover via `get-state` + retry.
    #[serde(default)]
    pub recoverable: Option<bool>,
    /// Command result payload (e.g. created shape ids, get-state snapshot).
    #[serde(default)]
    pub data: Value,
}

/// 验证 Git 路径响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsValidateGitPathResponse {
    pub is_valid: bool,
    pub is_git_repo: bool,
    pub suggested_name: Option<String>,
    pub default_branch: Option<String>,
    pub error: Option<String>,
}

/// 读取文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsReadFileRequest {
    pub path: String,
}

/// 读取文件响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsReadFileResponse {
    pub path: String,
    pub content: String,
    pub size: u64,
}

/// 写入文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsWriteFileRequest {
    pub path: String,
    pub content: String,
}

/// 写入文件响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsWriteFileResponse {
    pub path: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsCreateDirRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsRenamePathRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsDeletePathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsDuplicatePathRequest {
    pub from: String,
    pub to: String,
}

/// 列出项目文件树请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListProjectFilesRequest {
    /// 项目根目录路径
    pub root_path: String,
    /// 是否显示隐藏文件
    #[serde(default)]
    pub show_hidden: bool,
}

/// 文件树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

/// 列出项目文件树响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListProjectFilesResponse {
    pub root_path: String,
    pub tree: Vec<FileTreeNode>,
}

/// 搜索文件内容请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchContentRequest {
    /// 项目根目录路径
    pub root_path: String,
    /// 搜索关键词
    pub query: String,
    /// 最大结果数（默认 50）
    #[serde(default = "default_max_results")]
    pub max_results: usize,
    /// 是否区分大小写（默认 false）
    #[serde(default)]
    pub case_sensitive: bool,
}

fn default_max_results() -> usize {
    50
}

/// 搜索匹配项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    /// 文件相对路径
    pub file_path: String,
    /// 行号
    pub line_number: usize,
    /// 行内容
    pub line_content: String,
    /// 匹配开始位置
    pub match_start: usize,
    /// 匹配结束位置
    pub match_end: usize,
    /// 上文内容
    #[serde(default)]
    pub context_before: Vec<String>,
    /// 下文内容
    #[serde(default)]
    pub context_after: Vec<String>,
}

/// 搜索文件内容响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchContentResponse {
    /// 匹配结果列表
    pub matches: Vec<SearchMatch>,
    /// 是否被截断（超过最大结果数）
    pub truncated: bool,
}

/// 搜索目录请求（按名称）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchDirsRequest {
    /// 搜索根目录路径
    pub root_path: String,
    /// 搜索关键词（目录名）
    pub query: String,
    /// 最大结果数（默认 50）
    #[serde(default = "default_max_results")]
    pub max_results: usize,
    /// 最大搜索深度（默认 4）
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
}

fn default_max_depth() -> usize {
    4
}

/// 搜索目录响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchDirsResponse {
    /// 匹配的目录列表
    pub entries: Vec<FsEntry>,
}

/// 使用外部应用打开路径请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppOpenRequest {
    /// 应用名称 (e.g., "Finder", "VS Code", "Terminal")
    pub app_name: String,
    /// 要打开的路径
    pub path: String,
}
