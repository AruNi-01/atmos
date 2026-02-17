use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create Project Table
        manager
            .create_table(
                Table::create()
                    .table(Project::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Project::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Project::CreatedAt).date_time().not_null())
                    .col(ColumnDef::new(Project::UpdatedAt).date_time().not_null())
                    .col(
                        ColumnDef::new(Project::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Project::Name).string().not_null())
                    .col(ColumnDef::new(Project::MainFilePath).string().not_null())
                    .col(ColumnDef::new(Project::SidebarOrder).integer().not_null())
                    .col(ColumnDef::new(Project::BorderColor).string().null())
                    .col(
                        ColumnDef::new(Project::IsOpen)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .to_owned(),
            )
            .await?;

        // Create Workspace Table
        manager
            .create_table(
                Table::create()
                    .table(Workspace::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Workspace::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Workspace::ProjectGuid).string().not_null())
                    .col(ColumnDef::new(Workspace::CreatedAt).date_time().not_null())
                    .col(ColumnDef::new(Workspace::UpdatedAt).date_time().not_null())
                    .col(
                        ColumnDef::new(Workspace::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Workspace::Name).string().not_null())
                    .col(ColumnDef::new(Workspace::Branch).string().not_null())
                    .col(ColumnDef::new(Workspace::SidebarOrder).integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-workspace-project")
                            .from(Workspace::Table, Workspace::ProjectGuid)
                            .to(Project::Table, Project::Guid)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Workspace::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Project::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Project {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Name,
    MainFilePath,
    SidebarOrder,
    BorderColor,
    IsOpen,
}

#[derive(DeriveIden)]
enum Workspace {
    Table,
    Guid,
    ProjectGuid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Name,
    Branch,
    SidebarOrder,
}
