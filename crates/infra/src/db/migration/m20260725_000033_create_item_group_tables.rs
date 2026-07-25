use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ItemGroup::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ItemGroup::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ItemGroup::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroup::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroup::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(ItemGroup::Name).string().not_null())
                    .col(
                        ColumnDef::new(ItemGroup::SidebarOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-item_group-sidebar_order")
                    .table(ItemGroup::Table)
                    .col(ItemGroup::SidebarOrder)
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(ItemGroupMember::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ItemGroupMember::Guid)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::CreatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::IsDeleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::GroupGuid)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::MemberType)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::MemberGuid)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ItemGroupMember::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-item_group_member-group-sort")
                    .table(ItemGroupMember::Table)
                    .col(ItemGroupMember::GroupGuid)
                    .col(ItemGroupMember::IsDeleted)
                    .col(ItemGroupMember::SortOrder)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-item_group_member-type-guid")
                    .table(ItemGroupMember::Table)
                    .col(ItemGroupMember::MemberType)
                    .col(ItemGroupMember::MemberGuid)
                    .col(ItemGroupMember::IsDeleted)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(ItemGroupMember::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(ItemGroup::Table).if_exists().to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum ItemGroup {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    Name,
    SidebarOrder,
}

#[derive(Iden)]
enum ItemGroupMember {
    Table,
    Guid,
    CreatedAt,
    UpdatedAt,
    IsDeleted,
    GroupGuid,
    MemberType,
    MemberGuid,
    SortOrder,
}
