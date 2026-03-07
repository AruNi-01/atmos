use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::env;

use crate::constants::{
    FACTORY_API_URL, FACTORY_APP_URL, FACTORY_AUTH_ME_PATH, FACTORY_USAGE_PATH,
    FACTORY_WORKOS_AUTH_URL, FACTORY_WORKOS_CLIENT_IDS,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::providers::factory_session::{
    clear_factory_session_state, load_factory_session_state, store_factory_session_state,
    FactorySessionState,
};
use crate::providers::factory_storage::load_factory_local_storage_tokens;
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_tokens, load_factory_session_cookie_source,
    load_workos_browser_cookie_source, normalize_fraction_percent, parse_i64_string,
    round_metric, unix_now,
};

#[derive(Debug, Clone, Deserialize)]
struct WorkOsAuthResponse {
    #[serde(default, rename = "access_token")]
    access_token: Option<String>,
    #[serde(default, rename = "refresh_token")]
    refresh_token: Option<String>,
    #[serde(default, rename = "organization_id")]
    organization_id: Option<String>,
}

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
    let workos_cookie_source = load_workos_browser_cookie_source().ok().flatten();
    let workos_cookie_header = workos_cookie_source
        .as_ref()
        .map(|source| source.cookie_header.clone())
        .unwrap_or_default();
    let mut last_error = None::<String>;

    if let Some(token) = env::var("FACTORY_BEARER_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        match fetch_factory_with_bearer(client, &cookie_header, &token, Some("FACTORY_BEARER_TOKEN")).await {
            Ok(result) => return Ok(result),
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
                Ok(result) => return Ok(result),
                Err(error) => last_error = Some(error.to_string()),
            }
        }

        if let Some(refresh_token) = session
            .refresh_token
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            match refresh_factory_auth(client, refresh_token, session.organization_id.as_deref()).await {
                Ok(auth) => {
                    let state = persist_factory_auth(
                        auth,
                        session
                            .source_label
                            .clone()
                            .unwrap_or_else(|| "stored Factory session".to_string()),
                    )?;
                    match fetch_factory_with_bearer(
                        client,
                        &cookie_header,
                        state.bearer_token.as_deref().unwrap_or_default(),
                        state.source_label.as_deref(),
                    )
                    .await
                    {
                        Ok(result) => return Ok(result),
                        Err(error) => last_error = Some(error.to_string()),
                    }
                }
                Err(error) => {
                    let _ = clear_factory_session_state();
                    last_error = Some(error.to_string());
                }
            }
        }
    }

    if let Some(refresh_token) = env::var("FACTORY_REFRESH_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        match refresh_factory_auth(client, &refresh_token, None).await {
            Ok(auth) => {
                let state =
                    persist_factory_auth(auth, "FACTORY_REFRESH_TOKEN".to_string())?;
                match fetch_factory_with_bearer(
                    client,
                    &cookie_header,
                    state.bearer_token.as_deref().unwrap_or_default(),
                    state.source_label.as_deref(),
                )
                .await
                {
                    Ok(result) => return Ok(result),
                    Err(error) => last_error = Some(error.to_string()),
                }
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    for token in load_factory_local_storage_tokens()? {
        let mut access_error = None::<String>;
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
                Ok(result) => return Ok(result),
                Err(error) => access_error = Some(error.to_string()),
            }
        }

        match refresh_factory_auth(client, &token.refresh_token, token.organization_id.as_deref()).await {
            Ok(auth) => {
                let state = persist_factory_auth(auth, token.source_label.clone())?;
                match fetch_factory_with_bearer(
                    client,
                    &cookie_header,
                    state.bearer_token.as_deref().unwrap_or_default(),
                    state.source_label.as_deref(),
                )
                .await
                {
                    Ok(result) => return Ok(result),
                    Err(error) => last_error = Some(error.to_string()),
                }
            }
            Err(error) => {
                last_error = Some(error.to_string());
                if let Some(access_error) = access_error {
                    last_error = Some(access_error);
                }
            }
        }
    }

    if !cookie_header.is_empty() {
        match fetch_workos_auth_with_cookies(client, &cookie_header, None).await {
            Ok(auth) => {
                let source_label = cookie_source
                    .as_ref()
                    .map(|source| source.source_label.clone())
                    .unwrap_or_else(|| "Factory browser cookies".to_string());
                let state = persist_factory_auth(auth, source_label)?;
                match fetch_factory_with_bearer(
                    client,
                    &cookie_header,
                    state.bearer_token.as_deref().unwrap_or_default(),
                    state.source_label.as_deref(),
                )
                .await
                {
                    Ok(result) => return Ok(result),
                    Err(error) => last_error = Some(error.to_string()),
                }
            }
            Err(error) => last_error = Some(error.to_string()),
        }

        if !workos_cookie_header.is_empty() {
            match fetch_workos_auth_with_cookies(client, &workos_cookie_header, None).await {
                Ok(auth) => {
                    let source_label = workos_cookie_source
                        .as_ref()
                        .map(|source| source.source_label.clone())
                        .unwrap_or_else(|| "WorkOS browser cookies".to_string());
                    let state = persist_factory_auth(auth, source_label)?;
                    match fetch_factory_with_bearer(
                        client,
                        &cookie_header,
                        state.bearer_token.as_deref().unwrap_or_default(),
                        state.source_label.as_deref(),
                    )
                    .await
                    {
                        Ok(result) => return Ok(result),
                        Err(error) => last_error = Some(error.to_string()),
                    }
                }
                Err(error) => last_error = Some(error.to_string()),
            }
        }

        if let Some(token) = factory_bearer_from_cookie_header(&cookie_header) {
            match fetch_factory_with_bearer(
                client,
                &cookie_header,
                &token,
                cookie_source.as_ref().map(|source| source.source_label.as_str()),
            )
            .await
            {
                Ok(result) => return Ok(result),
                Err(error) => last_error = Some(error.to_string()),
            }
        }
    }

    if cookie_header.is_empty() {
        return Err(ProviderError::Fetch(
            last_error.unwrap_or_else(|| {
                "Factory session cookie, WorkOS token, or bearer token not found".to_string()
            }),
        ));
    }

    Err(ProviderError::Fetch(
        last_error.unwrap_or_else(|| "Factory usage request failed".to_string()),
    ))
}

async fn refresh_factory_auth(
    client: &Client,
    refresh_token: &str,
    organization_id: Option<&str>,
) -> Result<WorkOsAuthResponse, ProviderError> {
    for client_id in FACTORY_WORKOS_CLIENT_IDS {
        let response = client
            .post(FACTORY_WORKOS_AUTH_URL)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "client_id": client_id,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "organization_id": organization_id,
            }))
            .send()
            .await
            .map_err(|error| {
                ProviderError::Fetch(format!("Factory WorkOS auth failed: {error}"))
            })?;
        if !response.status().is_success() {
            continue;
        }
        let payload = response
            .json::<WorkOsAuthResponse>()
            .await
            .map_err(|error| {
                ProviderError::Fetch(format!("Invalid Factory WorkOS payload: {error}"))
            })?;
        if payload
            .access_token
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Ok(payload);
        }
    }
    Err(ProviderError::Fetch(
        "Factory WorkOS refresh token exchange failed".to_string(),
    ))
}

async fn fetch_workos_auth_with_cookies(
    client: &Client,
    cookie_header: &str,
    organization_id: Option<&str>,
) -> Result<WorkOsAuthResponse, ProviderError> {
    for client_id in FACTORY_WORKOS_CLIENT_IDS {
        let response = client
            .post(FACTORY_WORKOS_AUTH_URL)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("Cookie", cookie_header)
            .json(&serde_json::json!({
                "client_id": client_id,
                "grant_type": "refresh_token",
                "useCookie": true,
                "organization_id": organization_id,
            }))
            .send()
            .await
            .map_err(|error| {
                ProviderError::Fetch(format!("Factory WorkOS cookie auth failed: {error}"))
            })?;
        if !response.status().is_success() {
            continue;
        }
        let payload = response
            .json::<WorkOsAuthResponse>()
            .await
            .map_err(|error| {
                ProviderError::Fetch(format!("Invalid Factory WorkOS cookie payload: {error}"))
            })?;
        if payload
            .access_token
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Ok(payload);
        }
    }
    Err(ProviderError::Fetch(
        "Factory WorkOS cookie auth did not return an access token".to_string(),
    ))
}

fn persist_factory_auth(
    auth: WorkOsAuthResponse,
    source_label: String,
) -> Result<FactorySessionState, ProviderError> {
    let bearer_token = auth
        .access_token
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ProviderError::Fetch("Factory WorkOS auth missing access token".to_string()))?;
    let state = FactorySessionState {
        bearer_token: Some(bearer_token),
        refresh_token: auth.refresh_token.filter(|value| !value.trim().is_empty()),
        organization_id: auth.organization_id.filter(|value| !value.trim().is_empty()),
        source_label: Some(source_label),
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
    let (auth_payload, usage_payload) =
        fetch_factory_payloads(client, cookie_header, Some(bearer_token)).await?;
    build_factory_live_result(auth_payload, usage_payload, source_label)
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
    let usage_payload = factory_request(
        client,
        &format!("{FACTORY_API_URL}{FACTORY_USAGE_PATH}"),
        "POST",
        cookie_header,
        bearer_token,
        Some(serde_json::json!({ "useCache": true })),
    )
    .await?;
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
        (Some(start), Some(end)) => Some(format!("{} - {}", format_short_date(start), format_short_date(end))),
        _ => None,
    };

    let allocation = usage.usage.as_ref().and_then(|usage| usage.standard.as_ref());
    let overage = usage.usage.as_ref().and_then(|usage| usage.premium.as_ref());

    let allocation_percent = allocation
        .and_then(|bucket| bucket.used_ratio)
        .map(normalize_fraction_percent)
        .or_else(|| usage_percent_from_bucket(allocation));
    let allocation_used = allocation.and_then(primary_used_tokens);
    let allocation_limit = allocation.and_then(primary_allowance_tokens);

    let overage_used = overage
        .and_then(overage_used_tokens);
    let overage_limit = overage
        .and_then(overage_allowance_tokens);
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
            format!("Factory endpoint returned {status}: {}", snippet.chars().take(200).collect::<String>())
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
        (Some(tier), Some(plan)) if !plan.is_empty() => format!("Factory {} - {}", titleize(tier), plan),
        (Some(tier), Some(_)) => format!("Factory {}", titleize(tier)),
        (Some(tier), None) => format!("Factory {}", titleize(tier)),
        (None, Some(plan)) => plan,
        (None, None) => "Droid".to_string(),
    }
}

fn factory_bearer_from_cookie_header(cookie_header: &str) -> Option<String> {
    cookie_header
        .split(';')
        .filter_map(|part| {
            let mut pair = part.trim().splitn(2, '=');
            Some((pair.next()?.trim(), pair.next()?.trim()))
        })
        .find_map(|(name, value)| {
            if name == "access-token" && !value.is_empty() {
                Some(value.to_string())
            } else {
                None
            }
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
            parts.push(format!("{} / {}", format_tokens(used as u64), format_tokens(limit as u64)));
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
