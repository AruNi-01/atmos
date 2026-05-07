use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite does not support ALTER COLUMN directly.
        // We rebuild the table to make workspace_guid nullable.
        let db = manager.get_connection();
        let backend = manager.get_database_backend();

        if backend == sea_orm::DatabaseBackend::Sqlite {
            // Disable foreign keys to prevent cascade deletion of dependent records
            db.execute_unprepared(r#"PRAGMA foreign_keys = OFF"#).await?;

            db.execute_unprepared(
                r#"
                CREATE TABLE "review_session_new" (
                    "guid" TEXT NOT NULL PRIMARY KEY,
                    "created_at" TEXT NOT NULL,
                    "updated_at" TEXT NOT NULL,
                    "is_deleted" BOOLEAN NOT NULL DEFAULT 0,
                    "workspace_guid" TEXT NULL,
                    "project_guid" TEXT NOT NULL,
                    "repo_path" TEXT NOT NULL,
                    "storage_root_rel_path" TEXT NOT NULL,
                    "base_ref" TEXT NULL,
                    "base_commit" TEXT NULL,
                    "head_commit" TEXT NOT NULL,
                    "current_revision_guid" TEXT NOT NULL,
                    "status" TEXT NOT NULL,
                    "title" TEXT NULL,
                    "created_by" TEXT NULL,
                    "closed_at" TEXT NULL,
                    "archived_at" TEXT NULL
                )
                "#,
            )
            .await?;

            db.execute_unprepared(
                r#"
                INSERT INTO "review_session_new"
                SELECT "guid","created_at","updated_at","is_deleted","workspace_guid",
                       "project_guid","repo_path","storage_root_rel_path","base_ref",
                       "base_commit","head_commit","current_revision_guid","status",
                       "title","created_by","closed_at","archived_at"
                FROM "review_session"
                "#,
            )
            .await?;

            db.execute_unprepared(r#"DROP TABLE "review_session""#).await?;
            db.execute_unprepared(r#"ALTER TABLE "review_session_new" RENAME TO "review_session""#)
                .await?;

            // Re-enable foreign keys
            db.execute_unprepared(r#"PRAGMA foreign_keys = ON"#).await?;
        } else {
            // Postgres
            db.execute_unprepared(
                r#"ALTER TABLE "review_session" ALTER COLUMN "workspace_guid" DROP NOT NULL"#,
            )
            .await?;
        }

        // Drop old index
        manager
            .drop_index(
                Index::drop()
                    .name("idx-review_session-workspace-updated")
                    .table(ReviewSession::Table)
                    .to_owned(),
            )
            .await
            .ok(); // ignore if it doesn't exist

        // Create replacement indexes
        manager
            .create_index(
                Index::create()
                    .name("idx-review_session-workspace-status-updated")
                    .table(ReviewSession::Table)
                    .col(ReviewSession::WorkspaceGuid)
                    .col(ReviewSession::Status)
                    .col(ReviewSession::UpdatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-review_session-project-status-updated")
                    .table(ReviewSession::Table)
                    .col(ReviewSession::ProjectGuid)
                    .col(ReviewSession::Status)
                    .col(ReviewSession::UpdatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = manager.get_database_backend();

        // Drop new indexes
        manager
            .drop_index(
                Index::drop()
                    .name("idx-review_session-workspace-status-updated")
                    .table(ReviewSession::Table)
                    .to_owned(),
            )
            .await
            .ok();
        manager
            .drop_index(
                Index::drop()
                    .name("idx-review_session-project-status-updated")
                    .table(ReviewSession::Table)
                    .to_owned(),
            )
            .await
            .ok();

        if backend == sea_orm::DatabaseBackend::Sqlite {
            // Disable foreign keys to prevent cascade deletion of dependent records
            db.execute_unprepared(r#"PRAGMA foreign_keys = OFF"#).await?;

            db.execute_unprepared(
                r#"
                CREATE TABLE "review_session_old" (
                    "guid" TEXT NOT NULL PRIMARY KEY,
                    "created_at" TEXT NOT NULL,
                    "updated_at" TEXT NOT NULL,
                    "is_deleted" BOOLEAN NOT NULL DEFAULT 0,
                    "workspace_guid" TEXT NOT NULL,
                    "project_guid" TEXT NOT NULL,
                    "repo_path" TEXT NOT NULL,
                    "storage_root_rel_path" TEXT NOT NULL,
                    "base_ref" TEXT NULL,
                    "base_commit" TEXT NULL,
                    "head_commit" TEXT NOT NULL,
                    "current_revision_guid" TEXT NOT NULL,
                    "status" TEXT NOT NULL,
                    "title" TEXT NULL,
                    "created_by" TEXT NULL,
                    "closed_at" TEXT NULL,
                    "archived_at" TEXT NULL
                )
                "#,
            )
            .await?;

            db.execute_unprepared(
                r#"
                INSERT INTO "review_session_old"
                SELECT "guid","created_at","updated_at","is_deleted","workspace_guid",
                       "project_guid","repo_path","storage_root_rel_path","base_ref",
                       "base_commit","head_commit","current_revision_guid","status",
                       "title","created_by","closed_at","archived_at"
                FROM "review_session"
                WHERE "workspace_guid" IS NOT NULL
                "#,
            )
            .await?;

            db.execute_unprepared(r#"DROP TABLE "review_session""#).await?;
            db.execute_unprepared(r#"ALTER TABLE "review_session_old" RENAME TO "review_session""#)
                .await?;

            // Re-enable foreign keys
            db.execute_unprepared(r#"PRAGMA foreign_keys = ON"#).await?;
        } else {
            // Prune NULL rows before making the column NOT NULL
            db.execute_unprepared(
                r#"DELETE FROM "review_session" WHERE "workspace_guid" IS NULL"#,
            )
            .await?;
            db.execute_unprepared(
                r#"ALTER TABLE "review_session" ALTER COLUMN "workspace_guid" SET NOT NULL"#,
            )
            .await?;
        }

        // Restore original index
        manager
            .create_index(
                Index::create()
                    .name("idx-review_session-workspace-updated")
                    .table(ReviewSession::Table)
                    .col(ReviewSession::WorkspaceGuid)
                    .col(ReviewSession::UpdatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum ReviewSession {
    Table,
    WorkspaceGuid,
    ProjectGuid,
    Status,
    UpdatedAt,
}
