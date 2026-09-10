//! Host-side ACP terminals (`terminal/create` and friends).
//!
//! Factory Droid Execute embeds `{ type: "terminal", terminalId }` and, once a
//! terminal is attached, completes the tool **without** `rawOutput`. The client
//! must run the command and fold captured stdout back onto the execute tool.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Notify};

use crate::acp_client::types::{AgentToolCallContentItem, ToolCallUpdate};

const DEFAULT_OUTPUT_BYTE_LIMIT: usize = 1_048_576;

#[derive(Debug, Clone)]
pub(crate) struct TerminalSnapshot {
    pub output: String,
    pub truncated: bool,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub tool_call_id: Option<String>,
    pub last_emitted_len: usize,
}

struct TerminalSession {
    output: String,
    truncated: bool,
    byte_limit: usize,
    exit_code: Option<i32>,
    signal: Option<String>,
    tool_call_id: Option<String>,
    last_emitted_len: usize,
    child: Option<Child>,
    finished: bool,
    done: Arc<Notify>,
}

impl TerminalSession {
    fn snapshot(&self) -> TerminalSnapshot {
        TerminalSnapshot {
            output: self.output.clone(),
            truncated: self.truncated,
            exit_code: self.exit_code,
            signal: self.signal.clone(),
            tool_call_id: self.tool_call_id.clone(),
            last_emitted_len: self.last_emitted_len,
        }
    }

    fn append(&mut self, chunk: &str) {
        if chunk.is_empty() {
            return;
        }
        self.output.push_str(chunk);
        let (output, truncated) = truncate_front(&self.output, self.byte_limit);
        self.output = output;
        self.truncated |= truncated;
    }
}

#[derive(Clone, Default)]
pub(crate) struct TerminalRegistry {
    inner: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl TerminalRegistry {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) async fn create(
        &self,
        command: String,
        args: Vec<String>,
        cwd: Option<PathBuf>,
        env: Vec<(String, String)>,
        output_byte_limit: Option<u64>,
        fallback_cwd: &PathBuf,
    ) -> Result<String, String> {
        let command = command.trim();
        if command.is_empty() {
            return Err("terminal command is empty".into());
        }
        let byte_limit = output_byte_limit
            .and_then(|value| usize::try_from(value).ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_OUTPUT_BYTE_LIMIT);
        let cwd = cwd.unwrap_or_else(|| fallback_cwd.clone());
        let mut child = spawn_command(command, &args, &cwd, &env)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let id = uuid::Uuid::new_v4().to_string();
        let done = Arc::new(Notify::new());
        let pending_readers = Arc::new(AtomicUsize::new(0));
        if stdout.is_some() {
            pending_readers.fetch_add(1, Ordering::SeqCst);
        }
        if stderr.is_some() {
            pending_readers.fetch_add(1, Ordering::SeqCst);
        }
        let session = TerminalSession {
            output: String::new(),
            truncated: false,
            byte_limit,
            exit_code: None,
            signal: None,
            tool_call_id: None,
            last_emitted_len: 0,
            child: Some(child),
            finished: false,
            done: Arc::clone(&done),
        };
        self.inner.lock().await.insert(id.clone(), session);
        if let Some(stdout) = stdout {
            self.spawn_reader(id.clone(), stdout, Arc::clone(&pending_readers));
        }
        if let Some(stderr) = stderr {
            self.spawn_reader(id.clone(), stderr, Arc::clone(&pending_readers));
        }
        self.spawn_waiter(id.clone(), done, pending_readers);
        Ok(id)
    }

    pub(crate) async fn output(&self, terminal_id: &str) -> Result<TerminalSnapshot, String> {
        let mut sessions = self.inner.lock().await;
        let session = sessions
            .get_mut(terminal_id)
            .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
        let snapshot = session.snapshot();
        session.last_emitted_len = snapshot.output.len();
        Ok(snapshot)
    }

    pub(crate) async fn wait(&self, terminal_id: &str) -> Result<TerminalSnapshot, String> {
        loop {
            let done = {
                let sessions = self.inner.lock().await;
                let session = sessions
                    .get(terminal_id)
                    .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
                if session.finished {
                    return Ok(session.snapshot());
                }
                Arc::clone(&session.done)
            };
            // Register before awaiting so a completion notify cannot be missed.
            let notified = done.notified();
            {
                let sessions = self.inner.lock().await;
                if let Some(session) = sessions.get(terminal_id) {
                    if session.finished {
                        return Ok(session.snapshot());
                    }
                } else {
                    return Err(format!("unknown terminal {terminal_id}"));
                }
            }
            notified.await;
        }
    }

    pub(crate) async fn kill(&self, terminal_id: &str) -> Result<(), String> {
        let mut sessions = self.inner.lock().await;
        let session = sessions
            .get_mut(terminal_id)
            .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
        if let Some(child) = session.child.as_mut() {
            let _ = child.start_kill();
        }
        Ok(())
    }

    pub(crate) async fn release(&self, terminal_id: &str) -> Result<(), String> {
        let mut sessions = self.inner.lock().await;
        if let Some(mut session) = sessions.remove(terminal_id) {
            if let Some(mut child) = session.child.take() {
                let _ = child.start_kill();
            }
            session.done.notify_waiters();
        }
        Ok(())
    }

    pub(crate) async fn bind_tool(&self, terminal_id: &str, tool_call_id: &str) {
        let mut sessions = self.inner.lock().await;
        if let Some(session) = sessions.get_mut(terminal_id) {
            session.tool_call_id = Some(tool_call_id.to_string());
        }
    }

    pub(crate) async fn snapshot(&self, terminal_id: &str) -> Option<TerminalSnapshot> {
        let sessions = self.inner.lock().await;
        sessions.get(terminal_id).map(TerminalSession::snapshot)
    }

    fn spawn_reader<R>(&self, terminal_id: String, mut reader: R, pending_readers: Arc<AtomicUsize>)
    where
        R: AsyncRead + Unpin + Send + 'static,
    {
        let inner = Arc::clone(&self.inner);
        tokio::spawn(async move {
            let mut buf = vec![0_u8; 8192];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        let mut sessions = inner.lock().await;
                        if let Some(session) = sessions.get_mut(&terminal_id) {
                            session.append(&chunk);
                        } else {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            pending_readers.fetch_sub(1, Ordering::SeqCst);
        });
    }

    fn spawn_waiter(
        &self,
        terminal_id: String,
        done: Arc<Notify>,
        pending_readers: Arc<AtomicUsize>,
    ) {
        let inner = Arc::clone(&self.inner);
        tokio::spawn(async move {
            loop {
                let child_exited = {
                    let mut sessions = inner.lock().await;
                    let Some(session) = sessions.get_mut(&terminal_id) else {
                        done.notify_waiters();
                        return;
                    };
                    match session.child.as_mut() {
                        Some(child) => match child.try_wait() {
                            Ok(Some(status)) => {
                                session.exit_code = status.code();
                                #[cfg(unix)]
                                {
                                    use std::os::unix::process::ExitStatusExt;
                                    session.signal = status.signal().map(|sig| sig.to_string());
                                }
                                session.child = None;
                                true
                            }
                            Ok(None) => false,
                            Err(_) => {
                                session.child = None;
                                if session.exit_code.is_none() {
                                    session.exit_code = Some(1);
                                }
                                true
                            }
                        },
                        None => true,
                    }
                };
                if child_exited {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            let drain_deadline = tokio::time::Instant::now() + Duration::from_secs(2);
            while pending_readers.load(Ordering::SeqCst) > 0
                && tokio::time::Instant::now() < drain_deadline
            {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            if let Some(session) = inner.lock().await.get_mut(&terminal_id) {
                session.finished = true;
            }
            done.notify_waiters();
        });
    }
}

pub(crate) fn terminal_ids(content: &[AgentToolCallContentItem]) -> Vec<String> {
    content
        .iter()
        .filter_map(|item| match item {
            AgentToolCallContentItem::Terminal { terminal_id } => Some(terminal_id.clone()),
            _ => None,
        })
        .collect()
}

pub(crate) fn apply_terminal_output(update: &mut ToolCallUpdate, snapshot: &TerminalSnapshot) {
    if snapshot.output.trim().is_empty() && snapshot.exit_code.is_none() {
        return;
    }
    if update.raw_output.as_ref().is_some_and(|value| match value {
        serde_json::Value::Null => false,
        serde_json::Value::Object(map) => !map.is_empty(),
        serde_json::Value::String(text) => !text.trim().is_empty(),
        serde_json::Value::Array(items) => !items.is_empty(),
        _ => true,
    }) {
        return;
    }
    let mut payload = serde_json::Map::new();
    if !snapshot.output.is_empty() {
        payload.insert(
            "text".into(),
            serde_json::Value::String(snapshot.output.clone()),
        );
    }
    if let Some(exit_code) = snapshot.exit_code {
        payload.insert(
            "exit_code".into(),
            serde_json::Value::Number(exit_code.into()),
        );
    }
    if payload.is_empty() {
        return;
    }
    update.raw_output = Some(serde_json::Value::Object(payload));
}

fn spawn_command(
    command: &str,
    args: &[String],
    cwd: &PathBuf,
    env: &[(String, String)],
) -> Result<Child, String> {
    let mut cmd = if args.is_empty() {
        #[cfg(windows)]
        {
            let mut cmd = Command::new("cmd");
            cmd.arg("/C").arg(command);
            cmd
        }
        #[cfg(not(windows))]
        {
            let mut cmd = Command::new("bash");
            cmd.arg("-c").arg(command);
            cmd
        }
    } else {
        let mut cmd = Command::new(command);
        cmd.args(args);
        cmd
    };
    cmd.current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .env("PYTHONUNBUFFERED", "1");
    for (name, value) in env {
        cmd.env(name, value);
    }
    cmd.spawn().map_err(|err| err.to_string())
}

fn truncate_front(text: &str, max_bytes: usize) -> (String, bool) {
    let bytes = text.as_bytes();
    if bytes.len() <= max_bytes {
        return (text.to_string(), false);
    }
    let mut start = bytes.len().saturating_sub(max_bytes);
    while start < bytes.len() && !text.is_char_boundary(start) {
        start += 1;
    }
    (text[start..].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_client::types::ToolCallStatus;

    #[test]
    fn truncate_front_keeps_char_boundary() {
        let (text, truncated) = truncate_front("héllo world", 6);
        assert!(truncated);
        assert!(text.is_char_boundary(0));
        assert!(text.len() <= 6);
    }

    #[test]
    fn apply_terminal_output_fills_empty_raw_output() {
        let mut update = ToolCallUpdate {
            tool_call_id: "tc".into(),
            parent_tool_call_id: None,
            tool: "Execute".into(),
            description: String::new(),
            acp_kind: Some("execute".into()),
            status: ToolCallStatus::Completed,
            raw_input: None,
            content: vec![AgentToolCallContentItem::Terminal {
                terminal_id: "term-1".into(),
            }],
            locations: Vec::new(),
            raw_output: None,
            detail: None,
        };
        apply_terminal_output(
            &mut update,
            &TerminalSnapshot {
                output: "ok\n".into(),
                truncated: false,
                exit_code: Some(0),
                signal: None,
                tool_call_id: Some("tc".into()),
                last_emitted_len: 0,
            },
        );
        assert_eq!(
            update.raw_output,
            Some(serde_json::json!({"text": "ok\n", "exit_code": 0}))
        );
    }

    #[test]
    fn apply_terminal_output_does_not_clobber_existing() {
        let mut update = ToolCallUpdate {
            tool_call_id: "tc".into(),
            parent_tool_call_id: None,
            tool: "Execute".into(),
            description: String::new(),
            acp_kind: Some("execute".into()),
            status: ToolCallStatus::Completed,
            raw_input: None,
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: Some(serde_json::json!({"text": "kept"})),
            detail: None,
        };
        apply_terminal_output(
            &mut update,
            &TerminalSnapshot {
                output: "new".into(),
                truncated: false,
                exit_code: Some(0),
                signal: None,
                tool_call_id: None,
                last_emitted_len: 0,
            },
        );
        assert_eq!(update.raw_output, Some(serde_json::json!({"text": "kept"})));
    }

    #[tokio::test]
    async fn create_captures_command_output() {
        let registry = TerminalRegistry::new();
        let cwd = std::env::current_dir().unwrap();
        let id = registry
            .create(
                "printf 'hello-terminal\\n'".into(),
                Vec::new(),
                Some(cwd.clone()),
                Vec::new(),
                None,
                &cwd,
            )
            .await
            .expect("create");
        let snapshot = registry.wait(&id).await.expect("wait");
        assert!(
            snapshot.output.contains("hello-terminal"),
            "output={:?}",
            snapshot.output
        );
        assert_eq!(snapshot.exit_code, Some(0));
    }
}
