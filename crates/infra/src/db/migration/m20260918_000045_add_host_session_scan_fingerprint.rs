use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("host_session", "source_mtime_ms")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .add_column(
                            ColumnDef::new(HostSession::SourceMtimeMs)
                                .big_integer()
                                .not_null()
                                .default(0),
                        )
                        .to_owned(),
                )
                .await?;
        }
        if !manager.has_column("host_session", "source_size").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .add_column(
                            ColumnDef::new(HostSession::SourceSize)
                                .big_integer()
                                .not_null()
                                .default(0),
                        )
                        .to_owned(),
                )
                .await?;
        }
        if !manager
            .has_column("host_session_sync", "index_revision")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSessionSync::Table)
                        .add_column(
                            ColumnDef::new(HostSessionSync::IndexRevision)
                                .integer()
                                .not_null()
                                .default(0),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column("host_session", "source_mtime_ms")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .drop_column(HostSession::SourceMtimeMs)
                        .to_owned(),
                )
                .await?;
        }
        if manager.has_column("host_session", "source_size").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .drop_column(HostSession::SourceSize)
                        .to_owned(),
                )
                .await?;
        }
        if manager
            .has_column("host_session_sync", "index_revision")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSessionSync::Table)
                        .drop_column(HostSessionSync::IndexRevision)
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
    SourceMtimeMs,
    SourceSize,
}

#[derive(Iden)]
enum HostSessionSync {
    Table,
    IndexRevision,
}
