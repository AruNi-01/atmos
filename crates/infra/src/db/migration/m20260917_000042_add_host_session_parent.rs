use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("host_session", "parent_native_id")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .add_column(ColumnDef::new(HostSession::ParentNativeId).string().null())
                        .to_owned(),
                )
                .await?;
        }

        manager
            .create_index(
                Index::create()
                    .name("idx-host_session-parent")
                    .table(HostSession::Table)
                    .col(HostSession::ParentNativeId)
                    .col(HostSession::IsDeleted)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx-host_session-parent")
                    .table(HostSession::Table)
                    .to_owned(),
            )
            .await
            .ok();
        if manager
            .has_column("host_session", "parent_native_id")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .drop_column(HostSession::ParentNativeId)
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}

#[derive(Iden)]
enum HostSession {
    Table,
    ParentNativeId,
    IsDeleted,
}
