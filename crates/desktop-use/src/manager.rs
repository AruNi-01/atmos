use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::{ensure_dirs, resolve_data_dir, resolve_engine_bin, resolve_state_path};
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

        DesktopUseStatus {
            product: strings::PRODUCT_NAME.to_string(),
            data_dir: self.data_dir.display().to_string(),
            capture: capture_capability(),
            driver: DriverStatus {
                phase,
                progress: None,
                error: error.map(|e| scrub_vendor(&e)),
                engine_path: installed.then(|| self.engine_bin.display().to_string()),
                installed,
            },
        }
    }

    /// Ensure control engine is present.
    ///
    /// Install source resolution order:
    /// 1. `source_path` argument (if provided and exists)
    /// 2. `ATMOS_DESKTOP_USE_ENGINE_SOURCE` env (offline/dev)
    /// 3. Fail clearly when no package is available (no fake success)
    pub fn ensure_driver(&self, force: bool) -> EnsureOutcome {
        self.ensure_driver_from(force, None)
    }

    pub fn ensure_driver_from(
        &self,
        force: bool,
        source_path: Option<&Path>,
    ) -> EnsureOutcome {
        let _ = fs::create_dir_all(self.data_dir.join("bin"));
        let _ = ensure_dirs();

        if self.engine_bin.is_file() && !force {
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

        let msg = scrub_vendor(
            "Control engine package is not available for automatic download in this build. \
             Install from Settings → Desktop Use when a package is published, or provide a local engine binary for development.",
        );
        if force && self.engine_bin.is_file() {
            let _ = fs::remove_file(&self.engine_bin);
        }
        // Keep not_installed (with error detail) so Settings does not look "broken".
        self.save_state(DriverPhase::NotInstalled, Some(msg.clone()));
        EnsureOutcome::Failed { error: msg }
    }

    pub fn stop_driver(&self) -> DriverStatus {
        if self.engine_bin.is_file() {
            self.save_state(DriverPhase::Stopped, None);
        }
        self.status().driver
    }

    pub fn uninstall_driver(&self) -> DriverStatus {
        if self.engine_bin.is_file() {
            let _ = fs::remove_file(&self.engine_bin);
        }
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
    }

    #[test]
    fn ensure_without_source_fails_clearly() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let out = mgr.ensure_driver_from(false, None);
        // Force path that ignores env: pass empty non-existent path via ensure that
        // only uses explicit None and with env cleared for this process key if set.
        let out = if std::env::var_os("ATMOS_DESKTOP_USE_ENGINE_SOURCE").is_some() {
            // Explicit missing path should still fail
            mgr.ensure_driver_from(true, Some(Path::new("/nonexistent/desktop-use-engine")))
        } else {
            out
        };
        match out {
            EnsureOutcome::Failed { error } => {
                assert!(!error.is_empty());
                assert!(!strings::contains_vendor_brand(&error));
            }
            other => panic!("expected failed, got {other:?}"),
        }
        assert!(!mgr.status().driver.installed);
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
