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

    for root in &allow.directory_roots {
        let Ok(root) = std::fs::canonicalize(root) else {
            continue;
        };
        // A filesystem root would make every canonical path allowed.
        if root.parent().is_none() {
            continue;
        }
        if canonical.starts_with(&root) {
            // Sinks stay in this branch so CodeQL's Path::starts_with barrier applies.
            respond_with_checked_path!(&canonical);
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
/// Streams a historical or index blob via `git show`. Used for binary/image
/// previews in the diff UI without embedding bytes in the WebSocket payload.
#[allow(clippy::result_large_err)]
pub async fn serve_git_blob(Query(query): Query<ServeGitBlobQuery>) -> Result<Response, Response> {
    let repo = std::path::PathBuf::from(query.repo.trim());
    if !repo.is_absolute() || !repo.is_dir() {
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

    let repo_for_git = repo.clone();
    let show_spec_for_git = show_spec.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        core_engine::show_git_blob_bytes(&repo_for_git, &show_spec_for_git)
    })
    .await
    .map_err(|e| {
        warn!("git-blob join error: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read blob").into_response()
    })?
    .map_err(|e| {
        warn!("git-blob show failed: {e}");
        (StatusCode::NOT_FOUND, "Blob not found").into_response()
    })?;

    if bytes.len() as u64 > GIT_BLOB_MAX_BYTES {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "Blob too large").into_response());
    }

    let ext = path_ext(&display_path);
    let len = bytes.len();
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type_for_ext(&ext))
        .header(header::CONTENT_LENGTH, len)
        .header(header::CACHE_CONTROL, "private, max-age=60")
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
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
}
