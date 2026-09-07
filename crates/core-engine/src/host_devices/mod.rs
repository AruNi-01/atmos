//! Host device inventory (iOS Simulator + Android Emulator).
//!
//! No workspace or claim concept. Callers in `core-service` own occupancy.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum DevicePlatform {
    Ios,
    Android,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BootState {
    Booted,
    Shutdown,
    Booting,
    ShuttingDown,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostDevice {
    /// iOS UDID or Android AVD name (stable claim id).
    pub id: String,
    pub platform: DevicePlatform,
    pub name: String,
    pub runtime: String,
    pub boot: BootState,
    pub available: bool,
    /// Running Android emulator serial (`emulator-5554`), if known.
    pub serial: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IosSnapshot {
    pub xcode: bool,
    pub simctl: bool,
    pub devices: Vec<HostDevice>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AndroidSnapshot {
    pub sdk: bool,
    pub adb: bool,
    pub emulator: bool,
    pub devices: Vec<HostDevice>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AndroidToolchain {
    pub sdk_root: Option<PathBuf>,
    pub adb: Option<PathBuf>,
    pub emulator: Option<PathBuf>,
}

impl BootState {
    pub fn as_wire(self) -> &'static str {
        match self {
            Self::Booted => "Booted",
            Self::Shutdown => "Shutdown",
            Self::Booting => "Booting",
            Self::ShuttingDown => "Shutting Down",
            Self::Unavailable => "Unavailable",
        }
    }

    pub fn from_simctl(state: &str) -> Self {
        match state {
            "Booted" => Self::Booted,
            "Booting" => Self::Booting,
            "Shutting Down" => Self::ShuttingDown,
            "Shutdown" => Self::Shutdown,
            _ => Self::Unavailable,
        }
    }

    pub fn is_booted(self) -> bool {
        matches!(self, Self::Booted)
    }
}

pub fn parse_simctl_devices(json_text: &str) -> Vec<HostDevice> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json_text) else {
        return Vec::new();
    };
    let Some(runtimes) = value.get("devices").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (runtime, devices) in runtimes {
        if !runtime_is_ios(runtime) {
            continue;
        }
        let Some(list) = devices.as_array() else {
            continue;
        };
        for device in list {
            let Some(udid) = device.get("udid").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(name) = device.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            let state = device
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            out.push(HostDevice {
                id: udid.to_string(),
                platform: DevicePlatform::Ios,
                name: name.to_string(),
                runtime: runtime.clone(),
                boot: BootState::from_simctl(state),
                available: device
                    .get("isAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true),
                serial: None,
            });
        }
    }
    out
}

fn runtime_is_ios(runtime: &str) -> bool {
    runtime.contains("SimRuntime.iOS-")
        || runtime.contains("SimRuntime.iOS_")
        || (runtime.contains("iOS") && !runtime.contains("watchOS") && !runtime.contains("tvOS"))
}

pub fn parse_avd_list(list_avds: &str) -> Vec<String> {
    list_avds
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("INFO") && !line.starts_with("ERROR"))
        .map(str::to_string)
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdbDeviceLine {
    pub serial: String,
    pub state: String,
    pub physical: bool,
}

pub fn parse_adb_devices_l(text: &str) -> Vec<AdbDeviceLine> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with("List of devices") {
                return None;
            }
            let mut parts = line.split_whitespace();
            let serial = parts.next()?.to_string();
            let state = parts.next().unwrap_or("unknown").to_string();
            let rest = line.to_ascii_lowercase();
            let physical = rest.contains("usb:") || state == "unauthorized";
            Some(AdbDeviceLine {
                serial,
                state,
                physical,
            })
        })
        .collect()
}

pub fn parse_emu_avd_name(stdout: &str) -> Option<String> {
    stdout.lines().map(str::trim).find_map(|line| {
        if line.is_empty() || line.eq_ignore_ascii_case("ok") {
            None
        } else {
            Some(line.to_string())
        }
    })
}

/// Combine AVD names with running emulator serials. Physical USB devices are dropped.
pub fn merge_android_devices(
    avds: &[String],
    adb: &[AdbDeviceLine],
    avd_by_serial: &HashMap<String, String>,
) -> Vec<HostDevice> {
    let mut serial_for_avd: HashMap<String, String> = HashMap::new();
    for line in adb {
        if line.physical || line.state != "device" {
            continue;
        }
        if !(line.serial.starts_with("emulator-") || avd_by_serial.contains_key(&line.serial)) {
            continue;
        }
        if let Some(avd) = avd_by_serial.get(&line.serial) {
            serial_for_avd.insert(avd.clone(), line.serial.clone());
        }
    }

    avds.iter()
        .map(|avd| {
            let serial = serial_for_avd.get(avd).cloned();
            HostDevice {
                id: avd.clone(),
                platform: DevicePlatform::Android,
                name: avd.replace('_', " "),
                runtime: "android".into(),
                boot: if serial.is_some() {
                    BootState::Booted
                } else {
                    BootState::Shutdown
                },
                available: true,
                serial,
            }
        })
        .collect()
}

pub fn resolve_android_toolchain_from(
    android_home: Option<&Path>,
    android_sdk_root: Option<&Path>,
    home: Option<&Path>,
    adb_on_path: Option<&Path>,
    emulator_on_path: Option<&Path>,
) -> AndroidToolchain {
    let sdk_root = android_home
        .filter(|p| p.is_dir())
        .or_else(|| android_sdk_root.filter(|p| p.is_dir()))
        .map(Path::to_path_buf)
        .or_else(|| {
            home.map(|h| h.join("Library/Android/sdk"))
                .filter(|p| p.is_dir())
        });
    let adb = sdk_root
        .as_ref()
        .map(|sdk| sdk.join("platform-tools/adb"))
        .filter(|p| p.is_file())
        .or_else(|| adb_on_path.map(Path::to_path_buf));
    let emulator = sdk_root
        .as_ref()
        .map(|sdk| sdk.join("emulator/emulator"))
        .filter(|p| p.is_file())
        .or_else(|| emulator_on_path.map(Path::to_path_buf));
    AndroidToolchain {
        sdk_root,
        adb,
        emulator,
    }
}

pub fn collect_ios_snapshot() -> IosSnapshot {
    let xcode = run_capture("xcodebuild", &["-version"]).is_some_and(|s| s.contains("Xcode"));
    let simctl_out = run_capture("xcrun", &["simctl", "list", "devices", "-j"]);
    IosSnapshot {
        xcode,
        simctl: simctl_out.is_some(),
        devices: simctl_out
            .as_deref()
            .map(parse_simctl_devices)
            .unwrap_or_default(),
    }
}

pub fn collect_android_snapshot() -> AndroidSnapshot {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let toolchain = resolve_android_toolchain_from(
        std::env::var_os("ANDROID_HOME")
            .map(PathBuf::from)
            .as_deref(),
        std::env::var_os("ANDROID_SDK_ROOT")
            .map(PathBuf::from)
            .as_deref(),
        home.as_deref(),
        which("adb").as_deref(),
        which("emulator").as_deref(),
    );
    let sdk =
        toolchain.sdk_root.is_some() || (toolchain.adb.is_some() && toolchain.emulator.is_some());
    let adb = toolchain.adb.is_some();
    let emulator = toolchain.emulator.is_some();
    if !adb || !emulator {
        return AndroidSnapshot {
            sdk,
            adb,
            emulator,
            devices: Vec::new(),
        };
    }
    let avds = toolchain
        .emulator
        .as_ref()
        .and_then(|bin| run_capture(bin.to_str()?, &["-list-avds"]))
        .map(|text| parse_avd_list(&text))
        .unwrap_or_default();
    let adb_lines = toolchain
        .adb
        .as_ref()
        .and_then(|bin| run_capture(bin.to_str()?, &["devices", "-l"]))
        .map(|text| parse_adb_devices_l(&text))
        .unwrap_or_default();
    let mut avd_by_serial = HashMap::new();
    if let Some(adb_bin) = toolchain.adb.as_ref().and_then(|p| p.to_str()) {
        for line in &adb_lines {
            if line.physical || !line.serial.starts_with("emulator-") {
                continue;
            }
            if let Some(name) = run_capture(adb_bin, &["-s", &line.serial, "emu", "avd", "name"])
                .as_deref()
                .and_then(parse_emu_avd_name)
            {
                avd_by_serial.insert(line.serial.clone(), name);
            }
        }
    }
    AndroidSnapshot {
        sdk,
        adb,
        emulator,
        devices: merge_android_devices(&avds, &adb_lines, &avd_by_serial),
    }
}

fn which(cmd: &str) -> Option<PathBuf> {
    run_capture("which", &[cmd]).map(|s| PathBuf::from(s.trim()))
}

fn run_capture(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ios_devices_only() {
        let json = r#"{
          "devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
              {"udid":"AAA","name":"iPhone 16","state":"Booted","isAvailable":true}
            ],
            "com.apple.CoreSimulator.SimRuntime.watchOS-11-0": [
              {"udid":"W","name":"Watch","state":"Shutdown","isAvailable":true}
            ]
          }
        }"#;
        let devices = parse_simctl_devices(json);
        assert_eq!(
            devices.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["AAA"]
        );
        assert_eq!(devices[0].boot, BootState::Booted);
    }

    #[test]
    fn drops_physical_adb_and_maps_avd_serial() {
        let avds = vec!["Pixel_8".into(), "Medium_Phone".into()];
        let adb = parse_adb_devices_l(
            "List of devices attached\n\
             emulator-5554          device product:sdk_gphone64_arm64\n\
             R5CT123                device usb:1-1.3 product:star2qltecs\n\
             emulator-5556          unauthorized\n",
        );
        assert!(adb.iter().any(|d| d.physical && d.serial == "R5CT123"));
        let mut map = HashMap::new();
        map.insert("emulator-5554".into(), "Pixel_8".into());
        let devices = merge_android_devices(&avds, &adb, &map);
        assert_eq!(devices.len(), 2);
        let pixel = devices.iter().find(|d| d.id == "Pixel_8").unwrap();
        assert_eq!(pixel.serial.as_deref(), Some("emulator-5554"));
        assert_eq!(pixel.boot, BootState::Booted);
        let medium = devices.iter().find(|d| d.id == "Medium_Phone").unwrap();
        assert_eq!(medium.boot, BootState::Shutdown);
        assert!(devices
            .iter()
            .all(|d| d.serial.as_deref() != Some("R5CT123")));
    }

    #[test]
    fn parse_emu_avd_name_skips_ok() {
        assert_eq!(parse_emu_avd_name("Pixel_8\nOK\n"), Some("Pixel_8".into()));
    }
}
