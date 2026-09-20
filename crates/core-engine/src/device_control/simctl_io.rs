use std::fs;
use std::path::Path;
use std::process::Command;

use crate::error::{EngineError, Result};

use super::screenshot::{png_dimensions, ScreenshotSize};

/// `xcrun simctl io <udid> screenshot <dest>`, then read PNG IHDR size.
pub fn simctl_screenshot(udid: &str, dest: impl AsRef<Path>) -> Result<ScreenshotSize> {
    run_simctl_screenshot(Path::new("xcrun"), udid, dest.as_ref())
}

fn run_simctl_screenshot(xcrun: &Path, udid: &str, dest: &Path) -> Result<ScreenshotSize> {
    let output = Command::new(xcrun)
        .args(["simctl", "io", udid, "screenshot"])
        .arg(dest)
        .output()
        .map_err(|e| EngineError::Processing(format!("failed to spawn xcrun simctl: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(EngineError::Processing(format!(
            "simctl screenshot failed ({}): {stderr}",
            output.status
        )));
    }
    let bytes = fs::read(dest).map_err(|e| {
        EngineError::Processing(format!(
            "simctl screenshot did not write {}: {e}",
            dest.display()
        ))
    })?;
    png_dimensions(&bytes)
}

#[cfg(all(test, unix))]
mod tests {
    use super::super::screenshot::TINY_PNG;
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn sh_single_quote(path: &Path) -> String {
        format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
    }

    fn fake_xcrun(dir: &Path, log: &Path) -> std::path::PathBuf {
        let bin = dir.join("xcrun");
        let png = dir.join("tiny.png");
        fs::write(&png, TINY_PNG).unwrap();
        fs::write(
            &bin,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> {log}\ncp {png} \"$5\"\n",
                log = sh_single_quote(log),
                png = sh_single_quote(&png),
            ),
        )
        .unwrap();
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    #[test]
    fn simctl_argv_and_png_size() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let dest = dir.path().join("out.png");
        let bin = fake_xcrun(dir.path(), &log);

        let size = run_simctl_screenshot(&bin, "UDID-1", &dest).unwrap();
        assert_eq!(size.width, 1);
        assert_eq!(size.height, 1);
        assert_eq!(fs::read(&dest).unwrap(), TINY_PNG);

        let argv = fs::read_to_string(&log).unwrap();
        assert!(argv.contains("simctl io UDID-1 screenshot"), "{argv}");
    }
}
