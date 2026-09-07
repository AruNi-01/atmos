use std::fs;
use std::path::Path;

use crate::error::{EngineError, Result};

const PNG_SIGNATURE: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_TYPE: &[u8] = b"IHDR";
const IHDR_DATA_OFFSET: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenshotSize {
    pub width: u32,
    pub height: u32,
}

/// Write PNG bytes to `dest` and return width/height from the IHDR chunk.
pub fn write_png(dest: impl AsRef<Path>, bytes: &[u8]) -> Result<ScreenshotSize> {
    let size = png_dimensions(bytes)?;
    let dest = dest.as_ref();
    fs::write(dest, bytes).map_err(|e| {
        EngineError::Processing(format!(
            "failed to write screenshot {}: {e}",
            dest.display()
        ))
    })?;
    Ok(size)
}

/// Read PNG width/height from IHDR (bytes 16–23, big-endian) after the
/// 8-byte signature and 8-byte chunk header.
pub fn png_dimensions(bytes: &[u8]) -> Result<ScreenshotSize> {
    if bytes.len() < IHDR_DATA_OFFSET + 8 {
        return Err(EngineError::Processing(
            "PNG is too short to contain an IHDR chunk".into(),
        ));
    }
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err(EngineError::Processing(
            "screenshot is not a PNG (missing signature)".into(),
        ));
    }
    if &bytes[12..16] != IHDR_TYPE {
        return Err(EngineError::Processing(
            "PNG first chunk is not IHDR".into(),
        ));
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().expect("width slice"));
    let height = u32::from_be_bytes(bytes[20..24].try_into().expect("height slice"));
    if width == 0 || height == 0 {
        return Err(EngineError::Processing(
            "PNG IHDR width/height must be non-zero".into(),
        ));
    }
    Ok(ScreenshotSize { width, height })
}

#[cfg(test)]
pub(crate) const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_ihdr_width_and_height() {
        let size = png_dimensions(TINY_PNG).unwrap();
        assert_eq!(
            size,
            ScreenshotSize {
                width: 1,
                height: 1
            }
        );
    }

    #[test]
    fn writes_png_bytes_and_returns_size() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("shot.png");
        let size = write_png(&dest, TINY_PNG).unwrap();
        assert_eq!(size.width, 1);
        assert_eq!(size.height, 1);
        assert_eq!(fs::read(&dest).unwrap(), TINY_PNG);
    }

    #[test]
    fn reads_custom_ihdr_dimensions() {
        let mut bytes = TINY_PNG.to_vec();
        bytes[16..20].copy_from_slice(&2u32.to_be_bytes());
        bytes[20..24].copy_from_slice(&3u32.to_be_bytes());
        let size = png_dimensions(&bytes).unwrap();
        assert_eq!(
            size,
            ScreenshotSize {
                width: 2,
                height: 3
            }
        );
    }

    #[test]
    fn rejects_non_png() {
        let err = png_dimensions(b"not a png").unwrap_err().to_string();
        assert!(err.contains("PNG") || err.contains("png"));
    }
}
