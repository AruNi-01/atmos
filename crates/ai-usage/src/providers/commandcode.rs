use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use time::OffsetDateTime;

use crate::constants::{
    COMMANDCODE_API_URL, COMMANDCODE_CREDITS_PATH, COMMANDCODE_SUBSCRIPTIONS_PATH,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone, UsageSummary};
use crate::runtime::LiveFetchResult;
use crate::support::browser::{load_commandcode_browser_cookie_source, BrowserCookieSource};
use crate::support::{expand_home, format_reset_relative_text, unix_now};

fn dbg() -> infra::utils::debug_logging::DebugLogger {
    infra::utils::debug_logging::DebugLogger::new("AI_USAGE_COMMANDCODE")
}

#[derive(Debug, Clone, Deserialize)]
struct CommandCodeAuth {
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    user_id: Option<String>,
    #[serde(default)]
    user_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CreditsResponse {
    #[serde(default)]
    credits: Option<CreditsData>,
}

#[derive(Debug, Clone, Deserialize)]
struct CreditsData {
    #[serde(default, alias = "monthlyCredits")]
    monthly_credits: Option<f64>,
    #[serde(default, alias = "purchasedCredits")]
    purchased_credits: Option<f64>,
    #[serde(default, alias = "premiumMonthlyCredits")]
    premium_monthly_credits: Option<f64>,
    #[serde(default, alias = "opensourceMonthlyCredits")]
    opensource_monthly_credits: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct SubscriptionResponse {
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    data: Option<SubscriptionData>,
}

#[derive(Debug, Clone, Deserialize)]
struct SubscriptionData {
    #[serde(default, alias = "priceId")]
    price_id: Option<String>,
    #[serde(default)]
    plan_id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default, alias = "currentPeriodEnd")]
    current_period_end: Option<String>,
}

pub(crate) async fn fetch_commandcode_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    use crate::support::browser::{load_cookie_header, normalize_cookie_header};

    dbg().log(
        "FETCH_START",
        "Starting CommandCode usage fetch",
        Some(serde_json::json!({ "timestamp": unix_now() })),
    );

    // Try manual cookie override first
    let manual_cookie = load_cookie_header(
        &["ATMOS_USAGE_COMMANDCODE_COOKIE_HEADER", "COMMANDCODE_COOKIE_HEADER"],
        Some("commandcode"),
    )?;

    dbg().log(
        "MANUAL_COOKIE_CHECK",
        "Manual cookie override check",
        Some(serde_json::json!({
            "has_manual_cookie": manual_cookie.is_some(),
        })),
    );

    // Try to load browser cookie
    let browser_cookie = load_commandcode_browser_cookie_source()?;

    dbg().log(
        "BROWSER_COOKIE_CHECK",
        "Browser cookie check",
        Some(serde_json::json!({
            "has_browser_cookie": browser_cookie.is_some(),
        })),
    );

    let cookie_source = match (manual_cookie, browser_cookie) {
        (Some(manual), _) => {
            dbg().log(
                "USING_MANUAL_COOKIE",
                "Using manual cookie header",
                Some(serde_json::json!({
                    "source": "manual cookie header",
                })),
            );
            BrowserCookieSource {
                cookie_header: normalize_cookie_header(&manual),
                source_label: "manual cookie header".to_string(),
            }
        }
        (None, Some(browser)) => {
            dbg().log(
                "USING_BROWSER_COOKIE",
                "Using browser cookie",
                Some(serde_json::json!({
                    "source": browser.source_label,
                })),
            );
            browser
        }
        (None, None) => {
            dbg().log(
                "NO_COOKIE_FALLBACK",
                "No cookie found, falling back to CLI auth",
                None,
            );
            // Fall back to CLI auth detection
            let auth = load_commandcode_auth()?;
            let email = auth
                .email
                .or(auth.user_name)
                .unwrap_or_else(|| "Unknown".to_string());

            dbg().log(
                "CLI_AUTH_RESULT",
                "CLI auth detection result",
                Some(serde_json::json!({
                    "email": email,
                })),
            );

            return Ok(LiveFetchResult {
                plan_label: Some("CommandCode".to_string()),
                usage_summary: None,
                detail_sections: vec![
                    DetailSection {
                        title: "Account".to_string(),
                        rows: vec![
                            DetailRow {
                                label: "Email".to_string(),
                                value: email,
                                tone: RowTone::Default,
                            },
                            DetailRow {
                                label: "Status".to_string(),
                                value: "Authenticated (CLI)".to_string(),
                                tone: RowTone::Success,
                            },
                        ],
                    },
                    DetailSection {
                        title: "Usage".to_string(),
                        rows: vec![
                            DetailRow {
                                label: "Tracking".to_string(),
                                value: "View in Studio".to_string(),
                                tone: RowTone::Default,
                            },
                            DetailRow {
                                label: "Instructions".to_string(),
                                value: "Visit commandcode.ai/studio/usage".to_string(),
                                tone: RowTone::Muted,
                            },
                        ],
                    },
                ],
                warnings: vec![
                    "Browser cookie not found. Sign in to commandcode.ai in your browser to see usage data, or set COMMANDCODE_COOKIE_HEADER environment variable."
                        .to_string(),
                ],
                fetch_message: "CommandCode CLI auth (no browser cookie)".to_string(),
                reset_at: None,
                credits_label: None,
                last_updated_at: Some(unix_now()),
            });
        }
    };

    // Fetch usage data using browser cookie
    let auth = load_commandcode_auth()?;
    let email = auth
        .email
        .or(auth.user_name)
        .unwrap_or_else(|| "Unknown".to_string());

    dbg().log(
        "API_FETCH_START",
        "Starting API fetch",
        Some(serde_json::json!({
            "email": email,
            "cookie_source": cookie_source.source_label,
        })),
    );

    let (credits, subscription) = tokio::try_join!(
        fetch_credits(client, &cookie_source.cookie_header),
        fetch_subscription(client, &cookie_source.cookie_header)
    )?;

    dbg().log(
        "API_FETCH_SUCCESS",
        "API fetch completed successfully",
        Some(serde_json::json!({
            "has_credits": credits.credits.is_some(),
            "has_subscription": subscription.data.is_some(),
        })),
    );

    let monthly_credits = credits
        .credits
        .as_ref()
        .and_then(|c| c.monthly_credits)
        .unwrap_or(0.0);
    let purchased_credits = credits
        .credits
        .as_ref()
        .and_then(|c| c.purchased_credits)
        .unwrap_or(0.0);
    let premium_monthly_credits = credits
        .credits
        .as_ref()
        .and_then(|c| c.premium_monthly_credits)
        .unwrap_or(0.0);
    let opensource_monthly_credits = credits
        .credits
        .as_ref()
        .and_then(|c| c.opensource_monthly_credits)
        .unwrap_or(0.0);

    let total_monthly = monthly_credits + premium_monthly_credits + opensource_monthly_credits;
    let total_credits = total_monthly + purchased_credits;

    let subscription_status = subscription
        .data
        .as_ref()
        .and_then(|s| s.status.clone())
        .unwrap_or_else(|| "unknown".to_string());

    let plan_id = subscription
        .data
        .as_ref()
        .and_then(|s| s.plan_id.clone());

    // Determine plan label and correct total credits based on subscription
    let (plan_label, correct_total_credits) = if subscription_status == "active" {
        // Use planId to determine plan type
        match plan_id.as_deref() {
            Some("individual-go") => ("Go".to_string(), 10.0),
            Some(id) if id.contains("go") || id.contains("Go") => ("Go".to_string(), 10.0),
            Some(id) if id.contains("team") => ("Team".to_string(), total_credits),
            Some(id) if id.contains("enterprise") => ("Enterprise".to_string(), total_credits),
            _ => {
                // Fallback to credit-based detection
                if opensource_monthly_credits > 0.0 {
                    ("Open Source".to_string(), total_credits)
                } else if premium_monthly_credits > 0.0 {
                    ("Premium".to_string(), total_credits)
                } else if monthly_credits > 0.0 {
                    ("Pro".to_string(), total_credits)
                } else {
                    ("Paid".to_string(), total_credits)
                }
            }
        }
    } else {
        ("Free".to_string(), total_credits)
    };

    // Use the corrected total credits for display
    let display_total_credits = correct_total_credits;

    let reset_at = subscription
        .data
        .as_ref()
        .and_then(|s| s.current_period_end.as_ref())
        .and_then(|s| parse_iso8601(s));

    let usage_summary = if display_total_credits > 0.0 {
        Some(UsageSummary {
            unit: Some("credits".to_string()),
            currency: Some("USD".to_string()),
            used: None,
            remaining: Some(display_total_credits),
            cap: None,
            percent: None,
            used_label: None,
            remaining_label: Some(format!("${:.2}", display_total_credits)),
            cap_label: None,
        })
    } else {
        None
    };

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: vec![
                DetailRow {
                    label: "Email".to_string(),
                    value: email,
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Plan".to_string(),
                    value: plan_label.clone(),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Status".to_string(),
                    value: subscription_status,
                    tone: RowTone::Success,
                },
            ],
        },
        DetailSection {
            title: "Usage".to_string(),
            rows: vec![
                DetailRow {
                    label: "Remaining".to_string(),
                    value: format!("${:.2} · {}", display_total_credits, format_reset_relative_text(reset_at)),
                    tone: RowTone::Default,
                },
            ],
        },
        DetailSection {
            title: "Credits".to_string(),
            rows: vec![
                DetailRow {
                    label: "Balance".to_string(),
                    value: format!("${:.2}", display_total_credits),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "State".to_string(),
                    value: format!("${:.2} monthly + ${:.2} purchased", total_monthly, purchased_credits),
                    tone: RowTone::Default,
                },
            ],
        },
    ];

    if let Some(reset_at) = reset_at {
        detail_sections.push(DetailSection {
            title: "Billing".to_string(),
            rows: vec![DetailRow {
                label: "Period End".to_string(),
                value: format_reset_relative_text(Some(reset_at)),
                tone: RowTone::Default,
            }],
        });
    }

    Ok(LiveFetchResult {
        plan_label: Some(plan_label),
        usage_summary,
        detail_sections,
        warnings: vec![],
        fetch_message: format!("CommandCode usage from {}", cookie_source.source_label),
        reset_at,
        credits_label: Some("credits".to_string()),
        last_updated_at: Some(unix_now()),
    })
}

async fn fetch_credits(
    client: &Client,
    cookie_header: &str,
) -> Result<CreditsResponse, ProviderError> {
    let url = format!("{}{}", COMMANDCODE_API_URL, COMMANDCODE_CREDITS_PATH);
    
    dbg().log(
        "CREDITS_REQUEST",
        "Fetching credits",
        Some(serde_json::json!({
            "url": url,
        })),
    );

    let response = client
        .get(&url)
        .header("Cookie", cookie_header)
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        )
        .header("Origin", "https://commandcode.ai")
        .header("Referer", "https://commandcode.ai/")
        .send()
        .await
        .map_err(|e| {
            dbg().log(
                "CREDITS_REQUEST_ERROR",
                "Credits request failed",
                Some(serde_json::json!({
                    "error": e.to_string(),
                })),
            );
            ProviderError::Fetch(format!("CommandCode credits request failed: {}", e))
        })?;

    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        dbg().log(
            "CREDITS_AUTH_ERROR",
            "Authentication failed",
            Some(serde_json::json!({
                "status": response.status().as_u16(),
            })),
        );
        return Err(ProviderError::Fetch(
            "CommandCode authentication failed (401/403)".to_string(),
        ));
    }

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Failed to read response body: {}", e)))?;

    if !status.is_success() {
        dbg().log(
            "CREDITS_STATUS_ERROR",
            "Credits request returned non-success status",
            Some(serde_json::json!({
                "status": status.as_u16(),
                "body": body,
            })),
        );
        return Err(ProviderError::Fetch(format!(
            "CommandCode credits request failed with status {}: {}",
            status, body
        )));
    }

    dbg().log(
        "CREDITS_SUCCESS",
        "Credits fetched successfully",
        Some(serde_json::json!({
            "status": status.as_u16(),
        })),
    );

    serde_json::from_str(&body)
        .map_err(|e| ProviderError::Fetch(format!("Failed to parse credits response: {}", e)))
}

async fn fetch_subscription(
    client: &Client,
    cookie_header: &str,
) -> Result<SubscriptionResponse, ProviderError> {
    let url = format!(
        "{}{}",
        COMMANDCODE_API_URL, COMMANDCODE_SUBSCRIPTIONS_PATH
    );
    let response = client
        .get(&url)
        .header("Cookie", cookie_header)
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        )
        .header("Origin", "https://commandcode.ai")
        .header("Referer", "https://commandcode.ai/")
        .send()
        .await
        .map_err(|e| {
            ProviderError::Fetch(format!("CommandCode subscription request failed: {}", e))
        })?;

    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        return Err(ProviderError::Fetch(
            "CommandCode authentication failed (401/403)".to_string(),
        ));
    }

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Failed to read response body: {}", e)))?;

    if !status.is_success() {
        return Err(ProviderError::Fetch(format!(
            "CommandCode subscription request failed with status {}: {}",
            status, body
        )));
    }

    serde_json::from_str(&body)
        .map_err(|e| ProviderError::Fetch(format!("Failed to parse subscription response: {}", e)))
}

fn parse_iso8601(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    // Try parsing with time crate
    if let Ok(dt) = OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339) {
        return Some(dt.unix_timestamp() as u64);
    }

    None
}

fn load_commandcode_auth() -> Result<CommandCodeAuth, ProviderError> {
    for path in commandcode_auth_paths() {
        if !path.exists() {
            continue;
        }
        let contents = fs::read_to_string(&path)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
        let value = serde_json::from_str::<Value>(&contents).map_err(|error| {
            ProviderError::Fetch(format!("Invalid CommandCode auth.json: {error}"))
        })?;

        let api_key = value.get("apiKey").and_then(Value::as_str).map(str::to_string);
        let email = value.get("email").and_then(Value::as_str).map(str::to_string);
        let user_id = value.get("userId").and_then(Value::as_str).map(str::to_string);
        let user_name = value.get("userName").and_then(Value::as_str).map(str::to_string);

        if api_key.is_some() || email.is_some() || user_name.is_some() {
            return Ok(CommandCodeAuth {
                api_key,
                email,
                user_id,
                user_name,
            });
        }
    }

    Err(ProviderError::Fetch(
        "CommandCode auth.json not found or invalid".to_string(),
    ))
}

fn commandcode_auth_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = expand_home("~/.commandcode/auth.json") {
        paths.push(path);
    }
    if let Some(path) = expand_home("~/.config/commandcode/auth.json") {
        paths.push(path);
    }
    paths
}

pub(crate) fn commandcode_auth_available() -> bool {
    commandcode_auth_paths()
        .iter()
        .any(|path| path.exists())
}

pub(crate) fn commandcode_auth_source() -> Option<String> {
    commandcode_auth_paths()
        .iter()
        .find(|path| path.exists())
        .map(|path| path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commandcode_auth_paths() {
        let paths = commandcode_auth_paths();
        assert!(!paths.is_empty());
        assert!(paths.iter().any(|p| p.ends_with("auth.json")));
    }
}
