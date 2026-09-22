//! Per-pane inbox snapshot. One object per session, merged from memory and the catalog.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use infra::db::repo::AgentSessionCatalogRow;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

use super::catalog::{CatalogBridge, SqliteAgentSessionCatalog};
use super::{
    parse_chat_status_session_id, resolve_workspace_agent_group_key, AgentAttentionLatch,
    AgentOccupancy, AgentStatusRecord, AgentStatusService, AgentSurface, AgentToolType,
    WorkspaceAgentGroupKey,
};
use crate::{Result, ServiceError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSessionStatusSnapshot {
    pub session_id: String,
    pub context_id: Option<String>,
    pub surface: AgentSurface,
    pub surface_id: Option<String>,
    pub tool: Option<AgentToolType>,
    pub group_key: WorkspaceAgentGroupKey,
    pub updated_at: String,
    pub project_path: Option<String>,
}

impl AgentStatusService {
    pub fn with_db(db: Arc<DatabaseConnection>) -> Self {
        Self::with_catalog(Arc::new(SqliteAgentSessionCatalog::new(db)))
    }

    pub(super) fn with_catalog(store: Arc<dyn super::catalog::AgentSessionCatalogStore>) -> Self {
        let mut service = Self::new();
        service.catalog = Some(CatalogBridge::new(store));
        service
    }

    pub async fn list_agent_session_statuses(&self) -> Result<Vec<AgentSessionStatusSnapshot>> {
        let (rows, archived_workspaces, archived_sessions) = if let Some(catalog) = &self.catalog {
            let rows = catalog
                .list_open()
                .await
                .map_err(ServiceError::Repository)?;
            let archived_workspaces = catalog
                .archived_workspace_ids()
                .await
                .map_err(ServiceError::Repository)?;
            let archived_sessions = catalog
                .archived_session_ids()
                .await
                .map_err(ServiceError::Repository)?;
            (rows, archived_workspaces, archived_sessions)
        } else {
            (Vec::new(), HashSet::new(), HashSet::new())
        };
        Ok(self.merge_agent_session_statuses(rows, &archived_workspaces, &archived_sessions))
    }

    pub async fn archive_agent_session(&self, session_id: &str) -> Result<()> {
        let Some(catalog) = &self.catalog else {
            return Ok(());
        };
        catalog
            .archive(session_id)
            .await
            .map_err(ServiceError::Repository)?;
        Ok(())
    }

    pub(super) fn sync_inbox_catalog(&self, session_id: &str) {
        if session_id.trim().is_empty() {
            return;
        }
        let Some(catalog) = &self.catalog else {
            return;
        };
        let Some((group_key, upsert)) = self.inbox_catalog_change(session_id) else {
            return;
        };
        let previous = {
            let mut last = self.inbox_buckets.write();
            let previous = last.get(session_id).copied();
            if previous == Some(group_key) {
                return;
            }
            last.insert(session_id.to_string(), group_key);
            previous
        };
        if catalog.enqueue_upsert(upsert).is_err() {
            let mut last = self.inbox_buckets.write();
            match previous {
                Some(bucket) => {
                    last.insert(session_id.to_string(), bucket);
                }
                None => {
                    last.remove(session_id);
                }
            }
        }
    }

    #[cfg(test)]
    pub(super) fn catalog_upsert_count(&self) -> u64 {
        self.catalog
            .as_ref()
            .map(CatalogBridge::upsert_count)
            .unwrap_or(0)
    }

    #[cfg(test)]
    pub(super) async fn flush_catalog(&self) {
        if let Some(catalog) = &self.catalog {
            catalog.flush().await;
        }
    }

    fn inbox_catalog_change(
        &self,
        session_id: &str,
    ) -> Option<(WorkspaceAgentGroupKey, AgentSessionCatalogRow)> {
        let session = self.sessions.read().get(session_id).cloned();
        let latch = {
            let attention = self.attention.read();
            attention.get(session_id).cloned().or_else(|| {
                session.as_ref().and_then(|row| {
                    row.pane_id
                        .as_ref()
                        .and_then(|pane| attention.get(pane).cloned())
                })
            })
        };
        let (state, reason) = match (&session, &latch) {
            (None, None) => return None,
            (Some(row), latch) => (row.state, latch.as_ref().map(|item| item.reason)),
            (None, Some(item)) => (AgentOccupancy::Idle, Some(item.reason)),
        };
        let group_key = resolve_workspace_agent_group_key(state, reason);
        let updated_at = session
            .as_ref()
            .map(|row| row.timestamp.clone())
            .or_else(|| latch.as_ref().map(|item| item.raised_at.clone()))?;
        let surface = session.as_ref().map(|row| row.surface).unwrap_or_else(|| {
            if parse_chat_status_session_id(session_id).is_some() {
                AgentSurface::Chat
            } else {
                AgentSurface::Terminal
            }
        });
        let context_id = none_if_empty(session.as_ref().and_then(|row| row.context_id.clone()))
            .or_else(|| {
                latch
                    .as_ref()
                    .and_then(|item| none_if_empty(Some(item.context_id.clone())))
            });
        let project_path = none_if_empty(session.as_ref().and_then(|row| row.project_path.clone()))
            .or_else(|| latch.as_ref().and_then(|item| item.project_path.clone()));
        let tool = session
            .as_ref()
            .map(|row| row.tool.to_string())
            .or_else(|| {
                latch
                    .as_ref()
                    .and_then(|item| item.tool.map(|tool| tool.to_string()))
            });
        Some((
            group_key,
            AgentSessionCatalogRow {
                session_id: session_id.to_string(),
                context_id,
                surface: surface.as_str().to_string(),
                tool,
                project_path,
                updated_at,
            },
        ))
    }

    fn merge_agent_session_statuses(
        &self,
        catalog: Vec<AgentSessionCatalogRow>,
        archived_workspaces: &HashSet<String>,
        archived_sessions: &HashSet<String>,
    ) -> Vec<AgentSessionStatusSnapshot> {
        let sessions: Vec<AgentStatusRecord> = self.sessions.read().values().cloned().collect();
        let latches: Vec<AgentAttentionLatch> = self.attention.read().values().cloned().collect();
        let mut latch_by_pane: HashMap<String, AgentAttentionLatch> = HashMap::new();
        for latch in latches {
            latch_by_pane.insert(latch.stable_pane_id.clone(), latch);
        }

        let mut live_ids: HashSet<String> = HashSet::new();
        for session in &sessions {
            live_ids.insert(session.session_id.clone());
            if let Some(pane) = session
                .pane_id
                .as_ref()
                .map(|pane| pane.trim())
                .filter(|pane| !pane.is_empty())
            {
                live_ids.insert(pane.to_string());
            }
        }

        let mut merged: HashMap<String, AgentSessionStatusSnapshot> = HashMap::new();
        for row in catalog {
            let context_id = none_if_empty(row.context_id.clone());
            if is_archived_context(&context_id, archived_workspaces) {
                continue;
            }
            let surface = parse_surface(&row.surface);
            merged.insert(
                row.session_id.clone(),
                AgentSessionStatusSnapshot {
                    session_id: row.session_id.clone(),
                    context_id,
                    surface,
                    surface_id: surface_id_for(&row.session_id, surface, None),
                    tool: row.tool.as_deref().and_then(parse_tool),
                    group_key: WorkspaceAgentGroupKey::Done,
                    updated_at: row.updated_at,
                    project_path: none_if_empty(row.project_path),
                },
            );
        }

        for session in &sessions {
            if archived_sessions.contains(&session.session_id) {
                merged.remove(&session.session_id);
                continue;
            }
            let latch = latch_for(session, &latch_by_pane);
            let previous = merged.get(&session.session_id).cloned();
            let context_id = none_if_empty(session.context_id.clone())
                .or_else(|| latch.and_then(|item| none_if_empty(Some(item.context_id.clone()))))
                .or_else(|| previous.as_ref().and_then(|row| row.context_id.clone()));
            if is_archived_context(&context_id, archived_workspaces) {
                merged.remove(&session.session_id);
                continue;
            }
            let surface = session.surface;
            let project_path = none_if_empty(session.project_path.clone())
                .or_else(|| latch.and_then(|item| item.project_path.clone()))
                .or_else(|| previous.as_ref().and_then(|row| row.project_path.clone()));
            let tool = Some(session.tool).or_else(|| latch.and_then(|item| item.tool));
            merged.insert(
                session.session_id.clone(),
                AgentSessionStatusSnapshot {
                    session_id: session.session_id.clone(),
                    context_id,
                    surface,
                    surface_id: surface_id_for(
                        &session.session_id,
                        surface,
                        session.surface_id.clone(),
                    ),
                    tool,
                    group_key: resolve_workspace_agent_group_key(
                        session.state,
                        latch.map(|item| item.reason),
                    ),
                    updated_at: session.timestamp.clone(),
                    project_path,
                },
            );
        }

        for latch in latch_by_pane.values() {
            if archived_sessions.contains(&latch.stable_pane_id)
                || live_ids.contains(&latch.stable_pane_id)
            {
                if archived_sessions.contains(&latch.stable_pane_id) {
                    merged.remove(&latch.stable_pane_id);
                }
                continue;
            }
            let context_id = none_if_empty(Some(latch.context_id.clone())).or_else(|| {
                merged
                    .get(&latch.stable_pane_id)
                    .and_then(|row| row.context_id.clone())
            });
            if is_archived_context(&context_id, archived_workspaces) {
                merged.remove(&latch.stable_pane_id);
                continue;
            }
            let previous = merged.get(&latch.stable_pane_id).cloned();
            let surface = previous.as_ref().map(|row| row.surface).unwrap_or_else(|| {
                if parse_chat_status_session_id(&latch.stable_pane_id).is_some() {
                    AgentSurface::Chat
                } else {
                    AgentSurface::Terminal
                }
            });
            let project_path = latch
                .project_path
                .clone()
                .or_else(|| previous.as_ref().and_then(|row| row.project_path.clone()));
            let tool = latch
                .tool
                .or_else(|| previous.as_ref().and_then(|row| row.tool));
            merged.insert(
                latch.stable_pane_id.clone(),
                AgentSessionStatusSnapshot {
                    session_id: latch.stable_pane_id.clone(),
                    context_id,
                    surface,
                    surface_id: surface_id_for(&latch.stable_pane_id, surface, None),
                    tool,
                    group_key: resolve_workspace_agent_group_key(
                        AgentOccupancy::Idle,
                        Some(latch.reason),
                    ),
                    updated_at: latch.raised_at.clone(),
                    project_path: none_if_empty(project_path),
                },
            );
        }

        let mut rows: Vec<_> = merged.into_values().collect();
        rows.sort_by(|left, right| left.session_id.cmp(&right.session_id));
        rows
    }
}

fn none_if_empty(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn is_archived_context(context_id: &Option<String>, archived: &HashSet<String>) -> bool {
    context_id.as_ref().is_some_and(|id| archived.contains(id))
}

fn parse_surface(raw: &str) -> AgentSurface {
    if raw == AgentSurface::Chat.as_str() {
        AgentSurface::Chat
    } else {
        AgentSurface::Terminal
    }
}

fn parse_tool(raw: &str) -> Option<AgentToolType> {
    serde_json::from_value(serde_json::Value::String(raw.to_string())).ok()
}

fn surface_id_for(
    session_id: &str,
    surface: AgentSurface,
    explicit: Option<String>,
) -> Option<String> {
    if let Some(id) = none_if_empty(explicit) {
        return Some(id);
    }
    if surface == AgentSurface::Chat {
        return parse_chat_status_session_id(session_id).map(str::to_string);
    }
    None
}

fn latch_for<'a>(
    session: &AgentStatusRecord,
    latches: &'a HashMap<String, AgentAttentionLatch>,
) -> Option<&'a AgentAttentionLatch> {
    latches
        .get(&session.session_id)
        .or_else(|| session.pane_id.as_ref().and_then(|pane| latches.get(pane)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::time::Duration;

    use infra::db::repo::{
        AgentSessionCatalogRepo, AgentSessionCatalogRow, ProjectRepo, WorkspaceCreateSource,
        WorkspaceRepo,
    };
    use parking_lot::Mutex;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;
    use tokio::sync::oneshot;

    use crate::service::agent_status::{AgentStatusContext, AgentToolType, OccupancyUpdateKind};

    use super::super::catalog::AgentSessionCatalogStore;

    struct TestDb {
        db: Arc<DatabaseConnection>,
        _file: tempfile::NamedTempFile,
    }

    async fn setup_db() -> TestDb {
        let file = tempfile::NamedTempFile::new().expect("temp sqlite");
        let url = format!("sqlite://{}?mode=rwc", file.path().display());
        let db = Database::connect(&url).await.expect("connect sqlite");
        infra::Migrator::up(&db, None).await.expect("migrate");
        TestDb {
            db: Arc::new(db),
            _file: file,
        }
    }

    fn pane_ctx(context_id: &str, pane: &str) -> AgentStatusContext {
        AgentStatusContext {
            context_id: Some(context_id.to_string()),
            pane_id: Some(pane.to_string()),
            surface: AgentSurface::Terminal,
            ..AgentStatusContext::default()
        }
    }

    fn session_by_id<'a>(
        rows: &'a [AgentSessionStatusSnapshot],
        session_id: &str,
    ) -> &'a AgentSessionStatusSnapshot {
        rows.iter()
            .find(|row| row.session_id == session_id)
            .unwrap_or_else(|| panic!("missing session {session_id}"))
    }

    #[tokio::test]
    async fn session_agent_two_panes_same_context_are_not_rolled_up() {
        let test_db = setup_db().await;
        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        service.update_state(
            "ws-mix:run",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/run".into()),
            &pane_ctx("ws-mix", "ws-mix:run"),
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-mix:perm",
            AgentToolType::Codex,
            AgentOccupancy::PermissionRequest,
            Some("/tmp/perm".into()),
            &pane_ctx("ws-mix", "ws-mix:perm"),
            OccupancyUpdateKind::Permission,
        );

        let sessions = service
            .list_agent_session_statuses()
            .await
            .expect("list sessions");
        assert_eq!(sessions.len(), 2);
        assert_eq!(
            session_by_id(&sessions, "ws-mix:run").group_key,
            WorkspaceAgentGroupKey::Running
        );
        assert_eq!(
            session_by_id(&sessions, "ws-mix:perm").group_key,
            WorkspaceAgentGroupKey::Permission
        );
        assert!(sessions
            .iter()
            .all(|row| row.context_id.as_deref() == Some("ws-mix")));
        assert!(sessions.iter().all(|row| !row.updated_at.is_empty()));

        let groups = service.list_workspace_agent_groups();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].context_id, "ws-mix");
        assert_eq!(groups[0].group_key, WorkspaceAgentGroupKey::Permission);
        assert!(groups
            .iter()
            .all(|row| row.group_key != WorkspaceAgentGroupKey::Done));
    }

    #[tokio::test]
    async fn session_agent_idle_clear_keeps_attention_then_done_catalog() {
        let test_db = setup_db().await;
        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        let pane = "ws-done:agent";
        let ctx = pane_ctx("ws-done", pane);
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        service.flush_catalog().await;

        let stored = AgentSessionCatalogRepo::new(&test_db.db)
            .get(pane)
            .await
            .expect("read catalog")
            .expect("catalog row");
        let stored_at = stored.updated_at.clone();
        assert!(stored.archived_at.is_none());

        service.clear_idle_older_than(0);
        service.clear_idle_sessions();
        let after_clear = AgentSessionCatalogRepo::new(&test_db.db)
            .get(pane)
            .await
            .expect("read catalog")
            .expect("catalog row remains");
        assert_eq!(after_clear.updated_at, stored_at);
        assert!(service.get_all_sessions().is_empty());
        assert!(!service.get_all_attention().is_empty());

        let listed = service
            .list_agent_session_statuses()
            .await
            .expect("list sessions");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].group_key, WorkspaceAgentGroupKey::Attention);
        assert!(!listed[0].updated_at.is_empty());

        let writes_before_ack = service.catalog_upsert_count();
        service.clear_attention_for_pane(pane);
        service.flush_catalog().await;
        assert_eq!(service.catalog_upsert_count(), writes_before_ack);
        assert!(service.get_all_sessions().is_empty());

        let done = service
            .list_agent_session_statuses()
            .await
            .expect("list sessions");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].group_key, WorkspaceAgentGroupKey::Done);
        assert_eq!(done[0].updated_at, stored_at);
        let row = AgentSessionCatalogRepo::new(&test_db.db)
            .get(pane)
            .await
            .expect("read catalog")
            .expect("catalog row remains");
        assert_eq!(row.updated_at, stored_at);
        assert!(row.archived_at.is_none());
    }

    #[tokio::test]
    async fn session_agent_same_bucket_skips_and_updated_at_does_not_move_backwards() {
        let test_db = setup_db().await;
        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        let pane = "ws-order:agent";
        let ctx = pane_ctx("ws-order", pane);

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        assert_eq!(service.catalog_upsert_count(), 1);
        service.update_state(
            pane,
            AgentToolType::Codex,
            AgentOccupancy::Running,
            Some("/tmp/p2".into()),
            &ctx,
            OccupancyUpdateKind::Progress,
        );
        assert_eq!(service.catalog_upsert_count(), 1);

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::ForcedIdle,
        );
        assert_eq!(service.catalog_upsert_count(), 2);
        let done_at = service
            .get_all_sessions()
            .into_iter()
            .find(|row| row.session_id == pane)
            .expect("idle session")
            .timestamp;

        tokio::time::sleep(Duration::from_millis(5)).await;
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        assert_eq!(service.catalog_upsert_count(), 3);
        let running_at = service
            .get_all_sessions()
            .into_iter()
            .find(|row| row.session_id == pane)
            .expect("running session")
            .timestamp;
        assert!(running_at > done_at);

        service.flush_catalog().await;
        let row = AgentSessionCatalogRepo::new(&test_db.db)
            .get(pane)
            .await
            .expect("read catalog")
            .expect("catalog row");
        assert_eq!(row.updated_at, running_at);
        assert!(row.updated_at > done_at);
    }

    #[tokio::test]
    async fn session_agent_direct_older_upsert_does_not_regress() {
        let test_db = setup_db().await;
        let repo = AgentSessionCatalogRepo::new(&test_db.db);
        let newer = catalog_row("pane-1", "2026-01-02T00:00:00+00:00");
        let older = catalog_row("pane-1", "2026-01-01T00:00:00+00:00");
        repo.upsert(&newer).await.expect("newer");
        repo.upsert(&older).await.expect("older");
        let row = repo.get("pane-1").await.expect("get").expect("row");
        assert_eq!(row.updated_at, newer.updated_at);
        assert_eq!(row.tool.as_deref(), Some("claude-code"));
    }

    #[tokio::test]
    async fn session_agent_slower_done_write_does_not_land_after_running() {
        let (release_tx, release_rx) = oneshot::channel();
        let store = Arc::new(GateStore::new(release_rx));
        let service = AgentStatusService::with_catalog(
            Arc::clone(&store) as Arc<dyn AgentSessionCatalogStore>
        );
        let pane = "ws-slow:agent";
        let ctx = pane_ctx("ws-slow", pane);

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        wait_until(|| store.entered.load(AtomicOrdering::SeqCst) >= 1).await;
        assert_eq!(store.entered.load(AtomicOrdering::SeqCst), 1);
        assert_eq!(service.catalog_upsert_count(), 1);

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &ctx,
            OccupancyUpdateKind::Progress,
        );
        assert_eq!(service.catalog_upsert_count(), 1);

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            None,
            &ctx,
            OccupancyUpdateKind::ForcedIdle,
        );
        let done_at = service
            .get_all_sessions()
            .into_iter()
            .find(|row| row.session_id == pane)
            .expect("done session")
            .timestamp;
        tokio::time::sleep(Duration::from_millis(5)).await;
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        assert_eq!(service.catalog_upsert_count(), 3);
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(
            store.entered.load(AtomicOrdering::SeqCst),
            1,
            "later writes stay queued behind the in-flight upsert"
        );
        let running_at = service
            .get_all_sessions()
            .into_iter()
            .find(|row| row.session_id == pane)
            .expect("running session")
            .timestamp;
        assert!(running_at > done_at);

        release_tx.send(()).expect("release");
        service.flush_catalog().await;
        assert_eq!(store.entered.load(AtomicOrdering::SeqCst), 3);
        assert_eq!(store.updated_at(pane).as_deref(), Some(running_at.as_str()));
        assert!(store.updated_at(pane).as_deref().unwrap() > done_at.as_str());
    }

    #[tokio::test]
    async fn session_agent_archive_hides_row() {
        let test_db = setup_db().await;
        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        let pane = "ws-arch:agent";
        service.update_state(
            pane,
            AgentToolType::Cursor,
            AgentOccupancy::Running,
            None,
            &pane_ctx("ws-arch", pane),
            OccupancyUpdateKind::NewTurn,
        );
        service.flush_catalog().await;
        assert_eq!(
            service
                .list_agent_session_statuses()
                .await
                .expect("list")
                .len(),
            1
        );

        service.archive_agent_session(pane).await.expect("archive");
        let listed = service.list_agent_session_statuses().await.expect("list");
        assert!(listed.iter().all(|row| row.session_id != pane));
        let row = AgentSessionCatalogRepo::new(&test_db.db)
            .get(pane)
            .await
            .expect("get")
            .expect("row kept");
        assert!(row.archived_at.is_some());

        service
            .archive_agent_session("missing-session")
            .await
            .expect("unknown id");
        assert!(AgentSessionCatalogRepo::new(&test_db.db)
            .get("missing-session")
            .await
            .expect("get")
            .is_none());
        assert!(service
            .list_agent_session_statuses()
            .await
            .expect("list")
            .iter()
            .all(|row| row.session_id != pane));
    }

    #[tokio::test]
    async fn session_agent_restart_without_live_map_is_done() {
        let test_db = setup_db().await;
        let pane = "ws-restart:agent";
        let stored_at = "2026-03-01T00:00:00+00:00";
        AgentSessionCatalogRepo::new(&test_db.db)
            .upsert(&catalog_row(pane, stored_at))
            .await
            .expect("seed");

        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        let listed = service.list_agent_session_statuses().await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].group_key, WorkspaceAgentGroupKey::Done);
        assert_eq!(listed[0].updated_at, stored_at);
        assert!(service.get_all_sessions().is_empty());

        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &pane_ctx("ws-restart", pane),
            OccupancyUpdateKind::NewTurn,
        );
        let live = service.list_agent_session_statuses().await.expect("list");
        assert_eq!(live[0].group_key, WorkspaceAgentGroupKey::Running);
        assert_ne!(live[0].updated_at, stored_at);
    }

    #[tokio::test]
    async fn session_agent_archived_workspace_is_omitted() {
        let test_db = setup_db().await;
        let project = ProjectRepo::new(&test_db.db)
            .create(
                "session-agent".into(),
                "/tmp/session-agent".into(),
                0,
                None,
                None,
            )
            .await
            .expect("project");
        let workspace = WorkspaceRepo::new(&test_db.db)
            .create(
                project.guid,
                "ws".into(),
                None,
                "feature".into(),
                "main".into(),
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
            .expect("workspace");
        WorkspaceRepo::new(&test_db.db)
            .archive_workspace(&workspace.guid)
            .await
            .expect("archive workspace");

        let service = AgentStatusService::with_db(Arc::clone(&test_db.db));
        let archived_pane = format!("{}:agent", workspace.guid);
        service.update_state(
            &archived_pane,
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &pane_ctx(&workspace.guid, &archived_pane),
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "project-ctx:agent",
            AgentToolType::Codex,
            AgentOccupancy::Running,
            None,
            &pane_ctx("project-ctx", "project-ctx:agent"),
            OccupancyUpdateKind::NewTurn,
        );
        service.flush_catalog().await;

        let listed = service.list_agent_session_statuses().await.expect("list");
        assert!(listed.iter().all(|row| row.session_id != archived_pane));
        assert!(listed
            .iter()
            .any(|row| row.session_id == "project-ctx:agent"));
    }

    fn catalog_row(session_id: &str, updated_at: &str) -> AgentSessionCatalogRow {
        AgentSessionCatalogRow {
            session_id: session_id.to_string(),
            context_id: Some("ws-1".into()),
            surface: "terminal".into(),
            tool: Some("claude-code".into()),
            project_path: Some("/tmp/p".into()),
            updated_at: updated_at.to_string(),
        }
    }

    async fn wait_until(mut ready: impl FnMut() -> bool) {
        for _ in 0..50 {
            if ready() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    struct GateStore {
        rows: Mutex<HashMap<String, AgentSessionCatalogRow>>,
        entered: AtomicUsize,
        release: Mutex<Option<oneshot::Receiver<()>>>,
        archived: Mutex<HashSet<String>>,
    }

    impl GateStore {
        fn new(release: oneshot::Receiver<()>) -> Self {
            Self {
                rows: Mutex::new(HashMap::new()),
                entered: AtomicUsize::new(0),
                release: Mutex::new(Some(release)),
                archived: Mutex::new(HashSet::new()),
            }
        }

        fn updated_at(&self, session_id: &str) -> Option<String> {
            self.rows
                .lock()
                .get(session_id)
                .map(|row| row.updated_at.clone())
        }
    }

    #[async_trait::async_trait]
    impl AgentSessionCatalogStore for GateStore {
        async fn upsert(&self, row: AgentSessionCatalogRow) -> std::result::Result<(), String> {
            self.entered.fetch_add(1, AtomicOrdering::SeqCst);
            let release = self.release.lock().take();
            if let Some(release) = release {
                let _ = release.await;
            }
            let mut rows = self.rows.lock();
            if let Some(existing) = rows.get(&row.session_id) {
                if row.updated_at < existing.updated_at {
                    return Ok(());
                }
            }
            if self.archived.lock().contains(&row.session_id) {
                return Ok(());
            }
            rows.insert(row.session_id.clone(), row);
            Ok(())
        }

        async fn list_open(&self) -> std::result::Result<Vec<AgentSessionCatalogRow>, String> {
            let archived = self.archived.lock().clone();
            Ok(self
                .rows
                .lock()
                .values()
                .filter(|row| !archived.contains(&row.session_id))
                .cloned()
                .collect())
        }

        async fn archived_session_ids(&self) -> std::result::Result<HashSet<String>, String> {
            Ok(self.archived.lock().clone())
        }

        async fn archive(&self, session_id: &str) -> std::result::Result<(), String> {
            self.archived.lock().insert(session_id.to_string());
            Ok(())
        }

        async fn archived_workspace_ids(&self) -> std::result::Result<HashSet<String>, String> {
            Ok(HashSet::new())
        }
    }
}
