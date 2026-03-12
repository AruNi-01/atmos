use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use crate::error::{LlmError, Result};
use crate::types::{
    LlmFeature, LlmProvidersFile, ResolvedLlmProvider, SessionTitleFormatConfig,
};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_GIT_COMMIT_PROMPT: &str =
    include_str!("../../../prompt/git-commit/git-commit-generator.md");

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

    pub fn llm_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or(LlmError::HomeDirNotFound)?;
        Ok(home.join(".atmos").join("llm"))
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
        write_private_file(&self.path, contents.as_bytes())?;
        Ok(())
    }

    pub fn resolve_for_feature(&self, feature: LlmFeature) -> Result<Option<ResolvedLlmProvider>> {
        let config = self.load()?;
        resolve_feature_config(&config, feature)
    }

    pub fn load_session_title_format(&self) -> Result<SessionTitleFormatConfig> {
        Ok(self.load()?.features.session_title_format)
    }
}

pub fn default_git_commit_prompt() -> &'static str {
    DEFAULT_GIT_COMMIT_PROMPT
}

pub fn resolve_feature_config(
    config: &LlmProvidersFile,
    feature: LlmFeature,
) -> Result<Option<ResolvedLlmProvider>> {
    let provider_id = config.features.provider_for(feature);

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
        max_output_tokens: entry.max_output_tokens,
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
fn write_private_file(path: &PathBuf, contents: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| LlmError::InvalidConfig("Missing parent directory for llm config".into()))?;

    let (temp_path, mut file) = open_private_temp_file(path)?;
    file.write_all(contents)?;
    file.sync_all()?;
    drop(file);

    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error.into());
    }

    let dir = OpenOptions::new().read(true).open(parent)?;
    dir.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private_file(path: &PathBuf, contents: &[u8]) -> Result<()> {
    fs::write(path, contents)?;
    set_private_permissions(path)?;
    Ok(())
}

fn temporary_write_path(path: &PathBuf, attempt: u32) -> PathBuf {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("providers.json");
    path.with_file_name(format!(".{file_name}.{pid}.{nanos}.{attempt}.tmp"))
}

#[cfg(unix)]
fn open_private_temp_file(path: &PathBuf) -> Result<(PathBuf, fs::File)> {
    use std::os::unix::fs::OpenOptionsExt;

    for attempt in 0..8 {
        let temp_path = temporary_write_path(path, attempt);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(LlmError::InvalidConfig(
        "Failed to allocate temporary llm config file".into(),
    ))
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &PathBuf) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{default_git_commit_prompt, FileLlmConfigStore};
    use crate::types::LlmProvidersFile;
    use std::fs;

    fn unique_test_path(name: &str) -> std::path::PathBuf {
        let pid = std::process::id();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        std::env::temp_dir()
            .join(format!("atmos-llm-test-{pid}-{nanos}"))
            .join(name)
    }

    #[test]
    #[cfg(unix)]
    fn save_creates_private_file() {
        use std::os::unix::fs::PermissionsExt;

        let path = unique_test_path("providers.json");
        let store = FileLlmConfigStore { path: path.clone() };

        store
            .save(&LlmProvidersFile::default())
            .expect("save config");

        let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(path.parent().unwrap());
    }

    #[test]
    fn default_git_commit_prompt_is_non_empty() {
        let prompt = default_git_commit_prompt().trim().to_string();

        assert!(!prompt.is_empty());
        assert!(prompt.contains("Conventional Commits format"));
    }
}
