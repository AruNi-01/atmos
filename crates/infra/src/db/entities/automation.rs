use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "automation")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub display_name: String,
    pub agent_id: String,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub schedule_enabled: bool,
    pub schedule_paused: bool,
    pub schedule_kind: Option<String>,
    pub schedule_expr: Option<String>,
    pub schedule_timezone: String,
    pub next_run_at: Option<DateTime>,
    pub instructions_path: String,
    pub artifact_root: String,
    pub last_run_guid: Option<String>,
    pub last_status: Option<String>,
    pub run_count: i32,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::automation_run::Entity")]
    AutomationRun,
}

impl Related<super::automation_run::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AutomationRun.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
