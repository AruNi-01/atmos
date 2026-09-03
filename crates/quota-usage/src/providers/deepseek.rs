//! DeepSeek account balance (`GET https://api.deepseek.com/user/balance`).
//!
//! Auth: stored API key in `~/.atmos/data/quota-usage/provider_config.json`
//! (shared with DeepSeek Harness ACP), then `DEEPSEEK_API_KEY`, then a legacy
//! custom-agent overlay env.

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::env;
use std::fs;

use crate::config::{add_provider_api_key, provider_config_api_keys};
use crate::constants::{DEEPSEEK_API_KEY_ENV, DEEPSEEK_BALANCE_URL, DEEPSEEK_HARNESS_ID};
use crate::models::{DetailRow, DetailSection, ProviderError, QuotaSummary, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::unix_now;

const PROVIDER_ID: &str = "deepseek";

#[derive(Debug, Deserialize)]
struct DeepSeekBalanceResponse {
    #[serde(default)]
    is_available: Option<bool>,
    #[serde(default)]
    balance_infos: Vec<DeepSeekBalanceInfo>,
}

#[derive(Debug, Clone, Deserialize)]
struct DeepSeekBalanceInfo {
    #[serde(default)]
    currency: Option<String>,
    #[serde(default)]
    total_balance: Option<String>,
    #[serde(default)]
    granted_balance: Option<String>,
    #[serde(default)]
    topped_up_balance: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OverlayFile {
    #[serde(default)]
    custom_agents: BTreeMap<String, OverlayAgent>,
}

#[derive(Debug, Deserialize)]
struct OverlayAgent {
    #[serde(default)]
    env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy)]
enum KeySource {
    Stored,
    Env,
    Overlay,
}

impl KeySource {
    fn fetch_message(self) -> &'static str {
        match self {
            Self::Stored => "DeepSeek balance via stored API key",
            Self::Env => "DeepSeek balance via DEEPSEEK_API_KEY",
            Self::Overlay => "DeepSeek balance via custom agent overlay",
        }
    }
}

pub(crate) async fn fetch_deepseek_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    migrate_overlay_key_into_store();
    let keys = resolve_deepseek_api_keys();
    if keys.is_empty() {
        return Err(ProviderError::Fetch(
            "DeepSeek API token not found. Add it in AI Quota Usage or set DEEPSEEK_API_KEY."
                .to_string(),
        ));
    }

    let mut last_error = None;
    for (api_key, source) in keys {
        match fetch_balance(client, &api_key).await {
            Ok(payload) => return Ok(map_balance_payload(payload, source.fetch_message())),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| {
        ProviderError::Fetch("DeepSeek balance endpoint returned no data".to_string())
    }))
}

pub(crate) fn overlay_auth_source() -> Option<String> {
    overlay_deepseek_api_key().map(|(_, source)| source)
}

fn migrate_overlay_key_into_store() {
    if !provider_config_api_keys(PROVIDER_ID).is_empty() {
        return;
    }
    let Some((key, _)) = overlay_deepseek_api_key() else {
        return;
    };
    add_provider_api_key(PROVIDER_ID, None, key);
}

fn resolve_deepseek_api_keys() -> Vec<(String, KeySource)> {
    let mut keys = Vec::new();
    for named in provider_config_api_keys(PROVIDER_ID) {
        let trimmed = named.api_key.trim().to_string();
        if !trimmed.is_empty() {
            keys.push((trimmed, KeySource::Stored));
        }
    }
    if let Some(env_key) = clean_env_value(env::var(DEEPSEEK_API_KEY_ENV).ok()) {
        if !keys.iter().any(|(existing, _)| existing == &env_key) {
            keys.push((env_key, KeySource::Env));
        }
    }
    if keys.is_empty() {
        if let Some((overlay_key, _)) = overlay_deepseek_api_key() {
            keys.push((overlay_key, KeySource::Overlay));
        }
    }
    keys
}

fn overlay_deepseek_api_key() -> Option<(String, String)> {
    let path = dirs::home_dir()?.join(".atmos/config/agent/acp_servers.json");
    if !path.exists() {
        return None;
    }
    let contents = fs::read_to_string(&path).ok()?;
    let overlay = serde_json::from_str::<OverlayFile>(&contents).ok()?;
    let key = overlay
        .custom_agents
        .get(DEEPSEEK_HARNESS_ID)?
        .env
        .get(DEEPSEEK_API_KEY_ENV)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    Some((key, path.display().to_string()))
}

async fn fetch_balance(
    client: &Client,
    api_key: &str,
) -> Result<DeepSeekBalanceResponse, ProviderError> {
    let response = client
        .get(DEEPSEEK_BALANCE_URL)
        .bearer_auth(api_key)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    if !status.is_success() {
        return Err(ProviderError::Fetch(format_http_error(
            status.as_u16(),
            &body,
        )));
    }

    serde_json::from_str::<DeepSeekBalanceResponse>(&body)
        .map_err(|error| ProviderError::Fetch(format!("Invalid DeepSeek payload: {error}")))
}

fn map_balance_payload(payload: DeepSeekBalanceResponse, fetch_message: &str) -> LiveFetchResult {
    let available = payload.is_available.unwrap_or(false);
    let infos = payload.balance_infos;
    let credit_parts = infos.iter().filter_map(format_total).collect::<Vec<_>>();
    let credits_label = if credit_parts.is_empty() {
        None
    } else {
        Some(credit_parts.join(" · "))
    };
    let primary = infos.first();
    let remaining = primary
        .and_then(|info| info.total_balance.as_deref())
        .and_then(parse_amount);
    let remaining_label = primary.and_then(format_total);
    let currency = primary
        .and_then(|info| info.currency.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let mut balance_rows = vec![DetailRow {
        label: "Available".to_string(),
        value: if available {
            "Yes".to_string()
        } else {
            "No".to_string()
        },
        tone: if available {
            RowTone::Success
        } else {
            RowTone::Warning
        },
    }];
    for info in &infos {
        let currency = info
            .currency
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Unknown");
        push_amount_row(
            &mut balance_rows,
            &format!("Total ({currency})"),
            info.total_balance.as_deref(),
            currency,
        );
        push_amount_row(
            &mut balance_rows,
            &format!("Granted ({currency})"),
            info.granted_balance.as_deref(),
            currency,
        );
        push_amount_row(
            &mut balance_rows,
            &format!("Topped up ({currency})"),
            info.topped_up_balance.as_deref(),
            currency,
        );
    }

    LiveFetchResult {
        plan_label: None,
        usage_summary: Some(QuotaSummary {
            unit: Some("balance".to_string()),
            currency,
            used: None,
            remaining,
            cap: None,
            percent: None,
            used_label: None,
            remaining_label,
            cap_label: None,
        }),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![DetailRow {
                    label: "Account".to_string(),
                    value: "DeepSeek".to_string(),
                    tone: RowTone::Default,
                }],
            },
            DetailSection {
                title: "Balance".to_string(),
                rows: balance_rows,
            },
        ],
        warnings: vec![],
        fetch_message: fetch_message.to_string(),
        reset_at: None,
        credits_label,
        last_updated_at: Some(unix_now()),
    }
}

fn format_total(info: &DeepSeekBalanceInfo) -> Option<String> {
    format_amount_with_currency(info.total_balance.as_deref()?, info.currency.as_deref())
}

fn format_amount_with_currency(amount: &str, currency: Option<&str>) -> Option<String> {
    let amount = amount.trim();
    if amount.is_empty() {
        return None;
    }
    let currency = currency.map(str::trim).filter(|value| !value.is_empty())?;
    Some(format!("{amount} {currency}"))
}

fn push_amount_row(rows: &mut Vec<DetailRow>, label: &str, amount: Option<&str>, currency: &str) {
    let Some(value) = amount.and_then(|amount| format_amount_with_currency(amount, Some(currency)))
    else {
        return;
    };
    rows.push(DetailRow {
        label: label.to_string(),
        value,
        tone: RowTone::Default,
    });
}

fn parse_amount(text: &str) -> Option<f64> {
    text.trim().replace(',', "").parse::<f64>().ok()
}

fn clean_env_value(raw: Option<String>) -> Option<String> {
    let mut value = raw?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    if (value.starts_with('"') && value.ends_with('"'))
        || (value.starts_with('\'') && value.ends_with('\''))
    {
        value.remove(0);
        value.pop();
    }
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn format_http_error(status: u16, body: &str) -> String {
    if let Some(message) = serde_json::from_str::<Value>(body).ok().and_then(|value| {
        value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }) {
        return format!("HTTP {status}: {message}");
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        format!("HTTP {status}")
    } else if trimmed.len() <= 180 {
        format!("HTTP {status}: {trimmed}")
    } else {
        format!("HTTP {status}: {}...", &trimmed[..180])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
      "is_available": true,
      "balance_infos": [
        {
          "currency": "CNY",
          "total_balance": "110.00",
          "granted_balance": "10.00",
          "topped_up_balance": "100.00"
        },
        {
          "currency": "USD",
          "total_balance": "20",
          "granted_balance": "0.00",
          "topped_up_balance": "20"
        }
      ]
    }"#;

    #[test]
    fn maps_all_balance_fields_with_currency_suffix() {
        let payload: DeepSeekBalanceResponse = serde_json::from_str(FIXTURE).expect("fixture");
        let result = map_balance_payload(payload, "test");
        assert_eq!(result.credits_label.as_deref(), Some("110.00 CNY · 20 USD"));
        let summary = result.usage_summary.expect("summary");
        assert_eq!(summary.percent, None);
        assert_eq!(summary.currency.as_deref(), Some("CNY"));
        assert_eq!(summary.remaining, Some(110.0));
        assert_eq!(summary.remaining_label.as_deref(), Some("110.00 CNY"));

        let balance = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Balance")
            .expect("balance section");
        let rows: Vec<(&str, &str)> = balance
            .rows
            .iter()
            .map(|row| (row.label.as_str(), row.value.as_str()))
            .collect();
        assert_eq!(
            rows,
            vec![
                ("Available", "Yes"),
                ("Total (CNY)", "110.00 CNY"),
                ("Granted (CNY)", "10.00 CNY"),
                ("Topped up (CNY)", "100.00 CNY"),
                ("Total (USD)", "20 USD"),
                ("Granted (USD)", "0.00 USD"),
                ("Topped up (USD)", "20 USD"),
            ]
        );
    }

    #[test]
    fn formats_unavailable_account() {
        let payload: DeepSeekBalanceResponse =
            serde_json::from_str(r#"{"is_available": false, "balance_infos": []}"#)
                .expect("payload");
        let result = map_balance_payload(payload, "test");
        assert_eq!(result.credits_label, None);
        let balance = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Balance")
            .expect("balance section");
        assert_eq!(balance.rows[0].label, "Available");
        assert_eq!(balance.rows[0].value, "No");
        assert_eq!(balance.rows[0].tone, RowTone::Warning);
    }

    #[test]
    fn format_amount_keeps_source_digits() {
        assert_eq!(
            format_amount_with_currency("20", Some("CNY")).as_deref(),
            Some("20 CNY")
        );
        assert_eq!(
            format_amount_with_currency("20.00", Some("USD")).as_deref(),
            Some("20.00 USD")
        );
    }
}
