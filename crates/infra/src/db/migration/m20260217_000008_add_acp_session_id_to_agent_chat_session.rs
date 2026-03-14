use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const TABLE_NAME: &str = "agent_chat_session";
const ACP_SESSION_ID_COLUMN: &str = "acp_session_id";

// Fresh databases get `acp_session_id` from migration 007, but older databases
// may have already applied the original 007 before it was expanded.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column(TABLE_NAME, ACP_SESSION_ID_COLUMN)
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(AgentChatSession::Table)
                        .add_column(
                            ColumnDef::new(AgentChatSession::AcpSessionId)
                                .string()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let _ = manager;
        // Migration 007 now owns this baseline column for fresh schemas. After
        // 008 runs, the resulting schema is indistinguishable from a fresh 007
        // database, so dropping the column on rollback would be destructive.
        Ok(())
    }
}

#[derive(DeriveIden)]
enum AgentChatSession {
    Table,
    AcpSessionId,
}
