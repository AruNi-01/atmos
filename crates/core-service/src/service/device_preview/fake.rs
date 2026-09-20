use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;
use core_engine::{
    android_appearance_get_args, android_appearance_set_args, ios_appearance_get_args,
    ios_appearance_set_args, ios_boot_already_booted, ios_shutdown_already_shutdown, AndroidImage,
    AndroidProfile, AndroidSnapshot, Appearance, BootState, DevicePlatform, HostDevice, IosRuntime,
    IosSnapshot,
};
use tokio::net::TcpListener;

use super::hooks::{DevicePreviewHooks, EnsureError, SpawnSpec, SpawnedHelper};
use super::types::{HelperKind, HelperPin};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostOp {
    CreateIos,
    CreateAndroid,
    BootIos,
    SpawnEmulator,
    ShutdownIos,
    ShutdownAndroid,
    DeleteIos,
    DeleteAndroid,
    Appearance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostCall {
    pub op: HostOp,
    pub argv: Vec<String>,
}

pub struct FakeHooks {
    pub os: String,
    pub arch: String,
    pub macos: Option<String>,
    pub ios: Mutex<IosSnapshot>,
    pub android: Mutex<AndroidSnapshot>,
    pub installed: Mutex<HashSet<HelperKind>>,
    pub checksum_fail: Mutex<bool>,
    pub reserved: Mutex<HashMap<u16, TcpListener>>,
    pub listeners: Mutex<HashMap<u32, TcpListener>>,
    pub by_device: Mutex<HashMap<String, (u32, u16)>>,
    pub next_pid: AtomicU32,
    pub spawn_count: AtomicU32,
    pub qemu_count: AtomicU32,
    pub killed: Mutex<Vec<u32>>,
    pub orphan_targets: Mutex<Vec<String>>,
    pub calls: Mutex<Vec<HostCall>>,
    pub last_spawn: Mutex<Option<SpawnSpec>>,
    pub ios_runtimes: Mutex<Vec<IosRuntime>>,
    pub android_profiles: Mutex<Vec<AndroidProfile>>,
    pub android_images: Mutex<Vec<AndroidImage>>,
    pub camera_wired: Mutex<bool>,
    pub appearances: Mutex<HashMap<String, Appearance>>,
    pub boot_ios_stderr: Mutex<Option<String>>,
    pub shutdown_ios_stderr: Mutex<Option<String>>,
}

impl FakeHooks {
    pub fn macos_host() -> Self {
        Self {
            os: "macos".into(),
            arch: "aarch64".into(),
            macos: Some("15.0".into()),
            ios: Mutex::new(IosSnapshot::default()),
            android: Mutex::new(AndroidSnapshot::default()),
            installed: Mutex::new(HashSet::new()),
            checksum_fail: Mutex::new(false),
            reserved: Mutex::new(HashMap::new()),
            listeners: Mutex::new(HashMap::new()),
            by_device: Mutex::new(HashMap::new()),
            next_pid: AtomicU32::new(1000),
            spawn_count: AtomicU32::new(0),
            qemu_count: AtomicU32::new(0),
            killed: Mutex::new(Vec::new()),
            orphan_targets: Mutex::new(Vec::new()),
            calls: Mutex::new(Vec::new()),
            last_spawn: Mutex::new(None),
            ios_runtimes: Mutex::new(Vec::new()),
            android_profiles: Mutex::new(Vec::new()),
            android_images: Mutex::new(Vec::new()),
            camera_wired: Mutex::new(true),
            appearances: Mutex::new(HashMap::new()),
            boot_ios_stderr: Mutex::new(None),
            shutdown_ios_stderr: Mutex::new(None),
        }
    }

    pub fn call_count(&self, op: HostOp) -> usize {
        self.calls
            .lock()
            .expect("calls")
            .iter()
            .filter(|call| call.op == op)
            .count()
    }

    pub fn argv_joined(&self) -> Vec<String> {
        self.calls
            .lock()
            .expect("calls")
            .iter()
            .map(|call| call.argv.join(" "))
            .collect()
    }
}

fn argv_flag(argv: &[String], flag: &str) -> Option<String> {
    argv.windows(2).find(|w| w[0] == flag).map(|w| w[1].clone())
}

fn record(calls: &Mutex<Vec<HostCall>>, op: HostOp, argv: &[String]) {
    calls.lock().expect("calls").push(HostCall {
        op,
        argv: argv.to_vec(),
    });
}

#[async_trait]
impl DevicePreviewHooks for FakeHooks {
    fn host_os(&self) -> String {
        self.os.clone()
    }

    fn host_arch(&self) -> String {
        self.arch.clone()
    }

    fn macos_version(&self) -> Option<String> {
        self.macos.clone()
    }

    fn ios_snapshot(&self) -> IosSnapshot {
        self.ios.lock().expect("ios").clone()
    }

    fn android_snapshot(&self) -> AndroidSnapshot {
        self.android.lock().expect("android").clone()
    }

    fn helper_installed(&self, kind: HelperKind, _version: &str) -> bool {
        self.installed.lock().expect("installed").contains(&kind)
    }

    async fn ensure_helper(
        &self,
        kind: HelperKind,
        _pin: &HelperPin,
        on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
    ) -> Result<(), EnsureError> {
        on_progress(1, Some(1));
        if *self.checksum_fail.lock().expect("checksum") {
            return Err(EnsureError::Checksum("checksum mismatch".into()));
        }
        self.installed.lock().expect("installed").insert(kind);
        Ok(())
    }

    async fn spawn(&self, spec: SpawnSpec) -> Result<SpawnedHelper, String> {
        let listener = self
            .reserved
            .lock()
            .expect("reserved")
            .remove(&spec.port)
            .ok_or_else(|| "missing reserved port".to_string())?;
        let pid = self.next_pid.fetch_add(1, Ordering::SeqCst);
        self.spawn_count.fetch_add(1, Ordering::SeqCst);
        self.listeners
            .lock()
            .expect("listeners")
            .insert(pid, listener);
        self.by_device
            .lock()
            .expect("by_device")
            .insert(spec.device_id.clone(), (pid, spec.port));
        if spec.argv_device != spec.device_id {
            self.by_device
                .lock()
                .expect("by_device")
                .insert(spec.argv_device.clone(), (pid, spec.port));
        }
        *self.last_spawn.lock().expect("last_spawn") = Some(spec);
        Ok(SpawnedHelper { pid, child: None })
    }

    async fn kill_pid(&self, pid: u32) {
        self.killed.lock().expect("killed").push(pid);
        self.listeners.lock().expect("listeners").remove(&pid);
        self.by_device
            .lock()
            .expect("by_device")
            .retain(|_, value| value.0 != pid);
    }

    fn pid_alive(&self, pid: u32) -> bool {
        self.listeners.lock().expect("listeners").contains_key(&pid)
    }

    async fn port_open(&self, port: u16) -> bool {
        tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
    }

    async fn reserve_port(&self) -> Result<u16, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        self.reserved
            .lock()
            .expect("reserved")
            .insert(port, listener);
        Ok(port)
    }

    async fn live_helper(&self, _kind: HelperKind, device_ids: &[String]) -> Option<(u32, u16)> {
        let map = self.by_device.lock().expect("by_device");
        device_ids.iter().find_map(|id| map.get(id).copied())
    }

    async fn kill_orphans(&self, _kind: HelperKind, device_ids: &[String], keep_pids: &[u32]) {
        self.orphan_targets
            .lock()
            .expect("orphans")
            .extend(device_ids.iter().cloned());
        let pids: Vec<u32> = {
            let map = self.by_device.lock().expect("by_device");
            device_ids
                .iter()
                .filter_map(|id| map.get(id).copied())
                .map(|(pid, _)| pid)
                .collect()
        };
        let mut seen = std::collections::HashSet::new();
        for pid in pids {
            if !seen.insert(pid) || keep_pids.contains(&pid) {
                continue;
            }
            self.kill_pid(pid).await;
        }
    }

    async fn hide_ios_simulator_app(&self) {}

    fn ios_runtimes(&self) -> Vec<IosRuntime> {
        self.ios_runtimes.lock().expect("ios_runtimes").clone()
    }

    fn android_profiles(&self) -> Vec<AndroidProfile> {
        self.android_profiles
            .lock()
            .expect("android_profiles")
            .clone()
    }

    fn android_images(&self) -> Vec<AndroidImage> {
        self.android_images.lock().expect("android_images").clone()
    }

    fn emulator_bin(&self) -> Option<PathBuf> {
        Some(PathBuf::from("emulator"))
    }

    async fn create_ios(&self, argv: &[String]) -> Result<String, String> {
        record(&self.calls, HostOp::CreateIos, argv);
        let name = argv.get(1).cloned().unwrap_or_else(|| "iOS device".into());
        let runtime = argv.get(3).cloned().unwrap_or_else(|| "ios".into());
        let udid = format!("UDID-{}", self.next_pid.fetch_add(1, Ordering::SeqCst));
        self.ios.lock().expect("ios").devices.push(HostDevice {
            id: udid.clone(),
            platform: DevicePlatform::Ios,
            name,
            runtime,
            boot: BootState::Shutdown,
            available: true,
            serial: None,
        });
        Ok(udid)
    }

    async fn create_android(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::CreateAndroid, argv);
        if argv.iter().any(|arg| arg == "--force") {
            return Err("refusing --force".into());
        }
        let name = argv_flag(argv, "--name").ok_or_else(|| "missing --name".to_string())?;
        let package = argv_flag(argv, "--package").unwrap_or_else(|| "android".into());
        self.android
            .lock()
            .expect("android")
            .devices
            .push(HostDevice {
                id: name.clone(),
                platform: DevicePlatform::Android,
                name: name.replace('_', " "),
                runtime: package,
                boot: BootState::Shutdown,
                available: true,
                serial: None,
            });
        Ok(())
    }

    async fn boot_ios(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::BootIos, argv);
        if let Some(stderr) = self
            .boot_ios_stderr
            .lock()
            .expect("boot_ios_stderr")
            .clone()
        {
            if ios_boot_already_booted(&stderr) {
                return Ok(());
            }
            return Err(stderr);
        }
        let udid = argv
            .last()
            .cloned()
            .ok_or_else(|| "missing udid".to_string())?;
        let mut ios = self.ios.lock().expect("ios");
        let Some(device) = ios.devices.iter_mut().find(|device| device.id == udid) else {
            return Err(format!("unknown device {udid}"));
        };
        device.boot = BootState::Booted;
        Ok(())
    }

    async fn spawn_emulator(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::SpawnEmulator, argv);
        self.qemu_count.fetch_add(1, Ordering::SeqCst);
        let avd = argv_flag(argv, "-avd").ok_or_else(|| "missing -avd".to_string())?;
        let port = argv_flag(argv, "-port")
            .ok_or_else(|| "missing -port".to_string())?
            .parse::<u16>()
            .map_err(|e| e.to_string())?;
        let serial = format!("emulator-{port}");
        let mut android = self.android.lock().expect("android");
        if let Some(device) = android.devices.iter_mut().find(|device| device.id == avd) {
            device.boot = BootState::Booted;
            device.serial = Some(serial);
        }
        Ok(())
    }

    async fn shutdown_ios(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::ShutdownIos, argv);
        if let Some(stderr) = self
            .shutdown_ios_stderr
            .lock()
            .expect("shutdown_ios_stderr")
            .clone()
        {
            if ios_shutdown_already_shutdown(&stderr) {
                return Ok(());
            }
            return Err(stderr);
        }
        let udid = argv
            .last()
            .cloned()
            .ok_or_else(|| "missing udid".to_string())?;
        let mut ios = self.ios.lock().expect("ios");
        let Some(device) = ios.devices.iter_mut().find(|device| device.id == udid) else {
            return Ok(());
        };
        device.boot = BootState::Shutdown;
        Ok(())
    }

    async fn shutdown_android(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::ShutdownAndroid, argv);
        let serial = argv_flag(argv, "-s").ok_or_else(|| "missing -s".to_string())?;
        let mut android = self.android.lock().expect("android");
        if let Some(device) = android
            .devices
            .iter_mut()
            .find(|device| device.serial.as_deref() == Some(serial.as_str()))
        {
            device.boot = BootState::Shutdown;
            device.serial = None;
        }
        Ok(())
    }

    async fn delete_ios(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::DeleteIos, argv);
        let udid = argv
            .last()
            .cloned()
            .ok_or_else(|| "missing udid".to_string())?;
        self.ios
            .lock()
            .expect("ios")
            .devices
            .retain(|device| device.id != udid);
        Ok(())
    }

    async fn delete_android(&self, argv: &[String]) -> Result<(), String> {
        record(&self.calls, HostOp::DeleteAndroid, argv);
        let name = argv_flag(argv, "--name").ok_or_else(|| "missing --name".to_string())?;
        self.android
            .lock()
            .expect("android")
            .devices
            .retain(|device| device.id != name);
        Ok(())
    }

    async fn appearance_get(
        &self,
        platform: DevicePlatform,
        id: &str,
    ) -> Result<Appearance, String> {
        let argv = match platform {
            DevicePlatform::Ios => ios_appearance_get_args(id),
            DevicePlatform::Android => android_appearance_get_args(id),
        };
        record(&self.calls, HostOp::Appearance, &argv);
        Ok(self
            .appearances
            .lock()
            .expect("appearances")
            .get(id)
            .copied()
            .unwrap_or(Appearance::Light))
    }

    async fn appearance_set(
        &self,
        platform: DevicePlatform,
        id: &str,
        appearance: Appearance,
    ) -> Result<(), String> {
        let argv = match platform {
            DevicePlatform::Ios => ios_appearance_set_args(id, appearance),
            DevicePlatform::Android => android_appearance_set_args(id, appearance),
        };
        record(&self.calls, HostOp::Appearance, &argv);
        self.appearances
            .lock()
            .expect("appearances")
            .insert(id.to_string(), appearance);
        Ok(())
    }

    fn camera_wired(&self, _serial: &str) -> bool {
        *self.camera_wired.lock().expect("camera_wired")
    }
}
