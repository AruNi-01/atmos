//! Local iOS Simulator helper (APP-060).
//!
//! Runs only in the Atmos Server process. Web and Desktop both drive it over
//! `/ws`. Hosted cloud API has no Xcode — probe returns a setup reason.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use runtime_manager::{atmos_home_dir, serve_sim_runtime_dir, simulator_state_dir};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const PIN_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/simulator/serve-sim-requirement.json"
));

#[derive(Debug, Clone, Deserialize)]
pub struct ServeSimPin {
    pub version: String,
    pub minos: String,
    pub asset: String,
    pub sha256: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
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
}

#[derive(Debug, Clone, Serialize)]
pub struct SimulatorDevice {
    pub udid: String,
    pub name: String,
    pub runtime: String,
    pub state: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimulatorProbe {
    pub ready: bool,
    pub reason: SimulatorReason,
    pub platform: String,
    pub arch: String,
    pub macos_version: Option<String>,
    pub xcode: bool,
    pub simctl: bool,
    pub devices: Vec<SimulatorDevice>,
    pub helper_installed: bool,
    pub helper_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimulatorClaim {
    pub workspace_id: String,
    pub pid: u32,
    pub port: u16,
    pub udid: String,
    pub url: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimulatorStartResult {
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<SimulatorReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udid: Option<String>,
    #[serde(flatten)]
    pub probe: SimulatorProbe,
}

struct Running {
    child: Child,
    claim: SimulatorClaim,
}

pub struct SimulatorRuntime {
    pin: ServeSimPin,
    running: Mutex<HashMap<String, Running>>,
}

impl Default for SimulatorRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl SimulatorRuntime {
    pub fn new() -> Self {
        let pin: ServeSimPin = serde_json::from_str(PIN_JSON).expect("serve-sim pin must parse");
        Self {
            pin,
            running: Mutex::new(HashMap::new()),
        }
    }

    pub fn probe(&self) -> SimulatorProbe {
        probe(&self.pin)
    }

    pub async fn start(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        mut on_progress: impl FnMut(u64, Option<u64>) + Send,
    ) -> Result<SimulatorStartResult, String> {
        let mut probe = self.probe();
        if probe.reason == SimulatorReason::HelperMissing {
            if let Err(err) = download_and_install(&self.pin, &mut on_progress).await {
                let reason = if err.contains("checksum") {
                    SimulatorReason::ChecksumMismatch
                } else {
                    SimulatorReason::DownloadFailed
                };
                probe.reason = reason.clone();
                probe.ready = false;
                return Ok(SimulatorStartResult {
                    ready: false,
                    reason: Some(reason),
                    url: None,
                    udid: None,
                    probe,
                });
            }
            probe = self.probe();
        }
        if probe.reason != SimulatorReason::Ok {
            return Ok(SimulatorStartResult {
                ready: false,
                reason: Some(probe.reason.clone()),
                url: None,
                udid: None,
                probe,
            });
        }

        let reusable = {
            let mut guard = self.running.lock().await;
            guard.get_mut(workspace_id).map(|running| {
                let same_device = udid.map(|id| id == running.claim.udid).unwrap_or(true);
                (
                    same_device,
                    child_is_running(&mut running.child),
                    running.claim.clone(),
                )
            })
        };
        if let Some((same_device, child_alive, claim)) = reusable {
            if same_device && child_alive && port_is_open(claim.port).await {
                return Ok(ready_result(claim, probe));
            }
        }

        let evicted = {
            let mut guard = self.running.lock().await;
            let claimed: HashSet<String> = guard
                .iter()
                .filter(|(id, _)| id.as_str() != workspace_id)
                .map(|(_, running)| running.claim.udid.clone())
                .collect();
            let Some(device) = pick_device(&probe.devices, udid, &claimed) else {
                return Ok(SimulatorStartResult {
                    ready: false,
                    reason: Some(SimulatorReason::NoDevice),
                    url: None,
                    udid: None,
                    probe,
                });
            };
            let evicted = guard.remove(workspace_id);
            (device.udid.clone(), evicted)
        };
        let (device_udid, evicted) = evicted;
        if let Some(mut prev) = evicted {
            let _ = prev.child.start_kill();
        }
        let device = probe
            .devices
            .iter()
            .find(|d| d.udid == device_udid)
            .ok_or_else(|| "No available iOS Simulator".to_string())?;

        kill_leftover_helpers(&device.udid).await;
        background_simulator_app().await;
        let port = reserve_loopback_port().await?;
        let install = install_dir(&self.pin.version)?;
        let binary = install.join("serve-sim");
        let mut child = Command::new(&binary)
            .args(serve_sim_args(port, &device.udid))
            .current_dir(&install)
            .kill_on_drop(true)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to start serve-sim: {e}"))?;

        if wait_until_listening(&mut child, port).await.is_err() {
            let _ = child.start_kill();
            probe.reason = SimulatorReason::StartFailed;
            probe.ready = false;
            return Ok(SimulatorStartResult {
                ready: false,
                reason: Some(SimulatorReason::StartFailed),
                url: None,
                udid: None,
                probe,
            });
        }
        background_simulator_app().await;

        let url = claim_preview_url(port, &device.udid);
        let claim = SimulatorClaim {
            workspace_id: workspace_id.to_string(),
            pid: child.id().unwrap_or(0),
            port,
            udid: device.udid.clone(),
            url: url.clone(),
            version: self.pin.version.clone(),
        };
        {
            let mut guard = self.running.lock().await;
            guard.insert(
                workspace_id.to_string(),
                Running {
                    child,
                    claim: claim.clone(),
                },
            );
            persist_claims(guard.values().map(|running| &running.claim))?;
        }
        Ok(ready_result(claim, probe))
    }

    pub async fn stop(&self, workspace_id: &str) -> Result<(), String> {
        let mut running = {
            let mut guard = self.running.lock().await;
            let running = guard.remove(workspace_id);
            persist_claims(guard.values().map(|item| &item.claim))?;
            running
        };
        if let Some(running) = running.as_mut() {
            let _ = running.child.start_kill();
            let _ = running.child.wait().await;
        }
        Ok(())
    }

    pub async fn status(&self, workspace_id: &str) -> Option<SimulatorClaim> {
        let claim = {
            let mut guard = self.running.lock().await;
            let running = guard.get_mut(workspace_id)?;
            if !child_is_running(&mut running.child) {
                drop(guard);
                let _ = self.stop(workspace_id).await;
                return None;
            }
            running.claim.clone()
        };
        if port_is_open(claim.port).await {
            return Some(claim);
        }
        let _ = self.stop(workspace_id).await;
        None
    }
}

fn ready_result(claim: SimulatorClaim, probe: SimulatorProbe) -> SimulatorStartResult {
    SimulatorStartResult {
        ready: true,
        reason: Some(SimulatorReason::Ok),
        url: Some(claim.url),
        udid: Some(claim.udid),
        probe,
    }
}

fn install_dir(version: &str) -> Result<PathBuf, String> {
    Ok(serve_sim_runtime_dir()?.join(version))
}

fn helper_installed(pin: &ServeSimPin) -> bool {
    let Ok(dir) = install_dir(&pin.version) else {
        return false;
    };
    dir.join("serve-sim").is_file()
        && dir.join("native/serve-sim-native.node").is_file()
        && dir
            .join("bin/LiveKitWebRTC.framework/LiveKitWebRTC")
            .is_file()
}

fn probe(pin: &ServeSimPin) -> SimulatorProbe {
    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let macos_version = if cfg!(target_os = "macos") {
        parse_macos_version(&run_capture("sw_vers", &[]).unwrap_or_default())
    } else {
        None
    };
    let xcode = run_capture("xcodebuild", &["-version"]).is_some_and(|s| s.contains("Xcode"));
    let simctl_out = run_capture("xcrun", &["simctl", "list", "devices", "-j"]);
    let devices = simctl_out
        .as_deref()
        .map(parse_simctl_devices)
        .unwrap_or_default();
    let installed = helper_installed(pin);
    let reason = probe_reason(
        &platform,
        &arch,
        macos_version.as_deref(),
        xcode,
        simctl_out.is_some(),
        &devices,
        installed,
        pin,
    );
    SimulatorProbe {
        ready: reason == SimulatorReason::Ok,
        reason,
        platform,
        arch,
        macos_version,
        xcode,
        simctl: simctl_out.is_some(),
        devices,
        helper_installed: installed,
        helper_version: pin.version.clone(),
    }
}

#[allow(clippy::too_many_arguments)]
fn probe_reason(
    platform: &str,
    arch: &str,
    macos_version: Option<&str>,
    xcode: bool,
    simctl: bool,
    devices: &[SimulatorDevice],
    installed: bool,
    pin: &ServeSimPin,
) -> SimulatorReason {
    if platform != "macos" {
        return SimulatorReason::UnsupportedPlatform;
    }
    if arch != "aarch64" {
        return SimulatorReason::UnsupportedArch;
    }
    match macos_version {
        Some(v) if compare_dotted(v, &pin.minos) >= 0 => {}
        _ => return SimulatorReason::MacosTooOld,
    }
    if !xcode {
        return SimulatorReason::XcodeMissing;
    }
    if !simctl {
        return SimulatorReason::SimctlMissing;
    }
    let available = devices.iter().any(|d| d.available);
    if !available {
        return if devices.is_empty() {
            SimulatorReason::NoRuntime
        } else {
            SimulatorReason::NoDevice
        };
    }
    if !installed {
        return SimulatorReason::HelperMissing;
    }
    SimulatorReason::Ok
}

fn pick_device<'a>(
    devices: &'a [SimulatorDevice],
    udid: Option<&str>,
    claimed: &HashSet<String>,
) -> Option<&'a SimulatorDevice> {
    let free = |device: &&SimulatorDevice| device.available && !claimed.contains(&device.udid);
    if let Some(udid) = udid {
        return devices
            .iter()
            .find(|device| device.udid == udid && free(device));
    }
    devices
        .iter()
        .find(|device| free(device) && device.name.starts_with("iPhone"))
        .or_else(|| devices.iter().find(free))
}

fn parse_macos_version(sw_vers: &str) -> Option<String> {
    sw_vers.lines().find_map(|line| {
        let rest = line.strip_prefix("ProductVersion:")?.trim();
        if rest.is_empty() {
            None
        } else {
            Some(rest.to_string())
        }
    })
}

fn compare_dotted(a: &str, b: &str) -> i32 {
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

fn parse_simctl_devices(json_text: &str) -> Vec<SimulatorDevice> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json_text) else {
        return Vec::new();
    };
    let Some(runtimes) = value.get("devices").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (runtime, devices) in runtimes {
        if !runtime.contains("SimRuntime.iOS-") && !runtime.contains("SimRuntime.iOS_") {
            // simctl keys look like com.apple.CoreSimulator.SimRuntime.iOS-18-0
            if !runtime.contains("iOS") {
                continue;
            }
        }
        let Some(list) = devices.as_array() else {
            continue;
        };
        for device in list {
            let Some(udid) = device.get("udid").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(name) = device.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            out.push(SimulatorDevice {
                udid: udid.to_string(),
                name: name.to_string(),
                runtime: runtime.clone(),
                state: device
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                available: device
                    .get("isAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true),
            });
        }
    }
    out
}

fn run_capture(cmd: &str, args: &[&str]) -> Option<String> {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}

async fn reserve_loopback_port() -> Result<u16, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn child_is_running(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

async fn port_is_open(port: u16) -> bool {
    tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .is_ok()
}

async fn wait_until_listening(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(45);
    loop {
        if !child_is_running(child) {
            return Err("serve-sim exited before the preview port opened".into());
        }
        if port_is_open(port).await {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("serve-sim did not bind the preview port".into());
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

async fn kill_leftover_helpers(udid: &str) {
    let Ok(output) = Command::new("pgrep")
        .args(["-lf", "serve-sim"])
        .output()
        .await
    else {
        return;
    };
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if !line.contains(udid) {
            continue;
        }
        let Some(pid) = line.split_whitespace().next() else {
            continue;
        };
        let _ = Command::new("kill").arg(pid).status().await;
    }
}

fn claim_preview_url(port: u16, udid: &str) -> String {
    preview_url(&format!("http://127.0.0.1:{port}"), port, udid)
}

fn preview_url(url: &str, port: u16, udid: &str) -> String {
    let base = if url.contains("127.0.0.1") || url.contains("localhost") {
        url.trim_end_matches('/').to_string()
    } else {
        format!("http://127.0.0.1:{port}")
    };
    if base.contains("device=") {
        base
    } else if base.contains('?') {
        format!("{base}&device={udid}")
    } else {
        format!("{base}/?device={udid}")
    }
}

fn serve_sim_args(port: u16, udid: &str) -> Vec<String> {
    vec![
        "--host".into(),
        "127.0.0.1".into(),
        "-p".into(),
        port.to_string(),
        udid.into(),
    ]
}

async fn background_simulator_app() {
    let _ = Command::new("osascript")
        .args([
            "-e",
            r#"tell application "System Events" to if exists process "Simulator" then set frontmost of process "Simulator" to false"#,
        ])
        .status()
        .await;
}

fn cache_dir() -> Result<PathBuf, String> {
    Ok(atmos_home_dir()?.join("cache").join("serve-sim"))
}

fn manifest_url(pin: &ServeSimPin) -> String {
    pin.download_url
        .rsplit_once('/')
        .map(|(base, _)| format!("{base}/manifest.json"))
        .unwrap_or_else(|| pin.download_url.clone())
}

async fn resolve_sha256(client: &reqwest::Client, pin: &ServeSimPin) -> Result<String, String> {
    if let Ok(res) = client.get(manifest_url(pin)).send().await {
        if res.status().is_success() {
            if let Ok(value) = res.json::<serde_json::Value>().await {
                if let Some(sha) = value.get("sha256").and_then(|v| v.as_str()) {
                    if sha.len() == 64 {
                        return Ok(sha.to_string());
                    }
                }
            }
        }
    }
    if pin.sha256.len() == 64 {
        return Ok(pin.sha256.clone());
    }
    Err(
        "serve-sim pin has no sha256; publish a Release or run just pack-serve-sim --install"
            .into(),
    )
}

async fn download_and_install(
    pin: &ServeSimPin,
    on_progress: &mut (impl FnMut(u64, Option<u64>) + Send),
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("atmos-api")
        .build()
        .map_err(|e| e.to_string())?;
    let expected = resolve_sha256(&client, pin).await?;
    let cache = cache_dir()?;
    tokio::fs::create_dir_all(&cache)
        .await
        .map_err(|e| e.to_string())?;
    let archive = cache.join(&pin.asset);
    let response = client
        .get(&pin.download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let total = response.content_length();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    on_progress(bytes.len() as u64, total);
    let actual = hex_sha256(&bytes);
    if !actual.eq_ignore_ascii_case(&expected) {
        return Err(format!(
            "serve-sim checksum mismatch (expected {expected}, got {actual})"
        ));
    }
    let mut file = tokio::fs::File::create(&archive)
        .await
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).await.map_err(|e| e.to_string())?;
    file.flush().await.map_err(|e| e.to_string())?;

    let status = Command::new("tar")
        .args([
            "-xzf",
            &archive.to_string_lossy(),
            "-C",
            &cache.to_string_lossy(),
        ])
        .status()
        .await
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("failed to extract serve-sim archive".into());
    }
    let extracted = cache.join(format!("serve-sim-{}-darwin-arm64", pin.version));
    let dest = install_dir(&pin.version)?;
    if dest.exists() {
        tokio::fs::remove_dir_all(&dest)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::create_dir_all(dest.parent().unwrap_or(Path::new(".")))
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::rename(&extracted, &dest)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn persist_claims<'a>(claims: impl IntoIterator<Item = &'a SimulatorClaim>) -> Result<(), String> {
    let dir = simulator_state_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("claims.json");
    let claims: Vec<&SimulatorClaim> = claims.into_iter().collect();
    if claims.is_empty() {
        let _ = std::fs::remove_file(path);
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&claims).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sw_vers_and_compares_minos() {
        assert_eq!(
            parse_macos_version("ProductName:\tmacOS\nProductVersion:\t15.5\n"),
            Some("15.5".into())
        );
        assert!(compare_dotted("15.0", "14.0") > 0);
        assert!(compare_dotted("13.0", "14.0") < 0);
    }

    #[test]
    fn parses_ios_devices_only() {
        let json = r#"{
          "devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
              {"udid":"AAA","name":"iPhone 16","state":"Booted","isAvailable":true}
            ],
            "com.apple.CoreSimulator.SimRuntime.watchOS-11-0": [
              {"udid":"W","name":"Watch","state":"Shutdown","isAvailable":true}
            ]
          }
        }"#;
        let devices = parse_simctl_devices(json);
        assert_eq!(
            devices.iter().map(|d| d.udid.as_str()).collect::<Vec<_>>(),
            ["AAA"]
        );
    }

    #[test]
    fn probe_maps_host_gaps() {
        let pin: ServeSimPin = serde_json::from_str(PIN_JSON).unwrap();
        let iphone = vec![SimulatorDevice {
            udid: "u".into(),
            name: "iPhone 16".into(),
            runtime: "ios".into(),
            state: "Shutdown".into(),
            available: true,
        }];
        assert_eq!(
            probe_reason(
                "linux",
                "aarch64",
                Some("15.0"),
                true,
                true,
                &iphone,
                true,
                &pin
            ),
            SimulatorReason::UnsupportedPlatform
        );
        assert_eq!(
            probe_reason(
                "macos",
                "x86_64",
                Some("15.0"),
                true,
                true,
                &iphone,
                true,
                &pin
            ),
            SimulatorReason::UnsupportedArch
        );
        assert_eq!(
            probe_reason(
                "macos",
                "aarch64",
                Some("13.0"),
                true,
                true,
                &iphone,
                true,
                &pin
            ),
            SimulatorReason::MacosTooOld
        );
        assert_eq!(
            probe_reason(
                "macos",
                "aarch64",
                Some("15.0"),
                false,
                true,
                &iphone,
                true,
                &pin
            ),
            SimulatorReason::XcodeMissing
        );
        assert_eq!(
            probe_reason(
                "macos",
                "aarch64",
                Some("15.0"),
                true,
                true,
                &[],
                true,
                &pin
            ),
            SimulatorReason::NoRuntime
        );
        assert_eq!(
            probe_reason(
                "macos",
                "aarch64",
                Some("15.0"),
                true,
                true,
                &iphone,
                false,
                &pin
            ),
            SimulatorReason::HelperMissing
        );
        assert_eq!(
            probe_reason(
                "macos",
                "aarch64",
                Some("15.0"),
                true,
                true,
                &iphone,
                true,
                &pin
            ),
            SimulatorReason::Ok
        );
    }

    #[test]
    fn preview_url_forces_loopback_and_device() {
        let url = preview_url("http://0.0.0.0:3200", 3200, "UDID");
        assert!(url.contains("127.0.0.1"));
        assert!(url.contains("device=UDID"));
    }

    #[test]
    fn claim_preview_url_uses_the_reserved_port() {
        assert_eq!(
            claim_preview_url(54675, "B3CE3FD6-769B-48A3-B0F7-5933C74D1E39"),
            "http://127.0.0.1:54675/?device=B3CE3FD6-769B-48A3-B0F7-5933C74D1E39"
        );
    }

    #[tokio::test]
    async fn port_is_open_matches_a_live_loopback_listener() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(port_is_open(port).await);
        drop(listener);
        assert!(!port_is_open(port).await);
    }

    #[test]
    fn serve_sim_args_are_host_port_and_device() {
        let args = serve_sim_args(3200, "UDID");
        assert_eq!(args, vec!["--host", "127.0.0.1", "-p", "3200", "UDID"]);
    }

    #[test]
    fn pick_device_skips_udids_claimed_by_other_contexts() {
        let devices = vec![
            SimulatorDevice {
                udid: "phone-a".into(),
                name: "iPhone 16".into(),
                runtime: "ios".into(),
                state: "Shutdown".into(),
                available: true,
            },
            SimulatorDevice {
                udid: "phone-b".into(),
                name: "iPhone 17".into(),
                runtime: "ios".into(),
                state: "Shutdown".into(),
                available: true,
            },
        ];
        let claimed = HashSet::from(["phone-a".into()]);
        assert_eq!(
            pick_device(&devices, None, &claimed).map(|d| d.udid.as_str()),
            Some("phone-b")
        );
        assert!(pick_device(&devices, Some("phone-a"), &claimed).is_none());
        assert_eq!(
            pick_device(&devices, Some("phone-b"), &claimed).map(|d| d.udid.as_str()),
            Some("phone-b")
        );
    }

    #[test]
    fn pin_is_github_not_r2() {
        let pin: ServeSimPin = serde_json::from_str(PIN_JSON).unwrap();
        assert!(pin
            .download_url
            .contains("github.com/AruNi-01/atmos/releases"));
        assert!(!pin.download_url.contains("r2"));
    }
}
