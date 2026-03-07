pub(crate) const CACHE_TTL_SECS: u64 = 180;
pub(crate) const PROVIDER_TIMEOUT_MILLIS: u64 = 1800;
pub(crate) const CODEX_USAGE_API_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
pub(crate) const CODEX_REFRESH_URL: &str = "https://auth.openai.com/oauth/token";
pub(crate) const CODEX_OAUTH_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
pub(crate) const CODEX_SCAN_WINDOW_DAYS: i64 = 30;
pub(crate) const CURSOR_USAGE_SERVICE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
pub(crate) const CURSOR_PLAN_INFO_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo";
pub(crate) const CURSOR_TOKEN_REFRESH_URL: &str = "https://api2.cursor.sh/oauth/token";
pub(crate) const CURSOR_CLIENT_ID: &str = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";
pub(crate) const OPENCODE_SERVER_URL: &str = "https://opencode.ai/_server";
pub(crate) const OPENCODE_WORKSPACES_SERVER_ID: &str =
    "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
pub(crate) const OPENCODE_SUBSCRIPTION_SERVER_ID: &str =
    "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4";
pub(crate) const FACTORY_APP_URL: &str = "https://app.factory.ai";
pub(crate) const FACTORY_API_URL: &str = "https://api.factory.ai";
pub(crate) const FACTORY_AUTH_ME_PATH: &str = "/api/app/auth/me";
pub(crate) const FACTORY_USAGE_PATH: &str = "/api/organization/subscription/usage";
pub(crate) const FACTORY_WORKOS_AUTH_URL: &str =
    "https://api.workos.com/user_management/authenticate";
pub(crate) const FACTORY_WORKOS_CLIENT_IDS: [&str; 2] = [
    "client_01HXRMBQ9BJ3E7QSTQ9X2PHVB7",
    "client_01HNM792M5G5G1A2THWPXKFMXB",
];
