#![allow(dead_code)]

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use std::fs;

use crate::constants::CODEX_USAGE_API_URL;
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, decode_jwt_payload, expand_home, format_reset_relative_text,
    round_metric, unix_now,
};

#[derive(Debug, Clone, Deserialize)]
struct CodexUsageResponse {
    #[serde(default, rename = "plan_type")]
    plan_type: Option<String>,
    #[serde(default, rename = "rate_limit")]
    rate_limit: Option<CodexRateLimit>,
    #[serde(default, rename = "code_review_rate_limit")]
    code_review_rate_limit: Option<CodexRateLimit>,
    #[serde(default, rename = "additional_rate_limits")]
    additional_rate_limits: Option<Vec<CodexAdditionalRateLimit>>,
    #[serde(default)]
    credits: Option<CodexCredits>,
}

#[derive(Debug, Clone, Deserialize)]
struct CodexRateLimit {
    #[serde(default, rename = "primary_window")]
    primary_window: Option<CodexWindow>,
    #[serde(default, rename = "secondary_window")]
    secondary_window: Option<CodexWindow>,
}

#[derive(Debug, Clone, Deserialize)]
struct CodexWindow {
    #[serde(default, rename = "used_percent")]
    used_percent: Option<f64>,
    #[serde(default, rename = "reset_at")]
    reset_at: Option<u64>,
    #[serde(default, rename = "reset_after_seconds")]
    reset_after_seconds: Option<u64>,
    #[serde(default, rename = "limit_window_seconds")]
    limit_window_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct CodexAdditionalRateLimit {
    #[serde(default, rename = "limit_name")]
    limit_name: Option<String>,
    #[serde(default, rename = "rate_limit")]
    rate_limit: Option<CodexRateLimit>,
}

#[derive(Debug, Clone, Deserialize)]
struct CodexCredits {
    #[serde(default, rename = "has_credits")]
    has_credits: Option<bool>,
    #[serde(default)]
    unlimited: Option<bool>,
    #[serde(default)]
    balance: Option<Value>,
}

#[derive(Debug, Clone)]
struct CodexAuth {
    access_token: String,
    account_id: Option<String>,
    email: Option<String>,
}

pub(crate) async fn fetch_codex_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let now = unix_now();
    let auth = load_codex_auth()?;
    let response = match request_usage(client, &auth).await {
        Ok(payload) => payload,
        Err(error) if error.contains("401") || error.contains("403") => {
            return Err(ProviderError::Fetch(
                "Codex session expired or token invalid. Run `codex` to re-authenticate."
                    .to_string(),
            ));
        }
        Err(error) => return Err(ProviderError::Fetch(error)),
    };

    Ok(build_codex_live_result(response, auth.email, now))
}

fn build_codex_live_result(
    response: CodexUsageResponse,
    email: Option<String>,
    now: u64,
) -> LiveFetchResult {
    // Primary/secondary describe priority, not duration. Pro accounts can
    // return a weekly primary window with no secondary window at all.
    let summary_window = response.rate_limit.as_ref().and_then(|limit| {
        [
            limit.primary_window.as_ref(),
            limit.secondary_window.as_ref(),
        ]
        .into_iter()
        .flatten()
        .find(|window| window.used_percent.is_some())
    });
    let mut usage_rows = rate_limit_rows(response.rate_limit.as_ref(), None, now);
    usage_rows.extend(rate_limit_rows(
        response.code_review_rate_limit.as_ref(),
        Some("Reviews"),
        now,
    ));
    usage_rows.extend(build_additional_rate_limit_rows(
        response.additional_rate_limits.as_deref(),
        now,
    ));

    let plan_label = response.plan_type.clone().map(titleize);
    let credits_label = credits_label(response.credits.as_ref());

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: vec![
                DetailRow {
                    label: "Account".to_string(),
                    value: email.unwrap_or_else(|| "Codex".to_string()),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Plan".to_string(),
                    value: plan_label.clone().unwrap_or_else(|| "Codex".to_string()),
                    tone: RowTone::Default,
                },
            ],
        },
        DetailSection {
            title: "Usage".to_string(),
            rows: usage_rows,
        },
    ];

    if let Some(credits_label) = credits_label.clone() {
        detail_sections.push(DetailSection {
            title: "Credits".to_string(),
            rows: vec![DetailRow {
                label: "Balance".to_string(),
                value: credits_label,
                tone: RowTone::Default,
            }],
        });
    }

    LiveFetchResult {
        plan_label,
        usage_summary: summary_window
            .map(|window| build_percent_usage_summary(window.used_percent)),
        detail_sections,
        warnings: vec![],
        fetch_message: "Codex OAuth usage API".to_string(),
        reset_at: summary_window.and_then(|window| effective_reset_at(window, now)),
        credits_label,
        last_updated_at: Some(now),
    }
}

fn load_codex_auth() -> Result<CodexAuth, ProviderError> {
    if let Some(access_token) = env::var("OPENAI_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(CodexAuth {
            access_token,
            account_id: None,
            email: None,
        });
    }

    for path in codex_auth_paths() {
        if !path.exists() {
            continue;
        }
        let contents = fs::read_to_string(&path)
            .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
        let value = serde_json::from_str::<Value>(&contents)
            .map_err(|error| ProviderError::Fetch(format!("Invalid Codex auth.json: {error}")))?;
        let tokens = value.get("tokens");
        let access_token = string_field(&value, &["access_token", "accessToken"]).or_else(|| {
            tokens.and_then(|tokens| string_field(tokens, &["access_token", "accessToken"]))
        });
        if let Some(access_token) = access_token {
            let account_id = string_field(&value, &["account_id", "accountId"]).or_else(|| {
                tokens.and_then(|tokens| string_field(tokens, &["account_id", "accountId"]))
            });
            let id_token = string_field(&value, &["id_token", "idToken"]).or_else(|| {
                tokens.and_then(|tokens| string_field(tokens, &["id_token", "idToken"]))
            });
            let email = string_field(&value, &["email"])
                .or_else(|| {
                    value
                        .get("user")
                        .and_then(|user| string_field(user, &["email"]))
                })
                .or_else(|| {
                    id_token
                        .as_deref()
                        .and_then(decode_jwt_payload)
                        .and_then(|payload| {
                            payload
                                .get("email")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .or_else(|| {
                                    payload
                                        .get("https://api.openai.com/auth")
                                        .and_then(|auth| auth.get("email"))
                                        .and_then(Value::as_str)
                                        .map(str::to_string)
                                })
                        })
                });
            return Ok(CodexAuth {
                access_token,
                account_id,
                email,
            });
        }
    }

    Err(ProviderError::Fetch(
        "Codex auth.json credentials not available".to_string(),
    ))
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

async fn request_usage(client: &Client, auth: &CodexAuth) -> Result<CodexUsageResponse, String> {
    let mut request = client
        .get(CODEX_USAGE_API_URL)
        .bearer_auth(&auth.access_token)
        .header("Accept", "application/json");
    if let Some(account_id) = auth.account_id.as_deref() {
        request = request.header("ChatGPT-Account-Id", account_id);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Codex usage returned {}", response.status()));
    }
    response
        .json::<CodexUsageResponse>()
        .await
        .map_err(|error| error.to_string())
}

fn codex_auth_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = env::var("CODEX_HOME")
        .ok()
        .and_then(|value| expand_home(&value))
    {
        paths.push(home.join("auth.json"));
    }
    if let Some(path) = expand_home("~/.codex/auth.json") {
        paths.push(path);
    }
    if let Some(path) = expand_home("~/.config/codex/auth.json") {
        paths.push(path);
    }
    paths
}

fn titleize(raw: String) -> String {
    raw.split(['_', '-'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_additional_rate_limit_rows(
    limits: Option<&[CodexAdditionalRateLimit]>,
    now: u64,
) -> Vec<DetailRow> {
    let Some(limits) = limits else {
        return Vec::new();
    };

    let mut rows = Vec::new();
    for limit in limits {
        let Some(rate_limit) = limit.rate_limit.as_ref() else {
            continue;
        };
        let base_label = additional_limit_label(limit.limit_name.as_deref());

        rows.extend(rate_limit_rows(Some(rate_limit), Some(&base_label), now));
    }

    rows
}

fn rate_limit_rows(
    limit: Option<&CodexRateLimit>,
    prefix: Option<&str>,
    now: u64,
) -> Vec<DetailRow> {
    let Some(limit) = limit else {
        return Vec::new();
    };
    [
        (limit.primary_window.as_ref(), "Primary window"),
        (limit.secondary_window.as_ref(), "Secondary window"),
    ]
    .into_iter()
    .filter_map(|(window, fallback)| {
        let window = window?;
        let percent = window.used_percent?;
        let window_label = window_label(window.limit_window_seconds, fallback);
        Some(DetailRow {
            label: prefix
                .map(|prefix| format!("{prefix} · {window_label}"))
                .unwrap_or(window_label),
            value: format_window(percent, effective_reset_at(window, now)),
            tone: RowTone::Default,
        })
    })
    .collect()
}

fn window_label(seconds: Option<u64>, fallback: &str) -> String {
    let Some(seconds) = seconds.filter(|seconds| *seconds > 0) else {
        return fallback.to_string();
    };
    for (unit_seconds, unit) in [
        (604_800, "week"),
        (86_400, "day"),
        (3_600, "hour"),
        (60, "minute"),
        (1, "second"),
    ] {
        if seconds % unit_seconds == 0 {
            let count = seconds / unit_seconds;
            let plural = if count == 1 { "" } else { "s" };
            return format!("{count} {unit}{plural}");
        }
    }
    unreachable!("every positive duration is divisible by one second")
}

fn additional_limit_label(limit_name: Option<&str>) -> String {
    let Some(limit_name) = limit_name.map(str::trim).filter(|value| !value.is_empty()) else {
        return "Model".to_string();
    };

    let normalized = limit_name
        .split_once("-Codex-")
        .map(|(_, suffix)| suffix)
        .unwrap_or(limit_name);

    titleize(normalized.to_string())
}

fn effective_reset_at(window: &CodexWindow, now: u64) -> Option<u64> {
    window.reset_at.or_else(|| {
        window
            .reset_after_seconds
            .map(|seconds| now.saturating_add(seconds))
    })
}

fn credits_label(credits: Option<&CodexCredits>) -> Option<String> {
    let credits = credits?;
    if credits.unlimited == Some(true) {
        return Some("Unlimited".to_string());
    }
    if credits.has_credits == Some(false) {
        return Some("No credits".to_string());
    }
    credits
        .balance
        .as_ref()
        .and_then(|value| match value {
            Value::Number(number) => number.as_f64(),
            Value::String(text) => text.parse::<f64>().ok(),
            _ => None,
        })
        .map(|value| format!("{value:.2} USD"))
}

fn format_window(percent: f64, reset_at: Option<u64>) -> String {
    let percent = round_metric(percent);
    format!(
        "{percent:.0}% used · {}",
        format_reset_relative_text(reset_at)
    )
}

#[cfg(test)]
mod tests {
    use super::{
        additional_limit_label, build_additional_rate_limit_rows, build_codex_live_result,
        window_label, CodexAdditionalRateLimit, CodexRateLimit, CodexWindow,
    };
    use serde_json::json;

    #[test]
    fn pro_weekly_primary_does_not_create_a_five_hour_or_empty_secondary_row() {
        let response = serde_json::from_value(json!({
            "plan_type": "pro",
            "rate_limit": {
                "primary_window": {
                    "used_percent": 9,
                    "limit_window_seconds": 604800,
                    "reset_after_seconds": 503245
                },
                "secondary_window": null
            }
        }))
        .unwrap();
        let result = build_codex_live_result(response, None, 1_700_000_000);
        let rows = &result.detail_sections[1].rows;
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].label, "1 week");
        assert!(rows[0].value.starts_with("9% used"));
        assert_eq!(result.usage_summary.unwrap().percent, Some(9.0));
        assert_eq!(result.reset_at, Some(1_700_503_245));
    }

    #[test]
    fn retains_real_short_and_weekly_windows_for_other_plans() {
        let response = serde_json::from_value(json!({
            "plan_type": "plus",
            "rate_limit": {
                "primary_window": {
                    "used_percent": 0, "limit_window_seconds": 18000, "reset_at": 1800000000
                },
                "secondary_window": {
                    "used_percent": 31, "limit_window_seconds": 604800, "reset_at": 1800600000
                }
            }
        }))
        .unwrap();
        let result = build_codex_live_result(response, None, 1_700_000_000);
        let rows = &result.detail_sections[1].rows;
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].label, "5 hours");
        assert!(rows[0].value.starts_with("0% used"));
        assert_eq!(rows[1].label, "1 week");
        assert_eq!(result.usage_summary.unwrap().percent, Some(0.0));
        assert_eq!(result.reset_at, Some(1_800_000_000));
    }

    #[test]
    fn summary_falls_back_to_available_secondary_usage() {
        let response = serde_json::from_value(json!({
            "rate_limit": {
                "primary_window": { "limit_window_seconds": 18000 },
                "secondary_window": {
                    "used_percent": 17, "limit_window_seconds": 604800, "reset_after_seconds": 42
                }
            }
        }))
        .unwrap();
        let result = build_codex_live_result(response, None, 100);
        assert_eq!(result.detail_sections[1].rows.len(), 1);
        assert_eq!(result.usage_summary.unwrap().percent, Some(17.0));
        assert_eq!(result.reset_at, Some(142));
    }

    #[test]
    fn summary_does_not_borrow_another_windows_reset() {
        let response = serde_json::from_value(json!({
            "rate_limit": {
                "primary_window": { "used_percent": 9, "limit_window_seconds": 18000 },
                "secondary_window": {
                    "used_percent": 17, "limit_window_seconds": 604800, "reset_at": 1800600000
                }
            }
        }))
        .unwrap();
        let result = build_codex_live_result(response, None, 100);
        assert_eq!(result.usage_summary.unwrap().percent, Some(9.0));
        assert_eq!(result.reset_at, None);
        assert!(result.detail_sections[1].rows[0]
            .value
            .ends_with("Reset unknown"));
    }

    #[test]
    fn absent_usage_stays_unavailable_instead_of_zero() {
        let response = serde_json::from_value(json!({ "rate_limit": null })).unwrap();
        let result = build_codex_live_result(response, None, 100);
        assert!(result.detail_sections[1].rows.is_empty());
        assert!(result.usage_summary.is_none());
        assert!(result.reset_at.is_none());
    }

    #[test]
    fn review_and_model_windows_use_their_reported_durations() {
        let response = serde_json::from_value(json!({
            "code_review_rate_limit": {
                "secondary_window": { "used_percent": 20, "limit_window_seconds": 86400 }
            },
            "additional_rate_limits": [{
                "limit_name": "GPT-5.3-Codex-Spark",
                "rate_limit": {
                    "primary_window": { "used_percent": 4, "limit_window_seconds": 604800 }
                }
            }]
        }))
        .unwrap();
        let result = build_codex_live_result(response, None, 100);
        let rows = &result.detail_sections[1].rows;
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].label, "Reviews · 1 day");
        assert_eq!(rows[1].label, "Spark · 1 week");
        assert!(result.usage_summary.is_none());
    }

    #[test]
    fn formats_durations_without_guessing_missing_metadata() {
        assert_eq!(window_label(Some(18_000), "Primary window"), "5 hours");
        assert_eq!(window_label(Some(604_800), "Primary window"), "1 week");
        assert_eq!(window_label(Some(1_209_600), "Primary window"), "2 weeks");
        assert_eq!(window_label(Some(2_592_000), "Primary window"), "30 days");
        assert_eq!(window_label(Some(900), "Primary window"), "15 minutes");
        assert_eq!(window_label(Some(90), "Primary window"), "90 seconds");
        assert_eq!(window_label(None, "Primary window"), "Primary window");
        assert_eq!(
            window_label(Some(0), "Secondary window"),
            "Secondary window"
        );
    }

    #[test]
    fn normalizes_spark_additional_limit_names() {
        assert_eq!(additional_limit_label(Some("GPT-5.3-Codex-Spark")), "Spark");
        assert_eq!(additional_limit_label(Some("GPT-5-Codex-Spark")), "Spark");
    }

    #[test]
    fn falls_back_for_missing_additional_limit_name() {
        assert_eq!(additional_limit_label(Some("")), "Model");
        assert_eq!(additional_limit_label(None), "Model");
    }

    #[test]
    fn builds_spark_rows_from_additional_rate_limits() {
        let rows = build_additional_rate_limit_rows(
            Some(&[CodexAdditionalRateLimit {
                limit_name: Some("GPT-5.3-Codex-Spark".to_string()),
                rate_limit: Some(CodexRateLimit {
                    primary_window: Some(CodexWindow {
                        used_percent: Some(12.0),
                        reset_at: Some(1_800_000_000),
                        reset_after_seconds: None,
                        limit_window_seconds: Some(18_000),
                    }),
                    secondary_window: Some(CodexWindow {
                        used_percent: Some(34.0),
                        reset_at: Some(1_800_600_000),
                        reset_after_seconds: None,
                        limit_window_seconds: Some(604_800),
                    }),
                }),
            }]),
            1_700_000_000,
        );

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].label, "Spark · 5 hours");
        assert!(rows[0].value.contains("12% used"));
        assert_eq!(rows[1].label, "Spark · 1 week");
        assert!(rows[1].value.contains("34% used"));
    }
}
