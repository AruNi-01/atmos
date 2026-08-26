use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const WORKSPACE_TABLE: &str = "workspace";
const PROJECT_TABLE: &str = "project";
const TERMINAL_LAYOUT_COLUMN: &str = "terminal_layout";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        drop_column_if_exists(manager, WORKSPACE_TABLE, Workspace::TerminalLayout).await?;
        drop_column_if_exists(manager, PROJECT_TABLE, Project::TerminalLayout).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        add_column_if_missing(manager, WORKSPACE_TABLE, Workspace::TerminalLayout).await?;
        add_column_if_missing(manager, PROJECT_TABLE, Project::TerminalLayout).await?;
        Ok(())
    }
}

async fn drop_column_if_exists<I>(
    manager: &SchemaManager<'_>,
    table_name: &str,
    column: I,
) -> Result<(), DbErr>
where
    I: Iden + 'static,
{
    if !manager
        .has_column(table_name, TERMINAL_LAYOUT_COLUMN)
        .await?
    {
        return Ok(());
    }

    manager
        .alter_table(
            Table::alter()
                .table(Alias::new(table_name))
                .drop_column(column)
                .to_owned(),
        )
        .await
}

async fn add_column_if_missing<I>(
    manager: &SchemaManager<'_>,
    table_name: &str,
    column: I,
) -> Result<(), DbErr>
where
    I: Iden + 'static,
{
    if manager
        .has_column(table_name, TERMINAL_LAYOUT_COLUMN)
        .await?
    {
        return Ok(());
    }

    manager
        .alter_table(
            Table::alter()
                .table(Alias::new(table_name))
                .add_column(ColumnDef::new(column).text().null())
                .to_owned(),
        )
        .await
}

#[derive(DeriveIden)]
enum Workspace {
    TerminalLayout,
}

#[derive(DeriveIden)]
enum Project {
    TerminalLayout,
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};

    use super::*;

    #[tokio::test]
    async fn up_drops_terminal_layout_from_workspace_and_project() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE workspace (guid TEXT PRIMARY KEY, terminal_layout TEXT NULL)".to_owned(),
        ))
        .await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE project (guid TEXT PRIMARY KEY, terminal_layout TEXT NULL)".to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(!manager.has_column("workspace", "terminal_layout").await?);
        assert!(!manager.has_column("project", "terminal_layout").await?);
        Ok(())
    }
}
