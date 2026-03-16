use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::models::TokenUsageQuery;

const CURSOR_CSV_ENDPOINT: &str =
    "https://cursor.com/api/dashboard/export-usage-events-csv?strategy=tokens";
const SYNC_COOLDOWN_SECS: u64 = 15 * 60;
const CURSOR_SYNC_OVERLAP_MS: u64 = 60 * 60 * 1000; // 1 hour
const INITIAL_SYNC_START_MS: u64 = 1_640_995_200_000; // 2022-01-01T00:00:00Z
const PROVIDER_METADATA_FILE_NAME: &str = "provider_metadata.json";

#[derive(Debug)]
pub(crate) struct CursorSyncOutcome {
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CursorProviderMetadata {
    #[serde(default)]
    last_sync_time: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ProviderMetadataFile {
    #[serde(default)]
    cursor: CursorProviderMetadata,
}

pub(crate) async fn maybe_sync_cursor_csv(query: &TokenUsageQuery, force_refresh: bool) -> CursorSyncOutcome {
    if !query_includes_cursor(query) {
        return CursorSyncOutcome {
            warnings: vec![],
        };
    }

    let cache_path = cursor_cache_path();
    let metadata_path = provider_metadata_path();
    if !force_refresh && is_within_cooldown(&cache_path) {
        return CursorSyncOutcome {
            warnings: vec![],
        };
    }

    let session_source = match ai_usage::load_cursor_session_token() {
        Ok(Some(source)) => source,
        Ok(None) => {
            return CursorSyncOutcome {
                warnings: vec![
                    "Cursor session token not found. Set ATMOS_CURSOR_SESSION_TOKEN or CURSOR_SESSION_TOKEN, or place your WorkosCursorSessionToken in ~/.atmos/ai-usage/cursor.cookie".to_string(),
                ],
            };
        }
        Err(error) => {
            return CursorSyncOutcome {
                warnings: vec![format!("Cursor session token lookup failed: {error}")],
            };
        }
    };

    let metadata = load_provider_metadata(&metadata_path);
    let start_ms = metadata
        .cursor
        .last_sync_time
        .map(|value| value.saturating_sub(CURSOR_SYNC_OVERLAP_MS))
        .unwrap_or(INITIAL_SYNC_START_MS);
    let end_ms = unix_now_millis();

    match fetch_and_cache_csv(
        &session_source.cookie_header,
        &cache_path,
        &metadata_path,
        start_ms,
        end_ms,
    )
    .await
    {
        Ok(updated) => {
            let warnings = vec![];
            if updated {
                tracing::info!(
                    source = %session_source.source_label,
                    start_ms,
                    end_ms,
                    "Cursor usage CSV synced"
                );
            }
            CursorSyncOutcome { warnings }
        }
        Err(error) => CursorSyncOutcome {
            warnings: vec![format!("Cursor CSV sync failed: {error}")],
        },
    }
}

fn query_includes_cursor(query: &TokenUsageQuery) -> bool {
    match &query.clients {
        None => true,
        Some(clients) => clients.iter().any(|c| c == "cursor"),
    }
}

fn cursor_cache_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config/tokscale/cursor-cache/usage.csv")
}

fn provider_metadata_path() -> PathBuf {
    if let Ok(data_dir) = std::env::var("ATMOS_DATA_DIR") {
        let trimmed = data_dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed)
                .join("token-usage")
                .join(PROVIDER_METADATA_FILE_NAME);
        }
    }

    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos/token-usage")
        .join(PROVIDER_METADATA_FILE_NAME)
}

fn is_within_cooldown(path: &PathBuf) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    let Ok(elapsed) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    elapsed.as_secs() < SYNC_COOLDOWN_SECS
}

async fn fetch_and_cache_csv(
    cookie_header: &str,
    cache_path: &PathBuf,
    metadata_path: &PathBuf,
    start_ms: u64,
    end_ms: u64,
) -> Result<bool, String> {
    if end_ms <= start_ms {
        return Ok(false);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(CURSOR_CSV_ENDPOINT)
        .query(&[
            ("startDate", start_ms.to_string()),
            ("endDate", end_ms.to_string()),
        ])
        .header("Cookie", cookie_header)
        .header("Accept", "*/*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Referer", "https://www.cursor.com/settings")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("Cursor session token expired or invalid. Please update your token.".to_string());
    }
    if !status.is_success() {
        return Err(format!("Cursor CSV API returned {status}"));
    }

    let fetched_csv = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    if !fetched_csv.starts_with("Date,") {
        return Err("Invalid response from Cursor API — expected CSV format".to_string());
    }

    let updated = merge_csv_to_cache(&fetched_csv, cache_path)?;
    persist_provider_metadata(
        metadata_path,
        &ProviderMetadataFile {
            cursor: CursorProviderMetadata {
                last_sync_time: Some(end_ms),
            },
        },
    )?;

    Ok(updated)
}

fn merge_csv_to_cache(fetched_csv: &str, cache_path: &PathBuf) -> Result<bool, String> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache directory: {e}"))?;
    }

    let existing_csv = fs::read_to_string(cache_path).ok();

    let result = match existing_csv {
        Some(existing) if existing.starts_with("Date,") => {
            merge_incremental(&existing, fetched_csv, cache_path)?
        }
        _ => {
            write_atomic(cache_path, fetched_csv)?;
            true
        }
    };

    Ok(result)
}

fn merge_incremental(
    existing_csv: &str,
    fetched_csv: &str,
    cache_path: &PathBuf,
) -> Result<bool, String> {
    let existing_header = existing_csv.lines().next().unwrap_or("");
    let fetched_header = fetched_csv.lines().next().unwrap_or("");

    if existing_header != fetched_header {
        write_atomic(cache_path, fetched_csv)?;
        return Ok(true);
    }

    let existing_rows: HashSet<&str> = existing_csv
        .lines()
        .skip(1)
        .filter(|l| !l.trim().is_empty())
        .collect();

    let new_rows: Vec<&str> = fetched_csv
        .lines()
        .skip(1)
        .filter(|l| !l.trim().is_empty())
        .filter(|l| !existing_rows.contains(l))
        .collect();

    if new_rows.is_empty() {
        return Ok(false);
    }

    let mut content = existing_csv.trim_end().to_string();
    for row in &new_rows {
        content.push('\n');
        content.push_str(row);
    }
    content.push('\n');

    write_atomic(cache_path, &content)?;
    Ok(true)
}

fn load_provider_metadata(path: &PathBuf) -> ProviderMetadataFile {
    let Ok(contents) = fs::read_to_string(path) else {
        return ProviderMetadataFile::default();
    };

    serde_json::from_str::<ProviderMetadataFile>(&contents).unwrap_or_default()
}

fn persist_provider_metadata(path: &PathBuf, metadata: &ProviderMetadataFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create metadata directory: {e}"))?;
    }

    let contents = serde_json::to_string(metadata)
        .map_err(|e| format!("Failed to serialize provider metadata: {e}"))?;
    write_atomic(path, &contents)
}

fn unix_now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn write_atomic(path: &PathBuf, content: &str) -> Result<(), String> {
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    let tmp_extension = if extension.is_empty() {
        "tmp".to_string()
    } else {
        format!("{extension}.tmp")
    };
    let tmp_path = path.with_extension(tmp_extension);
    fs::write(&tmp_path, content).map_err(|e| format!("Failed to write temp file: {e}"))?;
    fs::rename(&tmp_path, path).map_err(|e| format!("Failed to rename temp file: {e}"))?;
    Ok(())
}
