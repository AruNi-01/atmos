use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use crate::error::{LlmError, Result};
use crate::types::{LlmFeature, LlmProvidersFile, ResolvedLlmProvider};

const DEFAULT_TIMEOUT_MS: u64 = 8_000;

#[derive(Debug, Clone)]
pub struct FileLlmConfigStore {
    path: PathBuf,
}

impl FileLlmConfigStore {
    pub fn new() -> Result<Self> {
        let home = dirs::home_dir().ok_or(LlmError::HomeDirNotFound)?;
        Ok(Self {
            path: home.join(".atmos").join("llm").join("providers.json"),
        })
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    pub fn load(&self) -> Result<LlmProvidersFile> {
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(LlmProvidersFile::default());
            }
            Err(error) => return Err(error.into()),
        };
        if contents.trim().is_empty() {
            return Ok(LlmProvidersFile::default());
        }
        Ok(serde_json::from_str(&contents)?)
    }

    pub fn save(&self, config: &LlmProvidersFile) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let contents = serde_json::to_string_pretty(config)?;
        fs::write(&self.path, contents)?;
        set_private_permissions(&self.path)?;
        Ok(())
    }

    pub fn resolve_for_feature(&self, feature: LlmFeature) -> Result<Option<ResolvedLlmProvider>> {
        let config = self.load()?;
        resolve_feature_config(&config, feature)
    }
}

pub fn resolve_feature_config(
    config: &LlmProvidersFile,
    feature: LlmFeature,
) -> Result<Option<ResolvedLlmProvider>> {
    let provider_id = config
        .features
        .provider_for(feature)
        .or(config.default_provider.as_deref());

    let Some(provider_id) = provider_id else {
        return Ok(None);
    };

    let Some(entry) = config.providers.get(provider_id) else {
        return Err(LlmError::InvalidConfig(format!(
            "Feature `{}` references missing provider `{}`",
            feature.as_str(),
            provider_id
        )));
    };

    if !entry.enabled {
        return Ok(None);
    }

    let base_url = entry.base_url.trim();
    if base_url.is_empty() {
        return Err(LlmError::InvalidConfig(format!(
            "Provider `{}` has an empty base_url",
            provider_id
        )));
    }

    let model = entry.model.trim();
    if model.is_empty() {
        return Err(LlmError::InvalidConfig(format!(
            "Provider `{}` has an empty model",
            provider_id
        )));
    }

    let api_key = resolve_api_key(provider_id, &entry.api_key)?;

    Ok(Some(ResolvedLlmProvider {
        id: provider_id.to_string(),
        kind: entry.kind,
        base_url: base_url.to_string(),
        api_key,
        model: model.to_string(),
        timeout: Duration::from_millis(entry.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)),
    }))
}

fn resolve_api_key(provider_id: &str, raw_value: &str) -> Result<String> {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return Err(LlmError::MissingApiKey(provider_id.to_string()));
    }

    if let Some(env_key) = trimmed.strip_prefix("env:") {
        let env_key = env_key.trim();
        if env_key.is_empty() {
            return Err(LlmError::MissingApiKey(provider_id.to_string()));
        }
        let value = std::env::var(env_key)
            .map_err(|_| LlmError::MissingEnvironmentVariable(env_key.to_string()))?;
        let value = value.trim().to_string();
        if value.is_empty() {
            return Err(LlmError::MissingApiKey(provider_id.to_string()));
        }
        return Ok(value);
    }

    Ok(trimmed.to_string())
}

#[cfg(unix)]
fn set_private_permissions(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &PathBuf) -> Result<()> {
    Ok(())
}
