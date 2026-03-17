use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add terminal_layout column to project table
        manager
            .alter_table(
                Table::alter()
                    .table(Project::Table)
                    .add_column(ColumnDef::new(Project::TerminalLayout).text().null())
                    .to_owned(),
            )
            .await?;

        // Add maximized_terminal_id column to project table
        manager
            .alter_table(
                Table::alter()
                    .table(Project::Table)
                    .add_column(ColumnDef::new(Project::MaximizedTerminalId).text().null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Remove columns if rollback is needed
        manager
            .alter_table(
                Table::alter()
                    .table(Project::Table)
                    .drop_column(Project::TerminalLayout)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Project::Table)
                    .drop_column(Project::MaximizedTerminalId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Project {
    Table,
    TerminalLayout,
    MaximizedTerminalId,
}
