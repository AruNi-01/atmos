use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::env;

mod session;
pub(crate) mod storage;

use self::session::{load_factory_session_state, store_factory_session_state, FactorySessionState};
use self::storage::{load_factory_cli_auth_access_token, load_factory_local_storage_tokens};
use crate::constants::{
    FACTORY_API_URL, FACTORY_APP_URL, FACTORY_AUTH_ME_PATH, FACTORY_BILLING_LIMITS_PATH,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_reset_relative_text, load_factory_session_cookie_source,
    parse_offset_datetime, round_metric, unix_now,
};

#[derive(Debug, Clone, Deserialize)]
struct FactoryAuthResponse {
    #[serde(default)]
    organization: Option<FactoryOrganization>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryOrganization {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    subscription: Option<FactorySubscription>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactorySubscription {
    #[serde(default, rename = "factoryTier")]
    factory_tier: Option<String>,
    #[serde(default, rename = "orbSubscription")]
    orb_subscription: Option<FactoryOrbSubscription>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryOrbSubscription {
    /// Human plan name from Orb (e.g. "Factory Pro Annual Plan").
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    plan: Option<FactoryPlan>,
    #[serde(default, rename = "current_billing_period_start_date")]
    current_billing_period_start_date: Option<String>,
    #[serde(default, rename = "current_billing_period_end_date")]
    current_billing_period_end_date: Option<String>,
    #[serde(default, rename = "start_date")]
    start_date: Option<String>,
    #[serde(default, rename = "end_date")]
    end_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryPlan {
    #[serde(default)]
    name: Option<String>,
}

/// Response from `GET /api/billing/limits`.
///
/// Factory moved from a single monthly token allocation to sliding token-rate
/// windows (5 hour / weekly / monthly), optionally split into standard + core.
#[derive(Debug, Clone, Deserialize)]
struct FactoryBillingLimitsResponse {
    #[serde(default, rename = "usesTokenRateLimitsBilling")]
    uses_token_rate_limits_billing: Option<bool>,
    #[serde(default)]
    limits: Option<FactoryLimitsBuckets>,
    #[serde(default, rename = "extraUsageBalanceCents")]
    extra_usage_balance_cents: Option<i64>,
    #[serde(default, rename = "extraUsageAllowed")]
    extra_usage_allowed: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryLimitsBuckets {
    #[serde(default)]
    standard: Option<FactoryWindowLimits>,
    #[serde(default)]
    core: Option<FactoryWindowLimits>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct FactoryWindowLimits {
    #[serde(default, rename = "fiveHour")]
    five_hour: Option<FactoryLimitWindow>,
    #[serde(default)]
    weekly: Option<FactoryLimitWindow>,
    #[serde(default)]
    monthly: Option<FactoryLimitWindow>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryLimitWindow {
    #[serde(default, rename = "usedPercent")]
    used_percent: Option<f64>,
    #[serde(default, rename = "windowEnd")]
    window_end: Option<String>,
    #[serde(default, rename = "secondsRemaining")]
    seconds_remaining: Option<i64>,
}

pub(crate) async fn fetch_factory_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let cookie_source = load_factory_session_cookie_source(None).ok();
    let cookie_header = cookie_source
        .as_ref()
        .map(|source| source.cookie_header.clone())
        .unwrap_or_default();
    let cli_auth_token = load_factory_cli_auth_access_token().ok().flatten();
    let mut last_error = None::<String>;

    let browser_tokens = if crate::support::browser_access::may_probe_browser_cookies("factory") {
        load_factory_local_storage_tokens()?
    } else {
        Vec::new()
    };
    for token in browser_tokens {
        if let Some(access_token) = token
            .access_token
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            match fetch_factory_with_bearer(
                client,
                &cookie_header,
                access_token,
                Some(token.source_label.as_str()),
            )
            .await
            {
                Ok(result) => {
                    persist_factory_bearer(access_token, None, Some(token.source_label.clone()))?;
                    return Ok(result);
                }
                Err(error) => last_error = Some(error.to_string()),
            }
        }
    }

    if let Some(token) = factory_bearer_from_cookie_header(&cookie_header) {
        match fetch_factory_with_bearer(
            client,
            &cookie_header,
            &token,
            cookie_source
                .as_ref()
                .map(|source| source.source_label.as_str()),
        )
        .await
        {
            Ok(result) => {
                persist_factory_bearer(
                    &token,
                    None,
                    cookie_source
                        .as_ref()
                        .map(|source| source.source_label.clone()),
                )?;
                return Ok(result);
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    if let Some(session) = load_factory_session_state()? {
        if let Some(token) = session
            .bearer_token
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            match fetch_factory_with_bearer(
                client,
                &cookie_header,
                token,
                session.source_label.as_deref(),
            )
            .await
            {
                Ok(result) => {
                    persist_factory_bearer(token, None, session.source_label.clone())?;
                    return Ok(result);
                }
                Err(error) => last_error = Some(error.to_string()),
            }
        }
    }

    if let Some(token) = env::var("FACTORY_BEARER_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        match fetch_factory_with_bearer(
            client,
            &cookie_header,
            &token,
            Some("FACTORY_BEARER_TOKEN"),
        )
        .await
        {
            Ok(result) => {
                persist_factory_bearer(&token, None, Some("FACTORY_BEARER_TOKEN".to_string()))?;
                return Ok(result);
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    if let Some(cli_auth_token) = cli_auth_token {
        match fetch_factory_with_bearer(
            client,
            &cookie_header,
            &cli_auth_token.access_token,
            Some(cli_auth_token.source_label.as_str()),
        )
        .await
        {
            Ok(result) => {
                persist_factory_bearer(
                    &cli_auth_token.access_token,
                    None,
                    Some(cli_auth_token.source_label),
                )?;
                return Ok(result);
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    if cookie_header.is_empty() {
        return Err(ProviderError::Fetch(last_error.unwrap_or_else(|| {
            "Factory browser token, Droid CLI token, or bearer token not found".to_string()
        })));
    }

    Err(ProviderError::Fetch(last_error.unwrap_or_else(|| {
        "Factory usage request failed".to_string()
    })))
}

fn persist_factory_bearer(
    bearer_token: &str,
    refresh_token: Option<String>,
    source_label: Option<String>,
) -> Result<FactorySessionState, ProviderError> {
    let state = FactorySessionState {
        bearer_token: Some(bearer_token.to_string()),
        refresh_token: refresh_token.filter(|value| !value.trim().is_empty()),
        organization_id: None,
        source_label,
        updated_at: Some(unix_now()),
    };
    store_factory_session_state(&state)?;
    Ok(state)
}

async fn fetch_factory_with_bearer(
    client: &Client,
    cookie_header: &str,
    bearer_token: &str,
    source_label: Option<&str>,
) -> Result<LiveFetchResult, ProviderError> {
    let mut last_error = None;
    let sanitized_cookie_header =
        filter_cookie_header(cookie_header, &["access-token", "__recent_auth"]);
    let mut attempts = vec![""];
    if !sanitized_cookie_header.is_empty() {
        attempts.push(sanitized_cookie_header.as_str());
    }
    if !cookie_header.is_empty() && attempts.last().copied() != Some(cookie_header) {
        attempts.push(cookie_header);
    }

    for header in attempts {
        match fetch_factory_payloads(client, header, Some(bearer_token)).await {
            Ok((auth_payload, limits_payload)) => {
                return build_factory_live_result(auth_payload, limits_payload, source_label);
            }
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error
        .unwrap_or_else(|| ProviderError::Fetch("Factory bearer auth failed".to_string())))
}

async fn fetch_factory_payloads(
    client: &Client,
    cookie_header: &str,
    bearer_token: Option<&str>,
) -> Result<(Value, Value), ProviderError> {
    let auth_payload = factory_request(
        client,
        &format!("{FACTORY_APP_URL}{FACTORY_AUTH_ME_PATH}"),
        "GET",
        cookie_header,
        bearer_token,
        None,
        None,
    )
    .await?;

    let org_id = auth_payload
        .get("organization")
        .and_then(|org| org.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let limits_payload = factory_request(
        client,
        &format!("{FACTORY_API_URL}{FACTORY_BILLING_LIMITS_PATH}"),
        "GET",
        cookie_header,
        bearer_token,
        None,
        org_id.as_deref(),
    )
    .await?;

    Ok((auth_payload, limits_payload))
}

fn build_factory_live_result(
    auth_payload: Value,
    limits_payload: Value,
    source_label: Option<&str>,
) -> Result<LiveFetchResult, ProviderError> {
    let auth = serde_json::from_value::<FactoryAuthResponse>(auth_payload)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Factory auth payload: {error}")))?;
    let limits = serde_json::from_value::<FactoryBillingLimitsResponse>(limits_payload).map_err(
        |error| ProviderError::Fetch(format!("Invalid Factory billing limits payload: {error}")),
    )?;

    let plan_label = build_factory_plan_label(&auth);
    let account_label = auth
        .organization
        .as_ref()
        .and_then(|org| org.name.clone())
        .or_else(|| source_label.map(str::to_string))
        .unwrap_or_else(|| "Droid".to_string());
    let period_label = build_factory_period_label(&auth);
    let status_label = factory_orb(&auth)
        .and_then(|orb| orb.status.clone())
        .filter(|value| !value.trim().is_empty())
        .map(titleize);

    let now = unix_now();
    let standard = limits
        .limits
        .as_ref()
        .and_then(|buckets| buckets.standard.as_ref());
    let core = limits
        .limits
        .as_ref()
        .and_then(|buckets| buckets.core.as_ref());

    let five_hour = standard.and_then(|w| w.five_hour.as_ref());
    let weekly = standard.and_then(|w| w.weekly.as_ref());
    let monthly = standard.and_then(|w| w.monthly.as_ref());

    let five_hour_percent = window_percent(five_hour);
    let weekly_percent = window_percent(weekly);
    let monthly_percent = window_percent(monthly);

    let five_hour_reset = window_reset_at(five_hour, now);
    let weekly_reset = window_reset_at(weekly, now);
    let monthly_reset = window_reset_at(monthly, now);

    if five_hour_percent.is_none() && weekly_percent.is_none() && monthly_percent.is_none() {
        return Err(ProviderError::Fetch(
            "Factory billing limits payload missing window usage data".to_string(),
        ));
    }

    let mut usage_rows = Vec::new();
    push_window_row(
        &mut usage_rows,
        "5 hours",
        five_hour_percent,
        five_hour_reset,
    );
    push_window_row(&mut usage_rows, "1 week", weekly_percent, weekly_reset);
    push_window_row(&mut usage_rows, "1 month", monthly_percent, monthly_reset);

    let mut account_rows = vec![
        DetailRow {
            label: "Account".to_string(),
            value: account_label,
            tone: RowTone::Default,
        },
        DetailRow {
            label: "Plan".to_string(),
            value: plan_label.clone(),
            tone: RowTone::Default,
        },
    ];
    if let Some(status_label) = status_label {
        account_rows.push(DetailRow {
            label: "Status".to_string(),
            value: status_label,
            tone: RowTone::Default,
        });
    }
    if let Some(period_label) = period_label {
        account_rows.push(DetailRow {
            label: "Period".to_string(),
            value: period_label,
            tone: RowTone::Default,
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

    if let Some(core) = core.filter(|limits| window_limits_has_signal(limits)) {
        let mut core_rows = Vec::new();
        push_window_row(
            &mut core_rows,
            "5 hours",
            window_percent(core.five_hour.as_ref()),
            window_reset_at(core.five_hour.as_ref(), now),
        );
        push_window_row(
            &mut core_rows,
            "1 week",
            window_percent(core.weekly.as_ref()),
            window_reset_at(core.weekly.as_ref(), now),
        );
        push_window_row(
            &mut core_rows,
            "1 month",
            window_percent(core.monthly.as_ref()),
            window_reset_at(core.monthly.as_ref(), now),
        );
        if !core_rows.is_empty() {
            detail_sections.push(DetailSection {
                title: "Core".to_string(),
                rows: core_rows,
            });
        }
    }

    let mut credits_label = None;
    let extra_allowed = limits.extra_usage_allowed.unwrap_or(false);
    let extra_balance_cents = limits.extra_usage_balance_cents.unwrap_or(0);
    if extra_allowed || extra_balance_cents > 0 {
        let balance = extra_balance_cents as f64 / 100.0;
        let balance_text = format!("${balance:.2}");
        credits_label = Some(balance_text.clone());
        detail_sections.push(DetailSection {
            title: "Credits".to_string(),
            rows: vec![
                DetailRow {
                    label: "Extra usage".to_string(),
                    value: if extra_allowed {
                        "Allowed".to_string()
                    } else {
                        "Not allowed".to_string()
                    },
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Balance".to_string(),
                    value: balance_text,
                    tone: RowTone::Default,
                },
            ],
        });
    }

    // Prefer the short window for the summary bar (matches Claude / Codex).
    let summary_percent = five_hour_percent.or(weekly_percent).or(monthly_percent);

    Ok(LiveFetchResult {
        plan_label: Some(plan_label),
        usage_summary: Some(build_percent_usage_summary(summary_percent)),
        detail_sections,
        warnings: if limits.uses_token_rate_limits_billing == Some(false) {
            vec!["Factory account may still be on legacy allocation billing.".to_string()]
        } else {
            vec![]
        },
        fetch_message: "Factory auth + billing limits APIs".to_string(),
        reset_at: five_hour_reset.or(weekly_reset).or(monthly_reset),
        credits_label,
        last_updated_at: Some(unix_now()),
    })
}

async fn factory_request(
    client: &Client,
    url: &str,
    method: &str,
    cookie_header: &str,
    bearer_token: Option<&str>,
    body: Option<Value>,
    org_id: Option<&str>,
) -> Result<Value, ProviderError> {
    let request = match method {
        "POST" => client.post(url),
        _ => client.get(url),
    }
    .header("Accept", "application/json")
    .header("Origin", "https://app.factory.ai")
    .header("Referer", "https://app.factory.ai/")
    .header("x-factory-client", "web-app");

    let request = if let Some(org_id) = org_id.filter(|value| !value.trim().is_empty()) {
        request.header("x-factory-org-id", org_id)
    } else {
        request
    };
    let request = if cookie_header.is_empty() {
        request
    } else {
        request.header("Cookie", cookie_header)
    };
    let request = if let Some(bearer_token) = bearer_token {
        request.bearer_auth(bearer_token)
    } else {
        request
    };
    let request = if let Some(body) = body {
        request.json(&body)
    } else {
        request
    };

    let response = request
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Factory request failed: {error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let snippet = body.trim();
        let detail = if snippet.is_empty() {
            format!("Factory endpoint returned {status}")
        } else {
            format!(
                "Factory endpoint returned {status}: {}",
                snippet.chars().take(200).collect::<String>()
            )
        };
        return Err(ProviderError::Fetch(detail));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Invalid Factory payload: {error}")))
}

fn factory_orb(auth: &FactoryAuthResponse) -> Option<&FactoryOrbSubscription> {
    auth.organization
        .as_ref()
        .and_then(|org| org.subscription.as_ref())
        .and_then(|subscription| subscription.orb_subscription.as_ref())
}

fn build_factory_plan_label(auth: &FactoryAuthResponse) -> String {
    let tier = auth
        .organization
        .as_ref()
        .and_then(|org| org.subscription.as_ref())
        .and_then(|subscription| subscription.factory_tier.clone())
        .filter(|value| !value.trim().is_empty());
    let plan_name = factory_orb(auth)
        .and_then(|orb| {
            orb.plan
                .as_ref()
                .and_then(|plan| plan.name.clone())
                .or_else(|| orb.name.clone())
        })
        .filter(|value| !value.trim().is_empty());

    match (tier, plan_name) {
        // Prefer the Orb plan name when it already encodes the product
        // (e.g. "Factory Pro Annual Plan"); fall back to tier when missing.
        (Some(_), Some(plan)) => plan,
        (None, Some(plan)) => plan,
        (Some(tier), None) => format!("Factory {}", titleize(tier)),
        (None, None) => "Droid".to_string(),
    }
}

/// Billing period from Orb subscription (`current_billing_period_*`), falling
/// back to the overall subscription `start_date` / `end_date`.
fn build_factory_period_label(auth: &FactoryAuthResponse) -> Option<String> {
    let orb = factory_orb(auth)?;
    let start = orb
        .current_billing_period_start_date
        .as_deref()
        .or(orb.start_date.as_deref())
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64);
    let end = orb
        .current_billing_period_end_date
        .as_deref()
        .or(orb.end_date.as_deref())
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64);

    match (start, end) {
        (Some(start), Some(end)) => Some(format!(
            "{} - {}",
            format_short_date(start),
            format_short_date(end)
        )),
        (None, Some(end)) => Some(format!("Until {}", format_short_date(end))),
        (Some(start), None) => Some(format!("Since {}", format_short_date(start))),
        (None, None) => None,
    }
}

fn format_short_date(timestamp: u64) -> String {
    let Some(date) = time::OffsetDateTime::from_unix_timestamp(timestamp as i64).ok() else {
        return timestamp.to_string();
    };
    let month = match date.month() {
        time::Month::January => "Jan",
        time::Month::February => "Feb",
        time::Month::March => "Mar",
        time::Month::April => "Apr",
        time::Month::May => "May",
        time::Month::June => "Jun",
        time::Month::July => "Jul",
        time::Month::August => "Aug",
        time::Month::September => "Sep",
        time::Month::October => "Oct",
        time::Month::November => "Nov",
        time::Month::December => "Dec",
    };
    format!("{month} {}", date.day())
}

fn factory_bearer_from_cookie_header(cookie_header: &str) -> Option<String> {
    cookie_header_pairs(cookie_header).find_map(|(name, value)| {
        if name == "access-token" && !value.is_empty() {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn filter_cookie_header(cookie_header: &str, excluded_names: &[&str]) -> String {
    cookie_header_pairs(cookie_header)
        .filter(|(name, _)| !excluded_names.contains(name))
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn cookie_header_pairs(cookie_header: &str) -> impl Iterator<Item = (&str, &str)> {
    cookie_header.split(';').filter_map(|part| {
        let mut pair = part.trim().splitn(2, '=');
        Some((pair.next()?.trim(), pair.next()?.trim()))
    })
}

fn window_percent(window: Option<&FactoryLimitWindow>) -> Option<f64> {
    window
        .and_then(|w| w.used_percent)
        .map(|value| round_metric(value.clamp(0.0, 100.0)))
}

fn window_reset_at(window: Option<&FactoryLimitWindow>, now: u64) -> Option<u64> {
    let window = window?;
    if let Some(seconds) = window.seconds_remaining {
        if seconds >= 0 {
            return Some(now.saturating_add(seconds as u64));
        }
    }
    window
        .window_end
        .as_deref()
        .and_then(parse_offset_datetime)
        .map(|value| value.unix_timestamp() as u64)
}

fn window_limits_has_signal(limits: &FactoryWindowLimits) -> bool {
    [&limits.five_hour, &limits.weekly, &limits.monthly]
        .into_iter()
        .flatten()
        .any(|window| {
            window.used_percent.unwrap_or(0.0) > 0.0
                || window
                    .window_end
                    .as_ref()
                    .is_some_and(|end| !end.is_empty())
                || window.seconds_remaining.is_some()
        })
}

fn push_window_row(
    rows: &mut Vec<DetailRow>,
    label: &str,
    percent: Option<f64>,
    reset_at: Option<u64>,
) {
    // Always show the three primary windows when at least one percent is present;
    // missing percent falls back to 0 so the UI still lists the window.
    let percent = percent.unwrap_or(0.0);
    rows.push(DetailRow {
        label: label.to_string(),
        value: format_window(percent, reset_at),
        tone: RowTone::Default,
    });
}

fn format_window(percent: f64, reset_at: Option<u64>) -> String {
    format!(
        "{:.0}% used · {}",
        round_metric(percent),
        format_reset_relative_text(reset_at)
    )
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

#[cfg(test)]
mod tests {
    use super::{
        build_factory_live_result, factory_bearer_from_cookie_header, filter_cookie_header,
        format_window, window_limits_has_signal, window_percent, window_reset_at,
        FactoryLimitWindow, FactoryWindowLimits,
    };
    use serde_json::json;

    #[test]
    fn extracts_factory_bearer_from_cookie_header() {
        let header = "foo=bar; access-token=abc.def.ghi; session=xyz";
        assert_eq!(
            factory_bearer_from_cookie_header(header).as_deref(),
            Some("abc.def.ghi")
        );
    }

    #[test]
    fn filters_stale_factory_cookie_names() {
        let header = "foo=bar; access-token=abc; __recent_auth=1; session=xyz";
        assert_eq!(
            filter_cookie_header(header, &["access-token", "__recent_auth"]),
            "foo=bar; session=xyz"
        );
    }

    #[test]
    fn prefers_seconds_remaining_for_reset_at() {
        let now = 1_700_000_000_u64;
        let window = FactoryLimitWindow {
            used_percent: Some(19.0),
            window_end: Some("2026-08-13T14:34:44.136Z".to_string()),
            seconds_remaining: Some(3_600),
        };
        assert_eq!(window_reset_at(Some(&window), now), Some(now + 3_600));
    }

    #[test]
    fn falls_back_to_window_end_when_seconds_missing() {
        let now = 1_700_000_000_u64;
        let window = FactoryLimitWindow {
            used_percent: Some(30.0),
            window_end: Some("2026-07-19T19:43:25.536Z".to_string()),
            seconds_remaining: None,
        };
        let reset = window_reset_at(Some(&window), now).expect("window end");
        assert!(reset > 1_700_000_000);
    }

    #[test]
    fn core_without_signal_is_skipped() {
        let empty = FactoryWindowLimits::default();
        assert!(!window_limits_has_signal(&empty));

        let with_usage = FactoryWindowLimits {
            five_hour: Some(FactoryLimitWindow {
                used_percent: Some(12.0),
                window_end: None,
                seconds_remaining: None,
            }),
            ..FactoryWindowLimits::default()
        };
        assert!(window_limits_has_signal(&with_usage));
    }

    #[test]
    fn formats_window_row_like_codex() {
        assert_eq!(format_window(30.0, None), "30% used · Reset unknown");
        assert_eq!(window_percent(None), None);
        assert_eq!(
            window_percent(Some(&FactoryLimitWindow {
                used_percent: Some(76.4),
                window_end: None,
                seconds_remaining: None,
            })),
            Some(76.4)
        );
    }

    #[test]
    fn builds_live_result_from_billing_limits_payload() {
        let auth = json!({
            "organization": {
                "id": "org_test",
                "name": "AruNi's Org",
                "subscription": {
                    "factoryTier": "team_annual",
                    "orbSubscription": {
                        "name": "Factory Pro Annual Plan",
                        "status": "active",
                        "current_billing_period_start_date": "2026-07-13T21:13:28+00:00",
                        "current_billing_period_end_date": "2027-01-27T08:00:00+00:00",
                        "start_date": "2026-01-28T05:17:37+00:00",
                        "end_date": "2027-01-27T08:00:00+00:00",
                        "plan": { "name": "Factory Pro Annual Plan" }
                    }
                }
            }
        });
        let limits = json!({
            "usesTokenRateLimitsBilling": true,
            "limits": {
                "standard": {
                    "fiveHour": {
                        "usedPercent": 30,
                        "windowEnd": "2026-07-19T19:43:25.536Z",
                        "secondsRemaining": null
                    },
                    "weekly": {
                        "usedPercent": 76,
                        "windowEnd": "2026-07-21T14:34:44.136Z",
                        "secondsRemaining": null
                    },
                    "monthly": {
                        "usedPercent": 19,
                        "windowEnd": "2026-08-13T14:34:44.136Z",
                        "secondsRemaining": 1833344
                    }
                },
                "core": {
                    "fiveHour": { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null },
                    "weekly": { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null },
                    "monthly": { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null }
                }
            },
            "extraUsageBalanceCents": 0,
            "extraUsageAllowed": true
        });

        let result = build_factory_live_result(auth, limits, Some("browser")).expect("result");
        assert_eq!(
            result.plan_label.as_deref(),
            Some("Factory Pro Annual Plan")
        );
        assert_eq!(
            result.usage_summary.as_ref().and_then(|s| s.percent),
            Some(30.0)
        );

        let account = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Account")
            .expect("account section");
        let plan_row = account
            .rows
            .iter()
            .find(|row| row.label == "Plan")
            .expect("plan row");
        assert_eq!(plan_row.value, "Factory Pro Annual Plan");
        let status_row = account
            .rows
            .iter()
            .find(|row| row.label == "Status")
            .expect("status row");
        assert_eq!(status_row.value, "Active");
        let period_row = account
            .rows
            .iter()
            .find(|row| row.label == "Period")
            .expect("period row");
        assert_eq!(period_row.value, "Jul 13 - Jan 27");

        let usage = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Usage")
            .expect("usage section");
        assert_eq!(usage.rows.len(), 3);
        assert_eq!(usage.rows[0].label, "5 hours");
        assert!(usage.rows[0].value.starts_with("30% used"));
        assert_eq!(usage.rows[1].label, "1 week");
        assert!(usage.rows[1].value.starts_with("76% used"));
        assert_eq!(usage.rows[2].label, "1 month");
        assert!(usage.rows[2].value.starts_with("19% used"));

        // Empty core buckets are omitted.
        assert!(!result
            .detail_sections
            .iter()
            .any(|section| section.title == "Core"));

        // Extra usage allowed → Credits section with $0.00 balance.
        let credits = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Credits")
            .expect("credits section");
        assert_eq!(credits.rows[1].value, "$0.00");
        assert_eq!(result.credits_label.as_deref(), Some("$0.00"));
    }
}
