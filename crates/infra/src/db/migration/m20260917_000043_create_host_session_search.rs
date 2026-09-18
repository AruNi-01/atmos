use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(HostSessionSearch::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(HostSessionSearch::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearch::Guid)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearch::SessionKey)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearch::RootSessionKey)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(HostSessionSearch::Kind).string().not_null())
                    .col(ColumnDef::new(HostSessionSearch::MessageId).string().null())
                    .col(ColumnDef::new(HostSessionSearch::Seq).integer().not_null())
                    .col(
                        ColumnDef::new(HostSessionSearch::Chunk)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(HostSessionSearch::Text).text().not_null())
                    .col(
                        ColumnDef::new(HostSessionSearch::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearch::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-host-session-search-loc")
                    .table(HostSessionSearch::Table)
                    .col(HostSessionSearch::SessionKey)
                    .col(HostSessionSearch::Kind)
                    .col(HostSessionSearch::Seq)
                    .col(HostSessionSearch::Chunk)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(HostSessionSearchCursor::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(HostSessionSearchCursor::SessionKey)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearchCursor::SourceMtimeMs)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearchCursor::SourceSize)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearchCursor::BodyReady)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(HostSessionSearchCursor::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        let db = manager.get_connection();
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS host_session_fts USING fts5(
              text,
              content='host_session_search',
              content_rowid='id',
              tokenize='trigram case_sensitive 0'
            )
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE TRIGGER IF NOT EXISTS host_session_search_ai
            AFTER INSERT ON host_session_search BEGIN
              INSERT INTO host_session_fts(rowid, text) VALUES (new.id, new.text);
            END
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE TRIGGER IF NOT EXISTS host_session_search_ad
            AFTER DELETE ON host_session_search BEGIN
              INSERT INTO host_session_fts(host_session_fts, rowid, text)
                VALUES('delete', old.id, old.text);
            END
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE TRIGGER IF NOT EXISTS host_session_search_au
            AFTER UPDATE ON host_session_search BEGIN
              INSERT INTO host_session_fts(host_session_fts, rowid, text)
                VALUES('delete', old.id, old.text);
              INSERT INTO host_session_fts(rowid, text) VALUES (new.id, new.text);
            END
            "#
            .to_owned(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for sql in [
            "DROP TRIGGER IF EXISTS host_session_search_au",
            "DROP TRIGGER IF EXISTS host_session_search_ad",
            "DROP TRIGGER IF EXISTS host_session_search_ai",
            "DROP TABLE IF EXISTS host_session_fts",
        ] {
            db.execute(Statement::from_string(
                manager.get_database_backend(),
                sql.to_owned(),
            ))
            .await?;
        }
        manager
            .drop_table(
                Table::drop()
                    .table(HostSessionSearchCursor::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(HostSessionSearch::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum HostSessionSearch {
    Table,
    Id,
    Guid,
    SessionKey,
    RootSessionKey,
    Kind,
    MessageId,
    Seq,
    Chunk,
    Text,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum HostSessionSearchCursor {
    Table,
    SessionKey,
    SourceMtimeMs,
    SourceSize,
    BodyReady,
    UpdatedAt,
}
