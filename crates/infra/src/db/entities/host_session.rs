use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "host_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub session_key: String,
    pub provider_id: String,
    pub native_id: String,
    pub title: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: DateTime,
    pub last_active_at: DateTime,
    pub message_count: Option<i32>,
    pub byte_size: Option<i64>,
    pub model: Option<String>,
    pub source_path: String,
    pub parent_native_id: Option<String>,
    pub source_mtime_ms: i64,
    pub source_size: i64,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
