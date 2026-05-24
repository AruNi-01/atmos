use axum::{
    body::Body,
    extract::Query,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tokio_util::io::ReaderStream;
use tracing::warn;

#[derive(Deserialize)]
pub struct ServeFileQuery {
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

/// GET /api/system/file?path=<absolute_path>
pub async fn serve_file(Query(query): Query<ServeFileQuery>) -> Result<Response, Response> {
    let file_path = std::path::Path::new(&query.path);

    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "File not found").into_response());
    }

    if !file_path.is_file() {
        return Err((StatusCode::BAD_REQUEST, "Not a file").into_response());
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

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
