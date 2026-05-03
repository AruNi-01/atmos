use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "review_fix_run")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub session_guid: String,
    pub base_revision_guid: String,
    pub result_revision_guid: Option<String>,
    pub execution_mode: String,
    pub status: String,
    pub prompt_rel_path: Option<String>,
    pub result_rel_path: Option<String>,
    pub patch_rel_path: Option<String>,
    pub summary_rel_path: Option<String>,
    pub agent_session_ref: Option<String>,
    pub finalize_attempts: i32,
    pub failure_reason: Option<String>,
    pub created_by: Option<String>,
    pub started_at: Option<DateTime>,
    pub finished_at: Option<DateTime>,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
