pub use sea_orm_migration::prelude::*;

mod m20260117_000001_create_test_message_table;
mod m20260118_000002_create_project_tables;
mod m20260120_000003_add_workspace_pin_archive;
mod m20260121_000004_add_project_target_branch;
mod m20260126_000005_add_workspace_terminal_layout;
mod m20260129_000006_add_maximized_terminal_id;
mod m20260216_000008_create_agent_chat_session_table;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260117_000001_create_test_message_table::Migration),
            Box::new(m20260118_000002_create_project_tables::Migration),
            Box::new(m20260120_000003_add_workspace_pin_archive::Migration),
            Box::new(m20260121_000004_add_project_target_branch::Migration),
            Box::new(m20260126_000005_add_workspace_terminal_layout::Migration),
            Box::new(m20260129_000006_add_maximized_terminal_id::Migration),
            Box::new(m20260216_000008_create_agent_chat_session_table::Migration),
        ]
    }
}
