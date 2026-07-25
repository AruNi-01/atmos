use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::{item_group, item_group_member};
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct GroupRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<item_group::Entity, item_group::Model, item_group::ActiveModel>
    for GroupRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> GroupRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_groups(&self) -> Result<Vec<item_group::Model>> {
        let groups = item_group::Entity::find()
            .filter(item_group::Column::IsDeleted.eq(false))
            .order_by_asc(item_group::Column::SidebarOrder)
            .order_by_asc(item_group::Column::CreatedAt)
            .all(self.db)
            .await?;
        Ok(groups)
    }

    pub async fn find_group_by_guid(&self, guid: &str) -> Result<Option<item_group::Model>> {
        Ok(item_group::Entity::find_by_id(guid.to_string())
            .filter(item_group::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn create_group(
        &self,
        name: String,
        sidebar_order: i32,
    ) -> Result<item_group::Model> {
        let base = BaseFields::new();
        let model = item_group::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(name),
            sidebar_order: Set(sidebar_order),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn update_group_name(&self, guid: &str, name: String) -> Result<()> {
        let result = item_group::Entity::update_many()
            .col_expr(item_group::Column::Name, Expr::value(name))
            .col_expr(
                item_group::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group::Column::Guid.eq(guid))
            .filter(item_group::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Group not found".into()));
        }
        Ok(())
    }

    pub async fn update_group_order(&self, guid: &str, order: i32) -> Result<()> {
        let result = item_group::Entity::update_many()
            .col_expr(item_group::Column::SidebarOrder, Expr::value(order))
            .col_expr(
                item_group::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group::Column::Guid.eq(guid))
            .filter(item_group::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Group not found".into()));
        }
        Ok(())
    }

    /// Atomically apply sidebar order for many groups.
    pub async fn update_group_orders(&self, orders: &[(String, i32)]) -> Result<()> {
        let txn = self.db.begin().await?;
        let now = chrono::Utc::now().naive_utc();
        for (guid, order) in orders {
            let result = item_group::Entity::update_many()
                .col_expr(item_group::Column::SidebarOrder, Expr::value(*order))
                .col_expr(item_group::Column::UpdatedAt, Expr::value(now))
                .filter(item_group::Column::Guid.eq(guid.as_str()))
                .filter(item_group::Column::IsDeleted.eq(false))
                .exec(&txn)
                .await?;
            if result.rows_affected == 0 {
                return Err(crate::error::InfraError::Custom("Group not found".into()));
            }
        }
        txn.commit().await?;
        Ok(())
    }

    pub async fn soft_delete_group(&self, guid: &str) -> Result<()> {
        let result = item_group::Entity::update_many()
            .col_expr(item_group::Column::IsDeleted, Expr::value(true))
            .col_expr(
                item_group::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group::Column::Guid.eq(guid))
            .filter(item_group::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Group not found".into()));
        }
        Ok(())
    }

    pub async fn list_members_for_groups(
        &self,
        group_guids: &[String],
    ) -> Result<Vec<item_group_member::Model>> {
        if group_guids.is_empty() {
            return Ok(Vec::new());
        }
        let members = item_group_member::Entity::find()
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::GroupGuid.is_in(group_guids.to_vec()))
            .order_by_asc(item_group_member::Column::SortOrder)
            .order_by_asc(item_group_member::Column::CreatedAt)
            .all(self.db)
            .await?;
        Ok(members)
    }

    pub async fn list_members_for_group(
        &self,
        group_guid: &str,
    ) -> Result<Vec<item_group_member::Model>> {
        self.list_members_for_groups(&[group_guid.to_string()])
            .await
    }

    pub async fn find_active_membership(
        &self,
        member_type: &str,
        member_guid: &str,
    ) -> Result<Option<item_group_member::Model>> {
        Ok(item_group_member::Entity::find()
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::MemberType.eq(member_type))
            .filter(item_group_member::Column::MemberGuid.eq(member_guid))
            .one(self.db)
            .await?)
    }

    pub async fn next_member_sort_order(&self, group_guid: &str) -> Result<i32> {
        let max = item_group_member::Entity::find()
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::GroupGuid.eq(group_guid))
            .order_by_desc(item_group_member::Column::SortOrder)
            .one(self.db)
            .await?;
        Ok(max.map(|m| m.sort_order + 1).unwrap_or(0))
    }

    pub async fn next_group_sidebar_order(&self) -> Result<i32> {
        let max = item_group::Entity::find()
            .filter(item_group::Column::IsDeleted.eq(false))
            .order_by_desc(item_group::Column::SidebarOrder)
            .one(self.db)
            .await?;
        Ok(max.map(|g| g.sidebar_order + 1).unwrap_or(0))
    }

    /// Soft-delete any active membership for this member (exclusive membership).
    pub async fn soft_delete_memberships_for_member(
        &self,
        member_type: &str,
        member_guid: &str,
    ) -> Result<u64> {
        let result = item_group_member::Entity::update_many()
            .col_expr(item_group_member::Column::IsDeleted, Expr::value(true))
            .col_expr(
                item_group_member::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::MemberType.eq(member_type))
            .filter(item_group_member::Column::MemberGuid.eq(member_guid))
            .exec(self.db)
            .await?;
        Ok(result.rows_affected)
    }

    pub async fn soft_delete_memberships_for_group(&self, group_guid: &str) -> Result<u64> {
        let result = item_group_member::Entity::update_many()
            .col_expr(item_group_member::Column::IsDeleted, Expr::value(true))
            .col_expr(
                item_group_member::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::GroupGuid.eq(group_guid))
            .exec(self.db)
            .await?;
        Ok(result.rows_affected)
    }

    pub async fn create_member(
        &self,
        group_guid: String,
        member_type: String,
        member_guid: String,
        sort_order: i32,
    ) -> Result<item_group_member::Model> {
        let base = BaseFields::new();
        let model = item_group_member::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            group_guid: Set(group_guid),
            member_type: Set(member_type),
            member_guid: Set(member_guid),
            sort_order: Set(sort_order),
        };
        Ok(model.insert(self.db).await?)
    }

    /// Soft-delete any prior active membership, then insert the replacement atomically.
    pub async fn replace_member_exclusively(
        &self,
        group_guid: String,
        member_type: String,
        member_guid: String,
        sort_order: i32,
    ) -> Result<item_group_member::Model> {
        let txn = self.db.begin().await?;
        let now = chrono::Utc::now().naive_utc();

        item_group_member::Entity::update_many()
            .col_expr(item_group_member::Column::IsDeleted, Expr::value(true))
            .col_expr(item_group_member::Column::UpdatedAt, Expr::value(now))
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .filter(item_group_member::Column::MemberType.eq(member_type.as_str()))
            .filter(item_group_member::Column::MemberGuid.eq(member_guid.as_str()))
            .exec(&txn)
            .await?;

        let base = BaseFields::new();
        let model = item_group_member::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            group_guid: Set(group_guid),
            member_type: Set(member_type),
            member_guid: Set(member_guid),
            sort_order: Set(sort_order),
        };
        let inserted = model.insert(&txn).await?;
        txn.commit().await?;
        Ok(inserted)
    }

    pub async fn update_member_sort_order(
        &self,
        membership_guid: &str,
        sort_order: i32,
    ) -> Result<()> {
        let result = item_group_member::Entity::update_many()
            .col_expr(
                item_group_member::Column::SortOrder,
                Expr::value(sort_order),
            )
            .col_expr(
                item_group_member::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(item_group_member::Column::Guid.eq(membership_guid))
            .filter(item_group_member::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Group membership not found".into(),
            ));
        }
        Ok(())
    }

    /// Atomically apply sort order for many memberships in one group.
    pub async fn update_member_sort_orders(
        &self,
        ordered_membership_guids: &[String],
    ) -> Result<()> {
        let txn = self.db.begin().await?;
        let now = chrono::Utc::now().naive_utc();
        for (index, membership_guid) in ordered_membership_guids.iter().enumerate() {
            let result = item_group_member::Entity::update_many()
                .col_expr(
                    item_group_member::Column::SortOrder,
                    Expr::value(index as i32),
                )
                .col_expr(item_group_member::Column::UpdatedAt, Expr::value(now))
                .filter(item_group_member::Column::Guid.eq(membership_guid.as_str()))
                .filter(item_group_member::Column::IsDeleted.eq(false))
                .exec(&txn)
                .await?;
            if result.rows_affected == 0 {
                return Err(crate::error::InfraError::Custom(
                    "Group membership not found".into(),
                ));
            }
        }
        txn.commit().await?;
        Ok(())
    }

    pub async fn find_member_by_guid(
        &self,
        membership_guid: &str,
    ) -> Result<Option<item_group_member::Model>> {
        Ok(
            item_group_member::Entity::find_by_id(membership_guid.to_string())
                .filter(item_group_member::Column::IsDeleted.eq(false))
                .one(self.db)
                .await?,
        )
    }
}
