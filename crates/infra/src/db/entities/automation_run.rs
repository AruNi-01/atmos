use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "automation_run")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub automation_guid: String,
    pub trigger_kind: String,
    pub status: String,
    pub failure_kind: Option<String>,
    pub error_message: Option<String>,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub created_workspace_guid: Option<String>,
    pub cwd: String,
    pub run_dir: String,
    pub prompt_path: String,
    pub output_path: String,
    pub result_path: String,
    pub run_json_path: String,
    pub terminal_display_name: String,
    pub tmux_session_name: Option<String>,
    pub tmux_window_name: Option<String>,
    pub tmux_window_index: Option<i32>,
    pub started_at: DateTime,
    pub completed_at: Option<DateTime>,
    pub exit_code: Option<i32>,
    pub cancellation_requested: bool,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::automation::Entity",
        from = "Column::AutomationGuid",
        to = "super::automation::Column::Guid",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Automation,
}

impl Related<super::automation::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Automation.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
