use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column(AUTOMATION_RUN_TABLE, "agent_id").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(ColumnDef::new(AutomationRun::AgentId).string().null())
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "agent_label")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(ColumnDef::new(AutomationRun::AgentLabel).string().null())
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column(AUTOMATION_RUN_TABLE, "agent_label")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .drop_column(AutomationRun::AgentLabel)
                        .to_owned(),
                )
                .await?;
        }

        if manager.has_column(AUTOMATION_RUN_TABLE, "agent_id").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .drop_column(AutomationRun::AgentId)
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }
}

const AUTOMATION_RUN_TABLE: &str = "automation_run";

#[derive(DeriveIden)]
enum AutomationRun {
    AgentId,
    AgentLabel,
}
