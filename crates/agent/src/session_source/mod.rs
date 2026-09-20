//! Disk ingest for host CLI session files.
//!
//! Adapters expose cheap list metadata and parse on demand into Atmos
//! `AgentEventEnvelope` values. This module is not the `agent_chat_*` API.

mod adapters;
pub(crate) mod paths;
pub(crate) mod scan;
mod stats;

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::contract::{AgentEvent, AgentEventEnvelope, AgentResult, TextKind};

/// A transcript record carries a part's whole text, so the part is finished the
/// moment it is parsed: one chunk at offset 0 followed by its terminator. Nothing
/// here accumulates an offset, because nothing appends to a part twice.
///
/// `index` is the text segment's position inside its message, so a message holding
/// several segments yields several parts — and re-parsing the same file names them
/// identically, which a running counter would not.
pub(crate) fn finished_text_part(
    message_id: &str,
    index: u32,
    kind: TextKind,
    text: &str,
    parent_part_id: Option<String>,
) -> [AgentEvent; 2] {
    let part_id = format!("{message_id}:{index}");
    [
        AgentEvent::TextChunk {
            part_id: part_id.clone(),
            message_id: message_id.to_string(),
            parent_part_id,
            ordinal: index,
            kind,
            offset: 0,
            text: text.to_string(),
        },
        AgentEvent::PartClosed {
            part_id,
            duration_ms: None,
        },
    ]
}

pub(crate) fn stamp_new_envelopes(
    events: &mut [AgentEventEnvelope],
    from: usize,
    timestamp: Option<DateTime<Utc>>,
) {
    let Some(ts) = timestamp else {
        return;
    };
    for event in events.iter_mut().skip(from) {
        if event.timestamp.is_none() {
            event.timestamp = Some(ts);
        }
    }
}

pub use adapters::{ClaudeSource, CodexSource, CursorSource, GrokSource, OpenCodeSource, PiSource};
pub use stats::{enrich_host_session_stats, source_byte_size, source_fingerprint};

/// Canonical v1 host ids. Unknown ids are not session sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostId {
    Claude,
    Codex,
    OpenCode,
    Pi,
    Grok,
    Cursor,
}

impl HostId {
    pub const V1: [Self; 6] = [
        Self::Claude,
        Self::Codex,
        Self::OpenCode,
        Self::Pi,
        Self::Grok,
        Self::Cursor,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
            Self::Pi => "pi",
            Self::Grok => "grok",
            Self::Cursor => "cursor",
        }
    }

    pub fn from_canonical(id: &str) -> Option<Self> {
        match id {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "opencode" => Some(Self::OpenCode),
            "pi" => Some(Self::Pi),
            "grok" => Some(Self::Grok),
            "cursor" => Some(Self::Cursor),
            _ => None,
        }
    }

    pub fn tui_resume(self, native_id: &str, cwd: &Path) -> TuiResumePlan {
        let (bin, args) = match self {
            Self::Claude => (
                "claude",
                vec!["--resume".to_string(), native_id.to_string()],
            ),
            Self::Codex => ("codex", vec!["resume".to_string(), native_id.to_string()]),
            Self::OpenCode => (
                "opencode",
                vec!["--session".to_string(), native_id.to_string()],
            ),
            Self::Pi => ("pi", vec!["--session".to_string(), native_id.to_string()]),
            Self::Grok => ("grok", vec!["--resume".to_string(), native_id.to_string()]),
            Self::Cursor => (
                "cursor-agent",
                vec!["--resume".to_string(), native_id.to_string()],
            ),
        };
        TuiResumePlan {
            bin: bin.to_string(),
            args,
            cwd: cwd.to_path_buf(),
        }
    }
}

/// Cheap list row. `key` is `{provider_id}:{native_id}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionRef {
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
    /// File, directory, or host sqlite path used to parse this session.
    pub source_path: String,
    /// Parent host session native id when this row is a subagent/child session.
    /// Aligns with Agent Chat `task_id` / nested child files — not listed as a root.
    pub parent_native_id: Option<String>,
}

impl HostSessionRef {
    pub fn key_for(provider_id: &str, native_id: &str) -> String {
        format!("{provider_id}:{native_id}")
    }

    pub fn parent_session_key(&self) -> Option<String> {
        let parent = self.parent_native_id.as_deref()?.trim();
        if parent.is_empty() {
            None
        } else {
            Some(Self::key_for(&self.provider_id, parent))
        }
    }

    pub fn source_path_buf(&self) -> Option<PathBuf> {
        let trimmed = self.source_path.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    }
}

/// Host CLI resume argv. PATH is checked at spawn time, not here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TuiResumePlan {
    pub bin: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

pub trait SessionSource: Send + Sync {
    fn provider_id(&self) -> &'static str;
    fn data_roots(&self) -> Vec<PathBuf>;
    fn list(&self) -> Vec<HostSessionRef>;
    fn parse(&self, native_id: &str) -> AgentResult<Vec<AgentEventEnvelope>>;
    fn parse_at(
        &self,
        native_id: &str,
        source_path: Option<&Path>,
    ) -> AgentResult<Vec<AgentEventEnvelope>> {
        let _ = source_path;
        self.parse(native_id)
    }
    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan>;
}

/// Explicit v1 roster. Unknown `provider_id` values are not sources.
pub fn default_roster() -> Vec<Box<dyn SessionSource>> {
    vec![
        Box::new(ClaudeSource),
        Box::new(CodexSource),
        Box::new(OpenCodeSource),
        Box::new(PiSource),
        Box::new(GrokSource),
        Box::new(CursorSource),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_roster_provider_ids_are_the_v1_hosts() {
        let mut ids: Vec<_> = default_roster()
            .iter()
            .map(|source| source.provider_id())
            .collect();
        ids.sort_unstable();
        let mut expected: Vec<_> = HostId::V1.iter().map(|id| id.as_str()).collect();
        expected.sort_unstable();
        assert_eq!(ids, expected);
        ids.dedup();
        assert_eq!(ids.len(), 6);
    }

    #[test]
    fn canonical_ids_only() {
        assert_eq!(HostId::from_canonical("claude"), Some(HostId::Claude));
        assert_eq!(HostId::from_canonical("cursor"), Some(HostId::Cursor));
        assert!(HostId::from_canonical("claude-code").is_none());
        assert!(HostId::from_canonical("grok-build").is_none());
        assert!(HostId::from_canonical("gemini").is_none());
    }

    #[test]
    fn stub_parse_is_ok() {
        for source in default_roster() {
            let events = source.parse("missing").expect("stub parse");
            assert!(events.is_empty());
        }
    }

    #[test]
    fn stub_tui_resume_uses_v1_argv() {
        let cwd = Path::new("/tmp/ws");
        let roster = default_roster();
        let plan = |id: &str| {
            roster
                .iter()
                .find(|source| source.provider_id() == id)
                .unwrap()
                .tui_resume("sess-1", cwd)
                .expect("tui plan")
        };

        let claude = plan("claude");
        assert_eq!(claude.bin, "claude");
        assert_eq!(claude.args, ["--resume", "sess-1"]);
        assert_eq!(claude.cwd, cwd);

        let codex = plan("codex");
        assert_eq!(codex.bin, "codex");
        assert_eq!(codex.args, ["resume", "sess-1"]);

        let opencode = plan("opencode");
        assert_eq!(opencode.bin, "opencode");
        assert_eq!(opencode.args, ["--session", "sess-1"]);

        let pi = plan("pi");
        assert_eq!(pi.bin, "pi");
        assert_eq!(pi.args, ["--session", "sess-1"]);

        let grok = plan("grok");
        assert_eq!(grok.bin, "grok");
        assert_eq!(grok.args, ["--resume", "sess-1"]);

        let cursor = plan("cursor");
        assert_eq!(cursor.bin, "cursor-agent");
        assert_eq!(cursor.args, ["--resume", "sess-1"]);
    }
}
