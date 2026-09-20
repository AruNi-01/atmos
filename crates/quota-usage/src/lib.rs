mod config;
mod constants;
pub mod models;
mod paths;
mod providers;
mod refresh;
mod runtime;
mod service;
mod support;
#[cfg(test)]
mod tests;

pub use models::{
    AuthState, AuthStateStatus, AutoRefreshConfig, DetailRow, DetailSection, FetchState,
    FetchStateStatus, ProviderError, ProviderKind, ProviderManualSetup, ProviderManualSetupOption,
    ProviderStatus, QuotaAggregate, QuotaFetchIssue, QuotaOverview, QuotaSummary, RowTone,
    SubscriptionSummary,
};
pub use runtime::{ProviderDescriptor, QuotaProvider};
pub use service::{QuotaUsageService, QUOTA_USAGE_AUTO_REFRESH_JOB_ID};
pub use support::browser::{
    load_cursor_session_token, load_gated_provider_browser_cookie,
    load_manual_cursor_session_token, BrowserCookieSource,
};
pub use support::browser_access::{browser_cookie_spec, BrowserCookieSpec};

/// First stored API key for a quota provider (`~/.atmos/data/quota-usage/provider_config.json`).
pub fn stored_provider_api_key(provider_id: &str) -> Option<String> {
    config::provider_config_api_key(provider_id)
}

/// Persist an API key into the shared quota-usage provider config.
pub fn store_provider_api_key(provider_id: &str, api_key: &str) -> String {
    config::add_provider_api_key(provider_id, None, api_key.to_string())
}
