use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::impl_base_entity;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "agent_chat_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub is_deleted: bool,
    /// workspace | project | temp | unknown
    pub context_type: String,
    pub context_guid: Option<String>,
    pub registry_id: String,
    pub acp_session_id: Option<String>,
    pub cwd: String,
    pub allow_file_access: bool,
    /// active | closed
    pub status: String,
    pub title: Option<String>,
    /// auto | user
    pub title_source: Option<String>,
    /// default | wiki_ask
    pub mode: String,
}

impl_base_entity!(Model);

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
