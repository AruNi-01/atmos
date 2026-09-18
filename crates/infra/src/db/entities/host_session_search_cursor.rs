use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "host_session_search_cursor")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub session_key: String,
    pub source_mtime_ms: i64,
    pub source_size: i64,
    pub body_ready: i32,
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
