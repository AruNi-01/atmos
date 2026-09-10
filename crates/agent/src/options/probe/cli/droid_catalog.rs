//! Factory Droid model groups and credit multipliers.
//!
//! `droid exec --help` lists ids/labels but not multipliers. Each options
//! probe fetches https://docs.factory.ai/models.md in parallel with the CLI
//! list. A successful fetch replaces the last-good catalog. A failed fetch
//! keeps the previous catalog and never blocks the model list.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::contract::AgentModel;

use super::droid::droid_fast_wire_id;

const FACTORY_MODELS_MD: &str = "https://docs.factory.ai/models.md";
const FETCH_TIMEOUT: Duration = Duration::from_secs(6);
const CATALOG_FILE: &str = "factory-droid-catalog.json";

const GROUP_ORDER: &[&str] = &[
    "Anthropic",
    "OpenAI",
    "Google",
    "xAI",
    "Droid Core",
    "Custom",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DroidCatalogRow {
    pub group: String,
    pub multiplier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedDroidCatalog {
    rows: HashMap<String, DroidCatalogRow>,
}

struct CatalogSlot {
    rows: Option<HashMap<String, DroidCatalogRow>>,
    /// True when this process just fetched a fresh docs snapshot.
    fresh: bool,
    path: Option<PathBuf>,
}

fn catalog_slot() -> &'static Mutex<CatalogSlot> {
    static SLOT: OnceLock<Mutex<CatalogSlot>> = OnceLock::new();
    SLOT.get_or_init(|| {
        Mutex::new(CatalogSlot {
            rows: None,
            fresh: false,
            path: None,
        })
    })
}

pub fn set_droid_catalog_path(path: PathBuf) {
    if let Ok(mut slot) = catalog_slot().lock() {
        slot.path = Some(path);
    }
}

pub fn droid_catalog_path(probe_root: &Path) -> PathBuf {
    probe_root.join(CATALOG_FILE)
}

fn persist_path(slot: &CatalogSlot) -> Option<PathBuf> {
    if let Some(path) = &slot.path {
        return Some(path.clone());
    }
    if cfg!(test) {
        return None;
    }
    Some(
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".atmos")
            .join("data")
            .join("agent")
            .join("options-probe")
            .join(CATALOG_FILE),
    )
}

fn load_persisted(path: &Path) -> Option<HashMap<String, DroidCatalogRow>> {
    let text = std::fs::read_to_string(path).ok()?;
    let parsed: PersistedDroidCatalog = serde_json::from_str(&text).ok()?;
    (!parsed.rows.is_empty()).then_some(parsed.rows)
}

fn save_persisted(path: &Path, rows: &HashMap<String, DroidCatalogRow>) {
    let Ok(json) = serde_json::to_string_pretty(&PersistedDroidCatalog { rows: rows.clone() })
    else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

fn ensure_last_good_loaded(slot: &mut CatalogSlot) {
    if slot.rows.is_some() {
        return;
    }
    let Some(path) = persist_path(slot) else {
        return;
    };
    if let Some(rows) = load_persisted(&path) {
        slot.rows = Some(rows);
        slot.fresh = false;
    }
}

/// Fetch Factory docs. Success replaces last-good on disk. Failure leaves
/// last-good untouched and does not fail the model list.
pub async fn refresh_droid_factory_catalog(path: &Path) {
    set_droid_catalog_path(path.to_path_buf());
    match fetch_factory_model_catalog().await {
        Some(catalog) => {
            save_persisted(path, &catalog);
            if let Ok(mut slot) = catalog_slot().lock() {
                slot.path = Some(path.to_path_buf());
                slot.rows = Some(catalog);
                slot.fresh = true;
            }
        }
        None => {
            if let Ok(mut slot) = catalog_slot().lock() {
                slot.path = Some(path.to_path_buf());
                slot.fresh = false;
                ensure_last_good_loaded(&mut slot);
            }
        }
    }
}

fn active_catalog() -> Option<(HashMap<String, DroidCatalogRow>, bool)> {
    let mut slot = catalog_slot().lock().ok()?;
    ensure_last_good_loaded(&mut slot);
    Some((slot.rows.clone()?, slot.fresh))
}

/// Stamp group / multiplier from the last Factory docs snapshot.
///
/// Fresh snapshot (this probe fetched docs): overwrite. Stale last-good
/// (fetch failed): fill only missing fields so a previous probe is kept.
/// No snapshot: leave models alone.
pub fn overlay_droid_model_catalog(models: &mut Vec<AgentModel>) {
    let Some((catalog, fresh)) = active_catalog() else {
        return;
    };
    overlay_droid_model_catalog_with(models, &catalog, fresh);
}

pub fn overlay_droid_model_catalog_with(
    models: &mut Vec<AgentModel>,
    catalog: &HashMap<String, DroidCatalogRow>,
    replace: bool,
) {
    if models.is_empty() || catalog.is_empty() {
        return;
    }
    for model in models.iter_mut() {
        if let Some(row) = catalog.get(&model.id) {
            if replace || model.group.is_none() {
                model.group = Some(row.group.clone());
            }
            if replace || model.multiplier.is_none() {
                model.multiplier = Some(row.multiplier.clone());
            }
        } else if replace && model.group.is_none() {
            model.group = infer_droid_group(&model.id, &model.label);
        }
        if model.group.as_deref() == Some("Droid Core") {
            let cleaned = model.label.replace(" (Droid Core)", "").trim().to_string();
            if !cleaned.is_empty() {
                model.label = cleaned;
            }
        }
        if model.fast {
            let wire = droid_fast_wire_id(&model.id);
            if let Some(row) = catalog.get(&wire) {
                if replace || model.fast_multiplier.is_none() {
                    model.fast_multiplier = Some(row.multiplier.clone());
                }
            } else if replace {
                model.fast_multiplier = None;
            }
        }
    }
    if models.iter().any(|model| model.group.is_some()) {
        sort_droid_models(models);
    }
}

pub fn infer_droid_group(id: &str, label: &str) -> Option<String> {
    let id = id.trim().to_ascii_lowercase();
    if id.is_empty() || id == "auto" {
        return None;
    }
    if id.starts_with("custom:") {
        return Some("Custom".into());
    }
    if id.starts_with("claude") {
        return Some("Anthropic".into());
    }
    if id.starts_with("gpt-") {
        return Some("OpenAI".into());
    }
    if id.starts_with("gemini") {
        return Some("Google".into());
    }
    if id.starts_with("grok") {
        return Some("xAI".into());
    }
    if label.to_ascii_lowercase().contains("droid core") {
        return Some("Droid Core".into());
    }
    Some("Droid Core".into())
}

fn sort_droid_models(models: &mut [AgentModel]) {
    let ranked: Vec<(usize, u8)> = models
        .iter()
        .enumerate()
        .map(|(index, model)| (index, group_rank(model.group.as_deref())))
        .collect();
    let mut order: Vec<usize> = (0..models.len()).collect();
    order.sort_by_key(|index| (ranked[*index].1, ranked[*index].0));
    let original: Vec<AgentModel> = models.to_vec();
    for (dest, src) in order.into_iter().enumerate() {
        models[dest] = original[src].clone();
    }
}

fn group_rank(group: Option<&str>) -> u8 {
    match group {
        None => 0,
        Some(name) => GROUP_ORDER
            .iter()
            .position(|item| *item == name)
            .map(|index| (index as u8) + 1)
            .unwrap_or(GROUP_ORDER.len() as u8),
    }
}

pub fn parse_factory_models_md(markdown: &str) -> HashMap<String, DroidCatalogRow> {
    let mut catalog = HashMap::new();
    let mut group = String::new();
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(next) = heading_group(trimmed) {
            group = next;
            continue;
        }
        if group.is_empty() {
            continue;
        }
        let Some((id, multiplier)) = table_model_row(trimmed) else {
            continue;
        };
        catalog.insert(
            id,
            DroidCatalogRow {
                group: group.clone(),
                multiplier,
            },
        );
    }
    catalog
}

fn heading_group(line: &str) -> Option<String> {
    let stripped = strip_tags(line);
    let heading = stripped.trim_start_matches('#').trim();
    if heading.is_empty() {
        return None;
    }
    let lower = heading.to_ascii_lowercase();
    if lower.contains("anthropic") {
        return Some("Anthropic".into());
    }
    if lower.contains("openai") {
        return Some("OpenAI".into());
    }
    if lower.contains("google") {
        return Some("Google".into());
    }
    if lower.contains("xai") || lower.contains("x.ai") {
        return Some("xAI".into());
    }
    if lower.contains("droid core") {
        return Some("Droid Core".into());
    }
    if lower.contains("custom") {
        return Some("Custom".into());
    }
    None
}

fn table_model_row(line: &str) -> Option<(String, String)> {
    if !line.starts_with('|') {
        return None;
    }
    let cells: Vec<String> = line
        .split('|')
        .map(|cell| strip_tags(cell).trim().to_string())
        .filter(|cell| !cell.is_empty())
        .collect();
    if cells.len() < 3 {
        return None;
    }
    if cells[0].eq_ignore_ascii_case("model") {
        return None;
    }
    if cells.iter().all(|cell| cell.chars().all(|ch| ch == '-')) {
        return None;
    }
    let id = cells[1].trim_matches('`').trim().to_string();
    if id.is_empty() || id.contains(' ') {
        return None;
    }
    let multiplier = normalize_multiplier(&cells[2])?;
    Some((id, multiplier))
}

fn normalize_multiplier(raw: &str) -> Option<String> {
    let compact = raw.trim().replace(['×', 'X', '*'], "x").replace(' ', "");
    let number = compact.trim_end_matches('x');
    let value: f64 = number.parse().ok()?;
    if value <= 0.0 {
        return None;
    }
    Some(format!("{value}x"))
}

fn strip_tags(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

pub async fn fetch_factory_model_catalog() -> Option<HashMap<String, DroidCatalogRow>> {
    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("atmos")
        .build()
        .ok()?;
    let text = client
        .get(FACTORY_MODELS_MD)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .await
        .ok()?;
    let catalog = parse_factory_models_md(&text);
    (!catalog.is_empty()).then_some(catalog)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_factory_docs_tables() {
        let md = r#"
## Anthropic
| Model | Model ID | Multiplier | Reasoning |
| --- | --- | --- | --- |
| Claude Opus 5 | `claude-opus-5` | 2× | `high` |
| Claude Opus 5 Fast | `claude-opus-5-fast` | 4× | `high` |

## OpenAI
| GPT-5.6 Sol | `gpt-5.6-sol` | 2× | `medium` |
| GPT-5.6 Sol Fast | `gpt-5.6-sol-fast` | 4× | `medium` |
| GPT-5.6 Luna | `gpt-5.6-luna` | 0.08× | `medium` |
"#;
        let catalog = parse_factory_models_md(md);
        assert_eq!(catalog["claude-opus-5"].group, "Anthropic");
        assert_eq!(catalog["claude-opus-5"].multiplier, "2x");
        assert_eq!(catalog["claude-opus-5-fast"].multiplier, "4x");
        assert_eq!(catalog["gpt-5.6-sol"].group, "OpenAI");
        assert_eq!(catalog["gpt-5.6-luna"].multiplier, "0.08x");
    }

    fn sample_catalog() -> HashMap<String, DroidCatalogRow> {
        parse_factory_models_md(
            r#"
## OpenAI
| GPT-5.6 Sol | `gpt-5.6-sol` | 2× | `medium` |
| GPT-5.6 Sol Fast | `gpt-5.6-sol-fast` | 4× | `medium` |
"#,
        )
    }

    #[test]
    fn overlay_stamps_group_and_fast_multiplier() {
        let mut models = vec![
            AgentModel {
                id: "gpt-5.6-sol".into(),
                label: "GPT-5.6 Sol".into(),
                fast: true,
                ..Default::default()
            },
            AgentModel {
                id: "gpt-6-astra".into(),
                label: "GPT-6 Astra".into(),
                ..Default::default()
            },
            AgentModel {
                id: "auto".into(),
                label: "Auto Model".into(),
                is_default: true,
                ..Default::default()
            },
        ];
        overlay_droid_model_catalog_with(&mut models, &sample_catalog(), true);
        assert_eq!(models[0].id, "auto");
        assert!(models[0].group.is_none());
        let sol = models.iter().find(|item| item.id == "gpt-5.6-sol").unwrap();
        assert_eq!(sol.group.as_deref(), Some("OpenAI"));
        assert_eq!(sol.multiplier.as_deref(), Some("2x"));
        assert_eq!(sol.fast_multiplier.as_deref(), Some("4x"));
        let astra = models.iter().find(|item| item.id == "gpt-6-astra").unwrap();
        assert_eq!(astra.group.as_deref(), Some("OpenAI"));
        assert!(astra.multiplier.is_none());
    }

    #[test]
    fn overlay_without_catalog_leaves_models_bare() {
        let mut models = vec![AgentModel {
            id: "gpt-5.6-sol".into(),
            label: "GPT-5.6 Sol".into(),
            ..Default::default()
        }];
        overlay_droid_model_catalog_with(&mut models, &HashMap::new(), true);
        assert!(models[0].group.is_none());
        assert!(models[0].multiplier.is_none());
    }

    #[test]
    fn stale_overlay_does_not_overwrite_existing_multiplier() {
        let mut models = vec![AgentModel {
            id: "gpt-5.6-sol".into(),
            label: "GPT-5.6 Sol".into(),
            group: Some("OpenAI".into()),
            multiplier: Some("9x".into()),
            fast: true,
            fast_multiplier: Some("8x".into()),
            ..Default::default()
        }];
        overlay_droid_model_catalog_with(&mut models, &sample_catalog(), false);
        assert_eq!(models[0].multiplier.as_deref(), Some("9x"));
        assert_eq!(models[0].fast_multiplier.as_deref(), Some("8x"));
    }

    #[test]
    fn last_good_file_stamps_when_memory_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("factory-droid-catalog.json");
        save_persisted(&path, &sample_catalog());
        let rows = load_persisted(&path).expect("persisted catalog");
        let mut models = vec![AgentModel {
            id: "gpt-5.6-sol".into(),
            label: "GPT-5.6 Sol".into(),
            fast: true,
            ..Default::default()
        }];
        overlay_droid_model_catalog_with(&mut models, &rows, false);
        assert_eq!(models[0].multiplier.as_deref(), Some("2x"));
        assert_eq!(models[0].fast_multiplier.as_deref(), Some("4x"));
    }

    #[test]
    fn fresh_overlay_replaces_stale_multiplier() {
        let mut models = vec![AgentModel {
            id: "gpt-5.6-sol".into(),
            label: "GPT-5.6 Sol".into(),
            group: Some("OpenAI".into()),
            multiplier: Some("9x".into()),
            fast: true,
            fast_multiplier: Some("8x".into()),
            ..Default::default()
        }];
        overlay_droid_model_catalog_with(&mut models, &sample_catalog(), true);
        assert_eq!(models[0].multiplier.as_deref(), Some("2x"));
        assert_eq!(models[0].fast_multiplier.as_deref(), Some("4x"));
    }
}
