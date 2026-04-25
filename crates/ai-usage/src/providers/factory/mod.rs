use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::env;

mod session;
pub(crate) mod storage;

use self::session::{load_factory_session_state, store_factory_session_state, FactorySessionState};
use self::storage::{load_factory_cli_auth_access_token, load_factory_local_storage_tokens};
use crate::constants::{
    FACTORY_API_URL, FACTORY_APP_URL, FACTORY_AUTH_ME_PATH, FACTORY_USAGE_PATH,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_tokens, load_factory_session_cookie_source,
    normalize_fraction_percent, parse_i64_string, round_metric, unix_now,
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
    #[serde(default)]
    plan: Option<FactoryPlan>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryPlan {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryUsageResponse {
    #[serde(default)]
    usage: Option<FactoryUsageData>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryUsageData {
    #[serde(default, rename = "startDate")]
    start_date: Option<i64>,
    #[serde(default, rename = "endDate")]
    end_date: Option<i64>,
    #[serde(default)]
    standard: Option<FactoryTokenUsage>,
    #[serde(default)]
    premium: Option<FactoryTokenUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct FactoryTokenUsage {
    #[serde(default, rename = "userTokens")]
    user_tokens: Option<i64>,
    #[serde(default, rename = "orgTotalTokensUsed")]
    org_total_tokens_used: Option<i64>,
    #[serde(default, rename = "basicAllowance")]
    basic_allowance: Option<i64>,
    #[serde(default, rename = "totalAllowance")]
    total_allowance: Option<i64>,
    #[serde(default, rename = "usedRatio")]
    used_ratio: Option<f64>,
    #[serde(default, rename = "orgOverageUsed")]
    org_overage_used: Option<i64>,
    #[serde(default, rename = "orgOverageLimit")]
    org_overage_limit: Option<i64>,
}

pub(crate) async fn fetch_factory_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let cookie_source = load_factory_session_cookie_source(None).ok();
    let cookie_header = cookie_source
        .as_ref()
        .map(|source| source.cookie_header.clone())
        .unwrap_or_default();
    let cli_auth_token = load_factory_cli_auth_access_token().ok().flatten();
    let mut last_error = None::<String>;

    for token in load_factory_local_storage_tokens()? {
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
            Ok((auth_payload, usage_payload)) => {
                return build_factory_live_result(auth_payload, usage_payload, source_label);
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
    )
    .await?;
    let usage_url = format!("{FACTORY_API_URL}{FACTORY_USAGE_PATH}");
    let usage_payload = match factory_request(
        client,
        &usage_url,
        "POST",
        cookie_header,
        bearer_token,
        Some(serde_json::json!({ "useCache": true })),
    )
    .await
    {
        Ok(payload) => payload,
        Err(error) if is_method_not_allowed_error(&error) => {
            factory_request(client, &usage_url, "GET", cookie_header, bearer_token, None).await?
        }
        Err(error) => return Err(error),
    };
    Ok((auth_payload, usage_payload))
}

fn build_factory_live_result(
    auth_payload: Value,
    usage_payload: Value,
    source_label: Option<&str>,
) -> Result<LiveFetchResult, ProviderError> {
    let auth = serde_json::from_value::<FactoryAuthResponse>(auth_payload)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Factory auth payload: {error}")))?;
    let usage = serde_json::from_value::<FactoryUsageResponse>(usage_payload)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Factory usage payload: {error}")))?;

    let plan_label = build_factory_plan_label(&auth);
    let account_label = auth
        .organization
        .as_ref()
        .and_then(|org| org.name.clone())
        .or_else(|| source_label.map(str::to_string))
        .unwrap_or_else(|| "Droid".to_string());

    let period_start = usage
        .usage
        .as_ref()
        .and_then(|usage| usage.start_date)
        .and_then(normalize_factory_timestamp);
    let period_end = usage
        .usage
        .as_ref()
        .and_then(|usage| usage.end_date)
        .and_then(normalize_factory_timestamp);
    let period_label = match (period_start, period_end) {
        (Some(start), Some(end)) => Some(format!(
            "{} - {}",
            format_short_date(start),
            format_short_date(end)
        )),
        _ => None,
    };

    let allocation = usage
        .usage
        .as_ref()
        .and_then(|usage| usage.standard.as_ref());
    let overage = usage
        .usage
        .as_ref()
        .and_then(|usage| usage.premium.as_ref());

    let allocation_percent = allocation
        .and_then(|bucket| bucket.used_ratio)
        .map(normalize_fraction_percent)
        .or_else(|| usage_percent_from_bucket(allocation));
    let allocation_used = allocation.and_then(primary_used_tokens);
    let allocation_limit = allocation.and_then(primary_allowance_tokens);

    let overage_used = overage.and_then(overage_used_tokens);
    let overage_limit = overage.and_then(overage_allowance_tokens);
    let overage_percent = overage
        .and_then(|bucket| bucket.used_ratio)
        .map(normalize_fraction_percent)
        .or_else(|| usage_percent_from_values(overage_used, overage_limit));

    let mut usage_rows = Vec::new();
    if allocation_percent.is_some() || allocation_used.is_some() || allocation_limit.is_some() {
        usage_rows.push(DetailRow {
            label: "Allocation".to_string(),
            value: format_factory_usage_row(allocation_percent, allocation_used, allocation_limit),
            tone: RowTone::Default,
        });
    }
    usage_rows.push(DetailRow {
        label: "Overage".to_string(),
        value: if overage_not_configured(overage) {
            "Not set".to_string()
        } else {
            format_factory_usage_row(overage_percent, overage_used, overage_limit)
        },
        tone: RowTone::Default,
    });

    if usage_rows.is_empty() {
        return Err(ProviderError::Fetch(
            "Factory usage payload missing allocation data".to_string(),
        ));
    }

    Ok(LiveFetchResult {
        plan_label: Some(plan_label.clone()),
        usage_summary: Some(build_percent_usage_summary(allocation_percent)),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Account".to_string(),
                        value: account_label,
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: plan_label,
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Period".to_string(),
                        value: period_label.unwrap_or_else(|| "Unknown period".to_string()),
                        tone: RowTone::Default,
                    },
                ],
            },
            DetailSection {
                title: "Usage".to_string(),
                rows: usage_rows,
            },
        ],
        warnings: vec![],
        fetch_message: "Factory auth + usage APIs".to_string(),
        reset_at: None,
        credits_label: None,
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
) -> Result<Value, ProviderError> {
    let request = match method {
        "POST" => client.post(url),
        _ => client.get(url),
    }
    .header("Accept", "application/json")
    .header("Origin", "https://app.factory.ai")
    .header("Referer", "https://app.factory.ai/")
    .header("x-factory-client", "web-app");

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

fn build_factory_plan_label(auth: &FactoryAuthResponse) -> String {
    let tier = auth
        .organization
        .as_ref()
        .and_then(|org| org.subscription.as_ref())
        .and_then(|subscription| subscription.factory_tier.clone());
    let plan = auth
        .organization
        .as_ref()
        .and_then(|org| org.subscription.as_ref())
        .and_then(|subscription| subscription.orb_subscription.as_ref())
        .and_then(|orb| orb.plan.as_ref())
        .and_then(|plan| plan.name.clone());

    match (tier, plan) {
        (Some(tier), Some(plan)) if !plan.is_empty() => {
            format!("Factory {} - {}", titleize(tier), plan)
        }
        (Some(tier), Some(_)) => format!("Factory {}", titleize(tier)),
        (Some(tier), None) => format!("Factory {}", titleize(tier)),
        (None, Some(plan)) => plan,
        (None, None) => "Droid".to_string(),
    }
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

fn usage_percent_from_bucket(bucket: Option<&FactoryTokenUsage>) -> Option<f64> {
    usage_percent_from_values(
        bucket.and_then(primary_used_tokens),
        bucket.and_then(primary_allowance_tokens),
    )
}

fn primary_used_tokens(bucket: &FactoryTokenUsage) -> Option<i64> {
    bucket
        .user_tokens
        .filter(|value| *value > 0)
        .or(bucket.org_total_tokens_used.filter(|value| *value > 0))
        .or(bucket.user_tokens)
        .or(bucket.org_total_tokens_used)
}

fn primary_allowance_tokens(bucket: &FactoryTokenUsage) -> Option<i64> {
    bucket
        .total_allowance
        .filter(|value| *value > 0)
        .or(bucket.basic_allowance.filter(|value| *value > 0))
        .or(bucket.total_allowance)
        .or(bucket.basic_allowance)
}

fn overage_used_tokens(bucket: &FactoryTokenUsage) -> Option<i64> {
    bucket
        .user_tokens
        .filter(|value| *value > 0)
        .or(bucket.org_overage_used.filter(|value| *value > 0))
        .or(bucket.org_total_tokens_used.filter(|value| *value > 0))
}

fn overage_allowance_tokens(bucket: &FactoryTokenUsage) -> Option<i64> {
    bucket
        .org_overage_limit
        .filter(|value| *value > 0)
        .or(bucket.total_allowance.filter(|value| *value > 0))
        .or(bucket.basic_allowance.filter(|value| *value > 0))
}

fn overage_not_configured(bucket: Option<&FactoryTokenUsage>) -> bool {
    let Some(bucket) = bucket else {
        return true;
    };

    let has_used = overage_used_tokens(bucket).is_some();
    let has_limit = overage_allowance_tokens(bucket).is_some();
    let has_nonzero_ratio = bucket.used_ratio.unwrap_or_default() > 0.0;
    !has_used && !has_limit && !has_nonzero_ratio
}

fn usage_percent_from_values(used: Option<i64>, limit: Option<i64>) -> Option<f64> {
    match (used, limit) {
        (Some(used), Some(limit)) if limit > 0 => {
            Some(round_metric((used as f64 / limit as f64) * 100.0))
        }
        _ => None,
    }
}

fn format_factory_usage_row(percent: Option<f64>, used: Option<i64>, limit: Option<i64>) -> String {
    let mut parts = Vec::new();
    if let Some(percent) = percent {
        parts.push(format!("{percent:.0}% used"));
    }
    match (used, limit) {
        (Some(used), Some(limit)) if limit > 0 => {
            parts.push(format!(
                "{} / {}",
                format_tokens(used as u64),
                format_tokens(limit as u64)
            ));
        }
        (Some(used), None) => parts.push(format!("{} used", format_tokens(used as u64))),
        _ => {}
    }
    if parts.is_empty() {
        "Not set".to_string()
    } else {
        parts.join(" · ")
    }
}

fn normalize_factory_timestamp(raw: i64) -> Option<u64> {
    parse_i64_string(&raw.to_string()).map(|value| {
        if value > 1_000_000_000_000 {
            (value / 1000) as u64
        } else {
            value as u64
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        factory_bearer_from_cookie_header, filter_cookie_header, is_method_not_allowed_error,
    };
    use crate::models::ProviderError;

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
    fn detects_method_not_allowed_error() {
        let error = ProviderError::Fetch("Factory endpoint returned 405 Method Not Allowed".into());
        assert!(is_method_not_allowed_error(&error));
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

fn is_method_not_allowed_error(error: &ProviderError) -> bool {
    error.to_string().contains("405 Method Not Allowed")
}
