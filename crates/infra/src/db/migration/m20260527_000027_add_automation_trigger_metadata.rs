use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        add_column_if_missing(
            manager,
            AUTOMATION_TABLE,
            "trigger_kind",
            ColumnDef::new(Automation::TriggerKind)
                .string()
                .not_null()
                .default("manual"),
        )
        .await?;
        add_column_if_missing(
            manager,
            AUTOMATION_TABLE,
            "trigger_enabled",
            ColumnDef::new(Automation::TriggerEnabled)
                .boolean()
                .not_null()
                .default(true),
        )
        .await?;
        add_column_if_missing(
            manager,
            AUTOMATION_TABLE,
            "trigger_status",
            ColumnDef::new(Automation::TriggerStatus)
                .string()
                .not_null()
                .default("active"),
        )
        .await?;
        add_column_if_missing(
            manager,
            AUTOMATION_TABLE,
            "trigger_config_json",
            ColumnDef::new(Automation::TriggerConfigJson).text().null(),
        )
        .await?;
        add_column_if_missing(
            manager,
            AUTOMATION_RUN_TABLE,
            "trigger_source_json",
            ColumnDef::new(AutomationRun::TriggerSourceJson)
                .text()
                .null(),
        )
        .await?;

        manager
            .get_connection()
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                r#"
                UPDATE automation
                SET trigger_kind = CASE
                    WHEN schedule_enabled = 1 THEN 'scheduled'
                    ELSE 'manual'
                END,
                trigger_enabled = 1,
                trigger_status = 'active'
                WHERE trigger_kind = 'manual'
                  AND trigger_config_json IS NULL
                "#
                .to_owned(),
            ))
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_automation_trigger")
                    .table(Automation::Table)
                    .col(Automation::TriggerKind)
                    .col(Automation::TriggerEnabled)
                    .col(Automation::TriggerStatus)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(AutomationGithubDeliveryClaim::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::DeliveryId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::RouteId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::AutomationGuid)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::RunGuid)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::Status)
                            .string()
                            .not_null()
                            .default("claimed"),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::ErrorCode)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AutomationGithubDeliveryClaim::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(AutomationGithubDeliveryClaim::DeliveryId)
                            .col(AutomationGithubDeliveryClaim::RouteId),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_automation_github_delivery_claim_automation")
                    .table(AutomationGithubDeliveryClaim::Table)
                    .col(AutomationGithubDeliveryClaim::AutomationGuid)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_automation_github_delivery_claim_run")
                    .table(AutomationGithubDeliveryClaim::Table)
                    .col(AutomationGithubDeliveryClaim::RunGuid)
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
                    .name("idx_automation_github_delivery_claim_run")
                    .table(AutomationGithubDeliveryClaim::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_index(
                Index::drop()
                    .name("idx_automation_github_delivery_claim_automation")
                    .table(AutomationGithubDeliveryClaim::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(AutomationGithubDeliveryClaim::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_automation_trigger")
                    .table(Automation::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        drop_column_if_exists(
            manager,
            AUTOMATION_RUN_TABLE,
            AutomationRun::TriggerSourceJson,
        )
        .await?;
        drop_column_if_exists(manager, AUTOMATION_TABLE, Automation::TriggerConfigJson).await?;
        drop_column_if_exists(manager, AUTOMATION_TABLE, Automation::TriggerStatus).await?;
        drop_column_if_exists(manager, AUTOMATION_TABLE, Automation::TriggerEnabled).await?;
        drop_column_if_exists(manager, AUTOMATION_TABLE, Automation::TriggerKind).await?;

        Ok(())
    }
}

async fn add_column_if_missing(
    manager: &SchemaManager<'_>,
    table_name: &str,
    column_name: &str,
    column: &mut ColumnDef,
) -> Result<(), DbErr> {
    if manager.has_column(table_name, column_name).await? {
        return Ok(());
    }

    manager
        .alter_table(
            Table::alter()
                .table(Alias::new(table_name))
                .add_column(column.to_owned())
                .to_owned(),
        )
        .await
}

async fn drop_column_if_exists<I>(
    manager: &SchemaManager<'_>,
    table_name: &str,
    column: I,
) -> Result<(), DbErr>
where
    I: Iden + 'static,
{
    manager
        .alter_table(
            Table::alter()
                .table(Alias::new(table_name))
                .drop_column(column)
                .to_owned(),
        )
        .await
}

const AUTOMATION_TABLE: &str = "automation";
const AUTOMATION_RUN_TABLE: &str = "automation_run";

#[derive(DeriveIden)]
enum Automation {
    Table,
    TriggerKind,
    TriggerEnabled,
    TriggerStatus,
    TriggerConfigJson,
}

#[derive(DeriveIden)]
enum AutomationRun {
    TriggerSourceJson,
}

#[derive(DeriveIden)]
enum AutomationGithubDeliveryClaim {
    Table,
    DeliveryId,
    RouteId,
    AutomationGuid,
    RunGuid,
    Status,
    ErrorCode,
    CreatedAt,
    UpdatedAt,
}
