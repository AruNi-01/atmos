use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "review_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub workspace_guid: String,
    pub project_guid: String,
    pub repo_path: String,
    pub storage_root_rel_path: String,
    pub base_ref: Option<String>,
    pub base_commit: Option<String>,
    pub head_commit: String,
    pub current_revision_guid: String,
    pub status: String,
    pub title: Option<String>,
    pub created_by: Option<String>,
    pub closed_at: Option<DateTime>,
    pub archived_at: Option<DateTime>,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
