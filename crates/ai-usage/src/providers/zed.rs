use reqwest::Client;
use serde::Deserialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::constants::{ZED_BILLING_USAGE_URL, ZED_SUBSCRIPTION_URL};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone, UsageSummary};
use crate::runtime::LiveFetchResult;
use crate::support::{
    load_cookie_header, load_zed_browser_cookie_source, normalize_cookie_header, unix_now,
};

#[derive(Debug, Clone, Deserialize)]
struct ZedUsageResponse {
    #[serde(default)]
    plan: Option<String>,
    #[serde(default)]
    current_usage: Option<ZedCurrentUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedCurrentUsage {
    #[serde(default)]
    token_spend_in_cents: Option<f64>,
    #[serde(default)]
    token_spend: Option<ZedTokenSpend>,
    #[serde(default)]
    edit_predictions: Option<ZedEditPredictions>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedTokenSpend {
    #[serde(default)]
    spend_in_cents: Option<f64>,
    #[serde(default)]
    limit_in_cents: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedEditPredictions {
    #[serde(default)]
    used: Option<u64>,
    #[serde(default)]
    limit: Option<u64>,
    #[serde(default)]
    remaining: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedSubscriptionResponse {
    #[serde(default)]
    subscription: Option<ZedSubscription>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedSubscription {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    period: Option<ZedPeriod>,
    #[serde(default)]
    trial_end_at: Option<String>,
    #[serde(default)]
    cancel_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZedPeriod {
    #[serde(default)]
    start_at: Option<String>,
    #[serde(default)]
    end_at: Option<String>,
}

pub(crate) async fn fetch_zed_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let auth = load_zed_auth()?;
    let usage = request_zed_usage(client, &auth).await?;
    let subscription = request_zed_subscription(client, &auth).await.ok();

    let plan_label = subscription
        .as_ref()
        .and_then(|s| s.subscription.as_ref())
        .and_then(|s| s.name.clone())
        .or_else(|| usage.plan.clone().map(format_plan_name));

    let status_label = subscription
        .as_ref()
        .and_then(|s| s.subscription.as_ref())
        .and_then(|s| s.status.clone())
        .map(|s| titleize(&s));

    let current = usage.current_usage.as_ref();
    let spend = current.and_then(|u| u.token_spend.as_ref());
    let spend_cents = spend
        .and_then(|s| s.spend_in_cents)
        .or_else(|| current.and_then(|u| u.token_spend_in_cents));
    let limit_cents = spend.and_then(|s| s.limit_in_cents);

    let used_dollars = spend_cents.map(|c| c / 100.0);
    let cap_dollars = limit_cents.map(|c| c / 100.0);
    let percent = match (spend_cents, limit_cents) {
        (Some(used), Some(limit)) if limit > 0.0 => Some((used / limit) * 100.0),
        _ => None,
    };
    let remaining_dollars = match (cap_dollars, used_dollars) {
        (Some(cap), Some(used)) => Some((cap - used).max(0.0)),
        _ => None,
    };

    let usage_summary = Some(UsageSummary {
        unit: Some("USD".to_string()),
        currency: Some("$".to_string()),
        used: used_dollars,
        remaining: remaining_dollars,
        cap: cap_dollars,
        percent,
        used_label: used_dollars.map(|v| format!("${:.2}", v)),
        remaining_label: remaining_dollars.map(|v| format!("${:.2}", v)),
        cap_label: cap_dollars.map(|v| format!("${:.2}", v)),
    });

    let reset_at = subscription
        .as_ref()
        .and_then(|s| s.subscription.as_ref())
        .and_then(|s| s.period.as_ref())
        .and_then(|p| p.end_at.as_deref())
        .and_then(parse_iso_to_unix);

    let mut account_rows = vec![];
    if let Some(plan) = plan_label.as_deref() {
        account_rows.push(DetailRow {
            label: "Plan".to_string(),
            value: plan.to_string(),
            tone: RowTone::Default,
        });
    }
    if let Some(status) = status_label.as_deref() {
        account_rows.push(DetailRow {
            label: "Status".to_string(),
            value: status.to_string(),
            tone: RowTone::Default,
        });
    }
    if let Some(trial_end) = subscription
        .as_ref()
        .and_then(|s| s.subscription.as_ref())
        .and_then(|s| s.trial_end_at.as_deref())
    {
        account_rows.push(DetailRow {
            label: "Trial ends".to_string(),
            value: format_date(trial_end),
            tone: RowTone::Muted,
        });
    }

    let mut usage_rows = vec![];
    if let Some(used) = used_dollars {
        let cap_str = cap_dollars
            .map(|c| format!(" / ${:.2}", c))
            .unwrap_or_default();
        let pct_str = percent.map(|p| format!(" ({:.0}%)", p)).unwrap_or_default();
        usage_rows.push(DetailRow {
            label: "Token spend".to_string(),
            value: format!("${:.2}{}{}", used, cap_str, pct_str),
            tone: if percent.is_some_and(|p| p >= 90.0) {
                RowTone::Warning
            } else {
                RowTone::Default
            },
        });
    }

    let predictions = usage
        .current_usage
        .as_ref()
        .and_then(|u| u.edit_predictions.as_ref());
    if let Some(pred) = predictions {
        let used = pred.used.unwrap_or(0);
        let limit_str = pred
            .limit
            .map(|l| format!(" / {}", l))
            .unwrap_or_else(|| " / unlimited".to_string());
        usage_rows.push(DetailRow {
            label: "Edit predictions".to_string(),
            value: format!("{}{}", used, limit_str),
            tone: RowTone::Default,
        });
    }

    let period = subscription
        .as_ref()
        .and_then(|s| s.subscription.as_ref())
        .and_then(|s| s.period.as_ref());
    if let Some(period) = period {
        let start = period
            .start_at
            .as_deref()
            .map(format_date)
            .unwrap_or_else(|| "—".to_string());
        let end = period
            .end_at
            .as_deref()
            .map(format_date)
            .unwrap_or_else(|| "—".to_string());
        usage_rows.push(DetailRow {
            label: "Billing period".to_string(),
            value: format!("{} → {}", start, end),
            tone: RowTone::Muted,
        });
    }

    let mut detail_sections = Vec::new();
    if !account_rows.is_empty() {
        detail_sections.push(DetailSection {
            title: "Account".to_string(),
            rows: account_rows,
        });
    }
    if !usage_rows.is_empty() {
        detail_sections.push(DetailSection {
            title: "Usage".to_string(),
            rows: usage_rows,
        });
    }

    let warnings = if percent.is_some_and(|p| p >= 90.0) {
        vec!["Token spend approaching limit".to_string()]
    } else {
        vec![]
    };

    let credits_label = cap_dollars.map(|c| format!("${:.2}", c));

    Ok(LiveFetchResult {
        plan_label,
        usage_summary,
        detail_sections,
        warnings,
        fetch_message: "Zed billing API".to_string(),
        reset_at,
        credits_label,
        last_updated_at: Some(unix_now()),
    })
}

#[derive(Debug, Clone)]
enum ZedAuth {
    CookieHeader(String),
    BearerToken(String),
}

fn load_zed_auth() -> Result<ZedAuth, ProviderError> {
    if let Some(cookie_header) = load_cookie_header(
        &["ZED_COOKIE_HEADER", "ATMOS_USAGE_ZED_COOKIE_HEADER"],
        Some("zed"),
    )? {
        return Ok(ZedAuth::CookieHeader(cookie_header));
    }

    if let Some(source) = load_zed_browser_cookie_source()? {
        return Ok(ZedAuth::CookieHeader(source.cookie_header));
    }

    if let Some(token) = std::env::var("ZED_ACCESS_TOKEN")
        .ok()
        .or_else(|| std::env::var("ATMOS_USAGE_ZED_ACCESS_TOKEN").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Ok(parse_zed_access_token(&token));
    }

    Err(ProviderError::Fetch(
        "Zed credentials not available. Atmos could not find a supported Zed browser session. Configure ZED_COOKIE_HEADER (or ~/.atmos/ai-usage/zed.cookie) for manual cookie auth, or set ZED_ACCESS_TOKEN for bearer auth.".to_string(),
    ))
}

fn parse_zed_access_token(token: &str) -> ZedAuth {
    let trimmed = token.trim();
    let normalized = normalize_cookie_header(trimmed);

    if normalized.contains('=') || normalized.contains(';') {
        return ZedAuth::CookieHeader(normalized);
    }

    let bearer = normalized
        .strip_prefix("Bearer ")
        .or_else(|| normalized.strip_prefix("bearer "))
        .unwrap_or(&normalized)
        .trim()
        .to_string();

    ZedAuth::BearerToken(bearer)
}

async fn request_zed_usage(
    client: &Client,
    auth: &ZedAuth,
) -> Result<ZedUsageResponse, ProviderError> {
    let request = client
        .get(ZED_BILLING_USAGE_URL)
        .header("Accept", "application/json");
    let request = apply_zed_auth(request, auth);

    let response = request
        .send()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Zed usage request failed: {e}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Zed usage returned {}",
            response.status()
        )));
    }

    response
        .json::<ZedUsageResponse>()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Invalid Zed usage response: {e}")))
}

async fn request_zed_subscription(
    client: &Client,
    auth: &ZedAuth,
) -> Result<ZedSubscriptionResponse, ProviderError> {
    let request = client
        .get(ZED_SUBSCRIPTION_URL)
        .header("Accept", "application/json");
    let request = apply_zed_auth(request, auth);

    let response = request
        .send()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Zed subscription request failed: {e}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Zed subscription returned {}",
            response.status()
        )));
    }

    response
        .json::<ZedSubscriptionResponse>()
        .await
        .map_err(|e| ProviderError::Fetch(format!("Invalid Zed subscription response: {e}")))
}

fn apply_zed_auth(request: reqwest::RequestBuilder, auth: &ZedAuth) -> reqwest::RequestBuilder {
    match auth {
        ZedAuth::CookieHeader(cookie_header) => request.header("Cookie", cookie_header),
        ZedAuth::BearerToken(token) => request.header("Authorization", format!("Bearer {token}")),
    }
}

fn format_plan_name(raw: String) -> String {
    raw.split('_')
        .filter(|s| !s.is_empty())
        .map(|s| {
            let mut c = s.chars();
            match c.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), c.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn titleize(raw: &str) -> String {
    let mut c = raw.chars();
    match c.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), c.as_str()),
        None => String::new(),
    }
}

fn format_date(iso: &str) -> String {
    iso.split('T').next().unwrap_or(iso).to_string()
}

fn parse_iso_to_unix(iso: &str) -> Option<u64> {
    OffsetDateTime::parse(iso, &Rfc3339)
        .ok()
        .map(|dt| dt.unix_timestamp() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_plan_name_converts_underscores() {
        assert_eq!(
            format_plan_name("token_based_zed_pro_trial".to_string()),
            "Token Based Zed Pro Trial"
        );
    }

    #[test]
    fn format_date_extracts_date_part() {
        assert_eq!(format_date("2026-03-16T02:28:45.000Z"), "2026-03-16");
    }

    #[test]
    fn parse_iso_to_unix_works() {
        let ts = parse_iso_to_unix("2026-03-30T02:28:45.000Z");
        assert!(ts.is_some());
        assert!(ts.unwrap() > 1_700_000_000);
    }

    #[test]
    fn usage_percent_calculation() {
        let spend = 500.0_f64;
        let limit = 2000.0_f64;
        let percent = (spend / limit) * 100.0;
        assert!((percent - 25.0).abs() < 0.01);
    }

    #[test]
    fn parse_zed_access_token_treats_cookie_like_values_as_cookie_headers() {
        match parse_zed_access_token("session=abc123; other=value") {
            ZedAuth::CookieHeader(value) => assert_eq!(value, "session=abc123; other=value"),
            ZedAuth::BearerToken(_) => panic!("expected cookie header"),
        }
    }

    #[test]
    fn parse_zed_access_token_treats_plain_values_as_bearer_tokens() {
        match parse_zed_access_token("abc123") {
            ZedAuth::BearerToken(value) => assert_eq!(value, "abc123"),
            ZedAuth::CookieHeader(_) => panic!("expected bearer token"),
        }
    }

    #[test]
    fn parse_zed_access_token_strips_bearer_prefix() {
        match parse_zed_access_token("Bearer abc123") {
            ZedAuth::BearerToken(value) => assert_eq!(value, "abc123"),
            ZedAuth::CookieHeader(_) => panic!("expected bearer token"),
        }
    }
}
