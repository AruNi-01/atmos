use std::path::Path;

use futures_util::StreamExt;
use reqwest::Client;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tracing::{debug, info, warn};

use crate::error::{LocalModelError, Result};

/// Progress event emitted during a download.
#[derive(Debug, Clone)]
pub struct DownloadProgress {
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// Total expected bytes (None if Content-Length is missing).
    pub total: Option<u64>,
}

/// Download a file from `url` to `dest_path`, streaming the body and computing
/// its SHA-256 on the fly.  After the download completes the digest is compared
/// against `expected_sha256`; a mismatch returns `ChecksumMismatch`.
///
/// `on_progress` is called with each chunk; pass a no-op closure if you don't
/// need progress events.
pub async fn download_file<F>(
    client: &Client,
    url: &str,
    dest_path: &Path,
    expected_sha256: &str,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(DownloadProgress) + Send,
{
    debug!("Downloading {} → {}", url, dest_path.display());

    // Ensure parent directory exists.
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let response = client.get(url).send().await?.error_for_status()?;
    let total = response.content_length();

    // Write to a temporary file first so we never leave a partial file at dest.
    let tmp_path = dest_path.with_extension("tmp");
    let mut file = tokio::fs::File::create(&tmp_path).await?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;

    let download_result = async {
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            hasher.update(&chunk);
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;
            on_progress(DownloadProgress { downloaded, total });
        }

        file.flush().await?;
        Ok(())
    }
    .await;

    drop(file);

    if download_result.is_err() {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return download_result;
    }

    // Verify checksum.
    let actual_hex = hex::encode(hasher.finalize());
    if !actual_hex.eq_ignore_ascii_case(expected_sha256) {
        // Remove the bad file.
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(LocalModelError::ChecksumMismatch {
            path: dest_path.display().to_string(),
            expected: expected_sha256.to_string(),
            actual: actual_hex,
        });
    }

    // Atomically rename into place.
    tokio::fs::rename(&tmp_path, dest_path).await?;

    info!(
        "Downloaded {} ({} bytes, sha256 ok)",
        dest_path.display(),
        downloaded
    );
    Ok(())
}

/// Verify the SHA-256 of an existing file on disk by streaming it through
/// the hasher in fixed-size chunks. Avoids loading the entire file into
/// memory at once — model GGUF assets are typically multi-gigabyte, so a
/// single `tokio::fs::read` would OOM constrained machines.
pub async fn verify_file(path: &Path, expected_sha256: &str) -> Result<bool> {
    use tokio::io::AsyncReadExt;

    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.into()),
    };

    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    let actual_hex = hex::encode(hasher.finalize());
    Ok(actual_hex.eq_ignore_ascii_case(expected_sha256))
}

/// Try each URL in order, returning on the first success.
pub async fn download_with_fallback<F>(
    client: &Client,
    urls: &[String],
    dest_path: &Path,
    expected_sha256: &str,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(DownloadProgress) + Send,
{
    let mut last_error = None;
    for url in urls {
        match download_file(client, url, dest_path, expected_sha256, &mut on_progress).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                warn!("Download from {} failed: {e}", url);
                last_error = Some(e);
            }
        }
    }
    Err(last_error.unwrap_or(LocalModelError::Runtime("No URLs provided".into())))
}
