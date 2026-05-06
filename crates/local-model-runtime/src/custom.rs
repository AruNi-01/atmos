use serde::{Deserialize, Serialize};

use crate::config::{custom_models_file, ensure_dirs};
use crate::error::Result;
use crate::manifest::{ModelEntry, ModelManifest};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CustomModelsFile {
    version: u32,
    #[serde(default)]
    models: Vec<ModelEntry>,
}

impl Default for CustomModelsFile {
    fn default() -> Self {
        Self {
            version: 1,
            models: Vec::new(),
        }
    }
}

pub fn load_custom_models() -> Result<Vec<ModelEntry>> {
    let path = custom_models_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(path)?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut file: CustomModelsFile = serde_json::from_str(&content)?;
    for model in &mut file.models {
        model.custom = true;
    }
    Ok(file.models)
}

pub fn upsert_custom_model(mut model: ModelEntry) -> Result<ModelEntry> {
    ensure_dirs()?;
    model.custom = true;

    let mut models = load_custom_models()?;
    if let Some(existing) = models.iter_mut().find(|entry| entry.id == model.id) {
        *existing = model.clone();
    } else {
        models.push(model.clone());
    }
    save_custom_models(models)?;
    Ok(model)
}

pub fn remove_custom_model(model_id: &str) -> Result<bool> {
    ensure_dirs()?;
    let mut models = load_custom_models()?;
    let before = models.len();
    models.retain(|model| model.id != model_id);
    let removed = models.len() != before;
    save_custom_models(models)?;
    Ok(removed)
}

pub fn merge_custom_models(manifest: &mut ModelManifest) -> Result<()> {
    let custom_models = load_custom_models()?;
    for model in custom_models {
        if let Some(existing) = manifest
            .models
            .iter_mut()
            .find(|entry| entry.id == model.id)
        {
            *existing = model;
        } else {
            manifest.models.push(model);
        }
    }
    Ok(())
}

fn save_custom_models(models: Vec<ModelEntry>) -> Result<()> {
    ensure_dirs()?;
    let path = custom_models_file()?;
    let file = CustomModelsFile { version: 1, models };
    let content = serde_json::to_string_pretty(&file)?;
    std::fs::write(path, content)?;
    Ok(())
}
