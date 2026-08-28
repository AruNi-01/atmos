use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::Serialize;

use crate::error::{Result, ServiceError};

use super::types::{
    ConversationIndexEntry, ConversationMeta, ConversationSnapshot, CreateConversationRequest,
    FoldedMessage, FoldedTurn, MessagePart, QueueItem, RuntimeStatus, TranscriptRecord, TurnStatus,
};

pub struct ConversationStore {
    root: PathBuf,
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    index_lock: Mutex<()>,
}

impl ConversationStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            locks: Mutex::new(HashMap::new()),
            index_lock: Mutex::new(()),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn create(&self, req: CreateConversationRequest) -> Result<ConversationMeta> {
        let id = uuid::Uuid::new_v4().to_string();
        require_conversation_id(&id)?;
        if req.provider_id.trim().is_empty() {
            return Err(ServiceError::Validation(
                "provider_id is required".to_string(),
            ));
        }
        let now = Utc::now();
        let meta = ConversationMeta {
            id: id.clone(),
            created_at: now,
            updated_at: now,
            deleted: false,
            title: req.title,
            cwd: req.cwd,
            workspace_id: req.workspace_id,
            project_id: req.project_id,
            provider_id: req.provider_id,
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::Detached,
            selected_model: req.model,
            selected_thinking: req.thinking,
            selected_mode: None,
            supports_steer: false,
        };
        if meta
            .persistence_handle
            .as_deref()
            .is_some_and(|handle| handle == meta.id)
        {
            return Err(ServiceError::Processing(
                "conversation id must not equal persistence handle".into(),
            ));
        }
        let dir = self.dir_for(&id);
        fs::create_dir_all(&dir).map_err(io_err)?;
        self.write_meta(&meta)?;
        self.write_queue_unlocked(&id, &[])?;
        File::create(dir.join("transcript.jsonl")).map_err(io_err)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn get_meta(&self, id: &str) -> Result<ConversationMeta> {
        require_conversation_id(id)?;
        let path = self.dir_for(id).join("meta.json");
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("conversation {id}")));
        }
        read_json(&path)
    }

    pub fn get_snapshot(&self, id: &str) -> Result<ConversationSnapshot> {
        require_conversation_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        let meta = self.get_meta(id)?;
        let turns = fold_transcript(&self.dir_for(id).join("transcript.jsonl"))?;
        let queue = self.read_queue_unlocked(id)?;
        let pending_permission =
            last_pending_permission(&self.dir_for(id).join("transcript.jsonl"))?;
        Ok(ConversationSnapshot {
            meta,
            turns,
            queue,
            pending_permission,
        })
    }

    pub fn list(
        &self,
        cwd: Option<&str>,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        include_deleted: bool,
    ) -> Result<Vec<ConversationIndexEntry>> {
        let entries = match self.read_index() {
            Ok(entries) if !entries.is_empty() => entries,
            _ => self.rebuild_index()?,
        };
        Ok(entries
            .into_iter()
            .filter(|entry| include_deleted || !entry.deleted)
            .filter(|entry| cwd.is_none_or(|cwd| entry.cwd == cwd))
            .filter(|entry| workspace_id.is_none_or(|id| entry.workspace_id.as_deref() == Some(id)))
            .filter(|entry| project_id.is_none_or(|id| entry.project_id.as_deref() == Some(id)))
            .collect())
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<ConversationMeta> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        let mut meta = self.get_meta(id)?;
        meta.title = Some(title.trim().to_string());
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn delete(&self, id: &str) -> Result<ConversationMeta> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        let mut meta = self.get_meta(id)?;
        meta.deleted = true;
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn update_meta<F>(&self, id: &str, mutate: F) -> Result<ConversationMeta>
    where
        F: FnOnce(&mut ConversationMeta),
    {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        let mut meta = self.get_meta(id)?;
        mutate(&mut meta);
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        self.upsert_index(&meta)?;
        Ok(meta)
    }

    pub fn append_record(&self, id: &str, record: &TranscriptRecord) -> Result<()> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
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
        let _guard = lock.lock().expect("conversation lock");
        self.read_queue_unlocked(id)
    }

    pub fn write_queue(&self, id: &str, items: &[QueueItem]) -> Result<()> {
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        self.write_queue_unlocked(id, items)
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
        require_conversation_id(id)?;
        let lock = self.lock_arc(id);
        let _guard = lock.lock().expect("conversation lock");
        let mut meta = self.get_meta_unlocked(id)?;
        meta.last_event_seq = meta.last_event_seq.saturating_add(1);
        meta.updated_at = Utc::now();
        self.write_meta(&meta)?;
        Ok(meta.last_event_seq)
    }

    fn get_meta_unlocked(&self, id: &str) -> Result<ConversationMeta> {
        let path = self.dir_for(id).join("meta.json");
        if !path.exists() {
            return Err(ServiceError::NotFound(format!("conversation {id}")));
        }
        read_json(&path)
    }

    fn dir_for(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    fn lock_arc(&self, id: &str) -> Arc<Mutex<()>> {
        let mut map = self.locks.lock().expect("conversation lock map");
        map.entry(id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn write_meta(&self, meta: &ConversationMeta) -> Result<()> {
        atomic_write_json(&self.dir_for(&meta.id).join("meta.json"), meta)
    }

    fn read_index(&self) -> Result<Vec<ConversationIndexEntry>> {
        let path = self.root.join("index.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        read_json(&path)
    }

    fn upsert_index(&self, meta: &ConversationMeta) -> Result<()> {
        let _guard = self.index_lock.lock().expect("index lock");
        let mut entries = self.read_index().unwrap_or_default();
        let entry = ConversationIndexEntry::from(meta);
        if let Some(existing) = entries.iter_mut().find(|item| item.id == meta.id) {
            *existing = entry;
        } else {
            entries.push(entry);
        }
        entries.sort_by_key(|a| std::cmp::Reverse(a.updated_at));
        atomic_write_json(&self.root.join("index.json"), &entries)
    }

    fn rebuild_index(&self) -> Result<Vec<ConversationIndexEntry>> {
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
                if let Ok(meta) = read_json::<ConversationMeta>(&meta_path) {
                    entries.push(ConversationIndexEntry::from(&meta));
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
            upsert_message(
                turn,
                FoldedMessage {
                    id: message_id,
                    role: "assistant".into(),
                    kind: agent::UserMessageKind::Normal,
                    parts: vec![MessagePart::Text { text }],
                    created_at,
                },
            );
        }
        TranscriptRecord::ThinkingSnapshot {
            turn_id,
            message_id,
            text,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            upsert_message(
                turn,
                FoldedMessage {
                    id: message_id,
                    role: "assistant".into(),
                    kind: agent::UserMessageKind::Normal,
                    parts: vec![MessagePart::Thinking { text }],
                    created_at,
                },
            );
        }
        TranscriptRecord::ToolCall {
            turn_id,
            tool_call,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            let part = MessagePart::ToolCall {
                tool_call_id: tool_call.tool_call_id.clone(),
                name: tool_call.name,
                title: tool_call.title,
                kind: tool_call.kind,
                status: tool_call.status,
                input: tool_call.input,
                output: tool_call.output,
                content: tool_call.content,
            };
            if let Some(message) = turn
                .messages
                .iter_mut()
                .rev()
                .find(|message| message.role == "assistant")
            {
                if let Some(existing) = message.parts.iter_mut().find(|part| match part {
                    MessagePart::ToolCall { tool_call_id, .. } => {
                        tool_call_id == &tool_call.tool_call_id
                    }
                    _ => false,
                }) {
                    *existing = part;
                } else {
                    message.parts.push(part);
                }
            } else {
                upsert_message(
                    turn,
                    FoldedMessage {
                        id: format!("tool-{}", tool_call.tool_call_id),
                        role: "assistant".into(),
                        kind: agent::UserMessageKind::Normal,
                        parts: vec![part],
                        created_at,
                    },
                );
            }
        }
        TranscriptRecord::Plan {
            turn_id,
            plan,
            created_at,
        } => {
            let turn = upsert_turn(turns, &turn_id, created_at);
            upsert_message(
                turn,
                FoldedMessage {
                    id: format!("plan-{turn_id}"),
                    role: "assistant".into(),
                    kind: agent::UserMessageKind::Normal,
                    parts: vec![MessagePart::Plan { plan }],
                    created_at,
                },
            );
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
            turn_id, status, ..
        } => {
            if let Some(turn) = turns.iter_mut().find(|turn| turn.id == turn_id) {
                turn.status = status;
            }
        }
    }
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
    });
    turns.last_mut().expect("just pushed")
}

fn upsert_message(turn: &mut FoldedTurn, message: FoldedMessage) {
    if let Some(existing) = turn.messages.iter_mut().find(|item| item.id == message.id) {
        *existing = message;
    } else {
        turn.messages.push(message);
    }
}

fn require_conversation_id(id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| ServiceError::Validation("conversation id must be a UUID".into()))
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

    fn store() -> (tempfile::TempDir, ConversationStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = ConversationStore::new(dir.path().to_path_buf());
        (dir, store)
    }

    fn create(store: &ConversationStore, cwd: &str) -> ConversationMeta {
        store
            .create(CreateConversationRequest {
                workspace_id: None,
                project_id: None,
                cwd: cwd.into(),
                provider_id: "claude".into(),
                model: Some("opus".into()),
                thinking: None,
                title: None,
            })
            .unwrap()
    }

    #[test]
    fn s3_conversation_id_is_not_persistence_handle() {
        let (_dir, store) = store();
        let meta = create(&store, "/tmp/a");
        assert!(uuid::Uuid::parse_str(&meta.id).is_ok());
        assert!(meta.persistence_handle.is_none());
        assert_ne!(meta.persistence_handle.as_deref(), Some(meta.id.as_str()));
        let on_disk: ConversationMeta = serde_json::from_str(
            &fs::read_to_string(store.dir_for(&meta.id).join("meta.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(on_disk.id, meta.id);
        assert!(on_disk.persistence_handle.is_none());
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
        assert_eq!(snapshot.turns.len(), 1);
        assert_eq!(snapshot.turns[0].messages.len(), 2);
        match &snapshot.turns[0].messages[1].parts[0] {
            MessagePart::Text { text } => assert_eq!(text, "world"),
            other => panic!("expected text part, got {other:?}"),
        }
    }

    #[test]
    fn s5_list_groups_by_cwd() {
        let (_dir, store) = store();
        create(&store, "/tmp/a");
        create(&store, "/tmp/b");
        let listed = store.list(None, None, None, false).unwrap();
        let mut cwds: Vec<_> = listed.iter().map(|e| e.cwd.as_str()).collect();
        cwds.sort();
        cwds.dedup();
        assert_eq!(cwds, ["/tmp/a", "/tmp/b"]);
        assert_eq!(
            store.list(Some("/tmp/a"), None, None, false).unwrap().len(),
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
        assert!(store.list(None, None, None, false).unwrap().is_empty());
        assert_eq!(store.list(None, None, None, true).unwrap().len(), 1);
        let on_disk: ConversationMeta = serde_json::from_str(
            &fs::read_to_string(store.dir_for(&meta.id).join("meta.json")).unwrap(),
        )
        .unwrap();
        assert!(on_disk.deleted);
        assert_eq!(on_disk.title.as_deref(), Some("My chat"));
    }
}
