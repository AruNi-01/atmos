use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::{ensure_dirs, resolve_data_dir, resolve_engine_bin, resolve_state_path};
use crate::engine_manifest::EngineManifest;
use crate::host;
use crate::install::{self, host_app_path};
use crate::strings::{self, scrub_vendor, ERR_ENGINE_NOT_INSTALLED};

/// Lifecycle phase of the optional control engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DriverPhase {
    NotInstalled,
    Downloading,
    Installed,
    Ready,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DriverStatus {
    pub phase: DriverPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CaptureCapability {
    pub available: bool,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopUseStatus {
    pub product: String,
    pub data_dir: String,
    pub capture: CaptureCapability,
    pub driver: DriverStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_app_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_app_path: Option<String>,
    /// Version pinned by the Atmos-shipped manifest (desired).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_version: Option<String>,
    /// Version recorded at last successful install (`installed.json`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<String>,
    /// True when binary is present and installed_version != pinned_version.
    pub update_available: bool,
    /// User chrome prefs (operation border toggle, idle clear).
    pub prefs: crate::prefs::DesktopUsePrefs,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EnsureOutcome {
    AlreadyInstalled { path: String },
    Installed { path: String },
    Failed { error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedState {
    phase: DriverPhase,
    #[serde(default)]
    error: Option<String>,
}

pub struct DesktopUseManager {
    data_dir: PathBuf,
    engine_bin: PathBuf,
    state_path: PathBuf,
}

impl Default for DesktopUseManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DesktopUseManager {
    pub fn new() -> Self {
        let data_dir = resolve_data_dir();
        let engine_bin = resolve_engine_bin();
        let state_path = resolve_state_path();
        Self {
            data_dir,
            engine_bin,
            state_path,
        }
    }

    pub fn with_paths(data_dir: impl Into<PathBuf>, engine_bin: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        let engine_bin = engine_bin.into();
        let state_path = data_dir.join("state.json");
        Self {
            data_dir,
            engine_bin,
            state_path,
        }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn socket_path(&self) -> PathBuf {
        host::default_socket_path(&self.data_dir)
    }

    pub fn host_app_path(&self) -> Option<PathBuf> {
        EngineManifest::embedded()
            .ok()
            .and_then(|m| host_app_path(&self.data_dir, &m))
    }

    pub fn status(&self) -> DesktopUseStatus {
        let installed = self.engine_bin.is_file();
        let persisted = self.load_state();
        let phase = if installed {
            match persisted.as_ref().map(|s| &s.phase) {
                Some(DriverPhase::Stopped) => DriverPhase::Stopped,
                Some(DriverPhase::Failed) => DriverPhase::Failed,
                Some(DriverPhase::Downloading) => DriverPhase::Downloading,
                _ => DriverPhase::Ready,
            }
        } else {
            match persisted.as_ref().map(|s| &s.phase) {
                Some(DriverPhase::Failed) => DriverPhase::Failed,
                Some(DriverPhase::Downloading) => DriverPhase::Downloading,
                _ => DriverPhase::NotInstalled,
            }
        };

        let error = persisted.and_then(|s| s.error).filter(|_| !installed);
        let manifest = EngineManifest::embedded().ok();
        let pinned_version = manifest.as_ref().map(|m| m.engine_version.clone());
        let installed_version = installed
            .then(|| read_installed_version(&self.data_dir))
            .flatten();
        let update_available = match (&installed_version, &pinned_version) {
            (Some(installed_v), Some(pinned_v)) => installed_v != pinned_v,
            _ => false,
        };

        DesktopUseStatus {
            product: strings::PRODUCT_NAME.to_string(),
            data_dir: self.data_dir.display().to_string(),
            capture: capture_capability(),
            driver: DriverStatus {
                phase,
                progress: None,
                error: error.map(|e| scrub_vendor(&e)),
                engine_path: installed.then(|| self.engine_bin.display().to_string()),
                // Prefer recorded install version; fall back to pin when meta is missing.
                engine_version: installed
                    .then(|| installed_version.clone().or_else(|| pinned_version.clone()))
                    .flatten(),
                installed,
            },
            prefs: crate::prefs::load_prefs(),
            host_app_name: manifest.as_ref().map(|m| m.host_app_name.clone()),
            host_app_path: self.host_app_path().map(|p| p.display().to_string()),
            pinned_version,
            installed_version,
            update_available,
        }
    }

    pub fn ensure_driver(&self, force: bool) -> EnsureOutcome {
        self.ensure_driver_from(force, None)
    }

    /// Ensure control engine is present.
    ///
    /// Order:
    /// 1. explicit `source_path` file (raw binary copy)
    /// 2. `ATMOS_DESKTOP_USE_ENGINE_SOURCE` env (raw binary)
    /// 3. `ATMOS_DESKTOP_USE_ENGINE_ARCHIVE` or network pin download + extract
    pub fn ensure_driver_from(&self, force: bool, source_path: Option<&Path>) -> EnsureOutcome {
        let _ = fs::create_dir_all(self.data_dir.join("bin"));
        let _ = ensure_dirs();

        if self.engine_bin.is_file() && !force {
            // Keep host branding (Atmos icon/plist) current without re-download.
            if let (Ok(manifest), Some(host)) = (
                crate::engine_manifest::EngineManifest::embedded(),
                self.host_app_path(),
            ) {
                let _ = crate::install::rebrand_existing_host_app(&host, &manifest);
            }
            self.save_state(DriverPhase::Ready, None);
            return EnsureOutcome::AlreadyInstalled {
                path: self.engine_bin.display().to_string(),
            };
        }

        self.save_state(DriverPhase::Downloading, None);

        let env_source = std::env::var("ATMOS_DESKTOP_USE_ENGINE_SOURCE").ok();
        let resolved = source_path
            .map(|p| p.to_path_buf())
            .or_else(|| env_source.map(PathBuf::from));

        if let Some(src_path) = resolved {
            if src_path.is_file() {
                if let Some(parent) = self.engine_bin.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                match fs::copy(&src_path, &self.engine_bin) {
                    Ok(_) => {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = fs::set_permissions(
                                &self.engine_bin,
                                fs::Permissions::from_mode(0o755),
                            );
                        }
                        // Record pin so status can detect future updates.
                        if let Ok(manifest) = EngineManifest::embedded() {
                            let meta = serde_json::json!({
                                "engine_version": manifest.engine_version,
                                "host_app_name": manifest.host_app_name,
                                "host_bundle_id": manifest.host_bundle_id,
                                "source": "raw_binary",
                            });
                            let _ = fs::write(
                                self.data_dir.join("installed.json"),
                                serde_json::to_vec_pretty(&meta).unwrap_or_default(),
                            );
                        }
                        self.save_state(DriverPhase::Ready, None);
                        return EnsureOutcome::Installed {
                            path: self.engine_bin.display().to_string(),
                        };
                    }
                    Err(e) => {
                        let msg = scrub_vendor(&format!("Failed to install control engine: {e}"));
                        self.save_state(DriverPhase::Failed, Some(msg.clone()));
                        return EnsureOutcome::Failed { error: msg };
                    }
                }
            }
        }

        // Pinned package download / fixture archive.
        match install::download_and_install(&self.data_dir, &self.engine_bin, force) {
            Ok(layout) => {
                self.save_state(DriverPhase::Ready, None);
                // Best-effort: start daemon via Atmos Desktop Use.app (unified TCC).
                let sock = self.socket_path();
                let host_fallback = self.host_app_path();
                let host_app = layout.host_app.as_deref().or(host_fallback.as_deref());
                let _ = host::ensure_daemon(&layout.engine_bin, &sock, host_app);
                EnsureOutcome::Installed {
                    path: layout.engine_bin.display().to_string(),
                }
            }
            Err(e) => {
                let msg = scrub_vendor(&e);
                if force && self.engine_bin.is_file() {
                    let _ = fs::remove_file(&self.engine_bin);
                }
                self.save_state(DriverPhase::NotInstalled, Some(msg.clone()));
                EnsureOutcome::Failed { error: msg }
            }
        }
    }

    pub fn stop_driver(&self) -> DriverStatus {
        let _ = crate::highlight::clear_highlight();
        if self.engine_bin.is_file() {
            let _ = host::stop_daemon(&self.engine_bin, &self.socket_path());
            self.save_state(DriverPhase::Stopped, None);
        }
        self.status().driver
    }

    pub fn uninstall_driver(&self) -> DriverStatus {
        let _ = crate::highlight::clear_highlight();
        let _ = host::stop_daemon(&self.engine_bin, &self.socket_path());
        if self.engine_bin.is_file() {
            let _ = fs::remove_file(&self.engine_bin);
        }
        // Keep host app for re-grant; remove runtime cache optionally.
        self.save_state(DriverPhase::NotInstalled, None);
        self.status().driver
    }

    pub fn require_engine(&self) -> Result<PathBuf, String> {
        if self.engine_bin.is_file() {
            Ok(self.engine_bin.clone())
        } else {
            Err(ERR_ENGINE_NOT_INSTALLED.to_string())
        }
    }

    pub fn open_permission_grant(&self) -> Result<(), String> {
        self.open_permission_grant_target(host::PermissionGrantTarget::All)
    }

    pub fn open_permission_grant_target(
        &self,
        target: host::PermissionGrantTarget,
    ) -> Result<(), String> {
        let engine = self.require_engine()?;
        // Refresh host branding only if icon/plist still wrong (idempotent; no TCC churn).
        if let (Ok(manifest), Some(host)) = (
            crate::engine_manifest::EngineManifest::embedded(),
            self.host_app_path(),
        ) {
            let _ = crate::install::rebrand_existing_host_app(&host, &manifest);
        }
        host::open_host_permission_grant(
            self.host_app_path().as_deref(),
            &engine,
            &self.socket_path(),
            &self.data_dir,
            target,
        )
    }

    fn load_state(&self) -> Option<PersistedState> {
        let bytes = fs::read(&self.state_path).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    fn save_state(&self, phase: DriverPhase, error: Option<String>) {
        let _ = fs::create_dir_all(&self.data_dir);
        let state = PersistedState { phase, error };
        if let Ok(json) = serde_json::to_vec_pretty(&state) {
            let _ = fs::write(&self.state_path, json);
        }
    }
}

fn capture_capability() -> CaptureCapability {
    if cfg!(target_os = "macos") {
        CaptureCapability {
            available: true,
            platform: "macos".into(),
            reason: None,
        }
    } else if cfg!(target_os = "linux") {
        CaptureCapability {
            available: false,
            platform: "linux".into(),
            reason: Some("Desktop capture is limited on Linux in this build".into()),
        }
    } else if cfg!(target_os = "windows") {
        CaptureCapability {
            available: false,
            platform: "windows".into(),
            reason: Some("Desktop capture is limited on Windows in this build".into()),
        }
    } else {
        CaptureCapability {
            available: false,
            platform: "unknown".into(),
            reason: Some(strings::ERR_CAPTURE_UNSUPPORTED.into()),
        }
    }
}

fn read_installed_version(data_dir: &Path) -> Option<String> {
    let bytes = fs::read(data_dir.join("installed.json")).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value
        .get("engine_version")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn status_not_installed_by_default() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let st = mgr.status();
        assert_eq!(st.product, "Desktop Use");
        assert!(!st.driver.installed);
        assert_eq!(st.driver.phase, DriverPhase::NotInstalled);
        assert_eq!(st.host_app_name.as_deref(), Some("Atmos Desktop Use"));
        assert!(!strings::contains_vendor_brand(&st.product));
    }

    #[test]
    fn ensure_from_source_file() {
        let dir = tempdir().unwrap();
        let src_dir = tempdir().unwrap();
        let src = src_dir.path().join("fake-engine");
        fs::write(&src, b"#!/bin/sh\necho ok\n").unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let out = mgr.ensure_driver_from(false, Some(&src));
        match out {
            EnsureOutcome::Installed { path } | EnsureOutcome::AlreadyInstalled { path } => {
                assert!(Path::new(&path).is_file());
            }
            EnsureOutcome::Failed { error } => panic!("ensure failed: {error}"),
        }
        assert!(mgr.status().driver.installed);
        assert_eq!(mgr.status().driver.phase, DriverPhase::Ready);
        assert!(!mgr.status().update_available);
    }

    #[test]
    fn update_available_when_installed_version_differs_from_pin() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        fs::create_dir_all(engine.parent().unwrap()).unwrap();
        fs::write(&engine, b"fake").unwrap();
        fs::write(
            dir.path().join("installed.json"),
            br#"{"engine_version":"0.0.1","host_app_name":"Atmos Desktop Use"}"#,
        )
        .unwrap();
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let st = mgr.status();
        assert!(st.driver.installed);
        assert_eq!(st.installed_version.as_deref(), Some("0.0.1"));
        assert_eq!(st.pinned_version.as_deref(), Some("0.17.0"));
        assert!(st.update_available);
    }

    #[test]
    fn ensure_without_network_or_fixture_fails_vendor_free() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        std::env::remove_var("ATMOS_DESKTOP_USE_ENGINE_SOURCE");
        std::env::remove_var("ATMOS_DESKTOP_USE_ENGINE_ARCHIVE");
        std::env::set_var("ATMOS_DESKTOP_USE_SKIP_DOWNLOAD", "1");
        let out = mgr.ensure_driver_from(true, None);
        std::env::remove_var("ATMOS_DESKTOP_USE_SKIP_DOWNLOAD");
        match out {
            EnsureOutcome::Failed { error } => {
                assert!(!error.is_empty());
                assert!(!strings::contains_vendor_brand(&error));
            }
            other => panic!("expected failed, got {other:?}"),
        }
    }

    #[test]
    fn stop_and_uninstall() {
        let dir = tempdir().unwrap();
        let src_dir = tempdir().unwrap();
        let src = src_dir.path().join("fake-engine");
        fs::write(&src, b"x").unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let _ = mgr.ensure_driver_from(false, Some(&src));
        let stopped = mgr.stop_driver();
        assert_eq!(stopped.phase, DriverPhase::Stopped);
        let un = mgr.uninstall_driver();
        assert!(!un.installed);
        assert_eq!(un.phase, DriverPhase::NotInstalled);
    }
}
