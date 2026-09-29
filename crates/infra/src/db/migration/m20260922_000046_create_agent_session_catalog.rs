use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(AgentSessionCatalog::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(AgentSessionCatalog::SessionId)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(AgentSessionCatalog::ContextId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(AgentSessionCatalog::Surface)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(AgentSessionCatalog::Tool).string().null())
                    .col(
                        ColumnDef::new(AgentSessionCatalog::ProjectPath)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(AgentSessionCatalog::UpdatedAt)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AgentSessionCatalog::ArchivedAt)
                            .string()
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(AgentSessionCatalog::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum AgentSessionCatalog {
    Table,
    SessionId,
    ContextId,
    Surface,
    Tool,
    ProjectPath,
    UpdatedAt,
    ArchivedAt,
}
