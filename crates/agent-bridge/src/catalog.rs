use serde::{Deserialize, Serialize};

use crate::busy::Occupancy;
use crate::delivery::LiveSession;

/// Default page size for `agent_bridge_list`. Missing or 0 uses this.
pub const LIST_DEFAULT_LIMIT: usize = 20;
/// Hard cap so a list dump cannot fill an agent context window.
pub const LIST_MAX_LIMIT: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogKind {
    Native,
    Registry,
    Custom,
    Terminal,
    Chat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub kind: CatalogKind,
    pub provider_id: String,
    pub display_name: String,
    pub server_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(default)]
    pub occupancy: Occupancy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_activity_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

impl CatalogEntry {
    /// Chat-index title when present; otherwise `provider_id`. Never `chat {id}`.
    pub fn from_live_session(session: &LiveSession, server_id: &str, occupancy: Occupancy) -> Self {
        let title = nonempty_owned(session.title.as_deref());
        let display_name = title.clone().unwrap_or_else(|| session.provider_id.clone());
        Self {
            kind: CatalogKind::Chat,
            provider_id: session.provider_id.clone(),
            display_name,
            server_id: server_id.to_string(),
            title,
            chat_id: Some(session.chat_id.clone()),
            workspace_id: nonempty_owned(session.workspace_id.as_deref()),
            project_id: nonempty_owned(session.project_id.as_deref()),
            occupancy,
            updated_at: nonempty_owned(session.updated_at.as_deref()),
            last_activity_at: nonempty_owned(session.last_activity_at.as_deref())
                .or_else(|| nonempty_owned(session.updated_at.as_deref())),
            enabled: None,
        }
    }
}

/// Terminal install rows must expose `registry_id` (`claude`), never `AgentId` (`claude_code`).
pub fn terminal_provider_id(registry_id: &str) -> &str {
    registry_id
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListResponse {
    pub server_id: String,
    pub entries: Vec<CatalogEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub has_more: bool,
}

pub fn normalize_list_limit(limit: Option<u32>) -> usize {
    match limit {
        None | Some(0) => LIST_DEFAULT_LIMIT,
        Some(n) => (n as usize).clamp(1, LIST_MAX_LIMIT),
    }
}

pub fn list_cursor(activity_at: &str, chat_id: &str) -> String {
    format!("{activity_at}\n{chat_id}")
}

pub fn split_list_cursor(cursor: &str) -> Option<(&str, &str)> {
    let (activity_at, chat_id) = cursor.split_once('\n')?;
    if activity_at.is_empty() || chat_id.is_empty() {
        return None;
    }
    Some((activity_at, chat_id))
}

/// Newest first. `cursor` is the previous page's last activity timestamp and `chat_id`.
pub fn page_live_sessions(
    mut sessions: Vec<LiveSession>,
    cursor: Option<&str>,
    limit: usize,
) -> (Vec<LiveSession>, Option<String>, bool) {
    let limit = limit.clamp(1, LIST_MAX_LIMIT);
    sessions.sort_by(|left, right| {
        right
            .activity_at()
            .cmp(left.activity_at())
            .then_with(|| right.chat_id.cmp(&left.chat_id))
    });
    if let Some((activity_at, chat_id)) = cursor.and_then(split_list_cursor) {
        sessions.retain(|row| {
            row.activity_at() < activity_at
                || (row.activity_at() == activity_at && row.chat_id.as_str() < chat_id)
        });
    }
    let has_more = sessions.len() > limit;
    let page: Vec<LiveSession> = sessions.into_iter().take(limit).collect();
    let next_cursor = if has_more {
        page.last()
            .map(|row| list_cursor(row.activity_at(), &row.chat_id))
    } else {
        None
    };
    (page, next_cursor, has_more)
}

fn nonempty_owned(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(provider: &str, chat: &str, activity: &str) -> LiveSession {
        let mut row = LiveSession::new(provider, chat);
        row.updated_at = Some(activity.to_string());
        row.last_activity_at = Some(activity.to_string());
        row.title = Some(format!("{provider} session"));
        row
    }

    #[test]
    fn terminal_ids_use_registry_not_install_enum() {
        assert_eq!(terminal_provider_id("claude"), "claude");
        assert_ne!(terminal_provider_id("claude"), "claude_code");
    }

    #[test]
    fn catalog_kinds_are_snake_case() {
        for (kind, wire) in [
            (CatalogKind::Native, "native"),
            (CatalogKind::Registry, "registry"),
            (CatalogKind::Custom, "custom"),
            (CatalogKind::Terminal, "terminal"),
            (CatalogKind::Chat, "chat"),
        ] {
            assert_eq!(serde_json::to_value(kind).unwrap(), wire);
        }
    }

    #[test]
    fn chat_entry_uses_real_title_not_chat_id_literal() {
        let mut live = LiveSession::new("claude", "abc123");
        live.title = Some("Fix login".into());
        live.workspace_id = Some("ws-1".into());
        live.updated_at = Some("2026-10-27T10:00:00Z".into());
        let entry = CatalogEntry::from_live_session(&live, "srv", Occupancy::Idle);
        assert_eq!(entry.kind, CatalogKind::Chat);
        assert_eq!(entry.chat_id.as_deref(), Some("abc123"));
        assert_eq!(entry.title.as_deref(), Some("Fix login"));
        assert_eq!(entry.display_name, "Fix login");
        assert!(!entry.display_name.starts_with("chat "));
        assert_eq!(entry.workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(entry.updated_at.as_deref(), Some("2026-10-27T10:00:00Z"));
    }

    #[test]
    fn untitled_chat_falls_back_to_provider_id() {
        let live = LiveSession::new("codex", "c9");
        let entry = CatalogEntry::from_live_session(&live, "srv", Occupancy::Idle);
        assert_eq!(entry.display_name, "codex");
        assert!(entry.title.is_none());
        assert!(!entry.display_name.contains("c9"));
    }

    #[test]
    fn normalize_list_limit_defaults_and_caps() {
        assert_eq!(normalize_list_limit(None), LIST_DEFAULT_LIMIT);
        assert_eq!(normalize_list_limit(Some(0)), LIST_DEFAULT_LIMIT);
        assert_eq!(normalize_list_limit(Some(3)), 3);
        assert_eq!(normalize_list_limit(Some(500)), LIST_MAX_LIMIT);
    }

    #[test]
    fn page_live_sessions_second_page_uses_cursor() {
        let sessions = vec![
            session("claude", "c1", "2026-10-27T12:00:00Z"),
            session("codex", "c2", "2026-10-27T11:00:00Z"),
            session("claude", "c3", "2026-10-27T10:00:00Z"),
        ];
        let (page1, cursor, has_more) = page_live_sessions(sessions.clone(), None, 2);
        assert!(has_more);
        assert_eq!(
            page1.iter().map(|s| s.chat_id.as_str()).collect::<Vec<_>>(),
            vec!["c1", "c2"]
        );
        let cursor = cursor.expect("next_cursor");
        let (page2, next, more) = page_live_sessions(sessions, Some(&cursor), 2);
        assert!(!more);
        assert!(next.is_none());
        assert_eq!(page2.len(), 1);
        assert_eq!(page2[0].chat_id, "c3");
    }
}
