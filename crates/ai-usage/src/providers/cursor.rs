use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::env;
use std::path::PathBuf;

use crate::constants::{
    CURSOR_CLIENT_ID, CURSOR_PLAN_INFO_URL, CURSOR_TOKEN_REFRESH_URL, CURSOR_USAGE_SERVICE_URL,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, decode_jwt_payload, expand_home, format_reset_relative_text,
    normalize_fraction_percent, parse_i64_string, round_metric, run_command, run_sqlite_query,
    unix_now,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorUsageResponse {
    #[serde(default)]
    billing_cycle_end: Option<String>,
    #[serde(default)]
    plan_usage: Option<CursorPlanUsage>,
    #[serde(default)]
    spend_limit_usage: Option<CursorSpendLimitUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanUsage {
    #[serde(default)]
    included_spend: Option<f64>,
    #[serde(default)]
    limit: Option<f64>,
    #[serde(default)]
    total_percent_used: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorSpendLimitUsage {
    #[serde(default)]
    individual_limit: Option<f64>,
    #[serde(default)]
    individual_used: Option<f64>,
    #[serde(default)]
    pooled_limit: Option<f64>,
    #[serde(default)]
    pooled_used: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanInfoEnvelope {
    #[serde(default)]
    plan_info: Option<CursorPlanInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanInfo {
    #[serde(default)]
    plan_name: Option<String>,
    #[serde(default)]
    billing_cycle_end: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorRefreshResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    should_logout: Option<bool>,
}

#[derive(Debug, Clone)]
struct CursorAuth {
    access_token: String,
    refresh_token: Option<String>,
    email: Option<String>,
    membership_type: Option<String>,
}

pub(crate) async fn fetch_cursor_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let mut auth = load_cursor_auth()?;

    if cursor_token_needs_refresh(&auth.access_token) {
        if let Some(refresh_token) = auth.refresh_token.clone() {
            auth.access_token = refresh_cursor_access_token(client, &refresh_token).await?;
        }
    }

    let usage = match request_cursor_usage(client, &auth.access_token).await {
        Ok(usage) => usage,
        Err(error) if error.contains("401") || error.contains("403") => {
            if let Some(refresh_token) = auth.refresh_token.clone() {
                auth.access_token = refresh_cursor_access_token(client, &refresh_token).await?;
                request_cursor_usage(client, &auth.access_token)
                    .await
                    .map_err(ProviderError::Fetch)?
            } else {
                return Err(ProviderError::Fetch(error));
            }
        }
        Err(error) => return Err(ProviderError::Fetch(error)),
    };

    let plan_info = request_cursor_plan_info(client, &auth.access_token)
        .await
        .ok();

    let reset_at = usage
        .billing_cycle_end
        .as_deref()
        .and_then(parse_cursor_timestamp)
        .or_else(|| {
            plan_info
                .as_ref()
                .and_then(|plan| plan.billing_cycle_end.as_deref())
                .and_then(parse_cursor_timestamp)
        });

    let included_used = usage
        .plan_usage
        .as_ref()
        .and_then(|value| value.included_spend)
        .map(cents_to_usd);
    let included_limit = usage
        .plan_usage
        .as_ref()
        .and_then(|value| value.limit)
        .map(cents_to_usd);
    let included_percent = match (included_used, included_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => usage
            .plan_usage
            .as_ref()
            .and_then(|value| value.total_percent_used)
            .map(normalize_fraction_percent),
    };

    let (on_demand_used, on_demand_limit) = usage
        .spend_limit_usage
        .as_ref()
        .map(|value| {
            let used = value
                .individual_used
                .or(value.pooled_used)
                .map(cents_to_usd);
            let limit = value
                .individual_limit
                .or(value.pooled_limit)
                .map(cents_to_usd);
            (used, limit)
        })
        .unwrap_or((None, None));
    let on_demand_percent = match (on_demand_used, on_demand_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => None,
    };

    let plan_label = plan_info
        .as_ref()
        .and_then(|value| value.plan_name.clone())
        .or(auth.membership_type.clone())
        .map(format_cursor_plan_label);

    let mut usage_rows = Vec::new();
    if let Some(percent) = included_percent {
        usage_rows.push(DetailRow {
            label: "Included usage".to_string(),
            value: format_percent_window(percent, included_used, included_limit, reset_at),
            tone: RowTone::Default,
        });
    }
    if let Some(percent) = on_demand_percent {
        usage_rows.push(DetailRow {
            label: "On-Demand Usage".to_string(),
            value: format_percent_window(percent, on_demand_used, on_demand_limit, reset_at),
            tone: RowTone::Default,
        });
    } else if let Some(used) = on_demand_used {
        usage_rows.push(DetailRow {
            label: "On-Demand Usage".to_string(),
            value: match on_demand_limit {
                Some(limit) if limit > 0.0 => format!("${used:.2} / ${limit:.2}"),
                _ => format!("${used:.2} used"),
            },
            tone: RowTone::Default,
        });
    }

    if usage_rows.is_empty() {
        return Err(ProviderError::Fetch(
            "Cursor usage data is missing included and on-demand buckets".to_string(),
        ));
    }

    Ok(LiveFetchResult {
        plan_label: plan_label.clone(),
        usage_summary: Some(build_percent_usage_summary(included_percent)),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Account".to_string(),
                        value: auth.email.unwrap_or_else(|| "Cursor".to_string()),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: plan_label.unwrap_or_else(|| "Cursor".to_string()),
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
        fetch_message: "Cursor DashboardService API".to_string(),
        reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

async fn request_cursor_usage(
    client: &Client,
    access_token: &str,
) -> Result<CursorUsageResponse, String> {
    let response = client
        .post(CURSOR_USAGE_SERVICE_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .json(&json!({}))
        .send()
        .await
        .map_err(|error| format!("Cursor usage request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Cursor usage returned {}", response.status()));
    }

    response
        .json::<CursorUsageResponse>()
        .await
        .map_err(|error| format!("Invalid Cursor usage payload: {error}"))
}

async fn request_cursor_plan_info(
    client: &Client,
    access_token: &str,
) -> Result<CursorPlanInfo, ProviderError> {
    let response = client
        .post(CURSOR_PLAN_INFO_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .json(&json!({}))
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Cursor plan info failed: {error}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Cursor plan info returned {}",
            response.status()
        )));
    }

    let payload = response
        .json::<CursorPlanInfoEnvelope>()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Invalid Cursor plan info: {error}")))?;

    payload
        .plan_info
        .ok_or_else(|| ProviderError::Fetch("Cursor planInfo missing".to_string()))
}

async fn refresh_cursor_access_token(
    client: &Client,
    refresh_token: &str,
) -> Result<String, ProviderError> {
    let response = client
        .post(CURSOR_TOKEN_REFRESH_URL)
        .json(&json!({
            "grant_type": "refresh_token",
            "client_id": CURSOR_CLIENT_ID,
            "refresh_token": refresh_token,
        }))
        .send()
        .await
        .map_err(|error| ProviderError::Fetch(format!("Cursor token refresh failed: {error}")))?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "Cursor token refresh returned {}",
            response.status()
        )));
    }

    let payload = response
        .json::<CursorRefreshResponse>()
        .await
        .map_err(|error| {
            ProviderError::Fetch(format!("Invalid Cursor refresh payload: {error}"))
        })?;

    if payload.should_logout == Some(true) {
        return Err(ProviderError::Fetch(
            "Cursor session expired. Sign in again in Cursor desktop.".to_string(),
        ));
    }

    payload.access_token.ok_or_else(|| {
        ProviderError::Fetch("Cursor refresh payload missing access_token".to_string())
    })
}

fn load_cursor_auth() -> Result<CursorAuth, ProviderError> {
    let env_access = env::var("ATMOS_USAGE_CURSOR_ACCESS_TOKEN")
        .ok()
        .or_else(|| env::var("CURSOR_ACCESS_TOKEN").ok())
        .filter(|value| !value.trim().is_empty());
    let env_refresh = env::var("ATMOS_USAGE_CURSOR_REFRESH_TOKEN")
        .ok()
        .or_else(|| env::var("CURSOR_REFRESH_TOKEN").ok())
        .filter(|value| !value.trim().is_empty());
    if let Some(access_token) = env_access {
        return Ok(CursorAuth {
            access_token,
            refresh_token: env_refresh,
            email: None,
            membership_type: None,
        });
    }

    if let Some(auth) = load_cursor_auth_from_state_db()? {
        return Ok(auth);
    }

    if let Some(auth) = load_cursor_auth_from_keychain()? {
        return Ok(auth);
    }

    Err(ProviderError::Fetch(
        "Cursor desktop auth credentials not available".to_string(),
    ))
}

fn load_cursor_auth_from_state_db() -> Result<Option<CursorAuth>, ProviderError> {
    for path in cursor_state_db_paths() {
        if !path.exists() {
            continue;
        }

        let access_token = cursor_state_value(&path, "cursorAuth/accessToken")?;
        let refresh_token = cursor_state_value(&path, "cursorAuth/refreshToken")?;
        if access_token.is_none() && refresh_token.is_none() {
            continue;
        }

        return Ok(Some(CursorAuth {
            access_token: access_token.unwrap_or_default(),
            refresh_token,
            email: cursor_state_value(&path, "cursorAuth/cachedEmail")?,
            membership_type: cursor_state_value(&path, "cursorAuth/stripeMembershipType")?,
        }));
    }

    Ok(None)
}

fn load_cursor_auth_from_keychain() -> Result<Option<CursorAuth>, ProviderError> {
    let access_token = security_find_generic_password("cursor-access-token")?;
    let refresh_token = security_find_generic_password("cursor-refresh-token")?;
    if access_token.is_none() && refresh_token.is_none() {
        return Ok(None);
    }

    Ok(Some(CursorAuth {
        access_token: access_token.unwrap_or_default(),
        refresh_token,
        email: None,
        membership_type: None,
    }))
}

fn cursor_state_value(path: &PathBuf, key: &str) -> Result<Option<String>, ProviderError> {
    let query = format!(
        "SELECT value FROM ItemTable WHERE key = '{}' LIMIT 1;",
        key.replace('\'', "''")
    );
    let value = run_sqlite_query(path, &query)?;
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    Ok(Some(value.to_string()))
}

fn cursor_state_db_paths() -> Vec<PathBuf> {
    [
        "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
        "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb.backup",
    ]
    .into_iter()
    .filter_map(expand_home)
    .collect()
}

fn security_find_generic_password(service: &str) -> Result<Option<String>, ProviderError> {
    let output = match run_command(
        "/usr/bin/security",
        &["find-generic-password", "-s", service, "-w"],
    ) {
        Ok(output) => output,
        Err(_) => return Ok(None),
    };
    let value = output.trim();
    if value.is_empty() {
        return Ok(None);
    }
    Ok(Some(value.to_string()))
}

fn cursor_token_needs_refresh(token: &str) -> bool {
    let Some(payload) = decode_jwt_payload(token) else {
        return false;
    };
    let Some(exp) = payload.get("exp").and_then(|value| value.as_i64()) else {
        return false;
    };
    exp <= (unix_now() as i64 + 300)
}

fn parse_cursor_timestamp(raw: &str) -> Option<u64> {
    parse_i64_string(raw).map(|value| {
        if value > 1_000_000_000_000 {
            (value / 1000) as u64
        } else {
            value as u64
        }
    })
}

fn format_percent_window(
    percent: f64,
    used: Option<f64>,
    limit: Option<f64>,
    reset_at: Option<u64>,
) -> String {
    let mut value = format!("{:.0}% used", percent.round());
    if let Some(used) = used {
        value.push_str(" · ");
        match limit {
            Some(limit) if limit > 0.0 => value.push_str(&format!("${used:.2} / ${limit:.2}")),
            _ => value.push_str(&format!("${used:.2} used")),
        }
    }
    if reset_at.is_some() {
        value.push_str(" · ");
        value.push_str(&format_reset_relative_text(reset_at));
    }
    value
}

fn cents_to_usd(value: f64) -> f64 {
    value / 100.0
}

fn format_cursor_plan_label(raw: String) -> String {
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
