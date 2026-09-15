use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use core_engine::{
    boot_android_argv, boot_ios_argv, camera_feed_path, create_android_avd_argv, create_ios_argv,
    default_android_avd_name, default_ios_create_name, delete_android_avd_argv, delete_ios_argv,
    emulator_serial, free_emulator_port, is_valid_avd_name, seed_camera_feeds,
    shutdown_android_argv, shutdown_ios_argv, BootState, CameraLens, DevicePlatform, HostDevice,
};
use tokio::process::Child;
use tokio::sync::Mutex;

use super::hooks::{DevicePreviewHooks, EnsureError, SpawnSpec};
use super::paths::DevicePreviewPaths;
use super::persist::{load_claims, load_prefs, persist_claims, persist_prefs};
use super::pick::{pick_device, pick_reason};
use super::probe::{all_devices, assemble_probe, host_reason, AssembleProbeInput};
use super::production::ProductionHooks;
use super::types::{
    claim_preview_url, helper_process_ids, DeviceClaim, DeviceRuntime, DeviceType, HelperKind,
    HelperPin, InventoryPlatform, LastDevicePref, SimulatorDevice, SimulatorInventory,
    SimulatorOpError, SimulatorProbe, SimulatorReason, SimulatorStartResult,
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
        assemble_probe(AssembleProbeInput {
            platform,
            arch,
            macos_version,
            host,
            ios: &ios,
            android: &android,
            ios_devices,
            android_devices,
            ios_helper,
            android_helper,
            ios_pin: &self.sim_pin,
            android_pin: &self.emu_pin,
        })
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
            return Ok(not_ready(probe.reason, None, probe));
        }
        if let Some(claim) = self.live_claim(workspace_id, udid).await {
            return Ok(ready_result(claim, self.probe().await));
        }

        let _gate = self.claim_gate.lock().await;
        probe = self.probe().await;
        if probe.host_blocked() {
            return Ok(not_ready(probe.reason, None, probe));
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
                return Ok(not_ready(side.reason, None, probe));
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

        if device.platform == DevicePlatform::Android {
            if device.boot() != BootState::Booted {
                if let Err(err) = self.boot_android_vm(&device.udid).await {
                    probe = self.probe().await;
                    return Ok(not_ready(err.reason, None, probe));
                }
            }
        } else if let Err(err) = self.boot_ios_vm(&device.udid).await {
            probe = self.probe().await;
            return Ok(not_ready(err.reason, None, probe));
        }
        let device = self
            .lookup_simulator(&device.udid, Some(device.platform))
            .unwrap_or(device);

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
            match device.serial.clone() {
                Some(serial) => serial,
                None => {
                    probe = self.probe().await;
                    return Ok(not_ready(SimulatorReason::BootFailed, None, probe));
                }
            }
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
                android_serial: device.platform == DevicePlatform::Android,
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
            name: device.name.clone(),
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
        self.stop_locked(workspace_id).await
    }

    async fn stop_locked(&self, workspace_id: &str) -> Result<(), String> {
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
            return Some(self.with_filled_name(claim));
        }
        let _ = self.stop(workspace_id).await;
        None
    }

    /// Live claims on this Computer (pid + port still up). Does not start or stop helpers.
    pub async fn claims(&self) -> Vec<DeviceClaim> {
        let snapshot = self.snapshot_claims().await;
        let mut live = Vec::with_capacity(snapshot.len());
        for claim in snapshot {
            if self.hooks.pid_alive(claim.pid) && self.hooks.port_open(claim.port).await {
                live.push(self.with_filled_name(claim));
            }
        }
        live
    }

    pub fn paths(&self) -> &DevicePreviewPaths {
        &self.paths
    }

    pub fn serve_sim_binary(&self) -> std::path::PathBuf {
        self.paths
            .serve_sim_runtime
            .join(&self.sim_pin.version)
            .join("serve-sim")
    }

    pub(super) fn hooks(&self) -> &Arc<dyn DevicePreviewHooks> {
        &self.hooks
    }

    pub fn host_device(&self, udid: &str) -> Option<HostDevice> {
        self.hooks
            .ios_snapshot()
            .devices
            .into_iter()
            .chain(self.hooks.android_snapshot().devices)
            .find(|device| device.id == udid)
    }

    pub async fn inventory(&self) -> SimulatorInventory {
        let claims = self.snapshot_claims().await;
        let ios_devices = annotate(&self.hooks.ios_snapshot().devices, &claims);
        let android_devices = annotate(&self.hooks.android_snapshot().devices, &claims);
        SimulatorInventory {
            ios: ios_inventory(self.hooks.ios_runtimes(), ios_devices),
            android: android_inventory(
                self.hooks.android_profiles(),
                self.hooks.android_images(),
                android_devices,
            ),
        }
    }

    pub async fn create(
        &self,
        platform: DevicePlatform,
        device_type: &str,
        runtime: &str,
        name: Option<&str>,
    ) -> Result<SimulatorDevice, SimulatorOpError> {
        let _gate = self.claim_gate.lock().await;
        match platform {
            DevicePlatform::Ios => self.create_ios(device_type, runtime, name).await,
            DevicePlatform::Android => self.create_android(device_type, runtime, name).await,
        }
    }

    pub async fn boot(
        &self,
        workspace_id: &str,
        udid: &str,
        platform: DevicePlatform,
    ) -> Result<SimulatorDevice, SimulatorOpError> {
        let _gate = self.claim_gate.lock().await;
        self.refuse_foreign(workspace_id, udid).await?;
        let device = self
            .lookup_simulator(udid, Some(platform))
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::NoDevice))?;
        match platform {
            DevicePlatform::Ios => self.boot_ios_vm(&device.udid).await?,
            DevicePlatform::Android => {
                if device.boot() != BootState::Booted {
                    self.boot_android_vm(&device.udid).await?;
                }
            }
        }
        self.lookup_simulator(udid, Some(platform))
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::BootFailed))
    }

    pub async fn shutdown(
        &self,
        workspace_id: &str,
        udid: &str,
        platform: DevicePlatform,
    ) -> Result<SimulatorDevice, SimulatorOpError> {
        let _gate = self.claim_gate.lock().await;
        self.refuse_foreign(workspace_id, udid).await?;
        if self.claim_is_ours(workspace_id, udid).await {
            let _ = self.stop_locked(workspace_id).await;
        }
        self.shutdown_vm(udid, platform).await?;
        self.lookup_simulator(udid, Some(platform))
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::ShutdownFailed))
    }

    pub async fn delete(
        &self,
        workspace_id: &str,
        udid: &str,
        platform: DevicePlatform,
    ) -> Result<String, SimulatorOpError> {
        let _gate = self.claim_gate.lock().await;
        self.refuse_foreign(workspace_id, udid).await?;
        if self.claim_is_ours(workspace_id, udid).await {
            let _ = self.stop_locked(workspace_id).await;
        }
        self.shutdown_vm(udid, platform).await?;
        let argv_udid = udid.to_string();
        let result = match platform {
            DevicePlatform::Ios => self
                .hooks
                .delete_ios(&delete_ios_argv(&argv_udid))
                .await
                .map_err(|_| SimulatorOpError::new(SimulatorReason::DeleteFailed)),
            DevicePlatform::Android => self
                .hooks
                .delete_android(&delete_android_avd_argv(&argv_udid))
                .await
                .map_err(|_| SimulatorOpError::new(SimulatorReason::DeleteFailed)),
        };
        result?;
        Ok(argv_udid)
    }

    async fn create_ios(
        &self,
        device_type: &str,
        runtime: &str,
        name: Option<&str>,
    ) -> Result<SimulatorDevice, SimulatorOpError> {
        let runtimes = self.hooks.ios_runtimes();
        let rt = runtimes
            .iter()
            .find(|item| item.identifier == runtime)
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::RuntimeMissing))?;
        let ty = rt
            .supported_device_types
            .iter()
            .find(|item| item.identifier == device_type)
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::DeviceTypeUnknown))?;
        let name = name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| default_ios_create_name(&rt.name, &ty.name));
        let argv = create_ios_argv(&name, device_type, runtime);
        let udid = self
            .hooks
            .create_ios(&argv)
            .await
            .map_err(|_| SimulatorOpError::new(SimulatorReason::CreateFailed))?;
        Ok(self
            .lookup_simulator(&udid, Some(DevicePlatform::Ios))
            .unwrap_or(SimulatorDevice {
                udid,
                name,
                runtime: runtime.to_string(),
                state: BootState::Shutdown.as_wire().to_string(),
                available: true,
                platform: DevicePlatform::Ios,
                claimed_by_workspace: None,
                serial: None,
            }))
    }

    async fn create_android(
        &self,
        device_type: &str,
        runtime: &str,
        name: Option<&str>,
    ) -> Result<SimulatorDevice, SimulatorOpError> {
        let images = self.hooks.android_images();
        let image = images
            .iter()
            .find(|item| item.package == runtime)
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::SystemImageMissing))?;
        let profiles = self.hooks.android_profiles();
        if !profiles.iter().any(|item| item.id == device_type) {
            return Err(SimulatorOpError::new(SimulatorReason::DeviceTypeUnknown));
        }
        let existing: Vec<String> = self
            .hooks
            .android_snapshot()
            .devices
            .into_iter()
            .map(|device| device.id)
            .collect();
        let avd_name = match name.map(str::trim).filter(|value| !value.is_empty()) {
            Some(raw) => {
                if !is_valid_avd_name(raw) {
                    return Err(SimulatorOpError::new(SimulatorReason::CreateFailed));
                }
                unique_avd_name(raw, &existing)
            }
            None => default_android_avd_name(device_type, &image.api_level, &existing),
        };
        let argv = create_android_avd_argv(&avd_name, runtime, device_type)
            .map_err(|_| SimulatorOpError::new(SimulatorReason::CreateFailed))?;
        self.hooks
            .create_android(&argv)
            .await
            .map_err(|_| SimulatorOpError::new(SimulatorReason::CreateFailed))?;
        Ok(self
            .lookup_simulator(&avd_name, Some(DevicePlatform::Android))
            .unwrap_or(SimulatorDevice {
                udid: avd_name.clone(),
                name: avd_name.replace('_', " "),
                runtime: runtime.to_string(),
                state: BootState::Shutdown.as_wire().to_string(),
                available: true,
                platform: DevicePlatform::Android,
                claimed_by_workspace: None,
                serial: None,
            }))
    }

    async fn boot_ios_vm(&self, udid: &str) -> Result<(), SimulatorOpError> {
        self.hooks
            .boot_ios(&boot_ios_argv(udid))
            .await
            .map_err(|_| SimulatorOpError::new(SimulatorReason::BootFailed))?;
        self.hooks.hide_ios_simulator_app().await;
        Ok(())
    }

    async fn boot_android_vm(&self, avd: &str) -> Result<String, SimulatorOpError> {
        let snapshot = self.hooks.android_snapshot();
        if let Some(device) = snapshot.devices.iter().find(|device| device.id == avd) {
            if device.boot.is_booted() {
                return device
                    .serial
                    .clone()
                    .ok_or_else(|| SimulatorOpError::new(SimulatorReason::BootFailed));
            }
        }
        let used: Vec<String> = snapshot
            .devices
            .iter()
            .filter_map(|device| device.serial.clone())
            .collect();
        let port = free_emulator_port(&used)
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::BootFailed))?;
        let serial = emulator_serial(port);
        let front = camera_feed_path(&self.paths.camera_dir, &serial, CameraLens::Front);
        let back = camera_feed_path(&self.paths.camera_dir, &serial, CameraLens::Back);
        let cameras = match seed_camera_feeds(&self.paths.camera_dir, &serial) {
            Ok(()) => Some((front, back)),
            Err(_) => None,
        };
        let bin = self
            .hooks
            .emulator_bin()
            .ok_or_else(|| SimulatorOpError::new(SimulatorReason::BootFailed))?;
        let argv = boot_android_argv(
            &bin,
            avd,
            port,
            cameras
                .as_ref()
                .map(|(front, back)| (front.as_path(), back.as_path())),
        );
        self.hooks
            .spawn_emulator(&argv)
            .await
            .map_err(|_| SimulatorOpError::new(SimulatorReason::BootFailed))?;
        Ok(serial)
    }

    async fn shutdown_vm(
        &self,
        udid: &str,
        platform: DevicePlatform,
    ) -> Result<(), SimulatorOpError> {
        match platform {
            DevicePlatform::Ios => self
                .hooks
                .shutdown_ios(&shutdown_ios_argv(udid))
                .await
                .map_err(|_| SimulatorOpError::new(SimulatorReason::ShutdownFailed)),
            DevicePlatform::Android => {
                let serial = self
                    .hooks
                    .android_snapshot()
                    .devices
                    .into_iter()
                    .find(|device| device.id == udid)
                    .and_then(|device| device.serial);
                let Some(serial) = serial else {
                    return Ok(());
                };
                self.hooks
                    .shutdown_android(&shutdown_android_argv(&serial))
                    .await
                    .map_err(|_| SimulatorOpError::new(SimulatorReason::ShutdownFailed))
            }
        }
    }

    async fn refuse_foreign(&self, workspace_id: &str, udid: &str) -> Result<(), SimulatorOpError> {
        if let Some(claim) = self.claim_for(udid).await {
            if claim.workspace_id != workspace_id {
                return Err(SimulatorOpError::new(SimulatorReason::DeviceAlreadyClaimed));
            }
        }
        Ok(())
    }

    async fn claim_is_ours(&self, workspace_id: &str, udid: &str) -> bool {
        self.claim_for(udid)
            .await
            .is_some_and(|claim| claim.workspace_id == workspace_id)
    }

    async fn claim_for(&self, udid: &str) -> Option<DeviceClaim> {
        self.snapshot_claims()
            .await
            .into_iter()
            .find(|claim| claim.udid == udid || claim.argv_id == udid)
    }

    fn lookup_simulator(
        &self,
        udid: &str,
        platform: Option<DevicePlatform>,
    ) -> Option<SimulatorDevice> {
        let ios = annotate(&self.hooks.ios_snapshot().devices, &[]);
        let android = annotate(&self.hooks.android_snapshot().devices, &[]);
        ios.into_iter().chain(android).find(|device| {
            device.udid == udid && platform.is_none_or(|platform| device.platform == platform)
        })
    }

    fn with_filled_name(&self, mut claim: DeviceClaim) -> DeviceClaim {
        if !claim.name.is_empty() {
            return claim;
        }
        claim.name = self
            .hooks
            .ios_snapshot()
            .devices
            .into_iter()
            .chain(self.hooks.android_snapshot().devices)
            .find(|device| device.id == claim.udid)
            .map(|device| device.name)
            .unwrap_or_default();
        claim
    }

    async fn live_claim(&self, workspace_id: &str, udid: Option<&str>) -> Option<DeviceClaim> {
        let claim = {
            let guard = self.running.lock().await;
            guard.get(workspace_id)?.claim.clone()
        };
        let same = udid.map(|id| id == claim.udid).unwrap_or(true);
        if same && self.hooks.pid_alive(claim.pid) && self.hooks.port_open(claim.port).await {
            Some(self.with_filled_name(claim))
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

fn unique_avd_name(base: &str, existing: &[String]) -> String {
    let set: HashSet<&str> = existing.iter().map(String::as_str).collect();
    if !set.contains(base) {
        return base.to_string();
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{base}_{n}");
        if !set.contains(candidate.as_str()) {
            return candidate;
        }
        n = n.saturating_add(1);
        if n == u32::MAX {
            return candidate;
        }
    }
}

fn ios_inventory(
    runtimes: Vec<core_engine::IosRuntime>,
    devices: Vec<SimulatorDevice>,
) -> InventoryPlatform {
    InventoryPlatform {
        devices,
        device_types: Vec::new(),
        runtimes: runtimes
            .into_iter()
            .map(|runtime| DeviceRuntime {
                id: runtime.identifier,
                name: runtime.name,
                platform: DevicePlatform::Ios,
                supported_device_types: runtime
                    .supported_device_types
                    .into_iter()
                    .map(|item| DeviceType {
                        id: item.identifier,
                        name: item.name,
                        platform: DevicePlatform::Ios,
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn android_inventory(
    profiles: Vec<core_engine::AndroidProfile>,
    images: Vec<core_engine::AndroidImage>,
    devices: Vec<SimulatorDevice>,
) -> InventoryPlatform {
    InventoryPlatform {
        devices,
        device_types: profiles
            .into_iter()
            .map(|profile| DeviceType {
                id: profile.id,
                name: profile.name,
                platform: DevicePlatform::Android,
            })
            .collect(),
        runtimes: images
            .into_iter()
            .map(|image| DeviceRuntime {
                id: image.package,
                name: format!("{} {} {}", image.api_level, image.tag, image.abi),
                platform: DevicePlatform::Android,
                supported_device_types: Vec::new(),
            })
            .collect(),
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
    probe.reason = reason;
    SimulatorStartResult {
        ready: false,
        reason: Some(reason),
        url: None,
        udid,
        platform: None,
        probe,
    }
}
