use std::collections::BTreeMap;
use std::fs;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::paths::consent_path;
use crate::resources::{grant_key, resource_spec, Capability};

static CONSENT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ConsentError {
    #[error("Permission Access data directory is unavailable")]
    DataDirUnavailable,
    #[error("Unknown Permission Access resource `{resource}` for {capability}")]
    UnknownResource {
        resource: String,
        capability: String,
    },
    #[error("Permission Access consent file is unreadable")]
    Corrupt,
    #[error("Failed to persist Permission Access consent: {0}")]
    Persist(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ConsentFile {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    grants: BTreeMap<String, ConsentEntry>,
}

fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConsentEntry {
    granted: bool,
    updated_at: u64,
}

pub fn consent(resource_id: &str, capability: Capability) -> Option<bool> {
    let _guard = CONSENT_LOCK.lock().unwrap_or_else(|err| err.into_inner());
    match load_unlocked() {
        Ok(file) => file
            .grants
            .get(&grant_key(capability, resource_id))
            .map(|entry| entry.granted),
        Err(_) => None,
    }
}

pub fn import_absent_grant(
    resource_id: &str,
    capability: Capability,
    granted: bool,
) -> Result<(), ConsentError> {
    if resource_spec(resource_id, capability).is_none() {
        return Err(ConsentError::UnknownResource {
            resource: resource_id.to_string(),
            capability: capability.as_str().to_string(),
        });
    }

    let _guard = CONSENT_LOCK.lock().unwrap_or_else(|err| err.into_inner());
    let path = consent_path().ok_or(ConsentError::DataDirUnavailable)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| ConsentError::Persist(error.to_string()))?;
    }

    let mut file = load_unlocked()?;
    let key = grant_key(capability, resource_id);
    if file.grants.contains_key(&key) {
        return Ok(());
    }
    file.version = 1;
    file.grants.insert(
        key,
        ConsentEntry {
            granted,
            updated_at: unix_now(),
        },
    );
    let contents = serde_json::to_string_pretty(&file)
        .map_err(|error| ConsentError::Persist(error.to_string()))?;
    write_atomic(&path, &contents)
}

pub fn set_consent(
    resource_id: &str,
    capability: Capability,
    granted: bool,
) -> Result<(), ConsentError> {
    if resource_spec(resource_id, capability).is_none() {
        return Err(ConsentError::UnknownResource {
            resource: resource_id.to_string(),
            capability: capability.as_str().to_string(),
        });
    }

    let _guard = CONSENT_LOCK.lock().unwrap_or_else(|err| err.into_inner());
    let path = consent_path().ok_or(ConsentError::DataDirUnavailable)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| ConsentError::Persist(error.to_string()))?;
    }

    let mut file = load_unlocked()?;
    file.version = 1;
    file.grants.insert(
        grant_key(capability, resource_id),
        ConsentEntry {
            granted,
            updated_at: unix_now(),
        },
    );
    let contents = serde_json::to_string_pretty(&file)
        .map_err(|error| ConsentError::Persist(error.to_string()))?;
    write_atomic(&path, &contents)
}

fn load_unlocked() -> Result<ConsentFile, ConsentError> {
    let Some(path) = consent_path() else {
        return Ok(ConsentFile::default());
    };
    if !path.exists() {
        return Ok(ConsentFile::default());
    }
    let contents =
        fs::read_to_string(&path).map_err(|error| ConsentError::Persist(error.to_string()))?;
    serde_json::from_str(&contents).map_err(|_| ConsentError::Corrupt)
}

fn write_atomic(path: &std::path::Path, content: &str) -> Result<(), ConsentError> {
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, content).map_err(|error| ConsentError::Persist(error.to_string()))?;
    fs::rename(&tmp_path, path).map_err(|error| ConsentError::Persist(error.to_string()))
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_dir<T>(f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().expect("env lock");
        let prev = std::env::var_os("ATMOS_PERMISSION_ACCESS_DIR");
        let dir = std::env::temp_dir().join(format!(
            "atmos-pa-consent-{}-{}",
            std::process::id(),
            unix_now()
        ));
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("ATMOS_PERMISSION_ACCESS_DIR", &dir);
        let result = f();
        match prev {
            Some(value) => std::env::set_var("ATMOS_PERMISSION_ACCESS_DIR", value),
            None => std::env::remove_var("ATMOS_PERMISSION_ACCESS_DIR"),
        }
        let _ = fs::remove_dir_all(&dir);
        result
    }

    #[test]
    fn consent_round_trips() {
        with_dir(|| {
            assert_eq!(consent("cursor", Capability::BrowserCookie), None);
            set_consent("cursor", Capability::BrowserCookie, true).unwrap();
            assert_eq!(consent("cursor", Capability::BrowserCookie), Some(true));
            set_consent("cursor", Capability::BrowserCookie, false).unwrap();
            assert_eq!(consent("cursor", Capability::BrowserCookie), Some(false));
        });
    }

    #[test]
    fn set_consent_rejects_unknown_resource() {
        with_dir(|| {
            let error = set_consent("not-a-resource", Capability::BrowserCookie, true)
                .expect_err("unknown resource");
            assert!(matches!(error, ConsentError::UnknownResource { .. }));
        });
    }
}
