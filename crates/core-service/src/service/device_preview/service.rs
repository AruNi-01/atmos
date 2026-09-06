use std::collections::HashMap;
use std::sync::Arc;

use core_engine::DevicePlatform;
use tokio::process::Child;
use tokio::sync::Mutex;

use super::hooks::{DevicePreviewHooks, EnsureError, SpawnSpec};
use super::paths::DevicePreviewPaths;
use super::persist::{load_claims, load_prefs, persist_claims, persist_prefs};
use super::pick::{pick_device, pick_reason};
use super::probe::{all_devices, assemble_probe, host_reason};
use super::production::ProductionHooks;
use super::types::{
    claim_preview_url, helper_process_ids, DeviceClaim, HelperKind, HelperPin, LastDevicePref,
    SimulatorDevice, SimulatorProbe, SimulatorReason, SimulatorStartResult,
};

const SERVE_SIM_PIN: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/pins/serve-sim-requirement.json"
));
const SERVE_EMU_PIN: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/pins/serve-emu-requirement.json"
));

struct Running {
    child: Option<Child>,
    claim: DeviceClaim,
}

pub struct DevicePreviewService {
    paths: DevicePreviewPaths,
    sim_pin: HelperPin,
    emu_pin: HelperPin,
    hooks: Arc<dyn DevicePreviewHooks>,
    running: Mutex<HashMap<String, Running>>,
    claim_gate: Mutex<()>,
}

impl DevicePreviewService {
    pub fn new() -> Result<Self, String> {
        let paths = DevicePreviewPaths::production()?;
        let hooks = Arc::new(ProductionHooks {
            paths: paths.clone(),
        });
        Self::with_hooks(paths, hooks)
    }

    pub fn with_hooks(
        paths: DevicePreviewPaths,
        hooks: Arc<dyn DevicePreviewHooks>,
    ) -> Result<Self, String> {
        let sim_pin: HelperPin = serde_json::from_str(SERVE_SIM_PIN).map_err(|e| e.to_string())?;
        let emu_pin: HelperPin = serde_json::from_str(SERVE_EMU_PIN).map_err(|e| e.to_string())?;
        let mut running = HashMap::new();
        for claim in load_claims(&paths.state_dir) {
            running.insert(claim.workspace_id.clone(), Running { child: None, claim });
        }
        Ok(Self {
            paths,
            sim_pin,
            emu_pin,
            hooks,
            running: Mutex::new(running),
            claim_gate: Mutex::new(()),
        })
    }

    pub async fn probe(&self) -> SimulatorProbe {
        let claims = self.snapshot_claims().await;
        self.probe_with_claims(&claims)
    }

    fn probe_with_claims(&self, claims: &[DeviceClaim]) -> SimulatorProbe {
        let platform = self.hooks.host_os();
        let arch = self.hooks.host_arch();
        let macos_version = self.hooks.macos_version();
        let host = host_reason(
            &platform,
            &arch,
            macos_version.as_deref(),
            &self.sim_pin.minos,
        );
        let ios = self.hooks.ios_snapshot();
        let android = self.hooks.android_snapshot();
        let ios_helper = self
            .hooks
            .helper_installed(HelperKind::ServeSim, &self.sim_pin.version);
        let android_helper = self
            .hooks
            .helper_installed(HelperKind::ServeEmu, &self.emu_pin.version);
        let ios_devices = annotate(&ios.devices, claims);
        let android_devices = annotate(&android.devices, claims);
        assemble_probe(
            platform,
            arch,
            macos_version,
            host,
            &ios,
            &android,
            ios_devices,
            android_devices,
            ios_helper,
            android_helper,
            &self.sim_pin,
            &self.emu_pin,
        )
    }

    pub async fn start(
        &self,
        workspace_id: &str,
        platform: Option<DevicePlatform>,
        udid: Option<&str>,
        mut on_progress: impl FnMut(HelperKind, u64, Option<u64>) + Send,
    ) -> Result<SimulatorStartResult, String> {
        let mut probe = self.probe().await;
        if probe.host_blocked() {
            return Ok(not_ready(probe.reason.clone(), None, probe));
        }
        if let Some(claim) = self.live_claim(workspace_id, udid).await {
            return Ok(ready_result(claim, self.probe().await));
        }

        let _gate = self.claim_gate.lock().await;
        probe = self.probe().await;
        if probe.host_blocked() {
            return Ok(not_ready(probe.reason.clone(), None, probe));
        }
        if let Some(claim) = self.live_claim(workspace_id, udid).await {
            return Ok(ready_result(claim, self.probe().await));
        }

        if let Some(requested) = platform {
            let side = match requested {
                DevicePlatform::Ios => &probe.ios,
                DevicePlatform::Android => &probe.android,
            };
            if !side.can_start() {
                return Ok(not_ready(side.reason.clone(), None, probe));
            }
        }

        let prefs = load_prefs(&self.paths.state_dir);
        let pref = prefs.get(workspace_id);
        let mut candidates = all_devices(&probe);
        candidates.retain(|device| match device.platform {
            DevicePlatform::Ios => probe.ios.can_start(),
            DevicePlatform::Android => probe.android.can_start(),
        });
        let device = match pick_device(&candidates, workspace_id, udid, platform, pref) {
            Ok(device) => device.clone(),
            Err(err) => {
                return Ok(not_ready(pick_reason(err), None, probe));
            }
        };

        let helper = HelperKind::for_platform(device.platform);
        let pin = match helper {
            HelperKind::ServeSim => &self.sim_pin,
            HelperKind::ServeEmu => &self.emu_pin,
        };
        if !self.hooks.helper_installed(helper, &pin.version) {
            let mut progress = |downloaded, total| on_progress(helper, downloaded, total);
            if let Err(err) = self.hooks.ensure_helper(helper, pin, &mut progress).await {
                let reason = match err {
                    EnsureError::Checksum(_) => SimulatorReason::ChecksumMismatch,
                    EnsureError::Download(_) => SimulatorReason::DownloadFailed,
                };
                probe = self.probe().await;
                return Ok(not_ready(reason, None, probe));
            }
        }

        let evicted = {
            let mut guard = self.running.lock().await;
            guard.remove(workspace_id)
        };
        let keep: Vec<u32> = self
            .snapshot_claims()
            .await
            .iter()
            .map(|claim| claim.pid)
            .collect();
        if let Some(mut prev) = evicted {
            if let Some(child) = prev.child.as_mut() {
                let _ = child.start_kill();
            } else {
                self.hooks.kill_pid(prev.claim.pid).await;
            }
        }

        let argv_device = if device.platform == DevicePlatform::Android {
            device.serial.clone().unwrap_or_else(|| device.udid.clone())
        } else {
            device.udid.clone()
        };
        let process_ids = helper_process_ids(&device.udid, &argv_device);
        if let Some((pid, _)) = self.hooks.live_helper(helper, &process_ids).await {
            if keep.contains(&pid) {
                return Ok(not_ready(
                    SimulatorReason::DeviceAlreadyClaimed,
                    Some(device.udid.clone()),
                    self.probe().await,
                ));
            }
        }

        self.hooks.kill_orphans(helper, &process_ids, &keep).await;
        if device.platform == DevicePlatform::Ios {
            self.hooks.hide_ios_simulator_app().await;
        }
        let port = self.hooks.reserve_port().await?;
        let spawned = match self
            .hooks
            .spawn(SpawnSpec {
                kind: helper,
                port,
                device_id: device.udid.clone(),
                argv_device: argv_device.clone(),
                android_serial: device.serial.is_some(),
                version: pin.version.clone(),
            })
            .await
        {
            Ok(spawned) => spawned,
            Err(_) => {
                probe = self.probe().await;
                probe.reason = SimulatorReason::StartFailed;
                return Ok(not_ready(SimulatorReason::StartFailed, None, probe));
            }
        };
        if device.platform == DevicePlatform::Ios {
            self.hooks.hide_ios_simulator_app().await;
        }
        let preview = device.serial.as_deref().unwrap_or(&device.udid);
        let claim = DeviceClaim {
            workspace_id: workspace_id.to_string(),
            pid: spawned.pid,
            port,
            udid: device.udid.clone(),
            argv_id: argv_device,
            url: claim_preview_url(port, preview),
            version: pin.version.clone(),
            platform: device.platform,
            helper,
        };
        self.insert_running(workspace_id, spawned.child, claim.clone())
            .await?;
        self.write_pref(workspace_id, device.platform, &device.udid)?;
        Ok(ready_result(claim, self.probe().await))
    }

    pub async fn stop(&self, workspace_id: &str) -> Result<(), String> {
        let _gate = self.claim_gate.lock().await;
        let mut running = {
            let mut guard = self.running.lock().await;
            let running = guard.remove(workspace_id);
            persist_claims(
                &self.paths.state_dir,
                &guard
                    .values()
                    .map(|item| item.claim.clone())
                    .collect::<Vec<_>>(),
            )?;
            running
        };
        if let Some(running) = running.as_mut() {
            if let Some(child) = running.child.as_mut() {
                let _ = child.start_kill();
                let _ = child.wait().await;
            } else {
                self.hooks.kill_pid(running.claim.pid).await;
            }
            let keep: Vec<u32> = self
                .snapshot_claims()
                .await
                .iter()
                .map(|claim| claim.pid)
                .collect();
            let process_ids = helper_process_ids(&running.claim.udid, &running.claim.argv_id);
            self.hooks
                .kill_orphans(running.claim.helper, &process_ids, &keep)
                .await;
        }
        Ok(())
    }

    pub async fn status(&self, workspace_id: &str) -> Option<DeviceClaim> {
        let claim = {
            let guard = self.running.lock().await;
            guard.get(workspace_id)?.claim.clone()
        };
        if self.hooks.pid_alive(claim.pid) && self.hooks.port_open(claim.port).await {
            return Some(claim);
        }
        let _ = self.stop(workspace_id).await;
        None
    }

    async fn live_claim(&self, workspace_id: &str, udid: Option<&str>) -> Option<DeviceClaim> {
        let claim = {
            let guard = self.running.lock().await;
            guard.get(workspace_id)?.claim.clone()
        };
        let same = udid.map(|id| id == claim.udid).unwrap_or(true);
        if same && self.hooks.pid_alive(claim.pid) && self.hooks.port_open(claim.port).await {
            Some(claim)
        } else {
            None
        }
    }

    async fn snapshot_claims(&self) -> Vec<DeviceClaim> {
        let guard = self.running.lock().await;
        guard.values().map(|item| item.claim.clone()).collect()
    }

    async fn insert_running(
        &self,
        workspace_id: &str,
        child: Option<Child>,
        claim: DeviceClaim,
    ) -> Result<(), String> {
        let mut guard = self.running.lock().await;
        guard.insert(workspace_id.to_string(), Running { child, claim });
        persist_claims(
            &self.paths.state_dir,
            &guard
                .values()
                .map(|item| item.claim.clone())
                .collect::<Vec<_>>(),
        )
    }

    fn write_pref(
        &self,
        workspace_id: &str,
        platform: DevicePlatform,
        udid: &str,
    ) -> Result<(), String> {
        let mut prefs = load_prefs(&self.paths.state_dir);
        prefs.insert(
            workspace_id.to_string(),
            LastDevicePref {
                platform,
                udid: udid.to_string(),
            },
        );
        persist_prefs(&self.paths.state_dir, &prefs)
    }
}

fn annotate(devices: &[core_engine::HostDevice], claims: &[DeviceClaim]) -> Vec<SimulatorDevice> {
    devices
        .iter()
        .cloned()
        .map(|device| {
            let owner = claims
                .iter()
                .find(|claim| claim.udid == device.id)
                .map(|claim| claim.workspace_id.clone());
            SimulatorDevice::from_host(device, owner)
        })
        .collect()
}

fn ready_result(claim: DeviceClaim, probe: SimulatorProbe) -> SimulatorStartResult {
    SimulatorStartResult {
        ready: true,
        reason: Some(SimulatorReason::Ok),
        url: Some(claim.url),
        udid: Some(claim.udid),
        platform: Some(claim.platform),
        probe,
    }
}

fn not_ready(
    reason: SimulatorReason,
    udid: Option<String>,
    mut probe: SimulatorProbe,
) -> SimulatorStartResult {
    probe.ready = false;
    probe.reason = reason.clone();
    SimulatorStartResult {
        ready: false,
        reason: Some(reason),
        url: None,
        udid,
        platform: None,
        probe,
    }
}
