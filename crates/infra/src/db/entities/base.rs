use chrono::{NaiveDateTime, Utc};
use uuid::Uuid;

pub trait BaseEntity {
    fn guid(&self) -> &str;
    fn created_at(&self) -> NaiveDateTime;
    fn updated_at(&self) -> NaiveDateTime;
    fn is_deleted(&self) -> bool;
}

#[derive(Clone, Debug, Default)]
pub struct BaseFields {
    pub guid: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub is_deleted: bool,
}

impl BaseFields {
    pub fn new() -> Self {
        let now = Utc::now().naive_utc();
        Self {
            guid: Uuid::new_v4().to_string(),
            created_at: now,
            updated_at: now,
            is_deleted: false,
        }
    }

    pub fn set_create_defaults(&mut self) {
        let now = Utc::now().naive_utc();
        self.guid = Uuid::new_v4().to_string();
        self.created_at = now;
        self.updated_at = now;
        self.is_deleted = false;
    }

    pub fn set_update_defaults(&mut self) {
        self.updated_at = Utc::now().naive_utc();
    }
}

#[macro_export]
macro_rules! base_entity_fields {
    () => {
        #[sea_orm(primary_key, auto_increment = false)]
        pub guid: String,
        pub created_at: DateTime,
        pub updated_at: DateTime,
        pub is_deleted: bool,
    };
}

#[macro_export]
macro_rules! impl_base_entity {
    ($model:ty) => {
        impl $crate::db::entities::base::BaseEntity for $model {
            fn guid(&self) -> &str {
                &self.guid
            }

            fn created_at(&self) -> chrono::NaiveDateTime {
                self.created_at
            }

            fn updated_at(&self) -> chrono::NaiveDateTime {
                self.updated_at
            }

            fn is_deleted(&self) -> bool {
                self.is_deleted
            }
        }
    };
}
