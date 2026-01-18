use sea_orm::{ActiveModelTrait, DatabaseConnection, Set};

use crate::db::entities::base::BaseFields;
use crate::db::entities::test_message;
use crate::error::Result;

pub struct TestMessageRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> TestMessageRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn save_message(&self, content: &str) -> Result<test_message::Model> {
        let base = BaseFields::new();

        let model = test_message::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            content: Set(content.to_string()),
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }
}
