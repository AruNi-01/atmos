use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column(AUTOMATION_TABLE, "execute_mode").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_TABLE))
                        .add_column(
                            ColumnDef::new(Automation::ExecuteMode)
                                .string()
                                .not_null()
                                .default("headless"),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "execute_mode")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::ExecuteMode)
                                .string()
                                .not_null()
                                .default("headless"),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "surface_kind")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(ColumnDef::new(AutomationRun::SurfaceKind).string().null())
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "surface_session_id")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::SurfaceSessionId)
                                .string()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "surface_scope_id")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::SurfaceScopeId)
                                .string()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "stale_prompted_at")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::StalePromptedAt)
                                .date_time()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager
            .has_column(AUTOMATION_RUN_TABLE, "stale_prompt_dismissed")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_RUN_TABLE))
                        .add_column(
                            ColumnDef::new(AutomationRun::StalePromptDismissed)
                                .integer()
                                .not_null()
                                .default(0),
                        )
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let run_columns: [(&str, AutomationRun); 6] = [
            (
                "stale_prompt_dismissed",
                AutomationRun::StalePromptDismissed,
            ),
            ("stale_prompted_at", AutomationRun::StalePromptedAt),
            ("surface_scope_id", AutomationRun::SurfaceScopeId),
            ("surface_session_id", AutomationRun::SurfaceSessionId),
            ("surface_kind", AutomationRun::SurfaceKind),
            ("execute_mode", AutomationRun::ExecuteMode),
        ];
        for (name, column) in run_columns {
            if manager.has_column(AUTOMATION_RUN_TABLE, name).await? {
                manager
                    .alter_table(
                        Table::alter()
                            .table(Alias::new(AUTOMATION_RUN_TABLE))
                            .drop_column(column)
                            .to_owned(),
                    )
                    .await?;
            }
        }

        if manager.has_column(AUTOMATION_TABLE, "execute_mode").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new(AUTOMATION_TABLE))
                        .drop_column(Automation::ExecuteMode)
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
    ExecuteMode,
}

#[derive(DeriveIden)]
enum AutomationRun {
    ExecuteMode,
    SurfaceKind,
    SurfaceSessionId,
    SurfaceScopeId,
    StalePromptedAt,
    StalePromptDismissed,
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};

    use super::*;

    async fn create_tables(db: &sea_orm::DatabaseConnection) -> Result<(), DbErr> {
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE automation (guid TEXT PRIMARY KEY)".to_owned(),
        ))
        .await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE automation_run (guid TEXT PRIMARY KEY)".to_owned(),
        ))
        .await?;
        Ok(())
    }

    #[tokio::test]
    async fn up_adds_execute_mode_columns() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        create_tables(&db).await?;
        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(manager.has_column(AUTOMATION_TABLE, "execute_mode").await?);
        assert!(
            manager
                .has_column(AUTOMATION_RUN_TABLE, "execute_mode")
                .await?
        );
        assert!(
            manager
                .has_column(AUTOMATION_RUN_TABLE, "surface_kind")
                .await?
        );
        assert!(
            manager
                .has_column(AUTOMATION_RUN_TABLE, "stale_prompt_dismissed")
                .await?
        );
        Ok(())
    }

    #[tokio::test]
    async fn up_is_idempotent() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        create_tables(&db).await?;
        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;
        Migration.up(&manager).await?;
        assert!(manager.has_column(AUTOMATION_TABLE, "execute_mode").await?);
        Ok(())
    }
}
