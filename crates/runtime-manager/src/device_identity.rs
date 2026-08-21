//! App-specific device identity derived from the host machine id.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const APP_DEVICE_ID_CONTEXT: &[u8] = b"atmos-device-v1:computer-registration";

pub fn app_device_id() -> Result<String, String> {
    let machine_id = machine_uid::get().map_err(|err| format!("machine id unavailable: {err}"))?;
    app_device_id_from_machine_id(&machine_id)
}

pub(crate) fn derive_app_device_id() -> Result<String, String> {
    app_device_id()
}

fn app_device_id_from_machine_id(machine_id: &str) -> Result<String, String> {
    let normalized = machine_id.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("machine id is empty".to_string());
    }

    let mut mac = HmacSha256::new_from_slice(normalized.as_bytes())
        .map_err(|err| format!("device id hmac init failed: {err}"))?;
    mac.update(APP_DEVICE_ID_CONTEXT);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

#[cfg(test)]
mod tests {
    use super::app_device_id_from_machine_id;

    #[test]
    fn app_device_id_is_stable_and_hex_encoded() {
        let first = app_device_id_from_machine_id(" TEST-MACHINE-ID ").unwrap();
        let second = app_device_id_from_machine_id("test-machine-id").unwrap();

        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(first, first.to_ascii_lowercase());
    }

    #[test]
    fn rejects_empty_machine_id() {
        assert!(app_device_id_from_machine_id("  ").is_err());
    }
}
