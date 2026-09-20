//! Android emulator `imagefile:` camera PNG feeds. No qemu.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{EngineError, Result};

pub const CAMERA_PNG_MAX_BYTES: usize = 32 * 1024 * 1024;
pub const CAMERA_PLACEHOLDER_PNG: &[u8] = include_bytes!("assets/camera_placeholder.png");

const PNG_SIGNATURE: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CRC32_POLY: u32 = 0xEDB88320;
static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraLens {
    Front,
    Back,
}

impl CameraLens {
    fn file_suffix(self) -> &'static str {
        match self {
            Self::Front => "front",
            Self::Back => "back",
        }
    }
}

pub fn sanitize_camera_serial(serial: &str) -> String {
    serial
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn camera_feed_path(camera_dir: impl AsRef<Path>, serial: &str, lens: CameraLens) -> PathBuf {
    let name = format!(
        "{}-{}.png",
        sanitize_camera_serial(serial),
        lens.file_suffix()
    );
    camera_dir.as_ref().join(name)
}

pub fn seed_camera_feeds(camera_dir: impl AsRef<Path>, serial: &str) -> Result<()> {
    let camera_dir = camera_dir.as_ref();
    fs::create_dir_all(camera_dir).map_err(|e| {
        EngineError::FileSystem(format!(
            "failed to create camera dir {}: {e}",
            camera_dir.display()
        ))
    })?;
    for lens in [CameraLens::Front, CameraLens::Back] {
        let path = camera_feed_path(camera_dir, serial, lens);
        sweep_feed_tmps(&path);
        atomic_write_bytes(&path, CAMERA_PLACEHOLDER_PNG)?;
    }
    Ok(())
}

pub fn set_camera_png(
    camera_dir: impl AsRef<Path>,
    serial: &str,
    lens: CameraLens,
    bytes: &[u8],
) -> Result<()> {
    validate_camera_png(bytes)?;
    let path = camera_feed_path(camera_dir.as_ref(), serial, lens);
    atomic_write_bytes(&path, bytes)
}

pub fn clear_camera_png(
    camera_dir: impl AsRef<Path>,
    serial: &str,
    lens: CameraLens,
) -> Result<()> {
    let path = camera_feed_path(camera_dir.as_ref(), serial, lens);
    atomic_write_bytes(&path, CAMERA_PLACEHOLDER_PNG)
}

/// Both `hw.camera.front=imagefile:<frontPath>` and `hw.camera.back=imagefile:<backPath>`
/// with exact path match, and both feed files present.
pub fn camera_wiring_matches(ini: &str, front_path: &Path, back_path: &Path) -> bool {
    ini_imagefile_path(ini, "hw.camera.front").is_some_and(|p| path_eq(&p, front_path))
        && ini_imagefile_path(ini, "hw.camera.back").is_some_and(|p| path_eq(&p, back_path))
        && front_path.is_file()
        && back_path.is_file()
}

fn path_eq(ini_path: &str, path: &Path) -> bool {
    path.to_str() == Some(ini_path)
}

fn ini_imagefile_path(ini: &str, key: &str) -> Option<String> {
    for line in ini.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix(key) else {
            continue;
        };
        let Some(value) = rest.trim_start().strip_prefix('=') else {
            continue;
        };
        let value = value.trim();
        let path = value.strip_prefix("imagefile:")?;
        return Some(path.to_string());
    }
    None
}

pub fn validate_camera_png(bytes: &[u8]) -> Result<()> {
    if bytes.len() > CAMERA_PNG_MAX_BYTES {
        return Err(EngineError::Processing("camera PNG exceeds 32 MiB".into()));
    }
    if bytes.len() < PNG_SIGNATURE.len() + 12 {
        return Err(EngineError::Processing("camera PNG is truncated".into()));
    }
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err(EngineError::Processing(
            "camera image is not a PNG (missing signature)".into(),
        ));
    }

    let mut offset = PNG_SIGNATURE.len();
    let mut first = true;
    let mut saw_idat = false;
    let mut saw_iend = false;

    while offset < bytes.len() {
        if saw_iend {
            return Err(EngineError::Processing(
                "camera PNG has data after IEND".into(),
            ));
        }
        let Some(len_bytes) = bytes.get(offset..offset + 4) else {
            return Err(EngineError::Processing("camera PNG is truncated".into()));
        };
        let length = u32::from_be_bytes(len_bytes.try_into().unwrap()) as usize;
        let Some(type_bytes) = bytes.get(offset + 4..offset + 8) else {
            return Err(EngineError::Processing("camera PNG is truncated".into()));
        };
        let Some(data_end) = (offset + 8).checked_add(length) else {
            return Err(EngineError::Processing("camera PNG is truncated".into()));
        };
        let Some(chunk_end) = data_end.checked_add(4) else {
            return Err(EngineError::Processing("camera PNG is truncated".into()));
        };
        if chunk_end > bytes.len() {
            return Err(EngineError::Processing("camera PNG is truncated".into()));
        }
        let data = &bytes[offset + 8..data_end];
        let crc_got = u32::from_be_bytes(bytes[data_end..chunk_end].try_into().unwrap());
        let crc_expect = png_crc32(&bytes[offset + 4..data_end]);
        if crc_got != crc_expect {
            return Err(EngineError::Processing("camera PNG has a bad CRC".into()));
        }

        if first {
            if type_bytes != b"IHDR" {
                return Err(EngineError::Processing(
                    "camera PNG first chunk is not IHDR".into(),
                ));
            }
            if data.len() < 8 {
                return Err(EngineError::Processing("camera PNG is truncated".into()));
            }
            let width = u32::from_be_bytes(data[0..4].try_into().unwrap());
            let height = u32::from_be_bytes(data[4..8].try_into().unwrap());
            if width < 1 || height < 1 {
                return Err(EngineError::Processing(
                    "camera PNG IHDR width/height must be at least 1".into(),
                ));
            }
            first = false;
        }
        if type_bytes == b"IDAT" {
            saw_idat = true;
        }
        if type_bytes == b"IEND" {
            saw_iend = true;
        }
        offset = chunk_end;
    }

    if first {
        return Err(EngineError::Processing("camera PNG is truncated".into()));
    }
    if !saw_idat {
        return Err(EngineError::Processing("camera PNG is missing IDAT".into()));
    }
    if !saw_iend {
        return Err(EngineError::Processing("camera PNG is missing IEND".into()));
    }
    Ok(())
}

fn png_crc32(data: &[u8]) -> u32 {
    let table = crc32_table();
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        let idx = ((crc ^ b as u32) & 0xFF) as usize;
        crc = table[idx] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

fn crc32_table() -> &'static [u32; 256] {
    static TABLE: OnceLock<[u32; 256]> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut table = [0u32; 256];
        for (n, slot) in table.iter_mut().enumerate() {
            let mut c = n as u32;
            for _ in 0..8 {
                if c & 1 != 0 {
                    c = CRC32_POLY ^ (c >> 1);
                } else {
                    c >>= 1;
                }
            }
            *slot = c;
        }
        table
    })
}

fn sweep_feed_tmps(feed_path: &Path) {
    let Some(dir) = feed_path.parent() else {
        return;
    };
    let Some(name) = feed_path.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    let prefix = format!("{name}.");
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(s) = file_name.to_str() else {
            continue;
        };
        if s.starts_with(&prefix) && s.ends_with(".tmp") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            EngineError::FileSystem(format!("failed to create {}: {e}", parent.display()))
        })?;
    }
    let tmp = unique_tmp_path(path);
    if let Err(e) = fs::write(&tmp, bytes) {
        let _ = fs::remove_file(&tmp);
        return Err(EngineError::FileSystem(format!(
            "failed to write camera tmp {}: {e}",
            tmp.display()
        )));
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(EngineError::FileSystem(format!(
            "failed to replace {}: {e}",
            path.display()
        )));
    }
    Ok(())
}

fn unique_tmp_path(path: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tid = format!("{:?}", std::thread::current().id());
    let tid: String = tid.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let mut tmp = path.as_os_str().to_os_string();
    tmp.push(format!(".{nanos}_{}_{tid}_{n}.tmp", std::process::id()));
    PathBuf::from(tmp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn placeholder_is_valid_png() {
        validate_camera_png(CAMERA_PLACEHOLDER_PNG).unwrap();
    }

    #[test]
    fn rejects_jpeg_truncated_and_oversize_png() {
        let jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF";
        let jpeg_err = validate_camera_png(jpeg).unwrap_err().to_string();
        assert!(jpeg_err.to_ascii_lowercase().contains("png"), "{jpeg_err}");

        let truncated = &CAMERA_PLACEHOLDER_PNG[..20];
        let trunc_err = validate_camera_png(truncated).unwrap_err().to_string();
        assert!(
            trunc_err.to_ascii_lowercase().contains("truncat"),
            "{trunc_err}"
        );

        let mut huge = vec![0u8; CAMERA_PNG_MAX_BYTES + 1];
        huge[..PNG_SIGNATURE.len()].copy_from_slice(PNG_SIGNATURE);
        let huge_err = validate_camera_png(&huge).unwrap_err().to_string();
        assert!(huge_err.contains("32"), "{huge_err}");

        let mut bad_crc = CAMERA_PLACEHOLDER_PNG.to_vec();
        bad_crc[40] ^= 0xFF;
        let crc_err = validate_camera_png(&bad_crc).unwrap_err().to_string();
        assert!(crc_err.to_ascii_lowercase().contains("crc"), "{crc_err}");
    }

    #[test]
    fn seed_atomic_write_and_sweep() {
        let dir = tempfile::tempdir().unwrap();
        let serial = "emulator:5554";
        let front = camera_feed_path(dir.path(), serial, CameraLens::Front);
        assert_eq!(
            front.file_name().unwrap().to_str().unwrap(),
            "emulator_5554-front.png"
        );
        fs::write(
            dir.path().join("emulator_5554-front.png.leftover.tmp"),
            b"stale",
        )
        .unwrap();
        seed_camera_feeds(dir.path(), serial).unwrap();
        assert_eq!(fs::read(&front).unwrap(), CAMERA_PLACEHOLDER_PNG);
        let back = camera_feed_path(dir.path(), serial, CameraLens::Back);
        assert_eq!(fs::read(&back).unwrap(), CAMERA_PLACEHOLDER_PNG);
        assert!(!dir
            .path()
            .join("emulator_5554-front.png.leftover.tmp")
            .exists());
        let leftover: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftover.is_empty(), "{leftover:?}");

        set_camera_png(
            dir.path(),
            serial,
            CameraLens::Front,
            CAMERA_PLACEHOLDER_PNG,
        )
        .unwrap();
        assert_eq!(fs::read(&front).unwrap(), CAMERA_PLACEHOLDER_PNG);
        clear_camera_png(dir.path(), serial, CameraLens::Back).unwrap();
        assert_eq!(fs::read(&back).unwrap(), CAMERA_PLACEHOLDER_PNG);
    }

    #[test]
    fn wiring_true_requires_both_imagefile_paths_and_files() {
        let dir = tempfile::tempdir().unwrap();
        let serial = "emulator-5554";
        seed_camera_feeds(dir.path(), serial).unwrap();
        let front = camera_feed_path(dir.path(), serial, CameraLens::Front);
        let back = camera_feed_path(dir.path(), serial, CameraLens::Back);
        let ini = format!(
            "hw.ramSize=2048\n\
             hw.camera.front=imagefile:{}\n\
             hw.camera.back=imagefile:{}\n",
            front.to_str().unwrap(),
            back.to_str().unwrap()
        );
        assert!(camera_wiring_matches(&ini, &front, &back));

        let mismatch = ini.replace("front.png", "other.png");
        assert!(!camera_wiring_matches(&mismatch, &front, &back));

        let missing_back = format!("hw.camera.front=imagefile:{}\n", front.to_str().unwrap());
        assert!(!camera_wiring_matches(&missing_back, &front, &back));

        fs::remove_file(&back).unwrap();
        assert!(!camera_wiring_matches(&ini, &front, &back));
    }
}
