use chrono::{NaiveDateTime, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::{automation, automation_run};
use crate::db::repo::base::BaseRepo;
use crate::error::{InfraError, Result};

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
            active.project_guid = Set(input.project_guid.flatten());
            active.workspace_guid = Set(input.workspace_guid.flatten());
        } else {
            if let Some(value) = input.project_guid {
                active.project_guid = Set(value);
            }
            if let Some(value) = input.workspace_guid {
                active.workspace_guid = Set(value);
            }
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

        let inserted = model.insert(self.db).await?;
        self.touch_automation_after_run_created(
            &inserted.automation_guid,
            &inserted.guid,
            &inserted.status,
        )
        .await?;
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

    pub async fn update_run_status(
        &self,
        guid: &str,
        input: UpdateAutomationRunStatusRecord,
    ) -> Result<automation_run::Model> {
        let run = self
            .find_run_by_guid(guid)
            .await?
            .ok_or_else(|| InfraError::Custom("Automation run not found".into()))?;
        let mut active: automation_run::ActiveModel = run.into();
        active.status = Set(input.status);
        active.updated_at = Set(Utc::now().naive_utc());
        active.completed_at = Set(input.completed_at);
        active.exit_code = Set(input.exit_code);
        active.failure_kind = Set(input.failure_kind);
        active.error_message = Set(input.error_message);

        let updated = active.update(self.db).await?;
        self.touch_automation_after_run_status(
            &updated.automation_guid,
            &updated.guid,
            &updated.status,
        )
        .await?;
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

    async fn touch_automation_after_run_created(
        &self,
        automation_guid: &str,
        run_guid: &str,
        status: &str,
    ) -> Result<()> {
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
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Automation not found".into()));
        }
        Ok(())
    }

    async fn touch_automation_after_run_status(
        &self,
        automation_guid: &str,
        run_guid: &str,
        status: &str,
    ) -> Result<()> {
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
            .exec(self.db)
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
}

#[derive(Debug, Clone)]
pub struct CreateAutomationRunRecord {
    pub guid: String,
    pub automation_guid: String,
    pub trigger_kind: String,
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
pub struct UpdateAutomationRunStatusRecord {
    pub status: String,
    pub completed_at: Option<NaiveDateTime>,
    pub exit_code: Option<i32>,
    pub failure_kind: Option<String>,
    pub error_message: Option<String>,
}
