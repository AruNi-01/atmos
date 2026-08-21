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
