use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(ColumnDef::new(Workspace::LastVisitedAt).date_time().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(
                        ColumnDef::new(Workspace::WorkflowStatus)
                            .string()
                            .not_null()
                            .default("in_progress"),
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
                    .drop_column(Workspace::LastVisitedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::WorkflowStatus)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Workspace {
    Table,
    LastVisitedAt,
    WorkflowStatus,
}
