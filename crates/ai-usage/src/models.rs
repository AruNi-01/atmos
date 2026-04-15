use serde::{Deserialize, Serialize};
use thiserror::Error;

fn default_switch_enabled() -> bool {
    true
}

fn default_footer_carousel_show() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Cli,
    Desktop,
    Api,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthStateStatus {
    Detected,
    Missing,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FetchStateStatus {
    Ready,
    Unavailable,
    Partial,
    Error,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RowTone {
    Default,
    Muted,
    Success,
    Warning,
    Danger,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthState {
    pub status: AuthStateStatus,
    pub source: Option<String>,
    pub detail: Option<String>,
    pub setup_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FetchState {
    pub status: FetchStateStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubscriptionSummary {
    pub plan_label: Option<String>,
    pub window_label: Option<String>,
    pub credits_label: Option<String>,
    pub billing_state: Option<String>,
    pub reset_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageSummary {
    pub unit: Option<String>,
    pub currency: Option<String>,
    pub used: Option<f64>,
    pub remaining: Option<f64>,
    pub cap: Option<f64>,
    pub percent: Option<f64>,
    pub used_label: Option<String>,
    pub remaining_label: Option<String>,
    pub cap_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DetailRow {
    pub label: String,
    pub value: String,
    pub tone: RowTone,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DetailSection {
    pub title: String,
    pub rows: Vec<DetailRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderManualSetupOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConfiguredApiKey {
    pub id: String,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderManualSetup {
    pub selected_region: Option<String>,
    pub region_options: Vec<ProviderManualSetupOption>,
    pub api_key_configured: bool,
    #[serde(default)]
    pub configured_keys: Vec<ConfiguredApiKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    pub kind: ProviderKind,
    pub enabled: bool,
    #[serde(default = "default_switch_enabled")]
    pub switch_enabled: bool,
    #[serde(default = "default_footer_carousel_show")]
    pub footer_carousel_show: bool,
    pub healthy: bool,
    pub last_updated_at: Option<u64>,
    pub subscription_summary: Option<SubscriptionSummary>,
    pub usage_summary: Option<UsageSummary>,
    pub detail_sections: Vec<DetailSection>,
    pub warnings: Vec<String>,
    pub auth_state: AuthState,
    pub fetch_state: FetchState,
    #[serde(default)]
    pub manual_setup: Option<ProviderManualSetup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageAggregate {
    pub enabled_count: usize,
    pub total_count: usize,
    pub active_subscription_count: usize,
    pub comparable_credit_currency: Option<String>,
    pub total_credits_used: Option<f64>,
    pub total_credits_remaining: Option<f64>,
    pub near_limit_sources: Vec<String>,
    pub degraded_sources: Vec<String>,
    pub soonest_reset_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UsageFetchIssue {
    pub provider_id: String,
    pub provider_label: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoRefreshConfig {
    pub interval_minutes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageOverview {
    pub all: UsageAggregate,
    pub providers: Vec<ProviderStatus>,
    pub generated_at: u64,
    pub partial_failures: Vec<UsageFetchIssue>,
    #[serde(default)]
    pub auto_refresh: AutoRefreshConfig,
}
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Invalid usage snapshot: {0}")]
    InvalidSnapshot(String),
    #[error("Unable to read usage snapshot: {0}")]
    SnapshotIo(String),
    #[error("Usage fetch failed: {0}")]
    Fetch(String),
}
