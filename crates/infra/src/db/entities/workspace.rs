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
    pub branch: String,
    pub sidebar_order: i32,
    pub is_pinned: bool,
    pub pinned_at: Option<DateTime>,
    pub is_archived: bool,
    pub archived_at: Option<DateTime>,
    /// JSON-encoded terminal layout configuration
    pub terminal_layout: Option<String>,
    /// The ID of the currently maximized terminal pane, if any
    pub maximized_terminal_id: Option<String>,
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
