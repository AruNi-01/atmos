use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "output_path")
            .await?
        {
            return Ok(());
        }

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new(AUTOMATION_RUN_TABLE))
                    .drop_column(AutomationRun::OutputPath)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column(AUTOMATION_RUN_TABLE, "output_path")
            .await?
        {
            return Ok(());
        }

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new(AUTOMATION_RUN_TABLE))
                    .add_column(ColumnDef::new(AutomationRun::OutputPath).string().null())
                    .to_owned(),
            )
            .await
    }
}

const AUTOMATION_RUN_TABLE: &str = "automation_run";

#[derive(DeriveIden)]
enum AutomationRun {
    OutputPath,
}
