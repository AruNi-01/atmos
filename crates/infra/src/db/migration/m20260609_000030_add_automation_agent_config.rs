use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column(AUTOMATION_TABLE, "agent_config_json").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_TABLE))
                        .add_column(ColumnDef::new(Automation::AgentConfigJson).string().null())
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "agent_config_json")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::AgentConfigJson)
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
        if manager
            .has_column(AUTOMATION_RUN_TABLE, "agent_config_json")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .drop_column(AutomationRun::AgentConfigJson)
                        .to_owned(),
                )
                .await?;
        }

        if manager
            .has_column(AUTOMATION_TABLE, "agent_config_json")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_TABLE))
                        .drop_column(Automation::AgentConfigJson)
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }
}

const AUTOMATION_TABLE: &str = "automation";
const AUTOMATION_RUN_TABLE: &str = "automation_run";

#[derive(DeriveIden)]
enum Automation {
    AgentConfigJson,
}

#[derive(DeriveIden)]
enum AutomationRun {
    AgentConfigJson,
}
