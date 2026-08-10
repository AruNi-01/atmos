//! `~/.atmos/linear_local_keys.json` — machine-local Linear personal API keys.
//!
//! Not Hub-synced. Used when the product path is “Local API Key” (vs OAuth on Hub).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::manifest::atmos_home_dir;

pub const LINEAR_LOCAL_KEYS_VERSION: u32 = 1;
pub const LINEAR_LOCAL_KEYS_FILE_NAME: &str = "linear_local_keys.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinearLocalApiKeyRecord {
    pub id: String,
    pub name: String,
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_email: Option<String>,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum LinearLocalAuthSelection {
    None,
    Oauth,
    Local { key_id: String },
}

impl Default for LinearLocalAuthSelection {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinearLocalKeysFile {
    pub version: u32,
    #[serde(default)]
    pub keys: Vec<LinearLocalApiKeyRecord>,
    #[serde(default)]
    pub selection: LinearLocalAuthSelection,
}

impl Default for LinearLocalKeysFile {
    fn default() -> Self {
        Self {
            version: LINEAR_LOCAL_KEYS_VERSION,
            keys: Vec::new(),
            selection: LinearLocalAuthSelection::None,
        }
    }
}

pub fn linear_local_keys_path() -> PathBuf {
    atmos_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".atmos"))
        .join(LINEAR_LOCAL_KEYS_FILE_NAME)
}

pub fn read_linear_local_keys() -> Result<Option<LinearLocalKeysFile>, String> {
    let path = linear_local_keys_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {}", path.display(), err))?;
    let parsed: LinearLocalKeysFile = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse {}: {}", path.display(), err))?;
    if parsed.version != LINEAR_LOCAL_KEYS_VERSION {
        return Err(format!(
            "Unsupported linear local keys version {} in {} (expected {})",
            parsed.version,
            path.display(),
            LINEAR_LOCAL_KEYS_VERSION
        ));
    }
    Ok(Some(parsed))
}

pub fn write_linear_local_keys(file: &LinearLocalKeysFile) -> Result<PathBuf, String> {
    if file.version != LINEAR_LOCAL_KEYS_VERSION {
        return Err(format!(
            "Unsupported linear local keys version {} (expected {})",
            file.version, LINEAR_LOCAL_KEYS_VERSION
        ));
    }
    let path = linear_local_keys_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {}", parent.display(), err))?;
    }
    let payload = serde_json::to_string_pretty(file)
        .map_err(|err| format!("Failed to serialize linear local keys: {err}"))?;
    write_restricted_file(&path, &format!("{payload}\n"))?;
    Ok(path)
}

pub fn clear_linear_local_keys() -> Result<bool, String> {
    let path = linear_local_keys_path();
    if !path.is_file() {
        return Ok(false);
    }
    fs::remove_file(&path)
        .map_err(|err| format!("Failed to remove {}: {}", path.display(), err))?;
    Ok(true)
}

fn write_restricted_file(path: &Path, contents: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        file.write_all(contents.as_bytes())
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }

    #[cfg(not(unix))]
    {
        fs::write(path, contents)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_json_shape() {
        let file = LinearLocalKeysFile {
            version: LINEAR_LOCAL_KEYS_VERSION,
            keys: vec![LinearLocalApiKeyRecord {
                id: "k1".into(),
                name: "Work".into(),
                api_key: "lin_xxx".into(),
                viewer_name: Some("Ada".into()),
                viewer_email: None,
                created_at: 1,
            }],
            selection: LinearLocalAuthSelection::Local {
                key_id: "k1".into(),
            },
        };
        let raw = serde_json::to_string(&file).unwrap();
        let back: LinearLocalKeysFile = serde_json::from_str(&raw).unwrap();
        assert_eq!(back.keys.len(), 1);
        assert_eq!(
            back.selection,
            LinearLocalAuthSelection::Local {
                key_id: "k1".into()
            }
        );
    }
}
