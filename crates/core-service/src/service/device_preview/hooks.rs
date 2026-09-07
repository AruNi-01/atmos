use async_trait::async_trait;
use core_engine::{AndroidSnapshot, IosSnapshot};
use tokio::process::Child;

use super::types::{HelperKind, HelperPin};

#[derive(Debug)]
pub enum EnsureError {
    Checksum(String),
    Download(String),
}

#[derive(Debug, Clone)]
pub struct SpawnSpec {
    pub kind: HelperKind,
    pub port: u16,
    pub device_id: String,
    pub argv_device: String,
    pub android_serial: bool,
    pub version: String,
}

pub struct SpawnedHelper {
    pub pid: u32,
    pub child: Option<Child>,
}

#[async_trait]
pub trait DevicePreviewHooks: Send + Sync {
    fn host_os(&self) -> String;
    fn host_arch(&self) -> String;
    fn macos_version(&self) -> Option<String>;
    fn ios_snapshot(&self) -> IosSnapshot;
    fn android_snapshot(&self) -> AndroidSnapshot;
    fn helper_installed(&self, kind: HelperKind, version: &str) -> bool;
    async fn ensure_helper(
        &self,
        kind: HelperKind,
        pin: &HelperPin,
        on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
    ) -> Result<(), EnsureError>;
    async fn spawn(&self, spec: SpawnSpec) -> Result<SpawnedHelper, String>;
    async fn kill_pid(&self, pid: u32);
    fn pid_alive(&self, pid: u32) -> bool;
    async fn port_open(&self, port: u16) -> bool;
    async fn reserve_port(&self) -> Result<u16, String>;
    async fn live_helper(&self, kind: HelperKind, device_ids: &[String]) -> Option<(u32, u16)>;
    async fn kill_orphans(&self, kind: HelperKind, device_ids: &[String], keep_pids: &[u32]);
    async fn hide_ios_simulator_app(&self);
}
