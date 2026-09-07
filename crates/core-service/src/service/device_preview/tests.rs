use std::sync::Arc;

use core_engine::{BootState, DevicePlatform, HostDevice};
use tempfile::TempDir;

use super::fake::FakeHooks;
use super::paths::DevicePreviewPaths;
use super::persist::load_claims;
use super::service::DevicePreviewService;
use super::types::{HelperKind, SimulatorReason};

fn iphone(id: &str, boot: BootState) -> HostDevice {
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

fn avd(id: &str, boot: BootState) -> HostDevice {
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

fn service(hooks: Arc<FakeHooks>) -> (TempDir, DevicePreviewService) {
    let dir = TempDir::new().unwrap();
    let paths = DevicePreviewPaths::isolated(dir.path());
    let svc = DevicePreviewService::with_hooks(paths, hooks).unwrap();
    (dir, svc)
}

fn ready_hooks() -> Arc<FakeHooks> {
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
