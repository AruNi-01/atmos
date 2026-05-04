pub use sea_orm_migration::prelude::*;

use std::collections::HashSet;

use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use tracing::{info, warn};

mod m20260117_000001_create_test_message_table;
mod m20260118_000002_create_project_tables;
mod m20260120_000003_add_workspace_pin_archive;
mod m20260121_000004_add_project_target_branch;
mod m20260126_000005_add_workspace_terminal_layout;
mod m20260129_000006_add_maximized_terminal_id;
mod m20260215_000007_create_agent_chat_tables;
mod m20260217_000008_add_acp_session_id_to_agent_chat_session;
mod m20260225_000009_add_mode_to_agent_chat_session;
mod m20260315_000010_add_workspace_github_issue;
mod m20260315_000011_add_workspace_display_name;
mod m20260315_000012_add_workspace_auto_extract_todos;
mod m20260315_000013_add_workspace_base_branch;
mod m20260317_000001_add_project_terminal_layout;
mod m20260410_000014_add_workspace_visit_and_workflow_status;
mod m20260411_000015_add_workspace_priority_labels;
mod m20260411_000016_backfill_workspace_label_guids;
mod m20260412_000017_add_workspace_pin_order;
mod m20260422_000019_create_review_tables;
mod m20260427_000018_add_workspace_github_pr;
mod m20260428_000020_add_workspace_create_source;

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
            Box::new(m20260215_000007_create_agent_chat_tables::Migration),
            Box::new(m20260217_000008_add_acp_session_id_to_agent_chat_session::Migration),
            Box::new(m20260225_000009_add_mode_to_agent_chat_session::Migration),
            Box::new(m20260315_000010_add_workspace_github_issue::Migration),
            Box::new(m20260315_000011_add_workspace_display_name::Migration),
            Box::new(m20260315_000012_add_workspace_auto_extract_todos::Migration),
            Box::new(m20260315_000013_add_workspace_base_branch::Migration),
            Box::new(m20260317_000001_add_project_terminal_layout::Migration),
            Box::new(m20260410_000014_add_workspace_visit_and_workflow_status::Migration),
            Box::new(m20260411_000015_add_workspace_priority_labels::Migration),
            Box::new(m20260411_000016_backfill_workspace_label_guids::Migration),
            Box::new(m20260412_000017_add_workspace_pin_order::Migration),
            Box::new(m20260427_000018_add_workspace_github_pr::Migration),
            Box::new(m20260422_000019_create_review_tables::Migration),
            Box::new(m20260428_000020_add_workspace_create_source::Migration),
        ]
    }
}

impl Migrator {
    /// Remove migration records from `seaql_migrations` that no longer exist
    /// in the current binary. This prevents SeaORM from erroring out when a
    /// user downgrades (or switches between release channels) and the new
    /// binary ships fewer migrations than the old one had applied.
    pub async fn clean_stale_migrations(db: &DatabaseConnection) -> Result<(), sea_orm::DbErr> {
        // Collect the canonical set of migration names known to this binary.
        let known: HashSet<String> = <Self as MigratorTrait>::migrations()
            .iter()
            .map(|m| m.name().to_string())
            .collect();

        // Query all applied versions from the tracking table.
        // The table may not exist yet (fresh install) – that is fine, just skip.
        let rows = match db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT version FROM seaql_migrations".to_owned(),
            ))
            .await
        {
            Ok(rows) => rows,
            Err(_) => return Ok(()), // table doesn't exist yet
        };

        let mut removed = 0u32;
        for row in &rows {
            let version: String = row.try_get("", "version")?;
            if !known.contains(&version) {
                warn!("Removing stale migration record: {version}");
                db.execute(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("DELETE FROM seaql_migrations WHERE version = '{version}'"),
                ))
                .await?;
                removed += 1;
            }
        }

        if removed > 0 {
            info!("Cleaned {removed} stale migration record(s)");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, DbErr, Statement};

    use super::*;

    const TABLE_NAME: &str = "agent_chat_session";
    const LEGACY_CONTEXT_INDEX: &str = "idx-agent_chat_session-context";
    const MODE_CONTEXT_INDEX: &str = "idx-agent_chat_session-context-mode";

    #[tokio::test]
    async fn legacy_agent_chat_session_upgrade_backfills_missing_columns() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;

        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            r#"
            CREATE TABLE "agent_chat_session" (
                "guid" TEXT NOT NULL PRIMARY KEY,
                "created_at" TEXT NOT NULL,
                "updated_at" TEXT NOT NULL,
                "is_deleted" BOOLEAN NOT NULL DEFAULT 0,
                "context_type" TEXT NOT NULL,
                "context_guid" TEXT NULL,
                "registry_id" TEXT NOT NULL,
                "cwd" TEXT NOT NULL,
                "allow_file_access" BOOLEAN NOT NULL DEFAULT 0,
                "status" TEXT NOT NULL,
                "title" TEXT NULL,
                "title_source" TEXT NULL
            )
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            r#"
            CREATE INDEX "idx-agent_chat_session-context"
            ON "agent_chat_session" ("context_type", "context_guid", "updated_at")
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            r#"
            INSERT INTO "agent_chat_session" (
                "guid",
                "created_at",
                "updated_at",
                "is_deleted",
                "context_type",
                "context_guid",
                "registry_id",
                "cwd",
                "allow_file_access",
                "status"
            ) VALUES (
                'session-1',
                '2026-03-13 00:00:00',
                '2026-03-13 00:00:00',
                0,
                'workspace',
                'workspace-1',
                'registry-1',
                '/tmp',
                0,
                'active'
            )
            "#
            .to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);

        assert!(!manager.has_column(TABLE_NAME, "acp_session_id").await?);
        assert!(!manager.has_column(TABLE_NAME, "mode").await?);
        assert!(manager.has_index(TABLE_NAME, LEGACY_CONTEXT_INDEX).await?);
        assert!(!manager.has_index(TABLE_NAME, MODE_CONTEXT_INDEX).await?);

        m20260217_000008_add_acp_session_id_to_agent_chat_session::Migration
            .up(&manager)
            .await?;
        m20260225_000009_add_mode_to_agent_chat_session::Migration
            .up(&manager)
            .await?;

        assert!(manager.has_column(TABLE_NAME, "acp_session_id").await?);
        assert!(manager.has_column(TABLE_NAME, "mode").await?);
        assert!(!manager.has_index(TABLE_NAME, LEGACY_CONTEXT_INDEX).await?);
        assert!(manager.has_index(TABLE_NAME, MODE_CONTEXT_INDEX).await?);

        let row = db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                r#"
                SELECT "acp_session_id", "mode"
                FROM "agent_chat_session"
                WHERE "guid" = 'session-1'
                "#
                .to_owned(),
            ))
            .await?
            .expect("legacy row should exist");

        let acp_session_id: Option<String> = row.try_get("", "acp_session_id")?;
        let mode: String = row.try_get("", "mode")?;

        assert_eq!(acp_session_id, None);
        assert_eq!(mode, "default");

        Ok(())
    }

    #[tokio::test]
    async fn rollback_of_008_preserves_fresh_007_acp_session_id() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        let manager = SchemaManager::new(&db);

        m20260215_000007_create_agent_chat_tables::Migration
            .up(&manager)
            .await?;

        assert!(manager.has_column(TABLE_NAME, "acp_session_id").await?);

        m20260217_000008_add_acp_session_id_to_agent_chat_session::Migration
            .up(&manager)
            .await?;
        m20260217_000008_add_acp_session_id_to_agent_chat_session::Migration
            .down(&manager)
            .await?;

        assert!(manager.has_column(TABLE_NAME, "acp_session_id").await?);

        Ok(())
    }

    #[tokio::test]
    async fn rollback_of_009_preserves_fresh_007_mode_schema() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        let manager = SchemaManager::new(&db);

        m20260215_000007_create_agent_chat_tables::Migration
            .up(&manager)
            .await?;

        assert!(manager.has_column(TABLE_NAME, "mode").await?);
        assert!(manager.has_index(TABLE_NAME, MODE_CONTEXT_INDEX).await?);
        assert!(!manager.has_index(TABLE_NAME, LEGACY_CONTEXT_INDEX).await?);

        m20260225_000009_add_mode_to_agent_chat_session::Migration
            .up(&manager)
            .await?;
        m20260225_000009_add_mode_to_agent_chat_session::Migration
            .down(&manager)
            .await?;

        assert!(manager.has_column(TABLE_NAME, "mode").await?);
        assert!(manager.has_index(TABLE_NAME, MODE_CONTEXT_INDEX).await?);
        assert!(!manager.has_index(TABLE_NAME, LEGACY_CONTEXT_INDEX).await?);

        Ok(())
    }
}
