use serde::{Deserialize, Serialize};

/// Skill 中的文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    /// 文件名
    pub name: String,
    /// 文件相对路径
    pub relative_path: String,
    /// 文件绝对路径
    pub absolute_path: String,
    /// 文件内容 (仅文本文件)
    pub content: Option<String>,
    /// 是否是主文件 (SKILL.md, README.md 等)
    pub is_main: bool,
    /// 是否是符号链接
    #[serde(default)]
    pub is_symlink: bool,
    /// 符号链接目标 (相对/绝对路径, 原样)
    #[serde(default)]
    pub symlink_target: Option<String>,
}

/// Skill 的单个安装位置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPlacement {
    /// Placement 唯一标识
    pub id: String,
    /// 来源 Agent（claude、codex 等）
    pub agent: String,
    /// 作用域: global / project / inside_project
    pub scope: String,
    /// 项目 ID（scope=project / inside_project 时）
    pub project_id: Option<String>,
    /// 项目名称（scope=project / inside_project 时）
    pub project_name: Option<String>,
    /// 当前入口路径（enabled 时为原始路径，disabled 时为 disabled 存储路径）
    pub path: String,
    /// 启用后应恢复到的原始路径
    pub original_path: String,
    /// 解析后的真实路径（若可解析）
    pub resolved_path: Option<String>,
    /// 当前状态: enabled / disabled
    pub status: String,
    /// 入口类型: directory / file / symlink
    pub entry_kind: String,
    /// symlink 的 target（若适用）
    pub symlink_target: Option<String>,
    /// 是否允许删除
    pub can_delete: bool,
    /// 是否允许 enable / disable
    pub can_toggle: bool,
}

/// 已安装的 Skill 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    /// Skill 唯一标识
    pub id: String,
    /// Skill 名称
    pub name: String,
    /// Skill 描述
    pub description: String,
    /// 来源 Agent 列表 (cursor, claude, factory, etc.)
    pub agents: Vec<String>,
    /// 作用域: global 或 project
    pub scope: String,
    /// 项目 ID (scope=project 时)
    pub project_id: Option<String>,
    /// 项目名称 (scope=project 时)
    pub project_name: Option<String>,
    /// Skill 文件路径
    pub path: String,
    /// Skill 包含的所有文件
    pub files: Vec<SkillFile>,
    /// Skill 标题 (从 frontmatter 提取)
    pub title: Option<String>,
    /// 聚合状态: enabled / disabled / partial
    pub status: String,
    /// 是否允许管理
    pub manageable: bool,
    /// 是否允许删除
    pub can_delete: bool,
    /// 是否允许 enable / disable
    pub can_toggle: bool,
    /// 该 Skill 的所有实际安装位置
    pub placements: Vec<SkillPlacement>,
}

/// Skills 列表请求
///
/// `force_refresh = true` 时绕过磁盘缓存，同步做一次完整扫描并覆盖缓存；否则走
/// stale-while-revalidate：立即返回缓存（即便已过期），若超过 TTL 再在后台刷新。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SkillsListRequest {
    #[serde(default)]
    pub force_refresh: bool,
}

/// Skills 列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsListResponse {
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsGetRequest {
    pub scope: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsSetEnabledRequest {
    pub id: String,
    pub enabled: bool,
    pub placement_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsDeleteRequest {
    pub id: String,
    pub placement_ids: Option<Vec<String>>,
}
