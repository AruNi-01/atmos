use axum::{
    body::Body,
    extract::Query,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tokio_util::io::ReaderStream;
use tracing::warn;

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

/// GET /api/system/file?path=<absolute_path>
pub async fn serve_file(Query(query): Query<ServeFileQuery>) -> Result<Response, Response> {
    let file_path = std::path::Path::new(&query.path);

    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "File not found").into_response());
    }

    if !file_path.is_file() {
        return Err((StatusCode::BAD_REQUEST, "Not a file").into_response());
    }

    let ext = path_ext(&query.path);

    let metadata = tokio::fs::metadata(file_path).await.map_err(|e| {
        warn!("Failed to read file metadata: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
    })?;

    let file = tokio::fs::File::open(file_path).await.map_err(|e| {
        warn!("Failed to open file: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response()
    })?;

    let body = Body::from_stream(ReaderStream::new(file));

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type_for_ext(&ext))
        .header(header::CONTENT_LENGTH, metadata.len())
        .body(body)
        .unwrap()
        .into_response())
}

/// GET /api/system/git-blob?repo=&rev=&path=
///
/// Streams a historical or index blob via `git show`. Used for binary/image
/// previews in the diff UI without embedding bytes in the WebSocket payload.
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
