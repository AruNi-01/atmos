//! Center-stage layout on disk.
//!
//! ```text
//! ~/.atmos/data/layout/center/
//!   saved-layouts.json
//!   {hostId}/space-layout.json
//! ```
//!
//! GET/PUT still use one aggregated document so the web cache can stay unified.
//! Nested mosaic / space / terminal objects are opaque JSON owned by the client.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::error::{Result, ServiceError};

pub const CENTER_LAYOUT_VERSION: u32 = 1;
pub const MAX_SPACES_PER_HOST: usize = 8;
pub const MAX_SAVED_LAYOUTS: usize = 40;
const SPACE_MARK: &str = "::space::";
const DEFAULT_SPACE_ID: &str = "main";
const HOST_FILE_NAME: &str = "space-layout.json";
const SAVED_LAYOUTS_FILE_NAME: &str = "saved-layouts.json";

static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn default_object() -> Value {
    json!({})
}

fn default_array() -> Value {
    json!([])
}

/// Aggregated document used on the WS wire and in the web localStorage cache.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CenterLayoutDocument {
    pub version: u32,
    pub updated_at: u64,
    #[serde(default = "default_object")]
    pub spaces: Value,
    #[serde(default = "default_object")]
    pub mosaics: Value,
    #[serde(default = "default_array")]
    pub saved_layouts: Value,
    #[serde(default = "default_object")]
    pub overview_tabs: Value,
    /// Per-space terminal splits, keyed by center context id.
    #[serde(default = "default_object")]
    pub terminals: Value,
}

impl Default for CenterLayoutDocument {
    fn default() -> Self {
        Self {
            version: CENTER_LAYOUT_VERSION,
            updated_at: 0,
            spaces: default_object(),
            mosaics: default_object(),
            saved_layouts: default_array(),
            overview_tabs: default_object(),
            terminals: default_object(),
        }
    }
}

impl CenterLayoutDocument {
    pub fn from_value(value: Value) -> Result<Self> {
        let mut doc: Self = serde_json::from_value(value).map_err(|e| {
            ServiceError::Validation(format!("Invalid center layout document: {e}"))
        })?;
        doc.normalize();
        Ok(doc)
    }

    pub fn normalize(&mut self) {
        self.version = CENTER_LAYOUT_VERSION;
        if !self.spaces.is_object() {
            self.spaces = default_object();
        }
        if !self.mosaics.is_object() {
            self.mosaics = default_object();
        }
        if !self.saved_layouts.is_array() {
            self.saved_layouts = default_array();
        }
        if !self.overview_tabs.is_object() {
            self.overview_tabs = default_object();
        }
        if !self.terminals.is_object() {
            self.terminals = default_object();
        }
        strip_space_thumbnails(&mut self.spaces);
        if let Some(list) = self.saved_layouts.as_array_mut() {
            list.truncate(MAX_SAVED_LAYOUTS);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct HostSpaceLayoutFile {
    version: u32,
    updated_at: u64,
    #[serde(default = "default_object")]
    spaces: Value,
    #[serde(default = "default_object")]
    mosaics: Value,
    #[serde(default = "default_object")]
    overview_tabs: Value,
    #[serde(default = "default_object")]
    terminals: Value,
}

impl Default for HostSpaceLayoutFile {
    fn default() -> Self {
        Self {
            version: CENTER_LAYOUT_VERSION,
            updated_at: 0,
            spaces: default_object(),
            mosaics: default_object(),
            overview_tabs: default_object(),
            terminals: default_object(),
        }
    }
}

/// `~/.atmos/data/layout/center`, or `$ATMOS_CENTER_LAYOUT_DIR`.
pub fn center_layout_dir() -> Result<PathBuf> {
    if let Ok(raw) = std::env::var("ATMOS_CENTER_LAYOUT_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    let home = dirs::home_dir()
        .ok_or_else(|| ServiceError::Validation("Cannot determine home directory".to_string()))?;
    Ok(home
        .join(".atmos")
        .join("data")
        .join("layout")
        .join("center"))
}

pub fn load_center_layout() -> Result<CenterLayoutDocument> {
    load_center_layout_from_dir(&center_layout_dir()?)
}

pub fn save_center_layout(doc: CenterLayoutDocument) -> Result<CenterLayoutDocument> {
    save_center_layout_to_dir(&center_layout_dir()?, doc)
}

pub fn load_center_layout_from_dir(dir: &Path) -> Result<CenterLayoutDocument> {
    if !dir.exists() {
        return Ok(CenterLayoutDocument::default());
    }
    let mut aggregated = CenterLayoutDocument::default();
    let mut newest = 0_u64;

    let saved_path = dir.join(SAVED_LAYOUTS_FILE_NAME);
    if saved_path.exists() {
        let saved = read_json_value(&saved_path)?;
        if let Some(list) = saved.get("saved_layouts").cloned() {
            aggregated.saved_layouts = list;
        }
        if let Some(ts) = saved.get("updated_at").and_then(Value::as_u64) {
            newest = newest.max(ts);
        }
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| ServiceError::Processing(format!("Failed to read center layout dir: {e}")))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let host_id = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        if sanitize_host_id(&host_id).is_none() {
            continue;
        }
        let file_path = path.join(HOST_FILE_NAME);
        if !file_path.exists() {
            continue;
        }
        let host = match read_host_file(&file_path) {
            Ok(host) => host,
            Err(_) => continue,
        };
        newest = newest.max(host.updated_at);
        merge_host_into_aggregated(&mut aggregated, &host_id, host);
    }

    aggregated.updated_at = newest;
    aggregated.normalize();
    Ok(aggregated)
}

pub fn save_center_layout_to_dir(
    dir: &Path,
    mut doc: CenterLayoutDocument,
) -> Result<CenterLayoutDocument> {
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    doc.normalize();
    let now = unix_millis();
    doc.updated_at = now;

    fs::create_dir_all(dir).map_err(|e| {
        ServiceError::Processing(format!("Failed to create center layout dir: {e}"))
    })?;

    let hosts = split_aggregated_hosts(&doc);
    for (host_id, mut host) in hosts {
        host.version = CENTER_LAYOUT_VERSION;
        host.updated_at = now;
        cap_object_keep_last(&mut host.mosaics, MAX_SPACES_PER_HOST);
        let host_dir = dir.join(&host_id);
        fs::create_dir_all(&host_dir).map_err(|e| {
            ServiceError::Processing(format!("Failed to create host layout dir: {e}"))
        })?;
        write_json_atomic(&host_dir.join(HOST_FILE_NAME), &host)?;
    }

    write_json_atomic(
        &dir.join(SAVED_LAYOUTS_FILE_NAME),
        &json!({
            "version": CENTER_LAYOUT_VERSION,
            "updated_at": now,
            "saved_layouts": doc.saved_layouts,
        }),
    )?;
    Ok(doc)
}

fn merge_host_into_aggregated(
    aggregated: &mut CenterLayoutDocument,
    host_id: &str,
    host: HostSpaceLayoutFile,
) {
    if let Some(spaces) = aggregated.spaces.as_object_mut() {
        if host.spaces.is_object() {
            spaces.insert(host_id.to_string(), host.spaces);
        }
    }
    remap_space_map_into(
        aggregated.mosaics.as_object_mut(),
        host.mosaics.as_object(),
        host_id,
    );
    remap_space_map_into(
        aggregated.overview_tabs.as_object_mut(),
        host.overview_tabs.as_object(),
        host_id,
    );
    remap_space_map_into(
        aggregated.terminals.as_object_mut(),
        host.terminals.as_object(),
        host_id,
    );
}

fn remap_space_map_into(
    dest: Option<&mut Map<String, Value>>,
    source: Option<&Map<String, Value>>,
    host_id: &str,
) {
    let (Some(dest), Some(source)) = (dest, source) else {
        return;
    };
    for (space_id, value) in source {
        dest.insert(context_id_for(host_id, space_id), value.clone());
    }
}

fn split_aggregated_hosts(doc: &CenterLayoutDocument) -> Vec<(String, HostSpaceLayoutFile)> {
    let mut by_host: BTreeMap<String, HostSpaceLayoutFile> = BTreeMap::new();

    if let Some(spaces) = doc.spaces.as_object() {
        for (host_id, catalog) in spaces {
            let Some(safe) = sanitize_host_id(host_id) else {
                continue;
            };
            host_entry(&mut by_host, &safe).spaces = catalog.clone();
        }
    }
    split_context_map_into_hosts(
        doc.mosaics.as_object(),
        &mut by_host,
        |host, space_id, value| {
            object_slot(&mut host.mosaics).insert(space_id, value);
        },
    );
    split_context_map_into_hosts(
        doc.overview_tabs.as_object(),
        &mut by_host,
        |host, space_id, value| {
            object_slot(&mut host.overview_tabs).insert(space_id, value);
        },
    );
    split_context_map_into_hosts(
        doc.terminals.as_object(),
        &mut by_host,
        |host, space_id, value| {
            object_slot(&mut host.terminals).insert(space_id, value);
        },
    );

    by_host.into_iter().collect()
}

fn split_context_map_into_hosts(
    source: Option<&Map<String, Value>>,
    by_host: &mut BTreeMap<String, HostSpaceLayoutFile>,
    assign: impl Fn(&mut HostSpaceLayoutFile, String, Value),
) {
    let Some(source) = source else {
        return;
    };
    for (context_id, value) in source {
        let (host_id, space_id) = parse_host_space(context_id);
        let Some(safe) = sanitize_host_id(&host_id) else {
            continue;
        };
        assign(host_entry(by_host, &safe), space_id, value.clone());
    }
}

fn host_entry<'a>(
    by_host: &'a mut BTreeMap<String, HostSpaceLayoutFile>,
    host_id: &str,
) -> &'a mut HostSpaceLayoutFile {
    by_host
        .entry(host_id.to_string())
        .or_insert_with(HostSpaceLayoutFile::default)
}

fn object_slot(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = default_object();
    }
    value.as_object_mut().expect("object")
}

fn parse_host_space(context_id: &str) -> (String, String) {
    match context_id.find(SPACE_MARK) {
        Some(index) => (
            context_id[..index].to_string(),
            context_id[index + SPACE_MARK.len()..].to_string(),
        ),
        None => (context_id.to_string(), DEFAULT_SPACE_ID.to_string()),
    }
}

fn context_id_for(host_id: &str, space_id: &str) -> String {
    if space_id.is_empty() || space_id == DEFAULT_SPACE_ID {
        host_id.to_string()
    } else {
        format!("{host_id}{SPACE_MARK}{space_id}")
    }
}

fn sanitize_host_id(id: &str) -> Option<String> {
    if id.is_empty() || id == "saved-layouts" {
        return None;
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") || id.contains(SPACE_MARK) {
        return None;
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return None;
    }
    Some(id.to_string())
}

fn strip_space_thumbnails(spaces: &mut Value) {
    let Some(hosts) = spaces.as_object_mut() else {
        return;
    };
    for host in hosts.values_mut() {
        let Some(list) = host.get_mut("spaces").and_then(Value::as_array_mut) else {
            continue;
        };
        for space in list {
            let Some(obj) = space.as_object_mut() else {
                continue;
            };
            if obj.contains_key("thumbnailDataUrl") {
                obj.insert("thumbnailDataUrl".to_string(), Value::Null);
            }
        }
    }
}

fn cap_object_keep_last(value: &mut Value, max: usize) {
    let Some(obj) = value.as_object() else {
        return;
    };
    if obj.len() <= max {
        return;
    }
    let skip = obj.len() - max;
    let mut next = Map::new();
    for (i, (key, val)) in obj.iter().enumerate() {
        if i >= skip {
            next.insert(key.clone(), val.clone());
        }
    }
    *value = Value::Object(next);
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_json_value(path: &Path) -> Result<Value> {
    let content = fs::read_to_string(path)
        .map_err(|e| ServiceError::Processing(format!("Failed to read {}: {e}", path.display())))?;
    Ok(serde_json::from_str(&content).unwrap_or_else(|_| json!({})))
}

fn read_host_file(path: &Path) -> Result<HostSpaceLayoutFile> {
    let value = read_json_value(path)?;
    serde_json::from_value(value)
        .map_err(|e| ServiceError::Processing(format!("Invalid host space layout: {e}")))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let pretty = serde_json::to_string_pretty(value)
        .map_err(|e| ServiceError::Processing(format!("Failed to serialize center layout: {e}")))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, pretty.as_bytes()).map_err(|e| {
        ServiceError::Processing(format!("Failed to write center layout temp: {e}"))
    })?;
    fs::rename(&tmp, path)
        .map_err(|e| ServiceError::Processing(format!("Failed to finalize center layout: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_dir_is_empty_document() {
        let dir = tempdir().unwrap();
        let doc = load_center_layout_from_dir(&dir.path().join("missing")).unwrap();
        assert_eq!(doc, CenterLayoutDocument::default());
    }

    #[test]
    fn round_trip_splits_hosts_and_keeps_extra_space_terminal() {
        let dir = tempdir().unwrap();
        let mut doc = CenterLayoutDocument::default();
        doc.spaces = json!({
            "ws-1": {
                "activeSpaceId": "space-abc",
                "spaces": [
                    { "id": "main", "name": "Default", "thumbnailDataUrl": "data:image/jpeg;base64,qq" },
                    { "id": "space-abc", "name": "Review" }
                ]
            }
        });
        doc.mosaics = json!({
            "ws-1": { "panes": [{ "id": "pane-main" }], "fullscreenPaneId": null },
            "ws-1::space::space-abc": {
                "panes": [{ "id": "pane-main" }, { "id": "pane-1" }],
                "fullscreenPaneId": "pane-1"
            }
        });
        doc.overview_tabs = json!({ "ws-1": true });
        doc.terminals = json!({
            "ws-1": {
                "schema": "terminal-layout.v1",
                "tabs": [{ "id": "terminal", "layout": "pane-host" }]
            },
            "ws-1::space::space-abc": {
                "schema": "terminal-layout.v1",
                "tabs": [{ "id": "terminal", "layout": "pane-a" }]
            }
        });
        doc.saved_layouts = json!([{ "id": "layout-1", "name": "Split" }]);

        let saved = save_center_layout_to_dir(dir.path(), doc).unwrap();
        assert!(saved.updated_at > 0);
        assert_eq!(
            saved.spaces["ws-1"]["spaces"][0]["thumbnailDataUrl"],
            Value::Null
        );

        let host_path = dir.path().join("ws-1").join(HOST_FILE_NAME);
        assert!(host_path.exists());
        let host: Value = serde_json::from_str(&fs::read_to_string(&host_path).unwrap()).unwrap();
        assert_eq!(host["mosaics"]["main"]["panes"][0]["id"], "pane-main");
        assert_eq!(host["mosaics"]["space-abc"]["fullscreenPaneId"], "pane-1");
        assert_eq!(host["terminals"]["main"]["tabs"][0]["layout"], "pane-host");
        assert_eq!(
            host["terminals"]["space-abc"]["schema"],
            "terminal-layout.v1"
        );

        let loaded = load_center_layout_from_dir(dir.path()).unwrap();
        assert_eq!(
            loaded.mosaics["ws-1::space::space-abc"]["fullscreenPaneId"],
            "pane-1"
        );
        assert_eq!(loaded.overview_tabs["ws-1"], json!(true));
        assert_eq!(loaded.terminals["ws-1"]["tabs"][0]["layout"], "pane-host");
        assert_eq!(
            loaded.terminals["ws-1::space::space-abc"]["tabs"][0]["id"],
            "terminal"
        );
        assert_eq!(loaded.saved_layouts[0]["name"], "Split");
    }

    #[test]
    fn rejects_path_escape_host_ids() {
        assert!(sanitize_host_id("../etc").is_none());
        assert!(sanitize_host_id("ws::space::x").is_none());
        assert!(sanitize_host_id("saved-layouts").is_none());
        assert_eq!(sanitize_host_id("ws-1").as_deref(), Some("ws-1"));
    }

    #[test]
    fn rejects_non_object_payload() {
        let err = CenterLayoutDocument::from_value(json!([])).unwrap_err();
        assert!(err.to_string().contains("Invalid center layout document"));
    }
}
