//! Disk snapshot of Observer turn history.
//!
//! The live map stays in memory. This file is what a restarted API, or a
//! Desktop window opened from the web, reads back. Path is
//! `~/.atmos/data/agent-observer/activity.json`, never under `data/desktop/`.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::{Condvar, Mutex};
use serde::{Deserialize, Serialize};

use super::{AgentActivity, AgentLiveKind, AgentOccupancy};

const VERSION: u32 = 1;
const FILE_NAME: &str = "activity.json";
const COALESCE: Duration = Duration::from_millis(300);

pub(super) struct PersistState {
    pub path: Mutex<Option<PathBuf>>,
    pub pending: Mutex<Option<Vec<AgentActivity>>>,
    pub cv: Condvar,
    pub stop: AtomicBool,
    pub sync: AtomicBool,
    pub enabled: AtomicBool,
    write: Mutex<()>,
}

impl PersistState {
    pub(super) fn new() -> Self {
        Self {
            path: Mutex::new(None),
            pending: Mutex::new(None),
            cv: Condvar::new(),
            stop: AtomicBool::new(false),
            sync: AtomicBool::new(false),
            enabled: AtomicBool::new(false),
            write: Mutex::new(()),
        }
    }
}

pub(super) fn observer_activity_file() -> Option<PathBuf> {
    runtime_manager::agent_observer_data_dir()
        .ok()
        .map(|dir| dir.join(FILE_NAME))
}

pub(super) fn load_activity_file(path: &Path) -> Result<Vec<AgentActivity>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let file: ObserverActivityFile =
        serde_json::from_str(&text).map_err(|error| error.to_string())?;
    Ok(file.sessions)
}

pub(super) fn spawn_writer(state: Arc<PersistState>) {
    thread::Builder::new()
        .name("observer-activity".into())
        .spawn(move || writer_loop(state))
        .ok();
}

fn writer_loop(state: Arc<PersistState>) {
    loop {
        {
            let mut pending = state.pending.lock();
            while pending.is_none() && !state.stop.load(Ordering::Acquire) {
                state.cv.wait(&mut pending);
            }
            if state.stop.load(Ordering::Acquire) {
                return;
            }
        }
        thread::sleep(COALESCE);
        if state.stop.load(Ordering::Acquire) {
            return;
        }
        let snapshot = state.pending.lock().take();
        if let Some(snapshot) = snapshot {
            write_activity_snapshot(&state, &snapshot);
        }
    }
}

pub(super) fn write_activity_snapshot(state: &PersistState, sessions: &[AgentActivity]) {
    let _guard = state.write.lock();
    if state.stop.load(Ordering::Acquire) {
        return;
    }
    let Some(path) = state.path.lock().clone() else {
        return;
    };
    if let Err(error) = write_activity_file(&path, sessions) {
        tracing::warn!(
            error = %error,
            path = %path.display(),
            "failed to persist agent observer activity"
        );
    }
}

/// Final write from `Drop`. Runs after `stop` is set, so the writer thread
/// will not overwrite it with an older snapshot.
pub(super) fn write_activity_final(state: &PersistState, sessions: &[AgentActivity]) {
    state.stop.store(true, Ordering::Release);
    let _guard = state.write.lock();
    let Some(path) = state.path.lock().clone() else {
        return;
    };
    if let Err(error) = write_activity_file(&path, sessions) {
        tracing::warn!(
            error = %error,
            path = %path.display(),
            "failed to flush agent observer activity"
        );
    }
    state.cv.notify_all();
}

fn write_activity_file(path: &Path, sessions: &[AgentActivity]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let file = ObserverActivityFile {
        version: VERSION,
        sessions: sessions.to_vec(),
    };
    let body = serde_json::to_vec(&file).map_err(|error| error.to_string())?;
    {
        let mut out = File::create(&tmp).map_err(|error| error.to_string())?;
        out.write_all(&body).map_err(|error| error.to_string())?;
        out.sync_all().map_err(|error| error.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|error| error.to_string())
}

/// A restarted process has no live hook wait. History stays; spinners do not.
pub(super) fn settle_restored(activity: &mut AgentActivity) {
    activity.last_state = AgentOccupancy::Idle;
    activity.live_kind = AgentLiveKind::Idle;
    activity.pending_permission = None;
    activity.current_tool = None;
    activity.current_turn_id = None;
    let ended = if activity.last_event_at.is_empty() {
        chrono::Utc::now().to_rfc3339()
    } else {
        activity.last_event_at.clone()
    };
    for turn in &mut activity.turns {
        if turn.ended_at.is_none() {
            turn.ended_at = Some(ended.clone());
        }
        for tool in &mut turn.tools {
            settle_tool(tool);
        }
    }
    for child in &mut activity.children {
        child.state = AgentOccupancy::Idle;
        child.live_kind = AgentLiveKind::Idle;
        child.current_tool = None;
        for tool in &mut child.recent_tools {
            settle_tool(tool);
        }
    }
}

fn settle_tool(tool: &mut super::AgentToolLine) {
    let state = tool.state.to_ascii_lowercase();
    if state == "running" || state == "pending" || state == "in_progress" {
        tool.state = "ok".to_string();
        if tool.ended_at.is_none() {
            tool.ended_at = Some(tool.started_at.clone());
        }
    }
}

#[derive(Serialize, Deserialize)]
struct ObserverActivityFile {
    version: u32,
    sessions: Vec<AgentActivity>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use crate::service::agent_hooks::{terminal_hook_context, AgentHooksService};
    use crate::service::agent_status::{AgentStatusContext, AgentStatusService};

    fn pane_ctx(pane: &str) -> AgentStatusContext {
        terminal_hook_context(AgentStatusContext {
            pane_id: Some(pane.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AgentStatusContext::default()
        })
    }

    #[test]
    fn activity_survives_a_new_process_and_running_settles_idle() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("activity.json");
        let status = Arc::new(AgentStatusService::new());
        status.enable_activity_persistence_at(path.clone(), true);
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:agent");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "fix the footer",
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "Stop",
                "last_assistant_message": "The footer now matches.",
            }),
            &ctx,
        );

        let restored = Arc::new(AgentStatusService::new());
        restored.enable_activity_persistence_at(path, true);
        let activity = restored
            .get_all_activity()
            .into_iter()
            .find(|record| {
                record
                    .turns
                    .iter()
                    .any(|turn| turn.prompt == "fix the footer")
            })
            .expect("restored turn");
        assert_eq!(activity.last_state, AgentOccupancy::Idle);
        assert_eq!(activity.live_kind, AgentLiveKind::Idle);
        assert!(activity.pending_permission.is_none());
        let turn = activity
            .turns
            .iter()
            .find(|turn| turn.prompt == "fix the footer")
            .unwrap();
        assert_eq!(turn.reply.as_deref(), Some("The footer now matches."));
        assert!(turn.ended_at.is_some());
    }

    #[test]
    fn open_turn_reloads_closed_and_idle() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("activity.json");
        let raw = r#"{
            "version": 1,
            "sessions": [{
                "session_id": "pane-1",
                "tool": "grok-build",
                "surface": "terminal",
                "last_state": "running",
                "live_kind": "tool",
                "current_tool": {
                    "name": "Bash",
                    "detail": "ls",
                    "state": "running",
                    "started_at": "t",
                    "repeat": 1
                },
                "todos": [],
                "children": [{
                    "child_id": "child-1",
                    "agent_type": "Explore",
                    "description": "scan specs",
                    "state": "running",
                    "prompt": "scan specs",
                    "reply": "Found the specs index.",
                    "recent_tools": [{
                        "name": "Read",
                        "detail": "README.md",
                        "state": "running",
                        "started_at": "t",
                        "repeat": 1
                    }],
                    "started_at": "t",
                    "last_event_at": "t"
                }],
                "turns": [{
                    "turn_id": 1,
                    "prompt": "scan the repo",
                    "reply": "The specs live under specs/.",
                    "started_at": "t",
                    "tools": [],
                    "todos": [],
                    "spawned_child_ids": ["child-1"]
                }],
                "turns_omitted": 0,
                "current_turn_id": 1,
                "started_at": "t",
                "last_event_at": "t"
            }]
        }"#;
        fs::write(&path, raw).unwrap();
        let status = Arc::new(AgentStatusService::new());
        status.enable_activity_persistence_at(path, true);
        let activity = status.get_all_activity().pop().expect("one session");
        assert_eq!(activity.session_id, "pane-1");
        assert_eq!(activity.last_state, AgentOccupancy::Idle);
        assert!(activity.current_tool.is_none());
        assert!(activity.current_turn_id.is_none());
        assert!(activity.turns[0].ended_at.is_some());
        assert_eq!(activity.turns[0].prompt, "scan the repo");
        assert_eq!(
            activity.turns[0].reply.as_deref(),
            Some("The specs live under specs/.")
        );
        let child = &activity.children[0];
        assert_eq!(child.state, AgentOccupancy::Idle);
        assert_eq!(child.reply.as_deref(), Some("Found the specs index."));
        assert_eq!(child.recent_tools[0].state, "ok");
    }

    #[test]
    fn dropped_activity_stays_gone_after_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("activity.json");
        let status = Arc::new(AgentStatusService::new());
        status.enable_activity_persistence_at(path.clone(), true);
        let service = AgentHooksService::new(status.clone());
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "rename the card",
            }),
            &pane_ctx("ws-1:gone"),
        );
        let session_id = status.get_all_activity()[0].session_id.clone();
        assert!(status.drop_orphaned_activity(&session_id));

        let restored = Arc::new(AgentStatusService::new());
        restored.enable_activity_persistence_at(path, true);
        assert!(restored.get_all_activity().is_empty());
    }

    #[test]
    fn corrupt_activity_file_does_not_block_startup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("activity.json");
        fs::write(&path, "{not json").unwrap();
        let status = Arc::new(AgentStatusService::new());
        status.enable_activity_persistence_at(path, true);
        assert!(status.get_all_activity().is_empty());
    }
}
