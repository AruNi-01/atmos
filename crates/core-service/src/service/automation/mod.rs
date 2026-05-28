use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

mod agents;
mod artifacts;
mod events;
mod external_trigger;
mod github_trigger;
mod lifecycle;
mod run_watcher;
mod runner;
mod scheduler;
mod scheduler_service;
mod target;
mod terminal_agent_manifest;
mod validation;

use chrono::NaiveDateTime;
use infra::db::entities::{automation, automation_run};
use infra::db::repo::{AutomationRepo, CreateAutomationRecord, UpdateAutomationRecord};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::error::{Result, ServiceError};
use crate::WorkspaceAttachmentPayload;

use super::notification::NotificationService;
use super::project::ProjectService;
use super::terminal::TerminalService;
use super::workspace::WorkspaceService;

use agents::automation_agent_capabilities;
pub use agents::AutomationAgentCapability;
pub use events::{AutomationDefinitionChange, AutomationEvent};
pub use external_trigger::{
    ExternalTriggerOutcome, ExternalTriggerRejectReason, ExternalTriggerRejection,
};
pub use github_trigger::{
    GithubEventFamily, GithubTriggerConfig, GithubTriggerEvent, GithubTriggerFilters,
};
use run_watcher::{mark_run_interrupted, publish_run_update, watch_automation_run};
use validation::{parse_run_page_token, validate_display_name, validate_instructions};

const DEFAULT_SCHEDULE_PREVIEW_COUNT: usize = 5;
// Keep previews bounded; clients should request follow-up pages through run history, not schedule preview.
const MAX_SCHEDULE_PREVIEW_COUNT: usize = 25;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationTargetKind {
    Project,
    Workspace,
    NewWorkspace,
    Standalone,
}

impl AutomationTargetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Workspace => "workspace",
            Self::NewWorkspace => "new_workspace",
            Self::Standalone => "standalone",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationScheduleKind {
    Hourly,
    Daily,
    Weekly,
    Monthly,
    Cron,
}

impl AutomationScheduleKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Hourly => "hourly",
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Cron => "cron",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationRunStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

const START_FAILURE_KIND: &str = "start_failed";

impl AutomationRunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationTriggerKind {
    Manual,
    Scheduled,
    Github,
}

impl AutomationTriggerKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Scheduled => "scheduled",
            Self::Github => "github",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationTriggerStatus {
    Active,
    NeedsSetup,
    Paused,
    Error,
}

impl AutomationTriggerStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::NeedsSetup => "needs_setup",
            Self::Paused => "paused",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationTargetInput {
    pub target_kind: AutomationTargetKind,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub workspace_guid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationScheduleInput {
    pub kind: AutomationScheduleKind,
    #[serde(default)]
    pub expr: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub hour: Option<u32>,
    #[serde(default)]
    pub minute: Option<u32>,
    #[serde(default)]
    pub day_of_week: Option<u32>,
    #[serde(default)]
    pub day_of_month: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationTriggerInput {
    pub kind: AutomationTriggerKind,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub status: Option<AutomationTriggerStatus>,
    #[serde(default)]
    pub config: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutomationListReq {
    #[serde(default)]
    pub include_paused: bool,
    #[serde(default)]
    pub query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationGetReq {
    pub automation_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationCreateReq {
    pub display_name: String,
    pub instructions: String,
    pub agent_id: String,
    pub target: AutomationTargetInput,
    #[serde(default)]
    pub attachments: Vec<WorkspaceAttachmentPayload>,
    #[serde(default)]
    pub schedule: Option<AutomationScheduleInput>,
    #[serde(default)]
    pub trigger: Option<AutomationTriggerInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationUpdateReq {
    pub automation_guid: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub attachments: Vec<WorkspaceAttachmentPayload>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub target: Option<AutomationTargetInput>,
    #[serde(default)]
    pub schedule: Option<Option<AutomationScheduleInput>>,
    #[serde(default)]
    pub trigger: Option<Option<AutomationTriggerInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunNowReq {
    pub automation_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationDeleteReq {
    pub automation_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunGetReq {
    pub run_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunListReq {
    pub automation_guid: String,
    #[serde(default)]
    pub limit: Option<u64>,
    #[serde(default)]
    pub page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationCancelRunReq {
    pub run_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationArtifactGetReq {
    pub run_guid: String,
    pub artifact: AutomationArtifactKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationArtifactKind {
    Prompt,
    Output,
    Final,
    RunJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationSchedulePreviewReq {
    pub schedule: AutomationScheduleInput,
    pub timezone: String,
    #[serde(default)]
    pub count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationList {
    pub automations: Vec<AutomationSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunList {
    pub runs: Vec<AutomationRunSummary>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationDetail {
    #[serde(flatten)]
    pub summary: AutomationSummary,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationSummary {
    pub guid: String,
    pub display_name: String,
    pub agent_id: String,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub schedule_enabled: bool,
    pub schedule_paused: bool,
    pub schedule_kind: Option<String>,
    pub schedule_expr: Option<String>,
    pub schedule_timezone: String,
    pub next_run_at: Option<NaiveDateTime>,
    pub trigger_kind: String,
    pub trigger_enabled: bool,
    pub trigger_status: String,
    pub trigger_config_json: Option<String>,
    pub last_run_guid: Option<String>,
    pub last_status: Option<String>,
    pub run_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunDetail {
    #[serde(flatten)]
    pub summary: AutomationRunSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunSummary {
    pub guid: String,
    pub automation_guid: String,
    pub trigger_kind: String,
    pub trigger_source_json: Option<String>,
    pub status: String,
    pub failure_kind: Option<String>,
    pub error_message: Option<String>,
    pub target_kind: String,
    pub project_guid: Option<String>,
    pub workspace_guid: Option<String>,
    pub created_workspace_guid: Option<String>,
    pub run_dir: String,
    pub result_path: String,
    pub output_path: String,
    pub terminal_display_name: String,
    pub tmux_session_name: Option<String>,
    pub tmux_window_name: Option<String>,
    pub tmux_window_index: Option<i32>,
    pub started_at: NaiveDateTime,
    pub completed_at: Option<NaiveDateTime>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationArtifact {
    pub run_guid: String,
    pub artifact: AutomationArtifactKind,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulePreview {
    pub next_run_at: Option<NaiveDateTime>,
    pub occurrences: Vec<NaiveDateTime>,
    pub normalized_expr: String,
    pub timezone: String,
}

pub struct AutomationService {
    db: Arc<DatabaseConnection>,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    terminal_service: Arc<TerminalService>,
    notification_service: Arc<NotificationService>,
    event_tx: broadcast::Sender<AutomationEvent>,
    active_start_guids: Arc<Mutex<HashSet<String>>>,
}

impl AutomationService {
    pub fn new(
        db: Arc<DatabaseConnection>,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        terminal_service: Arc<TerminalService>,
        notification_service: Arc<NotificationService>,
    ) -> Self {
        let (event_tx, _) = broadcast::channel(128);
        Self {
            db,
            project_service,
            workspace_service,
            terminal_service,
            notification_service,
            event_tx,
            active_start_guids: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<AutomationEvent> {
        self.event_tx.subscribe()
    }

    pub async fn list_automations(&self, req: AutomationListReq) -> Result<AutomationList> {
        let repo = AutomationRepo::new(&self.db);
        let automations = repo
            .list_automations(req.include_paused, req.query.as_deref())
            .await?
            .into_iter()
            .map(AutomationSummary::from)
            .collect();
        Ok(AutomationList { automations })
    }

    pub async fn get_automation(&self, guid: &str) -> Result<AutomationDetail> {
        let repo = AutomationRepo::new(&self.db);
        let model = repo
            .find_automation_by_guid(guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Automation {guid} not found")))?;
        self.detail_from_model(model)
    }

    pub async fn create_automation(&self, req: AutomationCreateReq) -> Result<AutomationDetail> {
        let display_name = validate_display_name(req.display_name)?;
        self.validate_agent(&req.agent_id)?;
        self.validate_target(&req.target).await?;
        let normalized_schedule = req
            .schedule
            .as_ref()
            .map(|schedule| scheduler::normalize_schedule(schedule, chrono::Utc::now().naive_utc()))
            .transpose()?;
        let normalized_trigger =
            normalize_trigger_for_create(req.trigger, normalized_schedule.is_some())?;

        let automation_guid = Uuid::new_v4().to_string();
        let definition_dir = artifacts::definition_dir(&automation_guid)?;
        let attachment_paths = match artifacts::write_attachments(&automation_guid, req.attachments)
        {
            Ok(paths) => paths,
            Err(error) => {
                cleanup_failed_automation_create_artifacts(&definition_dir);
                return Err(error);
            }
        };
        let create_artifacts = (|| {
            let instructions = validate_instructions(resolve_attachment_placeholders(
                req.instructions,
                &attachment_paths,
            ))?;
            let instructions_path = artifacts::write_instructions(&automation_guid, &instructions)?;
            let artifact_root = artifacts::automation_root()?;
            Ok((instructions_path, artifact_root))
        })();
        let (instructions_path, artifact_root) = match create_artifacts {
            Ok(paths) => paths,
            Err(error) => {
                cleanup_failed_automation_create_artifacts(&definition_dir);
                return Err(error);
            }
        };

        let repo = AutomationRepo::new(&self.db);
        let model = match repo
            .create_automation(CreateAutomationRecord {
                guid: automation_guid.clone(),
                display_name,
                agent_id: req.agent_id,
                target_kind: req.target.target_kind.as_str().to_string(),
                project_guid: req.target.project_guid,
                workspace_guid: req.target.workspace_guid,
                schedule_enabled: normalized_schedule.is_some(),
                schedule_kind: normalized_schedule
                    .as_ref()
                    .map(|schedule| schedule.kind.as_str().to_string()),
                schedule_expr: normalized_schedule
                    .as_ref()
                    .map(|schedule| schedule.expr.clone()),
                schedule_timezone: normalized_schedule
                    .as_ref()
                    .map(|schedule| schedule.timezone.clone())
                    .unwrap_or_else(|| "UTC".to_string()),
                next_run_at: normalized_schedule.and_then(|schedule| schedule.next_run_at),
                trigger_kind: normalized_trigger.kind,
                trigger_enabled: normalized_trigger.enabled,
                trigger_status: normalized_trigger.status,
                trigger_config_json: normalized_trigger.config_json,
                instructions_path: instructions_path.to_string_lossy().to_string(),
                artifact_root: artifact_root.to_string_lossy().to_string(),
            })
            .await
        {
            Ok(model) => model,
            Err(error) => {
                cleanup_failed_automation_create_artifacts(&definition_dir);
                return Err(error.into());
            }
        };

        let detail = self.detail_from_model(model)?;
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: detail.summary.guid.clone(),
            change: AutomationDefinitionChange::Created,
            automation: Some(detail.summary.clone()),
        });
        Ok(detail)
    }

    pub async fn update_automation(&self, req: AutomationUpdateReq) -> Result<AutomationDetail> {
        let repo = AutomationRepo::new(&self.db);
        let existing = repo
            .find_automation_by_guid(&req.automation_guid)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Automation {} not found", req.automation_guid))
            })?;

        let display_name = req.display_name.map(validate_display_name).transpose()?;
        if let Some(agent_id) = req.agent_id.as_deref() {
            self.validate_agent(agent_id)?;
        }
        if let Some(target) = req.target.as_ref() {
            self.validate_target(target).await?;
        }

        let normalized_schedule = req
            .schedule
            .as_ref()
            .map(|schedule| {
                schedule
                    .as_ref()
                    .map(|inner| {
                        scheduler::normalize_schedule(inner, chrono::Utc::now().naive_utc())
                    })
                    .transpose()
            })
            .transpose()?
            .flatten();
        let normalized_trigger = normalize_trigger_for_update(
            req.trigger,
            req.schedule.as_ref().map(|schedule| schedule.is_some()),
            &existing,
        )?;
        let attachment_paths = artifacts::write_attachments(&req.automation_guid, req.attachments)?;
        let validated_instructions = match req
            .instructions
            .map(|instructions| {
                validate_instructions(resolve_attachment_placeholders(
                    instructions,
                    &attachment_paths,
                ))
            })
            .transpose()
        {
            Ok(instructions) => instructions,
            Err(error) => {
                artifacts::discard_written_attachments(&attachment_paths);
                return Err(error);
            }
        };

        let update = UpdateAutomationRecord {
            display_name,
            agent_id: req.agent_id,
            target_kind: req
                .target
                .as_ref()
                .map(|target| target.target_kind.as_str().to_string()),
            project_guid: req
                .target
                .as_ref()
                .map(|target| target.project_guid.clone()),
            workspace_guid: req
                .target
                .as_ref()
                .map(|target| target.workspace_guid.clone()),
            schedule_enabled: req.schedule.as_ref().map(|schedule| schedule.is_some()),
            schedule_kind: req.schedule.as_ref().map(|_| {
                normalized_schedule
                    .as_ref()
                    .map(|schedule| schedule.kind.as_str().to_string())
            }),
            schedule_expr: req.schedule.as_ref().map(|_| {
                normalized_schedule
                    .as_ref()
                    .map(|schedule| schedule.expr.clone())
            }),
            schedule_timezone: normalized_schedule
                .as_ref()
                .map(|schedule| schedule.timezone.clone()),
            next_run_at: req
                .schedule
                .as_ref()
                .map(|_| normalized_schedule.and_then(|schedule| schedule.next_run_at)),
            trigger_kind: normalized_trigger
                .as_ref()
                .map(|trigger| trigger.kind.clone()),
            trigger_enabled: normalized_trigger.as_ref().map(|trigger| trigger.enabled),
            trigger_status: normalized_trigger
                .as_ref()
                .map(|trigger| trigger.status.clone()),
            trigger_config_json: normalized_trigger.map(|trigger| trigger.config_json),
        };

        let staged_instructions = validated_instructions
            .as_deref()
            .map(|instructions| artifacts::stage_instructions(&existing.guid, instructions))
            .transpose();
        let staged_instructions = match staged_instructions {
            Ok(staged) => staged,
            Err(error) => {
                artifacts::discard_written_attachments(&attachment_paths);
                return Err(error);
            }
        };

        let model = match repo.update_automation(&req.automation_guid, update).await {
            Ok(model) => model,
            Err(error) => {
                if let Some(staged) = staged_instructions.as_ref() {
                    artifacts::discard_staged_instructions(staged);
                }
                artifacts::discard_written_attachments(&attachment_paths);
                return Err(error.into());
            }
        };
        if let Some(staged) = staged_instructions.as_ref() {
            if let Err(error) = artifacts::commit_staged_instructions(staged) {
                artifacts::discard_staged_instructions(staged);
                artifacts::discard_written_attachments(&attachment_paths);
                return Err(error);
            }
        }
        let detail = self.detail_from_model(model)?;
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: detail.summary.guid.clone(),
            change: AutomationDefinitionChange::Updated,
            automation: Some(detail.summary.clone()),
        });
        Ok(detail)
    }

    pub async fn delete_automation(&self, guid: &str) -> Result<()> {
        let repo = AutomationRepo::new(&self.db);
        repo.mark_github_trigger_needs_setup(guid).await?;
        repo.soft_delete_automation(guid).await?;
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: guid.to_string(),
            change: AutomationDefinitionChange::Deleted,
            automation: None,
        });
        Ok(())
    }

    pub async fn pause_schedule(&self, guid: &str) -> Result<AutomationDetail> {
        let repo = AutomationRepo::new(&self.db);
        let model = repo.set_schedule_paused(guid, true).await?;
        let detail = self.detail_from_model(model)?;
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: detail.summary.guid.clone(),
            change: AutomationDefinitionChange::Paused,
            automation: Some(detail.summary.clone()),
        });
        Ok(detail)
    }

    pub async fn resume_schedule(&self, guid: &str) -> Result<AutomationDetail> {
        let repo = AutomationRepo::new(&self.db);
        let model = repo.set_schedule_paused(guid, false).await?;
        let detail = self.detail_from_model(model)?;
        let _ = self.event_tx.send(AutomationEvent::DefinitionUpdated {
            automation_guid: detail.summary.guid.clone(),
            change: AutomationDefinitionChange::Resumed,
            automation: Some(detail.summary.clone()),
        });
        Ok(detail)
    }

    pub async fn list_runs(&self, req: AutomationRunListReq) -> Result<AutomationRunList> {
        let repo = AutomationRepo::new(&self.db);
        let limit = req.limit.unwrap_or(50).clamp(1, 100);
        let offset = parse_run_page_token(req.page_token.as_deref())?;
        let mut models = repo
            .list_runs(&req.automation_guid, limit + 1, offset)
            .await?;
        let next_page_token = if models.len() > limit as usize {
            models.truncate(limit as usize);
            Some((offset + limit).to_string())
        } else {
            None
        };
        let runs = models.into_iter().map(AutomationRunSummary::from).collect();
        Ok(AutomationRunList {
            runs,
            next_page_token,
        })
    }

    pub async fn get_run(&self, run_guid: &str) -> Result<AutomationRunDetail> {
        let repo = AutomationRepo::new(&self.db);
        let run = repo.find_run_by_guid(run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {run_guid} not found"))
        })?;
        Ok(AutomationRunDetail {
            summary: AutomationRunSummary::from(run),
        })
    }

    pub async fn read_artifact(&self, req: AutomationArtifactGetReq) -> Result<AutomationArtifact> {
        let repo = AutomationRepo::new(&self.db);
        let run = repo.find_run_by_guid(&req.run_guid).await?.ok_or_else(|| {
            ServiceError::NotFound(format!("Automation run {} not found", req.run_guid))
        })?;
        let path = match req.artifact {
            AutomationArtifactKind::Prompt => run.prompt_path,
            AutomationArtifactKind::Output => run.output_path,
            AutomationArtifactKind::Final => run.result_path,
            AutomationArtifactKind::RunJson => run.run_json_path,
        };
        let content = artifacts::read_artifact(&path)?;
        Ok(AutomationArtifact {
            run_guid: req.run_guid,
            artifact: req.artifact,
            path,
            content,
        })
    }

    pub async fn schedule_preview(
        &self,
        req: AutomationSchedulePreviewReq,
    ) -> Result<SchedulePreview> {
        let mut schedule = req.schedule;
        schedule.timezone = Some(req.timezone);
        let normalized = scheduler::normalize_schedule(&schedule, chrono::Utc::now().naive_utc())?;
        let count = req
            .count
            .unwrap_or(DEFAULT_SCHEDULE_PREVIEW_COUNT)
            .clamp(1, MAX_SCHEDULE_PREVIEW_COUNT);
        let occurrences = scheduler::preview_schedule(&schedule, count)?;
        Ok(SchedulePreview {
            next_run_at: normalized.next_run_at,
            occurrences,
            normalized_expr: normalized.expr,
            timezone: normalized.timezone,
        })
    }

    pub fn agent_capabilities(&self) -> Result<Vec<AutomationAgentCapability>> {
        automation_agent_capabilities()
    }

    fn detail_from_model(&self, model: automation::Model) -> Result<AutomationDetail> {
        let instructions = artifacts::read_instructions(&model.instructions_path)?;
        Ok(AutomationDetail {
            summary: AutomationSummary::from(model),
            instructions,
        })
    }
}

#[derive(Debug)]
struct NormalizedAutomationTrigger {
    kind: String,
    enabled: bool,
    status: String,
    config_json: Option<String>,
}

fn normalize_trigger_for_create(
    input: Option<AutomationTriggerInput>,
    has_schedule: bool,
) -> Result<NormalizedAutomationTrigger> {
    match input {
        Some(input) => normalize_trigger_input(input, has_schedule),
        None => Ok(default_trigger_for_schedule(has_schedule)),
    }
}

fn normalize_trigger_for_update(
    input: Option<Option<AutomationTriggerInput>>,
    schedule_enabled_update: Option<bool>,
    existing: &automation::Model,
) -> Result<Option<NormalizedAutomationTrigger>> {
    match input {
        Some(Some(input)) => {
            let has_schedule = schedule_enabled_update.unwrap_or(existing.schedule_enabled);
            normalize_trigger_input(input, has_schedule).map(Some)
        }
        Some(None) => {
            let has_schedule = schedule_enabled_update.unwrap_or(existing.schedule_enabled);
            Ok(Some(default_trigger_for_schedule(has_schedule)))
        }
        None => Ok(schedule_enabled_update.map(default_trigger_for_schedule)),
    }
}

fn default_trigger_for_schedule(has_schedule: bool) -> NormalizedAutomationTrigger {
    NormalizedAutomationTrigger {
        kind: if has_schedule {
            AutomationTriggerKind::Scheduled.as_str()
        } else {
            AutomationTriggerKind::Manual.as_str()
        }
        .to_string(),
        enabled: true,
        status: AutomationTriggerStatus::Active.as_str().to_string(),
        config_json: None,
    }
}

fn normalize_trigger_input(
    input: AutomationTriggerInput,
    has_schedule: bool,
) -> Result<NormalizedAutomationTrigger> {
    let enabled = input.enabled.unwrap_or(true);
    let status = normalize_trigger_status(&input.kind, enabled, input.status)
        .as_str()
        .to_string();
    let config_json = normalize_trigger_config(&input.kind, enabled, &status, input.config)?;

    match input.kind {
        AutomationTriggerKind::Manual if has_schedule => Err(ServiceError::Validation(
            "Manual trigger cannot be combined with a schedule.".to_string(),
        )),
        AutomationTriggerKind::Scheduled if !has_schedule => Err(ServiceError::Validation(
            "Scheduled trigger requires schedule configuration.".to_string(),
        )),
        kind => Ok(NormalizedAutomationTrigger {
            kind: kind.as_str().to_string(),
            enabled,
            status,
            config_json,
        }),
    }
}

fn normalize_trigger_status(
    kind: &AutomationTriggerKind,
    enabled: bool,
    requested: Option<AutomationTriggerStatus>,
) -> AutomationTriggerStatus {
    let status = requested.unwrap_or(AutomationTriggerStatus::Active);
    if matches!(kind, AutomationTriggerKind::Github)
        && !enabled
        && status == AutomationTriggerStatus::Active
    {
        return AutomationTriggerStatus::NeedsSetup;
    }
    status
}

fn normalize_trigger_config(
    kind: &AutomationTriggerKind,
    enabled: bool,
    status: &str,
    config: Option<Value>,
) -> Result<Option<String>> {
    match kind {
        AutomationTriggerKind::Github => {
            let Some(value) = config else {
                if enabled && status == AutomationTriggerStatus::Active.as_str() {
                    return Err(ServiceError::Validation(
                        "GitHub trigger config is required for active triggers.".to_string(),
                    ));
                }
                return Ok(None);
            };
            let config = GithubTriggerConfig::from_value(value)?;
            serde_json::to_string(&config).map(Some).map_err(|error| {
                ServiceError::Validation(format!("Failed to serialize trigger config: {error}"))
            })
        }
        AutomationTriggerKind::Manual | AutomationTriggerKind::Scheduled => {
            if config.is_some() {
                return Err(ServiceError::Validation(
                    "Trigger config is only supported for GitHub triggers.".to_string(),
                ));
            }
            Ok(None)
        }
    }
}

fn cleanup_failed_automation_create_artifacts(definition_dir: &Path) {
    if let Err(error) = std::fs::remove_dir_all(definition_dir) {
        if error.kind() != std::io::ErrorKind::NotFound {
            tracing::warn!(
                "Failed to clean up automation definition directory {} after create error: {}",
                definition_dir.display(),
                error
            );
        }
    }
}

fn resolve_attachment_placeholders(
    instructions: String,
    attachments: &[artifacts::WrittenAttachment],
) -> String {
    attachments
        .iter()
        .fold(instructions, |current, attachment| {
            if let Some(token) = attachment.placeholder_token.as_deref() {
                current.replace(token, &attachment.path.display().to_string())
            } else {
                current
            }
        })
}

impl From<automation::Model> for AutomationSummary {
    fn from(model: automation::Model) -> Self {
        Self {
            guid: model.guid,
            display_name: model.display_name,
            agent_id: model.agent_id,
            target_kind: model.target_kind,
            project_guid: model.project_guid,
            workspace_guid: model.workspace_guid,
            schedule_enabled: model.schedule_enabled,
            schedule_paused: model.schedule_paused,
            schedule_kind: model.schedule_kind,
            schedule_expr: model.schedule_expr,
            schedule_timezone: model.schedule_timezone,
            next_run_at: model.next_run_at,
            trigger_kind: model.trigger_kind,
            trigger_enabled: model.trigger_enabled,
            trigger_status: model.trigger_status,
            trigger_config_json: model.trigger_config_json,
            last_run_guid: model.last_run_guid,
            last_status: model.last_status,
            run_count: model.run_count,
        }
    }
}

impl From<automation_run::Model> for AutomationRunSummary {
    fn from(model: automation_run::Model) -> Self {
        Self {
            guid: model.guid,
            automation_guid: model.automation_guid,
            trigger_kind: model.trigger_kind,
            trigger_source_json: model.trigger_source_json,
            status: model.status,
            failure_kind: model.failure_kind,
            error_message: model.error_message,
            target_kind: model.target_kind,
            project_guid: model.project_guid,
            workspace_guid: model.workspace_guid,
            created_workspace_guid: model.created_workspace_guid,
            run_dir: model.run_dir,
            result_path: model.result_path,
            output_path: model.output_path,
            terminal_display_name: model.terminal_display_name,
            tmux_session_name: model.tmux_session_name,
            tmux_window_name: model.tmux_window_name,
            tmux_window_index: model.tmux_window_index,
            started_at: model.started_at,
            completed_at: model.completed_at,
            exit_code: model.exit_code,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn github_trigger_disabled_without_config_normalizes_to_needs_setup() {
        let trigger = normalize_trigger_input(
            AutomationTriggerInput {
                kind: AutomationTriggerKind::Github,
                enabled: Some(false),
                status: None,
                config: None,
            },
            false,
        )
        .unwrap();

        assert!(!trigger.enabled);
        assert_eq!(trigger.status, AutomationTriggerStatus::NeedsSetup.as_str());
        assert!(trigger.config_json.is_none());
    }

    #[test]
    fn github_trigger_active_without_config_is_rejected() {
        let error = normalize_trigger_input(
            AutomationTriggerInput {
                kind: AutomationTriggerKind::Github,
                enabled: Some(true),
                status: Some(AutomationTriggerStatus::Active),
                config: None,
            },
            false,
        )
        .unwrap_err();

        assert!(
            matches!(error, ServiceError::Validation(message) if message.contains("config is required"))
        );
    }

    #[test]
    fn github_trigger_disabled_active_with_config_normalizes_to_needs_setup() {
        let trigger = normalize_trigger_input(
            AutomationTriggerInput {
                kind: AutomationTriggerKind::Github,
                enabled: Some(false),
                status: Some(AutomationTriggerStatus::Active),
                config: Some(json!({
                    "route_id": "route-1",
                    "installation_id": 1,
                    "repository_full_name": "owner/repo",
                    "event_family": "pull_request",
                    "actions": ["opened"],
                    "filters": {}
                })),
            },
            false,
        )
        .unwrap();

        assert!(!trigger.enabled);
        assert_eq!(trigger.status, AutomationTriggerStatus::NeedsSetup.as_str());
        assert!(trigger.config_json.is_some());
    }

    #[test]
    fn resolves_written_attachment_tokens_to_paths() {
        let resolved = resolve_attachment_placeholders(
            "Inspect [#img-1] and keep [#img-2].".to_string(),
            &[artifacts::WrittenAttachment {
                placeholder_token: Some("[#img-1]".to_string()),
                path: PathBuf::from("/tmp/atmos/img-1.png"),
            }],
        );

        assert_eq!(resolved, "Inspect /tmp/atmos/img-1.png and keep [#img-2].");
    }
}
