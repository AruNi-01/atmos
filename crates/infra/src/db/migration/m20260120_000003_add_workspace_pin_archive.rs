use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite requires separate ALTER TABLE statements for each column
        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(
                        ColumnDef::new(Workspace::IsPinned)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(ColumnDef::new(Workspace::PinnedAt).date_time().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(
                        ColumnDef::new(Workspace::IsArchived)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .add_column(ColumnDef::new(Workspace::ArchivedAt).date_time().null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite requires separate ALTER TABLE statements for each column
        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::ArchivedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::IsArchived)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::PinnedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Workspace::Table)
                    .drop_column(Workspace::IsPinned)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Workspace {
    Table,
    IsPinned,
    PinnedAt,
    IsArchived,
    ArchivedAt,
}
