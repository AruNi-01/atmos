use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_table("canvas_board").await? {
            return Ok(());
        }

        manager
            .drop_table(Table::drop().table(Alias::new("canvas_board")).to_owned())
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("canvas_board").await? {
            return Ok(());
        }

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("canvas_board"))
                    .col(
                        ColumnDef::new(Alias::new("guid"))
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Alias::new("created_at")).date_time().not_null())
                    .col(ColumnDef::new(Alias::new("updated_at")).date_time().not_null())
                    .col(
                        ColumnDef::new(Alias::new("is_deleted"))
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Alias::new("slug")).string().not_null())
                    .col(ColumnDef::new(Alias::new("name")).string().not_null())
                    .col(ColumnDef::new(Alias::new("document_json")).text().not_null())
                    .to_owned(),
            )
            .await?;

        // Match original create migration unique index so re-up does not leave
        // a table without the slug constraint.
        manager
            .create_index(
                Index::create()
                    .name("idx-canvas_board-slug")
                    .table(Alias::new("canvas_board"))
                    .col(Alias::new("slug"))
                    .unique()
                    .to_owned(),
            )
            .await
    }
}
