use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("host_session", "archived").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .add_column(
                            ColumnDef::new(HostSession::Archived)
                                .boolean()
                                .not_null()
                                .default(false),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_column("host_session", "archived").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(HostSession::Table)
                        .drop_column(HostSession::Archived)
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
    Archived,
}
