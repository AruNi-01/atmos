use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use core_engine::{
    camera_feed_path, merge_android_devices, parse_adb_devices_l, AndroidImage, AndroidProfile,
    BootState, CameraLens, DevicePlatform, HostDevice, IosDeviceType, IosRuntime,
    CAMERA_PLACEHOLDER_PNG,
};
use tempfile::TempDir;

use super::args::{args_contain_global_kill, helper_args};
use super::fake::{FakeHooks, HostOp};
use super::paths::DevicePreviewPaths;
use super::persist::load_claims;
use super::service::DevicePreviewService;
use super::types::{claim_preview_url, HelperKind, HelperPin, SimulatorReason};

fn serve_sim_pin() -> HelperPin {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/pins/serve-sim-requirement.json"
    )))
    .unwrap()
}

pub(super) fn iphone(id: &str, boot: BootState) -> HostDevice {
    HostDevice {
        id: id.into(),
        platform: DevicePlatform::Ios,
        name: format!("iPhone {id}"),
        runtime: "ios".into(),
        boot,
        available: true,
        serial: None,
    }
}

pub(super) fn avd(id: &str, boot: BootState) -> HostDevice {
    HostDevice {
        id: id.into(),
        platform: DevicePlatform::Android,
        name: id.into(),
        runtime: "android".into(),
        boot,
        available: true,
        serial: if boot == BootState::Booted {
            Some("emulator-5554".into())
        } else {
            None
        },
    }
}

pub(super) fn service(hooks: Arc<FakeHooks>) -> (TempDir, DevicePreviewService) {
    let dir = TempDir::new().unwrap();
    let paths = DevicePreviewPaths::isolated(dir.path());
    let svc = DevicePreviewService::with_hooks(paths, hooks).unwrap();
    (dir, svc)
}

pub(super) fn ready_hooks() -> Arc<FakeHooks> {
    let hooks = FakeHooks::macos_host();
    hooks.ios.lock().unwrap().xcode = true;
    hooks.ios.lock().unwrap().simctl = true;
    hooks.ios.lock().unwrap().devices = vec![
        iphone("phone-a", BootState::Shutdown),
        iphone("phone-b", BootState::Shutdown),
    ];
    hooks.android.lock().unwrap().sdk = true;
    hooks.android.lock().unwrap().adb = true;
    hooks.android.lock().unwrap().emulator = true;
    hooks.android.lock().unwrap().devices = vec![avd("Pixel_8", BootState::Shutdown)];
    hooks.installed.lock().unwrap().insert(HelperKind::ServeSim);
    hooks.installed.lock().unwrap().insert(HelperKind::ServeEmu);
    Arc::new(hooks)
}

#[tokio::test]
async fn auto_claim_picks_a_free_device() {
    let hooks = ready_hooks();
    let (dir, svc) = service(hooks);
    let result = svc.start("ws-a", None, None, |_, _, _| {}).await.unwrap();
    assert!(result.ready);
    let claims = load_claims(&dir.path().join("state/simulator"));
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].workspace_id, "ws-a");
}

#[tokio::test]
async fn never_steals_another_workspace_device() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(hooks);
    let first = svc
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    assert!(first.ready);
    let second = svc
        .start("ws-b", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    assert!(!second.ready);
    assert_eq!(second.reason, Some(SimulatorReason::DeviceAlreadyClaimed));
    let status = svc.status("ws-a").await.unwrap();
    assert_eq!(status.udid, "phone-a");
}

#[tokio::test]
async fn no_free_device_leaves_existing_claim() {
    let hooks = FakeHooks::macos_host();
    hooks.ios.lock().unwrap().xcode = true;
    hooks.ios.lock().unwrap().simctl = true;
    hooks.ios.lock().unwrap().devices = vec![iphone("only", BootState::Booted)];
    hooks.installed.lock().unwrap().insert(HelperKind::ServeSim);
    let hooks = Arc::new(hooks);
    let (_dir, svc) = service(hooks);
    assert!(
        svc.start("ws-a", None, None, |_, _, _| {})
            .await
            .unwrap()
            .ready
    );
    let second = svc.start("ws-b", None, None, |_, _, _| {}).await.unwrap();
    assert_eq!(second.reason, Some(SimulatorReason::NoDevice));
    assert!(svc.status("ws-a").await.is_some());
}

#[tokio::test]
async fn restore_reuses_pid() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(hooks.clone());
    let first = svc
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let pid = svc.status("ws-a").await.unwrap().pid;
    let second = svc.start("ws-a", None, None, |_, _, _| {}).await.unwrap();
    assert!(second.ready);
    assert_eq!(second.udid, first.udid);
    assert_eq!(svc.status("ws-a").await.unwrap().pid, pid);
    assert_eq!(
        hooks.spawn_count.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}

#[tokio::test]
async fn stop_is_scoped_to_workspace() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(hooks.clone());
    svc.start(
        "ws-a",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    svc.start(
        "ws-b",
        Some(DevicePlatform::Android),
        Some("Pixel_8"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let b = svc.status("ws-b").await.unwrap();
    svc.stop("ws-a").await.unwrap();
    assert!(svc.status("ws-a").await.is_none());
    let still = svc.status("ws-b").await.unwrap();
    assert_eq!(still.pid, b.pid);
    assert_eq!(still.port, b.port);
}

#[tokio::test]
async fn two_workspaces_can_claim_two_platforms() {
    let hooks = ready_hooks();
    let (dir, svc) = service(hooks);
    svc.start(
        "ws-a",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    svc.start(
        "ws-b",
        Some(DevicePlatform::Android),
        Some("Pixel_8"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let claims = load_claims(&dir.path().join("state/simulator"));
    assert_eq!(claims.len(), 2);
    assert!(claims.iter().any(|c| c.platform == DevicePlatform::Ios));
    assert!(claims.iter().any(|c| c.platform == DevicePlatform::Android));
}

/// S3 — iOS preview still claims and binds loopback.
#[tokio::test]
async fn start_ios_claims_loopback_without_kill() {
    let hooks = ready_hooks();
    let (dir, svc) = service(Arc::clone(&hooks));
    let pin = serve_sim_pin();
    let result = svc
        .start(
            "ws-a",
            Some(DevicePlatform::Ios),
            Some("phone-a"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    assert!(result.ready);
    let claim = svc.status("ws-a").await.unwrap();
    assert_eq!(claim.udid, "phone-a");
    assert_eq!(claim.version, pin.version);
    assert_eq!(claim.url, claim_preview_url(claim.port, "phone-a"));
    assert!(claim.url.contains("127.0.0.1"));
    assert_eq!(result.url.as_deref(), Some(claim.url.as_str()));
    let persisted = load_claims(&dir.path().join("state/simulator"));
    assert_eq!(persisted.len(), 1);
    assert_eq!(persisted[0].url, claim.url);
    let spec = hooks.last_spawn.lock().unwrap().clone().unwrap();
    assert_eq!(spec.kind, HelperKind::ServeSim);
    assert_eq!(spec.port, claim.port);
    assert_eq!(spec.version, pin.version);
    let argv = helper_args(spec.kind, spec.port, &spec.argv_device, spec.android_serial);
    assert!(argv
        .windows(2)
        .any(|w| w[0] == "--host" && w[1] == "127.0.0.1"));
    assert!(!args_contain_global_kill(&argv));
}

#[tokio::test]
async fn checksum_mismatch_does_not_mark_ready() {
    let hooks = FakeHooks::macos_host();
    hooks.ios.lock().unwrap().xcode = true;
    hooks.ios.lock().unwrap().simctl = true;
    hooks.ios.lock().unwrap().devices = vec![iphone("phone-a", BootState::Shutdown)];
    *hooks.checksum_fail.lock().unwrap() = true;
    let hooks = Arc::new(hooks);
    let (_dir, svc) = service(hooks);
    let result = svc.start("ws-a", None, None, |_, _, _| {}).await.unwrap();
    assert!(!result.ready);
    assert_eq!(result.reason, Some(SimulatorReason::ChecksumMismatch));
}

#[tokio::test]
async fn linux_host_is_unsupported() {
    let mut hooks = FakeHooks::macos_host();
    hooks.os = "linux".into();
    let hooks = Arc::new(hooks);
    let (_dir, svc) = service(hooks);
    let probe = svc.probe().await;
    assert_eq!(probe.reason, SimulatorReason::UnsupportedPlatform);
    assert!(!probe.can_start());
}

#[tokio::test]
async fn x86_64_host_is_unsupported() {
    let mut hooks = FakeHooks::macos_host();
    hooks.arch = "x86_64".into();
    let hooks = Arc::new(hooks);
    let (_dir, svc) = service(hooks);
    let probe = svc.probe().await;
    assert_eq!(probe.reason, SimulatorReason::UnsupportedArch);
    assert!(!probe.can_start());
}

#[tokio::test]
async fn probe_annotates_claimed_devices() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(hooks);
    svc.start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let probe = svc.probe().await;
    let phone = probe
        .ios
        .devices
        .iter()
        .find(|device| device.udid == "phone-a")
        .unwrap();
    assert_eq!(phone.claimed_by_workspace.as_deref(), Some("ws-a"));
}

/// S13 — Inventory annotates claims and drops physical adb.
#[tokio::test]
async fn inventory_annotates_claims_and_drops_physical_adb() {
    let hooks = ready_hooks();
    let adb = parse_adb_devices_l(
        "List of devices attached\n\
         emulator-5554          device product:sdk_gphone64_arm64\n\
         R5CT123                device usb:1-1.3 product:star2qltecs\n",
    );
    let mut avd_by_serial = HashMap::new();
    avd_by_serial.insert("emulator-5554".into(), "Pixel_8".into());
    hooks.android.lock().unwrap().devices =
        merge_android_devices(&["Pixel_8".into()], &adb, &avd_by_serial);
    hooks.ios.lock().unwrap().devices = vec![iphone("phone-a", BootState::Shutdown)];
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-a",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let inventory = svc.inventory().await;
    let rows: Vec<_> = inventory
        .ios
        .devices
        .iter()
        .chain(inventory.android.devices.iter())
        .collect();
    assert!(rows.iter().any(|d| d.udid == "phone-a"));
    assert!(rows.iter().any(|d| d.udid == "Pixel_8"));
    assert!(rows.iter().all(|d| d.udid != "R5CT123"));
    assert!(rows.iter().all(|d| d.serial.as_deref() != Some("R5CT123")));
    let phone = inventory
        .ios
        .devices
        .iter()
        .find(|d| d.udid == "phone-a")
        .unwrap();
    assert_eq!(phone.claimed_by_workspace.as_deref(), Some("ws-a"));
    let pixel = inventory
        .android
        .devices
        .iter()
        .find(|d| d.udid == "Pixel_8")
        .unwrap();
    assert_eq!(pixel.claimed_by_workspace, None);
}

#[tokio::test]
async fn concurrent_start_does_not_double_claim() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    let svc = Arc::new(svc);
    let a = svc.clone();
    let b = svc.clone();
    let (first, second) = tokio::join!(
        a.start("ws-a", None, Some("phone-a"), |_, _, _| {}),
        b.start("ws-b", None, Some("phone-a"), |_, _, _| {}),
    );
    let first = first.unwrap();
    let second = second.unwrap();
    assert_eq!(
        usize::from(first.ready) + usize::from(second.ready),
        1,
        "exactly one workspace should own the device"
    );
    let claimed = if first.ready { &first } else { &second };
    let rejected = if first.ready { &second } else { &first };
    assert_eq!(rejected.reason, Some(SimulatorReason::DeviceAlreadyClaimed));
    assert_eq!(claimed.udid.as_deref(), Some("phone-a"));
    assert_eq!(
        hooks.spawn_count.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}

#[tokio::test]
async fn booted_android_tracks_serial_for_helper_lookup() {
    let hooks = FakeHooks::macos_host();
    hooks.ios.lock().unwrap().xcode = true;
    hooks.ios.lock().unwrap().simctl = true;
    hooks.android.lock().unwrap().sdk = true;
    hooks.android.lock().unwrap().adb = true;
    hooks.android.lock().unwrap().emulator = true;
    hooks.android.lock().unwrap().devices = vec![avd("Pixel_8", BootState::Booted)];
    hooks.installed.lock().unwrap().insert(HelperKind::ServeEmu);
    let hooks = Arc::new(hooks);
    let (dir, svc) = service(Arc::clone(&hooks));
    let result = svc
        .start(
            "ws-a",
            Some(DevicePlatform::Android),
            Some("Pixel_8"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    assert!(result.ready);
    let claims = load_claims(&dir.path().join("state/simulator"));
    assert_eq!(claims[0].udid, "Pixel_8");
    assert_eq!(claims[0].argv_id, "emulator-5554");
    let targets = hooks.orphan_targets.lock().unwrap().clone();
    assert!(targets.iter().any(|id| id == "Pixel_8"));
    assert!(targets.iter().any(|id| id == "emulator-5554"));
    svc.stop("ws-a").await.unwrap();
    let after_stop = hooks.orphan_targets.lock().unwrap().clone();
    assert!(after_stop.iter().any(|id| id == "emulator-5554"));
}

fn ios_catalog() -> IosRuntime {
    IosRuntime {
        identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-0".into(),
        name: "iOS 18.0".into(),
        supported_device_types: vec![IosDeviceType {
            identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-16".into(),
            name: "iPhone 16".into(),
        }],
    }
}

fn android_profile() -> AndroidProfile {
    AndroidProfile {
        id: "pixel_8".into(),
        name: "Pixel 8".into(),
        oem: Some("Google".into()),
        tag: None,
    }
}

fn android_image() -> AndroidImage {
    AndroidImage {
        package: "system-images;android-34;google_apis;arm64-v8a".into(),
        api_level: "android-34".into(),
        tag: "google_apis".into(),
        abi: "arm64-v8a".into(),
    }
}

fn with_catalogs(hooks: &FakeHooks) {
    hooks.ios_runtimes.lock().unwrap().push(ios_catalog());
    hooks
        .android_profiles
        .lock()
        .unwrap()
        .push(android_profile());
    hooks.android_images.lock().unwrap().push(android_image());
}

#[tokio::test]
async fn create_does_not_boot_or_claim() {
    let hooks = ready_hooks();
    with_catalogs(&hooks);
    let (dir, svc) = service(Arc::clone(&hooks));
    let before = load_claims(&dir.path().join("state/simulator"));
    let ios = svc
        .create(
            DevicePlatform::Ios,
            "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
            None,
        )
        .await
        .unwrap();
    let android = svc
        .create(
            DevicePlatform::Android,
            "pixel_8",
            "system-images;android-34;google_apis;arm64-v8a",
            None,
        )
        .await
        .unwrap();
    assert_eq!(ios.state, "Shutdown");
    assert_eq!(android.state, "Shutdown");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), 0);
    assert_eq!(hooks.qemu_count.load(Ordering::SeqCst), 0);
    assert_eq!(load_claims(&dir.path().join("state/simulator")), before);
}

#[tokio::test]
async fn create_missing_runtime_or_image() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    let ios = svc
        .create(
            DevicePlatform::Ios,
            "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
            None,
        )
        .await
        .unwrap_err();
    assert_eq!(ios.reason, SimulatorReason::RuntimeMissing);
    let android = svc
        .create(
            DevicePlatform::Android,
            "pixel_8",
            "system-images;android-34;google_apis;arm64-v8a",
            None,
        )
        .await
        .unwrap_err();
    assert_eq!(android.reason, SimulatorReason::SystemImageMissing);
    assert_eq!(hooks.call_count(HostOp::CreateIos), 0);
    assert_eq!(hooks.call_count(HostOp::CreateAndroid), 0);
}

#[tokio::test]
async fn create_name_collision_suffixes_without_force() {
    let hooks = ready_hooks();
    with_catalogs(&hooks);
    hooks.android.lock().unwrap().devices = vec![avd("Pixel_8", BootState::Shutdown)];
    let (_dir, svc) = service(Arc::clone(&hooks));
    let created = svc
        .create(
            DevicePlatform::Android,
            "pixel_8",
            "system-images;android-34;google_apis;arm64-v8a",
            Some("Pixel_8"),
        )
        .await
        .unwrap();
    assert_eq!(created.udid, "Pixel_8_2");
    assert_eq!(created.state, "Shutdown");
    let joined = hooks.argv_joined();
    assert!(
        joined.iter().any(|line| line.contains("--name Pixel_8_2")),
        "{joined:?}"
    );
    assert!(
        joined.iter().all(|line| !line.contains("--force")),
        "{joined:?}"
    );
    assert!(hooks
        .android
        .lock()
        .unwrap()
        .devices
        .iter()
        .any(|device| device.id == "Pixel_8"));
}

#[tokio::test]
async fn boot_unclaimed_does_not_spawn_helper() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    let device = svc
        .boot("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap();
    assert_eq!(device.state, "Booted");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), 0);
    assert_eq!(hooks.call_count(HostOp::BootIos), 1);
    assert_eq!(
        hooks
            .ios
            .lock()
            .unwrap()
            .devices
            .iter()
            .find(|d| d.id == "phone-a")
            .unwrap()
            .boot,
        BootState::Booted
    );
}

#[tokio::test]
async fn boot_foreign_claim_is_refused() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-b",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let err = svc
        .boot("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap_err();
    assert_eq!(err.reason, SimulatorReason::DeviceAlreadyClaimed);
    assert_eq!(svc.status("ws-b").await.unwrap().udid, "phone-a");
}

#[tokio::test]
async fn shutdown_our_claim_stops_helper_without_kill_then_vm() {
    let hooks = ready_hooks();
    let (dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-a",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let pid = svc.status("ws-a").await.unwrap().pid;
    svc.shutdown("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap();
    assert!(svc.status("ws-a").await.is_none());
    assert!(hooks.killed.lock().unwrap().contains(&pid));
    assert_eq!(hooks.call_count(HostOp::ShutdownIos), 1);
    assert!(hooks
        .argv_joined()
        .iter()
        .all(|line| !line.contains("--kill") && !line.split_whitespace().any(|tok| tok == "-k")));
    assert!(load_claims(&dir.path().join("state/simulator")).is_empty());
}

#[tokio::test]
async fn shutdown_foreign_claim_is_refused() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-b",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let pid = svc.status("ws-b").await.unwrap().pid;
    let err = svc
        .shutdown("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap_err();
    assert_eq!(err.reason, SimulatorReason::DeviceAlreadyClaimed);
    assert_eq!(svc.status("ws-b").await.unwrap().pid, pid);
    assert_eq!(hooks.call_count(HostOp::ShutdownIos), 0);
}

#[tokio::test]
async fn stop_preview_does_not_shutdown_vm() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-a",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let pid = svc.status("ws-a").await.unwrap().pid;
    svc.stop("ws-a").await.unwrap();
    assert!(svc.status("ws-a").await.is_none());
    assert!(hooks.killed.lock().unwrap().contains(&pid));
    assert_eq!(hooks.call_count(HostOp::ShutdownIos), 0);
    assert_eq!(hooks.call_count(HostOp::ShutdownAndroid), 0);
    assert_eq!(hooks.call_count(HostOp::SpawnEmulator), 0);
}

#[tokio::test]
async fn delete_unclaimed_shuts_down_then_deletes() {
    let hooks = ready_hooks();
    hooks.android.lock().unwrap().devices = vec![avd("Pixel_8", BootState::Booted)];
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.delete("ws-a", "Pixel_8", DevicePlatform::Android)
        .await
        .unwrap();
    let ops: Vec<HostOp> = hooks
        .calls
        .lock()
        .unwrap()
        .iter()
        .map(|call| call.op)
        .collect();
    let shutdown_at = ops.iter().position(|op| *op == HostOp::ShutdownAndroid);
    let delete_at = ops.iter().position(|op| *op == HostOp::DeleteAndroid);
    assert!(shutdown_at.is_some() && delete_at.is_some(), "{ops:?}");
    assert!(shutdown_at < delete_at);
    assert!(hooks
        .argv_joined()
        .iter()
        .any(|line| line.contains("delete avd --name Pixel_8")));
    assert!(!hooks
        .android
        .lock()
        .unwrap()
        .devices
        .iter()
        .any(|device| device.id == "Pixel_8"));
}

#[tokio::test]
async fn delete_foreign_claim_is_refused() {
    let hooks = ready_hooks();
    let (_dir, svc) = service(Arc::clone(&hooks));
    svc.start(
        "ws-b",
        Some(DevicePlatform::Ios),
        Some("phone-a"),
        |_, _, _| {},
    )
    .await
    .unwrap();
    let pid = svc.status("ws-b").await.unwrap().pid;
    let err = svc
        .delete("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap_err();
    assert_eq!(err.reason, SimulatorReason::DeviceAlreadyClaimed);
    assert_eq!(hooks.call_count(HostOp::DeleteIos), 0);
    assert_eq!(svc.status("ws-b").await.unwrap().pid, pid);
}

#[tokio::test]
async fn start_shutdown_android_boots_once_then_attaches_serial() {
    let hooks = ready_hooks();
    let (dir, svc) = service(Arc::clone(&hooks));
    let result = svc
        .start(
            "ws-a",
            Some(DevicePlatform::Android),
            Some("Pixel_8"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    assert!(result.ready);
    assert_eq!(hooks.qemu_count.load(Ordering::SeqCst), 1);
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), 1);
    let qemu = hooks
        .calls
        .lock()
        .unwrap()
        .iter()
        .find(|call| call.op == HostOp::SpawnEmulator)
        .cloned()
        .unwrap();
    assert!(qemu.argv.iter().any(|arg| arg == "-no-window"));
    assert!(qemu
        .argv
        .iter()
        .any(|arg| arg.starts_with("imagefile:") && arg.contains("-front.png")));
    assert!(qemu
        .argv
        .iter()
        .any(|arg| arg.starts_with("imagefile:") && arg.contains("-back.png")));
    let spec = hooks.last_spawn.lock().unwrap().clone().unwrap();
    assert!(spec.android_serial);
    assert!(spec.argv_device.starts_with("emulator-"));
    assert_ne!(spec.argv_device, "Pixel_8");
    let helper = helper_args(spec.kind, spec.port, &spec.argv_device, spec.android_serial);
    assert!(helper
        .windows(2)
        .any(|w| w[0] == "-s" && w[1] == spec.argv_device));
    assert!(!helper.iter().any(|arg| arg == "--avd"));
    assert!(!args_contain_global_kill(&helper));
    let serial = spec.argv_device;
    let camera_dir = dir.path().join("state/simulator/camera");
    assert_eq!(
        std::fs::read(camera_feed_path(&camera_dir, &serial, CameraLens::Front)).unwrap(),
        CAMERA_PLACEHOLDER_PNG
    );
    assert_eq!(
        std::fs::read(camera_feed_path(&camera_dir, &serial, CameraLens::Back)).unwrap(),
        CAMERA_PLACEHOLDER_PNG
    );
}

#[tokio::test]
async fn already_booted_and_shutdown_are_success() {
    let hooks = ready_hooks();
    hooks.ios.lock().unwrap().devices = vec![
        iphone("phone-a", BootState::Booted),
        iphone("phone-b", BootState::Shutdown),
    ];
    *hooks.boot_ios_stderr.lock().unwrap() =
        Some("Unable to boot device in current state: Booted".into());
    *hooks.shutdown_ios_stderr.lock().unwrap() =
        Some("Unable to shutdown device in current state: Shutdown".into());
    let (_dir, svc) = service(Arc::clone(&hooks));
    let booted = svc
        .boot("ws-a", "phone-a", DevicePlatform::Ios)
        .await
        .unwrap();
    assert_eq!(booted.state, "Booted");
    let shutdown = svc
        .shutdown("ws-a", "phone-b", DevicePlatform::Ios)
        .await
        .unwrap();
    assert_eq!(shutdown.state, "Shutdown");
}
