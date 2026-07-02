use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "terminal_side_chat")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    pub workspace_guid: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub side_chat_id: String,
    pub source_pane_id: String,
    pub source_tmux_window_name: String,
    pub source_surface_kind: String,
    pub source_surface_ref_json: Option<String>,
    pub side_tmux_window_name: String,
    pub agent_ref_json: Option<String>,
    pub color_hex: String,
    pub status: String,
    pub closed_at: Option<DateTime>,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
