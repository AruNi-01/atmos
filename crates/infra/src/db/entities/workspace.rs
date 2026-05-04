use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "workspace")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub project_guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub name: String,
    pub display_name: Option<String>,
    pub branch: String,
    pub base_branch: String,
    pub sidebar_order: i32,
    pub is_pinned: bool,
    pub pinned_at: Option<DateTime>,
    pub pin_order: Option<i32>,
    pub is_archived: bool,
    pub archived_at: Option<DateTime>,
    pub last_visited_at: Option<DateTime>,
    pub workflow_status: String,
    pub priority: String,
    /// JSON-encoded array of workspace label GUIDs
    pub label_guids: Option<String>,
    /// JSON-encoded terminal layout configuration
    pub terminal_layout: Option<String>,
    /// The ID of the currently maximized terminal pane, if any
    pub maximized_terminal_id: Option<String>,
    /// Linked GitHub issue URL
    pub github_issue_url: Option<String>,
    /// Serialized GitHub issue metadata for workspace overview/import
    pub github_issue_data: Option<String>,
    /// Whether the user opted into LLM-based TODO extraction from the linked issue
    pub auto_extract_todos: bool,
    /// Linked GitHub PR URL
    pub github_pr_url: Option<String>,
    /// Serialized GitHub PR metadata for workspace overview/import
    pub github_pr_data: Option<String>,
    /// Workspace creation source: manual | issue_only
    pub create_source: String,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::project::Entity",
        from = "Column::ProjectGuid",
        to = "super::project::Column::Guid",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Project,
}

impl Related<super::project::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Project.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
