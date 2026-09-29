//! One inbox row per pane or chat. Not a copy of the live occupancy map.

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "agent_session_catalog")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub session_id: String,
    pub context_id: Option<String>,
    pub surface: String,
    pub tool: Option<String>,
    pub project_path: Option<String>,
    /// RFC3339 of the last inbox-bucket change.
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
