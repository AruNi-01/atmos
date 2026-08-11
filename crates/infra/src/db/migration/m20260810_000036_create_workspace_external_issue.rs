use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(WorkspaceExternalIssue::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::WorkspaceGuid)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::Provider)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::ExternalId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::Identifier)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::Title)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::Url)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::SnapshotJson)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceExternalIssue::LinkedAt)
                            .date_time()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-workspace_external_issue-workspace")
                            .from(
                                WorkspaceExternalIssue::Table,
                                WorkspaceExternalIssue::WorkspaceGuid,
                            )
                            .to(Workspace::Table, Workspace::Guid)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-workspace_external_issue-workspace")
                    .table(WorkspaceExternalIssue::Table)
                    .col(WorkspaceExternalIssue::WorkspaceGuid)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-workspace_external_issue-unique-link")
                    .table(WorkspaceExternalIssue::Table)
                    .col(WorkspaceExternalIssue::WorkspaceGuid)
                    .col(WorkspaceExternalIssue::Provider)
                    .col(WorkspaceExternalIssue::ExternalId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(WorkspaceExternalIssue::Table)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum WorkspaceExternalIssue {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    WorkspaceGuid,
    Provider,
    ExternalId,
    Identifier,
    Title,
    Url,
    SnapshotJson,
    LinkedAt,
}

#[derive(DeriveIden)]
enum Workspace {
    Table,
    Guid,
}
