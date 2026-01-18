pub use sea_orm_migration::prelude::*;

mod m20260117_000001_create_test_message_table;
mod m20260118_000002_create_project_tables;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260117_000001_create_test_message_table::Migration),
            Box::new(m20260118_000002_create_project_tables::Migration),
        ]
    }
}
