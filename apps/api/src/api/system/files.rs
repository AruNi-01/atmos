use std::path::{Path, PathBuf};

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use core_engine::GitEngine;
use core_service::default_agent_data_dir;
use serde::Deserialize;
use tokio_util::io::ReaderStream;
use tracing::warn;

use crate::app_state::AppState;

/// Hard cap for git-blob preview responses (8 MiB).
const GIT_BLOB_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Deserialize)]
pub struct ServeFileQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ServeGitBlobQuery {
    /// Absolute path to the repository root.
    pub repo: String,
    /// Git revision (`HEAD`, sha, `origin/main`) or a full show-spec starting with `:`
    /// for index blobs (`:path`).
    pub rev: String,
    /// Path inside the repository (ignored when `rev` is already a `:path` show-spec).
    #[serde(default)]
    pub path: String,
}

fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn path_ext(path: &str) -> String {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Reject path traversal and absolute paths for in-repo relative paths.
fn is_safe_repo_relative_path(path: &str) -> bool {
    if path.is_empty() || path.starts_with('/') || path.starts_with('\\') {
        return false;
    }
    for component in std::path::Path::new(path).components() {
        match component {
            std::path::Component::Normal(_) => {}
            std::path::Component::CurDir => {}
            _ => return false,
        }
    }
    !path.contains('\0')
}

/// Parse index / stage show-specs (`:path`, `:0:path` … `:3:path`) into a validated path.
/// Returns the canonical show-spec and display path, or None if invalid.
fn parse_index_show_spec(rev: &str) -> Option<(String, String)> {
    if !rev.starts_with(':') || rev.contains('\0') {
        return None;
    }
    let rest = &rev[1..];
    // Optional stage 0-3: `:N:path`
    let path = if rest.len() >= 2
        && rest.as_bytes()[0].is_ascii_digit()
        && rest.as_bytes()[0] <= b'3'
        && rest.as_bytes()[1] == b':'
    {
        &rest[2..]
    } else {
        rest
    };
    if !is_safe_repo_relative_path(path) {
        return None;
    }
    // Canonical form without stage (default index stage 0)
    Some((format!(":{path}"), path.to_string()))
}

fn is_safe_git_rev(rev: &str) -> bool {
    if rev.is_empty() || rev.contains('\0') || rev.starts_with('-') {
        return false;
    }
    // Disallow option-like and shell-y characters in rev names.
    !rev.chars().any(|c| matches!(c, ' ' | '\n' | '\r' | '\t'))
}

/// Directories the file endpoint may read, plus exact logo files.
#[derive(Debug, Clone, Default)]
pub(crate) struct FileServeAllowlist {
    pub directory_roots: Vec<PathBuf>,
    pub exact_files: Vec<PathBuf>,
}

pub(crate) struct FileServeSources {
    pub project_roots: Vec<PathBuf>,
    pub logo_files: Vec<PathBuf>,
    pub workspace_base: Option<PathBuf>,
    pub agent_data_dir: Option<PathBuf>,
    pub env_roots: Vec<PathBuf>,
}

pub(crate) fn parse_env_file_serve_roots(raw: &str) -> Vec<PathBuf> {
    std::env::split_paths(raw)
        .filter(|path| !path.as_os_str().is_empty())
        .collect()
}

/// Canonicalize one configured directory root.
/// A missing path or a filesystem root is not a root.
fn canonicalize_directory_root(root: &Path) -> Option<PathBuf> {
    let canonical = std::fs::canonicalize(root).ok()?;
    canonical.parent()?;
    Some(canonical)
}

/// First directory root that contains `canonical`.
///
/// Both sides are canonical. `Path::starts_with` is component-wise, so a root
/// `/tmp/ws` does not contain `/tmp/ws-evil`. Callers repeat `starts_with` next
/// to the read so the path-injection barrier stays in that function.
pub(crate) fn find_containing_directory_root<'a>(
    canonical: &'a Path,
    roots: &[PathBuf],
) -> Option<(&'a Path, PathBuf)> {
    for root in roots {
        let Some(root) = canonicalize_directory_root(root) else {
            continue;
        };
        if canonical.starts_with(&root) {
            return Some((canonical, root));
        }
    }
    None
}

pub(crate) fn allowlist_from_sources(sources: FileServeSources) -> FileServeAllowlist {
    let mut directory_roots = sources.project_roots;
    if let Some(root) = sources.workspace_base {
        directory_roots.push(root);
    }
    if let Some(root) = sources.agent_data_dir {
        directory_roots.push(root);
    }
    directory_roots.extend(sources.env_roots);
    let exact_files = sources
        .logo_files
        .into_iter()
        .filter(|path| path.is_absolute())
        .collect();
    FileServeAllowlist {
        directory_roots,
        exact_files,
    }
}

async fn allowlist_for_state(state: &AppState) -> Result<FileServeAllowlist, String> {
    let projects = state
        .project_service
        .list_projects()
        .await
        .map_err(|err| err.to_string())?;
    let mut project_roots = Vec::new();
    let mut logo_files = Vec::new();
    for project in projects {
        let main = project.main_file_path.trim();
        if !main.is_empty() {
            project_roots.push(PathBuf::from(main));
        }
        if let Some(logo) = project
            .logo_path
            .as_deref()
            .map(str::trim)
            .filter(|logo| !logo.is_empty())
        {
            logo_files.push(PathBuf::from(logo));
        }
    }
    Ok(allowlist_from_sources(FileServeSources {
        project_roots,
        logo_files,
        workspace_base: GitEngine::new().get_workspaces_base_dir().ok(),
        agent_data_dir: Some(default_agent_data_dir()),
        env_roots: std::env::var("ATMOS_FILE_SERVE_ROOTS")
            .map(|raw| parse_env_file_serve_roots(&raw))
            .unwrap_or_default(),
    }))
}

/// GET /api/system/file?path=<absolute_path>
///
/// The path is canonicalized and must stay inside a project root, the workspaces
/// directory, the agent data directory, `ATMOS_FILE_SERVE_ROOTS`, or equal a
/// stored project logo file. Symlink targets outside those roots are rejected.
#[allow(clippy::result_large_err)]
pub async fn serve_file(
    State(state): State<AppState>,
    Query(query): Query<ServeFileQuery>,
) -> Result<Response, Response> {
    let allowlist = match allowlist_for_state(&state).await {
        Ok(allowlist) => allowlist,
        Err(error) => {
            warn!("file serve allowlist unavailable: {error}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "File access policy unavailable",
            )
                .into_response());
        }
    };
    serve_allowed_file(&query.path, &allowlist).await
}

/// File open stays at the call site after expansion so the `starts_with` guard
/// covers `is_file`, `metadata`, and `open`.
macro_rules! respond_with_checked_path {
    ($path:expr) => {{
        let path: &Path = $path;
        if !path.is_file() {
            return Err((StatusCode::BAD_REQUEST, "Not a file").into_response());
        }

        let metadata = tokio::fs::metadata(path).await.map_err(|error| {
            warn!("Failed to read file metadata: {error}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
        })?;

        let file = tokio::fs::File::open(path).await.map_err(|error| {
            warn!("Failed to open file: {error}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response()
        })?;

        let ext = path_ext(path.to_string_lossy().as_ref());
        let body = Body::from_stream(ReaderStream::new(file));

        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime_type_for_ext(&ext))
            .header(header::CONTENT_LENGTH, metadata.len())
            .body(body)
            .unwrap()
            .into_response());
    }};
}

#[allow(clippy::result_large_err)]
pub(crate) async fn serve_allowed_file(
    path_str: &str,
    allow: &FileServeAllowlist,
) -> Result<Response, Response> {
    if path_str.is_empty() || path_str.contains('\0') || !Path::new(path_str).is_absolute() {
        return Err((StatusCode::BAD_REQUEST, "Path must be absolute").into_response());
    }

    let canonical = match std::fs::canonicalize(Path::new(path_str)) {
        Ok(path) => path,
        Err(error) => {
            warn!("Failed to resolve file path: {error}");
            return Err((StatusCode::NOT_FOUND, "File not found").into_response());
        }
    };

    if let Some((path, root)) = find_containing_directory_root(&canonical, &allow.directory_roots) {
        if path.starts_with(&root) {
            // Sinks stay in this branch so CodeQL's Path::starts_with barrier applies.
            respond_with_checked_path!(path);
        }
    }

    for file in &allow.exact_files {
        let Ok(file) = std::fs::canonicalize(file) else {
            continue;
        };
        if file == canonical {
            // Open the allowlisted path, which canonicalized to the same file.
            respond_with_checked_path!(&file);
        }
    }

    warn!(
        "Rejected file serve outside allowlist: {}",
        canonical.display()
    );
    Err((
        StatusCode::FORBIDDEN,
        "File is outside the allowed directories",
    )
        .into_response())
}

/// GET /api/system/git-blob?repo=&rev=&path=
///
/// Streams a historical or index blob via `git`. Used for binary/image
/// previews in the diff UI without embedding bytes in the WebSocket payload.
///
/// `repo` is canonicalized and must sit inside the same directory roots as
/// `GET /api/system/file`. A symlink target outside those roots is 403.
/// Git will not search above the matched root. The discovered toplevel, git
/// dir, and common dir must each canonicalize inside some directory root (not
/// necessarily the same one). Alternate object stores named by
/// `objects/info/alternates` must too, including nested files up to git's
/// depth limit. A repository with `extensions.partialClone` or
/// `remote.*.promisor=true` in local or worktree config (including included
/// files) is 403 before any object read. Exact project logo files are not git
/// roots. Rev/path checks and the 8 MiB cap are unchanged.
#[allow(clippy::result_large_err)]
pub async fn serve_git_blob(
    State(state): State<AppState>,
    Query(query): Query<ServeGitBlobQuery>,
) -> Result<Response, Response> {
    let allowlist = match allowlist_for_state(&state).await {
        Ok(allowlist) => allowlist,
        Err(error) => {
            warn!("git-blob allowlist unavailable: {error}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "File access policy unavailable",
            )
                .into_response());
        }
    };
    serve_allowed_git_blob(&query, &allowlist).await
}

enum ConfinedBlobError {
    Outside,
    Missing,
    Exec,
}

fn git_failure_kind(
    error: &core_engine::EngineError,
    missing_is_outside: bool,
) -> ConfinedBlobError {
    if error.to_string().contains("Failed to execute git") {
        ConfinedBlobError::Exec
    } else if missing_is_outside {
        ConfinedBlobError::Outside
    } else {
        ConfinedBlobError::Missing
    }
}

fn canonical_directory_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    roots
        .iter()
        .filter_map(|root| canonicalize_directory_root(root))
        .collect()
}

/// Resolve a path printed by `rev-parse`. Relative values are relative to the
/// repo directory git was started in, not the API process cwd.
fn canonicalize_reported_git_path(repo: &Path, raw: &Path) -> std::io::Result<PathBuf> {
    let candidate = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        repo.join(raw)
    };
    std::fs::canonicalize(candidate)
}

/// Git reads `info/alternates` while `depth <= 5` and ignores a deeper file.
/// A file past this depth is 403 here instead of being ignored.
const GIT_ALTERNATE_MAX_DEPTH: u32 = 5;

/// Read a blob only when toplevel, git dir, common dir, and every alternate
/// object store sit in some allowlist root, and the repo is not a promisor.
///
/// `ceiling` is the parent of the root that contained `repo`
/// (`GIT_CEILING_DIRECTORIES`). That stops an ancestor walk. It does not stop
/// git from following a `gitdir:` file, so a worktree can keep its git dir in
/// a different allowlisted root. `roots` are already canonical, and filesystem
/// roots are absent. Clearing `GIT_ALTERNATE_OBJECT_DIRECTORIES` does not stop
/// git from reading `<common-dir>/objects/info/alternates`.
///
/// Promisor and partial-clone config is rejected before identity and before
/// any object command. `GIT_NO_LAZY_FETCH` is ignored by git before 2.44, so
/// it is not the gate. A failed config read is 403.
fn read_confined_git_blob(
    repo: &Path,
    roots: &[PathBuf],
    ceiling: &Path,
    show_spec: &str,
) -> std::result::Result<Vec<u8>, ConfinedBlobError> {
    match core_engine::git_blob_repo_has_promisor(repo, ceiling) {
        Ok(false) => {}
        Ok(true) => {
            warn!(
                "Rejected git-blob for promisor or partial clone: {}",
                repo.display()
            );
            return Err(ConfinedBlobError::Outside);
        }
        Err(error) => {
            warn!("Rejected git-blob because repository config could not be read: {error}");
            return Err(ConfinedBlobError::Outside);
        }
    }
    let identity = core_engine::resolve_git_repo_identity(repo, ceiling)
        .map_err(|error| git_failure_kind(&error, true))?;
    let mut common_dir = PathBuf::new();
    for (index, raw) in [&identity.toplevel, &identity.git_dir, &identity.common_dir]
        .into_iter()
        .enumerate()
    {
        let canonical = canonicalize_reported_git_path(repo, raw).map_err(|error| {
            warn!("Failed to resolve git-blob identity path: {error}");
            ConfinedBlobError::Outside
        })?;
        if !roots.iter().any(|root| canonical.starts_with(root)) {
            warn!(
                "Rejected git-blob identity outside allowlist: {}",
                canonical.display()
            );
            return Err(ConfinedBlobError::Outside);
        }
        if index == 2 {
            common_dir = canonical;
        }
    }
    validate_object_alternates(&common_dir, roots)?;
    core_engine::show_git_blob_bytes_with_ceiling(repo, show_spec, ceiling)
        .map_err(|error| git_failure_kind(&error, false))
}

fn validate_object_alternates(
    common_dir: &Path,
    roots: &[PathBuf],
) -> Result<(), ConfinedBlobError> {
    let objects = std::fs::canonicalize(common_dir.join("objects")).map_err(|error| {
        warn!("Failed to resolve git-blob objects dir: {error}");
        ConfinedBlobError::Outside
    })?;
    if !roots.iter().any(|root| objects.starts_with(root)) {
        warn!(
            "Rejected git-blob objects dir outside allowlist: {}",
            objects.display()
        );
        return Err(ConfinedBlobError::Outside);
    }
    let mut stack = Vec::new();
    let mut done = std::collections::HashSet::new();
    walk_alternates(&objects, 0, roots, &mut stack, &mut done)
}

/// Follow `objects/info/alternates`. Relative entries are relative to `objects`.
///
/// `depth` matches git: the primary file is 0, and `depth > 5` is too deep.
/// A path already on `stack` is a cycle. A path already in `done` was checked
/// through another parent and is not an error.
fn walk_alternates(
    objects: &Path,
    depth: u32,
    roots: &[PathBuf],
    stack: &mut Vec<PathBuf>,
    done: &mut std::collections::HashSet<PathBuf>,
) -> Result<(), ConfinedBlobError> {
    // Repeat the confinement check next to the alternates read.
    if !roots.iter().any(|root| objects.starts_with(root)) {
        warn!(
            "Rejected git-blob alternate outside allowlist: {}",
            objects.display()
        );
        return Err(ConfinedBlobError::Outside);
    }
    if stack.iter().any(|seen| seen == objects) {
        warn!("Rejected git-blob alternate cycle: {}", objects.display());
        return Err(ConfinedBlobError::Outside);
    }
    if !done.insert(objects.to_path_buf()) {
        return Ok(());
    }
    let file = objects.join("info").join("alternates");
    if !file.exists() {
        return Ok(());
    }
    if depth > GIT_ALTERNATE_MAX_DEPTH {
        warn!(
            "Rejected git-blob alternates nested past depth {GIT_ALTERNATE_MAX_DEPTH}: {}",
            file.display()
        );
        return Err(ConfinedBlobError::Outside);
    }
    let bytes = std::fs::read(&file).map_err(|error| {
        warn!("Failed to read git-blob alternates: {error}");
        ConfinedBlobError::Outside
    })?;
    let text = String::from_utf8(bytes).map_err(|_| {
        warn!("Rejected non-utf8 git-blob alternates file");
        ConfinedBlobError::Outside
    })?;
    stack.push(objects.to_path_buf());
    let result = (|| {
        for line in text.split('\n') {
            let entry = match parse_alternate_line(line) {
                Ok(None) => continue,
                Ok(Some(entry)) => entry,
                Err(()) => {
                    warn!("Rejected unparseable git-blob alternates line");
                    return Err(ConfinedBlobError::Outside);
                }
            };
            let candidate = if entry.is_absolute() {
                entry
            } else {
                objects.join(entry)
            };
            let canonical = std::fs::canonicalize(&candidate).map_err(|error| {
                warn!("Failed to canonicalize git-blob alternate: {error}");
                ConfinedBlobError::Outside
            })?;
            if !canonical.is_dir() || !roots.iter().any(|root| canonical.starts_with(root)) {
                warn!(
                    "Rejected git-blob alternate outside allowlist: {}",
                    canonical.display()
                );
                return Err(ConfinedBlobError::Outside);
            }
            walk_alternates(&canonical, depth + 1, roots, stack, done)?;
        }
        Ok(())
    })();
    stack.pop();
    result
}

/// One alternates entry. `Ok(None)` skips a blank line or a `#` comment.
///
/// A line that starts with `"` uses git's C-style quoting. A broken quote does
/// not fall back to the raw text.
fn parse_alternate_line(line: &str) -> Result<Option<PathBuf>, ()> {
    let line = line.strip_suffix('\r').unwrap_or(line);
    if line.is_empty() || line.bytes().all(|byte| byte.is_ascii_whitespace()) {
        return Ok(None);
    }
    if line.as_bytes()[0] == b'#' {
        return Ok(None);
    }
    if line.as_bytes()[0] == b'"' {
        let text = unquote_git_c_style(line)?;
        if text.is_empty() {
            return Ok(None);
        }
        if text.contains('\0') {
            return Err(());
        }
        return Ok(Some(PathBuf::from(text)));
    }
    if line.contains('\0') {
        return Err(());
    }
    Ok(Some(PathBuf::from(line)))
}

/// `git`'s `unquote_c_style`. Octal escapes are exactly three digits and the
/// first digit is `0`–`3`. Trailing bytes after the closing quote are rejected.
fn unquote_git_c_style(quoted: &str) -> Result<String, ()> {
    let bytes = quoted.as_bytes();
    if bytes.first() != Some(&b'"') {
        return Err(());
    }
    let mut index = 1;
    let mut out = Vec::new();
    loop {
        if index >= bytes.len() {
            return Err(());
        }
        match bytes[index] {
            b'"' => {
                index += 1;
                if index != bytes.len() {
                    return Err(());
                }
                return String::from_utf8(out).map_err(|_| ());
            }
            b'\\' => {
                index += 1;
                if index >= bytes.len() {
                    return Err(());
                }
                let ch = bytes[index];
                index += 1;
                let decoded = match ch {
                    b'a' => 0x07,
                    b'b' => 0x08,
                    b'f' => 0x0c,
                    b'n' => b'\n',
                    b'r' => b'\r',
                    b't' => b'\t',
                    b'v' => 0x0b,
                    b'\\' | b'"' => ch,
                    b'0'..=b'3' => {
                        if index + 1 >= bytes.len() {
                            return Err(());
                        }
                        let digit1 = bytes[index];
                        let digit2 = bytes[index + 1];
                        if !(b'0'..=b'7').contains(&digit1) || !(b'0'..=b'7').contains(&digit2) {
                            return Err(());
                        }
                        index += 2;
                        ((ch - b'0') << 6) | ((digit1 - b'0') << 3) | (digit2 - b'0')
                    }
                    _ => return Err(()),
                };
                out.push(decoded);
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
}

fn reject_git_blob_repo(canonical: &Path) -> Response {
    warn!(
        "Rejected git-blob repo outside allowlist: {}",
        canonical.display()
    );
    (
        StatusCode::FORBIDDEN,
        "Repo is outside the allowed directories",
    )
        .into_response()
}

#[allow(clippy::result_large_err)]
pub(crate) async fn serve_allowed_git_blob(
    query: &ServeGitBlobQuery,
    allow: &FileServeAllowlist,
) -> Result<Response, Response> {
    let repo_raw = query.repo.trim();
    if repo_raw.is_empty() || repo_raw.contains('\0') || !Path::new(repo_raw).is_absolute() {
        return Err((StatusCode::BAD_REQUEST, "Invalid repo path").into_response());
    }
    let repo = PathBuf::from(repo_raw);
    if !repo.is_dir() {
        return Err((StatusCode::BAD_REQUEST, "Invalid repo path").into_response());
    }

    let rev = query.rev.trim();
    let (show_spec, display_path) = if rev.starts_with(':') {
        // Index / stage form: `:path` or `:N:path` — validate the path portion.
        parse_index_show_spec(rev)
            .ok_or_else(|| (StatusCode::BAD_REQUEST, "Invalid index blob rev").into_response())?
    } else {
        if !is_safe_git_rev(rev) {
            return Err((StatusCode::BAD_REQUEST, "Invalid rev").into_response());
        }
        let path = query.path.trim();
        if !is_safe_repo_relative_path(path) {
            return Err((StatusCode::BAD_REQUEST, "Invalid path").into_response());
        }
        (format!("{rev}:{path}"), path.to_string())
    };

    let canonical = match std::fs::canonicalize(&repo) {
        Ok(path) => path,
        Err(error) => {
            warn!("Failed to resolve git-blob repo: {error}");
            return Err(reject_git_blob_repo(&repo));
        }
    };

    if let Some((repo_path, root)) =
        find_containing_directory_root(&canonical, &allow.directory_roots)
    {
        if repo_path.starts_with(&root) {
            // Git runs only on the canonical path that passed `starts_with`.
            let Some(ceiling) = root.parent().map(Path::to_path_buf) else {
                return Err(reject_git_blob_repo(repo_path));
            };
            let repo_for_git = repo_path.to_path_buf();
            let directory_roots = canonical_directory_roots(&allow.directory_roots);
            let bytes = tokio::task::spawn_blocking(move || {
                read_confined_git_blob(&repo_for_git, &directory_roots, &ceiling, &show_spec)
            })
            .await
            .map_err(|e| {
                warn!("git-blob join error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read blob").into_response()
            })?
            .map_err(|error| match error {
                ConfinedBlobError::Outside => reject_git_blob_repo(&canonical),
                ConfinedBlobError::Exec => {
                    warn!("git-blob failed to execute git");
                    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read blob").into_response()
                }
                ConfinedBlobError::Missing => {
                    warn!("git-blob show failed");
                    (StatusCode::NOT_FOUND, "Blob not found").into_response()
                }
            })?;

            if bytes.len() as u64 > GIT_BLOB_MAX_BYTES {
                return Err((StatusCode::PAYLOAD_TOO_LARGE, "Blob too large").into_response());
            }

            let ext = path_ext(&display_path);
            let len = bytes.len();
            return Ok(Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime_type_for_ext(&ext))
                .header(header::CONTENT_LENGTH, len)
                .header(header::CACHE_CONTROL, "private, max-age=60")
                .body(Body::from(bytes))
                .unwrap()
                .into_response());
        }
    }

    Err(reject_git_blob_repo(&canonical))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use std::os::unix::fs::symlink;

    struct TempTree(PathBuf);

    impl TempTree {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("atmos-file-serve-{label}-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&path).expect("temp dir");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn roots(paths: &[PathBuf]) -> FileServeAllowlist {
        FileServeAllowlist {
            directory_roots: paths.to_vec(),
            exact_files: Vec::new(),
        }
    }

    async fn response_for(path: &str, allow: &FileServeAllowlist) -> Response {
        match serve_allowed_file(path, allow).await {
            Ok(response) | Err(response) => response,
        }
    }

    async fn status_and_body(path: &str, allow: &FileServeAllowlist) -> (StatusCode, Vec<u8>) {
        let response = response_for(path, allow).await;
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body")
            .to_vec();
        (status, bytes)
    }

    #[tokio::test]
    async fn serves_file_inside_allowlisted_directory() {
        let tree = TempTree::new("in-root");
        let root = tree.path().join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("readme.txt");
        std::fs::write(&file, b"hello-readme").unwrap();

        let (status, body) = status_and_body(&file.to_string_lossy(), &roots(&[root])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"hello-readme");
    }

    #[tokio::test]
    async fn rejects_file_outside_allowlist() {
        let tree = TempTree::new("outside");
        let root = tree.path().join("workspace");
        let outside = tree.path().join("secret.txt");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&outside, b"outside-secret-bytes").unwrap();

        let (status, body) = status_and_body(&outside.to_string_lossy(), &roots(&[root])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body
            .windows(b"outside-secret-bytes".len())
            .any(|w| w == b"outside-secret-bytes"));
    }

    #[tokio::test]
    async fn rejects_sibling_prefix_and_dotdot_escape() {
        let tree = TempTree::new("prefix");
        let workspace = tree.path().join("workspace");
        let evil = tree.path().join("workspace-evil");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&evil).unwrap();
        let evil_file = evil.join("secret.txt");
        std::fs::write(&evil_file, b"sibling-secret").unwrap();
        let outside = tree.path().join("outside.txt");
        std::fs::write(&outside, b"dotdot-secret").unwrap();
        let dotdot = workspace.join("../outside.txt");

        let allow = roots(&[workspace]);
        assert_eq!(
            response_for(&evil_file.to_string_lossy(), &allow)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            response_for(&dotdot.to_string_lossy(), &allow)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn rejects_symlink_escape_without_returning_secret() {
        let tree = TempTree::new("symlink-out");
        let workspace = tree.path().join("workspace");
        let outside = tree.path().join("outside");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let secret = outside.join("secret.txt");
        let secret_bytes = b"symlink-escape-secret-9f3a";
        std::fs::write(&secret, secret_bytes).unwrap();
        let link = workspace.join("link");
        symlink(&secret, &link).unwrap();

        let (status, body) = status_and_body(&link.to_string_lossy(), &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(
            !body
                .windows(secret_bytes.len())
                .any(|chunk| chunk == secret_bytes),
            "response leaked the symlink target"
        );
    }

    #[tokio::test]
    async fn serves_symlink_whose_target_stays_inside_root() {
        let tree = TempTree::new("symlink-in");
        let workspace = tree.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let readme = workspace.join("readme.txt");
        std::fs::write(&readme, b"in-root-target").unwrap();
        let alias = workspace.join("alias");
        symlink(&readme, &alias).unwrap();

        let (status, body) = status_and_body(&alias.to_string_lossy(), &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"in-root-target");
    }

    #[tokio::test]
    async fn rejects_relative_missing_and_directory() {
        let tree = TempTree::new("shapes");
        let root = tree.path().join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        let allow = roots(std::slice::from_ref(&root));

        assert_eq!(
            response_for("readme.txt", &allow).await.status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            response_for(&root.join("missing.txt").to_string_lossy(), &allow)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            response_for(&root.to_string_lossy(), &allow).await.status(),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn serves_exact_logo_file_but_not_sibling() {
        let tree = TempTree::new("logo");
        let logo = tree.path().join("logo.png");
        let sibling = tree.path().join("other.png");
        std::fs::write(&logo, b"logo-bytes").unwrap();
        std::fs::write(&sibling, b"sibling-bytes").unwrap();
        let allow = FileServeAllowlist {
            directory_roots: Vec::new(),
            exact_files: vec![logo.clone()],
        };

        let (status, body) = status_and_body(&logo.to_string_lossy(), &allow).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"logo-bytes");
        assert_eq!(
            response_for(&sibling.to_string_lossy(), &allow)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn serves_extra_root_and_ignores_filesystem_root() {
        let tree = TempTree::new("env-root");
        let extra = tree.path().join("extra");
        std::fs::create_dir_all(&extra).unwrap();
        let file = extra.join("note.txt");
        std::fs::write(&file, b"from-extra-root").unwrap();
        let allow = allowlist_from_sources(FileServeSources {
            project_roots: Vec::new(),
            logo_files: vec![PathBuf::from("relative/logo.png")],
            workspace_base: None,
            agent_data_dir: None,
            env_roots: parse_env_file_serve_roots(&extra.to_string_lossy()),
        });
        assert!(allow.exact_files.is_empty());

        let (status, body) = status_and_body(&file.to_string_lossy(), &allow).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"from-extra-root");

        let open_root = FileServeAllowlist {
            directory_roots: vec![PathBuf::from("/")],
            exact_files: Vec::new(),
        };
        assert_eq!(
            response_for(&file.to_string_lossy(), &open_root)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }

    fn git(dir: &Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git command should run");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo(dir: &Path) {
        std::fs::create_dir_all(dir).expect("repo dir");
        git(dir, &["init"]);
        git(dir, &["config", "user.email", "atmos@example.com"]);
        git(dir, &["config", "user.name", "Atmos Test"]);
    }

    fn commit_bytes(repo: &Path, name: &str, bytes: &[u8]) {
        std::fs::write(repo.join(name), bytes).expect("write blob file");
        git(repo, &["add", "--", name]);
        git(repo, &["commit", "-m", "add blob file"]);
    }

    async fn git_blob_response(
        repo: &Path,
        rev: &str,
        path: &str,
        allow: &FileServeAllowlist,
    ) -> Response {
        let query = ServeGitBlobQuery {
            repo: repo.to_string_lossy().to_string(),
            rev: rev.to_string(),
            path: path.to_string(),
        };
        match serve_allowed_git_blob(&query, allow).await {
            Ok(response) | Err(response) => response,
        }
    }

    async fn git_blob_status_and_body(
        repo: &Path,
        rev: &str,
        path: &str,
        allow: &FileServeAllowlist,
    ) -> (StatusCode, Vec<u8>) {
        let response = git_blob_response(repo, rev, path, allow).await;
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body")
            .to_vec();
        (status, bytes)
    }

    fn body_contains(body: &[u8], secret: &[u8]) -> bool {
        !secret.is_empty() && body.windows(secret.len()).any(|chunk| chunk == secret)
    }

    #[tokio::test]
    async fn serves_git_blob_inside_allowlisted_directory() {
        let tree = TempTree::new("git-in-root");
        let workspace = tree.path().join("workspace");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"hello-from-repo");

        let allow = roots(&[workspace]);
        let (status, body) = git_blob_status_and_body(&repo, "HEAD", "hello.txt", &allow).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"hello-from-repo");
        assert_eq!(
            git_blob_response(&repo, "HEAD", "missing.txt", &allow)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn serves_git_blob_when_repo_itself_is_the_root() {
        let tree = TempTree::new("git-repo-root");
        let repo = tree.path().join("project");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"project-root-blob");

        let (status, body) = git_blob_status_and_body(
            &repo,
            "HEAD",
            "hello.txt",
            &roots(std::slice::from_ref(&repo)),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"project-root-blob");
    }

    #[tokio::test]
    async fn rejects_git_blob_outside_allowlist() {
        let tree = TempTree::new("git-outside");
        let workspace = tree.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let outside = tree.path().join("outside-repo");
        init_repo(&outside);
        let secret = b"git-blob-outside-secret-9f3a";
        commit_bytes(&outside, "secret.txt", secret);

        let (status, body) =
            git_blob_status_and_body(&outside, "HEAD", "secret.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn rejects_git_blob_dotdot_escape() {
        let tree = TempTree::new("git-dotdot");
        let workspace = tree.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let outside = tree.path().join("outside-repo");
        init_repo(&outside);
        let secret = b"git-blob-dotdot-secret-9f3a";
        commit_bytes(&outside, "secret.txt", secret);
        let escaped = workspace.join("..").join("outside-repo");

        let (status, body) =
            git_blob_status_and_body(&escaped, "HEAD", "secret.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn rejects_git_blob_symlink_escape() {
        let tree = TempTree::new("git-symlink-out");
        let workspace = tree.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let outside = tree.path().join("outside-repo");
        init_repo(&outside);
        let secret = b"git-blob-symlink-secret-9f3a";
        commit_bytes(&outside, "secret.txt", secret);
        let link = workspace.join("link");
        symlink(&outside, &link).unwrap();

        let (status, body) =
            git_blob_status_and_body(&link, "HEAD", "secret.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn serves_git_blob_symlink_inside_root() {
        let tree = TempTree::new("git-symlink-in");
        let workspace = tree.path().join("workspace");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"in-root-symlink-blob");
        let link = workspace.join("link");
        symlink(&repo, &link).unwrap();

        let (status, body) =
            git_blob_status_and_body(&link, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"in-root-symlink-blob");
    }

    #[tokio::test]
    async fn rejects_git_blob_sibling_prefix_and_filesystem_root() {
        let tree = TempTree::new("git-sibling");
        let workspace = tree.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let evil = tree.path().join("workspace-evil");
        init_repo(&evil);
        commit_bytes(&evil, "secret.txt", b"sibling-repo-secret");

        assert_eq!(
            git_blob_response(&evil, "HEAD", "secret.txt", &roots(&[workspace]))
                .await
                .status(),
            StatusCode::FORBIDDEN
        );

        let open_root = FileServeAllowlist {
            directory_roots: vec![PathBuf::from("/")],
            exact_files: Vec::new(),
        };
        assert_eq!(
            git_blob_response(&evil, "HEAD", "secret.txt", &open_root)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn ignores_exact_logo_file_for_git_blob() {
        let tree = TempTree::new("git-logo");
        let repo = tree.path().join("logo-repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"logo-repo-blob");
        let allow = FileServeAllowlist {
            directory_roots: Vec::new(),
            exact_files: vec![repo.clone()],
        };

        assert_eq!(
            git_blob_response(&repo, "HEAD", "hello.txt", &allow)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn rejects_unsafe_rev_and_path() {
        let tree = TempTree::new("git-rev");
        let repo = tree.path().join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"still-here");
        let allow = roots(std::slice::from_ref(&repo));

        assert_eq!(
            git_blob_response(&repo, "--output=/tmp/pwned", "hello.txt", &allow)
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            git_blob_response(&repo, "HEAD", "../secret", &allow)
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            git_blob_response(&repo, ":../secret", "", &allow)
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );

        let query = ServeGitBlobQuery {
            repo: "not/absolute".to_string(),
            rev: "HEAD".to_string(),
            path: "hello.txt".to_string(),
        };
        let response = serve_allowed_git_blob(&query, &allow).await;
        let response = match response {
            Ok(response) | Err(response) => response,
        };
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn serves_index_blob_inside_allowlist() {
        let tree = TempTree::new("git-index");
        let repo = tree.path().join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "keep.txt", b"anchor");
        std::fs::write(repo.join("note.txt"), b"staged-note").unwrap();
        git(&repo, &["add", "--", "note.txt"]);

        let (status, body) =
            git_blob_status_and_body(&repo, ":note.txt", "", &roots(std::slice::from_ref(&repo)))
                .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"staged-note");
    }

    #[tokio::test]
    async fn rejects_git_blob_over_size_cap() {
        let tree = TempTree::new("git-cap");
        let repo = tree.path().join("repo");
        init_repo(&repo);
        let bytes = vec![0_u8; GIT_BLOB_MAX_BYTES as usize + 1];
        commit_bytes(&repo, "big.bin", &bytes);

        let (status, body) = git_blob_status_and_body(
            &repo,
            "HEAD",
            "big.bin",
            &roots(std::slice::from_ref(&repo)),
        )
        .await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(body, b"Blob too large");
    }

    #[tokio::test]
    async fn rejects_git_blob_discovered_above_allowlist() {
        let tree = TempTree::new("git-ceiling");
        let home = tree.path().join("home");
        init_repo(&home);
        let secret = b"ancestor-repo-secret-9f3a";
        commit_bytes(&home, "s.txt", secret);
        let workspace = home.join("ws");
        let sub = workspace.join("sub");
        std::fs::create_dir_all(&sub).unwrap();

        let (status, body) =
            git_blob_status_and_body(&sub, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn rejects_git_blob_external_gitdir_file() {
        let tree = TempTree::new("git-gitdir");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        let secret = b"gitdir-escape-secret-9f3a";
        commit_bytes(&outside, "s.txt", secret);
        let workspace = tree.path().join("ws");
        let sub = workspace.join("sub");
        std::fs::create_dir_all(&sub).unwrap();
        let git_dir = outside.join(".git");
        std::fs::write(sub.join(".git"), format!("gitdir: {}\n", git_dir.display())).unwrap();

        let (status, body) =
            git_blob_status_and_body(&sub, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn serves_linked_worktree_whose_git_dir_stays_inside_root() {
        let tree = TempTree::new("git-worktree");
        let root = tree.path().join("root");
        let repo = root.join("main");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"worktree-blob");
        let worktree = root.join("wt");
        git(
            &repo,
            &[
                "worktree",
                "add",
                "--detach",
                worktree.to_str().expect("worktree path"),
                "HEAD",
            ],
        );

        let (status, body) =
            git_blob_status_and_body(&worktree, "HEAD", "hello.txt", &roots(&[root])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"worktree-blob");
    }

    #[tokio::test]
    async fn serves_worktree_under_workspaces_with_git_dir_in_project_root() {
        let projects = TempTree::new("git-project-root");
        let workspaces = TempTree::new("git-workspaces-root");
        let project = projects.path().join("project");
        init_repo(&project);
        commit_bytes(&project, "hello.txt", b"cross-root-worktree-blob");
        let worktree = workspaces.path().join("wt");
        git(
            &project,
            &[
                "worktree",
                "add",
                "--detach",
                worktree.to_str().expect("worktree path"),
                "HEAD",
            ],
        );

        // `.git` is a gitdir file pointing at `<project>/.git/worktrees/wt`.
        // The ceiling is the parent of the workspaces root, which is not the
        // project root. A 200 means git followed that pointer anyway.
        let git_link = std::fs::read_to_string(worktree.join(".git")).unwrap();
        assert!(
            git_link.contains(project.to_str().expect("project path")),
            "worktree gitdir should point into the project root, got {git_link}"
        );

        let allow = roots(&[project.clone(), workspaces.path().to_path_buf()]);
        let (status, body) = git_blob_status_and_body(&worktree, "HEAD", "hello.txt", &allow).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"cross-root-worktree-blob");
    }

    #[tokio::test]
    async fn rejects_git_blob_when_commondir_is_outside_allowlist() {
        let tree = TempTree::new("git-commondir");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        let secret = b"commondir-escape-secret-9f3a";
        commit_bytes(&outside, "s.txt", secret);
        let workspace = tree.path().join("ws");
        let sub = workspace.join("sub");
        let private_git = workspace.join("priv.git");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::create_dir_all(&private_git).unwrap();
        std::fs::write(
            sub.join(".git"),
            format!("gitdir: {}\n", private_git.display()),
        )
        .unwrap();
        std::fs::write(
            private_git.join("commondir"),
            format!("{}\n", outside.join(".git").display()),
        )
        .unwrap();
        std::fs::copy(outside.join(".git").join("HEAD"), private_git.join("HEAD")).unwrap();
        std::fs::write(
            private_git.join("gitdir"),
            format!("gitdir: {}\n", sub.join(".git").display()),
        )
        .unwrap();

        let (status, body) =
            git_blob_status_and_body(&sub, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    /// Real assertion lives in the child process. The suite also runs this
    /// test without the probe env; that pass only checks the harness entry.
    #[tokio::test]
    async fn git_dir_env_probe() {
        if std::env::var("ATMOS_GIT_BLOB_ENV_PROBE").ok().as_deref() != Some("1") {
            return;
        }
        let repo = PathBuf::from(std::env::var("ATMOS_GIT_BLOB_PROBE_REPO").expect("probe repo"));
        let other =
            PathBuf::from(std::env::var("ATMOS_GIT_BLOB_PROBE_OTHER").expect("probe other"));
        let allow = roots(&[repo.clone(), other]);
        let (status, body) = git_blob_status_and_body(&repo, "HEAD", "hello.txt", &allow).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"from-repo-a");
    }

    #[tokio::test]
    async fn ignores_inherited_git_dir_for_allowlisted_repo() {
        let tree = TempTree::new("git-inherited-dir");
        let repo_a = tree.path().join("repo-a");
        let repo_b = tree.path().join("repo-b");
        init_repo(&repo_a);
        init_repo(&repo_b);
        commit_bytes(&repo_a, "hello.txt", b"from-repo-a");
        commit_bytes(&repo_b, "hello.txt", b"from-repo-b-secret");

        let repo_a_for_child = repo_a.clone();
        let repo_b_for_child = repo_b.clone();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(std::env::current_exe().expect("test executable"))
                .env("ATMOS_GIT_BLOB_ENV_PROBE", "1")
                .env("GIT_DIR", repo_b_for_child.join(".git"))
                .env("ATMOS_GIT_BLOB_PROBE_REPO", &repo_a_for_child)
                .env("ATMOS_GIT_BLOB_PROBE_OTHER", &repo_b_for_child)
                .args([
                    "--exact",
                    "--test-threads=1",
                    "api::system::files::tests::git_dir_env_probe",
                ])
                .output()
                .expect("spawn git dir probe")
        })
        .await
        .expect("probe join");
        assert!(
            output.status.success(),
            "probe status {:?}\nstdout {}\nstderr {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn git_stdout(dir: &Path, args: &[&str]) -> String {
        let output = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git command should run");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("git stdout utf8")
    }

    fn shared_clone(parent: &Path, source: &Path, dest: &Path) {
        git(
            parent,
            &[
                "clone",
                "--shared",
                source.to_str().expect("clone source"),
                dest.to_str().expect("clone dest"),
            ],
        );
    }

    fn objects_dir(repo: &Path) -> PathBuf {
        repo.join(".git").join("objects")
    }

    /// Path of `target` relative to `base`, both absolute.
    fn relative_from(base: &Path, target: &Path) -> PathBuf {
        let base: Vec<_> = base.components().collect();
        let target: Vec<_> = target.components().collect();
        let common = base
            .iter()
            .zip(target.iter())
            .take_while(|(left, right)| left == right)
            .count();
        let mut relative = PathBuf::new();
        for _ in common..base.len() {
            relative.push("..");
        }
        for component in &target[common..] {
            relative.push(component);
        }
        relative
    }

    fn loose_object_exists(repo: &Path, oid: &str) -> bool {
        let (prefix, rest) = oid.split_at(2);
        objects_dir(repo).join(prefix).join(rest).exists()
    }

    fn copy_loose_object(from: &Path, to: &Path, oid: &str) {
        let (prefix, rest) = oid.split_at(2);
        let dest_dir = objects_dir(to).join(prefix);
        std::fs::create_dir_all(&dest_dir).unwrap();
        std::fs::copy(
            objects_dir(from).join(prefix).join(rest),
            dest_dir.join(rest),
        )
        .unwrap();
    }

    fn configure_promisor(repo: &Path, url: &str) {
        git(repo, &["config", "remote.origin.url", url]);
        git(repo, &["config", "remote.origin.promisor", "true"]);
        git(
            repo,
            &["config", "remote.origin.partialclonefilter", "blob:none"],
        );
        git(repo, &["config", "extensions.partialclone", "origin"]);
    }

    fn pack_file_exists(repo: &Path) -> bool {
        let pack = objects_dir(repo).join("pack");
        std::fs::read_dir(pack).is_ok_and(|entries| {
            entries
                .filter_map(Result::ok)
                .any(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("pack"))
        })
    }

    /// Commit and tree are present. The blob object is not, so only a promisor
    /// fetch can supply it.
    fn repo_missing_blob(repo: &Path, source: &Path) -> String {
        init_repo(repo);
        let commit = git_stdout(source, &["rev-parse", "HEAD"]);
        let tree = git_stdout(source, &["rev-parse", "HEAD^{tree}"]);
        let blob = git_stdout(source, &["rev-parse", "HEAD:s.txt"]);
        let commit = commit.trim();
        let tree = tree.trim();
        let blob = blob.trim();
        copy_loose_object(source, repo, commit);
        copy_loose_object(source, repo, tree);
        git(repo, &["update-ref", "HEAD", commit]);
        assert!(!loose_object_exists(repo, blob));
        blob.to_string()
    }

    #[test]
    fn parses_git_alternate_quoting() {
        assert_eq!(parse_alternate_line("").unwrap(), None);
        assert_eq!(parse_alternate_line("   ").unwrap(), None);
        assert_eq!(parse_alternate_line("# borrowed store").unwrap(), None);
        assert_eq!(
            parse_alternate_line("\"/tmp/a\\040b\"").unwrap(),
            Some(PathBuf::from("/tmp/a b"))
        );
        assert!(parse_alternate_line("\"unterminated").is_err());
        assert!(parse_alternate_line("\"\\41\"").is_err());
        assert!(parse_alternate_line("\"ok\" junk").is_err());
    }

    #[tokio::test]
    async fn rejects_git_blob_alternate_outside_allowlist() {
        let tree = TempTree::new("git-alt-out");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        let secret = b"alternate-escape-secret-9f3a";
        commit_bytes(&outside, "s.txt", secret);
        let workspace = tree.path().join("ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let main = workspace.join("main");
        shared_clone(tree.path(), &outside, &main);

        let (status, body) =
            git_blob_status_and_body(&main, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn serves_git_blob_from_allowlisted_alternate() {
        let tree = TempTree::new("git-alt-in");
        let root = tree.path().join("root");
        let alt = root.join("alt");
        init_repo(&alt);
        commit_bytes(&alt, "hello.txt", b"only-in-alternate");
        let main = root.join("main");
        shared_clone(&root, &alt, &main);

        let oid = git_stdout(&alt, &["rev-parse", "HEAD:hello.txt"]);
        let oid = oid.trim();
        assert!(
            !loose_object_exists(&main, oid),
            "blob should live only in the alternate"
        );
        let pack_dir = objects_dir(&main).join("pack");
        let copied_pack = pack_dir.exists()
            && std::fs::read_dir(&pack_dir).is_ok_and(|entries| {
                entries.filter_map(Result::ok).any(|entry| {
                    matches!(
                        entry.path().extension().and_then(|ext| ext.to_str()),
                        Some("pack" | "idx")
                    )
                })
            });
        assert!(
            !copied_pack,
            "shared clone should not copy a pack into the borrower"
        );

        let relative = relative_from(&objects_dir(&main), &objects_dir(&alt));
        std::fs::write(
            objects_dir(&main).join("info").join("alternates"),
            format!("\n# borrowed\n\"{}\"\n", relative.display()),
        )
        .unwrap();

        let (status, body) =
            git_blob_status_and_body(&main, "HEAD", "hello.txt", &roots(&[root])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"only-in-alternate");
    }

    #[tokio::test]
    async fn rejects_git_blob_when_nested_alternate_is_outside_allowlist() {
        let tree = TempTree::new("git-alt-nested");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        let secret = b"nested-alternate-secret-9f3a";
        commit_bytes(&outside, "s.txt", secret);
        let workspace = tree.path().join("ws");
        let middle = workspace.join("middle");
        std::fs::create_dir_all(&workspace).unwrap();
        shared_clone(tree.path(), &outside, &middle);
        let main = workspace.join("main");
        shared_clone(&workspace, &middle, &main);

        let (status, body) =
            git_blob_status_and_body(&main, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
    }

    #[tokio::test]
    async fn rejects_git_blob_when_alternates_nesting_exceeds_git_depth() {
        let tree = TempTree::new("git-alt-depth");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"local-blob");

        // Primary file is depth 0. chain/0 is depth 1, ..., chain/5 is depth 6.
        // Git ignores a file at depth > 5. This request is 403 instead.
        let mut previous = objects_dir(&repo);
        for index in 0..=5 {
            let objects = workspace.join("chain").join(index.to_string());
            std::fs::create_dir_all(objects.join("info")).unwrap();
            std::fs::write(
                previous.join("info").join("alternates"),
                format!("{}\n", objects.display()),
            )
            .unwrap();
            previous = objects;
        }
        std::fs::create_dir_all(previous.join("info")).unwrap();
        std::fs::write(previous.join("info").join("alternates"), "\n").unwrap();

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_ne!(body, b"local-blob");
    }

    #[tokio::test]
    async fn rejects_git_blob_when_alternates_line_is_unparseable() {
        let tree = TempTree::new("git-alt-quote");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"local-blob");
        std::fs::create_dir_all(objects_dir(&repo).join("info")).unwrap();
        std::fs::write(
            objects_dir(&repo).join("info").join("alternates"),
            "\"unterminated\n",
        )
        .unwrap();

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_ne!(body, b"local-blob");
    }

    #[tokio::test]
    async fn rejects_git_blob_when_alternates_form_a_cycle() {
        let tree = TempTree::new("git-alt-cycle");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"local-blob");
        let objects = objects_dir(&repo);
        let other = workspace.join("other-objects");
        std::fs::create_dir_all(other.join("info")).unwrap();
        std::fs::create_dir_all(objects.join("info")).unwrap();
        std::fs::write(
            objects.join("info").join("alternates"),
            format!("{}\n", other.display()),
        )
        .unwrap();
        std::fs::write(
            other.join("info").join("alternates"),
            format!("{}\n", objects.display()),
        )
        .unwrap();

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_ne!(body, b"local-blob");
    }

    #[tokio::test]
    async fn does_not_lazy_fetch_promisor_file_outside_allowlist() {
        let tree = TempTree::new("git-promisor");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        let secret = b"promisor-file-secret-9f3a";
        commit_bytes(&outside, "s.txt", secret);
        let workspace = tree.path().join("ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let repo = workspace.join("repo");
        let blob = repo_missing_blob(&repo, &outside);
        let url = format!("file://{}", outside.display());
        configure_promisor(&repo, &url);
        git(&repo, &["config", "protocol.file.allow", "always"]);

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, secret));
        assert!(!loose_object_exists(&repo, &blob));
        assert!(
            !pack_file_exists(&repo),
            "promisor fetch must not write a pack"
        );
    }

    #[tokio::test]
    async fn does_not_run_promisor_ext_or_ssh_command() {
        let tree = TempTree::new("git-ext");
        let outside = tree.path().join("outside");
        init_repo(&outside);
        commit_bytes(&outside, "s.txt", b"ext-secret-not-local");
        let workspace = tree.path().join("ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let repo = workspace.join("repo");
        repo_missing_blob(&repo, &outside);
        let ext_marker = tree.path().join("ext-ran");
        let ssh_marker = tree.path().join("ssh-ran");
        configure_promisor(&repo, &format!("ext::touch {}", ext_marker.display()));
        git(&repo, &["config", "protocol.ext.allow", "always"]);
        git(&repo, &["config", "protocol.ssh.allow", "always"]);
        git(
            &repo,
            &[
                "config",
                "core.sshCommand",
                &format!("touch {}", ssh_marker.display()),
            ],
        );

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "s.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body_contains(&body, b"ext-secret-not-local"));
        assert!(!ext_marker.exists(), "ext:: command must not run");
        assert!(!ssh_marker.exists(), "core.sshCommand must not run");
    }

    #[tokio::test]
    async fn does_not_run_fsmonitor_command_for_index_blob() {
        let tree = TempTree::new("git-fsmonitor");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "keep.txt", b"anchor");
        std::fs::write(repo.join("note.txt"), b"staged-note").unwrap();
        git(&repo, &["add", "--", "note.txt"]);
        let marker = tree.path().join("fsmonitor-ran");
        git(
            &repo,
            &[
                "config",
                "core.fsmonitor",
                &format!("touch {}", marker.display()),
            ],
        );

        let (status, body) =
            git_blob_status_and_body(&repo, ":note.txt", "", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"staged-note");
        assert!(!marker.exists(), "core.fsmonitor command must not run");
    }

    /// Real assertion lives in the child process, which does not export
    /// `GIT_NO_LAZY_FETCH`. The suite also runs this test without the probe
    /// env; that pass only checks the harness entry.
    #[tokio::test]
    async fn promisor_fetch_probe() {
        if std::env::var("ATMOS_GIT_BLOB_PROMISOR_PROBE")
            .ok()
            .as_deref()
            != Some("1")
        {
            return;
        }
        let repo = PathBuf::from(std::env::var("ATMOS_GIT_BLOB_PROBE_REPO").expect("probe repo"));
        let root = PathBuf::from(std::env::var("ATMOS_GIT_BLOB_PROBE_ROOT").expect("probe root"));
        let marker =
            PathBuf::from(std::env::var("ATMOS_GIT_BLOB_PROBE_MARKER").expect("probe marker"));
        let (status, _) = git_blob_status_and_body(&repo, "HEAD", "s.txt", &roots(&[root])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!marker.exists(), "remote helper must not run");
    }

    fn shell_single_quote(path: &Path) -> String {
        let text = path.to_str().expect("utf8 path");
        assert!(!text.contains('\''), "path must not contain a single quote");
        format!("'{text}'")
    }

    fn write_executable(path: &Path, body: &str) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(path, body).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// Helpers that record a marker if git actually launches them.
    /// Built-in `ftp` / `ftps` / `fd` live in git's exec path, ahead of `PATH`,
    /// so the overlay replaces those names there.
    fn install_marker_helpers(tree: &Path, marker: &Path) -> PathBuf {
        let bin = tree.join("helpers");
        std::fs::create_dir_all(&bin).unwrap();
        let script = bin.join("marker-helper");
        write_executable(
            &script,
            &format!("#!/bin/sh\ntouch {}\nexit 1\n", shell_single_quote(marker)),
        );
        let exec = tree.join("git-exec");
        std::fs::create_dir_all(&exec).unwrap();
        let real = std::process::Command::new("git")
            .args(["--exec-path"])
            .output()
            .expect("git --exec-path");
        assert!(real.status.success(), "git --exec-path failed");
        let real_path = PathBuf::from(String::from_utf8(real.stdout).unwrap().trim());
        for entry in std::fs::read_dir(&real_path).unwrap() {
            let entry = entry.unwrap();
            let link = exec.join(entry.file_name());
            if link.symlink_metadata().is_err() {
                symlink(entry.path(), &link).unwrap();
            }
        }
        for name in [
            "git-remote-ftp",
            "git-remote-ftps",
            "git-remote-fd",
            "git-remote-foo",
        ] {
            let link = exec.join(name);
            if link.symlink_metadata().is_ok() {
                std::fs::remove_file(&link).unwrap();
            }
            symlink(&script, &link).unwrap();
        }
        exec
    }

    fn prepare_missing_blob_repo(label: &str) -> (TempTree, PathBuf, PathBuf) {
        let tree = TempTree::new(label);
        let outside = tree.path().join("outside");
        init_repo(&outside);
        commit_bytes(&outside, "s.txt", b"promisor-helper-secret");
        let workspace = tree.path().join("ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let repo = workspace.join("repo");
        repo_missing_blob(&repo, &outside);
        (tree, repo, workspace)
    }

    async fn reject_promisor_without_lazy_fetch(repo: &Path, root: &Path, marker: &Path) {
        let exec_path = install_marker_helpers(marker.parent().expect("marker parent"), marker);
        let repo_for_child = repo.to_path_buf();
        let root_for_child = root.to_path_buf();
        let marker_for_child = marker.to_path_buf();
        let output = tokio::task::spawn_blocking(move || {
            let inherited = std::env::var("PATH").unwrap_or_default();
            let path = format!("{}:{inherited}", exec_path.display());
            std::process::Command::new(std::env::current_exe().expect("test executable"))
                .env("ATMOS_GIT_BLOB_PROMISOR_PROBE", "1")
                .env("ATMOS_GIT_BLOB_OMIT_NO_LAZY_FETCH", "1")
                .env_remove("GIT_NO_LAZY_FETCH")
                .env("ATMOS_GIT_BLOB_PROBE_REPO", &repo_for_child)
                .env("ATMOS_GIT_BLOB_PROBE_ROOT", &root_for_child)
                .env("ATMOS_GIT_BLOB_PROBE_MARKER", &marker_for_child)
                .env("GIT_EXEC_PATH", &exec_path)
                .env("PATH", path)
                .args([
                    "--exact",
                    "--test-threads=1",
                    "api::system::files::tests::promisor_fetch_probe",
                ])
                .output()
                .expect("spawn promisor probe")
        })
        .await
        .expect("probe join");
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            output.status.success() && stdout.contains("promisor_fetch_probe"),
            "probe status {:?}\nstdout {stdout}\nstderr {stderr}",
            output.status.code()
        );
        assert!(!marker.exists(), "remote helper must not run");
    }

    #[tokio::test]
    async fn rejects_promisor_ftp_without_lazy_fetch_env() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-ftp");
        configure_promisor(&repo, "ftp://127.0.0.1:1/x");
        git(&repo, &["config", "protocol.ftp.allow", "always"]);
        let marker = tree.path().join("ftp-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_ftps_without_lazy_fetch_env() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-ftps");
        configure_promisor(&repo, "ftps://127.0.0.1:1/x");
        git(&repo, &["config", "protocol.ftps.allow", "always"]);
        let marker = tree.path().join("ftps-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_fd_without_lazy_fetch_env() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-fd");
        configure_promisor(&repo, "fd::99,99");
        git(&repo, &["config", "protocol.fd.allow", "always"]);
        let marker = tree.path().join("fd-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_foo_helper_without_lazy_fetch_env() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-foo");
        configure_promisor(&repo, "foo::bar");
        git(&repo, &["config", "protocol.foo.allow", "always"]);
        let marker = tree.path().join("foo-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_partial_clone_extension_without_promisor_flag() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-partial-only");
        git(&repo, &["config", "remote.origin.url", "foo::bar"]);
        git(&repo, &["config", "protocol.foo.allow", "always"]);
        git(&repo, &["config", "extensions.partialclone", "origin"]);
        let marker = tree.path().join("partial-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_set_only_through_include() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-include");
        let extra = tree.path().join("extra-config");
        std::fs::write(&extra, "[remote \"origin\"]\n\tpromisor = true\n").unwrap();
        git(
            &repo,
            &[
                "config",
                "include.path",
                extra.to_str().expect("include path"),
            ],
        );
        git(&repo, &["config", "remote.origin.url", "foo::bar"]);
        git(&repo, &["config", "protocol.foo.allow", "always"]);
        let marker = tree.path().join("include-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_set_only_through_include_if_on_worktree() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-includeif");
        let extra = tree.path().join("extra-if");
        std::fs::write(&extra, "[remote \"origin\"]\n\tpromisor = true\n").unwrap();
        git(
            &repo,
            &[
                "config",
                "includeIf.gitdir:**.path",
                extra.to_str().expect("includeIf path"),
            ],
        );
        git(&repo, &["config", "remote.origin.url", "foo::bar"]);
        git(&repo, &["config", "protocol.foo.allow", "always"]);
        let worktree = workspace.join("wt");
        git(
            &repo,
            &[
                "worktree",
                "add",
                "--detach",
                "--no-checkout",
                worktree.to_str().expect("worktree path"),
                "HEAD",
            ],
        );
        let marker = tree.path().join("includeif-marker");
        reject_promisor_without_lazy_fetch(&worktree, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn rejects_promisor_set_only_in_worktree_config() {
        let (tree, repo, workspace) = prepare_missing_blob_repo("git-promisor-worktree");
        git(&repo, &["config", "extensions.worktreeConfig", "true"]);
        git(
            &repo,
            &["config", "--worktree", "remote.origin.promisor", "true"],
        );
        git(&repo, &["config", "remote.origin.url", "foo::bar"]);
        git(&repo, &["config", "protocol.foo.allow", "always"]);
        let marker = tree.path().join("worktree-marker");
        reject_promisor_without_lazy_fetch(&repo, &workspace, &marker).await;
    }

    #[tokio::test]
    async fn serves_git_blob_when_promisor_remote_is_false() {
        let tree = TempTree::new("git-promisor-false");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"not-a-promisor");
        git(&repo, &["config", "remote.origin.url", "foo::bar"]);
        git(&repo, &["config", "remote.origin.promisor", "false"]);
        git(&repo, &["config", "protocol.foo.allow", "always"]);

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"not-a-promisor");
    }

    #[tokio::test]
    async fn rejects_git_blob_when_repo_config_cannot_be_read() {
        let tree = TempTree::new("git-config-bad");
        let workspace = tree.path().join("ws");
        let repo = workspace.join("repo");
        init_repo(&repo);
        commit_bytes(&repo, "hello.txt", b"still-local");
        use std::io::Write;
        let mut config = std::fs::OpenOptions::new()
            .append(true)
            .open(repo.join(".git").join("config"))
            .unwrap();
        writeln!(config, "[").unwrap();

        let (status, body) =
            git_blob_status_and_body(&repo, "HEAD", "hello.txt", &roots(&[workspace])).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_ne!(body, b"still-local");
    }
}
