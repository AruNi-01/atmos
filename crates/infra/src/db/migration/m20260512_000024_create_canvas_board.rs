use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(CanvasBoard::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CanvasBoard::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::Slug)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::Name)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CanvasBoard::DocumentJson)
                            .text()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-canvas_board-slug")
                    .table(CanvasBoard::Table)
                    .col(CanvasBoard::Slug)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CanvasBoard::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum CanvasBoard {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Slug,
    Name,
    DocumentJson,
}
