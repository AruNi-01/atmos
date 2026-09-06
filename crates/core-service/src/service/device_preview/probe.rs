use core_engine::{AndroidSnapshot, IosSnapshot};

use super::types::{
    compare_dotted, HelperPin, PlatformProbe, SimulatorDevice, SimulatorProbe, SimulatorReason,
};

pub fn host_reason(
    platform: &str,
    arch: &str,
    macos_version: Option<&str>,
    minos: &str,
) -> Option<SimulatorReason> {
    if platform != "macos" {
        return Some(SimulatorReason::UnsupportedPlatform);
    }
    if arch != "aarch64" {
        return Some(SimulatorReason::UnsupportedArch);
    }
    match macos_version {
        Some(v) if compare_dotted(v, minos) >= 0 => None,
        _ => Some(SimulatorReason::MacosTooOld),
    }
}

pub fn ios_platform_reason(
    host: Option<SimulatorReason>,
    snapshot: &IosSnapshot,
    helper_installed: bool,
) -> SimulatorReason {
    if let Some(reason) = host {
        return reason;
    }
    if !snapshot.xcode {
        return SimulatorReason::XcodeMissing;
    }
    if !snapshot.simctl {
        return SimulatorReason::SimctlMissing;
    }
    let available = snapshot.devices.iter().any(|d| d.available);
    if !available {
        return if snapshot.devices.is_empty() {
            SimulatorReason::NoRuntime
        } else {
            SimulatorReason::NoDevice
        };
    }
    if !helper_installed {
        return SimulatorReason::HelperMissing;
    }
    SimulatorReason::Ok
}

pub fn android_platform_reason(
    host: Option<SimulatorReason>,
    snapshot: &AndroidSnapshot,
    helper_installed: bool,
) -> SimulatorReason {
    if let Some(reason) = host {
        return reason;
    }
    if !snapshot.sdk {
        return SimulatorReason::AndroidSdkMissing;
    }
    if !snapshot.adb {
        return SimulatorReason::AdbMissing;
    }
    if !snapshot.emulator {
        return SimulatorReason::EmulatorMissing;
    }
    if snapshot.devices.is_empty() || !snapshot.devices.iter().any(|d| d.available) {
        return SimulatorReason::NoAvd;
    }
    if !helper_installed {
        return SimulatorReason::HelperMissing;
    }
    SimulatorReason::Ok
}

pub fn assemble_probe(
    platform: String,
    arch: String,
    macos_version: Option<String>,
    host: Option<SimulatorReason>,
    ios: &IosSnapshot,
    android: &AndroidSnapshot,
    ios_devices: Vec<SimulatorDevice>,
    android_devices: Vec<SimulatorDevice>,
    ios_helper: bool,
    android_helper: bool,
    ios_pin: &HelperPin,
    android_pin: &HelperPin,
) -> SimulatorProbe {
    let ios_reason = ios_platform_reason(host.clone(), ios, ios_helper);
    let android_reason = android_platform_reason(host.clone(), android, android_helper);
    let ios = PlatformProbe {
        ready: ios_reason == SimulatorReason::Ok,
        reason: ios_reason,
        helper_installed: ios_helper,
        helper_version: ios_pin.version.clone(),
        devices: ios_devices,
    };
    let android = PlatformProbe {
        ready: android_reason == SimulatorReason::Ok,
        reason: android_reason,
        helper_installed: android_helper,
        helper_version: android_pin.version.clone(),
        devices: android_devices,
    };
    let reason = if let Some(host) = host {
        host
    } else if ios.ready || android.ready {
        SimulatorReason::Ok
    } else if ios.can_start() || android.can_start() {
        SimulatorReason::HelperMissing
    } else if ios.reason != SimulatorReason::Ok {
        ios.reason.clone()
    } else {
        android.reason.clone()
    };
    SimulatorProbe {
        ready: ios.ready || android.ready,
        reason,
        platform,
        arch,
        macos_version,
        ios,
        android,
    }
}

pub fn all_devices(probe: &SimulatorProbe) -> Vec<SimulatorDevice> {
    let mut out = probe.ios.devices.clone();
    out.extend(probe.android.devices.clone());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_engine::{AndroidSnapshot, BootState, DevicePlatform, HostDevice, IosSnapshot};

    fn pin() -> HelperPin {
        HelperPin {
            version: "1".into(),
            minos: "14.0".into(),
            asset: "a".into(),
            sha256: "".into(),
            download_url: "https://github.com/AruNi-01/atmos/releases/x".into(),
        }
    }

    fn iphone() -> HostDevice {
        HostDevice {
            id: "u".into(),
            platform: DevicePlatform::Ios,
            name: "iPhone 16".into(),
            runtime: "ios".into(),
            boot: BootState::Shutdown,
            available: true,
            serial: None,
        }
    }

    fn avd() -> HostDevice {
        HostDevice {
            id: "Pixel_8".into(),
            platform: DevicePlatform::Android,
            name: "Pixel 8".into(),
            runtime: "android".into(),
            boot: BootState::Shutdown,
            available: true,
            serial: None,
        }
    }

    #[test]
    fn android_ready_without_xcode() {
        let ios = IosSnapshot {
            xcode: false,
            simctl: false,
            devices: vec![],
        };
        let android = AndroidSnapshot {
            sdk: true,
            adb: true,
            emulator: true,
            devices: vec![avd()],
        };
        let probe = assemble_probe(
            "macos".into(),
            "aarch64".into(),
            Some("15.0".into()),
            None,
            &ios,
            &android,
            vec![],
            vec![SimulatorDevice::from_host(avd(), None)],
            false,
            true,
            &pin(),
            &pin(),
        );
        assert_eq!(probe.ios.reason, SimulatorReason::XcodeMissing);
        assert!(probe.android.ready);
        assert!(probe.can_start());
        assert!(!matches!(probe.reason, SimulatorReason::XcodeMissing));
    }

    #[test]
    fn ios_ready_without_android_sdk() {
        let ios = IosSnapshot {
            xcode: true,
            simctl: true,
            devices: vec![iphone()],
        };
        let android = AndroidSnapshot {
            sdk: false,
            adb: false,
            emulator: false,
            devices: vec![],
        };
        let probe = assemble_probe(
            "macos".into(),
            "aarch64".into(),
            Some("15.0".into()),
            None,
            &ios,
            &android,
            vec![SimulatorDevice::from_host(iphone(), None)],
            vec![],
            true,
            false,
            &pin(),
            &pin(),
        );
        assert!(probe.ios.ready);
        assert_eq!(probe.android.reason, SimulatorReason::AndroidSdkMissing);
        assert!(probe.can_start());
    }

    #[test]
    fn unsupported_host_blocks_both() {
        let host = host_reason("linux", "aarch64", None, "14.0");
        assert_eq!(host, Some(SimulatorReason::UnsupportedPlatform));
        let host = host_reason("macos", "x86_64", Some("15.0"), "14.0");
        assert_eq!(host, Some(SimulatorReason::UnsupportedArch));
    }
}
