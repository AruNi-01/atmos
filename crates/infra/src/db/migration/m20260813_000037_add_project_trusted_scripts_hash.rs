use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("project", "trusted_scripts_hash")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Project::Table)
                        .add_column(ColumnDef::new(Project::TrustedScriptsHash).text().null())
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column("project", "trusted_scripts_hash")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(Project::Table)
                        .drop_column(Project::TrustedScriptsHash)
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
    TrustedScriptsHash,
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};

    use super::*;

    #[tokio::test]
    async fn up_adds_trusted_scripts_hash_when_missing() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE project (guid TEXT PRIMARY KEY)".to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(
            manager
                .has_column("project", "trusted_scripts_hash")
                .await?
        );
        Ok(())
    }

    #[tokio::test]
    async fn up_skips_existing_trusted_scripts_hash() -> Result<(), DbErr> {
        let db = Database::connect("sqlite::memory:").await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE TABLE project (guid TEXT PRIMARY KEY, trusted_scripts_hash TEXT NULL)"
                .to_owned(),
        ))
        .await?;

        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await?;

        assert!(
            manager
                .has_column("project", "trusted_scripts_hash")
                .await?
        );
        Ok(())
    }
}
