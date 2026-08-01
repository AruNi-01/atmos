use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(QueueEvent::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(QueueEvent::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(QueueEvent::CreatedAt).date_time().not_null())
                    .col(ColumnDef::new(QueueEvent::UpdatedAt).date_time().not_null())
                    .col(ColumnDef::new(QueueEvent::Topic).string().not_null())
                    .col(ColumnDef::new(QueueEvent::Payload).binary().not_null())
                    .col(ColumnDef::new(QueueEvent::Status).string().not_null())
                    .col(
                        ColumnDef::new(QueueEvent::Attempts)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(QueueEvent::MaxAttempts)
                            .integer()
                            .not_null()
                            .default(5),
                    )
                    .col(ColumnDef::new(QueueEvent::LastError).text().null())
                    .col(
                        ColumnDef::new(QueueEvent::AvailableAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(ColumnDef::new(QueueEvent::ProcessedAt).date_time().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_queue_event_poll")
                    .table(QueueEvent::Table)
                    .col(QueueEvent::Topic)
                    .col(QueueEvent::Status)
                    .col(QueueEvent::AvailableAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_queue_event_created_at")
                    .table(QueueEvent::Table)
                    .col(QueueEvent::CreatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(QueueEvent::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum QueueEvent {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    Topic,
    Payload,
    Status,
    Attempts,
    MaxAttempts,
    LastError,
    AvailableAt,
    ProcessedAt,
}
