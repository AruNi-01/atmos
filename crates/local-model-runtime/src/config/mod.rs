use std::path::Path;
use std::path::PathBuf;

use crate::error::{LocalModelError, Result};

/// Root directory for all managed local model runtime data.
pub fn local_model_runtime_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or(LocalModelError::HomeDirNotFound)?;
    Ok(home.join(".atmos").join("local-model-runtime"))
}

/// Directory where model GGUF files are stored.
pub fn models_dir() -> Result<PathBuf> {
    Ok(local_model_runtime_dir()?.join("models"))
}

/// Directory where the llama-server binary lives.
pub fn bin_dir() -> Result<PathBuf> {
    Ok(local_model_runtime_dir()?.join("bin"))
}

/// Directory for llama-server runtime logs.
pub fn logs_dir() -> Result<PathBuf> {
    Ok(local_model_runtime_dir()?.join("logs"))
}

/// JSON file where user-added model entries are stored.
pub fn custom_models_file() -> Result<PathBuf> {
    Ok(local_model_runtime_dir()?.join("custom-models.json"))
}

/// Full path for a model's GGUF file.
pub fn model_path(model_id: &str) -> Result<PathBuf> {
    // Validate model_id to prevent path traversal
    let path = Path::new(model_id);
    if path.file_name() != Some(std::ffi::OsStr::new(model_id)) {
        return Err(LocalModelError::Runtime(format!(
            "Invalid model_id '{}': potential path traversal",
            model_id
        )));
    }
    Ok(models_dir()?.join(format!("{model_id}.gguf")))
}

/// Full path for the llama-server binary.
pub fn llama_server_bin() -> Result<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    Ok(bin_dir()?.join(name))
}

/// Ensure all required directories exist.
pub fn ensure_dirs() -> Result<()> {
    std::fs::create_dir_all(models_dir()?)?;
    std::fs::create_dir_all(bin_dir()?)?;
    std::fs::create_dir_all(logs_dir()?)?;
    Ok(())
}
