use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;
use core_engine::{AndroidSnapshot, IosSnapshot};
use tokio::net::TcpListener;

use super::hooks::{DevicePreviewHooks, EnsureError, SpawnSpec, SpawnedHelper};
use super::types::{HelperKind, HelperPin};

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
    pub killed: Mutex<Vec<u32>>,
    pub orphan_targets: Mutex<Vec<String>>,
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
            killed: Mutex::new(Vec::new()),
            orphan_targets: Mutex::new(Vec::new()),
        }
    }
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
                .insert(spec.argv_device, (pid, spec.port));
        }
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
}
