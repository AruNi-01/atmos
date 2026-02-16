use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(AgentChatSession::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(AgentChatSession::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(AgentChatSession::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AgentChatSession::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AgentChatSession::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(AgentChatSession::ContextType).string().not_null())
                    .col(ColumnDef::new(AgentChatSession::ContextGuid).string().null())
                    .col(ColumnDef::new(AgentChatSession::RegistryId).string().not_null())
                    .col(ColumnDef::new(AgentChatSession::Cwd).string().not_null())
                    .col(
                        ColumnDef::new(AgentChatSession::AllowFileAccess)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(AgentChatSession::Status).string().not_null())
                    .col(ColumnDef::new(AgentChatSession::Title).string().null())
                    .col(ColumnDef::new(AgentChatSession::TitleSource).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-agent_chat_session-context")
                    .table(AgentChatSession::Table)
                    .col(AgentChatSession::ContextType)
                    .col(AgentChatSession::ContextGuid)
                    .col(AgentChatSession::UpdatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(AgentChatSession::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum AgentChatSession {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    ContextType,
    ContextGuid,
    RegistryId,
    Cwd,
    AllowFileAccess,
    Status,
    Title,
    TitleSource,
}
