use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(TerminalCanvasBoard::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::Slug)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::Name)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TerminalCanvasBoard::DocumentJson)
                            .text()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-terminal_canvas_board-slug")
                    .table(TerminalCanvasBoard::Table)
                    .col(TerminalCanvasBoard::Slug)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(TerminalCanvasBoard::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum TerminalCanvasBoard {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Slug,
    Name,
    DocumentJson,
}
