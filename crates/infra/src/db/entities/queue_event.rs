//! Durable queue row for third-party trigger events (APP-051).
//!
//! Intentionally **not** a soft-delete `BaseEntity`: this is an operational log
//! (like `automation_github_delivery_claim`). Terminal rows are hard-deleted by
//! retention cleanup; soft-delete would fight that lifecycle.

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "queue_event")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub guid: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub topic: String,
    pub payload: Vec<u8>,
    /// pending | processing | succeeded | failed
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub last_error: Option<String>,
    pub available_at: DateTime,
    pub processed_at: Option<DateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

pub mod status {
    pub const PENDING: &str = "pending";
    pub const PROCESSING: &str = "processing";
    pub const SUCCEEDED: &str = "succeeded";
    pub const FAILED: &str = "failed";
}
