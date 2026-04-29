use reqwest::Client;
use serde::{Deserialize, Deserializer};

use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_reset_relative_text, load_mimo_browser_cookie_source,
    round_metric, unix_now, BrowserCookieSource,
};

const MIMO_PLAN_DETAIL_URL: &str = "https://platform.xiaomimimo.com/api/v1/tokenPlan/detail";
const MIMO_USAGE_URL: &str = "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage";
const MIMO_ORIGIN: &str = "https://platform.xiaomimimo.com";
const MIMO_REFERER: &str = "https://platform.xiaomimimo.com/console/plan-manage";

#[derive(Debug, Deserialize)]
struct MimoApiResponse<T> {
    code: Option<i64>,
    message: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct MimoPlanData {
    #[serde(default, rename = "planCode")]
    plan_code: Option<String>,
    #[serde(default, rename = "planName")]
    plan_name: Option<String>,
    #[serde(default, rename = "currentPeriodEnd")]
    current_period_end: Option<String>,
    #[serde(default)]
    expired: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct MimoUsageData {
    #[serde(default)]
    usage: Option<MimoUsageGroup>,
    #[serde(default, rename = "monthUsage")]
    month_usage: Option<MimoUsageGroup>,
}

#[derive(Debug, Deserialize)]
struct MimoUsageGroup {
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    percent: Option<f64>,
    #[serde(default)]
    items: Vec<MimoUsageItem>,
}

#[derive(Debug, Deserialize)]
struct MimoUsageItem {
    #[serde(default)]
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    used: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    limit: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    percent: Option<f64>,
}

pub(crate) async fn fetch_mimo_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let browser_source = load_mimo_browser_cookie_source()
        .ok()
        .flatten()
        .ok_or_else(|| {
            ProviderError::Fetch(
                "No browser session detected. Sign in to platform.xiaomimimo.com in your browser."
                    .to_string(),
            )
        })?;

    let mut warnings = Vec::new();

    // Fetch plan detail
    let plan_detail = match fetch_plan_detail(client, &browser_source).await {
        Ok(data) => Some(data),
        Err(error) => {
            warnings.push(format!("Plan detail: {error}"));
            None
        }
    };

    // Fetch usage
    let usage_data = match fetch_usage(client, &browser_source).await {
        Ok(data) => Some(data),
        Err(error) => {
            warnings.push(format!("Usage: {error}"));
            None
        }
    };

    let Some(usage_data) = usage_data else {
        let message = warnings
            .into_iter()
            .next()
            .unwrap_or_else(|| "Mimo usage endpoint returned no data".to_string());
        return Err(ProviderError::Fetch(message));
    };

    // Extract plan info
    let plan_label = plan_detail
        .as_ref()
        .and_then(|p| p.plan_name.clone())
        .or_else(|| plan_detail.as_ref().and_then(|p| p.plan_code.clone()));

    let reset_at = plan_detail
        .as_ref()
        .and_then(|p| p.current_period_end.as_deref())
        .and_then(parse_period_end);

    // Use the overall usage percent (plan_total_token)
    // API returns 0-1 decimal, convert to 0-100
    let usage_group = usage_data
        .usage
        .as_ref()
        .or(usage_data.month_usage.as_ref());

    let percent = usage_group.and_then(|g| g.percent.map(|p| p * 100.0));

    // Build detail rows from plan_total_token items
    let plan_total_item = usage_group
        .and_then(|g| {
            g.items
                .iter()
                .find(|item| item.name.as_deref() == Some("plan_total_token"))
        })
        .or_else(|| usage_group.and_then(|g| g.items.first()));

    let rows = if let Some(item) = plan_total_item {
        let used = item.used.unwrap_or(0);
        let limit = item.limit.unwrap_or(0);
        let pct = item
            .percent
            .map(|p| p * 100.0)
            .or(percent)
            .map(round_metric)
            .unwrap_or(0.0);
        vec![DetailRow {
            label: "Token Usage".to_string(),
            value: format!("{}% used · {} / {} tokens", pct, format_tokens(used), format_tokens(limit)),
            tone: RowTone::Default,
        }]
    } else if let Some(pct) = percent {
        vec![DetailRow {
            label: "Token Usage".to_string(),
            value: format!("{}% used", round_metric(pct)),
            tone: RowTone::Default,
        }]
    } else {
        vec![DetailRow {
            label: "Token Usage".to_string(),
            value: "No usage data".to_string(),
            tone: RowTone::Muted,
        }]
    };

    let mut account_rows = vec![DetailRow {
        label: "Account".to_string(),
        value: "Xiaomi MiMo".to_string(),
        tone: RowTone::Default,
    }];

    if let Some(label) = &plan_label {
        account_rows.push(DetailRow {
            label: "Plan".to_string(),
            value: label.clone(),
            tone: RowTone::Default,
        });
    }

    if let Some(expired) = plan_detail.as_ref().and_then(|p| p.expired) {
        if expired {
            account_rows.push(DetailRow {
                label: "Status".to_string(),
                value: "Expired".to_string(),
                tone: RowTone::Warning,
            });
        }
    }

    if let Some(reset_at) = reset_at {
        account_rows.push(DetailRow {
            label: "Period End".to_string(),
            value: format_reset_relative_text(Some(reset_at)),
            tone: RowTone::Default,
        });
    }

    Ok(LiveFetchResult {
        plan_label,
        usage_summary: Some(build_percent_usage_summary(percent)),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: account_rows,
            },
            DetailSection {
                title: "Usage".to_string(),
                rows,
            },
        ],
        warnings,
        fetch_message: format!(
            "Mimo token-plan API (browser: {})",
            browser_source.source_label
        ),
        reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

async fn fetch_plan_detail(
    client: &Client,
    browser_source: &BrowserCookieSource,
) -> Result<MimoPlanData, ProviderError> {
    let response = build_request(client, MIMO_PLAN_DETAIL_URL, browser_source)
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403 | 404) {
            return Err(ProviderError::Fetch(format!("HTTP {}", status.as_u16())));
        }
        return Err(ProviderError::Fetch(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_body(&body)
        )));
    }

    let payload = serde_json::from_str::<MimoApiResponse<MimoPlanData>>(&body)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Mimo plan payload: {error}")))?;

    if let Some(code) = payload.code {
        if code != 0 {
            let message = payload
                .message
                .unwrap_or_else(|| format!("API error code {code}"));
            return Err(ProviderError::Fetch(message));
        }
    }

    payload
        .data
        .ok_or_else(|| ProviderError::Fetch("Mimo plan endpoint returned no data".to_string()))
}

async fn fetch_usage(
    client: &Client,
    browser_source: &BrowserCookieSource,
) -> Result<MimoUsageData, ProviderError> {
    let response = build_request(client, MIMO_USAGE_URL, browser_source)
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403 | 404) {
            return Err(ProviderError::Fetch(format!("HTTP {}", status.as_u16())));
        }
        return Err(ProviderError::Fetch(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_body(&body)
        )));
    }

    let payload = serde_json::from_str::<MimoApiResponse<MimoUsageData>>(&body)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Mimo usage payload: {error}")))?;

    if let Some(code) = payload.code {
        if code != 0 {
            let message = payload
                .message
                .unwrap_or_else(|| format!("API error code {code}"));
            return Err(ProviderError::Fetch(message));
        }
    }

    payload
        .data
        .ok_or_else(|| ProviderError::Fetch("Mimo usage endpoint returned no data".to_string()))
}

fn deserialize_optional_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value: serde_json::Value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => Ok(n.as_u64()),
        serde_json::Value::String(s) => Ok(s.trim().parse::<u64>().ok()),
        _ => Ok(None),
    }
}

fn deserialize_optional_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value: serde_json::Value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => Ok(n.as_f64()),
        serde_json::Value::String(s) => Ok(s.trim().parse::<f64>().ok()),
        _ => Ok(None),
    }
}

fn build_request(
    client: &Client,
    url: &str,
    browser_source: &BrowserCookieSource,
) -> reqwest::RequestBuilder {
    client
        .get(url)
        .header("accept", "application/json, text/plain, */*")
        .header("content-type", "application/json")
        .header("x-requested-with", "XMLHttpRequest")
        .header("cookie", &browser_source.cookie_header)
        .header("origin", MIMO_ORIGIN)
        .header("referer", MIMO_REFERER)
}

fn parse_period_end(raw: &str) -> Option<u64> {
    // Format: "2026-05-28 23:59:59"
    use time::format_description::parse;
    use time::PrimitiveDateTime;

    let format = parse("[year]-[month]-[day] [hour]:[minute]:[second]").ok()?;
    let dt = PrimitiveDateTime::parse(raw.trim(), &format).ok()?;
    let utc = dt.assume_utc();
    let ts = utc.unix_timestamp();
    if ts > 0 { Some(ts as u64) } else { None }
}

fn format_tokens(value: u64) -> String {
    if value >= 1_000_000_000 {
        format!("{:.1}B", value as f64 / 1_000_000_000.0)
    } else if value >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{:.1}K", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

fn truncate_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= 180 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..180])
    }
}
