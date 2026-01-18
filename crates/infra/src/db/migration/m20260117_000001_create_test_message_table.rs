use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(TestMessage::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TestMessage::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(TestMessage::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TestMessage::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TestMessage::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(TestMessage::Content).string().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(TestMessage::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum TestMessage {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Content,
}
