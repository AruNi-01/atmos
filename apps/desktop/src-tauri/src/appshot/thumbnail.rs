use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const THUMBNAIL_MAX_EDGE: &str = "480";
const SNAPSHOT_MAX_EDGE: &str = "1600";

pub fn thumbnail_png_for_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    resize_png_for_bytes(bytes, THUMBNAIL_MAX_EDGE, "thumbnail")
}

#[cfg(target_os = "macos")]
pub fn thumbnail_png_for_path(path: &Path) -> Result<Vec<u8>, String> {
    resize_png_for_path(path, THUMBNAIL_MAX_EDGE, "thumbnail")
}

pub fn snapshot_png_for_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    resize_png_for_bytes(bytes, SNAPSHOT_MAX_EDGE, "snapshot")
}

pub fn snapshot_png_for_path(path: &Path) -> Result<Vec<u8>, String> {
    resize_png_for_path(path, SNAPSHOT_MAX_EDGE, "snapshot")
}

fn resize_png_for_bytes(bytes: &[u8], max_edge: &str, label: &str) -> Result<Vec<u8>, String> {
    let input_path = temp_png_path("input");
    fs::write(&input_path, bytes)
        .map_err(|error| format!("failed to stage appshot {label} input: {error}"))?;
    let result = resize_png_for_path(&input_path, max_edge, label);
    let _ = fs::remove_file(input_path);
    result
}

#[cfg(target_os = "macos")]
fn resize_png_for_path(path: &Path, max_edge: &str, label: &str) -> Result<Vec<u8>, String> {
    let output_path = temp_png_path("thumb");
    let output = Command::new("sips")
        .arg("-Z")
        .arg(max_edge)
        .arg(path)
        .arg("--out")
        .arg(&output_path)
        .output()
        .map_err(|error| format!("failed to start appshot {label} generator: {error}"))?;

    if !output.status.success() {
        let _ = fs::remove_file(output_path);
        return Err(format!(
            "appshot {label} generator exited with status {}",
            output.status
        ));
    }

    let bytes = fs::read(&output_path)
        .map_err(|error| format!("failed to read appshot {label}: {error}"))?;
    let _ = fs::remove_file(output_path);
    if bytes.is_empty() {
        return Err(format!("appshot {label} generator produced an empty file"));
    }
    Ok(bytes)
}

#[cfg(not(target_os = "macos"))]
fn resize_png_for_path(_path: &Path, _max_edge: &str, label: &str) -> Result<Vec<u8>, String> {
    Err(format!(
        "appshot {label} generation is unavailable on this platform"
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn thumbnail_png_for_path(_path: &Path) -> Result<Vec<u8>, String> {
    Err("appshot thumbnail generation is unavailable on this platform".to_string())
}

fn temp_png_path(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "atmos-appshot-{label}-{}-{}.png",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ))
}
