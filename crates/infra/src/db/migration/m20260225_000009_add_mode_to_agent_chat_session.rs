use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const TABLE_NAME: &str = "agent_chat_session";
const LEGACY_CONTEXT_INDEX: &str = "idx-agent_chat_session-context";
const MODE_COLUMN: &str = "mode";
const MODE_CONTEXT_INDEX: &str = "idx-agent_chat_session-context-mode";

// Fresh databases get `mode` from migration 007, but older databases may have
// already applied the original 007 before `mode` and the replacement index were
// introduced.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column(TABLE_NAME, MODE_COLUMN).await? {
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
        }

        if manager.has_index(TABLE_NAME, LEGACY_CONTEXT_INDEX).await? {
            manager
                .drop_index(
                    Index::drop()
                        .name(LEGACY_CONTEXT_INDEX)
                        .table(AgentChatSession::Table)
                        .to_owned(),
                )
                .await?;
        }

        if !manager.has_index(TABLE_NAME, MODE_CONTEXT_INDEX).await? {
            manager
                .create_index(
                    Index::create()
                        .name(MODE_CONTEXT_INDEX)
                        .table(AgentChatSession::Table)
                        .col(AgentChatSession::ContextType)
                        .col(AgentChatSession::ContextGuid)
                        .col(AgentChatSession::Mode)
                        .col(AgentChatSession::UpdatedAt)
                        .if_not_exists()
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let _ = manager;
        // Migration 007 now owns both the `mode` column and the replacement
        // context index. After 009 runs, the schema matches a fresh 007
        // database, so trying to reconstruct the legacy shape on rollback
        // corrupts fresh installs.
        Ok(())
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
