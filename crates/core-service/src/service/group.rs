use crate::error::{Result, ServiceError};
use infra::db::entities::item_group_member;
use infra::db::repo::GroupRepo;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

pub const MEMBER_TYPE_PROJECT: &str = "project";
pub const MEMBER_TYPE_WORKSPACE: &str = "workspace";
const MAX_GROUP_NAME_LEN: usize = 80;

pub struct GroupService {
    db: Arc<DatabaseConnection>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupMemberDto {
    pub guid: String,
    pub member_type: String,
    pub member_guid: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupDto {
    pub guid: String,
    pub name: String,
    pub sidebar_order: i32,
    pub members: Vec<GroupMemberDto>,
}

impl From<item_group_member::Model> for GroupMemberDto {
    fn from(m: item_group_member::Model) -> Self {
        Self {
            guid: m.guid,
            member_type: m.member_type,
            member_guid: m.member_guid,
            sort_order: m.sort_order,
        }
    }
}

impl GroupService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    fn normalize_name(name: &str) -> Result<String> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(ServiceError::Validation(
                "Group name cannot be empty".into(),
            ));
        }
        if trimmed.chars().count() > MAX_GROUP_NAME_LEN {
            return Err(ServiceError::Validation(format!(
                "Group name cannot exceed {} characters",
                MAX_GROUP_NAME_LEN
            )));
        }
        Ok(trimmed)
    }

    fn validate_member_type(member_type: &str) -> Result<()> {
        if member_type == MEMBER_TYPE_PROJECT || member_type == MEMBER_TYPE_WORKSPACE {
            Ok(())
        } else {
            Err(ServiceError::Validation(format!(
                "Invalid member_type: {}",
                member_type
            )))
        }
    }

    pub async fn list_groups(&self) -> Result<Vec<GroupDto>> {
        let repo = GroupRepo::new(&self.db);
        let groups = repo.list_groups().await?;
        let guids: Vec<String> = groups.iter().map(|g| g.guid.clone()).collect();
        let members = repo.list_members_for_groups(&guids).await?;

        let mut members_by_group: HashMap<String, Vec<GroupMemberDto>> = HashMap::new();
        for member in members {
            members_by_group
                .entry(member.group_guid.clone())
                .or_default()
                .push(GroupMemberDto::from(member));
        }

        Ok(groups
            .into_iter()
            .map(|g| GroupDto {
                members: members_by_group.remove(&g.guid).unwrap_or_default(),
                guid: g.guid,
                name: g.name,
                sidebar_order: g.sidebar_order,
            })
            .collect())
    }

    pub async fn create_group(&self, name: String, sidebar_order: Option<i32>) -> Result<GroupDto> {
        let name = Self::normalize_name(&name)?;
        let repo = GroupRepo::new(&self.db);
        let order = match sidebar_order {
            Some(o) => o,
            None => repo.next_group_sidebar_order().await?,
        };
        let group = repo.create_group(name, order).await?;
        Ok(GroupDto {
            guid: group.guid,
            name: group.name,
            sidebar_order: group.sidebar_order,
            members: Vec::new(),
        })
    }

    pub async fn rename_group(&self, guid: String, name: String) -> Result<()> {
        let name = Self::normalize_name(&name)?;
        let repo = GroupRepo::new(&self.db);
        repo.find_group_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Group {} not found", guid)))?;
        Ok(repo.update_group_name(&guid, name).await?)
    }

    pub async fn update_group_order(&self, orders: Vec<(String, i32)>) -> Result<()> {
        let repo = GroupRepo::new(&self.db);
        // Validate all groups exist before writing so rejected requests never partially apply.
        for (guid, _) in &orders {
            repo.find_group_by_guid(guid)
                .await?
                .ok_or_else(|| ServiceError::NotFound(format!("Group {} not found", guid)))?;
        }
        Ok(repo.update_group_orders(&orders).await?)
    }

    pub async fn delete_group(&self, guid: String) -> Result<()> {
        let repo = GroupRepo::new(&self.db);
        repo.find_group_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Group {} not found", guid)))?;
        // Memberships + group soft-delete in one transaction (mirrors project delete).
        Ok(repo.soft_delete_group_with_memberships(&guid).await?)
    }

    pub async fn set_member(
        &self,
        group_guid: String,
        member_type: String,
        member_guid: String,
    ) -> Result<GroupMemberDto> {
        Self::validate_member_type(&member_type)?;
        let repo = GroupRepo::new(&self.db);
        repo.find_group_by_guid(&group_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Group {} not found", group_guid)))?;

        // Exclusive membership: soft-delete prior row and insert replacement in one
        // transaction. Group + member liveness are write-claimed inside that txn
        // (UPDATE ... WHERE is_deleted=false), not a separate SELECT, so concurrent
        // soft-deletes cannot leave a membership on a deleted target under SQLite.
        // Combined with the partial unique index on active (member_type, member_guid).
        let sort_order = repo.next_member_sort_order(&group_guid).await?;
        let member = repo
            .replace_member_exclusively(group_guid, member_type, member_guid, sort_order)
            .await?;
        Ok(GroupMemberDto::from(member))
    }

    pub async fn remove_member(&self, member_type: String, member_guid: String) -> Result<()> {
        Self::validate_member_type(&member_type)?;
        let repo = GroupRepo::new(&self.db);
        let affected = repo
            .soft_delete_memberships_for_member(&member_type, &member_guid)
            .await?;
        if affected == 0 {
            return Err(ServiceError::NotFound("Group membership not found".into()));
        }
        Ok(())
    }

    pub async fn update_member_order(
        &self,
        group_guid: String,
        membership_guids: Vec<String>,
    ) -> Result<()> {
        let repo = GroupRepo::new(&self.db);
        repo.find_group_by_guid(&group_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Group {} not found", group_guid)))?;

        // Validate every membership before any write so failed reorders stay atomic.
        for membership_guid in &membership_guids {
            let member = repo
                .find_member_by_guid(membership_guid)
                .await?
                .ok_or_else(|| {
                    ServiceError::NotFound(format!(
                        "Group membership {} not found",
                        membership_guid
                    ))
                })?;
            if member.group_guid != group_guid {
                return Err(ServiceError::Validation(format!(
                    "Membership {} does not belong to group {}",
                    membership_guid, group_guid
                )));
            }
        }
        Ok(repo
            .update_member_sort_orders(&group_guid, &membership_guids)
            .await?)
    }

    pub async fn remove_memberships_for_project(&self, project_guid: &str) -> Result<()> {
        let repo = GroupRepo::new(&self.db);
        repo.soft_delete_memberships_for_member(MEMBER_TYPE_PROJECT, project_guid)
            .await?;
        Ok(())
    }

    pub async fn remove_memberships_for_workspace(&self, workspace_guid: &str) -> Result<()> {
        let repo = GroupRepo::new(&self.db);
        repo.soft_delete_memberships_for_member(MEMBER_TYPE_WORKSPACE, workspace_guid)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use infra::db::repo::{ProjectRepo, WorkspaceCreateSource, WorkspaceRepo};
    use sea_orm::{ConnectionTrait, Database, DbBackend, Schema, Statement};

    async fn setup_db() -> Arc<DatabaseConnection> {
        let db = Database::connect("sqlite::memory:")
            .await
            .expect("connect sqlite memory");
        let schema = Schema::new(DbBackend::Sqlite);
        let backend = db.get_database_backend();

        for stmt in [
            backend.build(
                schema
                    .create_table_from_entity(infra::db::entities::project::Entity)
                    .if_not_exists(),
            ),
            backend.build(
                schema
                    .create_table_from_entity(infra::db::entities::workspace::Entity)
                    .if_not_exists(),
            ),
            backend.build(
                schema
                    .create_table_from_entity(infra::db::entities::item_group::Entity)
                    .if_not_exists(),
            ),
            backend.build(
                schema
                    .create_table_from_entity(infra::db::entities::item_group_member::Entity)
                    .if_not_exists(),
            ),
        ] {
            db.execute(stmt).await.expect("create table");
        }

        // Ensure indexes don't block in-memory schema creation paths.
        let _ = db
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA foreign_keys = OFF".to_owned(),
            ))
            .await;

        // Mirror exclusive active membership constraint from migration.
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            r#"CREATE UNIQUE INDEX IF NOT EXISTS "idx-item_group_member-active-type-guid" ON "item_group_member" ("member_type", "member_guid") WHERE "is_deleted" = false"#
                .to_owned(),
        ))
        .await
        .expect("create exclusive membership index");

        Arc::new(db)
    }

    async fn seed_project(db: &DatabaseConnection, name: &str) -> String {
        let repo = ProjectRepo::new(db);
        let p = repo
            .create(name.to_string(), format!("/tmp/{}", name), 0, None, None)
            .await
            .expect("create project");
        p.guid
    }

    async fn seed_workspace(db: &DatabaseConnection, project_guid: &str, name: &str) -> String {
        let repo = WorkspaceRepo::new(db);
        let ws = repo
            .create(
                project_guid.to_string(),
                name.to_string(),
                None,
                format!("branch-{}", name),
                "main".to_string(),
                0,
                None,
                None,
                None,
                None,
                false,
                None,
                None,
                None,
                WorkspaceCreateSource::Manual,
            )
            .await
            .expect("create workspace");
        ws.guid
    }

    #[tokio::test]
    async fn create_rename_delete_group() {
        let db = setup_db().await;
        let service = GroupService::new(Arc::clone(&db));

        let group = service
            .create_group("Client A".into(), None)
            .await
            .expect("create");
        assert_eq!(group.name, "Client A");
        assert!(group.members.is_empty());

        service
            .rename_group(group.guid.clone(), "Client B".into())
            .await
            .expect("rename");
        let listed = service.list_groups().await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Client B");

        assert!(service
            .rename_group(group.guid.clone(), "   ".into())
            .await
            .is_err());

        service
            .delete_group(group.guid.clone())
            .await
            .expect("delete");
        assert!(service.list_groups().await.expect("list").is_empty());
    }

    #[tokio::test]
    async fn exclusive_membership_and_mixed_members() {
        let db = setup_db().await;
        let service = GroupService::new(Arc::clone(&db));
        let project_a = seed_project(&db, "proj-a").await;
        let project_b = seed_project(&db, "proj-b").await;
        let workspace = seed_workspace(&db, &project_b, "ws-1").await;

        let g1 = service.create_group("G1".into(), None).await.expect("g1");
        let g2 = service.create_group("G2".into(), None).await.expect("g2");

        service
            .set_member(
                g1.guid.clone(),
                MEMBER_TYPE_PROJECT.into(),
                project_a.clone(),
            )
            .await
            .expect("add project");
        service
            .set_member(
                g1.guid.clone(),
                MEMBER_TYPE_WORKSPACE.into(),
                workspace.clone(),
            )
            .await
            .expect("add workspace");

        let listed = service.list_groups().await.expect("list");
        let g1_view = listed.iter().find(|g| g.guid == g1.guid).unwrap();
        assert_eq!(g1_view.members.len(), 2);

        // Move workspace to g2 exclusively.
        service
            .set_member(
                g2.guid.clone(),
                MEMBER_TYPE_WORKSPACE.into(),
                workspace.clone(),
            )
            .await
            .expect("move");

        let listed = service.list_groups().await.expect("list");
        let g1_view = listed.iter().find(|g| g.guid == g1.guid).unwrap();
        let g2_view = listed.iter().find(|g| g.guid == g2.guid).unwrap();
        assert_eq!(g1_view.members.len(), 1);
        assert_eq!(g1_view.members[0].member_guid, project_a);
        assert_eq!(g2_view.members.len(), 1);
        assert_eq!(g2_view.members[0].member_guid, workspace);
        assert_eq!(g2_view.members[0].member_type, MEMBER_TYPE_WORKSPACE);
    }

    #[tokio::test]
    async fn delete_group_clears_memberships_not_projects() {
        let db = setup_db().await;
        let service = GroupService::new(Arc::clone(&db));
        let project = seed_project(&db, "keep-me").await;
        let group = service
            .create_group("Temp".into(), None)
            .await
            .expect("create");
        service
            .set_member(
                group.guid.clone(),
                MEMBER_TYPE_PROJECT.into(),
                project.clone(),
            )
            .await
            .expect("member");

        service.delete_group(group.guid).await.expect("delete");
        assert!(service.list_groups().await.expect("list").is_empty());

        let project_repo = ProjectRepo::new(&db);
        assert!(project_repo
            .find_by_guid(&project)
            .await
            .expect("find")
            .is_some());
    }

    #[tokio::test]
    async fn project_and_workspace_delete_hooks() {
        let db = setup_db().await;
        let service = GroupService::new(Arc::clone(&db));
        let project = seed_project(&db, "p1").await;
        let workspace = seed_workspace(&db, &project, "w1").await;
        let group = service
            .create_group("G".into(), None)
            .await
            .expect("create");
        service
            .set_member(
                group.guid.clone(),
                MEMBER_TYPE_PROJECT.into(),
                project.clone(),
            )
            .await
            .unwrap();
        service
            .set_member(
                group.guid.clone(),
                MEMBER_TYPE_WORKSPACE.into(),
                workspace.clone(),
            )
            .await
            .unwrap();

        service
            .remove_memberships_for_project(&project)
            .await
            .unwrap();
        service
            .remove_memberships_for_workspace(&workspace)
            .await
            .unwrap();

        let listed = service.list_groups().await.unwrap();
        assert!(listed[0].members.is_empty());
    }
}
