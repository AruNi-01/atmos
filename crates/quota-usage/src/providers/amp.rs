use reqwest::Client;
use serde_json::Value;
use std::fs;

use crate::models::{DetailRow, DetailSection, ProviderError, RowTone, UsageSummary};
use crate::runtime::LiveFetchResult;
use crate::support::{
    expand_home, extract_named_object, extract_object_number, format_reset_relative_text,
    load_amp_session_cookie_source, round_metric, unix_now, BrowserCookieSource,
};

#[derive(Debug, Clone)]
struct AmpBalanceInfo {
    account: Option<String>,
    plan: String,
    remaining: Option<f64>,
    total: Option<f64>,
    hourly_rate: f64,
    bonus_pct: Option<u64>,
    bonus_days: Option<u64>,
    credits_label: Option<String>,
}

pub(crate) async fn fetch_amp_live(
    client: &Client,
    browser_source: Option<&BrowserCookieSource>,
) -> Result<LiveFetchResult, ProviderError> {
    if let Some(api_key) = load_amp_api_key()? {
        if let Ok(result) = fetch_amp_api_balance(client, &api_key).await {
            return Ok(result);
        }
    }

    fetch_amp_html_balance(client, browser_source).await
}

async fn fetch_amp_api_balance(
    client: &Client,
    api_key: &str,
) -> Result<LiveFetchResult, ProviderError> {
    let response = client
        .post("https://ampcode.com/api/internal")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "method": "userDisplayBalanceInfo",
            "params": {}
        }))
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Amp internal API failed: {error}")))?;

    if matches!(
        response.status(),
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
    ) {
        return Err(ProviderError::Fetch(
            "Amp session expired. Re-authenticate in Amp Code.".to_string(),
        ));
    }

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("error")
                    .and_then(|error| error.get("message").or_else(|| error.get("detail")))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| format!("Request failed (HTTP {status}). Try again later."));
        return Err(ProviderError::Fetch(detail));
    }

    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Invalid Amp API payload: {error}")))?;
    let display_text = payload
        .get("result")
        .and_then(|value| value.get("displayText"))
        .and_then(Value::as_str)
        .ok_or_else(|| ProviderError::Fetch("Amp displayText missing".to_string()))?;

    let balance = parse_amp_display_text(display_text)
        .ok_or_else(|| ProviderError::Fetch("Could not parse Amp usage data.".to_string()))?;

    build_amp_live_result(balance, "Amp internal API via local secrets")
}

async fn fetch_amp_html_balance(
    client: &Client,
    browser_source: Option<&BrowserCookieSource>,
) -> Result<LiveFetchResult, ProviderError> {
    let cookie_source = load_amp_session_cookie_source(browser_source)?;

    let response = client
        .get("https://ampcode.com/settings")
        .header("Cookie", &cookie_source.cookie_header)
        .header(
            "accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Amp settings fetch failed: {error}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Amp settings returned {}",
            response.status()
        )));
    }

    let html = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Amp HTML decode failed: {error}")))?;
    let object = extract_named_object(&html, &["freeTierUsage", "getFreeTierUsage"])
        .ok_or_else(|| ProviderError::Fetch("Amp freeTierUsage payload missing".to_string()))?;
    let quota = extract_object_number(&object, "quota")
        .ok_or_else(|| ProviderError::Fetch("Amp quota missing".to_string()))?;
    let used = extract_object_number(&object, "used")
        .ok_or_else(|| ProviderError::Fetch("Amp used missing".to_string()))?;
    let hourly = extract_object_number(&object, "hourlyReplenishment")
        .ok_or_else(|| ProviderError::Fetch("Amp hourly replenishment missing".to_string()))?;

    build_amp_live_result(
        AmpBalanceInfo {
            account: Some(cookie_source.source_label.clone()),
            plan: "Free".to_string(),
            remaining: Some((quota - used).max(0.0)),
            total: Some(quota),
            hourly_rate: hourly,
            bonus_pct: None,
            bonus_days: None,
            credits_label: None,
        },
        &format!("Amp settings page via {}", cookie_source.source_label),
    )
}

fn build_amp_live_result(
    balance: AmpBalanceInfo,
    fetch_message: &str,
) -> Result<LiveFetchResult, ProviderError> {
    let used = match (balance.remaining, balance.total) {
        (Some(remaining), Some(total)) => Some((total - remaining).max(0.0)),
        _ => None,
    };
    let reset_at = match (used, balance.hourly_rate) {
        (Some(used), hourly_rate) if hourly_rate > 0.0 && used > 0.0 => {
            Some(unix_now().saturating_add(((used / hourly_rate) * 3600.0).round() as u64))
        }
        _ => None,
    };
    let percent = match (used, balance.total) {
        (Some(used), Some(total)) if total > 0.0 => Some(round_metric((used / total) * 100.0)),
        _ => None,
    };

    let mut usage_rows = Vec::new();
    if let Some(percent) = percent {
        let mut value = format!("{percent:.0}% used");
        if reset_at.is_some() {
            value.push_str(" · ");
            value.push_str(&format_reset_relative_text(reset_at));
        }
        usage_rows.push(DetailRow {
            label: "Realtime replenishes".to_string(),
            value,
            tone: RowTone::Default,
        });
    }
    if let (Some(pct), Some(days)) = (balance.bonus_pct, balance.bonus_days) {
        usage_rows.push(DetailRow {
            label: "Bonus".to_string(),
            value: format!("+{pct}% for {days}d"),
            tone: RowTone::Default,
        });
    }

    let mut detail_sections = vec![
        DetailSection {
            title: "Account".to_string(),
            rows: vec![
                DetailRow {
                    label: "Account".to_string(),
                    value: balance.account.unwrap_or_else(|| "Amp".to_string()),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Plan".to_string(),
                    value: balance.plan.clone(),
                    tone: RowTone::Default,
                },
            ],
        },
        DetailSection {
            title: "Usage".to_string(),
            rows: usage_rows,
        },
    ];

    if let Some(credits_label) = balance.credits_label.clone() {
        detail_sections.push(DetailSection {
            title: "Credits".to_string(),
            rows: vec![DetailRow {
                label: "Balance".to_string(),
                value: credits_label.clone(),
                tone: RowTone::Default,
            }],
        });
    }

    Ok(LiveFetchResult {
        plan_label: Some(balance.plan),
        usage_summary: percent.map(|percent| UsageSummary {
            unit: Some("dollars".to_string()),
            currency: Some("USD".to_string()),
            used: used.map(round_metric),
            remaining: balance.remaining.map(round_metric),
            cap: balance.total.map(round_metric),
            percent: Some(percent),
            used_label: used.map(|value| format!("${value:.2} used")),
            remaining_label: balance.remaining.map(|value| format!("${value:.2} left")),
            cap_label: balance.total.map(|value| format!("${value:.2} limit")),
        }),
        detail_sections,
        warnings: vec![],
        fetch_message: fetch_message.to_string(),
        reset_at,
        credits_label: balance.credits_label,
        last_updated_at: Some(unix_now()),
    })
}

fn load_amp_api_key() -> Result<Option<String>, ProviderError> {
    let Some(path) = expand_home("~/.local/share/amp/secrets.json") else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| ProviderError::Fetch(format!("{}: {error}", path.display())))?;
    let payload = serde_json::from_str::<Value>(&contents)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Amp secrets file: {error}")))?;
    Ok(payload
        .get("apiKey@https://ampcode.com/")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string))
}

fn parse_amp_display_text(text: &str) -> Option<AmpBalanceInfo> {
    let account = regex::Regex::new(r#"Signed in as ([^\n(]+)"#)
        .ok()
        .and_then(|regex| regex.captures(text))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string());
    let free_match = regex::Regex::new(
        r#"Amp Free: \$([0-9][0-9,]*(?:\.[0-9]+)?)\/\$([0-9][0-9,]*(?:\.[0-9]+)?) remaining \(replenishes \+\$([0-9][0-9,]*(?:\.[0-9]+)?)\/hour\)(?: \[\+(\d+)% bonus for (\d+) more days\])?"#,
    )
    .ok()
    .and_then(|regex| regex.captures(text));
    let credits_match = regex::Regex::new(
        r#"(?:Individual credits|Workspace [^:]+): \$([0-9][0-9,]*(?:\.[0-9]+)?) remaining"#,
    )
    .ok()
    .and_then(|regex| regex.captures(text))
    .and_then(|captures| captures.get(1))
    .and_then(|value| parse_money(value.as_str()));

    if let Some(captures) = free_match {
        return Some(AmpBalanceInfo {
            account,
            plan: "Free".to_string(),
            remaining: captures
                .get(1)
                .and_then(|value| parse_money(value.as_str())),
            total: captures
                .get(2)
                .and_then(|value| parse_money(value.as_str())),
            hourly_rate: captures
                .get(3)
                .and_then(|value| parse_money(value.as_str()))
                .unwrap_or_default(),
            bonus_pct: captures
                .get(4)
                .and_then(|value| value.as_str().parse::<u64>().ok()),
            bonus_days: captures
                .get(5)
                .and_then(|value| value.as_str().parse::<u64>().ok()),
            credits_label: credits_match.map(|value| format!("${value:.2}")),
        });
    }

    credits_match.map(|credits| AmpBalanceInfo {
        account,
        plan: "Credits".to_string(),
        remaining: None,
        total: None,
        hourly_rate: 0.0,
        bonus_pct: None,
        bonus_days: None,
        credits_label: Some(format!("${credits:.2}")),
    })
}

fn parse_money(text: &str) -> Option<f64> {
    text.replace(',', "").parse::<f64>().ok()
}
