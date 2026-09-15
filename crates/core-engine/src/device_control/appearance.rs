//! iOS simctl / Android uimode appearance. No workspace or claim concept.

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{EngineError, Result};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Appearance {
    Light,
    Dark,
}

impl Appearance {
    pub fn as_ios(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    /// `cmd uimode night` token: light → `no`, dark → `yes`.
    pub fn as_android_night(self) -> &'static str {
        match self {
            Self::Light => "no",
            Self::Dark => "yes",
        }
    }
}

/// Args after `xcrun`: `simctl ui <udid> appearance`.
pub fn ios_appearance_get_args(udid: &str) -> Vec<String> {
    vec![
        "simctl".into(),
        "ui".into(),
        udid.into(),
        "appearance".into(),
    ]
}

/// Args after `xcrun`: `simctl ui <udid> appearance light|dark`.
pub fn ios_appearance_set_args(udid: &str, appearance: Appearance) -> Vec<String> {
    vec![
        "simctl".into(),
        "ui".into(),
        udid.into(),
        "appearance".into(),
        appearance.as_ios().into(),
    ]
}

/// Args after `adb`: `-s <serial> shell cmd uimode night`.
pub fn android_appearance_get_args(serial: &str) -> Vec<String> {
    vec![
        "-s".into(),
        serial.into(),
        "shell".into(),
        "cmd".into(),
        "uimode".into(),
        "night".into(),
    ]
}

/// Args after `adb`: `-s <serial> shell cmd uimode night no|yes`.
pub fn android_appearance_set_args(serial: &str, appearance: Appearance) -> Vec<String> {
    vec![
        "-s".into(),
        serial.into(),
        "shell".into(),
        "cmd".into(),
        "uimode".into(),
        "night".into(),
        appearance.as_android_night().into(),
    ]
}

pub fn parse_ios_appearance(stdout: &str) -> Result<Appearance> {
    let trimmed = stdout.trim().to_ascii_lowercase();
    if trimmed == "light" || trimmed.starts_with("light") {
        Ok(Appearance::Light)
    } else if trimmed == "dark" || trimmed.starts_with("dark") {
        Ok(Appearance::Dark)
    } else {
        Err(EngineError::Processing(format!(
            "unrecognized simctl appearance output: {}",
            stdout.trim()
        )))
    }
}

/// `Night mode: yes` → dark; `no` and `auto` → light.
pub fn parse_android_uimode_night(stdout: &str) -> Result<Appearance> {
    let lower = stdout.to_ascii_lowercase();
    let Some(idx) = lower.find("night mode:") else {
        return Err(EngineError::Processing(format!(
            "unrecognized uimode output: {}",
            stdout.trim()
        )));
    };
    let rest = lower[idx + "night mode:".len()..].trim_start();
    if rest.starts_with("yes") {
        Ok(Appearance::Dark)
    } else if rest.starts_with("no") || rest.starts_with("auto") {
        Ok(Appearance::Light)
    } else {
        Err(EngineError::Processing(format!(
            "unrecognized uimode night value: {}",
            stdout.trim()
        )))
    }
}

pub fn ios_appearance_get(udid: &str) -> Result<Appearance> {
    run_ios_appearance_get(Path::new("xcrun"), udid)
}

pub fn ios_appearance_set(udid: &str, appearance: Appearance) -> Result<()> {
    run_ios_appearance_set(Path::new("xcrun"), udid, appearance)
}

pub fn android_appearance_get(serial: &str) -> Result<Appearance> {
    run_android_appearance_get(Path::new("adb"), serial)
}

pub fn android_appearance_set(serial: &str, appearance: Appearance) -> Result<()> {
    run_android_appearance_set(Path::new("adb"), serial, appearance)
}

fn run_ios_appearance_get(xcrun: &Path, udid: &str) -> Result<Appearance> {
    let output = run_cmd(xcrun, &ios_appearance_get_args(udid))?;
    parse_ios_appearance(&output)
}

fn run_ios_appearance_set(xcrun: &Path, udid: &str, appearance: Appearance) -> Result<()> {
    let _ = run_cmd(xcrun, &ios_appearance_set_args(udid, appearance))?;
    Ok(())
}

fn run_android_appearance_get(adb: &Path, serial: &str) -> Result<Appearance> {
    let output = run_cmd(adb, &android_appearance_get_args(serial))?;
    parse_android_uimode_night(&output)
}

fn run_android_appearance_set(adb: &Path, serial: &str, appearance: Appearance) -> Result<()> {
    let _ = run_cmd(adb, &android_appearance_set_args(serial, appearance))?;
    Ok(())
}

fn run_cmd(bin: &Path, args: &[String]) -> Result<String> {
    let output = Command::new(bin)
        .args(args)
        .output()
        .map_err(|e| EngineError::Processing(format!("failed to spawn {}: {e}", bin.display())))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(EngineError::Processing(format!(
            "appearance command failed ({}): {stderr}",
            output.status
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod parse_tests {
    use super::*;

    #[test]
    fn maps_ios_light_dark_and_android_uimode() {
        assert_eq!(parse_ios_appearance("light\n").unwrap(), Appearance::Light);
        assert_eq!(parse_ios_appearance("DARK").unwrap(), Appearance::Dark);
        assert_eq!(
            parse_android_uimode_night("Night mode: yes\n").unwrap(),
            Appearance::Dark
        );
        assert_eq!(
            parse_android_uimode_night("Night mode: no").unwrap(),
            Appearance::Light
        );
        assert_eq!(
            parse_android_uimode_night("Night mode: auto").unwrap(),
            Appearance::Light
        );
        assert!(parse_ios_appearance("unknown").is_err());
        assert!(parse_android_uimode_night("bogus").is_err());
    }

    #[test]
    fn appearance_argv_tokens() {
        assert_eq!(
            ios_appearance_set_args("UDID", Appearance::Light),
            ["simctl", "ui", "UDID", "appearance", "light"]
        );
        assert_eq!(
            ios_appearance_set_args("UDID", Appearance::Dark),
            ["simctl", "ui", "UDID", "appearance", "dark"]
        );
        assert_eq!(
            android_appearance_set_args("emulator-5554", Appearance::Light),
            [
                "-s",
                "emulator-5554",
                "shell",
                "cmd",
                "uimode",
                "night",
                "no"
            ]
        );
        assert_eq!(
            android_appearance_set_args("emulator-5554", Appearance::Dark),
            [
                "-s",
                "emulator-5554",
                "shell",
                "cmd",
                "uimode",
                "night",
                "yes"
            ]
        );
    }
}

#[cfg(all(test, unix))]
mod cmd_tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    fn sh_single_quote(path: &Path) -> String {
        format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
    }

    fn fake_bin(dir: &Path, name: &str, script: &str) -> std::path::PathBuf {
        let bin = dir.join(name);
        fs::write(&bin, script).unwrap();
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    #[test]
    fn ios_and_android_appearance_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let ios_log = dir.path().join("ios.log");
        let android_log = dir.path().join("android.log");
        let xcrun = fake_bin(
            dir.path(),
            "xcrun",
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> {log}\necho light\n",
                log = sh_single_quote(&ios_log),
            ),
        );
        let adb = fake_bin(
            dir.path(),
            "adb",
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> {log}\necho 'Night mode: yes'\n",
                log = sh_single_quote(&android_log),
            ),
        );

        assert_eq!(
            run_ios_appearance_get(&xcrun, "UDID-1").unwrap(),
            Appearance::Light
        );
        run_ios_appearance_set(&xcrun, "UDID-1", Appearance::Dark).unwrap();
        let ios_argv = fs::read_to_string(&ios_log).unwrap();
        assert!(
            ios_argv.contains("simctl ui UDID-1 appearance"),
            "{ios_argv}"
        );
        assert!(ios_argv.contains("appearance dark"), "{ios_argv}");

        assert_eq!(
            run_android_appearance_get(&adb, "emulator-5554").unwrap(),
            Appearance::Dark
        );
        run_android_appearance_set(&adb, "emulator-5554", Appearance::Light).unwrap();
        let android_argv = fs::read_to_string(&android_log).unwrap();
        assert!(
            android_argv.contains("-s emulator-5554 shell cmd uimode night"),
            "{android_argv}"
        );
        assert!(android_argv.contains("night no"), "{android_argv}");
    }
}
