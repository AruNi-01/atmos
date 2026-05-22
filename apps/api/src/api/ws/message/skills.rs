use serde::{Deserialize, Serialize};

pub use core_service::{SkillFile, SkillInfo, SkillPlacement};

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
