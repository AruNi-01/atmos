//! Grok Build SuperGrok / Grok Build subscription quota.
//!
//! Auth: `~/.grok/auth.json` (same file written by `grok login`).
//! Live: `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use std::fs;
use std::path::PathBuf;

use crate::constants::GROK_BILLING_CREDITS_URL;
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, expand_home, format_reset_relative_text, parse_offset_datetime,
    round_metric, unix_now,
};

const OIDC_SCOPE_PREFIX: &str = "https://auth.x.ai::";
const LEGACY_SESSION_SCOPE: &str = "https://accounts.x.ai/sign-in";

#[derive(Debug, Clone)]
struct GrokAuth {
    access_token: String,
    email: Option<String>,
    team_id: Option<String>,
    display_name: Option<String>,
    login_method: Option<String>,
    expires_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GrokBillingResponse {
    #[serde(default)]
    config: Option<GrokBillingConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrokBillingConfig {
    #[serde(default)]
    current_period: Option<GrokUsagePeriod>,
    #[serde(default)]
    credit_usage_percent: Option<f64>,
    #[serde(default)]
    product_usage: Vec<GrokProductUsage>,
    #[serde(default)]
    is_unified_billing_user: Option<bool>,
    #[serde(default)]
    on_demand_cap: Option<GrokCent>,
    #[serde(default)]
    on_demand_used: Option<GrokCent>,
    #[serde(default)]
    prepaid_balance: Option<GrokCent>,
    #[serde(default)]
    billing_period_start: Option<String>,
    #[serde(default)]
    billing_period_end: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GrokUsagePeriod {
    #[serde(default, rename = "type")]
    period_type: Option<String>,
    #[serde(default)]
    start: Option<String>,
    #[serde(default)]
    end: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GrokProductUsage {
    #[serde(default)]
    product: Option<String>,
    #[serde(default, rename = "usagePercent")]
    usage_percent: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct GrokCent {
    #[serde(default)]
    val: Option<i64>,
}

pub(crate) async fn fetch_grok_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let auth = load_grok_auth()?;
    let config = request_credits_billing(client, &auth).await?;
    Ok(map_credits_config(config, &auth))
}

fn map_credits_config(config: GrokBillingConfig, auth: &GrokAuth) -> LiveFetchResult {
    let product_percent = config
        .product_usage
        .iter()
        .find(|row| {
            row.product
                .as_deref()
                .is_some_and(|name| name.eq_ignore_ascii_case("GrokBuild"))
        })
        .and_then(|row| row.usage_percent);
    let percent = product_percent
        .or(config.credit_usage_percent)
        .map(round_metric);

    let period_end = config
        .current_period
        .as_ref()
        .and_then(|period| period.end.as_deref())
        .or(config.billing_period_end.as_deref());
    let period_start = config
        .current_period
        .as_ref()
        .and_then(|period| period.start.as_deref())
        .or(config.billing_period_start.as_deref());
    let reset_at = period_end.and_then(parse_rfc3339_unix);

    let window_label = window_label_for_period(
        config
            .current_period
            .as_ref()
            .and_then(|period| period.period_type.as_deref()),
        period_start,
        period_end,
    );

    let mut usage_rows = Vec::new();
    if let Some(percent) = percent {
        let mut value = format!("{percent:.0}% used");
        if reset_at.is_some() {
            value.push_str(" · ");
            value.push_str(&format_reset_relative_text(reset_at));
        }
        usage_rows.push(DetailRow {
            label: window_label.clone(),
            value,
            tone: RowTone::Default,
        });
    }

    for product in &config.product_usage {
        let Some(name) = product.product.as_deref() else {
            continue;
        };
        if name.eq_ignore_ascii_case("GrokBuild") && product_percent.is_some() {
            // Already shown as the primary window when it drove the percent.
            if product_percent == percent && usage_rows.len() == 1 {
                continue;
            }
        }
        if let Some(usage_percent) = product.usage_percent.map(round_metric) {
            usage_rows.push(DetailRow {
                label: product_label(name),
                value: format!("{usage_percent:.0}% used"),
                tone: RowTone::Default,
            });
        }
    }

    if let Some(cap) = config.on_demand_cap.as_ref().and_then(|cent| cent.val) {
        let used = config
            .on_demand_used
            .as_ref()
            .and_then(|cent| cent.val)
            .unwrap_or(0);
        usage_rows.push(DetailRow {
            label: "Extra usage".to_string(),
            value: if cap <= 0 {
                "Disabled".to_string()
            } else {
                format!(
                    "${:.2} / ${:.2}",
                    cents_to_dollars(used),
                    cents_to_dollars(cap)
                )
            },
            tone: RowTone::Muted,
        });
    }

    if let Some(balance) = config.prepaid_balance.as_ref().and_then(|cent| cent.val) {
        if balance > 0 {
            usage_rows.push(DetailRow {
                label: "Prepaid balance".to_string(),
                value: format!("${:.2}", cents_to_dollars(balance)),
                tone: RowTone::Muted,
            });
        }
    }

    if usage_rows.is_empty() {
        usage_rows.push(DetailRow {
            label: window_label.clone(),
            value: "No data".to_string(),
            tone: RowTone::Muted,
        });
    }

    let plan_label = auth
        .login_method
        .clone()
        .or_else(|| {
            config
                .is_unified_billing_user
                .filter(|value| *value)
                .map(|_| "Unified billing".to_string())
        })
        .or_else(|| Some("Grok Build".to_string()));

    let mut account_rows = vec![DetailRow {
        label: "Account".to_string(),
        value: auth
            .email
            .clone()
            .or_else(|| auth.display_name.clone())
            .unwrap_or_else(|| "Grok".to_string()),
        tone: RowTone::Default,
    }];
    if let Some(plan) = plan_label.clone() {
        account_rows.push(DetailRow {
            label: "Plan".to_string(),
            value: plan,
            tone: RowTone::Default,
        });
    }
    if let Some(team_id) = auth.team_id.clone() {
        account_rows.push(DetailRow {
            label: "Team".to_string(),
            value: team_id,
            tone: RowTone::Muted,
        });
    }
    if let Some(expires_at) = auth.expires_at.clone() {
        account_rows.push(DetailRow {
            label: "Token expires".to_string(),
            value: expires_at,
            tone: RowTone::Muted,
        });
    }

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: account_rows,
        },
        DetailSection {
            title: "Usage".to_string(),
            rows: usage_rows,
        },
    ];

    if let (Some(start), Some(end)) = (period_start, period_end) {
        detail_sections.push(DetailSection {
            title: "Billing period".to_string(),
            rows: vec![
                DetailRow {
                    label: "Start".to_string(),
                    value: start.to_string(),
                    tone: RowTone::Muted,
                },
                DetailRow {
                    label: "End".to_string(),
                    value: end.to_string(),
                    tone: RowTone::Muted,
                },
            ],
        });
    }

    LiveFetchResult {
        plan_label,
        usage_summary: Some(build_percent_usage_summary(percent)),
        detail_sections,
        warnings: vec![],
        fetch_message: "Grok CLI billing (cli-chat-proxy)".to_string(),
        reset_at,
        credits_label: percent.map(|value| format!("{value:.0}% used")),
        last_updated_at: Some(unix_now()),
    }
}

async fn request_credits_billing(
    client: &Client,
    auth: &GrokAuth,
) -> Result<GrokBillingConfig, ProviderError> {
    let response = client
        .get(GROK_BILLING_CREDITS_URL)
        .bearer_auth(&auth.access_token)
        .header("Accept", "application/json")
        .header("User-Agent", "Atmos/ai-usage")
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Grok billing request failed: {error}")))?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ProviderError::Fetch(
            "Grok session expired or token invalid. Run `grok login` to re-authenticate."
                .to_string(),
        ));
    }
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = body.chars().take(200).collect::<String>();
        return Err(ProviderError::Fetch(format!(
            "Grok billing returned HTTP {status}: {detail}"
        )));
    }

    let payload = response
        .json::<GrokBillingResponse>()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Invalid Grok billing payload: {error}")))?;
    payload.config.ok_or_else(|| {
        ProviderError::Fetch("Grok billing response missing config object".to_string())
    })
}

fn load_grok_auth() -> Result<GrokAuth, ProviderError> {
    let path = grok_auth_path().ok_or_else(|| {
        ProviderError::Fetch("Grok auth.json not found. Run `grok login`.".to_string())
    })?;
    if !path.exists() {
        return Err(ProviderError::Fetch(
            "Grok auth.json not found. Run `grok login`.".to_string(),
        ));
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    parse_grok_auth(&contents)
}

fn grok_auth_path() -> Option<PathBuf> {
    if let Some(home) = env::var("GROK_HOME")
        .ok()
        .and_then(|value| expand_home(&value))
    {
        return Some(home.join("auth.json"));
    }
    expand_home("~/.grok/auth.json")
}

fn parse_grok_auth(contents: &str) -> Result<GrokAuth, ProviderError> {
    let root = serde_json::from_str::<Value>(contents)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Grok auth.json: {error}")))?;
    let object = root
        .as_object()
        .ok_or_else(|| ProviderError::Fetch("Grok auth.json root must be an object".to_string()))?;

    let mut oidc: Option<(&str, &Value)> = None;
    let mut legacy: Option<(&str, &Value)> = None;
    for (scope, entry) in object {
        let Some(map) = entry.as_object() else {
            continue;
        };
        let key = map
            .get("key")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if key.is_none() {
            continue;
        }
        if scope.starts_with(OIDC_SCOPE_PREFIX) {
            oidc = Some((scope.as_str(), entry));
        } else if scope == LEGACY_SESSION_SCOPE || scope.contains("/sign-in") {
            legacy = Some((scope.as_str(), entry));
        }
    }

    let (_scope, entry) = oidc.or(legacy).ok_or_else(|| {
        ProviderError::Fetch(
            "Grok auth.json has no usable access token. Run `grok login`.".to_string(),
        )
    })?;
    let map = entry
        .as_object()
        .ok_or_else(|| ProviderError::Fetch("Grok auth entry is not an object".to_string()))?;
    let access_token = map
        .get("key")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ProviderError::Fetch("Grok auth entry missing key".to_string()))?
        .to_string();

    let email = string_field(map, "email");
    let team_id = string_field(map, "team_id");
    let first_name = string_field(map, "first_name");
    let last_name = string_field(map, "last_name");
    let display_name = match (first_name, last_name) {
        (Some(first), Some(last)) => Some(format!("{first} {last}")),
        (Some(first), None) => Some(first),
        (None, Some(last)) => Some(last),
        (None, None) => None,
    };
    let auth_mode = string_field(map, "auth_mode");
    let login_method = match auth_mode.as_deref() {
        Some("oidc") => Some("SuperGrok".to_string()),
        Some(other) => Some(other.to_string()),
        None => None,
    };
    let expires_at = string_field(map, "expires_at");

    Ok(GrokAuth {
        access_token,
        email,
        team_id,
        display_name,
        login_method,
        expires_at,
    })
}

fn string_field(map: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    map.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_rfc3339_unix(raw: &str) -> Option<u64> {
    parse_offset_datetime(raw).map(|dt| dt.unix_timestamp().max(0) as u64)
}

fn window_label_for_period(
    period_type: Option<&str>,
    start: Option<&str>,
    end: Option<&str>,
) -> String {
    if let Some(period_type) = period_type {
        let upper = period_type.to_ascii_uppercase();
        if upper.contains("WEEK") {
            return "Weekly".to_string();
        }
        if upper.contains("MONTH") {
            return "Monthly".to_string();
        }
        if upper.contains("DAY") {
            return "Daily".to_string();
        }
    }

    if let (Some(start_ts), Some(end_ts)) = (
        start.and_then(parse_rfc3339_unix),
        end.and_then(parse_rfc3339_unix),
    ) {
        if end_ts > start_ts {
            let days = (end_ts - start_ts) as f64 / 86_400.0;
            if (6.0..8.0).contains(&days) {
                return "Weekly".to_string();
            }
            if (27.0..32.0).contains(&days) {
                return "Monthly".to_string();
            }
        }
    }

    "Credits".to_string()
}

fn product_label(name: &str) -> String {
    if name.eq_ignore_ascii_case("GrokBuild") {
        "Grok Build".to_string()
    } else {
        name.to_string()
    }
}

fn cents_to_dollars(cents: i64) -> f64 {
    cents as f64 / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    const CREDITS_FIXTURE: &str = r#"{
      "config": {
        "currentPeriod": {
          "type": "USAGE_PERIOD_TYPE_WEEKLY",
          "start": "2026-07-09T22:17:47.739583+00:00",
          "end": "2026-07-16T22:17:47.739583+00:00"
        },
        "creditUsagePercent": 13.0,
        "onDemandCap": { "val": 0 },
        "onDemandUsed": { "val": 0 },
        "productUsage": [
          { "product": "GrokBuild", "usagePercent": 13.0 }
        ],
        "isUnifiedBillingUser": true,
        "prepaidBalance": { "val": 0 },
        "billingPeriodStart": "2026-07-09T22:17:47.739583+00:00",
        "billingPeriodEnd": "2026-07-16T22:17:47.739583+00:00"
      }
    }"#;

    #[test]
    fn prefers_oidc_scope_over_legacy() {
        let raw = r#"{
          "https://accounts.x.ai/sign-in": {
            "key": "legacy-token",
            "email": "legacy@example.com",
            "auth_mode": "session"
          },
          "https://auth.x.ai::client-id": {
            "key": "oidc-token",
            "email": "oidc@example.com",
            "auth_mode": "oidc",
            "team_id": "team-1",
            "first_name": "Ada",
            "last_name": "Lovelace"
          }
        }"#;
        let auth = parse_grok_auth(raw).expect("auth");
        assert_eq!(auth.access_token, "oidc-token");
        assert_eq!(auth.email.as_deref(), Some("oidc@example.com"));
        assert_eq!(auth.login_method.as_deref(), Some("SuperGrok"));
        assert_eq!(auth.display_name.as_deref(), Some("Ada Lovelace"));
        assert_eq!(auth.team_id.as_deref(), Some("team-1"));
    }

    #[test]
    fn falls_back_to_legacy_when_oidc_key_empty() {
        let raw = r#"{
          "https://auth.x.ai::client-id": {
            "key": "",
            "email": "broken@example.com",
            "auth_mode": "oidc"
          },
          "https://accounts.x.ai/sign-in": {
            "key": "legacy-token",
            "email": "legacy@example.com",
            "auth_mode": "session"
          }
        }"#;
        let auth = parse_grok_auth(raw).expect("auth");
        assert_eq!(auth.access_token, "legacy-token");
        assert_eq!(auth.email.as_deref(), Some("legacy@example.com"));
    }

    #[test]
    fn rejects_auth_without_tokens() {
        let err = parse_grok_auth(r#"{"https://auth.x.ai::x": {"email": "a@b.c"}}"#)
            .expect_err("should fail");
        assert!(err.to_string().contains("no usable access token"));
    }

    #[test]
    fn maps_credits_billing_to_weekly_usage() {
        let response: GrokBillingResponse =
            serde_json::from_str(CREDITS_FIXTURE).expect("fixture parse");
        let config = response.config.expect("config");
        let auth = GrokAuth {
            access_token: "tok".into(),
            email: Some("user@example.com".into()),
            team_id: Some("team-1".into()),
            display_name: None,
            login_method: Some("SuperGrok".into()),
            expires_at: None,
        };
        let result = map_credits_config(config, &auth);
        let percent = result
            .usage_summary
            .as_ref()
            .and_then(|summary| summary.percent);
        assert_eq!(percent, Some(13.0));
        assert!(result.reset_at.is_some());
        let usage = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Usage")
            .expect("usage section");
        assert_eq!(usage.rows[0].label, "Weekly");
        assert!(usage.rows[0].value.contains("13% used"));
        assert!(usage.rows.iter().any(|row| row.label == "Extra usage"
            && row.value == "Disabled"));
        assert_eq!(result.plan_label.as_deref(), Some("SuperGrok"));
        assert!(result.fetch_message.contains("cli-chat-proxy"));
    }

    #[test]
    fn window_label_from_period_type() {
        assert_eq!(
            window_label_for_period(Some("USAGE_PERIOD_TYPE_WEEKLY"), None, None),
            "Weekly"
        );
        assert_eq!(
            window_label_for_period(Some("USAGE_PERIOD_TYPE_MONTHLY"), None, None),
            "Monthly"
        );
    }
}
