use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add agent_run_guid column to review_revision table if it doesn't exist
        if !manager.has_column("review_revision", "agent_run_guid").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(ReviewRevision::Table)
                        .add_column(ColumnDef::new(ReviewRevision::AgentRunGuid).string().null())
                        .to_owned(),
                )
                .await?;
        }

        // Add agent_run_guid column to review_message table if it doesn't exist
        if !manager.has_column("review_message", "agent_run_guid").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(ReviewMessage::Table)
                        .add_column(ColumnDef::new(ReviewMessage::AgentRunGuid).string().null())
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ReviewRevision::Table)
                    .drop_column(ReviewRevision::AgentRunGuid)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(ReviewMessage::Table)
                    .drop_column(ReviewMessage::AgentRunGuid)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum ReviewRevision {
    Table,
    AgentRunGuid,
}

#[derive(DeriveIden)]
enum ReviewMessage {
    Table,
    AgentRunGuid,
}
