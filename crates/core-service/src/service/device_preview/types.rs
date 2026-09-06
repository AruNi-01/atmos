use core_engine::{BootState, DevicePlatform, HostDevice};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum HelperKind {
    ServeSim,
    ServeEmu,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SimulatorReason {
    Ok,
    UnsupportedPlatform,
    UnsupportedArch,
    MacosTooOld,
    XcodeMissing,
    SimctlMissing,
    NoRuntime,
    NoDevice,
    HelperMissing,
    DownloadFailed,
    ChecksumMismatch,
    StartFailed,
    AndroidSdkMissing,
    AdbMissing,
    EmulatorMissing,
    NoAvd,
    DeviceAlreadyClaimed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SimulatorDevice {
    pub udid: String,
    pub name: String,
    pub runtime: String,
    pub state: String,
    pub available: bool,
    pub platform: DevicePlatform,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_by_workspace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
}

impl SimulatorDevice {
    pub fn from_host(device: HostDevice, claimed_by_workspace: Option<String>) -> Self {
        Self {
            udid: device.id,
            name: device.name,
            runtime: device.runtime,
            state: device.boot.as_wire().to_string(),
            available: device.available,
            platform: device.platform,
            claimed_by_workspace,
            serial: device.serial,
        }
    }

    pub fn boot(&self) -> BootState {
        BootState::from_simctl(&self.state)
    }

    pub fn is_free_for(&self, workspace_id: &str) -> bool {
        self.available
            && match self.claimed_by_workspace.as_deref() {
                None => true,
                Some(owner) => owner == workspace_id,
            }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformProbe {
    pub ready: bool,
    pub reason: SimulatorReason,
    pub helper_installed: bool,
    pub helper_version: String,
    pub devices: Vec<SimulatorDevice>,
}

impl PlatformProbe {
    pub fn can_start(&self) -> bool {
        self.ready || self.reason == SimulatorReason::HelperMissing
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SimulatorProbe {
    pub ready: bool,
    pub reason: SimulatorReason,
    pub platform: String,
    pub arch: String,
    pub macos_version: Option<String>,
    pub ios: PlatformProbe,
    pub android: PlatformProbe,
}

impl SimulatorProbe {
    pub fn host_blocked(&self) -> bool {
        matches!(
            self.reason,
            SimulatorReason::UnsupportedPlatform
                | SimulatorReason::UnsupportedArch
                | SimulatorReason::MacosTooOld
        )
    }

    pub fn can_start(&self) -> bool {
        !self.host_blocked() && (self.ios.can_start() || self.android.can_start())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceClaim {
    pub workspace_id: String,
    pub pid: u32,
    pub port: u16,
    pub udid: String,
    /// Token actually passed to the helper argv (`-s serial` or `--avd` / iOS UDID).
    #[serde(default)]
    pub argv_id: String,
    pub url: String,
    pub version: String,
    pub platform: DevicePlatform,
    pub helper: HelperKind,
}

pub fn helper_process_ids(udid: &str, argv_id: &str) -> Vec<String> {
    let mut ids = Vec::with_capacity(2);
    if !udid.is_empty() {
        ids.push(udid.to_string());
    }
    if !argv_id.is_empty() && argv_id != udid {
        ids.push(argv_id.to_string());
    }
    ids
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SimulatorStartResult {
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<SimulatorReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<DevicePlatform>,
    pub probe: SimulatorProbe,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LastDevicePref {
    pub platform: DevicePlatform,
    pub udid: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HelperPin {
    pub version: String,
    pub minos: String,
    pub asset: String,
    pub sha256: String,
    pub download_url: String,
}

impl HelperKind {
    pub fn for_platform(platform: DevicePlatform) -> Self {
        match platform {
            DevicePlatform::Ios => Self::ServeSim,
            DevicePlatform::Android => Self::ServeEmu,
        }
    }

    pub fn as_wire(self) -> &'static str {
        match self {
            Self::ServeSim => "serve_sim",
            Self::ServeEmu => "serve_emu",
        }
    }
}

pub fn preview_url(url: &str, port: u16, device: &str) -> String {
    let base = if url.contains("127.0.0.1") || url.contains("localhost") {
        url.trim_end_matches('/').to_string()
    } else {
        format!("http://127.0.0.1:{port}")
    };
    if base.contains("device=") {
        base
    } else if base.contains('?') {
        format!("{base}&device={device}")
    } else {
        format!("{base}/?device={device}")
    }
}

pub fn claim_preview_url(port: u16, device: &str) -> String {
    preview_url(&format!("http://127.0.0.1:{port}"), port, device)
}

pub fn compare_dotted(a: &str, b: &str) -> i32 {
    let parse = |s: &str| {
        s.split('.')
            .map(|p| p.parse::<i32>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let aa = parse(a);
    let bb = parse(b);
    let n = aa.len().max(bb.len());
    for i in 0..n {
        let d = aa.get(i).copied().unwrap_or(0) - bb.get(i).copied().unwrap_or(0);
        if d != 0 {
            return d;
        }
    }
    0
}

pub fn parse_macos_version(sw_vers: &str) -> Option<String> {
    sw_vers.lines().find_map(|line| {
        let rest = line.strip_prefix("ProductVersion:")?.trim();
        if rest.is_empty() {
            None
        } else {
            Some(rest.to_string())
        }
    })
}
