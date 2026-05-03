use aes_gcm::aead::{consts::U16, generic_array::GenericArray, Aead, KeyInit};
use aes_gcm::AesGcm;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::ProviderError;
use crate::support::{decode_jwt_payload, run_command, run_sqlite_query};

#[derive(Debug, Clone)]
pub(crate) struct FactoryWorkOsToken {
    pub(crate) refresh_token: String,
    pub(crate) access_token: Option<String>,
    pub(crate) organization_id: Option<String>,
    pub(crate) source_label: String,
}

#[derive(Debug, Clone)]
pub(crate) struct FactoryCliAuthToken {
    pub(crate) access_token: String,
    pub(crate) source_label: String,
}

pub(crate) fn load_factory_local_storage_tokens() -> Result<Vec<FactoryWorkOsToken>, ProviderError>
{
    let mut tokens = Vec::new();
    let mut last_error = None;

    for (label, path) in chromium_leveldb_candidates() {
        match read_workos_token_from_leveldb(&path) {
            Ok(Some(token)) => tokens.push(FactoryWorkOsToken {
                refresh_token: token.refresh_token,
                access_token: token.access_token,
                organization_id: token.organization_id,
                source_label: label,
            }),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    for (label, path) in safari_local_storage_candidates() {
        match read_workos_token_from_safari_sqlite(&path) {
            Ok(Some(token)) => tokens.push(FactoryWorkOsToken {
                refresh_token: token.refresh_token,
                access_token: token.access_token,
                organization_id: token.organization_id,
                source_label: label,
            }),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }

    dedupe_tokens(&mut tokens);
    if tokens.is_empty() {
        if let Some(error) = last_error {
            return Err(error);
        }
    }
    Ok(tokens)
}

pub(crate) fn load_factory_cli_auth_access_token(
) -> Result<Option<FactoryCliAuthToken>, ProviderError> {
    let Some(home) = dirs::home_dir() else {
        return Ok(None);
    };

    let auth_payload_path = home.join(".factory").join("auth.v2.file");
    let auth_key_path = home.join(".factory").join("auth.v2.key");
    if !auth_payload_path.exists() || !auth_key_path.exists() {
        return Ok(None);
    }

    let auth_payload = fs::read_to_string(&auth_payload_path).map_err(|error| {
        ProviderError::Fetch(format!("{}: {error}", auth_payload_path.display()))
    })?;
    let auth_key = fs::read_to_string(&auth_key_path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", auth_key_path.display())))?;

    let decrypted = match decrypt_droid_auth_v2_payload(&auth_payload, &auth_key) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let parsed = match serde_json::from_str::<DroidCliAuthPayload>(&decrypted) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let Some(access_token) = parsed.access_token.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };

    Ok(Some(FactoryCliAuthToken {
        access_token,
        source_label: "Droid CLI auth.v2".to_string(),
    }))
}

#[derive(Debug)]
struct WorkOsTokenMatch {
    refresh_token: String,
    access_token: Option<String>,
    organization_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DroidCliAuthPayload {
    #[serde(default)]
    access_token: Option<String>,
}

fn decrypt_droid_auth_v2_payload(payload: &str, key_b64: &str) -> Result<String, ProviderError> {
    let mut parts = payload.trim().split(':');
    let nonce_b64 = parts.next().unwrap_or_default();
    let tag_b64 = parts.next().unwrap_or_default();
    let cipher_b64 = parts.next().unwrap_or_default();
    if nonce_b64.is_empty() || tag_b64.is_empty() || cipher_b64.is_empty() || parts.next().is_some()
    {
        return Err(ProviderError::Fetch(
            "Invalid Droid auth.v2 payload format".to_string(),
        ));
    }

    let decoded_bytes = BASE64_STANDARD
        .decode(key_b64.trim())
        .map_err(|error| ProviderError::Fetch(format!("Invalid Droid auth.v2 key: {error}")))?;
    if decoded_bytes.len() != 32 {
        return Err(ProviderError::Fetch(
            "Invalid Droid auth.v2 key length".to_string(),
        ));
    }

    let nonce = BASE64_STANDARD
        .decode(nonce_b64)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Droid auth.v2 nonce: {error}")))?;
    if nonce.len() != 16 {
        return Err(ProviderError::Fetch(
            "Invalid Droid auth.v2 nonce length".to_string(),
        ));
    }

    let tag = BASE64_STANDARD
        .decode(tag_b64)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Droid auth.v2 tag: {error}")))?;
    if tag.len() != 16 {
        return Err(ProviderError::Fetch(
            "Invalid Droid auth.v2 tag length".to_string(),
        ));
    }

    let mut ciphertext = BASE64_STANDARD.decode(cipher_b64).map_err(|error| {
        ProviderError::Fetch(format!("Invalid Droid auth.v2 ciphertext: {error}"))
    })?;
    ciphertext.extend_from_slice(&tag);

    type Aes256GcmWithU16Nonce = AesGcm<aes::Aes256, U16>;
    let cipher = Aes256GcmWithU16Nonce::new_from_slice(&decoded_bytes).map_err(|error| {
        ProviderError::Fetch(format!("Invalid Droid auth.v2 cipher key: {error}"))
    })?;
    let plaintext = cipher
        .decrypt(GenericArray::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|error| ProviderError::Fetch(format!("Droid auth.v2 decrypt failed: {error}")))?;

    String::from_utf8(plaintext)
        .map_err(|error| ProviderError::Fetch(format!("Droid auth.v2 utf8 decode failed: {error}")))
}

fn chromium_leveldb_candidates() -> Vec<(String, PathBuf)> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };

    let roots = [
        (
            "Google Chrome",
            home.join("Library/Application Support/Google/Chrome"),
        ),
        (
            "Google Chrome Beta",
            home.join("Library/Application Support/Google/Chrome Beta"),
        ),
        (
            "Google Chrome Canary",
            home.join("Library/Application Support/Google/Chrome Canary"),
        ),
        (
            "Microsoft Edge",
            home.join("Library/Application Support/Microsoft Edge"),
        ),
        (
            "Microsoft Edge Beta",
            home.join("Library/Application Support/Microsoft Edge Beta"),
        ),
        (
            "Microsoft Edge Dev",
            home.join("Library/Application Support/Microsoft Edge Dev"),
        ),
        (
            "Microsoft Edge Canary",
            home.join("Library/Application Support/Microsoft Edge Canary"),
        ),
        (
            "Arc",
            home.join("Library/Application Support/Arc/User Data"),
        ),
        (
            "Arc Beta",
            home.join("Library/Application Support/Arc Beta/User Data"),
        ),
        (
            "Arc Canary",
            home.join("Library/Application Support/Arc Canary/User Data"),
        ),
        (
            "Chromium",
            home.join("Library/Application Support/Chromium"),
        ),
        (
            "Brave",
            home.join("Library/Application Support/BraveSoftware/Brave-Browser"),
        ),
        (
            "Brave Beta",
            home.join("Library/Application Support/BraveSoftware/Brave-Browser-Beta"),
        ),
        (
            "Helium",
            home.join("Library/Application Support/net.imput.helium"),
        ),
        (
            "Dia",
            home.join("Library/Application Support/com.electron.dia"),
        ),
        (
            "ChatGPT Atlas",
            home.join("Library/Application Support/ChatGPT Atlas"),
        ),
    ];

    let mut candidates = Vec::new();
    for (browser_label, root) in roots {
        if !root.exists() {
            continue;
        }
        let mut profiles = profile_leveldb_dirs(&root);
        profiles.sort_by_key(|(profile_name, _)| chromium_profile_priority(profile_name));
        candidates.extend(
            profiles
                .into_iter()
                .map(|(profile_name, path)| (format!("{browser_label} / {profile_name}"), path)),
        );
    }
    candidates
}

fn safari_local_storage_candidates() -> Vec<(String, PathBuf)> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let root =
        home.join("Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteData/Default");
    if !root.exists() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let Ok(entries) = walk_dir(&root) else {
        return Vec::new();
    };

    for path in entries {
        if path.file_name().and_then(|value| value.to_str()) != Some("origin") {
            continue;
        }
        let Ok(contents) = fs::read(&path) else {
            continue;
        };
        let text = decode_bytes(&contents);
        let host = ["app.factory.ai", "auth.factory.ai", "factory.ai"]
            .into_iter()
            .find(|candidate| text.contains(candidate));
        let Some(host) = host else {
            continue;
        };
        let sqlite_path = path
            .parent()
            .unwrap_or(root.as_path())
            .join("LocalStorage")
            .join("localstorage.sqlite3");
        if sqlite_path.exists() {
            candidates.push((format!("Safari / {host}"), sqlite_path));
        }
    }

    candidates.sort_by(|left, right| left.0.cmp(&right.0));
    candidates.dedup_by(|left, right| left.1 == right.1);
    candidates
}

fn profile_leveldb_dirs(root: &Path) -> Vec<(String, PathBuf)> {
    let mut profiles = Vec::new();

    let direct_leveldb = root.join("Local Storage").join("leveldb");
    if direct_leveldb.exists() {
        profiles.push(("Default".to_string(), direct_leveldb));
    }

    let Ok(entries) = fs::read_dir(root) else {
        return profiles;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let profile_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        if !(profile_name == "Default"
            || profile_name.starts_with("Profile ")
            || profile_name.starts_with("user-"))
        {
            continue;
        }
        let leveldb_path = path.join("Local Storage").join("leveldb");
        if leveldb_path.exists() {
            profiles.push((profile_name, leveldb_path));
        }
    }

    profiles
}

fn chromium_profile_priority(profile_name: &str) -> (usize, String) {
    let lower = profile_name.to_lowercase();
    let rank = match lower.as_str() {
        "default" => 0,
        "profile 1" => 1,
        "profile 2" => 2,
        _ => 10,
    };
    (rank, lower)
}

fn read_workos_token_from_leveldb(
    leveldb_path: &Path,
) -> Result<Option<WorkOsTokenMatch>, ProviderError> {
    let Ok(entries) = fs::read_dir(leveldb_path) else {
        return Ok(None);
    };

    let mut files = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            matches!(
                path.extension().and_then(|value| value.to_str()),
                Some("ldb" | "log")
            )
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
            .map(std::cmp::Reverse)
    });

    for file in files {
        let contents = fs::read(&file)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", file.display())))?;
        if let Some(token) = extract_workos_token_from_bytes(&contents) {
            return Ok(Some(token));
        }
        if let Some(token) = extract_workos_token_from_strings(&file)? {
            return Ok(Some(token));
        }
    }

    Ok(None)
}

fn read_workos_token_from_safari_sqlite(
    sqlite_path: &Path,
) -> Result<Option<WorkOsTokenMatch>, ProviderError> {
    let tables = run_sqlite_query(
        sqlite_path,
        "select name from sqlite_master where type='table' order by name;",
    )?;
    let table = tables
        .lines()
        .map(str::trim)
        .find(|name| *name == "ItemTable" || *name == "localstorage");
    let Some(table) = table else {
        return Ok(None);
    };

    let refresh_token =
        read_sqlite_local_storage_value(sqlite_path, table, "workos:refresh-token")?;
    let Some(refresh_token) = refresh_token.filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let access_token = read_sqlite_local_storage_value(sqlite_path, table, "workos:access-token")?;
    let organization_id = extract_organization_id(access_token.as_deref());
    Ok(Some(WorkOsTokenMatch {
        refresh_token,
        access_token,
        organization_id,
    }))
}

fn read_sqlite_local_storage_value(
    sqlite_path: &Path,
    table: &str,
    key: &str,
) -> Result<Option<String>, ProviderError> {
    let escaped_key = key.replace('\'', "''");
    let query = format!("select hex(value) from {table} where key = '{escaped_key}' limit 1;");
    let output = run_sqlite_query(sqlite_path, &query)?;
    let hex_value = output.lines().next().map(str::trim).unwrap_or_default();
    if hex_value.is_empty() {
        return Ok(None);
    }
    let raw = hex::decode(hex_value)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", sqlite_path.display())))?;
    let value = decode_value_bytes(&raw);
    Ok(value.filter(|decoded| !decoded.is_empty()))
}

fn extract_workos_token_from_bytes(data: &[u8]) -> Option<WorkOsTokenMatch> {
    let contents = decode_bytes(data);
    if !contents.contains("workos:refresh-token") {
        return None;
    }

    let refresh_token =
        regex::Regex::new(r"workos:refresh-token[^A-Za-z0-9_-]*([A-Za-z0-9_-]{20,})")
            .ok()?
            .captures_iter(&contents)
            .filter_map(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
            .last()?;
    let access_token =
        regex::Regex::new(r"workos:access-token[^A-Za-z0-9_.-]*([A-Za-z0-9_.-]{20,})")
            .ok()?
            .captures_iter(&contents)
            .filter_map(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
            .last();
    let organization_id = extract_organization_id(access_token.as_deref());

    Some(WorkOsTokenMatch {
        refresh_token,
        access_token,
        organization_id,
    })
}

fn extract_workos_token_from_strings(
    path: &Path,
) -> Result<Option<WorkOsTokenMatch>, ProviderError> {
    let output = run_command("strings", &["-n", "8", &path.display().to_string()])?;
    let lines = output.lines().collect::<Vec<_>>();

    let refresh_token = find_neighbor_token(&lines, &["workos:refresh-token", "refresh-token"]);
    let Some(refresh_token) = refresh_token else {
        return Ok(None);
    };
    let access_token = find_neighbor_token(&lines, &["workos:access-token", "access-token"]);
    let organization_id = extract_organization_id(access_token.as_deref());
    Ok(Some(WorkOsTokenMatch {
        refresh_token,
        access_token,
        organization_id,
    }))
}

fn find_neighbor_token(lines: &[&str], markers: &[&str]) -> Option<String> {
    let token_regex = regex::Regex::new(r"([A-Za-z0-9_.-]{20,})").ok()?;

    for (index, line) in lines.iter().enumerate() {
        if !markers.iter().any(|marker| line.contains(marker)) {
            continue;
        }

        let current_line_match = token_regex
            .captures_iter(line)
            .filter_map(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
            .last();
        if current_line_match.is_some() {
            return current_line_match;
        }

        for candidate in lines.iter().skip(index + 1).take(3) {
            let token = token_regex
                .captures_iter(candidate)
                .filter_map(|captures| captures.get(1))
                .map(|value| value.as_str().to_string())
                .last();
            if token.is_some() {
                return token;
            }
        }
    }

    None
}

fn extract_organization_id(token: Option<&str>) -> Option<String> {
    let payload = decode_jwt_payload(token?)?;
    read_string_claim(&payload, &["org_id", "organization_id"])
}

fn read_string_claim(payload: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = payload.get(*key).and_then(|value| value.as_str()) {
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn decode_bytes(data: &[u8]) -> String {
    match String::from_utf8(data.to_vec()) {
        Ok(value) => value,
        Err(_) => String::from_utf8_lossy(data).to_string(),
    }
}

fn decode_value_bytes(data: &[u8]) -> Option<String> {
    String::from_utf16(
        &data
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>(),
    )
    .ok()
    .map(|value| value.trim_matches(char::from(0)).trim().to_string())
    .filter(|value| !value.is_empty())
    .or_else(|| {
        String::from_utf8(data.to_vec())
            .ok()
            .map(|value| value.trim_matches(char::from(0)).trim().to_string())
            .filter(|value| !value.is_empty())
    })
    .or_else(|| {
        Some(
            data.iter()
                .map(|byte| char::from(*byte))
                .collect::<String>()
                .trim_matches(char::from(0))
                .trim()
                .to_string(),
        )
        .filter(|value| !value.is_empty())
    })
}

fn dedupe_tokens(tokens: &mut Vec<FactoryWorkOsToken>) {
    let mut deduped = Vec::with_capacity(tokens.len());
    for token in tokens.drain(..) {
        if deduped
            .iter()
            .any(|existing: &FactoryWorkOsToken| existing.refresh_token == token.refresh_token)
        {
            continue;
        }
        deduped.push(token);
    }
    *tokens = deduped;
}

fn walk_dir(root: &Path) -> Result<Vec<PathBuf>, ProviderError> {
    let mut paths = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
        for entry in entries.flatten() {
            let child = entry.path();
            if child.is_dir() {
                stack.push(child);
            } else {
                paths.push(child);
            }
        }
    }
    Ok(paths)
}
