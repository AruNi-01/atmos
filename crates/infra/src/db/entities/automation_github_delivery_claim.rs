use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "automation_github_delivery_claim")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub delivery_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub route_id: String,
    pub automation_guid: String,
    pub run_guid: Option<String>,
    pub status: String,
    pub error_code: Option<String>,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
