//! APP-055: Project-local Run terminal log tee.
//!
//! Single-writer plain-text projection of Run window (`run-*`) output into
//! `<project>/.atmos/run-logs/`. UI stream and log file share the PTY source;
//! reattach must not re-dump scrollback (callers only tee live output).

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use tracing::debug;

const RUN_LOGS_REL: &str = ".atmos/run-logs";
const ARCHIVE_REL: &str = "archive";
const MAX_LATEST_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ARCHIVES_PER_WINDOW: usize = 8;
const MAX_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const FLUSH_BUF_BYTES: usize = 64 * 1024;

/// Returns true when the tmux window name belongs to the right-sidebar Run surface.
pub fn is_run_window_name(window_name: &str) -> bool {
    let name = window_name.trim();
    name == "run-main" || name.starts_with("run-")
}

pub fn sanitize_window_name(window_name: &str) -> String {
    let raw = window_name.trim();
    if raw.is_empty() {
        return "run-main".to_string();
    }
    raw.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn run_logs_dir(project_root: &Path) -> PathBuf {
    project_root.join(RUN_LOGS_REL)
}

pub fn latest_log_path(project_root: &Path, window_name: &str) -> PathBuf {
    run_logs_dir(project_root).join(format!("{}.latest.log", sanitize_window_name(window_name)))
}

pub fn strip_ansi_and_controls(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == 0x1b {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            match bytes[i] {
                b'[' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if (0x40..=0x7e).contains(&c) {
                            break;
                        }
                    }
                }
                b']' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if c == 0x07 {
                            break;
                        }
                        if c == 0x1b && i < bytes.len() && bytes[i] == b'\\' {
                            i += 1;
                            break;
                        }
                    }
                }
                b'P' | b'X' | b'^' | b'_' => {
                    i += 1;
                    while i < bytes.len() {
                        if bytes[i] == 0x1b {
                            i += 1;
                            if i < bytes.len() && bytes[i] == b'\\' {
                                i += 1;
                                break;
                            }
                        } else {
                            i += 1;
                        }
                    }
                }
                b'(' | b')' | b'*' | b'+' => {
                    // charset designation: ESC ( B etc.
                    i += 1;
                    if i < bytes.len() {
                        i += 1;
                    }
                }
                _ => {
                    // Single-char ESC sequences
                    i += 1;
                }
            }
            continue;
        }
        // Keep tab and newline; drop other C0 controls and DEL.
        if b == b'\n' || b == b'\t' || b == b'\r' {
            if b == b'\r' {
                // Normalize CR to nothing if followed by LF; else treat as newline.
                if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                    i += 1;
                    continue;
                }
                out.push('\n');
            } else {
                out.push(b as char);
            }
            i += 1;
            continue;
        }
        if b < 0x20 || b == 0x7f {
            i += 1;
            continue;
        }
        // UTF-8: take valid leading bytes as chars via lossy slice walk
        let ch = input[i..].chars().next().unwrap_or('\u{FFFD}');
        let len = ch.len_utf8();
        out.push(ch);
        i += len;
    }
    out
}

fn utc_stamp_for_archive() -> String {
    Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
}

fn ensure_dirs(project_root: &Path) -> std::io::Result<PathBuf> {
    // Full managed `.atmos/.gitignore` first; feature dirs are secondary.
    ensure_run_logs_gitignored(project_root);
    let dir = run_logs_dir(project_root);
    fs::create_dir_all(dir.join(ARCHIVE_REL))?;
    Ok(dir)
}

/// Best-effort: ensure project `.atmos/` exists with the full managed gitignore.
///
/// Policy lives in `core_engine::project_atmos` (attachments/, tmp/, run-logs/).
/// Call sites only invoke this as create-time / fallback compensation.
pub fn ensure_run_logs_gitignored(project_root: &Path) {
    if let Err(err) = core_engine::ensure_project_atmos_dir(project_root) {
        debug!(
            "run log: failed to ensure project .atmos layout under {}: {}",
            project_root.display(),
            err
        );
    }
}

struct OpenLatest {
    file: File,
    buffered: usize,
    written: u64,
}

/// Process-wide tee state keyed by project_root + window.
pub struct RunLogTee {
    open: Mutex<HashMap<String, OpenLatest>>,
}

impl Default for RunLogTee {
    fn default() -> Self {
        Self::new()
    }
}

impl RunLogTee {
    pub fn new() -> Self {
        Self {
            open: Mutex::new(HashMap::new()),
        }
    }

    fn key(project_root: &Path, window_name: &str) -> String {
        format!(
            "{}::{}",
            project_root.to_string_lossy(),
            sanitize_window_name(window_name)
        )
    }

    /// Rotate previous latest (if non-empty) and write a new run-start header.
    /// Returns the absolute path to the latest log.
    pub fn start_run(
        &self,
        project_root: &Path,
        window_name: &str,
        command: Option<&str>,
        cwd: Option<&str>,
    ) -> std::io::Result<PathBuf> {
        if !is_run_window_name(window_name) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "not a run window",
            ));
        }
        ensure_dirs(project_root)?;

        let window = sanitize_window_name(window_name);
        let latest = latest_log_path(project_root, &window);
        let key = Self::key(project_root, &window);

        {
            let mut map = self.open.lock().expect("run log tee lock");
            if let Some(mut open) = map.remove(&key) {
                let _ = open.file.flush();
            }
        }

        if latest.exists() {
            let meta = fs::metadata(&latest)?;
            if meta.len() > 0 {
                self.rotate_latest_to_archive(project_root, &window, &latest)?;
            }
        }

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&latest)?;

        let header = format!(
            "--- run start ---\ntime: {}\ncommand: {}\ntab: {}\ncwd: {}\n---\n\n",
            Utc::now().to_rfc3339(),
            command.unwrap_or("").trim(),
            window,
            cwd.unwrap_or(&project_root.to_string_lossy()).trim(),
        );
        file.write_all(header.as_bytes())?;
        file.flush()?;
        let written = header.len() as u64;

        {
            let mut map = self.open.lock().expect("run log tee lock");
            map.insert(
                key,
                OpenLatest {
                    file,
                    buffered: 0,
                    written,
                },
            );
        }

        self.prune(project_root);
        Ok(latest)
    }

    fn rotate_latest_to_archive(
        &self,
        project_root: &Path,
        window: &str,
        latest: &Path,
    ) -> std::io::Result<()> {
        let archive_dir = run_logs_dir(project_root).join(ARCHIVE_REL);
        fs::create_dir_all(&archive_dir)?;
        let dest = archive_dir.join(format!("{}_{}.log", utc_stamp_for_archive(), window));
        // Avoid clobber if same second.
        let dest = if dest.exists() {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0);
            archive_dir.join(format!(
                "{}_{}_{}.log",
                utc_stamp_for_archive(),
                window,
                nanos
            ))
        } else {
            dest
        };
        fs::rename(latest, &dest)?;
        Ok(())
    }

    /// Append raw PTY bytes (ANSI stripped) to the latest log for this window.
    pub fn append(&self, project_root: &Path, window_name: &str, data: &[u8]) {
        if data.is_empty() || !is_run_window_name(window_name) {
            return;
        }
        let text = match std::str::from_utf8(data) {
            Ok(s) => strip_ansi_and_controls(s),
            Err(_) => strip_ansi_and_controls(&String::from_utf8_lossy(data)),
        };
        if text.is_empty() {
            return;
        }

        if let Err(err) = self.append_text(project_root, window_name, &text) {
            debug!(
                "run log append failed for {} / {}: {}",
                project_root.display(),
                window_name,
                err
            );
        }
    }

    fn append_text(
        &self,
        project_root: &Path,
        window_name: &str,
        text: &str,
    ) -> std::io::Result<()> {
        ensure_dirs(project_root)?;

        let window = sanitize_window_name(window_name);
        let key = Self::key(project_root, &window);
        let latest = latest_log_path(project_root, &window);

        // Ensure an open handle exists (short critical section).
        {
            let mut map = self.open.lock().expect("run log tee lock");
            if !map.contains_key(&key) {
                let file = OpenOptions::new().create(true).append(true).open(&latest)?;
                let written = fs::metadata(&latest).map(|m| m.len()).unwrap_or(0);
                map.insert(
                    key.clone(),
                    OpenLatest {
                        file,
                        buffered: 0,
                        written,
                    },
                );
            }
        }

        let needs_rotate = {
            let map = self.open.lock().expect("run log tee lock");
            map.get(&key)
                .map(|open| open.written + text.len() as u64 > MAX_LATEST_BYTES)
                .unwrap_or(false)
        };
        if needs_rotate {
            {
                let mut map = self.open.lock().expect("run log tee lock");
                if let Some(mut prev) = map.remove(&key) {
                    let _ = prev.file.flush();
                }
            }
            if latest.exists() {
                let _ = self.rotate_latest_to_archive(project_root, &window, &latest);
            }
            let mut file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&latest)?;
            let cont = format!(
                "--- run continue ---\ntime: {}\ntab: {}\n---\n\n",
                Utc::now().to_rfc3339(),
                window
            );
            file.write_all(cont.as_bytes())?;
            let written = cont.len() as u64;
            {
                let mut map = self.open.lock().expect("run log tee lock");
                map.insert(
                    key.clone(),
                    OpenLatest {
                        file,
                        buffered: 0,
                        written,
                    },
                );
            }
            self.prune(project_root);
        }

        {
            let mut map = self.open.lock().expect("run log tee lock");
            let open = map.get_mut(&key).ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "run log handle missing")
            })?;
            open.file.write_all(text.as_bytes())?;
            open.buffered += text.len();
            open.written += text.len() as u64;
            if open.buffered >= FLUSH_BUF_BYTES {
                open.file.flush()?;
                open.buffered = 0;
            }
        }
        Ok(())
    }

    pub fn write_end_marker(&self, project_root: &Path, window_name: &str, note: Option<&str>) {
        let note = note.unwrap_or("unknown");
        let footer = format!(
            "\n--- run end ---\ntime: {}\nexit: {}\n---\n",
            Utc::now().to_rfc3339(),
            note
        );
        let _ = self.append_text(project_root, window_name, &footer);
        if let Ok(mut map) = self.open.lock() {
            let key = Self::key(project_root, window_name);
            if let Some(open) = map.get_mut(&key) {
                let _ = open.file.flush();
                open.buffered = 0;
            }
        }
    }

    fn prune(&self, project_root: &Path) {
        let dir = run_logs_dir(project_root);
        let archive = dir.join(ARCHIVE_REL);
        if !archive.is_dir() {
            return;
        }

        // Cap archives per window: files named *_window.log
        let mut by_window: HashMap<String, Vec<(std::time::SystemTime, PathBuf)>> = HashMap::new();
        if let Ok(entries) = fs::read_dir(&archive) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("log") {
                    continue;
                }
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                // archive name: {stamp}_{window} or {stamp}_{window}_{nanos}
                let window = name
                    .split('_')
                    .skip(1)
                    .take_while(|p| p.starts_with("run-") || *p == "run-main")
                    .collect::<Vec<_>>()
                    .join("_");
                let window = if window.is_empty() {
                    // fallback: last path segment after first underscore
                    name.split_once('_')
                        .map(|(_, rest)| rest.to_string())
                        .unwrap_or(name)
                } else {
                    window
                };
                let mtime = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH);
                by_window.entry(window).or_default().push((mtime, path));
            }
        }

        for files in by_window.values_mut() {
            files.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
            for (_, path) in files.iter().skip(MAX_ARCHIVES_PER_WINDOW) {
                let _ = fs::remove_file(path);
            }
        }

        // Total budget: delete oldest archives first
        let mut all: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
        let mut total = 0u64;
        for walk in [dir.as_path(), archive.as_path()] {
            if let Ok(entries) = fs::read_dir(walk) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        continue;
                    }
                    if let Ok(meta) = entry.metadata() {
                        let len = meta.len();
                        total = total.saturating_add(len);
                        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                        // Prefer deleting archives over latest
                        if path
                            .parent()
                            .map(|p| p.ends_with(ARCHIVE_REL))
                            .unwrap_or(false)
                        {
                            all.push((mtime, len, path));
                        }
                    }
                }
            }
        }
        if total <= MAX_TOTAL_BYTES {
            return;
        }
        all.sort_by(|a, b| a.0.cmp(&b.0)); // oldest first
        for (_, len, path) in all {
            if total <= MAX_TOTAL_BYTES {
                break;
            }
            match fs::remove_file(&path) {
                Ok(()) => {
                    total = total.saturating_sub(len);
                }
                Err(_) => {
                    // Skip stuck files; do not spin forever when remove fails.
                    continue;
                }
            }
        }
    }

    /// Resolve preferred latest log path for slash command.
    pub fn resolve_latest_path(project_root: &Path) -> Option<PathBuf> {
        let dir = run_logs_dir(project_root);
        let preferred = latest_log_path(project_root, "run-main");
        if preferred.is_file() {
            return Some(preferred);
        }
        let mut best: Option<(SystemTime, PathBuf)> = None;
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !name.ends_with(".latest.log") {
                continue;
            }
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            match &best {
                None => best = Some((mtime, path)),
                Some((t, _)) if mtime > *t => best = Some((mtime, path)),
                _ => {}
            }
        }
        best.map(|(_, p)| p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_run_windows() {
        assert!(is_run_window_name("run-main"));
        assert!(is_run_window_name("run-2"));
        assert!(is_run_window_name(" run-abc "));
        assert!(!is_run_window_name("1"));
        assert!(!is_run_window_name("agent"));
        assert!(!is_run_window_name("runner"));
    }

    #[test]
    fn strips_ansi_color() {
        let raw = "\x1b[31merror\x1b[0m hello\n";
        let out = strip_ansi_and_controls(raw);
        assert_eq!(out, "error hello\n");
        assert!(!out.contains('\x1b'));
    }

    #[test]
    fn start_and_append_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let tee = RunLogTee::new();
        let path = tee
            .start_run(root, "run-main", Some("bun run dev"), None)
            .unwrap();
        assert!(path.ends_with("run-main.latest.log"));
        tee.append(root, "run-main", b"hello\n");
        tee.append(root, "run-main", b"\x1b[32mworld\x1b[0m\n");
        tee.write_end_marker(root, "run-main", Some("unknown"));
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("--- run start ---"));
        assert!(content.contains("command: bun run dev"));
        assert!(content.contains("hello\n"));
        assert!(content.contains("world\n"));
        assert!(!content.contains('\x1b'));
        assert!(content.contains("--- run end ---"));
    }

    #[test]
    fn rotate_on_second_start() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let tee = RunLogTee::new();
        tee.start_run(root, "run-main", Some("echo a"), None)
            .unwrap();
        tee.append(root, "run-main", b"first run\n");
        tee.start_run(root, "run-main", Some("echo b"), None)
            .unwrap();
        tee.append(root, "run-main", b"second run\n");
        let latest = fs::read_to_string(latest_log_path(root, "run-main")).unwrap();
        assert!(latest.contains("second run"));
        assert!(!latest.contains("first run"));
        let archive = run_logs_dir(root).join(ARCHIVE_REL);
        let archives: Vec<_> = fs::read_dir(&archive)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        assert_eq!(archives.len(), 1);
        let archived = fs::read_to_string(&archives[0]).unwrap();
        assert!(archived.contains("first run"));
    }

    #[test]
    fn non_run_window_start_errors() {
        let dir = tempfile::tempdir().unwrap();
        let tee = RunLogTee::new();
        assert!(tee.start_run(dir.path(), "shell", None, None).is_err());
    }

    #[test]
    fn resolve_prefers_run_main() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let tee = RunLogTee::new();
        tee.start_run(root, "run-2", Some("x"), None).unwrap();
        tee.append(root, "run-2", b"other\n");
        tee.start_run(root, "run-main", Some("y"), None).unwrap();
        tee.append(root, "run-main", b"main\n");
        let resolved = RunLogTee::resolve_latest_path(root).unwrap();
        assert!(resolved.ends_with("run-main.latest.log"));
    }

    #[test]
    fn ensures_full_atmos_gitignore_on_start() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // Pre-seed only attachments like older installs.
        fs::create_dir_all(root.join(".atmos")).unwrap();
        fs::write(root.join(".atmos/.gitignore"), "attachments/\n").unwrap();

        let tee = RunLogTee::new();
        tee.start_run(root, "run-main", Some("echo hi"), None)
            .unwrap();

        let gi = fs::read_to_string(root.join(".atmos/.gitignore")).unwrap();
        for rule in ["attachments/", "tmp/", "run-logs/"] {
            assert!(
                gi.lines().any(|l| l.trim() == rule),
                "expected {rule} in .atmos/.gitignore, got:\n{gi}"
            );
        }
    }

    #[test]
    fn does_not_duplicate_managed_rules() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        ensure_run_logs_gitignored(root);
        ensure_run_logs_gitignored(root);

        let gi = fs::read_to_string(root.join(".atmos/.gitignore")).unwrap();
        let count = gi.lines().filter(|l| l.trim() == "run-logs/").count();
        assert_eq!(count, 1);
    }
}
