use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add terminal_layout column to store JSON layout data
        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(
                        ColumnDef::new(Workspace::TerminalLayout)
                            .text()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::TerminalLayout)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Workspace {
    Table,
    TerminalLayout,
}
