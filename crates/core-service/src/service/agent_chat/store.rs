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
    apply_rewind_view, chat_descriptor, flatten_messages, AgentChatIndexEntry, AgentChatMeta,
    AgentChatOrigin, AgentChatSnapshot, CreateAgentChatRequest, FoldedMessage, FoldedTurn,
    MessagePart, QueueItem, RuntimeStatus, SessionHintTone, SessionLifecycleAction,
    SessionLifecycleStatus, TranscriptEnvelope, TranscriptEvent, TurnStatus,
};
use agent::{AgentCurrentConfig, AgentTool, AgentToolKind, AgentToolParams};

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
            provider_id: req.provider_id.clone(),
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::Detached,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            applied_permission_mode: None,
            applied_fast: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: chat_descriptor(
                &req.provider_id,
                AgentCurrentConfig {
                    model: req.model,
                    thinking: req.thinking,
                    mode: req.mode,
                    permission_mode: req.permission_mode,
                    fast: req.fast,
                },
            ),
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
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

    pub fn create_fork_sibling(
        &self,
        parent_id: &str,
        persistence_handle: String,
        cwd: Option<String>,
    ) -> Result<AgentChatMeta> {
        let parent = self.get_meta(parent_id)?;
        let child = self.create(CreateAgentChatRequest {
            workspace_id: parent.workspace_id.clone(),
            project_id: parent.project_id.clone(),
            space_id: parent.space_id.clone(),
            cwd: cwd.unwrap_or_else(|| parent.cwd.clone()),
            origin: parent.origin,
            provider_id: parent.provider_id.clone(),
            model: parent.descriptor.current_config.model.clone(),
            thinking: parent.descriptor.current_config.thinking.clone(),
            mode: parent.descriptor.current_config.mode.clone(),
            permission_mode: parent.descriptor.current_config.permission_mode.clone(),
            fast: parent.descriptor.current_config.fast.clone(),
            title: parent.title.clone(),
        })?;
        let src = self.dir_for(parent_id).join("transcript.jsonl");
        let dst = self.dir_for(&child.id).join("transcript.jsonl");
        if src.exists() {
            fs::copy(&src, &dst).map_err(io_err)?;
        }
        let rewind_view = parent.rewind_view.clone();
        let descriptor = parent.descriptor.clone();
        let parent_chat_id = parent.id.clone();
        if persistence_handle == child.id {
            return Err(ServiceError::Processing(
                "chat id must not equal persistence handle".into(),
            ));
        }
        self.update_meta(&child.id, |meta| {
            meta.parent_chat_id = Some(parent_chat_id);
            meta.persistence_handle = Some(persistence_handle);
            meta.rewind_view = rewind_view;
            meta.descriptor = descriptor;
            meta.runtime_status = RuntimeStatus::Detached;
        })
    }

    pub fn get_meta(&self, id: &str) -> Result<AgentChatMeta> {
        require_chat_id(id)?;
        let path = self.dir_for(id).join("meta.json");
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("agent chat {id}")));
        }
        let mut meta = read_json::<AgentChatMeta>(&path)?;
        meta.after_load();
        self.apply_live_seq(&mut meta);
        Ok(meta)
    }

    pub fn get_snapshot(&self, id: &str) -> Result<AgentChatSnapshot> {
        require_chat_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("agent chat lock");
        let meta = self.get_meta(id)?;
        let turns = fold_transcript(&self.dir_for(id).join("transcript.jsonl"))?;
        let turns = apply_rewind_view(turns, meta.rewind_view.as_ref());
        let queue = self.read_queue_unlocked(id)?;
        let pending_permission =
            last_pending_permission(&self.dir_for(id).join("transcript.jsonl"))?;
        let pending_session_op = meta
            .pending_session_op
            .as_ref()
            .map(|pending| pending.request.clone());
        let (messages, running_turn_id, running_turn_started_at) = flatten_messages(turns);
        Ok(AgentChatSnapshot {
            meta,
            messages,
            queue,
            pending_permission,
            pending_session_op,
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

    pub fn append_record(&self, id: &str, record: &TranscriptEnvelope) -> Result<()> {
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
        let mut meta = read_json::<AgentChatMeta>(&path)?;
        meta.after_load();
        Ok(meta)
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
                if let Ok(mut meta) = read_json::<AgentChatMeta>(&meta_path) {
                    meta.after_load();
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
        if let Ok(TranscriptEnvelope {
            event: TranscriptEvent::Permission { request },
            ..
        }) = serde_json::from_str(&line)
        {
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
        let Ok(record) = serde_json::from_str::<TranscriptEnvelope>(&line) else {
            continue;
        };
        apply_record(&mut turns, record);
    }
    Ok(turns)
}

fn apply_record(turns: &mut Vec<FoldedTurn>, envelope: TranscriptEnvelope) {
    let turn_id = envelope.turn_id.clone().unwrap_or_else(|| "unknown".into());
    let created_at = envelope.timestamp;
    match envelope.event {
        TranscriptEvent::TurnStarted => {
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
        TranscriptEvent::UserMessage {
            message_id,
            kind,
            text,
            attachments,
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
        TranscriptEvent::UserCheckpoint { checkpoint_id } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            if let Some(user) = turn
                .messages
                .iter_mut()
                .find(|message| message.role == "user")
            {
                user.checkpoint_id = Some(checkpoint_id);
            }
        }
        TranscriptEvent::AssistantSnapshot { message_id, text } => {
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
        TranscriptEvent::ThinkingSnapshot {
            message_id,
            text,
            started_at,
            duration_ms,
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
        TranscriptEvent::ToolCall { tool } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_tool_call(turn, tool, created_at);
        }
        TranscriptEvent::Plan { plan } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_plan(turn, plan, created_at);
        }
        TranscriptEvent::Permission { request } => {
            if let Some(turn) = turns.iter_mut().find(|turn| turn.id == turn_id) {
                turn.status = if request.status == "pending" {
                    TurnStatus::WaitingPermission
                } else {
                    turn.status
                };
            }
        }
        TranscriptEvent::TurnCompleted {
            status,
            error,
            worked_ms,
            thinking_ms,
            usage,
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
                if let Some(message) = error.filter(|value| !value.trim().is_empty()) {
                    turn.messages.push(FoldedMessage {
                        id: format!("error-{turn_id}"),
                        role: "assistant".into(),
                        parts: vec![MessagePart::Error { message }],
                        created_at,
                        ..FoldedMessage::default()
                    });
                }
            }
        }
        TranscriptEvent::Usage { usage } => {
            let parsed = crate::service::agent_chat::types::parse_turn_usage(&usage);
            let index = turns
                .iter()
                .position(|turn| turn.id == turn_id)
                .or_else(|| turns.len().checked_sub(1));
            if let Some(index) = index {
                if parsed.is_some() {
                    turns[index].usage = parsed;
                }
            }
        }
        TranscriptEvent::SessionLifecycle {
            message_id,
            action,
            status,
            duration_ms,
            error,
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
        TranscriptEvent::SessionConfigChange {
            message_id,
            model,
            mode,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_session_config_change(turn, message_id, model, mode, created_at);
        }
        TranscriptEvent::SessionHint {
            message_id,
            tone,
            kind,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            apply_session_hint(turn, message_id, tone, kind, created_at);
        }
        TranscriptEvent::Unknown { .. } => {}
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
        params: existing_params,
        result: existing_result,
        ..
    } = existing
    else {
        return incoming;
    };
    let MessagePart::ToolCall {
        name,
        title,
        kind,
        status,
        params,
        result,
        ..
    } = incoming
    else {
        return incoming;
    };
    MessagePart::ToolCall {
        tool_call_id: existing_id.clone(),
        name: if name.is_empty() && !existing_name.is_empty() {
            existing_name.clone()
        } else {
            name
        },
        title: title.or_else(|| existing_title.clone()),
        kind: merge_tool_kind(*existing_kind, kind),
        status,
        params: merge_tool_params(existing_params, params),
        result: result.or_else(|| existing_result.clone()),
    }
}

fn merge_tool_kind(existing: AgentToolKind, incoming: AgentToolKind) -> AgentToolKind {
    if incoming == AgentToolKind::Other && existing != AgentToolKind::Other {
        return existing;
    }
    if existing == AgentToolKind::Search && incoming == AgentToolKind::WebSearch {
        return existing;
    }
    if existing == AgentToolKind::WebSearch && incoming == AgentToolKind::Search {
        return existing;
    }
    incoming
}

fn params_omitted(params: &AgentToolParams) -> bool {
    match params {
        AgentToolParams::Other { value } => {
            value.is_null() || value.as_object().is_some_and(|object| object.is_empty())
        }
        AgentToolParams::PlanDocument {
            name,
            overview,
            plan,
            todos,
            is_project,
            phases,
        } => {
            name.is_none()
                && overview.is_none()
                && plan.trim().is_empty()
                && todos.is_empty()
                && is_project.is_none()
                && phases.is_none()
        }
        _ => false,
    }
}

fn merge_tool_params(existing: &AgentToolParams, incoming: AgentToolParams) -> AgentToolParams {
    if params_omitted(&incoming) {
        return existing.clone();
    }
    match (existing, incoming) {
        (
            AgentToolParams::PlanDocument {
                name: existing_name,
                overview: existing_overview,
                plan: existing_plan,
                todos: existing_todos,
                is_project: existing_is_project,
                phases: existing_phases,
            },
            AgentToolParams::PlanDocument {
                name,
                overview,
                plan,
                todos,
                is_project,
                phases,
            },
        ) => AgentToolParams::PlanDocument {
            name: name.or_else(|| existing_name.clone()),
            overview: overview.or_else(|| existing_overview.clone()),
            plan: if plan.trim().is_empty() {
                existing_plan.clone()
            } else {
                plan
            },
            todos: if todos.is_empty() {
                existing_todos.clone()
            } else {
                todos
            },
            is_project: is_project.or(*existing_is_project),
            phases: phases.or_else(|| existing_phases.clone()),
        },
        (_, incoming) => incoming,
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

fn apply_tool_call(turn: &mut FoldedTurn, tool: AgentTool, created_at: chrono::DateTime<Utc>) {
    let assistant = turn
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant");
    let existing_name = assistant.and_then(|message| {
        message.parts.iter().find_map(|part| match part {
            MessagePart::ToolCall {
                tool_call_id, name, ..
            } if tool_call_id == &tool.tool_call_id => Some(name.clone()),
            _ => None,
        })
    });
    let name = if tool.name.is_empty() {
        existing_name.unwrap_or_else(|| tool.name.clone())
    } else {
        tool.name.clone()
    };
    let part = MessagePart::ToolCall {
        tool_call_id: tool.tool_call_id.clone(),
        name,
        title: tool.title,
        kind: tool.kind,
        status: tool.status,
        params: tool.params,
        result: tool.result,
    };
    if let Some(message) = turn
        .messages
        .iter_mut()
        .rev()
        .find(|message| message.role == "assistant")
    {
        if let Some(existing) = message.parts.iter_mut().find(|item| {
            matches!(item, MessagePart::ToolCall { tool_call_id, .. } if tool_call_id == &tool.tool_call_id)
        }) {
            *existing = merge_tool_call_part(existing, part);
            return;
        }
        message.parts.push(part);
        return;
    }
    upsert_message(
        turn,
        FoldedMessage {
            id: format!("tool-{}", tool.tool_call_id),
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
    use crate::service::agent_chat::types::{
        SessionConfigValueChange, TranscriptEnvelope, TranscriptEvent,
    };
    use agent::{
        AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus,
        UserMessageKind,
    };

    fn rec(turn_id: impl Into<String>, event: TranscriptEvent) -> TranscriptEnvelope {
        TranscriptEnvelope::new(turn_id, event)
    }

    fn rec_at(
        turn_id: impl Into<String>,
        timestamp: chrono::DateTime<Utc>,
        event: TranscriptEvent,
    ) -> TranscriptEnvelope {
        TranscriptEnvelope::at(turn_id, timestamp, event)
    }

    fn read_tool(
        id: &str,
        status: AgentToolStatus,
        params: AgentToolParams,
        result: Option<AgentToolResult>,
    ) -> AgentTool {
        AgentTool {
            tool_call_id: id.into(),
            name: "Read".into(),
            title: Some("Read file".into()),
            kind: AgentToolKind::Read,
            status,
            params,
            result,
        }
    }

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
                permission_mode: None,
                fast: None,
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
    fn app069_regression_old_meta_without_rewind_view_or_parent_loads() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let path = store.dir_for(&meta.id).join("meta.json");
        let loaded = store.get_meta(&meta.id).unwrap();
        assert!(loaded.parent_chat_id.is_none());
        assert!(loaded.rewind_view.is_none());
        let raw = fs::read_to_string(&path).unwrap();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let mut object = value.as_object().cloned().unwrap();
        object.remove("parent_chat_id");
        object.remove("rewind_view");
        object.remove("pending_session_op");
        fs::write(&path, serde_json::to_string(&object).unwrap()).unwrap();
        let again = store.get_meta(&meta.id).unwrap();
        assert!(again.parent_chat_id.is_none());
        assert!(again.rewind_view.is_none());
        assert!(again.pending_session_op.is_none());
    }

    #[test]
    fn app069_s14_rewind_view_omits_turns_after_until_id() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        store
            .append_record(&meta.id, &rec("turn-1", TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    "turn-1",
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "first".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(&meta.id, &rec("turn-2", TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    "turn-2",
                    TranscriptEvent::UserMessage {
                        message_id: "u2".into(),
                        kind: UserMessageKind::Normal,
                        text: "second".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .update_meta(&meta.id, |row| {
                row.rewind_view = Some(super::super::types::RewindView {
                    until_turn_id: "turn-1".into(),
                });
            })
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        assert_eq!(snapshot.messages.len(), 1);
        assert_eq!(snapshot.messages[0].id, "u1");
        let jsonl = fs::read_to_string(store.dir_for(&meta.id).join("transcript.jsonl")).unwrap();
        assert!(jsonl.contains("second"));
        store
            .update_meta(&meta.id, |row| {
                row.rewind_view = None;
            })
            .unwrap();
        let restored = store.get_snapshot(&meta.id).unwrap();
        assert!(restored.messages.iter().any(|message| message.id == "u1"));
        assert!(restored.messages.iter().any(|message| message.id == "u2"));
        let jsonl_after =
            fs::read_to_string(store.dir_for(&meta.id).join("transcript.jsonl")).unwrap();
        assert_eq!(jsonl, jsonl_after);
    }

    #[test]
    fn old_meta_without_descriptor_deserializes_stub_and_rewrite_drops_legacy_keys() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let path = store.dir_for(&meta.id).join("meta.json");
        fs::write(
            &path,
            serde_json::json!({
                "id": meta.id,
                "created_at": meta.created_at,
                "updated_at": meta.updated_at,
                "cwd": "/tmp/a",
                "provider_id": "claude",
                "supports_steer": true,
                "session_config_options": { "models": [{ "id": "opus", "name": "Opus" }] },
                "selected_model": "opus",
                "selected_thinking": "high",
                "selected_mode": "plan",
                "applied_model": "opus"
            })
            .to_string(),
        )
        .unwrap();
        let loaded = store.get_meta(&meta.id).unwrap();
        assert_eq!(loaded.descriptor.identity.id, "claude");
        assert!(loaded.descriptor.current_config.model.is_none());
        assert!(loaded.descriptor.supported_options.models.is_empty());
        assert_eq!(loaded.applied_model.as_deref(), Some("opus"));
        store.update_meta(&meta.id, |_| {}).unwrap();
        let rewritten = fs::read_to_string(&path).unwrap();
        assert!(!rewritten.contains("selected_model"));
        assert!(!rewritten.contains("supports_steer"));
        assert!(!rewritten.contains("session_config_options"));
        assert!(!rewritten.contains("selected_thinking"));
        assert!(!rewritten.contains("selected_mode"));
        assert!(rewritten.contains("\"descriptor\""));
        let persisted: AgentChatMeta = serde_json::from_str(&rewritten).unwrap();
        assert!(persisted.descriptor.current_config.model.is_none());
    }

    #[test]
    fn fold_skips_unparseable_pre_app068_jsonl_lines() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let path = store.dir_for(&meta.id).join("transcript.jsonl");
        fs::write(
            &path,
            "{\"type\":\"tool_call\",\"turn_id\":\"t1\",\"tool_call\":{\"tool_call_id\":\"old\",\"name\":\"Read\",\"kind\":\"read\",\"input\":{\"path\":\"/tmp/a\"}},\"created_at\":\"2026-01-01T00:00:00Z\"}\n",
        )
        .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let tool_count = snapshot
            .messages
            .iter()
            .flat_map(|message| message.parts.iter())
            .filter(|part| matches!(part, MessagePart::ToolCall { .. }))
            .count();
        assert_eq!(tool_count, 0);
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
                &rec(turn_id.clone(), TranscriptEvent::TurnStarted),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id.clone(),
                    TranscriptEvent::UserMessage {
                        message_id: "m1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hello".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "m2".into(),
                        text: "world".into(),
                    },
                ),
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
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ToolCall {
                        tool: read_tool(
                            "tool-1",
                            AgentToolStatus::Completed,
                            AgentToolParams::Read {
                                path: String::new(),
                                offset: None,
                                limit: None,
                            },
                            None,
                        ),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "tool-tool-1".to_string(),
                        text: "done".into(),
                    },
                ),
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
    fn tool_call_update_keeps_params_when_later_event_omits_them() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ToolCall {
                        tool: read_tool(
                            "tool-1",
                            AgentToolStatus::Running,
                            AgentToolParams::Read {
                                path: "/tmp/app/README.md".into(),
                                offset: Some(1),
                                limit: Some(200),
                            },
                            None,
                        ),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ToolCall {
                        tool: read_tool(
                            "tool-1",
                            AgentToolStatus::Completed,
                            AgentToolParams::Other {
                                value: serde_json::json!({}),
                            },
                            Some(AgentToolResult::Text {
                                text: "# hi\n".into(),
                            }),
                        ),
                    },
                ),
            )
            .unwrap();
        let snapshot = store.get_snapshot(&meta.id).unwrap();
        let MessagePart::ToolCall {
            params,
            result,
            status,
            ..
        } = &snapshot.messages[0].parts[0]
        else {
            panic!("expected tool call");
        };
        assert_eq!(*status, AgentToolStatus::Completed);
        match params {
            AgentToolParams::Read { path, .. } => {
                assert_eq!(path, "/tmp/app/README.md");
            }
            other => panic!("expected read params, got {other:?}"),
        }
        match result {
            Some(AgentToolResult::Text { text }) => assert_eq!(text, "# hi\n"),
            other => panic!("expected text result, got {other:?}"),
        }
        let part_json = serde_json::to_value(&snapshot.messages[0].parts[0]).unwrap();
        assert!(part_json.get("input").is_none());
        assert!(part_json.get("output").is_none());
        assert!(part_json.get("content").is_none());
        assert!(part_json.get("native").is_none());
    }

    #[test]
    fn restored_assistant_keeps_process_parts_above_answer() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        let turn_id = "t1";
        store
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "a1".into(),
                        text: "early".into(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ToolCall {
                        tool: read_tool(
                            "tool-1",
                            AgentToolStatus::Completed,
                            AgentToolParams::Read {
                                path: String::new(),
                                offset: None,
                                limit: None,
                            },
                            None,
                        ),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "think".into(),
                        text: "hmm".into(),
                        started_at: None,
                        duration_ms: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "a1".into(),
                        text: "final answer".into(),
                    },
                ),
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
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hi".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "think".into(),
                        text: "hmm".into(),
                        started_at: None,
                        duration_ms: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "a1".into(),
                        text: "hello".into(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Completed,
                        error: None,
                        worked_ms: Some(14_000),
                        thinking_ms: Some(4_000),
                        usage: None,
                    },
                ),
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
                &rec_at(turn_id, started, TranscriptEvent::TurnStarted),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(12),
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "think".into(),
                        text: "hmm".into(),
                        started_at: Some(started),
                        duration_ms: Some(12_000),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(20),
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Completed,
                        error: None,
                        worked_ms: Some(20_000),
                        thinking_ms: Some(0),
                        usage: None,
                    },
                ),
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
                &rec_at(turn_id, started, TranscriptEvent::TurnStarted),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(5),
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "a1".into(),
                        text: "first pass".into(),
                        started_at: Some(started),
                        duration_ms: Some(5_000),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(10),
                    TranscriptEvent::ToolCall {
                        tool: read_tool(
                            "tool-1",
                            AgentToolStatus::Completed,
                            AgentToolParams::Read {
                                path: String::new(),
                                offset: None,
                                limit: None,
                            },
                            None,
                        ),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(20),
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "a1".into(),
                        text: "second pass".into(),
                        started_at: Some(started + chrono::Duration::seconds(12)),
                        duration_ms: Some(8_000),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    started + chrono::Duration::seconds(45),
                    TranscriptEvent::TurnCompleted {
                        status: TurnStatus::Completed,
                        error: None,
                        worked_ms: Some(45_000),
                        thinking_ms: Some(13_000),
                        usage: None,
                    },
                ),
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
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hello".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionLifecycle {
                        message_id: "session-t-session".into(),
                        action: SessionLifecycleAction::Create,
                        status: SessionLifecycleStatus::Running,
                        duration_ms: None,
                        error: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::ThinkingSnapshot {
                        message_id: "a1".into(),
                        text: "hmm".into(),
                        started_at: None,
                        duration_ms: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionLifecycle {
                        message_id: "session-t-session".into(),
                        action: SessionLifecycleAction::Create,
                        status: SessionLifecycleStatus::Completed,
                        duration_ms: Some(2400),
                        error: None,
                    },
                ),
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
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hello".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionLifecycle {
                        message_id: "session-t-config".into(),
                        action: SessionLifecycleAction::Resume,
                        status: SessionLifecycleStatus::Completed,
                        duration_ms: Some(400),
                        error: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionConfigChange {
                        message_id: "config-t-config".into(),
                        model: Some(SessionConfigValueChange {
                            from: Some("opus".into()),
                            to: "grok-4".into(),
                        }),
                        mode: Some(SessionConfigValueChange {
                            from: None,
                            to: "plan".into(),
                        }),
                    },
                ),
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
            .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hello".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionLifecycle {
                        message_id: "session-t-hint".into(),
                        action: SessionLifecycleAction::Create,
                        status: SessionLifecycleStatus::Completed,
                        duration_ms: Some(400),
                        error: None,
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec(
                    turn_id,
                    TranscriptEvent::SessionHint {
                        message_id: "hint-t-hint-model_switch_failed".into(),
                        tone: SessionHintTone::Warning,
                        kind: "model_switch_failed".into(),
                    },
                ),
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

    fn execute_tool(id: &str) -> AgentTool {
        AgentTool {
            tool_call_id: id.into(),
            name: "Execute".into(),
            title: Some("ls".into()),
            kind: AgentToolKind::Execute,
            status: AgentToolStatus::Completed,
            params: AgentToolParams::Execute {
                command: "ls".into(),
                cwd: None,
                background: false,
                task_id: None,
            },
            result: None,
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
                &rec_at(turn_id, now, TranscriptEvent::TurnStarted),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    now,
                    TranscriptEvent::ToolCall {
                        tool: execute_tool("t1"),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    now,
                    TranscriptEvent::Plan {
                        plan: serde_json::json!({ "entries": [{ "content": "one" }] }),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    now,
                    TranscriptEvent::ToolCall {
                        tool: execute_tool("t2"),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    now,
                    TranscriptEvent::Plan {
                        plan: serde_json::json!({ "entries": [{ "content": "two" }] }),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    turn_id,
                    now,
                    TranscriptEvent::ToolCall {
                        tool: execute_tool("t3"),
                    },
                ),
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
                &rec_at("t1", started, TranscriptEvent::TurnStarted),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    "t1",
                    started,
                    TranscriptEvent::UserMessage {
                        message_id: "u1".into(),
                        kind: UserMessageKind::Normal,
                        text: "hello".into(),
                        attachments: Vec::new(),
                    },
                ),
            )
            .unwrap();
        store
            .append_record(
                &meta.id,
                &rec_at(
                    "t1",
                    started + chrono::Duration::seconds(1),
                    TranscriptEvent::AssistantSnapshot {
                        message_id: "a1".into(),
                        text: "working".into(),
                    },
                ),
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
                .append_record(&meta.id, &rec(turn_id, TranscriptEvent::TurnStarted))
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &rec(
                        turn_id,
                        TranscriptEvent::UserMessage {
                            message_id: user_id.into(),
                            kind: UserMessageKind::Normal,
                            text: text.into(),
                            attachments: Vec::new(),
                        },
                    ),
                )
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &rec(
                        turn_id,
                        TranscriptEvent::AssistantSnapshot {
                            message_id: "a-reused".into(),
                            text: text.into(),
                        },
                    ),
                )
                .unwrap();
            store
                .append_record(
                    &meta.id,
                    &rec(
                        turn_id,
                        TranscriptEvent::TurnCompleted {
                            status: TurnStatus::Completed,
                            error: None,
                            worked_ms: None,
                            thinking_ms: None,
                            usage: None,
                        },
                    ),
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
                permission_mode: None,
                fast: None,
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
                permission_mode: None,
                fast: None,
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
