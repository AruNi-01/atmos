//! Create / boot / shutdown / delete argv. Callers spawn; tests stay on fixtures.

use std::collections::HashSet;
use std::path::Path;

use crate::error::{EngineError, Result};

const AVD_NAME_CHARS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-";
const EMULATOR_PORT_MIN: u16 = 5554;
const EMULATOR_PORT_MAX: u16 = 5682;

pub fn is_valid_avd_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| AVD_NAME_CHARS.contains(c))
}

/// Default AVD name `{profileId}_{apiOrTag}` with unsafe chars → `_`.
/// On collision append `_2`, `_3`.
pub fn default_android_avd_name(
    profile_id: &str,
    api_or_tag: &str,
    existing_names: &[impl AsRef<str>],
) -> String {
    let existing: HashSet<&str> = existing_names.iter().map(AsRef::as_ref).collect();
    let base = sanitize_avd_token(&format!("{profile_id}_{api_or_tag}"));
    if !existing.contains(base.as_str()) {
        return base;
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{base}_{n}");
        if !existing.contains(candidate.as_str()) {
            return candidate;
        }
        n = n.saturating_add(1);
        if n == u32::MAX {
            return candidate;
        }
    }
}

fn sanitize_avd_token(raw: &str) -> String {
    raw.chars()
        .map(|c| if AVD_NAME_CHARS.contains(c) { c } else { '_' })
        .collect()
}

/// Default iOS simulator name: runtime `name` + type `name` (spaces allowed).
pub fn default_ios_create_name(runtime_name: &str, type_name: &str) -> String {
    format!("{runtime_name} {type_name}")
}

/// `create <name> <deviceType> <runtime>` after `xcrun simctl`.
pub fn create_ios_argv(name: &str, device_type: &str, runtime: &str) -> Vec<String> {
    vec![
        "create".into(),
        name.into(),
        device_type.into(),
        runtime.into(),
    ]
}

/// `create avd --name <name> --package <image> --device <profileId>`.
/// `--device` is mandatory. Do not pass `--force`.
pub fn create_android_avd_argv(name: &str, package: &str, profile_id: &str) -> Result<Vec<String>> {
    if !is_valid_avd_name(name) {
        return Err(EngineError::Processing(
            "AVD name must match [A-Za-z0-9._-]+".into(),
        ));
    }
    Ok(vec![
        "create".into(),
        "avd".into(),
        "--name".into(),
        name.into(),
        "--package".into(),
        package.into(),
        "--device".into(),
        profile_id.into(),
    ])
}

/// `boot <udid>` after `xcrun simctl`.
pub fn boot_ios_argv(udid: &str) -> Vec<String> {
    vec!["boot".into(), udid.into()]
}

/// `shutdown <udid>` after `xcrun simctl`.
pub fn shutdown_ios_argv(udid: &str) -> Vec<String> {
    vec!["shutdown".into(), udid.into()]
}

/// `delete <udid>` after `xcrun simctl`.
pub fn delete_ios_argv(udid: &str) -> Vec<String> {
    vec!["delete".into(), udid.into()]
}

/// `adb -s <serial> emu kill` args after `adb`.
pub fn shutdown_android_argv(serial: &str) -> Vec<String> {
    vec!["-s".into(), serial.into(), "emu".into(), "kill".into()]
}

/// `delete avd --name <avdName>` after `avdmanager`.
pub fn delete_android_avd_argv(avd_name: &str) -> Vec<String> {
    vec![
        "delete".into(),
        "avd".into(),
        "--name".into(),
        avd_name.into(),
    ]
}

pub fn emulator_serial(port: u16) -> String {
    format!("emulator-{port}")
}

/// Lowest free even console port in 5554..=5682 not used by `emulator-<port>` serials.
pub fn free_emulator_port<S: AsRef<str>>(used_serials: &[S]) -> Option<u16> {
    let used: HashSet<u16> = used_serials
        .iter()
        .filter_map(|s| parse_emulator_port(s.as_ref()))
        .collect();
    (EMULATOR_PORT_MIN..=EMULATOR_PORT_MAX)
        .step_by(2)
        .find(|port| !used.contains(port))
}

fn parse_emulator_port(serial: &str) -> Option<u16> {
    serial.trim().strip_prefix("emulator-")?.parse().ok()
}

/// Treat stderr matching `/current state:\s*Booted/i` as success.
pub fn ios_boot_already_booted(stderr: &str) -> bool {
    current_state_is(stderr, "booted")
}

/// Treat stderr matching `/current state:\s*Shutdown/i` as success.
pub fn ios_shutdown_already_shutdown(stderr: &str) -> bool {
    current_state_is(stderr, "shutdown")
}

fn current_state_is(stderr: &str, expected: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    let Some(idx) = lower.find("current state:") else {
        return false;
    };
    lower[idx + "current state:".len()..]
        .trim_start()
        .starts_with(expected)
}

/// Android qemu argv. Camera flags omitted when `cameras` is `None`.
pub fn boot_android_argv(
    emulator: impl AsRef<Path>,
    avd_name: &str,
    port: u16,
    cameras: Option<(&Path, &Path)>,
) -> Vec<String> {
    let mut argv = vec![
        emulator.as_ref().to_string_lossy().into_owned(),
        "-avd".into(),
        avd_name.into(),
        "-no-audio".into(),
        "-no-window".into(),
        "-gpu".into(),
        "host".into(),
        "-no-boot-anim".into(),
        "-port".into(),
        port.to_string(),
    ];
    if let Some((front, back)) = cameras {
        argv.push("-camera-front".into());
        argv.push(format!("imagefile:{}", front.to_string_lossy()));
        argv.push("-camera-back".into());
        argv.push(format!("imagefile:{}", back.to_string_lossy()));
    }
    argv
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn create_android_avd_argv_requires_device_and_skips_force() {
        let argv = create_android_avd_argv(
            "pixel_6_android-34",
            "system-images;android-34;google_apis;arm64-v8a",
            "pixel_6",
        )
        .unwrap();
        assert_eq!(
            argv,
            [
                "create",
                "avd",
                "--name",
                "pixel_6_android-34",
                "--package",
                "system-images;android-34;google_apis;arm64-v8a",
                "--device",
                "pixel_6",
            ]
        );
        assert!(!argv.iter().any(|arg| arg == "--force"));
    }

    #[test]
    fn create_android_avd_argv_rejects_unsafe_name() {
        let err = create_android_avd_argv("pixel 6", "pkg", "pixel_6")
            .unwrap_err()
            .to_string();
        assert!(err.contains("[A-Za-z0-9._-]+"), "{err}");
    }

    #[test]
    fn default_android_avd_name_sanitizes_and_suffixes_collisions() {
        let existing = ["pixel_6_android-34", "pixel_6_android-34_2"];
        assert_eq!(
            default_android_avd_name("pixel 6", "android 34", &[] as &[&str]),
            "pixel_6_android_34"
        );
        assert_eq!(
            default_android_avd_name("pixel_6", "android-34", &existing),
            "pixel_6_android-34_3"
        );
    }

    #[test]
    fn create_ios_argv_includes_required_runtime() {
        assert_eq!(
            create_ios_argv(
                "iOS 18.0 iPhone 16",
                "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
                "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
            ),
            [
                "create",
                "iOS 18.0 iPhone 16",
                "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
                "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
            ]
        );
        assert_eq!(
            default_ios_create_name("iOS 18.0", "iPhone 16"),
            "iOS 18.0 iPhone 16"
        );
    }

    #[test]
    fn boot_android_argv_is_camera_ready_windowless_host_gpu() {
        let port = free_emulator_port(&[] as &[&str]).unwrap();
        assert_eq!(port, 5554);
        assert_eq!(port % 2, 0);
        let front = PathBuf::from("/tmp/cam/emulator-5554-front.png");
        let back = PathBuf::from("/tmp/cam/emulator-5554-back.png");
        let argv = boot_android_argv(
            Path::new("/sdk/emulator/emulator"),
            "Pixel_8",
            port,
            Some((front.as_path(), back.as_path())),
        );
        assert_eq!(argv[0], "/sdk/emulator/emulator");
        assert!(argv.contains(&"-no-window".to_string()));
        assert!(argv.windows(2).any(|w| w[0] == "-gpu" && w[1] == "host"));
        assert!(argv.windows(2).any(|w| w[0] == "-port" && w[1] == "5554"));
        assert!(argv.windows(2).any(|w| {
            w[0] == "-camera-front" && w[1] == "imagefile:/tmp/cam/emulator-5554-front.png"
        }));
        assert!(argv.windows(2).any(|w| {
            w[0] == "-camera-back" && w[1] == "imagefile:/tmp/cam/emulator-5554-back.png"
        }));
    }

    #[test]
    fn free_emulator_port_skips_used_serials_and_exhausts() {
        assert_eq!(free_emulator_port(&[] as &[&str]), Some(5554));
        assert_eq!(
            free_emulator_port(&["R5CT123", "emulator-5555"]),
            Some(5554)
        );
        let used: Vec<String> = (EMULATOR_PORT_MIN..=EMULATOR_PORT_MAX)
            .step_by(2)
            .map(emulator_serial)
            .collect();
        assert_eq!(free_emulator_port(&used), None);
        let mut almost = used.clone();
        almost.retain(|s| s != "emulator-5682");
        assert_eq!(free_emulator_port(&almost), Some(5682));
    }

    #[test]
    fn ios_already_booted_and_shutdown_helpers() {
        assert!(ios_boot_already_booted(
            "Unable to boot device in current state: Booted\n"
        ));
        assert!(ios_boot_already_booted("current state:\tBOOTED"));
        assert!(!ios_boot_already_booted(
            "Unable to boot device in current state: Shutdown"
        ));
        assert!(ios_shutdown_already_shutdown(
            "Unable to shutdown device in current state: Shutdown"
        ));
        assert!(ios_shutdown_already_shutdown("current state: shutdown"));
        assert!(!ios_shutdown_already_shutdown("current state: Booted"));
        assert_eq!(boot_ios_argv("AAA"), ["boot", "AAA"]);
        assert_eq!(shutdown_ios_argv("AAA"), ["shutdown", "AAA"]);
        assert_eq!(delete_ios_argv("AAA"), ["delete", "AAA"]);
        assert_eq!(
            shutdown_android_argv("emulator-5554"),
            ["-s", "emulator-5554", "emu", "kill"]
        );
        assert_eq!(
            delete_android_avd_argv("Pixel_8"),
            ["delete", "avd", "--name", "Pixel_8"]
        );
    }
}
