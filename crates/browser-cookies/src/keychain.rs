//! Read a Chromium "<Browser> Safe Storage" passphrase from the macOS Keychain.
//!
//! Prefers the Security framework (via `security-framework`) and falls back to
//! the `security` CLI, which finds the item by service name alone (matching the
//! previously-shipped `ai-usage` behavior). A non-owning app reading the item
//! triggers the standard Keychain ACL prompt.

use crate::types::ExtractError;

/// Fetch the Safe Storage passphrase for `service` (e.g. "Chrome Safe Storage").
#[cfg(target_os = "macos")]
pub fn safe_storage_passphrase(service: &str) -> Result<String, ExtractError> {
    match passphrase_via_framework(service) {
        Ok(value) => Ok(value),
        // If the framework lookup is denied, do not silently retry via the CLI
        // (that would risk a second prompt / mask the denial).
        Err(ExtractError::KeychainDenied) => Err(ExtractError::KeychainDenied),
        Err(_) => passphrase_via_cli(service),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn safe_storage_passphrase(_service: &str) -> Result<String, ExtractError> {
    Err(ExtractError::UnsupportedPlatform)
}

/// The Keychain account for a Chromium Safe Storage item is the browser name
/// without the " Safe Storage" suffix (e.g. "Chrome", "Microsoft Edge",
/// "Brave").
fn account_for(service: &str) -> String {
    service
        .strip_suffix(" Safe Storage")
        .unwrap_or(service)
        .to_string()
}

#[cfg(target_os = "macos")]
fn passphrase_via_framework(service: &str) -> Result<String, ExtractError> {
    use security_framework::passwords::get_generic_password;

    let account = account_for(service);
    match get_generic_password(service, &account) {
        Ok(bytes) => {
            let value = String::from_utf8_lossy(&bytes).trim().to_string();
            if value.is_empty() {
                Err(ExtractError::KeychainUnavailable)
            } else {
                Ok(value)
            }
        }
        Err(err) => Err(map_framework_error(err.code())),
    }
}

#[cfg(target_os = "macos")]
fn map_framework_error(code: i32) -> ExtractError {
    // errSecItemNotFound = -25300, errSecAuthFailed = -25293,
    // errSecUserCanceled = -128, errSecInteractionNotAllowed = -25308.
    match code {
        -25300 => ExtractError::KeychainUnavailable,
        -25293 | -128 | -25308 => ExtractError::KeychainDenied,
        _ => ExtractError::KeychainUnavailable,
    }
}

#[cfg(target_os = "macos")]
fn passphrase_via_cli(service: &str) -> Result<String, ExtractError> {
    use std::process::Command;

    // Use the absolute system path (not PATH-relative) for the Keychain-reading
    // binary so a hijacked PATH cannot substitute a different `security`.
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service, "-w"])
        .output()
        .map_err(|e| ExtractError::Io(format!("security: {e}")))?;

    if !output.status.success() {
        // The CLI returns non-zero for both "not found" and denial; treat a
        // present-but-blocked item as denial, absence as unavailable. We cannot
        // reliably distinguish, so err on the side of KeychainUnavailable.
        return Err(ExtractError::KeychainUnavailable);
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        return Err(ExtractError::KeychainUnavailable);
    }
    Ok(value)
}
