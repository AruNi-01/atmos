use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::Serialize;

use crate::error::{Result, ServiceError};
use crate::utils::path_boundary::{path_or_existing_parent_within_root, path_within_root};

use super::types::{
    flatten_messages, AgentChatIndexEntry, AgentChatMeta, AgentChatOrigin, AgentChatSnapshot,
    CreateAgentChatRequest, FoldedMessage, FoldedTurn, MessagePart, QueueItem, RuntimeStatus,
    SessionConfigValueChange, SessionHintTone, SessionLifecycleAction, SessionLifecycleStatus,
    TranscriptRecord, TurnStatus,
};

pub struct AgentChatStore {
    root: PathBuf,
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    index_lock: Mutex<()>,
    seqs: Mutex<HashMap<String, u64>>,
}

impl AgentChatStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            locks: Mutex::new(HashMap::new()),
            index_lock: Mutex::new(()),
            seqs: Mutex::new(HashMap::new()),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn create(&self, req: CreateAgentChatRequest) -> Result<AgentChatMeta> {
        let id = uuid::Uuid::new_v4().to_string();
        require_chat_id(&id)?;
        if req.provider_id.trim().is_empty() {
            return Err(ServiceError::Validation(
                "provider_id is required".to_string(),
            ));
        }
        let now = Utc::now();
        let meta = AgentChatMeta {
            id: id.clone(),
            created_at: now,
            updated_at: now,
            deleted: false,
            title: req.title,
            cwd: req.cwd,
            workspace_id: req.workspace_id,
            project_id: req.project_id,
            space_id: req.space_id,
            origin: req.origin,
            provider_id: req.provider_id,
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::Detached,
            selected_model: req.model,
            selected_thinking: req.thinking,
            selected_mode: req.mode,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            supports_steer: false,
            available_commands: Vec::new(),
            session_config_options: Vec::new(),
            session_usage: None,
        };
        if meta
            .persistence_handle
            .as_deref()
            .is_some_and(|handle| handle == meta.id)
        {
            return Err(ServiceError::Processing(
                "chat id must not equal persistence handle".into(),
            ));
        }
        let dir = self.dir_for(&id);
        fs::create_dir_all(&dir).map_err(io_err)?;
        fs::create_dir_all(dir.join("attachments")).map_err(io_err)?;
        self.write_meta(&meta)?;
        self.write_queue_unlocked(&id, &[])?;
        File::create(dir.join("transcript.jsonl")).map_err(io_err)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn get_meta(&self, id: &str) -> Result<AgentChatMeta> {
        require_chat_id(id)?;
        let path = self.dir_for(id).join("meta.json");
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("agent chat {id}")));
        }
        let mut meta = read_json::<AgentChatMeta>(&path)?;
        self.apply_live_seq(&mut meta);
        Ok(meta)
    }

    pub fn get_snapshot(&self, id: &str) -> Result<AgentChatSnapshot> {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let meta = self.get_meta(id)?;
        let turns = fold_transcript(&self.dir_for(id).join("transcript.jsonl"))?;
        let queue = self.read_queue_unlocked(id)?;
        let pending_permission =
            last_pending_permission(&self.dir_for(id).join("transcript.jsonl"))?;
        let (messages, running_turn_id, running_turn_started_at) = flatten_messages(turns);
        Ok(AgentChatSnapshot {
            meta,
            messages,
            queue,
            pending_permission,
            running_turn_id,
            running_turn_started_at,
        })
    }

    pub fn folded_turns(&self, id: &str) -> Result<Vec<FoldedTurn>> {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        fold_transcript(&self.dir_for(id).join("transcript.jsonl"))
    }

    pub fn list(
        &self,
        cwd: Option<&str>,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        include_deleted: bool,
        all: bool,
        origin: Option<AgentChatOrigin>,
    ) -> Result<Vec<AgentChatIndexEntry>> {
        let entries = match self.read_index() {
            Ok(entries) if !entries.is_empty() => entries,
            _ => self.rebuild_index()?,
        };
        Ok(entries
            .into_iter()
            .filter(|entry| include_deleted || !entry.deleted)
            .filter(|entry| origin.is_none_or(|wanted| entry.origin == wanted))
            .filter(|entry| {
                if cwd.is_some() || workspace_id.is_some() || project_id.is_some() {
                    return cwd.is_none_or(|cwd| entry.cwd == cwd)
                        && workspace_id.is_none_or(|id| entry.workspace_id.as_deref() == Some(id))
                        && project_id.is_none_or(|id| entry.project_id.as_deref() == Some(id));
                }
                if all {
                    return true;
                }
                entry.workspace_id.is_none() && entry.project_id.is_none()
            })
            .collect())
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<AgentChatMeta> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let mut meta = self.get_meta(id)?;
        meta.title = Some(title.trim().to_string());
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn delete(&self, id: &str) -> Result<AgentChatMeta> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let mut meta = self.get_meta(id)?;
        meta.deleted = true;
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn update_meta<F>(&self, id: &str, mutate: F) -> Result<AgentChatMeta>
    where
        F: FnOnce(&mut AgentChatMeta),
    {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let mut meta = self.get_meta_unlocked(id)?;
        self.apply_live_seq(&mut meta);
        mutate(&mut meta);
        meta.updated_at = Utc::now();
        self.apply_live_seq(&mut meta);
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn append_record(&self, id: &str, record: &TranscriptRecord) -> Result<()> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let path = self.dir_for(id).join("transcript.jsonl");
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(io_err)?;
        serde_json::to_writer(&mut file, record).map_err(|e| {
            ServiceError::Processing(format!("failed to serialize transcript record: {e}"))
        })?;
        file.write_all(b"\n").map_err(io_err)?;
        file.sync_all().map_err(io_err)?;
        Ok(())
    }

    pub fn read_queue(&self, id: &str) -> Result<Vec<QueueItem>> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        self.read_queue_unlocked(id)
    }

    pub fn write_queue(&self, id: &str, items: &[QueueItem]) -> Result<()> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        self.write_queue_unlocked(id, items)
    }

    pub fn mutate_queue<F, T>(&self, id: &str, mutate: F) -> Result<T>
    where
        F: FnOnce(&mut Vec<QueueItem>) -> Result<T>,
    {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let mut items = self.read_queue_unlocked(id)?;
        let value = mutate(&mut items)?;
        self.write_queue_unlocked(id, &items)?;
        Ok(value)
    }

    fn read_queue_unlocked(&self, id: &str) -> Result<Vec<QueueItem>> {
        let path = self.dir_for(id).join("queue.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        read_json(&path)
    }

    fn write_queue_unlocked(&self, id: &str, items: &[QueueItem]) -> Result<()> {
        atomic_write_json(&self.dir_for(id).join("queue.json"), &items)
    }

    pub fn next_seq(&self, id: &str) -> Result<u64> {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let mut seqs = self.seqs.lock().expect("agent chat seq map");
        let seq = seqs.entry(id.to_string()).or_insert_with(|| {
            self.get_meta_unlocked(id)
                .map(|meta| meta.last_event_seq)
                .unwrap_or(0)
        });
        *seq = seq.saturating_add(1);
        Ok(*seq)
    }

    pub fn persist_seq(&self, id: &str) -> Result<()> {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let seq = self
            .seqs
            .lock()
            .expect("agent chat seq map")
            .get(id)
            .copied();
        let Some(seq) = seq else {
            return Ok(());
        };
        let mut meta = self.get_meta_unlocked(id)?;
        if meta.last_event_seq == seq {
            return Ok(());
        }
        meta.last_event_seq = seq;
        meta.updated_at = Utc::now();
        self.write_meta(&meta)
    }

    fn apply_live_seq(&self, meta: &mut AgentChatMeta) {
        if let Ok(seqs) = self.seqs.lock() {
            if let Some(seq) = seqs.get(&meta.id).copied() {
                if seq > meta.last_event_seq {
                    meta.last_event_seq = seq;
                }
            }
        }
    }

    fn get_meta_unlocked(&self, id: &str) -> Result<AgentChatMeta> {
        let path = self.dir_for(id).join("meta.json");
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("agent chat {id}")));
        }
        read_json(&path)
    }

    pub fn dir_for(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    pub fn save_attachment(&self, id: &str, filename: &str, data: &[u8]) -> Result<PathBuf> {
        require_chat_id(id)?;
        let _meta = self.get_meta(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let root = self.dir_for(id);
        let dir = root.join("attachments");
        fs::create_dir_all(&dir).map_err(io_err)?;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let safe_filename = filename.replace(['/', '\\', '\0'], "_");
        let path = dir.join(format!("{ts}_{safe_filename}"));
        if !path_or_existing_parent_within_root(&path, &root) {
            return Err(ServiceError::Validation(
                "attachment path escapes chat directory".into(),
            ));
        }
        fs::write(&path, data).map_err(io_err)?;
        Ok(path)
    }

    pub fn validate_attachment_paths(&self, id: &str, paths: &[String]) -> Result<()> {
        require_chat_id(id)?;
        if paths.is_empty() {
            return Ok(());
        }
        let root = self.dir_for(id);
        for path in paths {
            let candidate = PathBuf::from(path);
            if !path_within_root(&candidate, &root) {
                return Err(ServiceError::Validation(
                    "attachment is outside the chat directory".into(),
                ));
            }
            if !candidate.is_file() {
                return Err(ServiceError::Validation(format!(
                    "attachment not found: {path}"
                )));
            }
        }
        Ok(())
    }

    fn lock_arc(&self, id: &str) -> Arc<Mutex<()>> {
        let mut map = self.locks.lock().expect("agent chat lock map");
        map.entry(id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn write_meta(&self, meta: &AgentChatMeta) -> Result<()> {
        atomic_write_json(&self.dir_for(&meta.id).join("meta.json"), meta)
    }

    fn read_index(&self) -> Result<Vec<AgentChatIndexEntry>> {
        let path = self.root.join("index.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        read_json(&path)
    }

    fn upsert_index(&self, meta: &AgentChatMeta) -> Result<()> {
        let _guard = self.index_lock.lock().expect("index lock");
        let mut entries = self.read_index().unwrap_or_default();
        let entry = AgentChatIndexEntry::from(meta);
        if let Some(existing) = entries.iter_mut().find(|item| item.id == meta.id) {
            *existing = entry;
        } else {
            entries.push(entry);
        }
        entries.sort_by_key(|a| std::cmp::Reverse(a.updated_at));
        atomic_write_json(&self.root.join("index.json"), &entries)
    }

    fn rebuild_index(&self) -> Result<Vec<AgentChatIndexEntry>> {
        let _guard = self.index_lock.lock().expect("index lock");
        let mut entries = Vec::new();
        if self.root.exists() {
            for dir in fs::read_dir(&self.root).map_err(io_err)? {
                let dir = dir.map_err(io_err)?;
                if !dir.path().is_dir() {
                    continue;
                }
                let meta_path = dir.path().join("meta.json");
                if !meta_path.exists() {
                    continue;
                }
                if let Ok(meta) = read_json::<AgentChatMeta>(&meta_path) {
                    entries.push(AgentChatIndexEntry::from(&meta));
                }
            }
        }
        entries.sort_by_key(|a| std::cmp::Reverse(a.updated_at));
        atomic_write_json(&self.root.join("index.json"), &entries)?;
        Ok(entries)
    }
}

fn last_pending_permission(path: &Path) -> Result<Option<super::types::PendingPermission>> {
    if !path.exists() {
        return Ok(None);
    }
    let file = File::open(path).map_err(io_err)?;
    let reader = BufReader::new(file);
    let mut pending = None;
    for line in reader.lines() {
        let line = line.map_err(io_err)?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(TranscriptRecord::Permission { request, .. }) = serde_json::from_str(&line) {
            pending = if request.status == "pending" {
                Some(request)
            } else {
                None
            };
        }
    }
    Ok(pending)
}

pub fn fold_transcript(path: &Path) -> Result<Vec<FoldedTurn>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = File::open(path).map_err(io_err)?;
    let reader = BufReader::new(file);
    let mut turns: Vec<FoldedTurn> = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(io_err)?;
        if line.trim().is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<TranscriptRecord>(&line) else {
            continue;
        };
        apply_record(&mut turns, record);
    }
    Ok(turns)
}

fn apply_record(turns: &mut Vec<FoldedTurn>, record: TranscriptRecord) {
    match record {
        TranscriptRecord::TurnStarted {
            turn_id,
            created_at,
        } => {
            if !turns.iter().any(|turn| turn.id == turn_id) {
                turns.push(FoldedTurn {
                    id: turn_id,
                    status: TurnStatus::Running,
                    messages: Vec::new(),
                    created_at,
                    ..Default::default()
                });
            }
        }
        TranscriptRecord::UserMessage {
            turn_id,
            message_id,
            kind,
            text,
            attachments,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            let mut parts = vec![MessagePart::Text { text }];
            for path in attachments {
                parts.push(MessagePart::Attachment { path, name: None });
            }
            upsert_message(
                turn,
                FoldedMessage {
                    id: message_id,
                    role: "user".into(),
                    kind,
                    parts,
                    created_at,
                    streaming: false,
                    ..Default::default()
                },
            );
        }
        TranscriptRecord::AssistantSnapshot {
            turn_id,
            message_id,
            text,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            if let Some(index) = assistant_message_index(turn, &message_id) {
                let message = &mut turn.messages[index];
                if let Some(MessagePart::Text { text: existing }) = message
                    .parts
                    .iter_mut()
                    .rev()
                    .find(|part| matches!(part, MessagePart::Text { .. }))
                {
                    *existing = text;
                } else {
                    message.parts.push(MessagePart::Text { text });
                }
            } else {
                upsert_message(
                    turn,
                    FoldedMessage {
                        id: message_id,
                        role: "assistant".into(),
                        kind: agent::UserMessageKind::Normal,
                        parts: vec![MessagePart::Text { text }],
                        created_at,
                        streaming: false,
                        ..Default::default()
                    },
                );
            }
        }
        TranscriptRecord::ThinkingSnapshot {
            turn_id,
            message_id,
            text,
            started_at,
            duration_ms,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_thinking_timing(turn, started_at, duration_ms, created_at);
            if let Some(index) = assistant_message_index(turn, &message_id) {
                apply_thinking_snapshot_part(&mut turn.messages[index], text, duration_ms);
            } else {
                upsert_message(
                    turn,
                    FoldedMessage {
                        id: message_id,
                        role: "assistant".into(),
                        kind: agent::UserMessageKind::Normal,
                        parts: vec![MessagePart::Thinking {
                            text,
                            tool_call_id: None,
                            duration_ms,
                        }],
                        created_at,
                        streaming: false,
                        ..Default::default()
                    },
                );
            }
        }
        TranscriptRecord::ToolCall {
            turn_id,
            tool_call,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_tool_call(turn, tool_call, created_at);
        }
        TranscriptRecord::Plan {
            turn_id,
            plan,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_plan(turn, plan, created_at);
        }
        TranscriptRecord::Permission {
            turn_id, request, ..
        } => {
            if let Some(turn) = turns.iter_mut().find(|turn| turn.id == turn_id) {
                turn.status = if request.status == "pending" {
                    TurnStatus::WaitingPermission
                } else {
                    turn.status
                };
            }
        }
        TranscriptRecord::TurnCompleted {
            turn_id,
            status,
            worked_ms,
            thinking_ms,
            usage,
            created_at,
            ..
        } => {
            if let Some(turn) = turns.iter_mut().find(|turn| turn.id == turn_id) {
                turn.status = status;
                turn.completed_at = Some(created_at);
                turn.worked_ms = worked_ms.filter(|ms| *ms > 0).or(turn.worked_ms);
                turn.thinking_ms = thinking_ms.filter(|ms| *ms > 0).or(turn.thinking_ms);
                if usage.is_some() {
                    turn.usage = usage;
                }
            }
        }
        TranscriptRecord::Usage {
            turn_id,
            usage,
            created_at,
        } => {
            let parsed = crate::service::agent_chat::types::parse_turn_usage(&usage);
            let index = turn_id
                .as_ref()
                .and_then(|id| turns.iter().position(|turn| turn.id == *id))
                .or_else(|| turns.len().checked_sub(1));
            if let Some(index) = index {
                if parsed.is_some() {
                    turns[index].usage = parsed;
                }
            }
            let _ = created_at;
        }
        TranscriptRecord::SessionLifecycle {
            turn_id,
            message_id,
            action,
            status,
            duration_ms,
            error,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_session_lifecycle(
                turn,
                message_id,
                action,
                status,
                duration_ms,
                error,
                created_at,
            );
        }
        TranscriptRecord::SessionConfigChange {
            turn_id,
            message_id,
            model,
            mode,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_session_config_change(turn, message_id, model, mode, created_at);
        }
        TranscriptRecord::SessionHint {
            turn_id,
            message_id,
            tone,
            kind,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_session_hint(turn, message_id, tone, kind, created_at);
        }
    }
}

fn assistant_message_index(turn: &FoldedTurn, message_id: &str) -> Option<usize> {
    turn.messages
        .iter()
        .rposition(|item| item.id == message_id)
        .or_else(|| {
            turn.messages
                .iter()
                .rposition(|item| item.role == "assistant")
        })
}

fn upsert_turn<'a>(
    turns: &'a mut Vec<FoldedTurn>,
    turn_id: &str,
    created_at: chrono::DateTime<Utc>,
) -> &'a mut FoldedTurn {
    if let Some(index) = turns.iter().position(|turn| turn.id == turn_id) {
        return &mut turns[index];
    }
    turns.push(FoldedTurn {
        id: turn_id.to_string(),
        status: TurnStatus::Running,
        messages: Vec::new(),
        created_at,
        ..Default::default()
    });
    turns.last_mut().expect("just pushed")
}

fn mark_thinking(turn: &mut FoldedTurn, at: chrono::DateTime<Utc>) {
    if turn.thinking_started_at.is_none() {
        turn.thinking_started_at = Some(at);
    }
    turn.thinking_ended_at = Some(at);
}

fn apply_thinking_timing(
    turn: &mut FoldedTurn,
    started_at: Option<chrono::DateTime<Utc>>,
    duration_ms: Option<u64>,
    at: chrono::DateTime<Utc>,
) {
    if let Some(start) = started_at {
        if turn.thinking_started_at.is_none() {
            turn.thinking_started_at = Some(start);
        }
        turn.thinking_ended_at = Some(at);
    } else {
        mark_thinking(turn, at);
    }
    if let Some(ms) = duration_ms.filter(|ms| *ms > 0) {
        turn.thinking_ms = Some(turn.thinking_ms.unwrap_or(0).saturating_add(ms));
    }
}

fn apply_thinking_snapshot_part(
    message: &mut FoldedMessage,
    text: String,
    duration_ms: Option<u64>,
) {
    if let Some(MessagePart::Thinking {
        tool_call_id: None,
        duration_ms: existing_duration,
        text: existing,
    }) = message.parts.last_mut()
    {
        if existing_duration.is_none() {
            *existing = text;
            *existing_duration = duration_ms;
            return;
        }
    }
    message.parts.push(MessagePart::Thinking {
        text,
        tool_call_id: None,
        duration_ms,
    });
}

fn merge_tool_call_part(existing: &MessagePart, incoming: MessagePart) -> MessagePart {
    let MessagePart::ToolCall {
        tool_call_id: existing_id,
        name: existing_name,
        title: existing_title,
        kind: existing_kind,
        status: existing_status,
        input: existing_input,
        output: existing_output,
        content: existing_content,
    } = existing
    else {
        return incoming;
    };
    let MessagePart::ToolCall {
        name,
        title,
        kind,
        status,
        input,
        output,
        content,
        ..
    } = incoming
    else {
        return incoming;
    };
    MessagePart::ToolCall {
        tool_call_id: existing_id.clone(),
        name: if agent::is_generic_tool_label(&name) && !existing_name.is_empty() {
            existing_name.clone()
        } else {
            name
        },
        title: match &title {
            Some(value) if agent::is_generic_tool_label(value) && existing_title.is_some() => {
                existing_title.clone()
            }
            Some(_) => title,
            None => existing_title.clone(),
        },
        kind: if kind == agent::AgentToolKind::Other
            && *existing_kind != agent::AgentToolKind::Other
        {
            *existing_kind
        } else {
            kind
        },
        status: status.or_else(|| existing_status.clone()),
        input: input.or_else(|| existing_input.clone()),
        output: output.or_else(|| existing_output.clone()),
        content: content.or_else(|| existing_content.clone()),
    }
}

fn apply_session_lifecycle(
    turn: &mut FoldedTurn,
    message_id: String,
    action: SessionLifecycleAction,
    status: SessionLifecycleStatus,
    duration_ms: Option<u64>,
    error: Option<String>,
    created_at: chrono::DateTime<Utc>,
) {
    let part = MessagePart::SessionLifecycle {
        action,
        status,
        duration_ms,
        error,
    };
    if let Some(index) = assistant_message_index(turn, &message_id) {
        let message = &mut turn.messages[index];
        if let Some(existing) = message
            .parts
            .iter_mut()
            .find(|item| matches!(item, MessagePart::SessionLifecycle { .. }))
        {
            *existing = part;
            return;
        }
        message.parts.insert(0, part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: message_id,
            role: "assistant".into(),
            kind: agent::UserMessageKind::Normal,
            parts: vec![part],
            created_at,
            streaming: false,
            ..Default::default()
        },
    );
}

fn apply_session_config_change(
    turn: &mut FoldedTurn,
    message_id: String,
    model: Option<super::types::SessionConfigValueChange>,
    mode: Option<super::types::SessionConfigValueChange>,
    created_at: chrono::DateTime<Utc>,
) {
    let part = MessagePart::SessionConfigChange { model, mode };
    if let Some(index) = assistant_message_index(turn, &message_id) {
        let message = &mut turn.messages[index];
        if let Some(existing) = message
            .parts
            .iter_mut()
            .find(|item| matches!(item, MessagePart::SessionConfigChange { .. }))
        {
            *existing = part;
            return;
        }
        let insert_at = message
            .parts
            .iter()
            .rposition(|item| matches!(item, MessagePart::SessionLifecycle { .. }))
            .map(|index| index + 1)
            .unwrap_or(0);
        message.parts.insert(insert_at, part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: message_id,
            role: "assistant".into(),
            kind: agent::UserMessageKind::Normal,
            parts: vec![part],
            created_at,
            streaming: false,
            ..Default::default()
        },
    );
}

fn apply_session_hint(
    turn: &mut FoldedTurn,
    message_id: String,
    tone: SessionHintTone,
    kind: String,
    created_at: chrono::DateTime<Utc>,
) {
    let part = MessagePart::SessionHint {
        tone,
        kind: kind.clone(),
    };
    if let Some(index) = assistant_message_index(turn, &message_id) {
        let message = &mut turn.messages[index];
        if let Some(existing) = message.parts.iter_mut().find(|item| {
            matches!(item, MessagePart::SessionHint { kind: existing_kind, .. } if existing_kind == &kind)
        }) {
            *existing = part;
            return;
        }
        let insert_at = message
            .parts
            .iter()
            .rposition(|item| {
                matches!(
                    item,
                    MessagePart::SessionLifecycle { .. }
                        | MessagePart::SessionConfigChange { .. }
                        | MessagePart::SessionHint { .. }
                )
            })
            .map(|index| index + 1)
            .unwrap_or(0);
        message.parts.insert(insert_at, part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: message_id,
            role: "assistant".into(),
            kind: agent::UserMessageKind::Normal,
            parts: vec![part],
            created_at,
            streaming: false,
            ..Default::default()
        },
    );
}

fn apply_plan(turn: &mut FoldedTurn, plan: serde_json::Value, created_at: chrono::DateTime<Utc>) {
    let part = MessagePart::Plan { plan };
    if let Some(message) = turn
        .messages
        .iter_mut()
        .rev()
        .find(|message| message.role == "assistant")
    {
        if let Some(existing) = message
            .parts
            .iter_mut()
            .find(|item| matches!(item, MessagePart::Plan { .. }))
        {
            *existing = part;
            return;
        }
        message.parts.push(part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: format!("plan-{}", turn.id),
            role: "assistant".into(),
            kind: agent::UserMessageKind::Normal,
            parts: vec![part],
            created_at,
            streaming: false,
            ..Default::default()
        },
    );
}

fn apply_tool_call(
    turn: &mut FoldedTurn,
    tool_call: agent::AgentToolCall,
    created_at: chrono::DateTime<Utc>,
) {
    let assistant = turn
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant");
    let existing_name = assistant.and_then(|message| {
        message.parts.iter().find_map(|part| match part {
            MessagePart::ToolCall {
                tool_call_id, name, ..
            } if tool_call_id == &tool_call.tool_call_id => Some(name.clone()),
            _ => None,
        })
    });
    let existing_thinking = assistant.is_some_and(|message| {
        message.parts.iter().any(|part| {
            matches!(
                part,
                MessagePart::Thinking {
                    tool_call_id: Some(id),
                    ..
                } if id == &tool_call.tool_call_id
            )
        })
    });
    let generic = {
        let label = tool_call.name.trim().to_ascii_lowercase();
        label.is_empty() || label == "tool" || label == "other" || label == "unknown"
    };
    let name = if generic {
        existing_name.unwrap_or_else(|| tool_call.name.clone())
    } else {
        tool_call.name.clone()
    };
    let classified = if existing_thinking && generic {
        agent::ClassifiedTool::Thinking
    } else {
        agent::classify_tool(&name, tool_call.title.as_deref(), tool_call.input.as_ref())
    };
    if matches!(classified, agent::ClassifiedTool::Thinking) {
        mark_thinking(turn, created_at);
    }
    let part = match classified {
        agent::ClassifiedTool::Hide => return,
        agent::ClassifiedTool::Thinking => MessagePart::Thinking {
            text: agent::thinking_text(
                tool_call.title.as_deref(),
                tool_call.input.as_ref(),
                tool_call.output.as_ref(),
            ),
            tool_call_id: Some(tool_call.tool_call_id.clone()),
            duration_ms: None,
        },
        agent::ClassifiedTool::Plan => {
            let plan = agent::plan_from_tool_input(tool_call.input.as_ref())
                .unwrap_or(serde_json::json!({ "entries": [] }));
            MessagePart::Plan { plan }
        }
        agent::ClassifiedTool::Call(kind) => MessagePart::ToolCall {
            tool_call_id: tool_call.tool_call_id.clone(),
            name,
            title: tool_call.title,
            kind,
            status: tool_call.status,
            input: tool_call.input,
            output: tool_call.output,
            content: tool_call.content,
        },
    };
    if let Some(message) = turn
        .messages
        .iter_mut()
        .rev()
        .find(|message| message.role == "assistant")
    {
        match &part {
            MessagePart::Thinking {
                tool_call_id: Some(id),
                ..
            } => {
                if let Some(existing) = message.parts.iter_mut().find(|item| {
                    matches!(
                        item,
                        MessagePart::Thinking {
                            tool_call_id: Some(existing_id),
                            ..
                        } if existing_id == id
                    )
                }) {
                    *existing = part;
                    return;
                }
            }
            MessagePart::Plan { .. } => {
                if let Some(existing) = message
                    .parts
                    .iter_mut()
                    .find(|item| matches!(item, MessagePart::Plan { .. }))
                {
                    *existing = part;
                    return;
                }
            }
            MessagePart::ToolCall { tool_call_id, .. } => {
                if let Some(existing) = message.parts.iter_mut().find(|item| {
                    matches!(item, MessagePart::ToolCall { tool_call_id: existing_id, .. } if existing_id == tool_call_id)
                }) {
                    *existing = merge_tool_call_part(existing, part);
                    return;
                }
            }
            _ => {}
        }
        message.parts.push(part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: format!("tool-{}", tool_call.tool_call_id),
            role: "assistant".into(),
            kind: agent::UserMessageKind::Normal,
            parts: vec![part],
            created_at,
            streaming: false,
            ..Default::default()
        },
    );
}

fn upsert_message(turn: &mut FoldedTurn, message: FoldedMessage) {
    if let Some(existing) = turn.messages.iter_mut().find(|item| item.id == message.id) {
        *existing = message;
    } else {
        turn.messages.push(message);
    }
}

fn require_chat_id(id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| ServiceError::Validation("chat id must be a UUID".into()))
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io_err)?;
    }
    let tmp = path.with_file_name(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("file")
    ));
    let body = serde_json::to_vec_pretty(value)
        .map_err(|e| ServiceError::Processing(format!("json encode: {e}")))?;
    {
        let mut file = File::create(&tmp).map_err(io_err)?;
        file.write_all(&body).map_err(io_err)?;
        file.sync_all().map_err(io_err)?;
    }
    fs::rename(&tmp, path).map_err(io_err)?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let text = fs::read_to_string(path).map_err(io_err)?;
    serde_json::from_str(&text)
        .map_err(|e| ServiceError::Processing(format!("invalid json {}: {e}", path.display())))
}

fn io_err(error: std::io::Error) -> ServiceError {
    ServiceError::Processing(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent::UserMessageKind;

    fn store() -> (tempfile::TempDir, AgentChatStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = AgentChatStore::new(dir.path().to_path_buf());
        (dir, store)
    }

    fn create(store: &AgentChatStore, cwd: &str) -> AgentChatMeta {
        store
            .create(CreateAgentChatRequest {
                workspace_id: None,
                project_id: None,
                space_id: None,
                cwd: cwd.into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                mode: None,
                title: None,
            })
            .unwrap()
    }

    #[test]
    fn save_attachment_stays_in_chat_dir() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let path = store
            .save_attachment(&meta.id, "note.txt", b"hello")
            .unwrap();
        assert!(path.starts_with(store.dir_for(&meta.id).join("attachments")));
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        store
            .validate_attachment_paths(&meta.id, &[path.to_string_lossy().into()])
            .unwrap();
        let escaped = _dir.path().join("outside.txt");
        fs::write(&escaped, b"nope").unwrap();
        assert!(store
            .validate_attachment_paths(&meta.id, &[escaped.to_string_lossy().into()])
            .is_err());
    }

    #[test]
    fn s3_chat_id_is_not_persistence_handle() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        assert!(uuid::Uuid::parse_str(&meta.id).is_ok());
        assert!(meta.persistence_handle.is_none());
        assert_ne!(meta.persistence_handle.as_deref(), Some(meta.id.as_str()));
        let on_disk: AgentChatMeta = serde_json::from_str(
            &fs::read_to_string(store.dir_for(&meta.id).join("meta.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(on_disk.id, meta.id);
        assert!(on_disk.persistence_handle.is_none());
    }

    #[test]
    fn available_commands_round_trip_on_meta() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        store
            .update_meta(&meta.id, |row| {
                row.available_commands = vec![agent::AgentAvailableCommand {
                    name: "plan".into(),
                    description: "Create a plan".into(),
                    hint: Some("what to plan".into()),
                }];
            })
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        assert_eq!(snapshot.meta.available_commands.len(), 1);
        assert_eq!(snapshot.meta.available_commands[0].name, "plan");
        assert_eq!(
            snapshot.meta.available_commands[0].hint.as_deref(),
            Some("what to plan")
        );
    }

    #[test]
    fn s4_get_folds_transcript_without_provider() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "turn-1".to_string();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.clone(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: turn_id.clone(),
                    message_id: "m1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello".into(),
                    attachments: Vec::new(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id,
                    message_id: "m2".into(),
                    text: "world".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        assert_eq!(snapshot.messages.len(), 2);
        match &snapshot.messages[1].parts[0] {
            MessagePart::Text { text } => assert_eq!(text, "world"),
            other => panic!("expected text part, got {other:?}"),
        }
    }

    #[test]
    fn assistant_snapshot_keeps_tool_parts() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: agent::AgentToolCall {
                        tool_call_id: "tool-1".into(),
                        name: "Read".into(),
                        title: Some("Read file".into()),
                        kind: agent::AgentToolKind::Read,
                        status: Some("completed".into()),
                        input: None,
                        output: None,
                        content: None,
                    },
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "tool-tool-1".to_string(),
                    text: "done".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let parts = &snapshot.messages[0].parts;
        assert!(
            parts
                .iter()
                .any(|part| matches!(part, MessagePart::ToolCall { tool_call_id, .. } if tool_call_id == "tool-1")),
            "tool part dropped: {parts:?}"
        );
        assert!(
            parts
                .iter()
                .any(|part| matches!(part, MessagePart::Text { text } if text == "done")),
            "text part missing: {parts:?}"
        );
        let tool_index = parts.iter().position(|part| {
            matches!(part, MessagePart::ToolCall { tool_call_id, .. } if tool_call_id == "tool-1")
        });
        let text_index = parts
            .iter()
            .position(|part| matches!(part, MessagePart::Text { text } if text == "done"));
        assert!(
            tool_index.is_some_and(|tool| text_index.is_some_and(|text| tool < text)),
            "process parts should stay above the final answer: {parts:?}"
        );
    }

    #[test]
    fn tool_call_update_keeps_input_when_later_event_omits_it() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: agent::AgentToolCall {
                        tool_call_id: "tool-1".into(),
                        name: "Read".into(),
                        title: Some("Read".into()),
                        kind: agent::AgentToolKind::Read,
                        status: Some("running".into()),
                        input: Some(serde_json::json!({
                            "path": "/tmp/app/README.md",
                            "offset": 1,
                            "limit": 200
                        })),
                        output: None,
                        content: None,
                    },
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: agent::AgentToolCall {
                        tool_call_id: "tool-1".into(),
                        name: "Read".into(),
                        title: Some("Read".into()),
                        kind: agent::AgentToolKind::Read,
                        status: Some("completed".into()),
                        input: None,
                        output: Some(serde_json::json!("# hi\n")),
                        content: None,
                    },
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let MessagePart::ToolCall {
            input,
            output,
            status,
            ..
        } = &snapshot.messages[0].parts[0]
        else {
            panic!("expected tool call");
        };
        assert_eq!(status.as_deref(), Some("completed"));
        assert_eq!(
            input
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(|value| value.as_str()),
            Some("/tmp/app/README.md")
        );
        assert_eq!(
            output.as_ref().and_then(|value| value.as_str()),
            Some("# hi\n")
        );
    }

    #[test]
    fn restored_assistant_keeps_process_parts_above_answer() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "early".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: agent::AgentToolCall {
                        tool_call_id: "tool-1".into(),
                        name: "Read".into(),
                        title: Some("Read file".into()),
                        kind: agent::AgentToolKind::Read,
                        status: Some("completed".into()),
                        input: None,
                        output: None,
                        content: None,
                    },
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "think".into(),
                    text: "hmm".into(),
                    started_at: None,
                    duration_ms: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "final answer".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let parts = &snapshot.messages[0].parts;
        let kinds: Vec<&str> = parts
            .iter()
            .map(|part| match part {
                MessagePart::Thinking { .. } => "thinking",
                MessagePart::ToolCall { .. } => "tool",
                MessagePart::Text { text } => text.as_str(),
                _ => "other",
            })
            .collect();
        assert_eq!(kinds, ["tool", "thinking", "final answer"]);
    }

    #[test]
    fn flatten_stamps_turn_timing_on_assistant() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: turn_id.into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hi".into(),
                    attachments: Vec::new(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "think".into(),
                    text: "hmm".into(),
                    started_at: None,
                    duration_ms: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "hello".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn_id.into(),
                    status: TurnStatus::Completed,
                    error: None,
                    worked_ms: Some(14_000),
                    thinking_ms: Some(4_000),
                    usage: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert_eq!(assistant.worked_ms, Some(14_000));
        assert_eq!(assistant.thinking_ms, Some(4_000));
        assert!(assistant.completed_at.is_some());
    }

    #[test]
    fn restore_thinking_duration_from_snapshot_when_turn_omits_it() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        let started = Utc::now() - chrono::Duration::seconds(12);
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: started,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "think".into(),
                    text: "hmm".into(),
                    started_at: Some(started),
                    duration_ms: Some(12_000),
                    created_at: started + chrono::Duration::seconds(12),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn_id.into(),
                    status: TurnStatus::Completed,
                    error: None,
                    worked_ms: Some(20_000),
                    thinking_ms: Some(0),
                    usage: None,
                    created_at: started + chrono::Duration::seconds(20),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert_eq!(assistant.thinking_ms, Some(12_000));
    }

    #[test]
    fn interleaved_thinking_snapshots_keep_their_own_durations() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        let started = Utc::now() - chrono::Duration::seconds(45);
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: started,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "first pass".into(),
                    started_at: Some(started),
                    duration_ms: Some(5_000),
                    created_at: started + chrono::Duration::seconds(5),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: agent::AgentToolCall {
                        tool_call_id: "tool-1".into(),
                        name: "Read".into(),
                        title: Some("Read file".into()),
                        kind: agent::AgentToolKind::Read,
                        status: Some("completed".into()),
                        input: None,
                        output: None,
                        content: None,
                    },
                    created_at: started + chrono::Duration::seconds(10),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "second pass".into(),
                    started_at: Some(started + chrono::Duration::seconds(12)),
                    duration_ms: Some(8_000),
                    created_at: started + chrono::Duration::seconds(20),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnCompleted {
                    turn_id: turn_id.into(),
                    status: TurnStatus::Completed,
                    error: None,
                    worked_ms: Some(45_000),
                    thinking_ms: Some(13_000),
                    usage: None,
                    created_at: started + chrono::Duration::seconds(45),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert_eq!(assistant.thinking_ms, Some(13_000));
        let thinking: Vec<_> = assistant
            .parts
            .iter()
            .filter_map(|part| match part {
                MessagePart::Thinking {
                    text, duration_ms, ..
                } => Some((text.as_str(), *duration_ms)),
                _ => None,
            })
            .collect();
        assert_eq!(
            thinking,
            vec![("first pass", Some(5_000)), ("second pass", Some(8_000)),]
        );
    }

    #[test]
    fn session_lifecycle_folds_to_one_part_and_stays_first() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t-session";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: turn_id.into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello".into(),
                    attachments: Vec::new(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionLifecycle {
                    turn_id: turn_id.into(),
                    message_id: "session-t-session".into(),
                    action: SessionLifecycleAction::Create,
                    status: SessionLifecycleStatus::Running,
                    duration_ms: None,
                    error: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ThinkingSnapshot {
                    turn_id: turn_id.into(),
                    message_id: "a1".into(),
                    text: "hmm".into(),
                    started_at: None,
                    duration_ms: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionLifecycle {
                    turn_id: turn_id.into(),
                    message_id: "session-t-session".into(),
                    action: SessionLifecycleAction::Create,
                    status: SessionLifecycleStatus::Completed,
                    duration_ms: Some(2400),
                    error: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        let kinds: Vec<&str> = assistant
            .parts
            .iter()
            .map(|part| match part {
                MessagePart::SessionLifecycle { .. } => "session",
                MessagePart::Thinking { .. } => "thinking",
                other => panic!("unexpected part {other:?}"),
            })
            .collect();
        assert_eq!(kinds, ["session", "thinking"]);
        match &assistant.parts[0] {
            MessagePart::SessionLifecycle {
                action,
                status,
                duration_ms,
                ..
            } => {
                assert_eq!(*action, SessionLifecycleAction::Create);
                assert_eq!(*status, SessionLifecycleStatus::Completed);
                assert_eq!(*duration_ms, Some(2400));
            }
            other => panic!("expected session lifecycle, got {other:?}"),
        }
        let jsonl = fs::read_to_string(store.dir_for(&meta.id).join("transcript.jsonl")).unwrap();
        assert_eq!(
            jsonl
                .lines()
                .filter(|line| line.contains("\"type\":\"session_lifecycle\""))
                .count(),
            2
        );
    }

    #[test]
    fn session_config_change_folds_after_session_lifecycle() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t-config";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: turn_id.into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello".into(),
                    attachments: Vec::new(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionLifecycle {
                    turn_id: turn_id.into(),
                    message_id: "session-t-config".into(),
                    action: SessionLifecycleAction::Resume,
                    status: SessionLifecycleStatus::Completed,
                    duration_ms: Some(400),
                    error: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionConfigChange {
                    turn_id: turn_id.into(),
                    message_id: "config-t-config".into(),
                    model: Some(SessionConfigValueChange {
                        from: Some("opus".into()),
                        to: "grok-4".into(),
                    }),
                    mode: Some(SessionConfigValueChange {
                        from: None,
                        to: "plan".into(),
                    }),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        let kinds: Vec<&str> = assistant
            .parts
            .iter()
            .map(|part| match part {
                MessagePart::SessionLifecycle { .. } => "session",
                MessagePart::SessionConfigChange { .. } => "config",
                other => panic!("unexpected part {other:?}"),
            })
            .collect();
        assert_eq!(kinds, ["session", "config"]);
    }

    #[test]
    fn session_hint_folds_after_session_chrome() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t-hint";
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: turn_id.into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello".into(),
                    attachments: Vec::new(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionLifecycle {
                    turn_id: turn_id.into(),
                    message_id: "session-t-hint".into(),
                    action: SessionLifecycleAction::Create,
                    status: SessionLifecycleStatus::Completed,
                    duration_ms: Some(400),
                    error: None,
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::SessionHint {
                    turn_id: turn_id.into(),
                    message_id: "hint-t-hint-model_switch_failed".into(),
                    tone: SessionHintTone::Warning,
                    kind: "model_switch_failed".into(),
                    created_at: Utc::now(),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        let kinds: Vec<&str> = assistant
            .parts
            .iter()
            .map(|part| match part {
                MessagePart::SessionLifecycle { .. } => "session",
                MessagePart::SessionHint { kind, .. } => kind.as_str(),
                other => panic!("unexpected part {other:?}"),
            })
            .collect();
        assert_eq!(kinds, ["session", "model_switch_failed"]);
    }

    fn execute_tool(id: &str) -> agent::AgentToolCall {
        agent::AgentToolCall {
            tool_call_id: id.into(),
            name: "Execute".into(),
            title: Some("ls".into()),
            kind: agent::AgentToolKind::Execute,
            status: Some("completed".into()),
            input: Some(serde_json::json!({ "command": "ls" })),
            output: None,
            content: None,
        }
    }

    #[test]
    fn later_plan_updates_do_not_drop_tools() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        let now = Utc::now();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: turn_id.into(),
                    created_at: now,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: execute_tool("t1"),
                    created_at: now,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::Plan {
                    turn_id: turn_id.into(),
                    plan: serde_json::json!({ "entries": [{ "content": "one" }] }),
                    created_at: now,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: execute_tool("t2"),
                    created_at: now,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::Plan {
                    turn_id: turn_id.into(),
                    plan: serde_json::json!({ "entries": [{ "content": "two" }] }),
                    created_at: now,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::ToolCall {
                    turn_id: turn_id.into(),
                    tool_call: execute_tool("t3"),
                    created_at: now,
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        let tool_ids: Vec<_> = assistant
            .parts
            .iter()
            .filter_map(|part| match part {
                MessagePart::ToolCall { tool_call_id, .. } => Some(tool_call_id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(tool_ids, ["t1", "t2", "t3"], "parts={:?}", assistant.parts);
        assert_eq!(
            assistant
                .parts
                .iter()
                .filter(|part| matches!(part, MessagePart::Plan { .. }))
                .count(),
            1
        );
    }

    #[test]
    fn running_turn_snapshot_projects_live_worked_ms() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let started = Utc::now() - chrono::Duration::seconds(14);
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::TurnStarted {
                    turn_id: "t1".into(),
                    created_at: started,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::UserMessage {
                    turn_id: "t1".into(),
                    message_id: "u1".into(),
                    kind: UserMessageKind::Normal,
                    text: "hello".into(),
                    attachments: Vec::new(),
                    created_at: started,
                },
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &TranscriptRecord::AssistantSnapshot {
                    turn_id: "t1".into(),
                    message_id: "a1".into(),
                    text: "working".into(),
                    created_at: started + chrono::Duration::seconds(1),
                },
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        assert!(snapshot.running_turn_id.is_some());
        assert_eq!(snapshot.running_turn_started_at, Some(started));
        let assistant = snapshot
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .expect("assistant");
        assert!(assistant.streaming);
        let worked = assistant.worked_ms.expect("live worked_ms");
        assert!(
            (14_000..16_000).contains(&worked),
            "expected ~14s live elapsed, got {worked}"
        );
    }

    #[test]
    fn flatten_uniqueifies_reused_assistant_ids_across_turns() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        for (turn_id, user_id, text) in [("t1", "u1", "first"), ("t2", "u2", "second")] {
            store
                .append_record(
                    &meta.id,
                    &TranscriptRecord::TurnStarted {
                        turn_id: turn_id.into(),
                        created_at: Utc::now(),
                    },
                )
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &TranscriptRecord::UserMessage {
                        turn_id: turn_id.into(),
                        message_id: user_id.into(),
                        kind: UserMessageKind::Normal,
                        text: text.into(),
                        attachments: Vec::new(),
                        created_at: Utc::now(),
                    },
                )
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &TranscriptRecord::AssistantSnapshot {
                        turn_id: turn_id.into(),
                        message_id: "a-reused".into(),
                        text: text.into(),
                        created_at: Utc::now(),
                    },
                )
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &TranscriptRecord::TurnCompleted {
                        turn_id: turn_id.into(),
                        status: TurnStatus::Completed,
                        error: None,
                        worked_ms: None,
                        thinking_ms: None,
                        usage: None,
                        created_at: Utc::now(),
                    },
                )
                .unwrap();
        }
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let ids: Vec<_> = snapshot
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect();
        let unique: std::collections::HashSet<_> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique.len(), "duplicate message ids: {ids:?}");
        assert_eq!(snapshot.messages.len(), 4);
    }

    #[test]
    fn s5_list_groups_by_cwd() {
        let (_dir, store) = store();
        create(&store, "/tmp/a");
        create(&store, "/tmp/b");
        let listed = store.list(None, None, None, false, false, None).unwrap();
        let mut cwds: Vec<_> = listed.iter().map(|e| e.cwd.as_str()).collect();
        cwds.sort();
        cwds.dedup();
        assert_eq!(cwds, ["/tmp/a", "/tmp/b"]);
        assert_eq!(
            store
                .list(Some("/tmp/a"), None, None, false, false, None)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn unscoped_list_is_scratch_only_until_all() {
        let (_dir, store) = store();
        create(&store, "/tmp/scratch");
        store
            .create(CreateAgentChatRequest {
                workspace_id: Some("ws-1".into()),
                project_id: Some("proj-1".into()),
                space_id: None,
                cwd: "/tmp/workspace".into(),
                origin: AgentChatOrigin::Normal,
                provider_id: "claude".into(),
                model: None,
                thinking: None,
                mode: None,
                title: Some("Workspace chat".into()),
            })
            .unwrap();
        assert_eq!(
            store
                .list(None, None, None, false, false, None)
                .unwrap()
                .len(),
            1
        );
        let all = store.list(None, None, None, false, true, None).unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().any(|entry| entry.cwd == "/tmp/workspace"));
        assert_eq!(
            store
                .list(None, Some("ws-1"), None, false, false, None)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn list_can_filter_quick_origin_across_directories() {
        let (_dir, store) = store();
        create(&store, "/tmp/scratch");
        store
            .create(CreateAgentChatRequest {
                workspace_id: Some("ws-1".into()),
                project_id: Some("proj-1".into()),
                space_id: None,
                cwd: "/tmp/workspace".into(),
                origin: AgentChatOrigin::Quick,
                provider_id: "claude".into(),
                model: None,
                thinking: None,
                mode: None,
                title: Some("Quick chat".into()),
            })
            .unwrap();
        let quick = store
            .list(None, None, None, false, true, Some(AgentChatOrigin::Quick))
            .unwrap();
        assert_eq!(quick.len(), 1);
        assert_eq!(quick[0].cwd, "/tmp/workspace");
        assert_eq!(quick[0].origin, AgentChatOrigin::Quick);
        assert_eq!(
            store
                .list(None, None, None, false, true, Some(AgentChatOrigin::Normal))
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn s6_rename_and_soft_delete() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let renamed = store.rename(&meta.id, "My chat").unwrap();
        assert_eq!(renamed.title.as_deref(), Some("My chat"));
        let deleted = store.delete(&meta.id).unwrap();
        assert!(deleted.deleted);
        assert!(store
            .list(None, None, None, false, false, None)
            .unwrap()
            .is_empty());
        assert_eq!(
            store
                .list(None, None, None, true, false, None)
                .unwrap()
                .len(),
            1
        );
        let on_disk: AgentChatMeta = serde_json::from_str(
            &fs::read_to_string(store.dir_for(&meta.id).join("meta.json")).unwrap(),
        )
        .unwrap();
        assert!(on_disk.deleted);
        assert_eq!(on_disk.title.as_deref(), Some("My chat"));
    }
}
