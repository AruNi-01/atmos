use std::path::Path;
use std::process::Command;

use serde_json::json;

use crate::error::{EngineError, Result};

use super::coords::validate_point;

/// `{bin} tap {x} {y} -d {udid}`
pub fn serve_sim_tap(bin: impl AsRef<Path>, udid: &str, x: f64, y: f64) -> Result<()> {
    let (x, y) = validate_point(x, y)?;
    run_serve_sim(
        bin.as_ref(),
        &[
            "tap".into(),
            format_coord(x),
            format_coord(y),
            "-d".into(),
            udid.into(),
        ],
    )
}

/// Spawn `{bin} gesture '<json>' -d {udid}` three times: begin, move, end.
///
/// JSON is the same 0..1 space as `tap`:
/// `{"type":"begin","x":x1,"y":y1}` then `move` at (x2,y2) then `end` at (x2,y2).
pub fn serve_sim_swipe(
    bin: impl AsRef<Path>,
    udid: &str,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
) -> Result<()> {
    let (x1, y1) = validate_point(x1, y1)?;
    let (x2, y2) = validate_point(x2, y2)?;
    let bin = bin.as_ref();
    for payload in [
        json!({"type": "begin", "x": x1, "y": y1}),
        json!({"type": "move", "x": x2, "y": y2}),
        json!({"type": "end", "x": x2, "y": y2}),
    ] {
        run_serve_sim(
            bin,
            &[
                "gesture".into(),
                payload.to_string(),
                "-d".into(),
                udid.into(),
            ],
        )?;
    }
    Ok(())
}

/// `{bin} type -d {udid} -- {text}`. Rejects non-ASCII before spawn.
pub fn serve_sim_type(bin: impl AsRef<Path>, udid: &str, text: &str) -> Result<()> {
    if !text.is_ascii() {
        return Err(EngineError::Processing(
            "iOS type supports US-keyboard ASCII only; non-ASCII text is not sent".into(),
        ));
    }
    run_serve_sim(
        bin.as_ref(),
        &[
            "type".into(),
            "-d".into(),
            udid.into(),
            "--".into(),
            text.into(),
        ],
    )
}

/// `{bin} button home -d {udid}` (`button` is the hardware name, v1: `home`).
pub fn serve_sim_button(bin: impl AsRef<Path>, udid: &str, button: &str) -> Result<()> {
    run_serve_sim(
        bin.as_ref(),
        &["button".into(), button.into(), "-d".into(), udid.into()],
    )
}

fn format_coord(value: f64) -> String {
    format!("{value}")
}

fn run_serve_sim(bin: &Path, args: &[String]) -> Result<()> {
    let output = Command::new(bin).args(args).output().map_err(|e| {
        EngineError::Processing(format!("failed to spawn serve-sim {}: {e}", bin.display()))
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(EngineError::Processing(format!(
            "serve-sim failed ({}): {stderr}",
            output.status
        )));
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};

    fn sh_single_quote(path: &Path) -> String {
        format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
    }

    fn fake_bin(dir: &Path, log: &Path) -> PathBuf {
        let bin = dir.join("serve-sim");
        fs::write(
            &bin,
            format!(
                "#!/bin/sh\n{{\n  printf '%s' \"$1\"\n  shift\n  for a in \"$@\"; do printf '\\t%s' \"$a\"; done\n  printf '\\n'\n}} >> {}\n",
                sh_single_quote(log)
            ),
        )
        .unwrap();
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    fn recorded_lines(log: &std::path::Path) -> Vec<Vec<String>> {
        fs::read_to_string(log)
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.split('\t').map(ToOwned::to_owned).collect())
            .collect()
    }

    #[test]
    fn tap_argv_is_tap_xy_device() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        serve_sim_tap(&bin, "UDID-IOS", 0.2, 0.8).unwrap();
        let lines = recorded_lines(&log);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], ["tap", "0.2", "0.8", "-d", "UDID-IOS"]);
    }

    #[test]
    fn swipe_spawns_begin_move_end_gesture_json() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        serve_sim_swipe(&bin, "UDID-IOS", 0.1, 0.9, 0.8, 0.2).unwrap();
        let lines = recorded_lines(&log);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0][0], "gesture");
        assert_eq!(lines[1][0], "gesture");
        assert_eq!(lines[2][0], "gesture");
        let begin: serde_json::Value = serde_json::from_str(&lines[0][1]).unwrap();
        let mv: serde_json::Value = serde_json::from_str(&lines[1][1]).unwrap();
        let end: serde_json::Value = serde_json::from_str(&lines[2][1]).unwrap();
        assert_eq!(begin["type"], "begin");
        assert_eq!(begin["x"], 0.1);
        assert_eq!(begin["y"], 0.9);
        assert_eq!(mv["type"], "move");
        assert_eq!(mv["x"], 0.8);
        assert_eq!(end["type"], "end");
        assert_eq!(end["x"], 0.8);
        assert_eq!(end["y"], 0.2);
        assert_eq!(lines[0][2], "-d");
        assert_eq!(lines[0][3], "UDID-IOS");
    }

    #[test]
    fn type_ascii_uses_double_dash() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        serve_sim_type(&bin, "UDID-IOS", "hello").unwrap();
        assert_eq!(
            recorded_lines(&log)[0],
            ["type", "-d", "UDID-IOS", "--", "hello"]
        );
    }

    #[test]
    fn type_rejects_non_ascii_before_spawn() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        let err = serve_sim_type(&bin, "UDID-IOS", "你好")
            .unwrap_err()
            .to_string();
        assert!(err.contains("ASCII"), "{err}");
        assert!(!log.exists() || fs::read_to_string(&log).unwrap().is_empty());
    }

    #[test]
    fn button_home_argv() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        serve_sim_button(&bin, "UDID-IOS", "home").unwrap();
        assert_eq!(
            recorded_lines(&log)[0],
            ["button", "home", "-d", "UDID-IOS"]
        );
    }

    #[test]
    fn tap_rejects_coords_without_spawn() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("argv.log");
        let bin = fake_bin(dir.path(), &log);
        let err = serve_sim_tap(&bin, "UDID-IOS", 1.5, 0.5)
            .unwrap_err()
            .to_string();
        assert!(err.contains("invalid coords"), "{err}");
        assert!(!log.exists() || fs::read_to_string(&log).unwrap().is_empty());
    }
}
