use reqwest::Client;
use serde::Deserialize;
use std::env;
use std::sync::OnceLock;

use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, expand_home, format_reset_relative_text,
    map_claude_rate_limit_tier, normalize_fraction_percent, parse_offset_datetime, run_command,
    unix_now,
};
use std::fs;
use tracing::debug;

#[derive(Debug, Clone, Deserialize)]
struct ClaudeCredentialsFile {
    #[serde(default, rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeCredentialsData>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeConfigFile {
    #[serde(default, rename = "primaryApiKey")]
    primary_api_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeCredentialsData {
    #[serde(default, rename = "accessToken")]
    access_token: Option<String>,
    #[serde(default, rename = "refreshToken")]
    refresh_token: Option<String>,
    #[serde(default, rename = "expiresAt")]
    expires_at: Option<f64>,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default, rename = "rateLimitTier")]
    rate_limit_tier: Option<String>,
    #[serde(default, rename = "subscriptionType")]
    subscription_type: Option<String>,
}

#[derive(Debug, Clone)]
struct ClaudeCredentials {
    access_token: String,
    scopes: Vec<String>,
    rate_limit_tier: Option<String>,
    expires_at: Option<u64>,
}

const TOKEN_EXPIRY_BUFFER_SECS: u64 = 300;

#[derive(Debug, Clone, Deserialize)]
struct ClaudeUsageResponse {
    #[serde(default, rename = "five_hour")]
    five_hour: Option<ClaudeUsageWindow>,
    #[serde(default, rename = "seven_day")]
    seven_day: Option<ClaudeUsageWindow>,
    #[serde(default, rename = "seven_day_opus")]
    seven_day_opus: Option<ClaudeUsageWindow>,
    #[serde(default, rename = "seven_day_sonnet")]
    seven_day_sonnet: Option<ClaudeUsageWindow>,
    #[serde(default, rename = "extra_usage")]
    extra_usage: Option<ClaudeExtraUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeUsageWindow {
    #[serde(default)]
    utilization: Option<f64>,
    #[serde(default, rename = "resets_at")]
    resets_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeExtraUsage {
    #[serde(default, rename = "is_enabled")]
    is_enabled: Option<bool>,
    #[serde(default, rename = "monthly_limit")]
    monthly_limit: Option<f64>,
    #[serde(default, rename = "used_credits")]
    used_credits: Option<f64>,
    #[serde(default)]
    utilization: Option<f64>,
    #[serde(default)]
    currency: Option<String>,
}

pub(crate) async fn fetch_claude_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let mut credentials = load_claude_credentials()?;

    // If the token is expired, delegate refresh to Claude CLI rather than
    // calling the OAuth token endpoint ourselves.  Calling the endpoint
    // directly rotates the token and leaves the Claude Code CLI holding a
    // stale access_token, which causes persistent 401 errors.
    if claude_token_needs_refresh(&credentials) {
        debug!(
            "Claude OAuth access token expired or expiring soon, delegating refresh to Claude CLI"
        );
        delegate_claude_refresh().await?;
        // Re-read credentials after Claude CLI has refreshed them
        credentials = load_claude_credentials()?;
    }

    let payload = match request_claude_usage(client, &credentials.access_token).await {
        Ok(payload) => payload,
        Err(error) if error.contains("401") || error.contains("403") => {
            debug!(
                "Claude OAuth usage request failed ({}), delegating refresh to Claude CLI",
                error
            );
            delegate_claude_refresh().await?;
            credentials = load_claude_credentials()?;
            request_claude_usage(client, &credentials.access_token)
                .await
                .map_err(ProviderError::Fetch)?
        }
        Err(error) => return Err(ProviderError::Fetch(error)),
    };

    let session_percent = payload
        .five_hour
        .as_ref()
        .and_then(|window| window.utilization)
        .map(normalize_fraction_percent);
    let weekly_percent = payload
        .seven_day
        .as_ref()
        .and_then(|window| window.utilization)
        .map(normalize_fraction_percent);
    let session_reset = payload
        .five_hour
        .as_ref()
        .and_then(|window| window.resets_at.as_deref())
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64);
    let weekly_reset = payload
        .seven_day
        .as_ref()
        .and_then(|window| window.resets_at.as_deref())
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64);

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: vec![
                DetailRow {
                    label: "Account".to_string(),
                    value: "Claude OAuth".to_string(),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Plan".to_string(),
                    value: credentials
                        .rate_limit_tier
                        .clone()
                        .unwrap_or_else(|| "Claude".to_string()),
                    tone: RowTone::Default,
                },
            ],
        },
        DetailSection {
            title: "Usage".to_string(),
            rows: vec![
                DetailRow {
                    label: "Session".to_string(),
                    value: format!(
                        "{}% used · {}",
                        session_percent.unwrap_or(0.0).round(),
                        format_reset_relative_text(session_reset)
                    ),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Weekly".to_string(),
                    value: format!(
                        "{}% used · {}",
                        weekly_percent.unwrap_or(0.0).round(),
                        format_reset_relative_text(weekly_reset)
                    ),
                    tone: RowTone::Default,
                },
            ],
        },
    ];

    let mut credits_label = None;
    if let Some(extra) = payload
        .extra_usage
        .as_ref()
        .filter(|extra| extra.is_enabled == Some(true))
    {
        let used = extra.used_credits.unwrap_or_default() / 100.0;
        let limit = extra.monthly_limit.unwrap_or_default() / 100.0;
        credits_label = Some(format!(
            "{used:.2} / {limit:.2} {}",
            extra.currency.clone().unwrap_or_else(|| "USD".to_string())
        ));
        detail_sections.push(DetailSection {
            title: "Credits".to_string(),
            rows: vec![
                DetailRow {
                    label: "State".to_string(),
                    value: "Extra usage".to_string(),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Balance".to_string(),
                    value: format!(
                        "{used:.2} / {limit:.2} {}",
                        extra.currency.clone().unwrap_or_else(|| "USD".to_string())
                    ),
                    tone: RowTone::Default,
                },
            ],
        });
    }

    Ok(LiveFetchResult {
        plan_label: credentials.rate_limit_tier,
        usage_summary: Some(build_percent_usage_summary(session_percent)),
        detail_sections,
        warnings: if !credentials
            .scopes
            .iter()
            .any(|scope| scope == "user:profile")
        {
            vec!["Claude OAuth token may be missing user:profile scope.".to_string()]
        } else {
            vec![]
        },
        fetch_message: "Claude OAuth API".to_string(),
        reset_at: session_reset.or(weekly_reset),
        credits_label,
        last_updated_at: Some(unix_now()),
    })
}

fn claude_token_needs_refresh(credentials: &ClaudeCredentials) -> bool {
    let Some(expires_at) = credentials.expires_at else {
        return false;
    };
    expires_at <= unix_now() + TOKEN_EXPIRY_BUFFER_SECS
}

/// Delegate token refresh to the Claude CLI by running `claude /status`.
/// This lets Claude Code rotate its own token so the credentials file /
/// keychain are updated atomically.  We never call the OAuth token endpoint
/// ourselves because that would invalidate the token Claude Code is using.
///
/// The CLI command does network I/O, so it is run in a blocking thread to
/// avoid stalling the async executor.
async fn delegate_claude_refresh() -> Result<(), ProviderError> {
    tokio::task::spawn_blocking(|| run_command("claude", &["/status"]))
        .await
        .map_err(|e| ProviderError::Fetch(e.to_string()))?
        .map(|_| {
            debug!("Claude CLI /status completed, credentials should be refreshed");
        })
        .map_err(|error| {
            debug!("Claude CLI /status failed: {error}, credentials may be stale");
            ProviderError::Fetch(format!(
                "Claude CLI refresh failed: {error}. Ensure the `claude` CLI is installed and try again."
            ))
        })
}

fn detect_claude_version() -> &'static str {
    static CLAUDE_VERSION: OnceLock<String> = OnceLock::new();

    CLAUDE_VERSION
        .get_or_init(|| {
            run_command("claude", &["--version"])
                .ok()
                .and_then(|output| {
                    output
                        .trim()
                        .split_whitespace()
                        .next()
                        .filter(|v| v.contains('.'))
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "2.1.0".to_string())
        })
        .as_str()
}

async fn request_claude_usage(
    client: &Client,
    access_token: &str,
) -> Result<ClaudeUsageResponse, String> {
    let version = detect_claude_version();
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", format!("claude-code/{version}"))
        .send()
        .await
        .map_err(|error| format!("Claude OAuth request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Claude OAuth returned {}", response.status()));
    }

    response
        .json::<ClaudeUsageResponse>()
        .await
        .map_err(|error| format!("Invalid Claude OAuth payload: {error}"))
}

pub(crate) fn local_api_key_source() -> Option<String> {
    let path = expand_home("~/.claude/config.json")?;
    let contents = fs::read_to_string(&path).ok()?;
    if parse_primary_api_key(&contents).is_some() {
        Some(path.display().to_string())
    } else {
        None
    }
}

pub(crate) fn keychain_oauth_source() -> Option<String> {
    load_keychain_credentials()
        .ok()
        .flatten()
        .map(|_| "macOS Keychain: Claude Code-credentials".to_string())
}

fn load_claude_credentials() -> Result<ClaudeCredentials, ProviderError> {
    if let Some(token) = env::var("CLAUDE_CODE_OAUTH_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(ClaudeCredentials {
            access_token: token,
            scopes: vec![],
            rate_limit_tier: env::var("CLAUDE_CODE_RATE_LIMIT_TIER")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            expires_at: None,
        });
    }

    if let Some(credentials) = load_keychain_credentials()? {
        return Ok(credentials);
    }

    if let Some(credentials) = load_file_credentials()? {
        return Ok(credentials);
    }

    if env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .is_some()
    {
        return Err(ProviderError::Fetch(
            "Claude is configured with ANTHROPIC_API_KEY, but subscription detection requires Claude OAuth.".to_string(),
        ));
    }

    if let Some(source) = local_api_key_source() {
        return Err(ProviderError::Fetch(format!(
            "Claude is configured with an API key ({source}), but subscription detection requires Claude OAuth."
        )));
    }

    Err(ProviderError::Fetch(
        "Claude OAuth credentials missing".to_string(),
    ))
}

fn load_keychain_credentials() -> Result<Option<ClaudeCredentials>, ProviderError> {
    if !cfg!(target_os = "macos") {
        return Ok(None);
    }

    let output = match run_command(
        "/usr/bin/security",
        &[
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ],
    ) {
        Ok(output) => output,
        Err(_) => return Ok(None),
    };
    let payload = output.trim();
    if payload.is_empty() {
        return Ok(None);
    }

    let file: ClaudeCredentialsFile = serde_json::from_str(payload)
        .map_err(|error| ProviderError::Fetch(format!("Claude keychain payload: {error}")))?;
    Ok(file.claude_ai_oauth.and_then(parse_oauth_credentials))
}

fn load_file_credentials() -> Result<Option<ClaudeCredentials>, ProviderError> {
    let path = expand_home("~/.claude/.credentials.json")
        .ok_or_else(|| ProviderError::Fetch("Claude credentials path unavailable".to_string()))?;
    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(_) => return Ok(None),
    };
    let file: ClaudeCredentialsFile = serde_json::from_str(&contents)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    Ok(file.claude_ai_oauth.and_then(parse_oauth_credentials))
}

fn parse_oauth_credentials(oauth: ClaudeCredentialsData) -> Option<ClaudeCredentials> {
    let access_token = oauth.access_token?.trim().to_string();
    if access_token.is_empty() {
        return None;
    }

    Some(ClaudeCredentials {
        access_token,
        scopes: oauth.scopes,
        rate_limit_tier: plan_label(oauth.subscription_type, oauth.rate_limit_tier),
        expires_at: oauth.expires_at.map(|value| value as u64),
    })
}

fn plan_label(
    subscription_type: Option<String>,
    rate_limit_tier: Option<String>,
) -> Option<String> {
    subscription_type
        .as_deref()
        .and_then(parse_subscription_type)
        .or_else(|| rate_limit_tier.map(map_claude_rate_limit_tier))
}

fn parse_subscription_type(raw: &str) -> Option<String> {
    let lower = raw.trim().to_lowercase();
    if lower.is_empty() || lower.contains("api") {
        return None;
    }
    if lower.contains("pro") {
        return Some("Pro".to_string());
    }
    if lower.contains("max") {
        return Some("Max".to_string());
    }
    if lower.contains("team") {
        return Some("Team".to_string());
    }

    let mut chars = lower.chars();
    chars
        .next()
        .map(|first| format!("{}{}", first.to_ascii_uppercase(), chars.as_str()))
}

fn parse_primary_api_key(contents: &str) -> Option<String> {
    let file: ClaudeConfigFile = serde_json::from_str(contents).ok()?;
    file.primary_api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{parse_primary_api_key, parse_subscription_type};

    #[test]
    fn parses_primary_api_key_from_claude_config() {
        let contents = r#"{"primaryApiKey":"sk-ant-123"}"#;
        assert_eq!(
            parse_primary_api_key(contents).as_deref(),
            Some("sk-ant-123")
        );
    }

    #[test]
    fn ignores_empty_primary_api_key() {
        let contents = "{\"primaryApiKey\":\"   \"}";
        assert!(parse_primary_api_key(contents).is_none());
    }

    #[test]
    fn maps_subscription_type_to_plan_label() {
        assert_eq!(parse_subscription_type("pro").as_deref(), Some("Pro"));
        assert_eq!(
            parse_subscription_type("claude_max_2024").as_deref(),
            Some("Max")
        );
        assert_eq!(parse_subscription_type("team").as_deref(), Some("Team"));
        assert!(parse_subscription_type("api").is_none());
    }
}
