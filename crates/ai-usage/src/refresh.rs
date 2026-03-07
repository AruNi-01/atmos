use crate::models::UsageOverview;
use crate::support::parse_offset_datetime;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LegacyRefreshStateFile {
    #[serde(default)]
    all_updated_at_utc: Option<String>,
    #[serde(default)]
    provider_updated_at_utc: BTreeMap<String, String>,
}

fn default_provider_switch() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ProviderStateEntry {
    #[serde(default)]
    pub(crate) updated_at_utc: Option<String>,
    #[serde(default = "default_provider_switch")]
    pub(crate) switch: bool,
}

impl Default for ProviderStateEntry {
    fn default() -> Self {
        Self {
            updated_at_utc: None,
            switch: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ProviderStateFile {
    #[serde(default)]
    all_updated_at_utc: Option<String>,
    #[serde(default)]
    providers: BTreeMap<String, ProviderStateEntry>,
}

fn provider_state_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| {
        home.join(".atmos")
            .join("ai-usage")
            .join("provider_state.json")
    })
}

fn legacy_refresh_state_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| {
        home.join(".atmos")
            .join("ai-usage")
            .join("refresh-state.json")
    })
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn load_provider_state() -> ProviderStateFile {
    if let Some(path) = provider_state_path() {
        if let Some(state) = read_json_file::<ProviderStateFile>(&path) {
            return state;
        }
    }

    if let Some(path) = legacy_refresh_state_path() {
        if let Some(state) = read_json_file::<LegacyRefreshStateFile>(&path) {
            return ProviderStateFile {
                all_updated_at_utc: state.all_updated_at_utc,
                providers: state
                    .provider_updated_at_utc
                    .into_iter()
                    .map(|(provider_id, updated_at_utc)| {
                        (
                            provider_id,
                            ProviderStateEntry {
                                updated_at_utc: Some(updated_at_utc),
                                switch: true,
                            },
                        )
                    })
                    .collect(),
            };
        }
    }

    ProviderStateFile::default()
}

fn save_provider_state(state: &ProviderStateFile) {
    let Some(path) = provider_state_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, contents);
    }
}

pub(crate) fn provider_switch_enabled(provider_id: &str) -> bool {
    load_provider_state()
        .providers
        .get(provider_id)
        .map(|entry| entry.switch)
        .unwrap_or(true)
}

pub(crate) fn persist_provider_state_for_overview(
    overview: &UsageOverview,
    refreshed_provider_ids: &[String],
) {
    let mut state = load_provider_state();
    let now = utc_now_rfc3339();
    state.all_updated_at_utc = Some(now.clone());

    for provider in &overview.providers {
        let entry = state.providers.entry(provider.id.clone()).or_default();
        entry.switch = provider.switch_enabled;
        if refreshed_provider_ids.iter().any(|provider_id| provider_id == &provider.id) {
            entry.updated_at_utc = Some(now.clone());
        }
    }

    save_provider_state(&state);
}

pub(crate) fn persist_provider_state_for_provider(provider_id: &str, switch_enabled: bool) {
    let mut state = load_provider_state();
    let entry = state.providers.entry(provider_id.to_string()).or_default();
    entry.switch = switch_enabled;
    entry.updated_at_utc = Some(utc_now_rfc3339());
    save_provider_state(&state);
}

pub(crate) fn persist_provider_switch(provider_id: &str, switch_enabled: bool) {
    let mut state = load_provider_state();
    let entry = state.providers.entry(provider_id.to_string()).or_default();
    entry.switch = switch_enabled;
    save_provider_state(&state);
}

pub(crate) fn persist_all_provider_switch(provider_ids: &[String], switch_enabled: bool) {
    let mut state = load_provider_state();
    for provider_id in provider_ids {
        let entry = state.providers.entry(provider_id.clone()).or_default();
        entry.switch = switch_enabled;
    }
    save_provider_state(&state);
}

pub(crate) fn apply_provider_state(mut overview: UsageOverview) -> UsageOverview {
    let state = load_provider_state();

    if let Some(all_updated_at) = state
        .all_updated_at_utc
        .as_deref()
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64)
    {
        overview.generated_at = all_updated_at;
    }

    for provider in &mut overview.providers {
        if let Some(entry) = state.providers.get(&provider.id) {
            provider.switch_enabled = entry.switch;
            if let Some(updated_at) = entry
                .updated_at_utc
                .as_deref()
                .and_then(parse_offset_datetime)
                .map(|value| value.unix_timestamp() as u64)
            {
                provider.last_updated_at = Some(updated_at);
            }
        } else {
            provider.switch_enabled = true;
        }
    }

    overview
}

pub(crate) fn utc_now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}
