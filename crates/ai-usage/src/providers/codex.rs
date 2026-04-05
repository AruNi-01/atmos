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

    let session = response
        .rate_limit
        .as_ref()
        .and_then(|value| value.primary_window.as_ref());
    let weekly = response
        .rate_limit
        .as_ref()
        .and_then(|value| value.secondary_window.as_ref());
    let session_percent = session.and_then(|value| value.used_percent);
    let session_reset = session.and_then(|value| effective_reset_at(value, now));
    let weekly_percent = weekly.and_then(|value| value.used_percent);
    let weekly_reset = weekly.and_then(|value| effective_reset_at(value, now));
    let reviews = response
        .code_review_rate_limit
        .as_ref()
        .and_then(|value| value.primary_window.as_ref());
    let reviews_percent = reviews.and_then(|value| value.used_percent);
    let reviews_reset = reviews.and_then(|value| effective_reset_at(value, now));

    let plan_label = response.plan_type.clone().map(titleize);
    let credits_label = credits_label(response.credits.as_ref());

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: vec![
                DetailRow {
                    label: "Account".to_string(),
                    value: auth.email.unwrap_or_else(|| "Codex".to_string()),
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
            rows: vec![
                DetailRow {
                    label: "5 hours".to_string(),
                    value: format_window(session_percent, session_reset),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "1 week".to_string(),
                    value: format_window(weekly_percent, weekly_reset),
                    tone: RowTone::Default,
                },
            ],
        },
    ];

    if let Some(percent) = reviews_percent {
        if let Some(section) = detail_sections
            .iter_mut()
            .find(|section| section.title == "Usage")
        {
            section.rows.push(DetailRow {
                label: "Reviews".to_string(),
                value: format_window(Some(percent), reviews_reset),
                tone: RowTone::Default,
            });
        }
    }

    if let Some(section) = detail_sections
        .iter_mut()
        .find(|section| section.title == "Usage")
    {
        section.rows.extend(build_additional_rate_limit_rows(
            response.additional_rate_limits.as_deref(),
            now,
        ));
    }

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

    Ok(LiveFetchResult {
        plan_label,
        usage_summary: Some(build_percent_usage_summary(session_percent)),
        detail_sections,
        warnings: vec![],
        fetch_message: "Codex OAuth usage API".to_string(),
        reset_at: session_reset.or(weekly_reset),
        credits_label,
        last_updated_at: Some(unix_now()),
    })
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

        if let Some(window) = rate_limit.primary_window.as_ref() {
            if let Some(percent) = window.used_percent {
                rows.push(DetailRow {
                    label: base_label.clone(),
                    value: format_window(Some(percent), effective_reset_at(window, now)),
                    tone: RowTone::Default,
                });
            }
        }

        if let Some(window) = rate_limit.secondary_window.as_ref() {
            if let Some(percent) = window.used_percent {
                rows.push(DetailRow {
                    label: format!("{base_label} Weekly"),
                    value: format_window(Some(percent), effective_reset_at(window, now)),
                    tone: RowTone::Default,
                });
            }
        }
    }

    rows
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

fn format_window(percent: Option<f64>, reset_at: Option<u64>) -> String {
    let percent = percent.map(round_metric).unwrap_or(0.0);
    format!(
        "{percent:.0}% used · {}",
        format_reset_relative_text(reset_at)
    )
}

#[cfg(test)]
mod tests {
    use super::{
        additional_limit_label, build_additional_rate_limit_rows, CodexAdditionalRateLimit,
        CodexRateLimit, CodexWindow,
    };

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
        assert_eq!(rows[0].label, "Spark");
        assert!(rows[0].value.contains("12% used"));
        assert_eq!(rows[1].label, "Spark Weekly");
        assert!(rows[1].value.contains("34% used"));
    }
}
