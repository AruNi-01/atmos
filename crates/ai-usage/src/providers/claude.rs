use reqwest::Client;
use serde::Deserialize;
use std::env;

use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, expand_home, format_reset_relative_text,
    map_claude_rate_limit_tier, normalize_fraction_percent, parse_offset_datetime, unix_now,
};
use std::fs;

#[derive(Debug, Clone, Deserialize)]
struct ClaudeCredentialsFile {
    #[serde(default, rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeCredentialsData>,
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
}

#[derive(Debug, Clone)]
struct ClaudeCredentials {
    access_token: String,
    scopes: Vec<String>,
    rate_limit_tier: Option<String>,
    expires_at: Option<u64>,
}

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
    let credentials = load_claude_credentials()?;
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(&credentials.access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.1.0")
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Claude OAuth request failed: {error}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Claude OAuth returned {}",
            response.status()
        )));
    }

    let payload = response
        .json::<ClaudeUsageResponse>()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Invalid Claude OAuth payload: {error}")))?;

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
        let used = extra.used_credits.unwrap_or_default();
        let limit = extra.monthly_limit.unwrap_or_default();
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

    let path = expand_home("~/.claude/.credentials.json")
        .ok_or_else(|| ProviderError::Fetch("Claude credentials path unavailable".to_string()))?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    let file: ClaudeCredentialsFile = serde_json::from_str(&contents)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    let oauth = file
        .claude_ai_oauth
        .ok_or_else(|| ProviderError::Fetch("Claude OAuth credentials missing".to_string()))?;
    let access_token = oauth
        .access_token
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ProviderError::Fetch("Claude access token missing".to_string()))?;

    Ok(ClaudeCredentials {
        access_token,
        scopes: oauth.scopes,
        rate_limit_tier: oauth.rate_limit_tier.map(map_claude_rate_limit_tier),
        expires_at: oauth.expires_at.map(|value| value as u64),
    })
}
