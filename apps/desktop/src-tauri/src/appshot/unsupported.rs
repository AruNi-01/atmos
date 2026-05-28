use crate::appshot::types::{
    AppshotPlatform, AppshotStatus, AppshotTriggerMode, AppshotTriggerStatus,
};

pub fn status() -> AppshotStatus {
    AppshotStatus {
        supported: false,
        platform: platform(),
        reason: Some("Appshots are currently available on macOS desktop builds only.".to_string()),
        trigger: AppshotTriggerStatus {
            mode: AppshotTriggerMode::Unsupported,
            enabled: false,
            required_modifiers: Vec::new(),
            last_error: Some("No native Appshot backend for this platform.".to_string()),
            permissions: Vec::new(),
        },
        permissions: Vec::new(),
    }
}

fn platform() -> AppshotPlatform {
    #[cfg(target_os = "windows")]
    {
        return AppshotPlatform::Windows;
    }
    #[cfg(target_os = "linux")]
    {
        return AppshotPlatform::Linux;
    }
    #[allow(unreachable_code)]
    AppshotPlatform::Unknown
}
