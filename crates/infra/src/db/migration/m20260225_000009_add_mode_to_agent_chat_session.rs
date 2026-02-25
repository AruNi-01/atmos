use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(AgentChatSession::Table)
                    .add_column(
                        ColumnDef::new(AgentChatSession::Mode)
                            .string()
                            .not_null()
                            .default("default"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-agent_chat_session-context-mode")
                    .table(AgentChatSession::Table)
                    .col(AgentChatSession::ContextType)
                    .col(AgentChatSession::ContextGuid)
                    .col(AgentChatSession::Mode)
                    .col(AgentChatSession::UpdatedAt)
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
                    .name("idx-agent_chat_session-context-mode")
                    .table(AgentChatSession::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(AgentChatSession::Table)
                    .drop_column(AgentChatSession::Mode)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum AgentChatSession {
    Table,
    ContextType,
    ContextGuid,
    UpdatedAt,
    Mode,
}
