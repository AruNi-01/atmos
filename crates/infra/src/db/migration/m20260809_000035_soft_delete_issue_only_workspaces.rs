use sea_orm_migration::prelude::*;

/// Soft-delete legacy import-as-issue_only workspaces.
/// The issue_only create path was removed; remaining rows are not real workspaces.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            UPDATE workspace
            SET is_deleted = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE create_source = 'issue_only'
              AND is_deleted = 0
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // Intentionally irreversible: issue_only workspaces are no longer a product surface.
        Ok(())
    }
}
