//! Unified permission doctor for Desktop Use (single host product identity).

use serde::{Deserialize, Serialize};

use crate::engine_manifest::EngineManifest;
use crate::host;
use crate::manager::DesktopUseManager;
use crate::strings::scrub_vendor;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PermissionDoctor {
    /// User-facing host product for grants (Atmos Desktop Use).
    pub host_app_name: String,
    pub host_bundle_id: String,
    pub engine_installed: bool,
    pub engine_ready: bool,
    pub host_app_path: Option<String>,
    pub accessibility: Option<bool>,
    pub screen_recording: Option<bool>,
    pub notes: Vec<String>,
}

pub fn permission_doctor(manager: &DesktopUseManager) -> PermissionDoctor {
    let manifest = EngineManifest::embedded().ok();
    let host_app_name = manifest
        .as_ref()
        .map(|m| m.host_app_name.clone())
        .unwrap_or_else(|| "Atmos Desktop Use".into());
    let host_bundle_id = manifest
        .as_ref()
        .map(|m| m.host_bundle_id.clone())
        .unwrap_or_else(|| "com.atmos.desktop.use".into());

    let st = manager.status();
    let host_app = manager.host_app_path();
    let mut notes = Vec::new();
    notes.push(scrub_vendor(
        "Grant Accessibility and Screen Recording to Atmos Desktop Use for capture and control. AppShot and control share this product identity.",
    ));

    let mut accessibility = None;
    let mut screen_recording = None;
    let mut engine_ready = false;

    if st.driver.installed {
        if let Ok(engine) = manager.require_engine() {
            let socket = manager.socket_path();
            match host::permissions_status_json(&engine, &socket) {
                Ok(v) => {
                    accessibility =
                        v.get("accessibility")
                            .and_then(|x| x.as_bool())
                            .or_else(|| {
                                v.pointer("/permissions/accessibility")
                                    .and_then(|x| x.as_bool())
                            });
                    screen_recording = v
                        .get("screen_recording")
                        .and_then(|x| x.as_bool())
                        .or_else(|| v.get("screenRecording").and_then(|x| x.as_bool()))
                        .or_else(|| {
                            v.pointer("/permissions/screen_recording")
                                .and_then(|x| x.as_bool())
                        });
                    engine_ready = host::is_daemon_alive(&socket)
                        || host::ensure_daemon(&engine, &socket).is_ok();
                }
                Err(e) => notes.push(e),
            }
        }
    } else {
        notes.push(
            "Control engine is not installed yet. Use Install / update under Desktop Use Settings."
                .into(),
        );
    }

    PermissionDoctor {
        host_app_name,
        host_bundle_id,
        engine_installed: st.driver.installed,
        engine_ready,
        host_app_path: host_app.map(|p| p.display().to_string()),
        accessibility,
        screen_recording,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manager::DesktopUseManager;
    use tempfile::tempdir;

    #[test]
    fn doctor_without_engine_is_vendor_free() {
        let dir = tempdir().unwrap();
        let engine = dir.path().join("bin").join("atmos-desktop-control");
        let mgr = DesktopUseManager::with_paths(dir.path(), &engine);
        let d = permission_doctor(&mgr);
        assert_eq!(d.host_app_name, "Atmos Desktop Use");
        assert!(!d.engine_installed);
        assert!(!crate::strings::contains_vendor_brand(&d.host_app_name));
        for n in &d.notes {
            assert!(!crate::strings::contains_vendor_brand(n));
        }
    }
}
