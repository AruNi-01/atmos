use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use core_engine::{
    android_appearance_get, android_appearance_set, camera_feed_path, camera_wiring_matches,
    ios_appearance_get, ios_appearance_set, ios_boot_already_booted, ios_shutdown_already_shutdown,
    list_android_profiles, list_android_system_images, list_ios_runtimes, parse_emu_avd_name,
    resolve_android_toolchain_from, AndroidImage, AndroidProfile, AndroidToolchain, Appearance,
    CameraLens, DevicePlatform, IosRuntime,
};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};

use super::args::{args_contain_global_kill, helper_args};
use super::checksum::assert_checksum;
use super::hooks::{DevicePreviewHooks, EnsureError, SpawnSpec, SpawnedHelper};
use super::paths::DevicePreviewPaths;
use super::types::{HelperKind, HelperPin};

const ANDROID_BOOT_TIMEOUT: Duration = Duration::from_secs(180);
const ANDROID_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

pub struct ProductionHooks {
    pub paths: DevicePreviewPaths,
}

impl ProductionHooks {
    fn install_dir(&self, kind: HelperKind, version: &str) -> PathBuf {
        match kind {
            HelperKind::ServeSim => self.paths.serve_sim_runtime.join(version),
            HelperKind::ServeEmu => self.paths.serve_emu_runtime.join(version),
        }
    }

    fn cache_dir(&self, kind: HelperKind) -> PathBuf {
        match kind {
            HelperKind::ServeSim => self.paths.serve_sim_cache.clone(),
            HelperKind::ServeEmu => self.paths.serve_emu_cache.clone(),
        }
    }

    fn binary_name(kind: HelperKind) -> &'static str {
        match kind {
            HelperKind::ServeSim => "serve-sim",
            HelperKind::ServeEmu => "serve-emu",
        }
    }
}

#[async_trait]
impl DevicePreviewHooks for ProductionHooks {
    fn host_os(&self) -> String {
        std::env::consts::OS.to_string()
    }

    fn host_arch(&self) -> String {
        std::env::consts::ARCH.to_string()
    }

    fn macos_version(&self) -> Option<String> {
        if cfg!(target_os = "macos") {
            super::types::parse_macos_version(&run_capture("sw_vers", &[]).unwrap_or_default())
        } else {
            None
        }
    }

    fn ios_snapshot(&self) -> core_engine::IosSnapshot {
        core_engine::collect_ios_snapshot()
    }

    fn android_snapshot(&self) -> core_engine::AndroidSnapshot {
        core_engine::collect_android_snapshot()
    }

    fn helper_installed(&self, kind: HelperKind, version: &str) -> bool {
        helper_files_present(&self.install_dir(kind, version), kind)
    }

    async fn ensure_helper(
        &self,
        kind: HelperKind,
        pin: &HelperPin,
        on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
    ) -> Result<(), EnsureError> {
        download_and_install(
            kind,
            pin,
            &self.cache_dir(kind),
            &self.install_dir(kind, &pin.version),
            on_progress,
        )
        .await
    }

    async fn spawn(&self, spec: SpawnSpec) -> Result<SpawnedHelper, String> {
        let install = self.install_dir(spec.kind, &spec.version);
        let binary = install.join(Self::binary_name(spec.kind));
        let log_path = std::env::temp_dir().join(format!(
            "atmos-{}-{}.log",
            Self::binary_name(spec.kind),
            sanitize_id(&spec.device_id)
        ));
        let log_file = std::fs::File::create(&log_path).ok();
        let args = helper_args(spec.kind, spec.port, &spec.argv_device, spec.android_serial);
        if args_contain_global_kill(&args) {
            return Err("refusing to spawn a helper with a global kill flag".into());
        }
        let mut child = Command::new(&binary)
            .args(&args)
            .current_dir(&install)
            .kill_on_drop(true)
            .stdout(std::process::Stdio::null())
            .stderr(match log_file {
                Some(file) => std::process::Stdio::from(file),
                None => std::process::Stdio::null(),
            })
            .spawn()
            .map_err(|e| format!("failed to start {}: {e}", Self::binary_name(spec.kind)))?;
        if wait_until_listening(&mut child, spec.port).await.is_err() {
            let still_up = matches!(child.try_wait(), Ok(None)) && port_is_open(spec.port).await;
            if !still_up {
                let _ = child.start_kill();
                return Err(format!(
                    "{} did not bind the preview port",
                    Self::binary_name(spec.kind)
                ));
            }
        }
        let pid = child.id().unwrap_or(0);
        Ok(SpawnedHelper {
            pid,
            child: Some(child),
        })
    }

    async fn kill_pid(&self, pid: u32) {
        if pid == 0 {
            return;
        }
        let _ = Command::new("kill").arg(pid.to_string()).status().await;
    }

    fn pid_alive(&self, pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    async fn port_open(&self, port: u16) -> bool {
        port_is_open(port).await
    }

    async fn reserve_port(&self) -> Result<u16, String> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
    }

    async fn live_helper(&self, kind: HelperKind, device_ids: &[String]) -> Option<(u32, u16)> {
        live_helper(Self::binary_name(kind), device_ids).await
    }

    async fn kill_orphans(&self, kind: HelperKind, device_ids: &[String], keep_pids: &[u32]) {
        kill_orphans(Self::binary_name(kind), device_ids, keep_pids).await;
    }

    async fn hide_ios_simulator_app(&self) {
        let _ = Command::new("osascript")
            .args([
                "-e",
                r#"tell application "System Events" to if exists process "Simulator" then set frontmost of process "Simulator" to false"#,
            ])
            .status()
            .await;
    }

    fn ios_runtimes(&self) -> Vec<IosRuntime> {
        list_ios_runtimes()
    }

    fn android_profiles(&self) -> Vec<AndroidProfile> {
        list_android_profiles()
    }

    fn android_images(&self) -> Vec<AndroidImage> {
        list_android_system_images()
    }

    fn emulator_bin(&self) -> Option<PathBuf> {
        android_toolchain().emulator
    }

    async fn create_ios(&self, argv: &[String]) -> Result<String, String> {
        let output = run_xcrun_simctl(argv).await?;
        if !output.success {
            return Err(output.stderr);
        }
        let udid = output.stdout.trim().to_string();
        if udid.is_empty() {
            return Err("simctl create returned an empty udid".into());
        }
        Ok(udid)
    }

    async fn create_android(&self, argv: &[String]) -> Result<(), String> {
        let bin = android_toolchain()
            .avdmanager
            .ok_or_else(|| "avdmanager is missing".to_string())?;
        let output = run_bin(&bin, argv).await?;
        if !output.success {
            return Err(output.stderr);
        }
        Ok(())
    }

    async fn boot_ios(&self, argv: &[String]) -> Result<(), String> {
        let output = run_xcrun_simctl(argv).await?;
        ios_boot_status(output.success, &output.stderr)
    }

    async fn spawn_emulator(&self, argv: &[String]) -> Result<(), String> {
        let (bin, args) = argv
            .split_first()
            .ok_or_else(|| "empty emulator argv".to_string())?;
        let port = argv_flag(argv, "-port")
            .ok_or_else(|| "emulator argv missing -port".to_string())?
            .parse::<u16>()
            .map_err(|e| e.to_string())?;
        let serial = format!("emulator-{port}");
        let mut cmd = Command::new(bin);
        cmd.args(args)
            .kill_on_drop(false)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to start emulator: {e}"))?;
        let adb = android_toolchain()
            .adb
            .ok_or_else(|| "adb is missing".to_string())?;
        let deadline = Instant::now() + ANDROID_BOOT_TIMEOUT;
        loop {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("emulator exited ({status}): {}", argv.join(" ")));
            }
            if android_guest_ready(&adb, &serial).await {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!(
                    "emulator did not boot within {}s: {}",
                    ANDROID_BOOT_TIMEOUT.as_secs(),
                    argv.join(" ")
                ));
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    async fn shutdown_ios(&self, argv: &[String]) -> Result<(), String> {
        let output = run_xcrun_simctl(argv).await?;
        ios_shutdown_status(output.success, &output.stderr)
    }

    async fn shutdown_android(&self, argv: &[String]) -> Result<(), String> {
        let adb = android_toolchain()
            .adb
            .ok_or_else(|| "adb is missing".to_string())?;
        let serial = argv_flag(argv, "-s").ok_or_else(|| "missing -s".to_string())?;
        let output = run_bin(&adb, argv).await?;
        if !output.success
            && !output.stderr.to_ascii_lowercase().contains("not found")
            && !output.stdout.to_ascii_lowercase().contains("ok")
        {
            return Err(output.stderr);
        }
        let deadline = Instant::now() + ANDROID_SHUTDOWN_TIMEOUT;
        loop {
            if !adb_has_serial(&adb, &serial).await {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!("emulator {serial} did not leave adb devices"));
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    async fn delete_ios(&self, argv: &[String]) -> Result<(), String> {
        let output = run_xcrun_simctl(argv).await?;
        if !output.success {
            return Err(output.stderr);
        }
        Ok(())
    }

    async fn delete_android(&self, argv: &[String]) -> Result<(), String> {
        let bin = android_toolchain()
            .avdmanager
            .ok_or_else(|| "avdmanager is missing".to_string())?;
        let output = run_bin(&bin, argv).await?;
        if !output.success {
            return Err(output.stderr);
        }
        Ok(())
    }

    async fn appearance_get(
        &self,
        platform: DevicePlatform,
        id: &str,
    ) -> Result<Appearance, String> {
        let id = id.to_string();
        tokio::task::spawn_blocking(move || match platform {
            DevicePlatform::Ios => ios_appearance_get(&id).map_err(|e| e.to_string()),
            DevicePlatform::Android => android_appearance_get(&id).map_err(|e| e.to_string()),
        })
        .await
        .map_err(|e| e.to_string())?
    }

    async fn appearance_set(
        &self,
        platform: DevicePlatform,
        id: &str,
        appearance: Appearance,
    ) -> Result<(), String> {
        let id = id.to_string();
        tokio::task::spawn_blocking(move || match platform {
            DevicePlatform::Ios => ios_appearance_set(&id, appearance).map_err(|e| e.to_string()),
            DevicePlatform::Android => {
                android_appearance_set(&id, appearance).map_err(|e| e.to_string())
            }
        })
        .await
        .map_err(|e| e.to_string())?
    }

    fn camera_wired(&self, serial: &str) -> bool {
        if !serial.starts_with("emulator-") {
            return false;
        }
        let Some(adb) = android_toolchain().adb else {
            return false;
        };
        let output = std::process::Command::new(&adb)
            .args(["-s", serial, "emu", "avd", "path"])
            .output()
            .ok();
        let Some(output) = output.filter(|o| o.status.success()) else {
            return false;
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let Some(avd_path) = parse_emu_avd_name(&stdout) else {
            return false;
        };
        let ini_path = PathBuf::from(&avd_path).join("hardware-qemu.ini");
        let Ok(ini) = std::fs::read_to_string(&ini_path) else {
            return false;
        };
        let front = camera_feed_path(&self.paths.camera_dir, serial, CameraLens::Front);
        let back = camera_feed_path(&self.paths.camera_dir, serial, CameraLens::Back);
        camera_wiring_matches(&ini, &front, &back)
    }
}

pub fn helper_files_present(dir: &Path, kind: HelperKind) -> bool {
    match kind {
        HelperKind::ServeSim => {
            dir.join("serve-sim").is_file()
                && dir.join("native/serve-sim-native.node").is_file()
                && dir
                    .join("bin/LiveKitWebRTC.framework/LiveKitWebRTC")
                    .is_file()
        }
        HelperKind::ServeEmu => {
            dir.join("serve-emu").is_file() && dir.join("vendor/scrcpy-server-v4.0").is_file()
        }
    }
}

fn run_capture(cmd: &str, args: &[&str]) -> Option<String> {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}

struct CmdOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

fn argv_flag(argv: &[String], flag: &str) -> Option<String> {
    argv.windows(2).find(|w| w[0] == flag).map(|w| w[1].clone())
}

fn android_toolchain() -> AndroidToolchain {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    resolve_android_toolchain_from(
        std::env::var_os("ANDROID_HOME")
            .map(PathBuf::from)
            .as_deref(),
        std::env::var_os("ANDROID_SDK_ROOT")
            .map(PathBuf::from)
            .as_deref(),
        home.as_deref(),
        which("adb").as_deref(),
        which("emulator").as_deref(),
        which("avdmanager").as_deref(),
        which("sdkmanager").as_deref(),
    )
}

fn which(cmd: &str) -> Option<PathBuf> {
    run_capture("which", &[cmd]).map(|s| PathBuf::from(s.trim()))
}

pub(super) fn ios_boot_status(success: bool, stderr: &str) -> Result<(), String> {
    if success || ios_boot_already_booted(stderr) {
        Ok(())
    } else {
        Err(stderr.trim().to_string())
    }
}

pub(super) fn ios_shutdown_status(success: bool, stderr: &str) -> Result<(), String> {
    if success || ios_shutdown_already_shutdown(stderr) {
        Ok(())
    } else {
        Err(stderr.trim().to_string())
    }
}

async fn run_xcrun_simctl(argv: &[String]) -> Result<CmdOutput, String> {
    let mut full = vec!["simctl".to_string()];
    if argv.first().map(String::as_str) != Some("simctl") {
        full.extend(argv.iter().cloned());
    } else {
        full = argv.to_vec();
    }
    run_named("xcrun", &full).await
}

async fn run_bin(bin: &Path, argv: &[String]) -> Result<CmdOutput, String> {
    let output = Command::new(bin)
        .args(argv)
        .output()
        .await
        .map_err(|e| format!("failed to spawn {}: {e}", bin.display()))?;
    Ok(CmdOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

async fn run_named(bin: &str, argv: &[String]) -> Result<CmdOutput, String> {
    let output = Command::new(bin)
        .args(argv)
        .output()
        .await
        .map_err(|e| format!("failed to spawn {bin}: {e}"))?;
    Ok(CmdOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

async fn android_guest_ready(adb: &Path, serial: &str) -> bool {
    let state = capture_bin(adb, &["-s", serial, "get-state"]).await;
    if state.trim() != "device" {
        return false;
    }
    let completed = capture_bin(
        adb,
        &["-s", serial, "shell", "getprop", "sys.boot_completed"],
    )
    .await;
    completed.trim() == "1"
}

async fn adb_has_serial(adb: &Path, serial: &str) -> bool {
    capture_bin(adb, &["devices", "-l"])
        .await
        .lines()
        .any(|line| line.split_whitespace().next() == Some(serial))
}

async fn capture_bin(bin: &Path, args: &[&str]) -> String {
    Command::new(bin)
        .args(args)
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

async fn port_is_open(port: u16) -> bool {
    tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .is_ok()
}

async fn wait_until_listening(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(150);
    loop {
        if !matches!(child.try_wait(), Ok(None)) {
            return Err("helper exited before the preview port opened".into());
        }
        if port_is_open(port).await {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("helper did not bind the preview port".into());
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn helper_argv_tokens(line: &str) -> Option<(u32, Vec<&str>)> {
    let mut parts = line.split_whitespace();
    let pid = parts.next()?.parse().ok()?;
    Some((pid, parts.collect()))
}

fn argv_targets_device(cmd_and_args: &[&str], binary: &str, device_ids: &[String]) -> bool {
    let Some(cmd) = cmd_and_args.first() else {
        return false;
    };
    let name = Path::new(cmd)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    name == binary
        && device_ids
            .iter()
            .any(|id| !id.is_empty() && cmd_and_args.iter().skip(1).any(|arg| *arg == id.as_str()))
}

fn parse_helper_line(line: &str, binary: &str, device_ids: &[String]) -> Option<(u32, u16)> {
    let (pid, tokens) = helper_argv_tokens(line)?;
    if !argv_targets_device(&tokens, binary, device_ids) {
        return None;
    }
    let args = &tokens[1..];
    let port = args.iter().enumerate().find_map(|(i, arg)| {
        if *arg == "-p" || *arg == "--port" {
            args.get(i + 1)?.parse().ok()
        } else {
            arg.strip_prefix("--port=")?.parse().ok()
        }
    })?;
    Some((pid, port))
}

async fn live_helper(binary: &str, device_ids: &[String]) -> Option<(u32, u16)> {
    if device_ids.is_empty() {
        return None;
    }
    let output = Command::new("pgrep")
        .args(["-lf", binary])
        .output()
        .await
        .ok()?;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((pid, port)) = parse_helper_line(line, binary, device_ids) else {
            continue;
        };
        if port_is_open(port).await {
            return Some((pid, port));
        }
    }
    None
}

async fn kill_orphans(binary: &str, device_ids: &[String], keep_pids: &[u32]) {
    if device_ids.is_empty() {
        return;
    }
    let Ok(output) = Command::new("pgrep").args(["-lf", binary]).output().await else {
        return;
    };
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((pid, tokens)) = helper_argv_tokens(line) else {
            continue;
        };
        if !argv_targets_device(&tokens, binary, device_ids) {
            continue;
        }
        if keep_pids.contains(&pid) {
            continue;
        }
        let _ = Command::new("kill").arg(pid.to_string()).status().await;
    }
}

fn manifest_url(pin: &HelperPin) -> String {
    pin.download_url
        .rsplit_once('/')
        .map(|(base, _)| format!("{base}/manifest.json"))
        .unwrap_or_else(|| pin.download_url.clone())
}

async fn resolve_sha256(client: &reqwest::Client, pin: &HelperPin) -> Result<String, String> {
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
    Err("helper pin has no sha256; publish a Release or run just pack-serve-sim / pack-serve-emu --install".into())
}

async fn download_and_install(
    kind: HelperKind,
    pin: &HelperPin,
    cache: &Path,
    dest: &Path,
    on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
) -> Result<(), EnsureError> {
    let name = ProductionHooks::binary_name(kind);
    let client = reqwest::Client::builder()
        .user_agent("atmos-api")
        .build()
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    let expected = resolve_sha256(&client, pin)
        .await
        .map_err(EnsureError::Download)?;
    tokio::fs::create_dir_all(cache)
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    let archive = cache.join(&pin.asset);
    let response = client
        .get(&pin.download_url)
        .send()
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?
        .error_for_status()
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    let total = response.content_length();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    on_progress(bytes.len() as u64, total);
    if let Err(err) = assert_checksum(&bytes, &expected) {
        return Err(EnsureError::Checksum(err));
    }
    let mut file = tokio::fs::File::create(&archive)
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    file.flush()
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;

    let status = Command::new("tar")
        .args([
            "-xzf",
            &archive.to_string_lossy(),
            "-C",
            &cache.to_string_lossy(),
        ])
        .status()
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    if !status.success() {
        return Err(EnsureError::Download(format!(
            "failed to extract {name} archive"
        )));
    }
    let extracted = cache.join(format!("{name}-{}-darwin-arm64", pin.version));
    if dest.exists() {
        tokio::fs::remove_dir_all(dest)
            .await
            .map_err(|e| EnsureError::Download(e.to_string()))?;
    }
    tokio::fs::create_dir_all(dest.parent().unwrap_or(Path::new(".")))
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    tokio::fs::rename(&extracted, dest)
        .await
        .map_err(|e| EnsureError::Download(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_helper_line_reads_pid_port_and_id() {
        let line = "63839 /Users/aarynlu/.atmos/runtime/serve-sim/0.1.37-atmos.1/serve-sim --host 127.0.0.1 -p 63817 B3CE3FD6-769B-48A3-B0F7-5933C74D1E39";
        assert_eq!(
            parse_helper_line(
                line,
                "serve-sim",
                &["B3CE3FD6-769B-48A3-B0F7-5933C74D1E39".into()]
            ),
            Some((63839, 63817))
        );
        assert_eq!(
            parse_helper_line(line, "serve-sim", &["other-udid".into()]),
            None
        );
        let prefix = "99 /tmp/serve-emu --host 127.0.0.1 -p 3300 --avd Pixel_8_Pro";
        assert_eq!(
            parse_helper_line(prefix, "serve-emu", &["Pixel_8".into()]),
            None
        );
        assert_eq!(
            parse_helper_line(prefix, "serve-emu", &["Pixel_8_Pro".into()]),
            Some((99, 3300))
        );
        let serial = "42 /tmp/serve-emu --host 127.0.0.1 -p 3300 -s emulator-5554";
        assert_eq!(
            parse_helper_line(serial, "serve-emu", &["Pixel_8".into()]),
            None
        );
        assert_eq!(
            parse_helper_line(
                serial,
                "serve-emu",
                &["Pixel_8".into(), "emulator-5554".into()]
            ),
            Some((42, 3300))
        );
    }

    #[test]
    fn already_booted_and_shutdown_are_success() {
        assert!(ios_boot_status(false, "Unable to boot device in current state: Booted\n").is_ok());
        assert!(ios_shutdown_status(
            false,
            "Unable to shutdown device in current state: Shutdown"
        )
        .is_ok());
        assert!(
            ios_boot_status(false, "Unable to boot device in current state: Shutdown").is_err()
        );
        assert!(
            ios_shutdown_status(false, "Unable to shutdown device in current state: Booted")
                .is_err()
        );
        assert!(ios_boot_status(true, "").is_ok());
        assert!(ios_shutdown_status(true, "").is_ok());
    }

    #[test]
    fn checksum_blocks_install_dir() {
        let dest = std::env::temp_dir().join(format!("atmos-checksum-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dest);
        let err = assert_checksum(b"mutated", &"b".repeat(64)).unwrap_err();
        assert!(err.contains("checksum mismatch"));
        assert!(!dest.exists());
    }
}
