//! Host CLI session list, read-only preview, and Chat/TUI resume.

mod cwd;
mod search;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use agent::{
    attach_grok_goal_child, attach_grok_workflow_agent, canonicalize_chat_provider_id,
    default_roster, is_grok_chrome_tool, looks_like_grok_goal_child, merge_grok_goal,
    merge_grok_workflow, source_byte_size, source_fingerprint, AgentEvent, AgentEventEnvelope,
    AgentProviderError, AgentToolStatus, GrokGoal, GrokWorkflow, HostId, HostSessionRef,
    SessionSource,
};
use chrono::{DateTime, Utc};
use infra::{
    HostSessionIndexQuery, HostSessionIndexRow, HostSessionRepo, HostSessionSortField,
    HostSessionSortOrder,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::error::{Result, ServiceError};
use crate::service::agent_chat::store::{
    agent_events_to_transcript, fold_agent_events, AgentChatStore,
};
use crate::service::agent_chat::types::{
    elapsed_ms, flatten_messages, AgentChatOrigin, CreateAgentChatRequest, FoldedMessage,
    FoldedTurn, MessagePart, TurnStatus,
};
use crate::service::project::ProjectService;
use crate::service::workspace::WorkspaceService;

use cwd::{
    ensure_absolute_host_cwd, match_host_session_cwd, path_for_candidate, HostSessionCwdCandidate,
    HostSessionCwdKind, HostSessionCwdTarget,
};

pub use search::HostSessionSearchHit;

/// Bump when list-count or FTS extract rules change so Refresh rebuilds bodies.
const HOST_SESSION_INDEX_REVISION: i32 = 1;

struct CachedSession {
    message_count: Option<u32>,
    byte_size: Option<u64>,
    source_mtime_ms: i64,
    source_size: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostSessionTag {
    AtmosChat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostSessionResumeSupport {
    Supported,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionListItem {
    pub key: String,
    pub provider_id: String,
    pub native_id: String,
    pub title: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: Option<u32>,
    pub byte_size: Option<u64>,
    pub model: Option<String>,
    pub tags: Vec<HostSessionTag>,
    pub atmos_chat_id: Option<String>,
    pub resume_chat: HostSessionResumeSupport,
    pub resume_tui: HostSessionResumeSupport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_native_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HostSessionListFilter {
    pub provider_id: Option<String>,
    pub project: Option<String>,
    pub query: Option<String>,
    pub sort_field: Option<String>,
    pub sort_order: Option<String>,
    pub updated_after: Option<String>,
    pub updated_before: Option<String>,
    pub limit: Option<u32>,
    pub offset: u32,
    pub sync: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostSessionSearchStatus {
    Indexing,
    Ready,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionSearchProgress {
    pub indexed: u32,
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionListResult {
    pub sessions: Vec<HostSessionListItem>,
    pub total: u32,
    pub scanned_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hits: Vec<HostSessionSearchHit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_status: Option<HostSessionSearchStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_progress: Option<HostSessionSearchProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionIndexUpdated {
    pub scanned_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_status: Option<HostSessionSearchStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_progress: Option<HostSessionSearchProgress>,
}

const SEARCH_PROGRESS_EMIT_EVERY: Duration = Duration::from_millis(200);

fn emit_index_update(
    tx: &broadcast::Sender<HostSessionIndexUpdated>,
    search_status: Option<HostSessionSearchStatus>,
    search_progress: Option<HostSessionSearchProgress>,
) {
    let _ = tx.send(HostSessionIndexUpdated {
        scanned_at: Utc::now(),
        search_status,
        search_progress,
    });
}

fn report_search_progress(
    snapshot: &StdMutex<Option<HostSessionSearchProgress>>,
    tx: &broadcast::Sender<HostSessionIndexUpdated>,
    last_emit: &StdMutex<Option<Instant>>,
    indexed: u32,
    total: u32,
) {
    let progress = HostSessionSearchProgress { indexed, total };
    *lock_mutex(snapshot) = Some(progress);
    let mut last = lock_mutex(last_emit);
    let now = Instant::now();
    let due = last.is_none_or(|at| now.duration_since(at) >= SEARCH_PROGRESS_EMIT_EVERY)
        || indexed == 0
        || indexed >= total;
    if !due {
        return;
    }
    *last = Some(now);
    emit_index_update(tx, Some(HostSessionSearchStatus::Indexing), Some(progress));
}

fn lock_mutex<T>(mutex: &StdMutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionGetResult {
    pub session: HostSessionListItem,
    pub messages: Vec<FoldedMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grok_goal: Option<GrokGoal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grok_workflow: Option<GrokWorkflow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionResumeChatResult {
    pub chat_id: String,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSessionResumeTuiResult {
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub terminal_id: Option<String>,
    pub cwd: String,
    pub bin: String,
    pub args: Vec<String>,
}

pub struct HostSessionService {
    roster: Arc<Vec<Box<dyn SessionSource>>>,
    store: AgentChatStore,
    db: Arc<DatabaseConnection>,
    scan: tokio::sync::Mutex<()>,
    search_gate: Arc<tokio::sync::Mutex<()>>,
    search_running: Arc<AtomicBool>,
    search_progress: Arc<StdMutex<Option<HostSessionSearchProgress>>>,
    index_tx: broadcast::Sender<HostSessionIndexUpdated>,
    project_service: Option<Arc<ProjectService>>,
    workspace_service: Option<Arc<WorkspaceService>>,
}

impl HostSessionService {
    pub fn new(
        roster: Vec<Box<dyn SessionSource>>,
        store: AgentChatStore,
        db: Arc<DatabaseConnection>,
    ) -> Self {
        let (index_tx, _) = broadcast::channel(64);
        Self {
            roster: Arc::new(roster),
            store,
            db,
            scan: tokio::sync::Mutex::new(()),
            search_gate: Arc::new(tokio::sync::Mutex::new(())),
            search_running: Arc::new(AtomicBool::new(false)),
            search_progress: Arc::new(StdMutex::new(None)),
            index_tx,
            project_service: None,
            workspace_service: None,
        }
    }

    pub fn with_defaults(store: AgentChatStore, db: Arc<DatabaseConnection>) -> Self {
        Self::new(default_roster(), store, db)
    }

    pub fn with_workspace_lookup(
        mut self,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
    ) -> Self {
        self.project_service = Some(project_service);
        self.workspace_service = Some(workspace_service);
        self
    }

    fn repo(&self) -> HostSessionRepo<'_> {
        HostSessionRepo::new(self.db.as_ref())
    }

    pub async fn list(&self, filter: HostSessionListFilter) -> Result<HostSessionListResult> {
        let rewritten = self.ensure_index(filter.sync).await?;
        if let Err(error) = self.prepare_search_index().await {
            tracing::warn!(error = %error, "host session search prepare failed");
        }
        if rewritten {
            emit_index_update(&self.index_tx, None, None);
        }
        let chats = self.chat_handle_index();
        let needle = filter
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let mut query = index_query(&filter);
        let mut hits = Vec::new();
        if let Some(needle) = needle {
            query.query = None;
            match self.repo().search_text(needle).await {
                Ok(matches) if !matches.is_empty() => {
                    let (keys, primary) = search::primary_hits(&matches, needle);
                    query.session_keys = Some(keys);
                    hits = primary;
                }
                _ => {
                    query.query = Some(needle.to_string());
                }
            }
        }
        let page = self.repo().query(&query).await?;
        let scanned_at = self.repo().last_synced_at().await?.unwrap_or_else(Utc::now);
        let hit_by_root: HashMap<String, HostSessionSearchHit> = hits
            .into_iter()
            .map(|hit| (hit.root_session_key.clone(), hit))
            .collect();
        let sessions: Vec<HostSessionListItem> = page
            .sessions
            .into_iter()
            .map(|row| self.item_from_row(index_row_to_ref(row), &chats))
            .collect();
        let hits = sessions
            .iter()
            .filter_map(|session| hit_by_root.get(&session.key).cloned())
            .collect();
        let search_progress = self.current_search_progress().await?;
        let search_status = if search_progress.is_some() {
            HostSessionSearchStatus::Indexing
        } else {
            HostSessionSearchStatus::Ready
        };
        self.kick_search_catchup();
        Ok(HostSessionListResult {
            sessions,
            total: page.total,
            scanned_at,
            hits,
            search_status: Some(search_status),
            search_progress,
        })
    }

    pub fn subscribe_index_updates(&self) -> broadcast::Receiver<HostSessionIndexUpdated> {
        self.index_tx.subscribe()
    }

    pub async fn search_catchup(&self) -> Result<bool> {
        let _gate = self.search_gate.lock().await;
        self.run_search_catchup_locked().await
    }

    async fn current_search_progress(&self) -> Result<Option<HostSessionSearchProgress>> {
        if let Some(progress) = *lock_mutex(&self.search_progress) {
            return Ok(Some(progress));
        }
        let (indexed, total) = self.repo().search_body_counts().await?;
        if total == 0 || indexed >= total {
            return Ok(None);
        }
        Ok(Some(HostSessionSearchProgress { indexed, total }))
    }

    async fn run_search_catchup_locked(&self) -> Result<bool> {
        let snapshot = Arc::clone(&self.search_progress);
        let tx = self.index_tx.clone();
        let last_emit = StdMutex::new(None);
        let result =
            search::run_search_catchup(&self.repo(), Arc::clone(&self.roster), |indexed, total| {
                report_search_progress(&snapshot, &tx, &last_emit, indexed, total);
            })
            .await;
        *lock_mutex(&self.search_progress) = None;
        if matches!(result, Ok(true)) {
            emit_index_update(&tx, Some(HostSessionSearchStatus::Ready), None);
        }
        result
    }

    pub async fn get(&self, key: &str) -> Result<HostSessionGetResult> {
        let (source, row) = self.resolve_row(key).await?;
        let envelopes = source
            .parse_at(&row.native_id, row.source_path_buf().as_deref())
            .map_err(map_agent_err)?;
        let messages = flatten_host_preview(&envelopes, row.updated_at);
        let (grok_goal, grok_workflow) = fold_host_grok_chrome(&envelopes);
        let grok_goal = fill_goal_elapsed(grok_goal, &messages);
        let chats = self.chat_handle_index();
        Ok(HostSessionGetResult {
            session: self.item_from_row(row, &chats),
            messages,
            grok_goal,
            grok_workflow,
        })
    }

    pub async fn resume_chat(&self, key: &str) -> Result<HostSessionResumeChatResult> {
        let (provider_id, _) = parse_session_key(key)?;
        if HostId::from_canonical(provider_id).is_none() {
            return Err(ServiceError::Validation(format!(
                "unsupported host session {key}"
            )));
        }
        let (source, row) = self.resolve_row(key).await?;
        let chats = self.chat_handle_index();
        let join_id = join_provider_id(&row.provider_id);
        if let Some(chat_id) = chats.get(&(join_id, row.native_id.clone())) {
            return Ok(HostSessionResumeChatResult {
                chat_id: chat_id.clone(),
                created: false,
            });
        }
        let envelopes = source
            .parse_at(&row.native_id, row.source_path_buf().as_deref())
            .map_err(map_agent_err)?;
        let provider_id = canonicalize_chat_provider_id(&row.provider_id).to_string();
        let title = {
            let trimmed = row.title.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        };
        let meta = self.store.create(CreateAgentChatRequest {
            workspace_id: None,
            project_id: None,
            space_id: None,
            cwd: row.cwd.clone(),
            origin: AgentChatOrigin::Imported,
            provider_id,
            model: row.model.clone(),
            thinking: None,
            mode: None,
            permission_mode: None,
            fast: None,
            context: None,
            title,
            source: Some(format!("host:{}:{}", row.provider_id, row.native_id)),
            automation_run_guid: None,
        })?;
        if meta.id == row.native_id {
            return Err(ServiceError::Processing(
                "chat id must not equal persistence handle".into(),
            ));
        }
        let (grok_goal, grok_workflow) = fold_host_grok_chrome(&envelopes);
        self.store.update_meta(&meta.id, |chat_meta| {
            chat_meta.persistence_handle = Some(row.native_id.clone());
            chat_meta.grok_goal = grok_goal;
            chat_meta.grok_workflow = grok_workflow;
        })?;
        for record in agent_events_to_transcript(&envelopes) {
            self.store.append_record(&meta.id, &record)?;
        }
        Ok(HostSessionResumeChatResult {
            chat_id: meta.id,
            created: true,
        })
    }

    pub async fn resume_tui(&self, key: &str) -> Result<HostSessionResumeTuiResult> {
        let (source, row) = self.resolve_row(key).await?;
        let plan = source
            .tui_resume(&row.native_id, Path::new(&row.cwd))
            .ok_or_else(|| {
                ServiceError::Validation(format!(
                    "TUI resume is unsupported for host session {key}"
                ))
            })?;
        which::which(&plan.bin)
            .map_err(|_| ServiceError::Processing(format!("CLI `{}` is not on PATH", plan.bin)))?;
        let cwd = plan.cwd.to_string_lossy().into_owned();
        let target = self.resolve_cwd_target(&cwd).await;
        Ok(HostSessionResumeTuiResult {
            workspace_id: target.workspace_id,
            project_id: target.project_id,
            terminal_id: Some(Uuid::new_v4().to_string()),
            cwd,
            bin: plan.bin,
            args: plan.args,
        })
    }

    async fn resolve_cwd_target(&self, cwd: &str) -> HostSessionCwdTarget {
        let (Some(project_service), Some(workspace_service)) =
            (&self.project_service, &self.workspace_service)
        else {
            return HostSessionCwdTarget::default();
        };
        let projects = match project_service.list_projects().await {
            Ok(projects) => projects,
            Err(error) => {
                tracing::warn!(%error, "host session cwd lookup failed to list projects");
                return HostSessionCwdTarget::default();
            }
        };
        let mut candidates = Vec::new();
        for project in projects {
            let workspaces = match workspace_service
                .list_all_by_project(project.guid.clone())
                .await
            {
                Ok(workspaces) => workspaces,
                Err(error) => {
                    tracing::warn!(
                        %error,
                        project_id = %project.guid,
                        "host session cwd lookup failed to list workspaces"
                    );
                    continue;
                }
            };
            for workspace in workspaces {
                if workspace.model.is_archived || workspace.model.is_deleted {
                    continue;
                }
                let path = path_for_candidate(&workspace.local_path);
                if path.is_empty() {
                    continue;
                }
                candidates.push(HostSessionCwdCandidate {
                    kind: HostSessionCwdKind::Workspace,
                    id: workspace.model.guid,
                    project_id: Some(workspace.model.project_guid),
                    path,
                });
            }
            let project_path = path_for_candidate(&project.main_file_path);
            if project_path.is_empty() {
                continue;
            }
            candidates.push(HostSessionCwdCandidate {
                kind: HostSessionCwdKind::Project,
                id: project.guid,
                project_id: None,
                path: project_path,
            });
        }
        match_host_session_cwd(cwd, &candidates)
    }

    async fn resolve_row(&self, key: &str) -> Result<(&dyn SessionSource, HostSessionRef)> {
        let (provider_id, native_id) = parse_session_key(key)?;
        let source = self
            .roster
            .iter()
            .find(|source| source.provider_id() == provider_id)
            .ok_or_else(|| ServiceError::NotFound(format!("host session {key}")))?;
        self.ensure_index(false).await?;
        if let Some(row) = self.repo().get(key).await? {
            if row.native_id == native_id {
                return Ok((source.as_ref(), index_row_to_ref(row)));
            }
        }
        Err(ServiceError::NotFound(format!("host session {key}")))
    }

    async fn ensure_index(&self, force: bool) -> Result<bool> {
        let _gate = self.scan.lock().await;
        if !force && self.repo().last_synced_at().await?.is_some() {
            return Ok(false);
        }
        let previous: HashMap<String, CachedSession> = self
            .repo()
            .list_all()
            .await?
            .into_iter()
            .map(|row| {
                (
                    row.session_key.clone(),
                    CachedSession {
                        message_count: row.message_count,
                        byte_size: row.byte_size,
                        source_mtime_ms: row.source_mtime_ms,
                        source_size: row.source_size,
                    },
                )
            })
            .collect();
        let stale_algo = self.repo().index_revision().await? != HOST_SESSION_INDEX_REVISION;
        let roster = Arc::clone(&self.roster);
        let listed =
            tokio::task::spawn_blocking(move || scan_host_sessions(&roster, previous, stale_algo))
                .await
                .map_err(|error| {
                    ServiceError::Processing(format!("host session scan join: {error}"))
                })?;
        let n = listed.len();
        self.repo()
            .sync_index(&listed, HOST_SESSION_INDEX_REVISION)
            .await?;
        if stale_algo {
            self.repo().invalidate_search_bodies().await?;
        }
        tracing::info!(sessions = n, stale_algo, "host session index sync");
        Ok(true)
    }

    async fn prepare_search_index(&self) -> Result<()> {
        self.repo().prune_search_orphans().await?;
        let sessions = self.repo().list_all().await?;
        self.repo().upsert_title_docs(&sessions).await?;
        Ok(())
    }

    fn kick_search_catchup(&self) {
        if self
            .search_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let db = Arc::clone(&self.db);
        let roster = Arc::clone(&self.roster);
        let running = Arc::clone(&self.search_running);
        let search_gate = Arc::clone(&self.search_gate);
        let snapshot = Arc::clone(&self.search_progress);
        let tx = self.index_tx.clone();
        tokio::spawn(async move {
            let result = {
                let _gate = search_gate.lock().await;
                let repo = HostSessionRepo::new(db.as_ref());
                let last_emit = StdMutex::new(None);
                search::run_search_catchup(&repo, roster, |indexed, total| {
                    report_search_progress(&snapshot, &tx, &last_emit, indexed, total);
                })
                .await
            };
            *lock_mutex(&snapshot) = None;
            running.store(false, Ordering::SeqCst);
            if matches!(result, Ok(true)) {
                emit_index_update(&tx, Some(HostSessionSearchStatus::Ready), None);
            }
        });
    }

    fn item_from_row(
        &self,
        row: HostSessionRef,
        chats: &HashMap<(String, String), String>,
    ) -> HostSessionListItem {
        let join_id = join_provider_id(&row.provider_id);
        let atmos_chat_id = chats.get(&(join_id, row.native_id.clone())).cloned();
        let mut tags = Vec::new();
        if atmos_chat_id.is_some() {
            tags.push(HostSessionTag::AtmosChat);
        }
        let resume = resume_support(&row.provider_id);
        HostSessionListItem {
            key: row.key,
            provider_id: row.provider_id,
            native_id: row.native_id,
            title: row.title,
            cwd: row.cwd,
            project_name: row.project_name,
            started_at: row.started_at,
            updated_at: row.updated_at,
            message_count: row.message_count,
            byte_size: row.byte_size,
            model: row.model,
            tags,
            atmos_chat_id,
            resume_chat: resume,
            resume_tui: resume,
            parent_native_id: row.parent_native_id.filter(|id| !id.trim().is_empty()),
        }
    }

    /// Read-only walk of chat metas. Must not call `AgentChatStore::list` (that writes `index.json`).
    fn chat_handle_index(&self) -> HashMap<(String, String), String> {
        let mut matches: HashMap<(String, String), (String, DateTime<Utc>)> = HashMap::new();
        let root = self.store.root();
        let Ok(entries) = fs::read_dir(root) else {
            return HashMap::new();
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let Ok(meta) = self.store.get_meta(id) else {
                continue;
            };
            if meta.deleted {
                continue;
            }
            let Some(handle) = meta
                .persistence_handle
                .filter(|value| !value.trim().is_empty())
            else {
                continue;
            };
            let key = (join_provider_id(&meta.provider_id), handle);
            let replace = matches
                .get(&key)
                .is_none_or(|(_, updated)| meta.updated_at > *updated);
            if replace {
                matches.insert(key, (meta.id, meta.updated_at));
            }
        }
        matches
            .into_iter()
            .map(|(key, (id, _))| (key, id))
            .collect()
    }
}

/// `grok-build` is not folded by canonicalize; still join grok host rows to those chats.
fn join_provider_id(provider_id: &str) -> String {
    let canonical = canonicalize_chat_provider_id(provider_id);
    if canonical == "grok-build" {
        "grok".to_string()
    } else {
        canonical.to_string()
    }
}

fn resume_support(provider_id: &str) -> HostSessionResumeSupport {
    if HostId::from_canonical(provider_id).is_some() {
        HostSessionResumeSupport::Supported
    } else {
        HostSessionResumeSupport::Unsupported
    }
}

fn parse_session_key(key: &str) -> Result<(&str, &str)> {
    let (provider_id, native_id) = key.split_once(':').ok_or_else(|| {
        ServiceError::Validation("host session key must be {provider_id}:{native_id}".into())
    })?;
    if provider_id.is_empty() || native_id.is_empty() {
        return Err(ServiceError::Validation(
            "host session key must be {provider_id}:{native_id}".into(),
        ));
    }
    Ok((provider_id, native_id))
}

fn scan_host_sessions(
    roster: &[Box<dyn SessionSource>],
    previous: HashMap<String, CachedSession>,
    stale_algo: bool,
) -> Vec<HostSessionIndexRow> {
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    for source in roster {
        for row in source.list() {
            if seen.insert(row.key.clone()) {
                let prev = previous.get(&row.key);
                rows.push(merge_listed_row(row, prev, stale_algo));
            }
        }
    }
    rows
}

fn merge_listed_row(
    row: HostSessionRef,
    prev: Option<&CachedSession>,
    stale_algo: bool,
) -> HostSessionIndexRow {
    let path = Path::new(row.source_path.trim());
    let (mtime, size) = source_fingerprint(path);
    let unchanged = !stale_algo
        && prev.is_some_and(|prev| prev.source_mtime_ms == mtime && prev.source_size == size);
    let mut message_count = row.message_count;
    let mut byte_size = row.byte_size;
    if unchanged {
        if let Some(prev) = prev {
            message_count = prev.message_count;
            if byte_size.is_none() {
                byte_size = prev.byte_size;
            }
        }
    } else if byte_size.is_none() {
        byte_size = source_byte_size(path);
    }
    HostSessionIndexRow {
        session_key: row.key,
        provider_id: row.provider_id,
        native_id: row.native_id,
        title: row.title,
        cwd: ensure_absolute_host_cwd(&row.cwd),
        project_name: row.project_name,
        started_at: row.started_at,
        last_active_at: row.updated_at,
        message_count,
        byte_size,
        model: row.model,
        source_path: row.source_path,
        parent_native_id: row.parent_native_id,
        source_mtime_ms: mtime,
        source_size: size,
    }
}

fn index_row_to_ref(row: HostSessionIndexRow) -> HostSessionRef {
    HostSessionRef {
        key: row.session_key,
        provider_id: row.provider_id,
        native_id: row.native_id,
        title: row.title,
        cwd: ensure_absolute_host_cwd(&row.cwd),
        project_name: row.project_name,
        started_at: row.started_at,
        updated_at: row.last_active_at,
        message_count: row.message_count,
        byte_size: row.byte_size,
        model: row.model,
        source_path: row.source_path,
        parent_native_id: row.parent_native_id,
    }
}

fn index_query(filter: &HostSessionListFilter) -> HostSessionIndexQuery {
    let provider_id = filter
        .provider_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(canonicalize_chat_provider_id)
        .map(ToOwned::to_owned);
    HostSessionIndexQuery {
        provider_id,
        project: filter.project.clone(),
        query: filter.query.clone(),
        sort_field: match filter.sort_field.as_deref() {
            Some("started_at") => HostSessionSortField::StartedAt,
            Some("byte_size") => HostSessionSortField::ByteSize,
            _ => HostSessionSortField::LastActiveAt,
        },
        sort_order: match filter.sort_order.as_deref() {
            Some("asc") => HostSessionSortOrder::Asc,
            _ => HostSessionSortOrder::Desc,
        },
        updated_after: parse_rfc3339(filter.updated_after.as_deref()),
        updated_before: parse_rfc3339(filter.updated_before.as_deref()),
        limit: filter.limit.unwrap_or(10_000),
        offset: filter.offset,
        roots_only: true,
        session_keys: None,
    }
}

fn parse_rfc3339(value: Option<&str>) -> Option<DateTime<Utc>> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn fold_host_grok_chrome(
    envelopes: &[AgentEventEnvelope],
) -> (Option<GrokGoal>, Option<GrokWorkflow>) {
    let mut grok_goal = None;
    let mut grok_workflow = None;
    for envelope in envelopes {
        match &envelope.payload {
            AgentEvent::GrokGoalUpdated { goal } => {
                grok_goal = match goal.clone() {
                    Some(next) => merge_grok_goal(grok_goal.take(), next),
                    None => None,
                };
            }
            AgentEvent::GrokWorkflowUpdated { workflow } => {
                grok_workflow = match workflow.clone() {
                    Some(next) => merge_grok_workflow(grok_workflow.take(), next),
                    None => None,
                };
            }
            AgentEvent::ToolCallStarted { tool_call }
            | AgentEvent::ToolCallUpdated { tool_call }
            | AgentEvent::ToolCallCompleted { tool_call }
            | AgentEvent::ToolCallFailed { tool_call, .. } => {
                if !is_grok_chrome_tool(tool_call) {
                    continue;
                }
                let prefer_goal = looks_like_grok_goal_child(tool_call) || grok_workflow.is_none();
                if prefer_goal {
                    if let Some(goal) = grok_goal.as_mut() {
                        attach_grok_goal_child(goal, tool_call);
                    }
                } else if let Some(workflow) = grok_workflow.as_mut() {
                    attach_grok_workflow_agent(workflow, tool_call);
                }
            }
            _ => {}
        }
    }
    (grok_goal, grok_workflow)
}

fn map_agent_err(err: AgentProviderError) -> ServiceError {
    match err {
        AgentProviderError::NotFound(msg) => ServiceError::NotFound(msg),
        other => ServiceError::Processing(other.to_string()),
    }
}

fn flatten_host_preview(
    envelopes: &[AgentEventEnvelope],
    last_reply_at: DateTime<Utc>,
) -> Vec<FoldedMessage> {
    let (messages, _, _) = flatten_messages(settle_host_session_turns(
        fold_agent_events(envelopes),
        Some(last_reply_at),
    ));
    messages
}

/// Disk transcripts never emit `TurnCompleted`, so fold leaves every turn `Running`.
/// Settle them so historic preview can collapse process chrome and stamp
/// user-prompt → last-reply duration instead of a live `now - now` 0s clock.
fn settle_host_session_turns(
    mut turns: Vec<FoldedTurn>,
    last_reply_at: Option<DateTime<Utc>>,
) -> Vec<FoldedTurn> {
    let now = Utc::now();
    let next_prompt_at: Vec<Option<DateTime<Utc>>> = turns
        .iter()
        .enumerate()
        .map(|(index, _)| {
            turns.get(index + 1).and_then(|turn| {
                turn.messages
                    .iter()
                    .find(|message| message.role == "user")
                    .map(|message| message.created_at)
            })
        })
        .collect();

    let last_index = turns.len().saturating_sub(1);
    for (index, turn) in turns.iter_mut().enumerate() {
        if matches!(
            turn.status,
            TurnStatus::Idle | TurnStatus::Running | TurnStatus::WaitingPermission
        ) {
            turn.status = TurnStatus::Completed;
        }
        complete_open_host_tools(turn);
        for message in &mut turn.messages {
            message.streaming = false;
        }
        let prompt_at = turn
            .messages
            .iter()
            .find(|message| message.role == "user")
            .map(|message| message.created_at)
            .unwrap_or(turn.created_at);
        let last_assistant_at = turn
            .messages
            .iter()
            .rev()
            .find(|message| message.role == "assistant")
            .map(|message| message.created_at);
        let mut end = historic_end(prompt_at, turn.completed_at.or(turn.last_event_at), now)
            .or_else(|| historic_end(prompt_at, last_assistant_at, now));
        if end.is_none_or(|end_at| end_at <= prompt_at) {
            if let Some(next) = historic_end(prompt_at, next_prompt_at[index], now) {
                if next > prompt_at {
                    end = Some(next);
                }
            }
        }
        if index == last_index && end.is_none_or(|end_at| end_at <= prompt_at) {
            if let Some(reply) = historic_end(prompt_at, last_reply_at, now) {
                if reply > prompt_at {
                    end = Some(reply);
                }
            }
        }
        turn.completed_at = end.or(Some(prompt_at));
        if turn.worked_ms.is_none() {
            if let Some(end_at) = turn.completed_at {
                let ms = elapsed_ms(prompt_at, end_at);
                if ms > 0 {
                    turn.worked_ms = Some(ms);
                }
            }
        }
    }
    turns
}

/// `fold_agent_events` fills missing envelope times with `Utc::now()`, so the
/// last historic turn can look like it ran until preview time. Drop that.
fn historic_end(
    prompt_at: DateTime<Utc>,
    end: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    let end_at = end?;
    if elapsed_ms(end_at, now) < 5_000 && elapsed_ms(prompt_at, now) > 60_000 {
        return None;
    }
    Some(end_at)
}

fn complete_open_host_tools(turn: &mut FoldedTurn) {
    for message in &mut turn.messages {
        for part in &mut message.parts {
            if let MessagePart::ToolCall { status, .. } = part {
                if matches!(*status, AgentToolStatus::Running | AgentToolStatus::Pending) {
                    *status = AgentToolStatus::Completed;
                }
            }
        }
    }
}

fn fill_goal_elapsed(goal: Option<GrokGoal>, messages: &[FoldedMessage]) -> Option<GrokGoal> {
    let mut goal = goal?;
    if goal.elapsed_ms == 0 {
        if let Some(ms) = prompt_complete_ms(messages) {
            goal.elapsed_ms = ms;
        }
    }
    Some(goal)
}

fn prompt_complete_ms(messages: &[FoldedMessage]) -> Option<u64> {
    let start = messages
        .iter()
        .find(|message| message.role == "user")
        .map(|message| message.created_at)?;
    let end = messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .and_then(|message| message.completed_at.or(Some(message.created_at)))?;
    let ms = elapsed_ms(start, end);
    (ms > 0).then_some(ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeSet, HashMap};
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, MutexGuard};

    use crate::service::agent_chat::types::{
        flatten_messages, AgentChatMeta, FoldedTurn, MessagePart, TurnStatus,
    };

    use agent::{
        AgentTool, AgentToolKind, AgentToolParams, AgentToolStatus, GrokGoal, GrokWorkflow,
        GrokWorkflowPhase, TextKind, UserMessageKind, GROK_CHROME_SUBAGENT_NAME,
    };
    use chrono::TimeZone;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    async fn test_service(
        roster: Vec<Box<dyn SessionSource>>,
        store: AgentChatStore,
    ) -> HostSessionService {
        let db = Database::connect("sqlite::memory:")
            .await
            .expect("host session memory db");
        infra::Migrator::up(&db, None)
            .await
            .expect("host session migrate");
        HostSessionService::new(roster, store, Arc::new(db))
    }

    struct FakeSource {
        provider_id: &'static str,
        rows: Vec<HostSessionRef>,
        parsed: HashMap<String, Vec<AgentEventEnvelope>>,
        tui_bin: Option<&'static str>,
    }

    impl SessionSource for FakeSource {
        fn provider_id(&self) -> &'static str {
            self.provider_id
        }

        fn data_roots(&self) -> Vec<PathBuf> {
            Vec::new()
        }

        fn list(&self) -> Vec<HostSessionRef> {
            self.rows.clone()
        }

        fn parse(&self, native_id: &str) -> agent::AgentResult<Vec<AgentEventEnvelope>> {
            Ok(self.parsed.get(native_id).cloned().unwrap_or_default())
        }

        fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<agent::TuiResumePlan> {
            if let Some(bin) = self.tui_bin {
                return Some(agent::TuiResumePlan {
                    bin: bin.to_string(),
                    args: vec!["resume".to_string(), native_id.to_string()],
                    cwd: cwd.to_path_buf(),
                });
            }
            HostId::from_canonical(self.provider_id).map(|id| id.tui_resume(native_id, cwd))
        }
    }

    struct CountingSource {
        inner: FakeSource,
        lists: Arc<AtomicUsize>,
        parses: Arc<AtomicUsize>,
    }

    impl SessionSource for CountingSource {
        fn provider_id(&self) -> &'static str {
            self.inner.provider_id()
        }

        fn data_roots(&self) -> Vec<PathBuf> {
            self.inner.data_roots()
        }

        fn list(&self) -> Vec<HostSessionRef> {
            self.lists.fetch_add(1, Ordering::SeqCst);
            self.inner.list()
        }

        fn parse(&self, native_id: &str) -> agent::AgentResult<Vec<AgentEventEnvelope>> {
            self.parses.fetch_add(1, Ordering::SeqCst);
            self.inner.parse(native_id)
        }

        fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<agent::TuiResumePlan> {
            self.inner.tui_resume(native_id, cwd)
        }
    }

    struct LiveSource {
        provider_id: &'static str,
        rows: Arc<Mutex<Vec<HostSessionRef>>>,
        parsed: HashMap<String, Vec<AgentEventEnvelope>>,
    }

    impl SessionSource for LiveSource {
        fn provider_id(&self) -> &'static str {
            self.provider_id
        }

        fn data_roots(&self) -> Vec<PathBuf> {
            Vec::new()
        }

        fn list(&self) -> Vec<HostSessionRef> {
            self.rows.lock().expect("live source rows").clone()
        }

        fn parse(&self, native_id: &str) -> agent::AgentResult<Vec<AgentEventEnvelope>> {
            Ok(self.parsed.get(native_id).cloned().unwrap_or_default())
        }

        fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<agent::TuiResumePlan> {
            HostId::from_canonical(self.provider_id).map(|id| id.tui_resume(native_id, cwd))
        }
    }

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn row(
        provider: &str,
        native_id: &str,
        cwd: &str,
        project: &str,
        updated: i64,
    ) -> HostSessionRef {
        HostSessionRef {
            key: HostSessionRef::key_for(provider, native_id),
            provider_id: provider.to_string(),
            native_id: native_id.to_string(),
            title: format!("{provider} {native_id}"),
            cwd: cwd.to_string(),
            project_name: project.to_string(),
            started_at: ts(updated - 10),
            updated_at: ts(updated),
            message_count: Some(2),
            byte_size: None,
            model: Some("test-model".into()),
            source_path: format!("/tmp/{native_id}.jsonl"),
            parent_native_id: None,
        }
    }

    fn store() -> (tempfile::TempDir, AgentChatStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().join("chats"));
        (dir, store)
    }

    fn snapshot_tree(root: &Path) -> BTreeSet<String> {
        let mut out = BTreeSet::new();
        fn walk(base: &Path, dir: &Path, out: &mut BTreeSet<String>) {
            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let rel = path.strip_prefix(base).unwrap_or(&path);
                out.insert(rel.to_string_lossy().into_owned());
                if path.is_dir() {
                    walk(base, &path, out);
                }
            }
        }
        if root.exists() {
            walk(root, root, &mut out);
        }
        out
    }

    fn create_chat(store: &AgentChatStore, provider_id: &str, handle: &str) -> String {
        let meta = store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: "/tmp/proj".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: provider_id.into(),
                model: None,
                thinking: None,
                mode: None,
                permission_mode: None,
                fast: None,
                context: None,
                title: None,
                source: None,
                automation_run_guid: None,
            })
            .unwrap();
        store
            .update_meta(&meta.id, |row| {
                row.persistence_handle = Some(handle.to_string());
            })
            .unwrap();
        meta.id
    }

    fn preview_events() -> Vec<AgentEventEnvelope> {
        vec![
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::UserMessage {
                    turn_id: "turn-1".into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello from host".into(),
                    attachments: Vec::new(),
                },
            ),
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::TextChunk {
                    part_id: "a1".into(),
                    message_id: "a1".into(),
                    parent_part_id: None,
                    ordinal: 0,
                    kind: TextKind::Answer,
                    offset: 0,
                    text: "hi ".into(),
                },
            ),
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::TextChunk {
                    part_id: "a1".into(),
                    message_id: "a1".into(),
                    parent_part_id: None,
                    ordinal: 0,
                    kind: TextKind::Answer,
                    offset: 3,
                    text: "there".into(),
                },
            ),
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::PartClosed {
                    part_id: "a1".into(),
                    duration_ms: None,
                },
            ),
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::TextChunk {
                    part_id: "t1".into(),
                    message_id: "a1".into(),
                    parent_part_id: None,
                    ordinal: 1,
                    kind: TextKind::Thinking,
                    offset: 0,
                    text: "ponder".into(),
                },
            ),
            AgentEventEnvelope::new(
                Some("turn-1".into()),
                AgentEvent::PartClosed {
                    part_id: "t1".into(),
                    duration_ms: None,
                },
            ),
        ]
    }

    fn grok_chrome_events() -> Vec<AgentEventEnvelope> {
        let mut events = preview_events();
        events.push(AgentEventEnvelope::new(
            Some("turn-1".into()),
            AgentEvent::GrokGoalUpdated {
                goal: Some(GrokGoal {
                    goal_id: "g1".into(),
                    objective: "Ship it".into(),
                    status: "active".into(),
                    phase: "executing".into(),
                    planning: true,
                    verifying_completion: false,
                    last_event: Some("goal_created".into()),
                    tokens_used: 12,
                    elapsed_ms: 40,
                    children: Vec::new(),
                }),
            },
        ));
        events.push(AgentEventEnvelope::new(
            Some("turn-1".into()),
            AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "sa-plan".into(),
                    parent_tool_call_id: None,
                    name: GROK_CHROME_SUBAGENT_NAME.into(),
                    title: Some("goal plan writer".into()),
                    kind: AgentToolKind::Subagent,
                    status: AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "goal plan writer".into(),
                        agent_type: Some("general-purpose".into()),
                        task_id: Some("sa-plan".into()),
                        prompt: None,
                    },
                    result: None,
                },
            },
        ));
        events.push(AgentEventEnvelope::new(
            Some("turn-1".into()),
            AgentEvent::GrokWorkflowUpdated {
                workflow: Some(GrokWorkflow {
                    run_id: "wf-1".into(),
                    name: "deep-research".into(),
                    objective: "Compare DBs".into(),
                    status: "running".into(),
                    phases: vec![GrokWorkflowPhase {
                        id: "plan".into(),
                        title: "Plan".into(),
                        state: "completed".into(),
                    }],
                    agents: Vec::new(),
                }),
            },
        ));
        events
    }

    fn message_text(messages: &[FoldedMessage], role: &str) -> String {
        messages
            .iter()
            .filter(|message| message.role == role)
            .flat_map(|message| message.parts.iter())
            .filter_map(|part| match part {
                MessagePart::Text { text, .. } => Some(text.as_str()),
                MessagePart::Thinking { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    #[tokio::test]
    async fn empty_fake_lists_empty_sessions() {
        let (_empty_dir, empty_store) = store();
        let empty_roster = test_service(Vec::new(), empty_store).await;
        let listed = empty_roster
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert!(listed.sessions.is_empty());

        let (_fake_dir, fake_store) = store();
        let fake = FakeSource {
            provider_id: "claude",
            rows: Vec::new(),
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], fake_store).await;
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert!(listed.sessions.is_empty());
        assert_eq!(listed.total, 0);
    }

    #[tokio::test]
    async fn list_hides_child_sessions_but_get_still_resolves_them() {
        let (_dir, store) = store();
        let mut child = row("claude", "child", "/tmp/alpha", "alpha", 90);
        child.parent_native_id = Some("c1".into());
        let service = test_service(
            vec![Box::new(FakeSource {
                provider_id: "claude",
                rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100), child],
                parsed: HashMap::new(),
                tui_bin: None,
            })],
            store,
        )
        .await;
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(listed.sessions.len(), 1);
        assert_eq!(listed.sessions[0].key, "claude:c1");
        assert!(listed.sessions[0].parent_native_id.is_none());
        let preview = service.get("claude:child").await.unwrap();
        assert_eq!(preview.session.key, "claude:child");
        assert_eq!(preview.session.parent_native_id.as_deref(), Some("c1"));
    }

    #[tokio::test]
    async fn second_list_reads_index_without_rescan() {
        let (_dir, store) = store();
        let lists = Arc::new(AtomicUsize::new(0));
        let service = test_service(
            vec![Box::new(CountingSource {
                inner: FakeSource {
                    provider_id: "claude",
                    rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100)],
                    parsed: HashMap::new(),
                    tui_bin: None,
                },
                lists: lists.clone(),
                parses: Arc::new(AtomicUsize::new(0)),
            })],
            store,
        )
        .await;
        let first = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(first.sessions.len(), 1);
        assert_eq!(first.total, 1);
        assert_eq!(lists.load(Ordering::SeqCst), 1);

        let second = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(second.sessions[0].key, "claude:c1");
        assert_eq!(lists.load(Ordering::SeqCst), 1);

        let synced = service
            .list(HostSessionListFilter {
                sync: true,
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(synced.total, 1);
        assert_eq!(lists.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn refresh_reuses_cached_count_when_fingerprint_matches() {
        let (_dir, store) = store();
        let mut listed = row("claude", "c1", "/tmp/alpha", "alpha", 100);
        listed.message_count = Some(2);
        let mut parsed = HashMap::new();
        parsed.insert("c1".into(), preview_events());
        let rows = Arc::new(Mutex::new(vec![listed]));
        let service = test_service(
            vec![Box::new(LiveSource {
                provider_id: "claude",
                rows: rows.clone(),
                parsed,
            })],
            store,
        )
        .await;
        let first = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(first.sessions[0].message_count, Some(2));
        service.search_catchup().await.unwrap();

        {
            let mut rows = rows.lock().expect("live source rows");
            rows[0].message_count = Some(99);
            rows[0].title = "renamed".into();
        }
        let synced = service
            .list(HostSessionListFilter {
                sync: true,
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(synced.sessions[0].message_count, Some(2));
        assert_eq!(synced.sessions[0].title, "renamed");
    }

    #[tokio::test]
    async fn refresh_drops_sessions_missing_from_list() {
        let (_dir, store) = store();
        let rows = Arc::new(Mutex::new(vec![
            row("claude", "c1", "/tmp/alpha", "alpha", 100),
            row("claude", "c2", "/tmp/beta", "beta", 110),
        ]));
        let service = test_service(
            vec![Box::new(LiveSource {
                provider_id: "claude",
                rows: rows.clone(),
                parsed: HashMap::new(),
            })],
            store,
        )
        .await;
        let first = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(first.total, 2);
        rows.lock().expect("live source rows").pop();
        let synced = service
            .list(HostSessionListFilter {
                sync: true,
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(synced.total, 1);
        assert_eq!(synced.sessions[0].key, "claude:c1");
    }

    #[tokio::test]
    async fn catchup_stamps_visible_message_count() {
        let (_dir, store) = store();
        let mut listed = row("claude", "c1", "/tmp/alpha", "alpha", 100);
        listed.message_count = Some(99);
        let mut parsed = HashMap::new();
        parsed.insert("c1".into(), preview_events());
        let service = test_service(
            vec![Box::new(FakeSource {
                provider_id: "claude",
                rows: vec![listed],
                parsed,
                tui_bin: None,
            })],
            store,
        )
        .await;
        let first = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(first.sessions[0].message_count, Some(99));
        service.search_catchup().await.unwrap();
        let after = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(after.sessions[0].message_count, Some(2));
    }

    #[tokio::test]
    async fn list_without_query_does_not_wait_for_transcript_parse() {
        let (_dir, store) = store();
        let parses = Arc::new(AtomicUsize::new(0));
        let service = test_service(
            vec![Box::new(CountingSource {
                inner: FakeSource {
                    provider_id: "claude",
                    rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100)],
                    parsed: HashMap::new(),
                    tui_bin: None,
                },
                lists: Arc::new(AtomicUsize::new(0)),
                parses: parses.clone(),
            })],
            store,
        )
        .await;
        let started = std::time::Instant::now();
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(250));
        assert_eq!(listed.sessions[0].key, "claude:c1");
    }

    #[tokio::test]
    async fn search_matches_user_and_cjk_skips_thinking_and_jumps_child() {
        let (_dir, store) = store();
        let mut parsed = HashMap::new();
        parsed.insert("c1".into(), preview_events());
        let mut child_events = preview_events();
        child_events[0] = AgentEventEnvelope::new(
            Some("turn-1".into()),
            AgentEvent::UserMessage {
                turn_id: "turn-1".into(),
                message_id: "u-child".into(),
                kind: UserMessageKind::Normal,
                text: "nested UNIQUE_CHILD_PHRASE 你好世界".into(),
                attachments: Vec::new(),
            },
        );
        parsed.insert("child".into(), child_events);
        let mut child = row("claude", "child", "/tmp/alpha", "alpha", 90);
        child.parent_native_id = Some("c1".into());
        let service = test_service(
            vec![Box::new(FakeSource {
                provider_id: "claude",
                rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100), child],
                parsed,
                tui_bin: None,
            })],
            store,
        )
        .await;
        service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        service.search_catchup().await.unwrap();

        let by_user = service
            .list(HostSessionListFilter {
                query: Some("hello from host".into()),
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(by_user.sessions[0].key, "claude:c1");
        assert_eq!(by_user.hits[0].kind, "user");
        assert_eq!(by_user.hits[0].message_id.as_deref(), Some("u1"));
        assert_eq!(by_user.hits[0].seq, 0);
        assert!(by_user.hits[0].snippet.to_lowercase().contains("hello"));
        assert_eq!(by_user.search_status, Some(HostSessionSearchStatus::Ready));

        let thinking = service
            .list(HostSessionListFilter {
                query: Some("ponder".into()),
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert!(thinking.sessions.is_empty());
        assert!(thinking.hits.is_empty());

        let cjk = service
            .list(HostSessionListFilter {
                query: Some("你好".into()),
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(cjk.sessions[0].key, "claude:c1");
        assert_eq!(cjk.hits[0].session_key, "claude:child");
        assert_eq!(cjk.hits[0].root_session_key, "claude:c1");
        assert_eq!(cjk.hits[0].message_id.as_deref(), Some("u-child"));
    }

    #[tokio::test]
    async fn title_search_works_before_body_catchup() {
        let (_dir, store) = store();
        let service = test_service(
            vec![Box::new(FakeSource {
                provider_id: "claude",
                rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100)],
                parsed: HashMap::new(),
                tui_bin: None,
            })],
            store,
        )
        .await;
        let listed = service
            .list(HostSessionListFilter {
                query: Some("claude c1".into()),
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        assert_eq!(listed.sessions[0].key, "claude:c1");
        assert_eq!(listed.hits[0].kind, "title");
        assert_eq!(
            listed.search_status,
            Some(HostSessionSearchStatus::Indexing)
        );
        assert_eq!(
            listed.search_progress,
            Some(HostSessionSearchProgress {
                indexed: 0,
                total: 1
            })
        );
    }

    #[tokio::test]
    async fn catchup_emits_search_progress_then_ready() {
        let (_dir, store) = store();
        let mut parsed = HashMap::new();
        parsed.insert("c1".into(), preview_events());
        let service = test_service(
            vec![Box::new(FakeSource {
                provider_id: "claude",
                rows: vec![row("claude", "c1", "/tmp/alpha", "alpha", 100)],
                parsed,
                tui_bin: None,
            })],
            store,
        )
        .await;
        let mut rx = service.subscribe_index_updates();
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(
            listed.search_status,
            Some(HostSessionSearchStatus::Indexing)
        );
        assert_eq!(listed.search_progress.map(|item| item.total), Some(1));

        let mut saw_progress = false;
        let mut saw_ready = false;
        for _ in 0..16 {
            let Ok(Ok(event)) =
                tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await
            else {
                break;
            };
            if event.search_progress.is_some_and(|item| item.total > 0) {
                saw_progress = true;
            }
            if event.search_status == Some(HostSessionSearchStatus::Ready) {
                saw_ready = true;
                break;
            }
        }
        assert!(saw_progress);
        assert!(saw_ready);
        let ready = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(ready.search_status, Some(HostSessionSearchStatus::Ready));
        assert_eq!(ready.search_progress, None);
    }

    #[tokio::test]
    async fn filters_compose_and_omitting_restores_full_set() {
        let (_dir, store) = store();
        let claude = FakeSource {
            provider_id: "claude",
            rows: vec![
                row("claude", "c1", "/tmp/alpha", "alpha", 100),
                row("claude", "c2", "/tmp/beta", "beta", 110),
            ],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let codex = FakeSource {
            provider_id: "codex",
            rows: vec![
                row("codex", "x1", "/tmp/alpha", "alpha", 120),
                row("codex", "x2", "/tmp/gamma", "gamma", 130),
            ],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(claude), Box::new(codex)], store).await;

        let composed = service
            .list(HostSessionListFilter {
                provider_id: Some("codex".into()),
                project: Some("Alpha".into()),
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        let composed_keys: Vec<_> = composed
            .sessions
            .iter()
            .map(|row| row.key.as_str())
            .collect();
        assert_eq!(composed_keys, ["codex:x1"]);

        let provider_only = service
            .list(HostSessionListFilter {
                provider_id: Some("codex".into()),
                project: None,
                ..HostSessionListFilter::default()
            })
            .await
            .unwrap();
        let mut provider_keys: Vec<_> = provider_only
            .sessions
            .iter()
            .map(|row| row.key.clone())
            .collect();
        provider_keys.sort();
        assert_eq!(provider_keys, ["codex:x1", "codex:x2"]);

        let full = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        let mut full_keys: Vec<_> = full.sessions.iter().map(|row| row.key.clone()).collect();
        full_keys.sort();
        assert_eq!(
            full_keys,
            ["claude:c1", "claude:c2", "codex:x1", "codex:x2"]
        );
        assert!(full
            .sessions
            .iter()
            .all(|row| row.resume_chat == HostSessionResumeSupport::Supported
                && row.resume_tui == HostSessionResumeSupport::Supported));
        assert_eq!(full.total, 4);
    }

    #[tokio::test]
    async fn get_folds_messages_and_does_not_write_chats() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let mut parsed = HashMap::new();
        parsed.insert("sess-1".into(), preview_events());
        let fake = FakeSource {
            provider_id: "claude",
            rows: vec![row("claude", "sess-1", "/tmp/proj", "proj", 50)],
            parsed,
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let preview = service.get("claude:sess-1").await.unwrap();
        assert!(!preview.messages.is_empty());
        assert!(message_text(&preview.messages, "user").contains("hello from host"));
        assert!(message_text(&preview.messages, "assistant").contains("hi there"));
        assert!(message_text(&preview.messages, "assistant").contains("ponder"));
        let after_first = snapshot_tree(&chats_root);
        assert_eq!(before, after_first);
        let _again = service.get("claude:sess-1").await.unwrap();
        let after_second = snapshot_tree(&chats_root);
        assert_eq!(before, after_second);
        assert!(!chats_root.exists() || snapshot_tree(&chats_root) == before);
        assert!(preview.grok_goal.is_none());
        assert!(preview.grok_workflow.is_none());
        let assistant = preview
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert!(!assistant.streaming);
        assert!(assistant.completed_at.is_some());
    }

    #[test]
    fn settle_host_session_turns_uses_prompt_to_last_event() {
        let start = chrono::DateTime::parse_from_rfc3339("2026-04-01T10:00:01Z")
            .unwrap()
            .with_timezone(&Utc);
        let end = chrono::DateTime::parse_from_rfc3339("2026-04-01T10:00:09Z")
            .unwrap()
            .with_timezone(&Utc);
        let turns = vec![FoldedTurn {
            id: "t1".into(),
            status: TurnStatus::Running,
            created_at: start,
            last_event_at: Some(end),
            messages: vec![
                FoldedMessage {
                    id: "u1".into(),
                    role: "user".into(),
                    created_at: start,
                    ..Default::default()
                },
                FoldedMessage {
                    id: "a1".into(),
                    role: "assistant".into(),
                    created_at: start,
                    parts: vec![
                        MessagePart::Thinking {
                            text: "plan".into(),
                            tool_call_id: None,
                            duration_ms: None,
                            parent_tool_call_id: None,
                        },
                        MessagePart::ToolCall {
                            tool_call_id: "read-1".into(),
                            parent_tool_call_id: None,
                            name: "Read".into(),
                            title: None,
                            kind: AgentToolKind::Read,
                            status: AgentToolStatus::Running,
                            params: AgentToolParams::Other {
                                value: serde_json::json!({}),
                            },
                            result: None,
                        },
                        MessagePart::Text {
                            text: "done".into(),
                            parent_tool_call_id: None,
                            message_id: None,
                        },
                    ],
                    ..Default::default()
                },
            ],
            ..Default::default()
        }];
        let (messages, running, _) =
            flatten_messages(super::settle_host_session_turns(turns, None));
        assert!(running.is_none());
        let assistant = messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert!(!assistant.streaming);
        assert_eq!(assistant.worked_ms, Some(8_000));
        assert_eq!(assistant.completed_at, Some(end));
        assert!(assistant.parts.iter().any(|part| matches!(
            part,
            MessagePart::ToolCall {
                status: AgentToolStatus::Completed,
                ..
            }
        )));
    }

    #[test]
    fn settle_host_session_turns_falls_back_to_next_prompt_when_stamps_match() {
        let first = chrono::DateTime::parse_from_rfc3339("2026-04-01T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let second = chrono::DateTime::parse_from_rfc3339("2026-04-01T10:00:40Z")
            .unwrap()
            .with_timezone(&Utc);
        let turns = vec![
            FoldedTurn {
                id: "t1".into(),
                status: TurnStatus::Running,
                created_at: first,
                last_event_at: Some(first),
                messages: vec![
                    FoldedMessage {
                        id: "u1".into(),
                        role: "user".into(),
                        created_at: first,
                        ..Default::default()
                    },
                    FoldedMessage {
                        id: "a1".into(),
                        role: "assistant".into(),
                        created_at: first,
                        parts: vec![MessagePart::Text {
                            text: "one".into(),
                            parent_tool_call_id: None,
                            message_id: None,
                        }],
                        ..Default::default()
                    },
                ],
                ..Default::default()
            },
            FoldedTurn {
                id: "t2".into(),
                status: TurnStatus::Running,
                created_at: second,
                last_event_at: Some(second),
                messages: vec![FoldedMessage {
                    id: "u2".into(),
                    role: "user".into(),
                    created_at: second,
                    ..Default::default()
                }],
                ..Default::default()
            },
        ];
        let (messages, _, _) = flatten_messages(super::settle_host_session_turns(turns, None));
        let assistant = messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert_eq!(assistant.worked_ms, Some(40_000));
        assert_eq!(assistant.completed_at, Some(second));
    }

    #[test]
    fn settle_host_session_turns_drops_fold_now_as_last_reply() {
        let start = chrono::DateTime::parse_from_rfc3339("2026-04-01T10:00:01Z")
            .unwrap()
            .with_timezone(&Utc);
        let now = Utc::now();
        let reply = start + chrono::Duration::seconds(8);
        let turns = vec![FoldedTurn {
            id: "t1".into(),
            status: TurnStatus::Running,
            created_at: start,
            last_event_at: Some(now),
            messages: vec![
                FoldedMessage {
                    id: "u1".into(),
                    role: "user".into(),
                    created_at: start,
                    ..Default::default()
                },
                FoldedMessage {
                    id: "a1".into(),
                    role: "assistant".into(),
                    created_at: now,
                    parts: vec![
                        MessagePart::Thinking {
                            text: "plan".into(),
                            tool_call_id: None,
                            duration_ms: None,
                            parent_tool_call_id: None,
                        },
                        MessagePart::Text {
                            text: "done".into(),
                            parent_tool_call_id: None,
                            message_id: None,
                        },
                    ],
                    ..Default::default()
                },
            ],
            ..Default::default()
        }];
        let (messages, _, _) =
            flatten_messages(super::settle_host_session_turns(turns, Some(reply)));
        let assistant = messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert!(!assistant.streaming);
        assert_eq!(assistant.completed_at, Some(reply));
        assert_eq!(assistant.worked_ms, Some(8_000));
    }

    #[tokio::test]
    async fn get_folds_grok_goal_and_deep_research_without_writing() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let mut parsed = HashMap::new();
        parsed.insert("g1".into(), grok_chrome_events());
        let fake = FakeSource {
            provider_id: "grok",
            rows: vec![row("grok", "g1", "/tmp/proj", "proj", 50)],
            parsed,
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let preview = service.get("grok:g1").await.unwrap();
        let goal = preview.grok_goal.expect("grok_goal");
        assert_eq!(goal.objective, "Ship it");
        assert_eq!(goal.children.len(), 1);
        assert_eq!(goal.children[0].id, "sa-plan");
        let workflow = preview.grok_workflow.expect("grok_workflow");
        assert_eq!(workflow.name, "deep-research");
        assert_eq!(snapshot_tree(&chats_root), before);
    }

    #[tokio::test]
    async fn matching_chat_meta_tags_atmos_chat() {
        let (_dir, store) = store();
        let chat_id = create_chat(&store, "codex", "abc");
        let fake = FakeSource {
            provider_id: "codex",
            rows: vec![row("codex", "abc", "/tmp/proj", "proj", 80)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(listed.sessions.len(), 1);
        assert_eq!(listed.sessions[0].tags, [HostSessionTag::AtmosChat]);
        assert_eq!(
            listed.sessions[0].atmos_chat_id.as_deref(),
            Some(chat_id.as_str())
        );
    }

    #[tokio::test]
    async fn grok_host_matches_grok_build_chat() {
        let (_dir, store) = store();
        let chat_id = create_chat(&store, "grok-build", "g1");
        let fake = FakeSource {
            provider_id: "grok",
            rows: vec![row("grok", "g1", "/tmp/proj", "proj", 90)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(listed.sessions[0].tags, [HostSessionTag::AtmosChat]);
        assert_eq!(
            listed.sessions[0].atmos_chat_id.as_deref(),
            Some(chat_id.as_str())
        );
    }

    #[tokio::test]
    async fn unmatched_host_has_empty_tags() {
        let (_dir, store) = store();
        let _ = create_chat(&store, "codex", "other");
        let fake = FakeSource {
            provider_id: "codex",
            rows: vec![row("codex", "abc", "/tmp/proj", "proj", 80)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert!(listed.sessions[0].tags.is_empty());
        assert!(listed.sessions[0].atmos_chat_id.is_none());
    }

    #[tokio::test]
    async fn resume_chat_reuses_tagged_chat() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let chat_id = create_chat(&store, "codex", "abc");
        let fake = FakeSource {
            provider_id: "codex",
            rows: vec![row("codex", "abc", "/tmp/proj", "proj", 80)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let result = service.resume_chat("codex:abc").await.unwrap();
        assert!(!result.created);
        assert_eq!(result.chat_id, chat_id);
        assert_eq!(snapshot_tree(&chats_root), before);
        let again = service.resume_chat("codex:abc").await.unwrap();
        assert!(!again.created);
        assert_eq!(again.chat_id, chat_id);
        assert_eq!(snapshot_tree(&chats_root), before);
    }

    #[tokio::test]
    async fn resume_chat_converts_untagged_once() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let mut parsed = HashMap::new();
        parsed.insert("sess-1".into(), preview_events());
        let fake = FakeSource {
            provider_id: "claude",
            rows: vec![row("claude", "sess-1", "/tmp/proj", "proj", 50)],
            parsed,
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let result = service.resume_chat("claude:sess-1").await.unwrap();
        assert!(result.created);
        assert_ne!(result.chat_id, "sess-1");
        assert!(uuid::Uuid::parse_str(&result.chat_id).is_ok());
        let meta_path = chats_root.join(&result.chat_id).join("meta.json");
        let jsonl_path = chats_root.join(&result.chat_id).join("transcript.jsonl");
        assert!(meta_path.exists());
        assert!(jsonl_path.exists());
        assert!(fs::metadata(&jsonl_path).unwrap().len() > 0);
        let meta: AgentChatMeta =
            serde_json::from_str(&fs::read_to_string(&meta_path).unwrap()).unwrap();
        assert_eq!(meta.origin, AgentChatOrigin::Imported);
        assert_eq!(meta.persistence_handle.as_deref(), Some("sess-1"));
        assert_ne!(meta.id, "sess-1");
        assert_eq!(meta.cwd, "/tmp/proj");
        assert_eq!(meta.provider_id, "claude");
        assert_eq!(meta.source.as_deref(), Some("host:claude:sess-1"));
        assert!(meta.grok_goal.is_none());
        assert!(meta.grok_workflow.is_none());
        assert!(snapshot_tree(&chats_root) != before);

        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .unwrap();
        assert_eq!(listed.sessions[0].tags, [HostSessionTag::AtmosChat]);
        assert_eq!(
            listed.sessions[0].atmos_chat_id.as_deref(),
            Some(result.chat_id.as_str())
        );

        let reused = service.resume_chat("claude:sess-1").await.unwrap();
        assert!(!reused.created);
        assert_eq!(reused.chat_id, result.chat_id);
    }

    #[tokio::test]
    async fn resume_chat_persists_grok_chrome_on_meta() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let mut parsed = HashMap::new();
        parsed.insert("g1".into(), grok_chrome_events());
        let fake = FakeSource {
            provider_id: "grok",
            rows: vec![row("grok", "g1", "/tmp/proj", "proj", 50)],
            parsed,
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let result = service.resume_chat("grok:g1").await.unwrap();
        assert!(result.created);
        let meta: AgentChatMeta = serde_json::from_str(
            &fs::read_to_string(chats_root.join(&result.chat_id).join("meta.json")).unwrap(),
        )
        .unwrap();
        let goal = meta.grok_goal.expect("imported grok_goal");
        assert_eq!(goal.objective, "Ship it");
        assert_eq!(goal.children[0].id, "sa-plan");
        let workflow = meta.grok_workflow.expect("imported grok_workflow");
        assert_eq!(workflow.name, "deep-research");
    }

    #[tokio::test]
    async fn resume_chat_unsupported_does_not_write() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let fake = FakeSource {
            provider_id: "claude",
            rows: vec![row("claude", "sess-1", "/tmp/proj", "proj", 50)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let err = service.resume_chat("gemini:abc").await.unwrap_err();
        assert!(matches!(err, ServiceError::Validation(_)));
        assert_eq!(snapshot_tree(&chats_root), before);
        assert!(!chats_root.exists() || snapshot_tree(&chats_root) == before);
    }

    #[tokio::test]
    async fn resume_tui_codex_plan_does_not_write_chats() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let fake = FakeSource {
            provider_id: "codex",
            rows: vec![row("codex", "roll-1", "/tmp/proj", "proj", 80)],
            parsed: HashMap::new(),
            tui_bin: None,
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let _stub = stub_bin_on_path("codex");
        let plan = service.resume_tui("codex:roll-1").await.unwrap();
        assert_eq!(plan.bin, "codex");
        assert_eq!(plan.args, ["resume", "roll-1"]);
        assert_eq!(plan.cwd, "/tmp/proj");
        assert!(plan.workspace_id.is_none());
        assert!(plan.project_id.is_none());
        assert!(plan.terminal_id.is_some());
        assert_eq!(snapshot_tree(&chats_root), before);
        let preview = service.get("codex:roll-1").await.unwrap();
        assert_eq!(preview.session.native_id, "roll-1");
        assert_eq!(snapshot_tree(&chats_root), before);
    }

    #[tokio::test]
    async fn resume_tui_missing_cli_errors() {
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let fake = FakeSource {
            provider_id: "codex",
            rows: vec![row("codex", "roll-1", "/tmp/proj", "proj", 80)],
            parsed: HashMap::new(),
            tui_bin: Some("atmos-host-session-missing-cli"),
        };
        let service = test_service(vec![Box::new(fake)], store).await;
        let before = snapshot_tree(&chats_root);
        let err = service.resume_tui("codex:roll-1").await.unwrap_err();
        let message = err.to_string();
        assert!(
            message.contains("CLI") && message.contains("atmos-host-session-missing-cli"),
            "{message}"
        );
        assert_eq!(snapshot_tree(&chats_root), before);
    }

    static PATH_LOCK: Mutex<()> = Mutex::new(());

    struct PathStub {
        _lock: MutexGuard<'static, ()>,
        _dir: tempfile::TempDir,
        old: OsString,
    }

    impl Drop for PathStub {
        fn drop(&mut self) {
            // Restored after the stub dir is still alive; Drop order is field order reverse.
            unsafe { std::env::set_var("PATH", &self.old) };
        }
    }

    fn stub_bin_on_path(name: &str) -> PathStub {
        let lock = PATH_LOCK.lock().expect("path lock");
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join(name);
        fs::write(&bin, b"#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let old = std::env::var_os("PATH").unwrap_or_default();
        let mut combined = dir.path().as_os_str().to_os_string();
        combined.push(":");
        combined.push(&old);
        unsafe { std::env::set_var("PATH", &combined) };
        PathStub {
            _lock: lock,
            _dir: dir,
            old,
        }
    }

    #[tokio::test]
    async fn live_default_homes_list_and_get_are_read_only() {
        if std::env::var("ATMOS_LIVE_HOST_SESSIONS").as_deref() != Ok("1") {
            eprintln!("skip: set ATMOS_LIVE_HOST_SESSIONS=1 to scan default CLI homes");
            return;
        }

        const PROVIDERS: [&str; 6] = ["claude", "codex", "opencode", "pi", "grok", "cursor"];
        let (_dir, store) = store();
        let chats_root = store.root().to_path_buf();
        let service = test_service(agent::default_roster(), store).await;
        let before = snapshot_tree(&chats_root);

        let listed = service
            .list(HostSessionListFilter::default())
            .await
            .expect("list default CLI homes");

        let mut counts = serde_json::Map::new();
        let mut sample_keys = serde_json::Map::new();
        for provider in PROVIDERS {
            let keys: Vec<&str> = listed
                .sessions
                .iter()
                .filter(|row| row.provider_id == provider)
                .map(|row| row.key.as_str())
                .collect();
            counts.insert(provider.to_string(), serde_json::json!(keys.len()));
            if let Some(key) = keys.first() {
                sample_keys.insert(provider.to_string(), serde_json::json!(key));
            }
        }

        let get = match listed.sessions.first() {
            Some(first) => {
                let preview = service
                    .get(&first.key)
                    .await
                    .expect("get first listed host session");
                serde_json::json!({
                    "key": first.key,
                    "message_count": preview.messages.len(),
                })
            }
            None => serde_json::Value::Null,
        };

        let after = snapshot_tree(&chats_root);
        assert_eq!(before, after, "list+get must not write chats dir files");

        println!(
            "{}",
            serde_json::json!({
                "total": listed.sessions.len(),
                "counts": counts,
                "sample_keys": sample_keys,
                "get": get,
            })
        );
    }
}
