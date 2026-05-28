use crate::appshot::clipboard;
use crate::appshot::encoding;
use crate::appshot::protocol;
use crate::appshot::types::{
    AppshotAcceptResponse, AppshotCopyResponse, AppshotRecordDetail, AppshotRecordListItem,
    AppshotRecordMetadata, CapturedAppshot,
};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
#[cfg(test)]
use std::sync::{Mutex, MutexGuard, OnceLock};

const APPSHOTS_DIR: &str = ".atmos/appshots";
const RECORDS_DIR_NAME: &str = "records";
const TMP_DIR_NAME: &str = "tmp";
const SNAPSHOT_FILE: &str = "snapshot.png";
const CONTEXT_FILE: &str = "context.md";
const METADATA_FILE: &str = "metadata.json";

pub fn records_root() -> PathBuf {
    appshots_root().join(RECORDS_DIR_NAME)
}

fn tmp_root() -> PathBuf {
    appshots_root().join(TMP_DIR_NAME)
}

fn appshots_root() -> PathBuf {
    #[cfg(test)]
    {
        if let Some(root) = test_data_root()
            .lock()
            .expect("test data root lock")
            .clone()
        {
            return root;
        }
    }

    home_dir().join(APPSHOTS_DIR)
}

fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(std::env::temp_dir)
}

pub fn write_record(captured: CapturedAppshot) -> Result<AppshotAcceptResponse, String> {
    let records_root = records_root();
    let tmp_root = tmp_root();
    fs::create_dir_all(&records_root)
        .map_err(|error| format!("failed to create appshot records directory: {error}"))?;
    fs::create_dir_all(&tmp_root)
        .map_err(|error| format!("failed to create appshot temp directory: {error}"))?;

    let timestamp = allocate_timestamp(&records_root);
    let tmp_dir = tmp_root.join(&timestamp);
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|error| format!("failed to clear stale appshot temp directory: {error}"))?;
    }
    fs::create_dir_all(&tmp_dir)
        .map_err(|error| format!("failed to create appshot temp record: {error}"))?;

    let snapshot_path = tmp_dir.join(SNAPSHOT_FILE);
    let context_path = tmp_dir.join(CONTEXT_FILE);
    let metadata_path = tmp_dir.join(METADATA_FILE);
    let snapshot_png = if captured.screenshot_png.is_empty() {
        placeholder_png().to_vec()
    } else {
        captured.screenshot_png
    };

    fs::write(&snapshot_path, &snapshot_png).map_err(|error| {
        cleanup_tmp_dir(
            &tmp_dir,
            format!("failed to write appshot snapshot: {error}"),
        )
    })?;
    fs::write(&context_path, &captured.context_markdown).map_err(|error| {
        cleanup_tmp_dir(
            &tmp_dir,
            format!("failed to write appshot context: {error}"),
        )
    })?;

    let final_dir = records_root.join(&timestamp);
    let metadata = AppshotRecordMetadata {
        timestamp: timestamp.clone(),
        captured_at: captured.captured_at,
        platform: captured.platform,
        app_name: captured.app_name,
        bundle_id: captured.bundle_id,
        process_id: captured.process_id,
        window_title: captured.window_title,
        window_id: captured.window_id,
        quality: captured.quality,
        record_dir: final_dir.display().to_string(),
        snapshot_path: final_dir.join(SNAPSHOT_FILE).display().to_string(),
        context_path: final_dir.join(CONTEXT_FILE).display().to_string(),
        metadata_path: final_dir.join(METADATA_FILE).display().to_string(),
        screenshot: captured.screenshot,
        warnings: captured.warnings,
        context_bytes: captured.context_markdown.len(),
    };

    let raw_metadata = serde_json::to_vec_pretty(&metadata).map_err(|error| {
        cleanup_tmp_dir(
            &tmp_dir,
            format!("failed to serialize appshot metadata: {error}"),
        )
    })?;
    fs::write(&metadata_path, raw_metadata).map_err(|error| {
        cleanup_tmp_dir(
            &tmp_dir,
            format!("failed to write appshot metadata: {error}"),
        )
    })?;

    if final_dir.exists() {
        return Err(cleanup_tmp_dir(
            &tmp_dir,
            format!("appshot record already exists: {timestamp}"),
        ));
    }
    fs::rename(&tmp_dir, &final_dir).map_err(|error| {
        cleanup_tmp_dir(
            &tmp_dir,
            format!("failed to finalize appshot record: {error}"),
        )
    })?;

    let protocol_text = protocol::format_prompt_for_record_dir(&timestamp, &final_dir)?;

    Ok(AppshotAcceptResponse {
        timestamp,
        record_dir: final_dir.display().to_string(),
        protocol_text,
        metadata,
    })
}

pub fn list_records() -> Result<Vec<AppshotRecordListItem>, String> {
    let root = records_root();
    let mut items = Vec::new();
    if !root.exists() {
        return Ok(items);
    }

    for entry in fs::read_dir(&root)
        .map_err(|error| format!("failed to read appshot records directory: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to read appshot record entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("failed to read appshot record file type: {error}"))?;
        if !file_type.is_dir() {
            continue;
        }
        let timestamp = entry.file_name().to_string_lossy().to_string();
        if !protocol::is_valid_timestamp(&timestamp) {
            continue;
        }
        items.push(AppshotRecordListItem {
            timestamp,
            record_dir: entry.path().display().to_string(),
        });
    }

    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(items)
}

pub fn read_records(timestamps: &[String]) -> Result<Vec<AppshotRecordDetail>, String> {
    timestamps
        .iter()
        .filter(|timestamp| protocol::is_valid_timestamp(timestamp))
        .map(|timestamp| read_record(timestamp))
        .collect()
}

pub fn copy_record(timestamp: &str) -> Result<AppshotCopyResponse, String> {
    ensure_timestamp(timestamp)?;
    let dir = records_root().join(timestamp);
    if !dir.is_dir() {
        return Err(format!("appshot record not found: {timestamp}"));
    }
    let protocol_text = protocol::format_prompt_for_record_dir(timestamp, &dir)?;
    copy_protocol_text(&protocol_text)?;
    Ok(AppshotCopyResponse {
        timestamp: timestamp.to_string(),
        protocol_text,
        copied: true,
    })
}

pub fn copy_protocol_text(protocol_text: &str) -> Result<(), String> {
    clipboard::copy_text(protocol_text)
}

pub fn delete_record(timestamp: &str) -> Result<(), String> {
    ensure_timestamp(timestamp)?;
    let dir = records_root().join(timestamp);
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&dir).map_err(|error| format!("failed to delete appshot record: {error}"))
}

fn read_record(timestamp: &str) -> Result<AppshotRecordDetail, String> {
    ensure_timestamp(timestamp)?;
    let dir = records_root().join(timestamp);
    let metadata_path = dir.join(METADATA_FILE);
    let context_path = dir.join(CONTEXT_FILE);
    let snapshot_path = dir.join(SNAPSHOT_FILE);

    let metadata_raw = fs::read_to_string(&metadata_path)
        .map_err(|error| format!("failed to read appshot metadata: {error}"))?;
    let mut metadata: AppshotRecordMetadata = serde_json::from_str(&metadata_raw)
        .map_err(|error| format!("failed to parse appshot metadata: {error}"))?;
    let context = fs::read_to_string(&context_path)
        .map_err(|error| format!("failed to read appshot context: {error}"))?;
    let context_preview = truncate_preview(&context, 900);
    let snapshot_url = match read_snapshot_data_url(&snapshot_path) {
        Ok(SnapshotDataUrl::Inline(url)) => Some(url),
        Ok(SnapshotDataUrl::TooLarge) => {
            append_warning(&mut metadata.warnings, encoding::OVERSIZED_SNAPSHOT_WARNING);
            None
        }
        Err(_) => None,
    };

    Ok(AppshotRecordDetail {
        timestamp: timestamp.to_string(),
        metadata,
        context_preview,
        snapshot_url,
    })
}

fn allocate_timestamp(records_root: &Path) -> String {
    static LAST_TIMESTAMP_MS: AtomicI64 = AtomicI64::new(0);

    let mut millis = Utc::now().timestamp_millis();
    loop {
        let last = LAST_TIMESTAMP_MS.load(Ordering::Relaxed);
        if millis <= last {
            millis = last + 1;
        }
        if LAST_TIMESTAMP_MS
            .compare_exchange(last, millis, Ordering::SeqCst, Ordering::Relaxed)
            .is_err()
        {
            continue;
        }

        let timestamp = millis.to_string();
        if !records_root.join(&timestamp).exists() {
            return timestamp;
        }
        millis += 1;
    }
}

fn ensure_timestamp(timestamp: &str) -> Result<(), String> {
    if protocol::is_valid_timestamp(timestamp) {
        Ok(())
    } else {
        Err("invalid appshot timestamp".to_string())
    }
}

fn truncate_preview(text: &str, limit: usize) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if out.len() + ch.len_utf8() > limit {
            out.push_str("...");
            return out;
        }
        out.push(ch);
    }
    out
}

enum SnapshotDataUrl {
    Inline(String),
    TooLarge,
}

fn read_snapshot_data_url(path: &Path) -> Result<SnapshotDataUrl, String> {
    const DATA_URL_PREFIX: &str = "data:image/png;base64,";

    let metadata =
        fs::metadata(path).map_err(|error| format!("failed to read snapshot metadata: {error}"))?;
    let encoded_len = DATA_URL_PREFIX.len() as u64 + metadata.len().div_ceil(3) * 4;
    if encoded_len > encoding::MAX_INLINE_SNAPSHOT_BYTES as u64 {
        return Ok(SnapshotDataUrl::TooLarge);
    }
    let bytes = fs::read(path).map_err(|error| format!("failed to read snapshot: {error}"))?;
    Ok(SnapshotDataUrl::Inline(format!(
        "{DATA_URL_PREFIX}{}",
        encoding::base64_encode(&bytes)
    )))
}

fn append_warning(warnings: &mut Vec<String>, warning: &str) {
    if !warnings.iter().any(|existing| existing == warning) {
        warnings.push(warning.to_string());
    }
}

fn cleanup_tmp_dir(tmp_dir: &Path, message: String) -> String {
    let _ = fs::remove_dir_all(tmp_dir);
    message
}

#[cfg(test)]
static TEST_DATA_ROOT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

#[cfg(test)]
static TEST_DATA_ROOT_SERIAL: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
fn test_data_root() -> &'static Mutex<Option<PathBuf>> {
    TEST_DATA_ROOT.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub(crate) struct TestDataRootGuard {
    _serial_guard: MutexGuard<'static, ()>,
    previous: Option<PathBuf>,
}

#[cfg(test)]
impl Drop for TestDataRootGuard {
    fn drop(&mut self) {
        *test_data_root().lock().expect("test data root lock") = self.previous.take();
    }
}

#[cfg(test)]
pub(crate) fn use_test_data_root(root: PathBuf) -> TestDataRootGuard {
    let serial_guard = TEST_DATA_ROOT_SERIAL
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("test data root serial lock");
    let mut current = test_data_root().lock().expect("test data root lock");
    let previous = current.replace(root);
    drop(current);
    TestDataRootGuard {
        _serial_guard: serial_guard,
        previous,
    }
}

fn placeholder_png() -> &'static [u8] {
    &[
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0,
        5, 254, 2, 254, 167, 69, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        delete_record, list_records, read_records, truncate_preview, use_test_data_root,
        write_record, CONTEXT_FILE, METADATA_FILE, RECORDS_DIR_NAME, SNAPSHOT_FILE,
    };
    use crate::appshot::encoding;
    use crate::appshot::types::{
        AppshotPermissionName, AppshotPermissionState, AppshotPlatform, AppshotQuality,
        AppshotScreenshotMetadata, CapturedAppshot,
    };
    use chrono::Utc;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn truncates_preview_on_char_boundary() {
        assert_eq!(truncate_preview("hello", 10), "hello");
        assert_eq!(truncate_preview("你好世界", 7), "你好...");
    }

    #[test]
    fn writes_record_three_file_layout_under_data_root() {
        let root = unique_test_root("layout");
        let _guard = use_test_data_root(root.clone());
        let response = write_record(sample_capture()).expect("record write");

        let record_dir = root.join(RECORDS_DIR_NAME).join(&response.timestamp);
        assert!(record_dir.join(SNAPSHOT_FILE).is_file());
        assert!(record_dir.join(CONTEXT_FILE).is_file());
        assert!(record_dir.join(METADATA_FILE).is_file());
        assert_eq!(
            fs::read(record_dir.join(SNAPSHOT_FILE)).unwrap(),
            b"png-bytes"
        );
        assert_eq!(
            fs::read_to_string(record_dir.join(CONTEXT_FILE)).unwrap(),
            "# Appshot Context\n\nhello"
        );

        let metadata_raw = fs::read_to_string(record_dir.join(METADATA_FILE)).unwrap();
        assert!(!metadata_raw.contains("\"permissions\""));
        let metadata: crate::appshot::types::AppshotRecordMetadata =
            serde_json::from_str(&metadata_raw).unwrap();
        assert_eq!(metadata.timestamp, response.timestamp);
        assert_eq!(metadata.record_dir, record_dir.display().to_string());
        assert_eq!(metadata.context_bytes, "# Appshot Context\n\nhello".len());
        assert!(response
            .protocol_text
            .contains(&record_dir.display().to_string()));

        let listed = list_records().expect("list records");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].timestamp, response.timestamp);

        let details = read_records(std::slice::from_ref(&response.timestamp)).expect("read record");
        assert_eq!(details.len(), 1);
        assert_eq!(details[0].timestamp, response.timestamp);
        assert!(details[0]
            .snapshot_url
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,"));

        delete_record(&response.timestamp).expect("delete record");
        assert!(!record_dir.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_record_omits_oversized_inline_snapshot() {
        let root = unique_test_root("oversized");
        let _guard = use_test_data_root(root.clone());
        let mut capture = sample_capture();
        capture.screenshot_png = vec![7; encoding::MAX_INLINE_SNAPSHOT_BYTES + 1];
        let response = write_record(capture).expect("record write");

        let details = read_records(std::slice::from_ref(&response.timestamp)).expect("read record");

        assert_eq!(details.len(), 1);
        assert!(details[0].snapshot_url.is_none());
        assert!(details[0]
            .metadata
            .warnings
            .iter()
            .any(|warning| warning == encoding::OVERSIZED_SNAPSHOT_WARNING));
        assert_eq!(
            fs::metadata(
                root.join(RECORDS_DIR_NAME)
                    .join(&response.timestamp)
                    .join(SNAPSHOT_FILE)
            )
            .unwrap()
            .len(),
            (encoding::MAX_INLINE_SNAPSHOT_BYTES + 1) as u64
        );

        delete_record(&response.timestamp).expect("delete record");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_record_omits_snapshot_when_encoded_data_url_is_too_large() {
        let root = unique_test_root("encoded-oversized");
        let _guard = use_test_data_root(root.clone());
        let mut capture = sample_capture();
        let raw_len_that_exceeds_after_encoding = encoding::MAX_INLINE_SNAPSHOT_BYTES * 3 / 4;
        capture.screenshot_png = vec![7; raw_len_that_exceeds_after_encoding];
        let response = write_record(capture).expect("record write");

        let details = read_records(std::slice::from_ref(&response.timestamp)).expect("read record");

        assert_eq!(details.len(), 1);
        assert!(details[0].snapshot_url.is_none());
        assert!(
            raw_len_that_exceeds_after_encoding <= encoding::MAX_INLINE_SNAPSHOT_BYTES,
            "test must cover raw bytes below the inline cap"
        );
        assert!(details[0]
            .metadata
            .warnings
            .iter()
            .any(|warning| warning == encoding::OVERSIZED_SNAPSHOT_WARNING));

        delete_record(&response.timestamp).expect("delete record");
        let _ = fs::remove_dir_all(root);
    }

    fn sample_capture() -> CapturedAppshot {
        CapturedAppshot {
            app_name: "Notes".to_string(),
            bundle_id: Some("com.apple.Notes".to_string()),
            process_id: Some(42),
            window_title: Some("Draft".to_string()),
            window_id: None,
            captured_at: Utc::now().to_rfc3339(),
            platform: AppshotPlatform::Macos,
            quality: AppshotQuality::ScreenshotAndAccessibility,
            screenshot_png: b"png-bytes".to_vec(),
            screenshot: AppshotScreenshotMetadata {
                available: true,
                width: Some(10),
                height: Some(10),
                media_type: "image/png".to_string(),
            },
            context_markdown: "# Appshot Context\n\nhello".to_string(),
            permissions: vec![AppshotPermissionState {
                name: AppshotPermissionName::Accessibility,
                display_name: "Accessibility".to_string(),
                granted: true,
                required_for: Vec::new(),
                recovery_action: None,
            }],
            warnings: Vec::new(),
        }
    }

    fn unique_test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "atmos-appshot-records-{name}-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }
}
