use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::workspace_external_issue;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub const PROVIDER_LINEAR: &str = "linear";

pub struct WorkspaceExternalIssueRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a>
    BaseRepo<
        workspace_external_issue::Entity,
        workspace_external_issue::Model,
        workspace_external_issue::ActiveModel,
    > for WorkspaceExternalIssueRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> WorkspaceExternalIssueRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_by_workspace(
        &self,
        workspace_guid: &str,
        provider: &str,
    ) -> Result<Vec<workspace_external_issue::Model>> {
        let rows = workspace_external_issue::Entity::find()
            .filter(workspace_external_issue::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(workspace_external_issue::Column::Provider.eq(provider))
            .filter(workspace_external_issue::Column::IsDeleted.eq(false))
            .order_by_asc(workspace_external_issue::Column::LinkedAt)
            .all(self.db)
            .await?;
        Ok(rows)
    }

    pub async fn find_link(
        &self,
        workspace_guid: &str,
        provider: &str,
        external_id: &str,
    ) -> Result<Option<workspace_external_issue::Model>> {
        let row = workspace_external_issue::Entity::find()
            .filter(workspace_external_issue::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(workspace_external_issue::Column::Provider.eq(provider))
            .filter(workspace_external_issue::Column::ExternalId.eq(external_id))
            .filter(workspace_external_issue::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(row)
    }

    /// Includes soft-deleted rows (needed to revive after unlink under unique index).
    pub async fn find_link_any(
        &self,
        workspace_guid: &str,
        provider: &str,
        external_id: &str,
    ) -> Result<Option<workspace_external_issue::Model>> {
        let row = workspace_external_issue::Entity::find()
            .filter(workspace_external_issue::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(workspace_external_issue::Column::Provider.eq(provider))
            .filter(workspace_external_issue::Column::ExternalId.eq(external_id))
            .one(self.db)
            .await?;
        Ok(row)
    }

    /// Batch load active links for many workspaces (kanban/popover).
    pub async fn list_by_workspaces(
        &self,
        workspace_guids: &[String],
        provider: &str,
    ) -> Result<Vec<workspace_external_issue::Model>> {
        if workspace_guids.is_empty() {
            return Ok(vec![]);
        }
        let rows = workspace_external_issue::Entity::find()
            .filter(workspace_external_issue::Column::WorkspaceGuid.is_in(workspace_guids.to_vec()))
            .filter(workspace_external_issue::Column::Provider.eq(provider))
            .filter(workspace_external_issue::Column::IsDeleted.eq(false))
            .order_by_asc(workspace_external_issue::Column::LinkedAt)
            .all(self.db)
            .await?;
        Ok(rows)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_link(
        &self,
        workspace_guid: String,
        provider: String,
        external_id: String,
        identifier: String,
        title: String,
        url: String,
        snapshot_json: Option<String>,
    ) -> Result<workspace_external_issue::Model> {
        // Revive soft-deleted rows so unique (workspace, provider, external_id) does not fail.
        if let Some(existing) = self
            .find_link_any(&workspace_guid, &provider, &external_id)
            .await?
        {
            let mut active: workspace_external_issue::ActiveModel = existing.into();
            active.is_deleted = Set(false);
            active.identifier = Set(identifier);
            active.title = Set(title);
            active.url = Set(url);
            active.snapshot_json = Set(snapshot_json);
            active.updated_at = Set(chrono::Utc::now().naive_utc());
            let updated = active.update(self.db).await?;
            return Ok(updated);
        }

        let base = BaseFields::new();
        let now = base.created_at;
        let model = workspace_external_issue::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(now),
            updated_at: Set(now),
            is_deleted: Set(false),
            workspace_guid: Set(workspace_guid),
            provider: Set(provider),
            external_id: Set(external_id),
            identifier: Set(identifier),
            title: Set(title),
            url: Set(url),
            snapshot_json: Set(snapshot_json),
            linked_at: Set(now),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn soft_unlink(
        &self,
        workspace_guid: &str,
        provider: &str,
        external_id: &str,
    ) -> Result<bool> {
        let Some(existing) = self
            .find_link(workspace_guid, provider, external_id)
            .await?
        else {
            return Ok(false);
        };
        let mut active: workspace_external_issue::ActiveModel = existing.into();
        active.is_deleted = Set(true);
        active.updated_at = Set(chrono::Utc::now().naive_utc());
        active.update(self.db).await?;
        Ok(true)
    }
}
