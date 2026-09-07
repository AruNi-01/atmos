use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;

use core_engine::DevicePlatform;
use tokio::net::TcpListener as TokioTcpListener;

use super::control::{
    ClaimOwner, DeviceControlError, DeviceControlService, MapClaimOwnerLookup, PressKey,
};
use super::paths::DevicePreviewPaths;
use super::persist::persist_claims;
use super::service::DevicePreviewService;
use super::tests::{ready_hooks, service};
use super::types::{DeviceClaim, HelperKind};

const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

fn control(preview: DevicePreviewService) -> DeviceControlService {
    DeviceControlService::new(Arc::new(preview), Arc::new(MapClaimOwnerLookup::new()))
}

fn control_with_owners(
    preview: DevicePreviewService,
    owners: MapClaimOwnerLookup,
) -> DeviceControlService {
    DeviceControlService::new(Arc::new(preview), Arc::new(owners))
}

fn spawn_png_http() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind png http");
    let port = listener.local_addr().expect("addr").port();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else {
                continue;
            };
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                TINY_PNG.len()
            );
            let _ = stream.write_all(header.as_bytes());
            let _ = stream.write_all(TINY_PNG);
        }
    });
    port
}

#[tokio::test]
async fn no_claim_does_not_spawn() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    let control = control(preview);
    let err = control.tap("ws-a", None, None, 0.5, 0.5).await.unwrap_err();
    assert_eq!(err, DeviceControlError::NoClaim);
    assert_eq!(err.code(), "NO_CLAIM");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn two_workspaces_cannot_drive_each_other() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    preview
        .start(
            "ws-a",
            Some(DevicePlatform::Ios),
            Some("phone-a"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    preview
        .start(
            "ws-b",
            Some(DevicePlatform::Android),
            Some("Pixel_8"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    let spawned = hooks.spawn_count.load(Ordering::SeqCst);
    let control = control(preview);
    let b = control.resolve_target("ws-b", None, None).await.unwrap();
    let err = control
        .tap("ws-a", Some(&b.udid), None, 0.5, 0.5)
        .await
        .unwrap_err();
    assert_eq!(
        err,
        DeviceControlError::ClaimedByOtherWorkspace {
            udid: b.udid,
            owner_workspace_id: "ws-b".into(),
        }
    );
    assert_eq!(err.code(), "CLAIMED_BY_OTHER_WORKSPACE");
    let mismatch = control
        .tap("ws-a", None, Some(DevicePlatform::Android), 0.5, 0.5)
        .await
        .unwrap_err();
    assert!(matches!(
        mismatch,
        DeviceControlError::PlatformMismatch {
            requested: DevicePlatform::Android,
            actual: DevicePlatform::Ios,
            ..
        }
    ));
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), spawned);
}

#[tokio::test]
async fn unknown_udid_is_device_unknown() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let spawned = hooks.spawn_count.load(Ordering::SeqCst);
    let control = control(preview);
    let err = control
        .tap("ws-a", Some("missing-udid"), None, 0.5, 0.5)
        .await
        .unwrap_err();
    assert_eq!(
        err,
        DeviceControlError::DeviceUnknown {
            udid: "missing-udid".into()
        }
    );
    assert_eq!(err.code(), "DEVICE_UNKNOWN");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), spawned);
}

#[tokio::test]
async fn other_workspace_udid_is_claimed_by_other() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    preview
        .start(
            "ws-b",
            Some(DevicePlatform::Ios),
            Some("phone-b"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    let spawned = hooks.spawn_count.load(Ordering::SeqCst);
    let control = control(preview);
    let err = control
        .tap("ws-a", Some("phone-b"), None, 0.5, 0.5)
        .await
        .unwrap_err();
    assert_eq!(
        err,
        DeviceControlError::ClaimedByOtherWorkspace {
            udid: "phone-b".into(),
            owner_workspace_id: "ws-b".into(),
        }
    );
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), spawned);
}

#[tokio::test]
async fn ios_press_back_does_not_spawn() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    preview
        .start(
            "ws-a",
            Some(DevicePlatform::Ios),
            Some("phone-a"),
            |_, _, _| {},
        )
        .await
        .unwrap();
    let spawned = hooks.spawn_count.load(Ordering::SeqCst);
    let control = control(preview);
    let err = control
        .press("ws-a", None, None, PressKey::Back)
        .await
        .unwrap_err();
    assert_eq!(
        err,
        DeviceControlError::UnsupportedOnPlatform {
            key: PressKey::Back,
            platform: DevicePlatform::Ios,
        }
    );
    assert_eq!(err.code(), "UNSUPPORTED_ON_PLATFORM");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), spawned);
}

#[tokio::test]
async fn list_joins_workspace_and_project_names() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(hooks);
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let mut owners = MapClaimOwnerLookup::new();
    owners.insert(
        "ws-a",
        ClaimOwner {
            workspace_name: "Feature login".into(),
            project_id: "proj_1".into(),
            project_name: "My App".into(),
        },
    );
    let control = control_with_owners(preview, owners);
    let list = control.list(Some("ws-a")).await;
    assert_eq!(list.devices.len(), 1);
    let item = &list.devices[0];
    assert_eq!(item.udid, "phone-a");
    assert_eq!(item.name, "iPhone phone-a");
    assert_eq!(item.platform, DevicePlatform::Ios);
    assert_eq!(item.helper, HelperKind::ServeSim);
    assert_eq!(item.workspace_id, "ws-a");
    assert_eq!(item.workspace_name, "Feature login");
    assert_eq!(item.project_id, "proj_1");
    assert_eq!(item.project_name, "My App");
    assert!(item.current);
    let encoded = serde_json::to_string(item).unwrap();
    assert!(!encoded.contains("url"));
    assert!(!encoded.contains("port"));
}

#[tokio::test]
async fn invalid_coords_do_not_spawn() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(Arc::clone(&hooks));
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let spawned = hooks.spawn_count.load(Ordering::SeqCst);
    let control = control(preview);
    let err = control.tap("ws-a", None, None, 1.5, 0.5).await.unwrap_err();
    assert_eq!(err, DeviceControlError::InvalidCoords);
    assert_eq!(err.code(), "INVALID_COORDS");
    assert_eq!(hooks.spawn_count.load(Ordering::SeqCst), spawned);
}

#[tokio::test]
async fn screenshot_result_is_path_not_base64() {
    let http_port = spawn_png_http();
    let hooks = ready_hooks();
    let dummy = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    hooks.listeners.lock().unwrap().insert(4242, dummy);
    let dir = tempfile::TempDir::new().unwrap();
    let paths = DevicePreviewPaths::isolated(dir.path());
    persist_claims(
        &paths.state_dir,
        &[DeviceClaim {
            workspace_id: "ws-a".into(),
            pid: 4242,
            port: http_port,
            udid: "Pixel_8".into(),
            name: "Pixel 8".into(),
            argv_id: "emulator-5554".into(),
            url: format!("http://127.0.0.1:{http_port}/?device=Pixel_8"),
            version: "test".into(),
            platform: DevicePlatform::Android,
            helper: HelperKind::ServeEmu,
        }],
    )
    .unwrap();
    let preview = DevicePreviewService::with_hooks(paths.clone(), hooks).unwrap();
    let control = control(preview);
    let result = control
        .screenshot("ws-a", Some("Pixel_8"), None, None)
        .await
        .unwrap();
    assert_eq!(result.width, 1);
    assert_eq!(result.height, 1);
    assert_eq!(result.udid, "Pixel_8");
    assert_eq!(result.name, "Pixel 8");
    assert_eq!(result.platform, DevicePlatform::Android);
    assert_eq!(result.helper, HelperKind::ServeEmu);
    assert!(
        result.path.contains("/tmp/device-preview/ws-a/screenshot-"),
        "{}",
        result.path
    );
    assert!(result.path.ends_with(".png"), "{}", result.path);
    assert!(!result.path.contains("base64"));
    assert!(!result.path.contains("data:image"));
    let bytes = std::fs::read(&result.path).unwrap();
    assert_eq!(bytes, TINY_PNG);
    assert_eq!(bytes[0], 0x89);
}

#[tokio::test]
async fn start_persists_device_name_and_old_claims_fill_from_probe() {
    let hooks = ready_hooks();
    let (dir, preview) = service(Arc::clone(&hooks));
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let claim = preview.status("ws-a").await.unwrap();
    assert_eq!(claim.name, "iPhone phone-a");
    drop(preview);

    let dummy = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = dummy.local_addr().unwrap().port();
    hooks.listeners.lock().unwrap().insert(9001, dummy);
    let paths = DevicePreviewPaths::isolated(dir.path());
    persist_claims(
        &paths.state_dir,
        &[DeviceClaim {
            workspace_id: "ws-old".into(),
            pid: 9001,
            port,
            udid: "phone-b".into(),
            name: String::new(),
            argv_id: "phone-b".into(),
            url: format!("http://127.0.0.1:{port}/?device=phone-b"),
            version: "test".into(),
            platform: DevicePlatform::Ios,
            helper: HelperKind::ServeSim,
        }],
    )
    .unwrap();
    let restored = DevicePreviewService::with_hooks(paths, hooks).unwrap();
    let filled = restored.status("ws-old").await.unwrap();
    assert_eq!(filled.name, "iPhone phone-b");
}

#[tokio::test]
async fn empty_text_and_error_codes() {
    let hooks = ready_hooks();
    let (_dir, preview) = service(hooks);
    preview
        .start("ws-a", None, Some("phone-a"), |_, _, _| {})
        .await
        .unwrap();
    let control = control(preview);
    let err = control.type_text("ws-a", None, None, "").await.unwrap_err();
    assert_eq!(err, DeviceControlError::EmptyText);
    assert_eq!(err.code(), "EMPTY_TEXT");
    assert_eq!(
        DeviceControlError::AmbiguousDevice.code(),
        "AMBIGUOUS_DEVICE"
    );
    assert_eq!(
        DeviceControlError::HelperUnreachable("x".into()).code(),
        "HELPER_UNREACHABLE"
    );
    assert_eq!(
        DeviceControlError::PlatformMismatch {
            requested: DevicePlatform::Android,
            actual: DevicePlatform::Ios,
            udid: "u".into(),
        }
        .code(),
        "PLATFORM_MISMATCH"
    );
}
