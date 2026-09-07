use core_engine::{BootState, DevicePlatform};

use super::types::{LastDevicePref, SimulatorDevice, SimulatorReason};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickError {
    NoDevice,
    AlreadyClaimed,
}

pub fn pick_device<'a>(
    devices: &'a [SimulatorDevice],
    workspace_id: &str,
    requested: Option<&str>,
    platform: Option<DevicePlatform>,
    prefs: Option<&LastDevicePref>,
) -> Result<&'a SimulatorDevice, PickError> {
    let scoped: Vec<&SimulatorDevice> = devices
        .iter()
        .filter(|device| platform.is_none() || Some(device.platform) == platform)
        .collect();

    if let Some(udid) = requested {
        let Some(device) = scoped.iter().copied().find(|device| device.udid == udid) else {
            return Err(PickError::NoDevice);
        };
        if device
            .claimed_by_workspace
            .as_deref()
            .is_some_and(|owner| owner != workspace_id)
        {
            return Err(PickError::AlreadyClaimed);
        }
        if !device.available {
            return Err(PickError::NoDevice);
        }
        return Ok(device);
    }

    if let Some(pref) = prefs {
        if platform.is_none() || platform == Some(pref.platform) {
            if let Some(device) = scoped.iter().copied().find(|device| {
                device.udid == pref.udid
                    && device.platform == pref.platform
                    && device.is_free_for(workspace_id)
            }) {
                return Ok(device);
            }
        }
    }

    let free: Vec<&SimulatorDevice> = scoped
        .iter()
        .copied()
        .filter(|device| device.is_free_for(workspace_id))
        .collect();
    prefer_device(&free).ok_or(PickError::NoDevice)
}

fn prefer_device<'a>(free: &[&'a SimulatorDevice]) -> Option<&'a SimulatorDevice> {
    free.iter()
        .copied()
        .find(|device| device.platform == DevicePlatform::Ios && device.boot() == BootState::Booted)
        .or_else(|| {
            free.iter()
                .copied()
                .find(|device| device.boot() == BootState::Booted)
        })
        .or_else(|| {
            free.iter()
                .copied()
                .find(|device| device.platform == DevicePlatform::Ios)
        })
        .or_else(|| free.first().copied())
}

pub fn pick_reason(err: PickError) -> SimulatorReason {
    match err {
        PickError::NoDevice => SimulatorReason::NoDevice,
        PickError::AlreadyClaimed => SimulatorReason::DeviceAlreadyClaimed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_engine::DevicePlatform;

    fn device(
        id: &str,
        platform: DevicePlatform,
        state: &str,
        claimed: Option<&str>,
    ) -> SimulatorDevice {
        SimulatorDevice {
            udid: id.into(),
            name: id.into(),
            runtime: "test".into(),
            state: state.into(),
            available: true,
            platform,
            claimed_by_workspace: claimed.map(str::to_string),
            serial: None,
        }
    }

    #[test]
    fn auto_claim_skips_foreign_claims_and_prefers_iphone() {
        let devices = vec![
            device("phone-a", DevicePlatform::Ios, "Shutdown", Some("ws-a")),
            device("phone-b", DevicePlatform::Ios, "Shutdown", None),
        ];
        assert_eq!(
            pick_device(&devices, "ws-b", None, None, None)
                .unwrap()
                .udid,
            "phone-b"
        );
    }

    #[test]
    fn never_steals_explicit_udid() {
        let devices = vec![
            device("U", DevicePlatform::Ios, "Booted", Some("ws-a")),
            device("V", DevicePlatform::Ios, "Shutdown", None),
        ];
        assert_eq!(
            pick_device(&devices, "ws-b", Some("U"), None, None),
            Err(PickError::AlreadyClaimed)
        );
        assert_eq!(
            pick_device(&devices, "ws-a", Some("U"), None, None)
                .unwrap()
                .udid,
            "U"
        );
    }

    #[test]
    fn no_free_device_does_not_evict() {
        let devices = vec![device(
            "only",
            DevicePlatform::Android,
            "Booted",
            Some("ws-a"),
        )];
        assert_eq!(
            pick_device(&devices, "ws-b", None, None, None),
            Err(PickError::NoDevice)
        );
    }

    #[test]
    fn prefs_win_when_still_free() {
        let devices = vec![
            device("iphone", DevicePlatform::Ios, "Booted", None),
            device("pixel", DevicePlatform::Android, "Shutdown", None),
        ];
        let prefs = LastDevicePref {
            platform: DevicePlatform::Android,
            udid: "pixel".into(),
        };
        assert_eq!(
            pick_device(&devices, "ws-a", None, None, Some(&prefs))
                .unwrap()
                .udid,
            "pixel"
        );
    }

    #[test]
    fn prefers_booted_ios_without_prefs() {
        let devices = vec![
            device("pixel", DevicePlatform::Android, "Booted", None),
            device("iphone", DevicePlatform::Ios, "Booted", None),
        ];
        assert_eq!(
            pick_device(&devices, "ws-a", None, None, None)
                .unwrap()
                .udid,
            "iphone"
        );
    }
}
