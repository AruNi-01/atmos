pub(crate) const CACHE_TTL_SECS: u64 = 180;
pub(crate) const PROVIDER_TIMEOUT_MILLIS: u64 = 8000;
pub(crate) const CODEX_USAGE_API_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
pub(crate) const CODEX_SCAN_WINDOW_DAYS: i64 = 30;
pub(crate) const CURSOR_USAGE_SERVICE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
pub(crate) const CURSOR_PLAN_INFO_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo";
pub(crate) const OPENCODE_LOCAL_DB_PATH: &str = "~/.local/share/opencode/opencode.db";
pub(crate) const OPENCODE_LOCAL_AUTH_PATH: &str = "~/.local/share/opencode/auth.json";
pub(crate) const OPENCODE_SESSION_LIMIT_USD: f64 = 12.0;
pub(crate) const OPENCODE_WEEKLY_LIMIT_USD: f64 = 30.0;
pub(crate) const OPENCODE_MONTHLY_LIMIT_USD: f64 = 60.0;
pub(crate) const OPENCODE_SESSION_WINDOW_SECS: u64 = 5 * 60 * 60;
pub(crate) const OPENCODE_WEEK_MS: u64 = 7 * 24 * 60 * 60 * 1000;
pub(crate) const FACTORY_APP_URL: &str = "https://app.factory.ai";
pub(crate) const FACTORY_API_URL: &str = "https://api.factory.ai";
pub(crate) const FACTORY_AUTH_ME_PATH: &str = "/api/app/auth/me";
pub(crate) const FACTORY_USAGE_PATH: &str = "/api/organization/subscription/usage";
pub(crate) const ZED_BILLING_USAGE_URL: &str = "https://cloud.zed.dev/frontend/billing/usage";
pub(crate) const ZED_SUBSCRIPTION_URL: &str =
    "https://cloud.zed.dev/frontend/billing/subscriptions/current";
