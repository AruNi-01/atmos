use crate::appshot::types::{
    AppshotPermissionName, AppshotPermissionRecoveryAction, AppshotPermissionState,
    AppshotSettingsTarget,
};
use std::process::Command;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

pub(super) fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

pub(super) fn screen_recording_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

pub(super) fn permission_states() -> Vec<AppshotPermissionState> {
    vec![
        permission_state(
            AppshotPermissionName::Accessibility,
            "Accessibility",
            accessibility_granted(),
            vec![
                "Read the target app's accessibility tree".to_string(),
                "Detect modifier-only Appshot gestures when required by macOS".to_string(),
            ],
            AppshotSettingsTarget::Accessibility,
            vec![
                "Open System Settings > Privacy & Security > Accessibility.".to_string(),
                "Enable Atmos, then return to Atmos.".to_string(),
            ],
        ),
        permission_state(
            AppshotPermissionName::ScreenRecording,
            "Screen Recording",
            screen_recording_granted(),
            vec!["Capture the focused app window as snapshot.png".to_string()],
            AppshotSettingsTarget::ScreenRecording,
            vec![
                "Open System Settings > Privacy & Security > Screen & System Audio Recording."
                    .to_string(),
                "Enable Atmos, then return to Atmos.".to_string(),
            ],
        ),
    ]
}

pub(super) fn open_settings(target: AppshotSettingsTarget) -> Result<(), String> {
    let url = match target {
        AppshotSettingsTarget::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        AppshotSettingsTarget::ScreenRecording => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        AppshotSettingsTarget::PrivacySecurity => {
            "x-apple.systempreferences:com.apple.preference.security"
        }
    };

    let status = Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| format!("failed to open System Settings: {error}"))?;
    if status.success() {
        return Ok(());
    }

    let fallback = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security")
        .status()
        .map_err(|error| format!("failed to open Privacy & Security settings: {error}"))?;
    if fallback.success() {
        Ok(())
    } else {
        Err("Open System Settings > Privacy & Security manually.".to_string())
    }
}

fn permission_state(
    name: AppshotPermissionName,
    display_name: &str,
    granted: bool,
    required_for: Vec<String>,
    target: AppshotSettingsTarget,
    manual_steps: Vec<String>,
) -> AppshotPermissionState {
    AppshotPermissionState {
        name,
        display_name: display_name.to_string(),
        granted,
        required_for,
        recovery_action: if granted {
            None
        } else {
            Some(AppshotPermissionRecoveryAction {
                label: "Open System Settings".to_string(),
                target,
                manual_steps,
            })
        },
    }
}
