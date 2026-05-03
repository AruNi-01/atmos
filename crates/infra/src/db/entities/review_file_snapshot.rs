use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "review_file_snapshot")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub revision_guid: String,
    pub file_identity_guid: String,
    pub file_path: String,
    pub git_status: String,
    pub old_rel_path: String,
    pub new_rel_path: String,
    pub meta_rel_path: String,
    pub old_sha256: Option<String>,
    pub new_sha256: Option<String>,
    pub old_size: i64,
    pub new_size: i64,
    pub is_binary: bool,
    pub display_order: i32,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
