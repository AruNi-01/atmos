use chrono::{NaiveDateTime, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::{automation, automation_github_delivery_claim, automation_run};
use crate::db::repo::base::BaseRepo;
use crate::error::{InfraError, Result};

const GITHUB_DELIVERY_CLAIMED: &str = "claimed";
const GITHUB_DELIVERY_ACCEPTED: &str = "accepted";
const GITHUB_DELIVERY_LOCAL_REJECTED: &str = "local_rejected";

pub struct AutomationRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<automation::Entity, automation::Model, automation::ActiveModel>
    for AutomationRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> AutomationRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_automations(
        &self,
        include_paused: bool,
        query: Option<&str>,
    ) -> Result<Vec<automation::Model>> {
        let mut select = automation::Entity::find().filter(automation::Column::IsDeleted.eq(false));

        if !include_paused {
            select = select.filter(automation::Column::SchedulePaused.eq(false));
        }

        if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
            select = select.filter(automation::Column::DisplayName.contains(query));
        }

        Ok(select
            .order_by_desc(automation::Column::UpdatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn list_due_scheduled_automations(
        &self,
        now: NaiveDateTime,
        limit: u64,
    ) -> Result<Vec<automation::Model>> {
        Ok(automation::Entity::find()
            .filter(automation::Column::IsDeleted.eq(false))
            .filter(automation::Column::ScheduleEnabled.eq(true))
            .filter(automation::Column::SchedulePaused.eq(false))
            .filter(automation::Column::TriggerKind.eq("scheduled"))
            .filter(automation::Column::TriggerEnabled.eq(true))
            .filter(automation::Column::TriggerStatus.eq("active"))
            .filter(automation::Column::NextRunAt.lte(now))
            .order_by_asc(automation::Column::NextRunAt)
            .limit(limit)
            .all(self.db)
            .await?)
    }

    pub async fn list_schedules_to_normalize(
        &self,
        now: NaiveDateTime,
    ) -> Result<Vec<automation::Model>> {
        Ok(automation::Entity::find()
            .filter(automation::Column::IsDeleted.eq(false))
            .filter(automation::Column::ScheduleEnabled.eq(true))
            .filter(automation::Column::SchedulePaused.eq(false))
            .filter(automation::Column::TriggerKind.eq("scheduled"))
            .filter(automation::Column::TriggerEnabled.eq(true))
            .filter(automation::Column::TriggerStatus.eq("active"))
            .filter(automation::Column::NextRunAt.lt(now))
            .order_by_asc(automation::Column::NextRunAt)
            .all(self.db)
            .await?)
    }

    pub async fn find_automation_by_guid(&self, guid: &str) -> Result<Option<automation::Model>> {
        Ok(automation::Entity::find_by_id(guid.to_string())
            .filter(automation::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn create_automation(
        &self,
        input: CreateAutomationRecord,
    ) -> Result<automation::Model> {
        let mut base = BaseFields::new();
        base.guid = input.guid;
        let model = automation::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            display_name: Set(input.display_name),
            agent_id: Set(input.agent_id),
            target_kind: Set(input.target_kind),
            project_guid: Set(input.project_guid),
            workspace_guid: Set(input.workspace_guid),
            schedule_enabled: Set(input.schedule_enabled),
            schedule_paused: Set(false),
            schedule_kind: Set(input.schedule_kind),
            schedule_expr: Set(input.schedule_expr),
            schedule_timezone: Set(input.schedule_timezone),
            next_run_at: Set(input.next_run_at),
            trigger_kind: Set(input.trigger_kind),
            trigger_enabled: Set(input.trigger_enabled),
            trigger_status: Set(input.trigger_status),
            trigger_config_json: Set(input.trigger_config_json),
            instructions_path: Set(input.instructions_path),
            artifact_root: Set(input.artifact_root),
            last_run_guid: Set(None),
            last_status: Set(None),
            run_count: Set(0),
        };

        Ok(model.insert(self.db).await?)
    }

    pub async fn update_automation(
        &self,
        guid: &str,
        input: UpdateAutomationRecord,
    ) -> Result<automation::Model> {
        let automation = self
            .find_automation_by_guid(guid)
            .await?
            .ok_or_else(|| InfraError::Custom("Automation not found".into()))?;
        let mut active: automation::ActiveModel = automation.into();
        active.updated_at = Set(Utc::now().naive_utc());

        if let Some(value) = input.display_name {
            active.display_name = Set(value);
        }
        if let Some(value) = input.agent_id {
            active.agent_id = Set(value);
        }
        if let Some(value) = input.target_kind {
            active.target_kind = Set(value);
        }
        if let Some(value) = input.project_guid {
            active.project_guid = Set(value);
        }
        if let Some(value) = input.workspace_guid {
            active.workspace_guid = Set(value);
        }
        if let Some(value) = input.schedule_enabled {
            active.schedule_enabled = Set(value);
        }
        if let Some(value) = input.schedule_kind {
            active.schedule_kind = Set(value);
        }
        if let Some(value) = input.schedule_expr {
            active.schedule_expr = Set(value);
        }
        if let Some(value) = input.schedule_timezone {
            active.schedule_timezone = Set(value);
        }
        if let Some(value) = input.next_run_at {
            active.next_run_at = Set(value);
        }
        if let Some(value) = input.trigger_kind {
            active.trigger_kind = Set(value);
        }
        if let Some(value) = input.trigger_enabled {
            active.trigger_enabled = Set(value);
        }
        if let Some(value) = input.trigger_status {
            active.trigger_status = Set(value);
        }
        if let Some(value) = input.trigger_config_json {
            active.trigger_config_json = Set(value);
        }

        Ok(active.update(self.db).await?)
    }

    pub async fn soft_delete_automation(&self, guid: &str) -> Result<()> {
        let result = automation::Entity::update_many()
            .col_expr(automation::Column::IsDeleted, Expr::value(true))
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        Ok(())
    }

    pub async fn mark_github_trigger_needs_setup(&self, guid: &str) -> Result<()> {
        automation::Entity::update_many()
            .col_expr(automation::Column::TriggerEnabled, Expr::value(false))
            .col_expr(
                automation::Column::TriggerStatus,
                Expr::value("needs_setup".to_string()),
            )
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .filter(automation::Column::TriggerKind.eq("github"))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn set_schedule_paused(&self, guid: &str, paused: bool) -> Result<automation::Model> {
        let result = automation::Entity::update_many()
            .col_expr(automation::Column::SchedulePaused, Expr::value(paused))
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        self.find_automation_by_guid(guid)
            .await?
            .ok_or_else(|| InfraError::Custom("Automation not found".into()))
    }

    pub async fn update_next_run_at(
        &self,
        guid: &str,
        next_run_at: Option<NaiveDateTime>,
    ) -> Result<automation::Model> {
        let result = automation::Entity::update_many()
            .col_expr(automation::Column::NextRunAt, Expr::value(next_run_at))
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        self.find_automation_by_guid(guid)
            .await?
            .ok_or_else(|| InfraError::Custom("Automation not found".into()))
    }

    pub async fn list_runs(
        &self,
        automation_guid: &str,
        limit: u64,
        offset: u64,
    ) -> Result<Vec<automation_run::Model>> {
        Ok(automation_run::Entity::find()
            .filter(automation_run::Column::AutomationGuid.eq(automation_guid))
            .filter(automation_run::Column::IsDeleted.eq(false))
            .order_by_desc(automation_run::Column::CreatedAt)
            .offset(offset)
            .limit(limit)
            .all(self.db)
            .await?)
    }

    pub async fn find_run_by_guid(&self, guid: &str) -> Result<Option<automation_run::Model>> {
        Ok(automation_run::Entity::find_by_id(guid.to_string())
            .filter(automation_run::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn create_run(
        &self,
        input: CreateAutomationRunRecord,
    ) -> Result<automation_run::Model> {
        let base = BaseFields::new();
        let model = automation_run::ActiveModel {
            guid: Set(input.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            automation_guid: Set(input.automation_guid),
            trigger_kind: Set(input.trigger_kind),
            trigger_source_json: Set(input.trigger_source_json),
            status: Set(input.status),
            failure_kind: Set(None),
            error_message: Set(None),
            target_kind: Set(input.target_kind),
            project_guid: Set(input.project_guid),
            workspace_guid: Set(input.workspace_guid),
            created_workspace_guid: Set(input.created_workspace_guid),
            cwd: Set(input.cwd),
            run_dir: Set(input.run_dir),
            prompt_path: Set(input.prompt_path),
            output_path: Set(input.output_path),
            result_path: Set(input.result_path),
            run_json_path: Set(input.run_json_path),
            terminal_display_name: Set("Automations".to_string()),
            tmux_session_name: Set(input.tmux_session_name),
            tmux_window_name: Set(input.tmux_window_name),
            tmux_window_index: Set(input.tmux_window_index),
            started_at: Set(input.started_at),
            completed_at: Set(None),
            exit_code: Set(None),
            cancellation_requested: Set(false),
        };

        let txn = self.db.begin().await?;
        let inserted = model.insert(&txn).await?;
        self.touch_automation_after_run_created(
            &txn,
            &inserted.automation_guid,
            &inserted.guid,
            &inserted.status,
        )
        .await?;
        txn.commit().await?;
        Ok(inserted)
    }

    pub async fn has_running_run_for_automation(&self, automation_guid: &str) -> Result<bool> {
        let count = automation_run::Entity::find()
            .filter(automation_run::Column::AutomationGuid.eq(automation_guid))
            .filter(automation_run::Column::IsDeleted.eq(false))
            .filter(automation_run::Column::Status.eq("running"))
            .count(self.db)
            .await?;
        Ok(count > 0)
    }

    pub async fn list_running_runs(&self) -> Result<Vec<automation_run::Model>> {
        Ok(automation_run::Entity::find()
            .filter(automation_run::Column::Status.eq("running"))
            .filter(automation_run::Column::IsDeleted.eq(false))
            .order_by_asc(automation_run::Column::StartedAt)
            .all(self.db)
            .await?)
    }

    pub async fn claim_github_delivery(
        &self,
        input: ClaimGithubDeliveryRecord,
    ) -> Result<GithubDeliveryClaimResult> {
        let now = Utc::now().naive_utc();
        let model = automation_github_delivery_claim::ActiveModel {
            delivery_id: Set(input.delivery_id.clone()),
            route_id: Set(input.route_id.clone()),
            automation_guid: Set(input.automation_guid),
            run_guid: Set(None),
            status: Set(GITHUB_DELIVERY_CLAIMED.to_string()),
            error_code: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };

        match model.insert(self.db).await {
            Ok(inserted) => Ok(GithubDeliveryClaimResult::Claimed(inserted)),
            Err(error) => {
                if let Some(existing) = self
                    .find_github_delivery_claim(&input.delivery_id, &input.route_id)
                    .await?
                {
                    Ok(GithubDeliveryClaimResult::AlreadyClaimed(existing))
                } else {
                    Err(error.into())
                }
            }
        }
    }

    pub async fn associate_github_delivery_run(
        &self,
        delivery_id: &str,
        route_id: &str,
        run_guid: &str,
    ) -> Result<()> {
        let result = automation_github_delivery_claim::Entity::update_many()
            .col_expr(
                automation_github_delivery_claim::Column::RunGuid,
                Expr::value(Some(run_guid.to_string())),
            )
            .col_expr(
                automation_github_delivery_claim::Column::Status,
                Expr::value(GITHUB_DELIVERY_ACCEPTED.to_string()),
            )
            .col_expr(
                automation_github_delivery_claim::Column::ErrorCode,
                Expr::value(Option::<String>::None),
            )
            .col_expr(
                automation_github_delivery_claim::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation_github_delivery_claim::Column::DeliveryId.eq(delivery_id))
            .filter(automation_github_delivery_claim::Column::RouteId.eq(route_id))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom(
                "GitHub delivery claim not found".to_string(),
            ));
        }
        Ok(())
    }

    pub async fn reject_github_delivery_claim(
        &self,
        delivery_id: &str,
        route_id: &str,
        error_code: &str,
    ) -> Result<()> {
        automation_github_delivery_claim::Entity::update_many()
            .col_expr(
                automation_github_delivery_claim::Column::Status,
                Expr::value(GITHUB_DELIVERY_LOCAL_REJECTED.to_string()),
            )
            .col_expr(
                automation_github_delivery_claim::Column::ErrorCode,
                Expr::value(Some(error_code.to_string())),
            )
            .col_expr(
                automation_github_delivery_claim::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation_github_delivery_claim::Column::DeliveryId.eq(delivery_id))
            .filter(automation_github_delivery_claim::Column::RouteId.eq(route_id))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn release_github_delivery_claim(
        &self,
        delivery_id: &str,
        route_id: &str,
    ) -> Result<()> {
        automation_github_delivery_claim::Entity::delete_many()
            .filter(automation_github_delivery_claim::Column::DeliveryId.eq(delivery_id))
            .filter(automation_github_delivery_claim::Column::RouteId.eq(route_id))
            .filter(automation_github_delivery_claim::Column::RunGuid.is_null())
            .filter(automation_github_delivery_claim::Column::Status.eq(GITHUB_DELIVERY_CLAIMED))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn find_github_delivery_claim(
        &self,
        delivery_id: &str,
        route_id: &str,
    ) -> Result<Option<automation_github_delivery_claim::Model>> {
        Ok(automation_github_delivery_claim::Entity::find()
            .filter(automation_github_delivery_claim::Column::DeliveryId.eq(delivery_id))
            .filter(automation_github_delivery_claim::Column::RouteId.eq(route_id))
            .one(self.db)
            .await?)
    }

    pub async fn update_run_status(
        &self,
        guid: &str,
        input: UpdateAutomationRunStatusRecord,
    ) -> Result<automation_run::Model> {
        let txn = self.db.begin().await?;
        let run = automation_run::Entity::find_by_id(guid.to_string())
            .filter(automation_run::Column::IsDeleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| InfraError::Custom("Automation run not found".into()))?;
        let mut active: automation_run::ActiveModel = run.into();
        active.status = Set(input.status);
        active.updated_at = Set(Utc::now().naive_utc());
        active.completed_at = Set(input.completed_at);
        active.exit_code = Set(input.exit_code);
        active.failure_kind = Set(input.failure_kind);
        active.error_message = Set(input.error_message);

        let updated = active.update(&txn).await?;
        self.touch_automation_after_run_status(
            &txn,
            &updated.automation_guid,
            &updated.guid,
            &updated.status,
        )
        .await?;
        txn.commit().await?;
        Ok(updated)
    }

    pub async fn mark_run_cancellation_requested(&self, guid: &str) -> Result<()> {
        let result = automation_run::Entity::update_many()
            .col_expr(
                automation_run::Column::CancellationRequested,
                Expr::value(true),
            )
            .col_expr(
                automation_run::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation_run::Column::Guid.eq(guid))
            .filter(automation_run::Column::IsDeleted.eq(false))
            .filter(automation_run::Column::Status.eq("running"))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom(
                "Running automation run not found".into(),
            ));
        }
        Ok(())
    }

    async fn touch_automation_after_run_created<C>(
        &self,
        db: &C,
        automation_guid: &str,
        run_guid: &str,
        status: &str,
    ) -> Result<()>
    where
        C: ConnectionTrait,
    {
        let result = automation::Entity::update_many()
            .col_expr(
                automation::Column::LastRunGuid,
                Expr::value(Some(run_guid.to_string())),
            )
            .col_expr(
                automation::Column::LastStatus,
                Expr::value(Some(status.to_string())),
            )
            .col_expr(
                automation::Column::RunCount,
                Expr::col(automation::Column::RunCount).add(1),
            )
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(automation_guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .exec(db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        Ok(())
    }

    async fn touch_automation_after_run_status<C>(
        &self,
        db: &C,
        automation_guid: &str,
        run_guid: &str,
        status: &str,
    ) -> Result<()>
    where
        C: ConnectionTrait,
    {
        let result = automation::Entity::update_many()
            .col_expr(
                automation::Column::LastRunGuid,
                Expr::value(Some(run_guid.to_string())),
            )
            .col_expr(
                automation::Column::LastStatus,
                Expr::value(Some(status.to_string())),
            )
            .col_expr(
                automation::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(automation::Column::Guid.eq(automation_guid))
            .filter(automation::Column::IsDeleted.eq(false))
            .exec(db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct CreateAutomationRecord {
    pub guid: String,
    pub display_name: String,
    pub agent_id: String,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub schedule_enabled: bool,
    pub schedule_kind: Option<String>,
    pub schedule_expr: Option<String>,
    pub schedule_timezone: String,
    pub next_run_at: Option<NaiveDateTime>,
    pub trigger_kind: String,
    pub trigger_enabled: bool,
    pub trigger_status: String,
    pub trigger_config_json: Option<String>,
    pub instructions_path: String,
    pub artifact_root: String,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateAutomationRecord {
    pub display_name: Option<String>,
    pub agent_id: Option<String>,
    pub target_kind: Option<String>,
    pub project_guid: Option<Option<String>>,
    pub workspace_guid: Option<Option<String>>,
    pub schedule_enabled: Option<bool>,
    pub schedule_kind: Option<Option<String>>,
    pub schedule_expr: Option<Option<String>>,
    pub schedule_timezone: Option<String>,
    pub next_run_at: Option<Option<NaiveDateTime>>,
    pub trigger_kind: Option<String>,
    pub trigger_enabled: Option<bool>,
    pub trigger_status: Option<String>,
    pub trigger_config_json: Option<Option<String>>,
}

#[derive(Debug, Clone)]
pub struct CreateAutomationRunRecord {
    pub guid: String,
    pub automation_guid: String,
    pub trigger_kind: String,
    pub trigger_source_json: Option<String>,
    pub status: String,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub created_workspace_guid: Option<String>,
    pub cwd: String,
    pub run_dir: String,
    pub prompt_path: String,
    pub output_path: String,
    pub result_path: String,
    pub run_json_path: String,
    pub tmux_session_name: Option<String>,
    pub tmux_window_name: Option<String>,
    pub tmux_window_index: Option<i32>,
    pub started_at: NaiveDateTime,
}

#[derive(Debug, Clone)]
pub struct ClaimGithubDeliveryRecord {
    pub delivery_id: String,
    pub route_id: String,
    pub automation_guid: String,
}

#[derive(Debug, Clone)]
pub enum GithubDeliveryClaimResult {
    Claimed(automation_github_delivery_claim::Model),
    AlreadyClaimed(automation_github_delivery_claim::Model),
}

#[derive(Debug, Clone)]
pub struct UpdateAutomationRunStatusRecord {
    pub status: String,
    pub completed_at: Option<NaiveDateTime>,
    pub exit_code: Option<i32>,
    pub failure_kind: Option<String>,
    pub error_message: Option<String>,
}

#[cfg(test)]
mod tests {
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    use crate::db::migration::Migrator;

    use super::*;

    async fn setup_db() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        Migrator::up(&db, None).await.unwrap();
        db
    }

    #[tokio::test]
    async fn github_delivery_claim_is_unique_by_delivery_and_route() {
        let db = setup_db().await;
        let repo = AutomationRepo::new(&db);

        let first = repo
            .claim_github_delivery(ClaimGithubDeliveryRecord {
                delivery_id: "delivery-1".to_string(),
                route_id: "route-1".to_string(),
                automation_guid: "automation-1".to_string(),
            })
            .await
            .unwrap();
        assert!(matches!(first, GithubDeliveryClaimResult::Claimed(_)));

        let duplicate = repo
            .claim_github_delivery(ClaimGithubDeliveryRecord {
                delivery_id: "delivery-1".to_string(),
                route_id: "route-1".to_string(),
                automation_guid: "automation-1".to_string(),
            })
            .await
            .unwrap();
        assert!(matches!(
            duplicate,
            GithubDeliveryClaimResult::AlreadyClaimed(_)
        ));
    }

    #[tokio::test]
    async fn github_delivery_claim_allows_same_delivery_different_route() {
        let db = setup_db().await;
        let repo = AutomationRepo::new(&db);

        for route_id in ["route-1", "route-2"] {
            let result = repo
                .claim_github_delivery(ClaimGithubDeliveryRecord {
                    delivery_id: "delivery-1".to_string(),
                    route_id: route_id.to_string(),
                    automation_guid: "automation-1".to_string(),
                })
                .await
                .unwrap();
            assert!(matches!(result, GithubDeliveryClaimResult::Claimed(_)));
        }
    }

    #[tokio::test]
    async fn github_delivery_claim_can_associate_run_or_release_unstarted_claim() {
        let db = setup_db().await;
        let repo = AutomationRepo::new(&db);

        repo.claim_github_delivery(ClaimGithubDeliveryRecord {
            delivery_id: "delivery-1".to_string(),
            route_id: "route-1".to_string(),
            automation_guid: "automation-1".to_string(),
        })
        .await
        .unwrap();
        repo.associate_github_delivery_run("delivery-1", "route-1", "run-1")
            .await
            .unwrap();

        let claim = repo
            .find_github_delivery_claim("delivery-1", "route-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(claim.run_guid.as_deref(), Some("run-1"));
        assert_eq!(claim.status, GITHUB_DELIVERY_ACCEPTED);

        repo.claim_github_delivery(ClaimGithubDeliveryRecord {
            delivery_id: "delivery-2".to_string(),
            route_id: "route-1".to_string(),
            automation_guid: "automation-1".to_string(),
        })
        .await
        .unwrap();
        repo.release_github_delivery_claim("delivery-2", "route-1")
            .await
            .unwrap();
        assert!(repo
            .find_github_delivery_claim("delivery-2", "route-1")
            .await
            .unwrap()
            .is_none());
    }
}
