//! Per-file `git blame` and lazy `git show --shortstat` (APP-074).

use std::cell::Cell;
use std::collections::{HashMap, VecDeque};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use crate::error::{EngineError, Result};

use super::{
    run_git, try_run_git, BlameCommit, BlameRange, CommitDetailInfo, FileBlameInfo, FileBlameKind,
    GitEngine,
};

/// Same cap as `TEXT_DIFF_MAX_BYTES` in `changes.rs`.
const BLAME_MAX_BYTES: u64 = 1536 * 1024;
const BLAME_MAX_LINES: usize = 10_000;
const BLAME_CACHE_CAP: usize = 64;
const DETAIL_CACHE_CAP: usize = 128;

#[derive(Clone, PartialEq, Eq, Hash)]
struct BlameCacheKey {
    repo: String,
    relpath: String,
    blob_id: String,
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct DetailCacheKey {
    repo: String,
    hash: String,
}

struct LruMap<K: Clone + Eq + std::hash::Hash, V> {
    map: HashMap<K, V>,
    order: VecDeque<K>,
    cap: usize,
}

impl<K: Clone + Eq + std::hash::Hash, V: Clone> LruMap<K, V> {
    fn new(cap: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
            cap,
        }
    }

    fn get(&mut self, key: &K) -> Option<V> {
        if !self.map.contains_key(key) {
            return None;
        }
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            self.order.remove(pos);
            self.order.push_back(key.clone());
        }
        self.map.get(key).cloned()
    }

    fn insert(&mut self, key: K, value: V) {
        if self.map.contains_key(&key) {
            self.map.insert(key.clone(), value);
            if let Some(pos) = self.order.iter().position(|k| k == &key) {
                self.order.remove(pos);
            }
            self.order.push_back(key);
            return;
        }
        while self.map.len() >= self.cap {
            if let Some(old) = self.order.pop_front() {
                self.map.remove(&old);
            } else {
                break;
            }
        }
        self.order.push_back(key.clone());
        self.map.insert(key, value);
    }

    fn clear(&mut self) {
        self.map.clear();
        self.order.clear();
    }
}

fn blame_cache() -> &'static Mutex<LruMap<BlameCacheKey, FileBlameInfo>> {
    static CACHE: OnceLock<Mutex<LruMap<BlameCacheKey, FileBlameInfo>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(LruMap::new(BLAME_CACHE_CAP)))
}

fn detail_cache() -> &'static Mutex<LruMap<DetailCacheKey, CommitDetailInfo>> {
    static CACHE: OnceLock<Mutex<LruMap<DetailCacheKey, CommitDetailInfo>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(LruMap::new(DETAIL_CACHE_CAP)))
}

static BLAME_WALKS: AtomicU64 = AtomicU64::new(0);
#[allow(dead_code)]
static DETAIL_WALKS: AtomicU64 = AtomicU64::new(0);

thread_local! {
    static LAST_BLAME_CACHE_HIT: Cell<bool> = const { Cell::new(false) };
}

/// How many times `git blame --line-porcelain` actually ran (tests / cache proof).
pub fn file_blame_compute_count() -> u64 {
    BLAME_WALKS.load(Ordering::SeqCst)
}

/// Whether this thread's last `file_blame` returned a process-cache hit.
pub fn last_file_blame_was_cache_hit() -> bool {
    LAST_BLAME_CACHE_HIT.get()
}

/// Drop process-local blame + detail caches (tests).
pub fn clear_file_blame_cache() {
    if let Ok(mut cache) = blame_cache().lock() {
        cache.clear();
    }
    if let Ok(mut cache) = detail_cache().lock() {
        cache.clear();
    }
}

fn skip_info(file_path: &str, kind: FileBlameKind, blob_id: Option<String>) -> FileBlameInfo {
    FileBlameInfo {
        file_path: file_path.to_string(),
        blob_id,
        kind,
        ranges: Vec::new(),
        commits: HashMap::new(),
    }
}

fn resolve_repo_file(repo_path: &Path, file_relative_path: &str) -> Result<std::path::PathBuf> {
    let rel = file_relative_path.trim();
    if rel.is_empty() || rel.contains('\0') {
        return Err(EngineError::Git("Invalid blame file path".to_string()));
    }
    let path = Path::new(rel);
    if path.is_absolute()
        || path.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(EngineError::Git(
            "Blame path escapes the repository".to_string(),
        ));
    }
    Ok(repo_path.join(path))
}

fn is_uncommitted_sha(sha: &str) -> bool {
    !sha.is_empty() && sha.bytes().all(|b| b == b'0')
}

fn is_hex_sha(sha: &str) -> bool {
    let len = sha.len();
    (7..=64).contains(&len) && sha.chars().all(|c| c.is_ascii_hexdigit())
}

fn short_hash(sha: &str) -> String {
    sha.chars().take(7).collect()
}

fn count_lines(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        return 0;
    }
    let n = bytes.iter().filter(|b| **b == b'\n').count();
    if bytes.last() == Some(&b'\n') {
        n
    } else {
        n + 1
    }
}

pub(crate) fn parse_blame_porcelain(
    output: &str,
) -> (Vec<BlameRange>, HashMap<String, BlameCommit>) {
    let mut ranges: Vec<BlameRange> = Vec::new();
    let mut commits: HashMap<String, BlameCommit> = HashMap::new();
    let mut open: Option<(Option<String>, u32, u32)> = None;

    let flush = |ranges: &mut Vec<BlameRange>, open: &mut Option<(Option<String>, u32, u32)>| {
        if let Some((hash, start, end)) = open.take() {
            ranges.push(BlameRange {
                start_line: start,
                end_line: end,
                commit_hash: hash,
            });
        }
    };

    let mut lines = output.lines().peekable();
    while let Some(header) = lines.next() {
        if header.is_empty() {
            continue;
        }
        let mut parts = header.split_whitespace();
        let Some(sha) = parts.next() else {
            continue;
        };
        let _orig = parts.next();
        let Some(final_s) = parts.next() else {
            continue;
        };
        let Ok(final_line) = final_s.parse::<u32>() else {
            continue;
        };

        let mut author_name = String::new();
        let mut author_email = String::new();
        let mut timestamp: i64 = 0;
        let mut subject = String::new();
        let mut saw_meta = false;

        while let Some(next) = lines.peek() {
            if next.starts_with('\t') {
                break;
            }
            let meta = lines.next().unwrap_or("");
            saw_meta = true;
            if let Some(rest) = meta.strip_prefix("author ") {
                author_name = rest.to_string();
            } else if let Some(rest) = meta.strip_prefix("author-mail ") {
                author_email = rest
                    .trim()
                    .trim_start_matches('<')
                    .trim_end_matches('>')
                    .to_string();
            } else if let Some(rest) = meta.strip_prefix("author-time ") {
                timestamp = rest.trim().parse().unwrap_or(0);
            } else if let Some(rest) = meta.strip_prefix("summary ") {
                subject = rest.to_string();
            }
        }
        let _ = lines.next(); // TAB content

        let commit_hash = if is_uncommitted_sha(sha) {
            None
        } else {
            if saw_meta && !commits.contains_key(sha) {
                commits.insert(
                    sha.to_string(),
                    BlameCommit {
                        hash: sha.to_string(),
                        short_hash: short_hash(sha),
                        author_name,
                        author_email,
                        timestamp,
                        subject,
                    },
                );
            }
            Some(sha.to_string())
        };

        match &mut open {
            Some((open_hash, _start, end))
                if *open_hash == commit_hash && *end + 1 == final_line =>
            {
                *end = final_line;
            }
            _ => {
                flush(&mut ranges, &mut open);
                open = Some((commit_hash, final_line, final_line));
            }
        }
        let _ = saw_meta;
    }
    flush(&mut ranges, &mut open);
    (ranges, commits)
}

pub(crate) fn parse_commit_show(hash: &str, raw: &str) -> CommitDetailInfo {
    let mut lines: Vec<&str> = raw.lines().collect();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }

    let mut files_changed = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    if let Some(last) = lines.last() {
        if let Some(parsed) = parse_shortstat_line(last.trim()) {
            files_changed = parsed.0;
            insertions = parsed.1;
            deletions = parsed.2;
            lines.pop();
            while lines.last().is_some_and(|line| line.trim().is_empty()) {
                lines.pop();
            }
        }
    }

    let message = lines.join("\n");
    let body = match message.split_once('\n') {
        Some((_, rest)) => {
            let rest = rest.trim();
            if rest.is_empty() {
                None
            } else {
                Some(rest.to_string())
            }
        }
        None => None,
    };

    CommitDetailInfo {
        hash: hash.to_string(),
        body,
        files_changed,
        insertions,
        deletions,
    }
}

fn parse_shortstat_line(line: &str) -> Option<(u32, u32, u32)> {
    if !line.contains("changed") {
        return None;
    }
    let files = capture_count(line, "file")?;
    let insertions = capture_count(line, "insertion").unwrap_or(0);
    let deletions = capture_count(line, "deletion").unwrap_or(0);
    Some((files, insertions, deletions))
}

fn capture_count(line: &str, noun: &str) -> Option<u32> {
    let idx = line.find(noun)?;
    let before = line[..idx].trim_end();
    let num = before
        .rsplit(|c: char| !c.is_ascii_digit())
        .find(|s| !s.is_empty())?;
    num.parse().ok()
}

impl GitEngine {
    pub fn file_blame(&self, repo_path: &Path, file_relative_path: &str) -> Result<FileBlameInfo> {
        LAST_BLAME_CACHE_HIT.set(false);
        let rel = file_relative_path.trim();
        let abs = resolve_repo_file(repo_path, rel)?;

        let inside = try_run_git(repo_path, &["rev-parse", "--is-inside-work-tree"])?;
        if inside.as_deref().map(str::trim) != Some("true") {
            return Err(EngineError::Git("Not a git repository".to_string()));
        }

        if !abs.exists() {
            return Ok(skip_info(rel, FileBlameKind::Untracked, None));
        }

        let tracked = try_run_git(repo_path, &["ls-files", "--error-unmatch", "--", rel])?;
        if tracked.is_none() {
            return Ok(skip_info(rel, FileBlameKind::Untracked, None));
        }

        let meta_len = std::fs::metadata(&abs)
            .map(|m| m.len())
            .map_err(|e| EngineError::Git(format!("Failed to stat blamed file: {e}")))?;
        if meta_len > BLAME_MAX_BYTES {
            return Ok(skip_info(rel, FileBlameKind::TooLarge, None));
        }

        let bytes = std::fs::read(&abs)
            .map_err(|e| EngineError::Git(format!("Failed to read blamed file: {e}")))?;
        if bytes.contains(&0) {
            return Ok(skip_info(rel, FileBlameKind::Binary, None));
        }
        if count_lines(&bytes) > BLAME_MAX_LINES {
            return Ok(skip_info(rel, FileBlameKind::TooLarge, None));
        }

        let blob_id = run_git(repo_path, &["hash-object", "--", rel])?
            .trim()
            .to_string();
        let blob_id = if blob_id.is_empty() {
            None
        } else {
            Some(blob_id)
        };

        let repo_key = repo_path
            .canonicalize()
            .unwrap_or_else(|_| repo_path.to_path_buf())
            .to_string_lossy()
            .to_string();

        if let Some(blob) = blob_id.as_deref() {
            let key = BlameCacheKey {
                repo: repo_key.clone(),
                relpath: rel.to_string(),
                blob_id: blob.to_string(),
            };
            if let Ok(mut cache) = blame_cache().lock() {
                if let Some(hit) = cache.get(&key) {
                    LAST_BLAME_CACHE_HIT.set(true);
                    return Ok(hit);
                }
            }
        }

        LAST_BLAME_CACHE_HIT.set(false);
        BLAME_WALKS.fetch_add(1, Ordering::SeqCst);
        let porcelain = run_git(repo_path, &["blame", "--line-porcelain", "--", rel])?;
        let (ranges, commits) = parse_blame_porcelain(&porcelain);
        let info = FileBlameInfo {
            file_path: rel.to_string(),
            blob_id: blob_id.clone(),
            kind: FileBlameKind::Ok,
            ranges,
            commits,
        };

        if let Some(blob) = blob_id {
            let key = BlameCacheKey {
                repo: repo_key,
                relpath: rel.to_string(),
                blob_id: blob,
            };
            if let Ok(mut cache) = blame_cache().lock() {
                cache.insert(key, info.clone());
            }
        }

        Ok(info)
    }

    pub fn commit_detail(&self, repo_path: &Path, commit_hash: &str) -> Result<CommitDetailInfo> {
        let hash = commit_hash.trim();
        if !is_hex_sha(hash) {
            return Err(EngineError::Git("Invalid commit hash".to_string()));
        }

        let repo_key = repo_path
            .canonicalize()
            .unwrap_or_else(|_| repo_path.to_path_buf())
            .to_string_lossy()
            .to_string();
        let key = DetailCacheKey {
            repo: repo_key,
            hash: hash.to_ascii_lowercase(),
        };
        if let Ok(mut cache) = detail_cache().lock() {
            if let Some(hit) = cache.get(&key) {
                return Ok(hit);
            }
        }

        DETAIL_WALKS.fetch_add(1, Ordering::SeqCst);
        let raw = run_git(
            repo_path,
            &["show", "-s", "--format=%B", "--shortstat", hash],
        )?;
        let info = parse_commit_show(hash, &raw);
        if let Ok(mut cache) = detail_cache().lock() {
            cache.insert(key, info.clone());
        }
        Ok(info)
    }
}

#[cfg(test)]
mod parser_tests {
    use super::*;

    #[test]
    fn parse_porcelain_coalesces_same_sha_and_nulls_uncommitted() {
        let sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let zeros = "0000000000000000000000000000000000000000";
        let porcelain = format!(
            "{sha} 1 1 2\n\
             author Ada\n\
             author-mail <ada@example.com>\n\
             author-time 1700000000\n\
             author-tz +0000\n\
             committer Ada\n\
             committer-mail <ada@example.com>\n\
             committer-time 1700000000\n\
             committer-tz +0000\n\
             summary first change\n\
             filename a.ts\n\
             \tline one\n\
             {sha} 2 2\n\
             \tline two\n\
             {zeros} 3 3 1\n\
             author Not Committed Yet\n\
             author-mail <not.committed.yet>\n\
             author-time 1700000001\n\
             author-tz +0000\n\
             committer Not Committed Yet\n\
             committer-mail <not.committed.yet>\n\
             committer-time 1700000001\n\
             committer-tz +0000\n\
             summary \n\
             filename a.ts\n\
             \tnew line\n"
        );
        let (ranges, commits) = parse_blame_porcelain(&porcelain);
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges[0].start_line, 1);
        assert_eq!(ranges[0].end_line, 2);
        assert_eq!(ranges[0].commit_hash.as_deref(), Some(sha));
        assert_eq!(ranges[1].start_line, 3);
        assert_eq!(ranges[1].end_line, 3);
        assert_eq!(ranges[1].commit_hash, None);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[sha].author_name, "Ada");
        assert_eq!(commits[sha].subject, "first change");
        assert!(!commits.contains_key(zeros));
    }

    #[test]
    fn parse_shortstat_and_body() {
        let raw = "subject line\n\nbody paragraph\n\n 2 files changed, 10 insertions(+), 3 deletions(-)\n";
        let info = parse_commit_show("abc1234", raw);
        assert_eq!(info.body.as_deref(), Some("body paragraph"));
        assert_eq!(info.files_changed, 2);
        assert_eq!(info.insertions, 10);
        assert_eq!(info.deletions, 3);
    }
}
