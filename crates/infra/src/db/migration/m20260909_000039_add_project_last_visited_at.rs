use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("project", "last_visited_at").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Project::Table)
                        .add_column(ColumnDef::new(Project::LastVisitedAt).date_time().null())
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_column("project", "last_visited_at").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Project::Table)
                        .drop_column(Project::LastVisitedAt)
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Project {
    Table,
    LastVisitedAt,
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};

    use super::*;

    #[tokio::test]
    async fn up_adds_last_visited_at_when_missing() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE project (guid TEXT PRIMARY KEY)".to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(manager.has_column("project", "last_visited_at").await?);
        Ok(())
    }

    #[tokio::test]
    async fn up_skips_existing_last_visited_at() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE project (guid TEXT PRIMARY KEY, last_visited_at DATETIME NULL)"
                .to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(manager.has_column("project", "last_visited_at").await?);
        Ok(())
    }
}
