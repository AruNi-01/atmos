use serde::{Deserialize, Serialize};
use serde_json::Value;

/// WebSocket 消息协议
/// 所有 WebSocket 通信都使用此枚举类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsMessage {
    // ===== 控制消息 =====
    /// 心跳 ping
    Ping,
    /// 心跳 pong
    Pong,

    // ===== 通用消息 =====
    /// 通用消息（保留向后兼容）
    Message(MessagePayload),
    /// 通用请求
    Request(WsRequest),
    /// 通用响应
    Response(WsResponse),
    /// 错误响应
    Error(WsError),
}

/// 通用消息体（向后兼容）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    pub id: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// 通用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsRequest {
    /// 请求 ID（用于关联响应）
    pub request_id: String,
    /// 操作类型
    pub action: WsAction,
    /// 请求数据
    #[serde(default)]
    pub data: Value,
}

/// 通用响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsResponse {
    /// 关联的请求 ID
    pub request_id: String,
    /// 是否成功
    pub success: bool,
    /// 响应数据
    #[serde(default)]
    pub data: Value,
}

/// 错误响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsError {
    /// 关联的请求 ID
    pub request_id: String,
    /// 错误代码
    pub code: String,
    /// 错误消息
    pub message: String,
}

/// 操作类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WsAction {
    // ===== 文件系统操作 =====
    /// 获取用户主目录
    FsGetHomeDir,
    /// 列出目录内容
    FsListDir,
    /// 验证 Git 仓库路径
    FsValidateGitPath,

    // ===== Project 操作 =====
    /// 获取所有项目
    ProjectList,
    /// 创建项目
    ProjectCreate,
    /// 更新项目
    ProjectUpdate,
    /// 删除项目
    ProjectDelete,
    /// 验证项目路径
    ProjectValidatePath,

    // ===== Workspace 操作 =====
    /// 获取项目下的 Workspace 列表
    WorkspaceList,
    /// 创建 Workspace
    WorkspaceCreate,
    /// 更新 Workspace 名称
    WorkspaceUpdateName,
    /// 更新 Workspace 分支
    WorkspaceUpdateBranch,
    /// 更新 Workspace 排序
    WorkspaceUpdateOrder,
    /// 删除 Workspace
    WorkspaceDelete,
    /// 置顶 Workspace
    WorkspacePin,
    /// 取消置顶 Workspace
    WorkspaceUnpin,
    /// 归档 Workspace
    WorkspaceArchive,
}

// ===== 文件系统操作数据结构 =====

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

/// 验证 Git 路径响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsValidateGitPathResponse {
    pub is_valid: bool,
    pub is_git_repo: bool,
    pub suggested_name: Option<String>,
    pub default_branch: Option<String>,
    pub error: Option<String>,
}

// ===== Project 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectCreateRequest {
    pub name: String,
    pub main_file_path: String,
    #[serde(default)]
    pub sidebar_order: i32,
    pub border_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdateRequest {
    pub guid: String,
    pub name: Option<String>,
    pub border_color: Option<String>,
    pub sidebar_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDeleteRequest {
    pub guid: String,
}

// ===== Workspace 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceListRequest {
    pub project_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceCreateRequest {
    pub project_guid: String,
    pub name: String,
    pub branch: String,
    #[serde(default)]
    pub sidebar_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateNameRequest {
    pub guid: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateBranchRequest {
    pub guid: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateOrderRequest {
    pub guid: String,
    pub sidebar_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDeleteRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePinRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUnpinRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceArchiveRequest {
    pub guid: String,
}

// ===== WsMessage 工厂方法 =====

impl WsMessage {
    pub fn ping() -> Self {
        Self::Ping
    }

    pub fn pong() -> Self {
        Self::Pong
    }

    pub fn message(id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: None,
        })
    }

    pub fn message_with_metadata(
        id: impl Into<String>,
        content: impl Into<String>,
        metadata: Value,
    ) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: Some(metadata),
        })
    }

    /// 创建成功响应
    pub fn success(request_id: impl Into<String>, data: Value) -> Self {
        Self::Response(WsResponse {
            request_id: request_id.into(),
            success: true,
            data,
        })
    }

    /// 创建失败响应
    pub fn error(request_id: impl Into<String>, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Error(WsError {
            request_id: request_id.into(),
            code: code.into(),
            message: message.into(),
        })
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
