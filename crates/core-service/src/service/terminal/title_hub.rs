//! Server-owned terminal titles.
//!
//! The computer watches pane output for shell-shim OSC (9999 / 9998) and native
//! window-title OSC (0 / 2), keeps the latest title per tmux window, and pushes
//! it after a short quiet period. Clients render that snapshot; they do not
//! detect titles themselves.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use runtime_manager::state_dir;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::debug;

const DEBOUNCE: Duration = Duration::from_millis(400);
const MAX_OSC_BODY: usize = 1024;
const STORE_FILE: &str = "terminal-titles.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TerminalTitleUpdate {
    pub workspace_id: String,
    pub tmux_window_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tmux_window_index: Option<u32>,
    pub session_id: String,
    /// Null clears a previously stored title. Always present on the wire.
    #[serde(default)]
    pub osc_title: Option<String>,
    #[serde(default)]
    pub dynamic_title: Option<String>,
    #[serde(default)]
    pub session_title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TitleIdentity {
    pub workspace_id: String,
    pub tmux_window_name: String,
    pub tmux_window_index: Option<u32>,
    pub session_id: String,
}

impl TitleIdentity {
    fn key(&self) -> String {
        if !self.tmux_window_name.is_empty() {
            format!("{}\0{}", self.workspace_id, self.tmux_window_name)
        } else if let Some(index) = self.tmux_window_index {
            format!("{}\0#{index}", self.workspace_id)
        } else {
            format!("{}\0{}", self.workspace_id, self.session_id)
        }
    }
}

#[derive(Clone)]
pub struct TitleHub {
    inner: Arc<HubInner>,
}

struct HubInner {
    records: Mutex<HashMap<String, TerminalTitleUpdate>>,
    scanners: Mutex<HashMap<String, OscScanner>>,
    pending: Mutex<HashMap<String, (TerminalTitleUpdate, Instant)>>,
    started: Mutex<bool>,
    wake: Condvar,
    events: broadcast::Sender<TerminalTitleUpdate>,
    path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShimKind {
    /// Real shell preexec/precmd. CMD_END clears the session topic.
    Shell,
    /// Reattach inject. CMD_END must keep the session topic.
    Reattach,
}

#[derive(Debug)]
enum OscHit {
    WindowTitle(String),
    Shim {
        kind: ShimKind,
        start: bool,
        payload: String,
    },
}

pub fn title_hub() -> TitleHub {
    TitleHub::start(default_store_path())
}

impl TitleHub {
    fn start(path: PathBuf) -> Self {
        let (events, _) = broadcast::channel(64);
        let records = load_records(&path);
        let inner = Arc::new(HubInner {
            records: Mutex::new(records),
            scanners: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            started: Mutex::new(false),
            wake: Condvar::new(),
            events,
            path,
        });
        Self { inner }
    }

    fn ensure_debounce_thread(&self) {
        let mut started = self
            .inner
            .started
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if *started {
            return;
        }
        *started = true;
        drop(started);
        let thread_inner = Arc::clone(&self.inner);
        thread::Builder::new()
            .name("atmos-terminal-titles".into())
            .spawn(move || debounce_loop(thread_inner))
            .ok();
    }

    pub fn subscribe(&self) -> broadcast::Receiver<TerminalTitleUpdate> {
        self.inner.events.subscribe()
    }

    pub fn list(&self) -> Vec<TerminalTitleUpdate> {
        let guard = self.inner.records.lock().unwrap_or_else(|e| e.into_inner());
        guard.values().cloned().collect()
    }

    pub fn lookup(&self, workspace_id: &str, window_name: &str) -> Option<TerminalTitleUpdate> {
        if workspace_id.is_empty() || window_name.is_empty() {
            return None;
        }
        let key = format!("{workspace_id}\0{window_name}");
        let guard = self.inner.records.lock().unwrap_or_else(|e| e.into_inner());
        guard.get(&key).cloned()
    }

    pub fn begin_stream(&self, identity: &TitleIdentity) {
        let mut scanners = self
            .inner
            .scanners
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        scanners.insert(identity.key(), OscScanner::default());
    }

    pub fn observe_bytes(&self, identity: &TitleIdentity, data: &[u8]) {
        if data.is_empty() || identity.workspace_id.is_empty() {
            return;
        }
        let hits = {
            let mut scanners = self
                .inner
                .scanners
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            let scanner = scanners.entry(identity.key()).or_default();
            scanner.push(data)
        };
        for hit in hits {
            self.apply(identity, hit);
        }
    }

    fn apply(&self, identity: &TitleIdentity, hit: OscHit) {
        let key = identity.key();
        let mut records = self.inner.records.lock().unwrap_or_else(|e| e.into_inner());
        let current = records.get(&key).cloned().unwrap_or(TerminalTitleUpdate {
            workspace_id: identity.workspace_id.clone(),
            tmux_window_name: identity.tmux_window_name.clone(),
            tmux_window_index: identity.tmux_window_index,
            session_id: identity.session_id.clone(),
            osc_title: None,
            dynamic_title: None,
            session_title: None,
        });
        let next = reduce_title(current, identity, hit);
        if records.get(&key) == Some(&next) {
            return;
        }
        records.insert(key.clone(), next.clone());
        drop(records);

        let mut pending = self.inner.pending.lock().unwrap_or_else(|e| e.into_inner());
        pending.insert(key, (next, Instant::now() + DEBOUNCE));
        drop(pending);
        self.ensure_debounce_thread();
        self.inner.wake.notify_one();
    }
}

fn reduce_title(
    mut current: TerminalTitleUpdate,
    identity: &TitleIdentity,
    hit: OscHit,
) -> TerminalTitleUpdate {
    current.workspace_id = identity.workspace_id.clone();
    if !identity.tmux_window_name.is_empty() {
        current.tmux_window_name = identity.tmux_window_name.clone();
    }
    if identity.tmux_window_index.is_some() {
        current.tmux_window_index = identity.tmux_window_index;
    }
    if !identity.session_id.is_empty() {
        current.session_id = identity.session_id.clone();
    }

    match hit {
        OscHit::WindowTitle(raw) => {
            let cleaned = sanitize_title(&raw);
            if cleaned.is_empty() {
                current.osc_title = None;
                current.session_title = None;
            } else {
                current.osc_title = Some(cleaned.clone());
                current.session_title = next_session_title(current.session_title.take(), &cleaned);
            }
        }
        OscHit::Shim {
            kind,
            start,
            payload,
        } => {
            if start {
                let command = extract_command_name(&payload);
                let allow = match kind {
                    ShimKind::Shell => true,
                    ShimKind::Reattach => {
                        !is_dynamic_downgrade(current.dynamic_title.as_deref(), &command)
                    }
                };
                if allow && !command.is_empty() && !is_tmux_index(&command) {
                    current.dynamic_title = Some(command);
                }
            } else {
                if kind == ShimKind::Shell {
                    current.osc_title = None;
                    current.session_title = None;
                }
                let path = shorten_path(payload.trim());
                if !path.is_empty() {
                    current.dynamic_title = Some(path);
                }
            }
        }
    }
    current
}

fn debounce_loop(inner: Arc<HubInner>) {
    let mut pending = inner.pending.lock().unwrap_or_else(|e| e.into_inner());
    loop {
        if pending.is_empty() {
            pending = inner.wake.wait(pending).unwrap_or_else(|e| e.into_inner());
            continue;
        }
        let next_deadline = pending.values().map(|(_, deadline)| *deadline).min();
        let Some(deadline) = next_deadline else {
            continue;
        };
        let now = Instant::now();
        if deadline > now {
            let wait = inner.wake.wait_timeout(pending, deadline - now);
            let (guard, _) = match wait {
                Ok(pair) => pair,
                Err(poisoned) => poisoned.into_inner(),
            };
            pending = guard;
            continue;
        }

        let now = Instant::now();
        let due: Vec<String> = pending
            .iter()
            .filter(|(_, (_, deadline))| *deadline <= now)
            .map(|(key, _)| key.clone())
            .collect();
        let batch: Vec<TerminalTitleUpdate> = due
            .into_iter()
            .filter_map(|key| pending.remove(&key).map(|(update, _)| update))
            .collect();
        drop(pending);
        if !batch.is_empty() {
            persist_records(&inner);
            for update in batch {
                let _ = inner.events.send(update);
            }
        }
        pending = inner.pending.lock().unwrap_or_else(|e| e.into_inner());
    }
}

fn default_store_path() -> PathBuf {
    state_dir()
        .map(|dir| dir.join(STORE_FILE))
        .unwrap_or_else(|_| PathBuf::from(STORE_FILE))
}

#[derive(Serialize, Deserialize)]
struct TitleFile {
    version: u32,
    titles: Vec<TerminalTitleUpdate>,
}

fn load_records(path: &PathBuf) -> HashMap<String, TerminalTitleUpdate> {
    let Ok(bytes) = fs::read(path) else {
        return HashMap::new();
    };
    let Ok(file) = serde_json::from_slice::<TitleFile>(&bytes) else {
        return HashMap::new();
    };
    file.titles
        .into_iter()
        .map(|title| {
            let key = TitleIdentity {
                workspace_id: title.workspace_id.clone(),
                tmux_window_name: title.tmux_window_name.clone(),
                tmux_window_index: title.tmux_window_index,
                session_id: title.session_id.clone(),
            }
            .key();
            (key, title)
        })
        .collect()
}

fn persist_records(inner: &HubInner) {
    let records = inner.records.lock().unwrap_or_else(|e| e.into_inner());
    let file = TitleFile {
        version: 1,
        titles: records.values().cloned().collect(),
    };
    drop(records);
    let Ok(bytes) = serde_json::to_vec_pretty(&file) else {
        return;
    };
    if let Some(parent) = inner.path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let tmp = inner.path.with_extension("json.tmp");
    if fs::write(&tmp, bytes).is_ok() {
        if fs::rename(&tmp, &inner.path).is_err() {
            debug!("terminal title store rename failed");
        }
    }
}

#[derive(Default)]
struct OscScanner {
    state: Scan,
    code: u32,
    digits: u8,
    body: Vec<u8>,
}

#[derive(Default, Clone, Copy)]
enum Scan {
    #[default]
    Ground,
    Esc,
    Code,
    Body,
    BodyEsc,
}

impl OscScanner {
    fn push(&mut self, data: &[u8]) -> Vec<OscHit> {
        let mut hits = Vec::new();
        for &byte in data {
            match self.state {
                Scan::Ground => {
                    if byte == 0x1b {
                        self.state = Scan::Esc;
                    }
                }
                Scan::Esc => {
                    if byte == b']' {
                        self.state = Scan::Code;
                        self.code = 0;
                        self.digits = 0;
                        self.body.clear();
                    } else {
                        self.state = Scan::Ground;
                    }
                }
                Scan::Code => {
                    if byte.is_ascii_digit() {
                        self.code = self
                            .code
                            .saturating_mul(10)
                            .saturating_add((byte - b'0') as u32);
                        self.digits = self.digits.saturating_add(1);
                        if self.digits > 6 {
                            self.reset();
                        }
                    } else if byte == b';' && self.digits > 0 {
                        self.state = Scan::Body;
                    } else {
                        self.reset();
                    }
                }
                Scan::Body => {
                    if byte == 0x07 {
                        self.finish(&mut hits);
                    } else if byte == 0x1b {
                        self.state = Scan::BodyEsc;
                    } else if self.body.len() < MAX_OSC_BODY {
                        self.body.push(byte);
                    }
                }
                Scan::BodyEsc => {
                    if byte == b'\\' {
                        self.finish(&mut hits);
                    } else {
                        self.reset();
                    }
                }
            }
        }
        hits
    }

    fn finish(&mut self, hits: &mut Vec<OscHit>) {
        let code = self.code;
        let body = String::from_utf8_lossy(&self.body).to_string();
        self.reset();
        if let Some(hit) = decode_osc(code, &body) {
            hits.push(hit);
        }
    }

    fn reset(&mut self) {
        self.state = Scan::Ground;
        self.code = 0;
        self.digits = 0;
        self.body.clear();
    }
}

fn decode_osc(code: u32, body: &str) -> Option<OscHit> {
    match code {
        0 | 2 => {
            let title = if let Some((_, rest)) = body.split_once(';') {
                rest
            } else {
                body
            };
            Some(OscHit::WindowTitle(title.to_string()))
        }
        9998 | 9999 => {
            let (kind_name, payload) = body.split_once(':')?;
            let start = match kind_name {
                "CMD_START" => true,
                "CMD_END" => false,
                _ => return None,
            };
            Some(OscHit::Shim {
                kind: if code == 9999 {
                    ShimKind::Shell
                } else {
                    ShimKind::Reattach
                },
                start,
                payload: payload.to_string(),
            })
        }
        _ => None,
    }
}

fn sanitize_title(raw: &str) -> String {
    let mut out = String::new();
    let mut pending_space = false;
    for ch in raw.chars() {
        if ch.is_whitespace() {
            if !out.is_empty() {
                pending_space = true;
            }
            continue;
        }
        if ch <= '\u{001f}' || ch == '\u{007f}' || ('\u{0080}'..='\u{009f}').contains(&ch) {
            continue;
        }
        if pending_space {
            if out.chars().count() + 1 >= 64 {
                break;
            }
            out.push(' ');
            pending_space = false;
        }
        if out.chars().count() >= 64 {
            break;
        }
        out.push(ch);
    }
    out
}

fn next_session_title(previous: Option<String>, live: &str) -> Option<String> {
    let cleaned = sanitize_title(live);
    if cleaned.is_empty() {
        return None;
    }
    if let Some(topic) = extract_stable_topic(&cleaned) {
        return Some(topic);
    }
    previous.filter(|value| !value.trim().is_empty())
}

fn extract_stable_topic(osc: &str) -> Option<String> {
    if is_noisy_shell_title(osc) {
        return None;
    }
    if osc.contains(" - ") {
        let mut parts: Vec<&str> = osc
            .split(" - ")
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect();
        while parts.last().is_some_and(|part| is_realtime_segment(part)) {
            parts.pop();
        }
        while parts.first().is_some_and(|part| is_realtime_segment(part)) {
            parts.remove(0);
        }
        return parts.first().map(|part| (*part).to_string());
    }
    if is_realtime_segment(osc) {
        return None;
    }
    Some(osc.to_string())
}

fn is_realtime_segment(segment: &str) -> bool {
    let trimmed = segment.trim();
    if trimmed.is_empty() {
        return true;
    }
    if trimmed.chars().all(|ch| {
        ('\u{2800}'..='\u{28FF}').contains(&ch) || "●○◉◎◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".contains(ch)
    }) {
        return true;
    }
    let lower = trimmed.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "action required"
            | "thinking"
            | "responding"
            | "waiting"
            | "compacting"
            | "verifying"
            | "running tool"
            | "grok"
    ) || lower.starts_with("running:")
        || lower.starts_with("retrying")
        || is_turn_timer(trimmed)
}

fn is_turn_timer(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 2 {
        return false;
    }
    let unit = bytes[bytes.len() - 1].to_ascii_lowercase();
    if !matches!(unit, b's' | b'm' | b'h') {
        return false;
    }
    bytes[..bytes.len() - 1]
        .iter()
        .all(|byte| byte.is_ascii_digit())
}

fn is_noisy_shell_title(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || is_tmux_index(trimmed) {
        return true;
    }
    if trimmed.split_whitespace().count() == 1 {
        if trimmed.starts_with('/') || trimmed.starts_with("~/") || trimmed == "~" {
            return true;
        }
    }
    trimmed.contains('@') && trimmed.contains(':') && !trimmed.contains(' ')
}

fn is_tmux_index(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_dynamic_downgrade(existing: Option<&str>, next: &str) -> bool {
    let Some(prev) = existing.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    if is_tmux_index(next) {
        return true;
    }
    let next_is_bare =
        !next.chars().any(char::is_whitespace) && !next.contains('/') && next.len() <= 48;
    if !next_is_bare {
        return false;
    }
    if prev.contains('/') || prev.starts_with(".../") || prev.starts_with('~') {
        return false;
    }
    prev.chars().any(char::is_whitespace)
}

fn extract_command_name(full: &str) -> String {
    let mut parts = full.split_whitespace();
    let prefixes = ["sudo", "command", "env"];
    let mut token = parts.next().unwrap_or("");
    while prefixes.contains(&token) {
        token = parts.next().unwrap_or("");
    }
    if token.contains('=') && !token.starts_with('=') && !token.ends_with('=') {
        if let Some(next) = parts.next() {
            token = next;
        }
    }
    if token.is_empty() {
        return full.trim().to_string();
    }
    const MULTI: &[&str] = &[
        "cargo", "npm", "yarn", "pnpm", "bun", "docker", "git", "kubectl", "go", "just", "make",
        "python", "ruby", "node",
    ];
    if MULTI.contains(&token) {
        if let Some(arg) = parts.next() {
            return format!("{token} {arg}");
        }
    }
    token.to_string()
}

fn shorten_path(full: &str) -> String {
    if full.is_empty() || full == "/" {
        return full.to_string();
    }
    let parts: Vec<&str> = full.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() <= 2 {
        return full.to_string();
    }
    format!(".../{}", parts[parts.len() - 2..].join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> TitleIdentity {
        TitleIdentity {
            workspace_id: "ws".into(),
            tmux_window_name: "3".into(),
            tmux_window_index: Some(3),
            session_id: "sess".into(),
        }
    }

    #[test]
    fn grok_topic_survives_activity_osc() {
        let mut current = TerminalTitleUpdate {
            workspace_id: "ws".into(),
            tmux_window_name: "3".into(),
            tmux_window_index: Some(3),
            session_id: "sess".into(),
            osc_title: None,
            dynamic_title: None,
            session_title: None,
        };
        current = reduce_title(
            current,
            &identity(),
            OscHit::WindowTitle("Greeting and asking who Grok is - grok".into()),
        );
        assert_eq!(
            current.session_title.as_deref(),
            Some("Greeting and asking who Grok is")
        );
        current = reduce_title(
            current,
            &identity(),
            OscHit::WindowTitle("Responding - grok".into()),
        );
        assert_eq!(
            current.session_title.as_deref(),
            Some("Greeting and asking who Grok is")
        );
    }

    #[test]
    fn shell_cmd_end_clears_topic_and_reattach_keeps_it() {
        let mut current = reduce_title(
            TerminalTitleUpdate {
                workspace_id: "ws".into(),
                tmux_window_name: "3".into(),
                tmux_window_index: None,
                session_id: "sess".into(),
                osc_title: None,
                dynamic_title: None,
                session_title: None,
            },
            &identity(),
            OscHit::WindowTitle("debugging auth".into()),
        );
        current = reduce_title(
            current,
            &identity(),
            OscHit::Shim {
                kind: ShimKind::Reattach,
                start: false,
                payload: "/Users/me/proj/app".into(),
            },
        );
        assert_eq!(current.session_title.as_deref(), Some("debugging auth"));
        assert_eq!(current.dynamic_title.as_deref(), Some(".../proj/app"));

        current = reduce_title(
            current,
            &identity(),
            OscHit::Shim {
                kind: ShimKind::Shell,
                start: false,
                payload: "/Users/me/proj/app".into(),
            },
        );
        assert_eq!(current.session_title, None);
        assert_eq!(current.dynamic_title.as_deref(), Some(".../proj/app"));
    }

    #[test]
    fn scanner_joins_split_shim_osc() {
        let mut scanner = OscScanner::default();
        assert!(scanner.push(b"\x1b]9999;CMD_STA").is_empty());
        let hits = scanner.push(b"RT:git status\x07");
        match hits.as_slice() {
            [OscHit::Shim {
                start: true,
                payload,
                ..
            }] => assert_eq!(payload, "git status"),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn command_name_keeps_git_subcommand() {
        assert_eq!(
            extract_command_name("sudo git status --short"),
            "git status"
        );
        assert_eq!(shorten_path("/a/b"), "/a/b");
    }
}
