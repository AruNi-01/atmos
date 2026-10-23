use crate::models::QuotaOverview;
use crate::support::parse_offset_datetime;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LegacyRefreshStateFile {
    #[serde(default)]
    all_updated_at_utc: Option<String>,
    #[serde(default)]
    provider_updated_at_utc: BTreeMap<String, String>,
}

/// Fresh installs and unknown providers stay off until the user opts in
/// (onboarding Quota Usage step or Settings). Avoids cold-start Keychain /
/// browser-cookie probes on first launch.
fn default_provider_switch() -> bool {
    false
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ProviderStateEntry {
    #[serde(default)]
    pub(crate) updated_at_utc: Option<String>,
    #[serde(default = "default_provider_switch")]
    pub(crate) switch: bool,
    #[serde(default)]
    pub(crate) footer_carousel_show: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ProviderStateFile {
    #[serde(default)]
    all_updated_at_utc: Option<String>,
    #[serde(default)]
    providers: BTreeMap<String, ProviderStateEntry>,
    #[serde(default)]
    auto_refresh_interval_minutes: Option<u64>,
    #[serde(default)]
    provider_order: Vec<String>,
    #[serde(default)]
    provider_order_revision: u64,
}

fn provider_state_path() -> Option<PathBuf> {
    crate::paths::data_path("provider_state.json")
}

fn legacy_refresh_state_path() -> Option<PathBuf> {
    crate::paths::resolve_data_file("refresh-state.json")
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

/// One process-wide lock for every read-modify-write of `provider_state.json`.
/// WebSocket handlers and refresh run concurrently; separate loads would drop
/// a switch or an order when two saves write the file back.
fn lock_provider_state() -> MutexGuard<'static, ()> {
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|err| err.into_inner())
}

fn load_provider_state_unlocked() -> ProviderStateFile {
    if let Some(path) = crate::paths::resolve_data_file("provider_state.json") {
        if path.is_file() {
            if let Some(state) = read_json_file::<ProviderStateFile>(&path) {
                return state;
            }
        }
    }

    if let Some(path) = legacy_refresh_state_path() {
        if path.is_file() {
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
                                    footer_carousel_show: false,
                                },
                            )
                        })
                        .collect(),
                    auto_refresh_interval_minutes: None,
                    provider_order: Vec::new(),
                    provider_order_revision: 0,
                };
            }
        }
    }

    ProviderStateFile::default()
}

fn save_provider_state_unlocked(state: &ProviderStateFile) {
    let Some(path) = provider_state_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    let _ = fs::create_dir_all(parent);
    let Ok(contents) = serde_json::to_string_pretty(state) else {
        return;
    };
    // Same directory, then rename, so a crash mid-write cannot truncate the live file.
    let tmp = parent.join(format!("provider_state.json.{}.tmp", std::process::id()));
    if fs::write(&tmp, contents).is_err() {
        let _ = fs::remove_file(&tmp);
        return;
    }
    if fs::rename(&tmp, &path).is_err() {
        let _ = fs::remove_file(&tmp);
    }
}

fn load_provider_state() -> ProviderStateFile {
    let _guard = lock_provider_state();
    load_provider_state_unlocked()
}

fn mutate_provider_state(mutate: impl FnOnce(&mut ProviderStateFile)) {
    let _guard = lock_provider_state();
    let mut state = load_provider_state_unlocked();
    mutate(&mut state);
    save_provider_state_unlocked(&state);
}

pub(crate) fn provider_switch_enabled(provider_id: &str) -> bool {
    load_provider_state()
        .providers
        .get(provider_id)
        .map(|entry| entry.switch)
        .unwrap_or(false)
}

pub(crate) fn load_auto_refresh_interval_minutes() -> Option<u64> {
    load_provider_state().auto_refresh_interval_minutes
}

pub(crate) fn persist_provider_order(provider_order: &[String]) {
    mutate_provider_state(|state| {
        let mut seen = std::collections::HashSet::new();
        let next = provider_order
            .iter()
            .filter(|id| !id.is_empty() && seen.insert((*id).clone()))
            .cloned()
            .collect::<Vec<_>>();
        if next == state.provider_order {
            return;
        }
        state.provider_order = next;
        state.provider_order_revision = state.provider_order_revision.saturating_add(1);
    });
}

pub(crate) fn persist_auto_refresh_interval_minutes(interval_minutes: Option<u64>) {
    mutate_provider_state(|state| {
        state.auto_refresh_interval_minutes = interval_minutes;
    });
}

pub(crate) fn persist_provider_state_for_overview(
    overview: &QuotaOverview,
    refreshed_provider_ids: &[String],
) {
    let now = utc_now_rfc3339();
    mutate_provider_state(|state| {
        state.all_updated_at_utc = Some(now.clone());

        for provider in &overview.providers {
            let entry = state.providers.entry(provider.id.clone()).or_default();
            entry.switch = provider.switch_enabled;
            if refreshed_provider_ids
                .iter()
                .any(|provider_id| provider_id == &provider.id)
            {
                entry.updated_at_utc = Some(now.clone());
            }
        }
    });
}

pub(crate) fn persist_provider_state_for_provider(provider_id: &str, switch_enabled: bool) {
    let now = utc_now_rfc3339();
    mutate_provider_state(|state| {
        let entry = state.providers.entry(provider_id.to_string()).or_default();
        entry.switch = switch_enabled;
        entry.updated_at_utc = Some(now);
    });
}

pub(crate) fn persist_provider_switch(provider_id: &str, switch_enabled: bool) {
    mutate_provider_state(|state| {
        let entry = state.providers.entry(provider_id.to_string()).or_default();
        entry.switch = switch_enabled;
    });
}

pub(crate) fn persist_provider_footer_carousel_show(provider_id: &str, enabled: bool) {
    mutate_provider_state(|state| {
        let entry = state.providers.entry(provider_id.to_string()).or_default();
        entry.footer_carousel_show = enabled;
    });
}

pub(crate) fn persist_all_provider_switch(provider_ids: &[String], switch_enabled: bool) {
    mutate_provider_state(|state| {
        for provider_id in provider_ids {
            let entry = state.providers.entry(provider_id.clone()).or_default();
            entry.switch = switch_enabled;
        }
    });
}

/// Batch-write switch + footer carousel flags without refreshing provider data.
pub(crate) fn persist_provider_visibility_batch(prefs: &[(String, bool, bool)]) {
    if prefs.is_empty() {
        return;
    }
    mutate_provider_state(|state| {
        for (provider_id, switch_enabled, footer_carousel_show) in prefs {
            let entry = state.providers.entry(provider_id.clone()).or_default();
            entry.switch = *switch_enabled;
            entry.footer_carousel_show = *footer_carousel_show;
        }
    });
}

pub(crate) fn apply_provider_state(mut overview: QuotaOverview) -> QuotaOverview {
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
            provider.footer_carousel_show = entry.footer_carousel_show;
            if let Some(updated_at) = entry
                .updated_at_utc
                .as_deref()
                .and_then(parse_offset_datetime)
                .map(|value| value.unix_timestamp() as u64)
            {
                provider.last_updated_at = Some(updated_at);
            }
        } else {
            provider.switch_enabled = false;
            provider.footer_carousel_show = false;
        }
    }

    overview.provider_order = state.provider_order;
    overview.provider_order_revision = state.provider_order_revision;
    overview
}

#[cfg(test)]
pub(crate) fn provider_order_snapshot() -> (Vec<String>, u64) {
    let state = load_provider_state();
    (state.provider_order, state.provider_order_revision)
}

pub(crate) fn utc_now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}
