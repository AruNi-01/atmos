use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::env;
use std::path::{Path, PathBuf};

use crate::constants::{CURSOR_PLAN_INFO_URL, CURSOR_USAGE_SERVICE_URL, CURSOR_USAGE_SUMMARY_URL};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::browser::load_cursor_session_token;
use crate::support::{
    build_percent_usage_summary, decode_jwt_payload, epoch_millis_to_secs, expand_home,
    format_reset_relative_text, format_usd, normalize_fraction_percent, parse_i64_string,
    parse_offset_datetime, round_metric, run_command, run_sqlite_query, unix_now,
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

// REST API: https://cursor.com/api/usage-summary
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorQuotaSummaryResponse {
    #[serde(default)]
    billing_cycle_end: Option<String>,
    #[serde(default)]
    membership_type: Option<String>,
    #[serde(default)]
    individual_usage: Option<CursorIndividualUsage>,
    #[serde(default)]
    team_usage: Option<CursorTeamUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorIndividualUsage {
    #[serde(default)]
    plan: Option<CursorPlanBucket>,
    #[serde(rename = "onDemand", default)]
    on_demand: Option<CursorOnDemandBucket>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorTeamUsage {
    #[serde(default)]
    on_demand: Option<CursorOnDemandBucket>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorOnDemandBucket {
    #[serde(default)]
    used: Option<f64>,
    #[serde(default)]
    limit: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanBucket {
    #[serde(default)]
    used: Option<f64>,
    #[serde(default)]
    limit: Option<f64>,
    #[serde(default)]
    api_percent_used: Option<f64>,
    #[serde(default)]
    total_percent_used: Option<f64>,
    #[serde(default)]
    breakdown: Option<CursorPlanBreakdown>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorPlanBreakdown {
    #[serde(default)]
    bonus: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanUsage {
    #[serde(default)]
    included_spend: Option<f64>,
    #[serde(default)]
    bonus_spend: Option<f64>,
    #[serde(default)]
    limit: Option<f64>,
    #[serde(default)]
    api_percent_used: Option<f64>,
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
    individual_remaining: Option<f64>,
    #[serde(default)]
    pooled_limit: Option<f64>,
    #[serde(default)]
    pooled_used: Option<f64>,
    #[serde(default)]
    limit_type: Option<String>,
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

#[derive(Debug, Clone)]
struct CursorAuth {
    access_token: String,
    email: Option<String>,
    membership_type: Option<String>,
    team_id: Option<String>,
}

pub(crate) async fn fetch_cursor_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let auth = load_cursor_auth()?;

    // Prefer cursor.com usage-summary, authenticated with a WorkosCursorSessionToken
    // derived from Cursor.app's JWT. Browser cookies are optional; api2 DashboardService
    // stays as a last-resort fallback.
    let summary_error = match fetch_cursor_usage_summary(client, &auth).await {
        Ok(summary) => return build_result_from_summary(&auth, summary),
        Err(error) => {
            tracing::debug!(error = %error, "Cursor usage-summary unavailable");
            error
        }
    };

    // Fallback to Connect RPC
    let usage = match request_cursor_usage(client, &auth.access_token).await {
        Ok(usage) => usage,
        Err(error) if error.contains("401") || error.contains("403") => {
            return Err(ProviderError::Fetch(
                "Cursor session expired or token invalid. Sign in again in Cursor desktop."
                    .to_string(),
            ));
        }
        Err(error) => {
            return Err(ProviderError::Fetch(format!(
                "Cursor usage-summary failed ({summary_error}); DashboardService fallback failed ({error})"
            )));
        }
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

    let plan = usage.plan_usage.as_ref();

    // 基础用量：includedSpend / limit（cents → USD）
    let included_used = plan.and_then(|p| p.included_spend).map(cents_to_usd);
    let included_limit = plan.and_then(|p| p.limit).map(cents_to_usd);
    let included_percent = match (included_used, included_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => None,
    };

    // 额外用量：bonusSpend（cents → USD），percent 用 apiPercentUsed
    let bonus_used = plan.and_then(|p| p.bonus_spend).map(cents_to_usd);
    let bonus_percent = plan.and_then(|p| p.api_percent_used);

    // 团队 on-demand（spendLimitUsage.pooled，cents → USD）
    let (team_used, team_limit) = usage
        .spend_limit_usage
        .as_ref()
        .map(|s| {
            (
                s.pooled_used.map(cents_to_usd),
                s.pooled_limit.map(cents_to_usd),
            )
        })
        .unwrap_or((None, None));
    let team_percent = match (team_used, team_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => None,
    };

    // 个人 on-demand（team 账户下 individualLimit/Remaining，cents → USD）
    let (on_demand_used, on_demand_limit) = usage
        .spend_limit_usage
        .as_ref()
        .map(|value| {
            let is_team = value.limit_type.as_deref() == Some("team");
            let individual_used = value.individual_used.or({
                match (value.individual_limit, value.individual_remaining) {
                    (Some(limit), Some(remaining)) => Some(limit - remaining),
                    _ => None,
                }
            });
            let used = if is_team {
                individual_used.map(cents_to_usd)
            } else {
                individual_used.or(value.pooled_used).map(cents_to_usd)
            };
            let limit = value.individual_limit.map(cents_to_usd);
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
    if let Some(bu) = bonus_used {
        let bonus_limit = bonus_percent
            .filter(|&p| p > 0.0)
            .map(|p| round_metric(bu / (p / 100.0)));
        let value = match (bonus_percent, bonus_limit) {
            (Some(p), Some(limit)) => {
                format!("{p:.1}% used · {} / {}", format_usd(bu), format_usd(limit))
            }
            (Some(p), None) => format!("{p:.1}% used · {} used", format_usd(bu)),
            _ => format!("{} used", format_usd(bu)),
        };
        usage_rows.push(DetailRow {
            label: "Bonus usage".to_string(),
            value,
            tone: RowTone::Default,
        });
    }
    if let Some(percent) = on_demand_percent {
        usage_rows.push(DetailRow {
            label: "On-Demand".to_string(),
            value: format_percent_window(percent, on_demand_used, on_demand_limit, reset_at),
            tone: RowTone::Default,
        });
    } else if let Some(used) = on_demand_used {
        usage_rows.push(DetailRow {
            label: "On-Demand".to_string(),
            value: match on_demand_limit {
                Some(limit) if limit > 0.0 => {
                    format!("{} / {}", format_usd(used), format_usd(limit))
                }
                _ => format!("{} used", format_usd(used)),
            },
            tone: RowTone::Default,
        });
    }

    let mut team_section = None;
    if let (Some(percent), Some(used), Some(limit)) = (team_percent, team_used, team_limit) {
        team_section = Some(DetailSection {
            title: "Team".to_string(),
            rows: vec![DetailRow {
                label: "On-Demand".to_string(),
                value: format_percent_window(percent, Some(used), Some(limit), reset_at),
                tone: RowTone::Default,
            }],
        });
    }

    if usage_rows.is_empty() {
        return Err(ProviderError::Fetch(
            "Cursor usage data is missing plan buckets".to_string(),
        ));
    }

    // usage_summary drives the top-level percent indicator — use totalPercentUsed
    let summary_percent = plan
        .and_then(|p| p.total_percent_used)
        .map(normalize_fraction_percent)
        .or(included_percent);

    Ok(LiveFetchResult {
        plan_label: plan_label.clone(),
        usage_summary: Some(build_percent_usage_summary(summary_percent)),
        detail_sections: {
            let mut sections = vec![
                DetailSection {
                    title: "Account".to_string(),
                    rows: vec![
                        DetailRow {
                            label: "Account".to_string(),
                            value: auth.email.clone().unwrap_or_else(|| "Cursor".to_string()),
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
            ];
            if let Some(s) = team_section {
                sections.push(s);
            }
            sections
        },
        warnings: vec![],
        fetch_message: "Cursor DashboardService API".to_string(),
        reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

fn build_result_from_summary(
    auth: &CursorAuth,
    summary: CursorQuotaSummaryResponse,
) -> Result<LiveFetchResult, ProviderError> {
    let reset_at = summary
        .billing_cycle_end
        .as_deref()
        .and_then(parse_cursor_timestamp);

    let plan = summary
        .individual_usage
        .as_ref()
        .and_then(|u| u.plan.as_ref());

    // plan.used = includedSpend (cents), plan.limit = included limit (cents)
    let included_used = plan.and_then(|p| p.used).map(cents_to_usd);
    let included_limit = plan.and_then(|p| p.limit).map(cents_to_usd);
    let included_percent = match (included_used, included_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => None,
    };

    let bonus_used = plan
        .and_then(|p| p.breakdown.as_ref()?.bonus)
        .map(cents_to_usd);
    let bonus_api_percent = plan.and_then(|p| p.api_percent_used);
    let summary_percent = plan.and_then(|p| p.total_percent_used);

    if included_percent.is_none() && included_used.is_none() {
        return Err(ProviderError::Fetch(
            "Cursor usage-summary missing plan data".to_string(),
        ));
    }

    let plan_label = summary
        .membership_type
        .clone()
        .or_else(|| auth.membership_type.clone())
        .map(format_cursor_plan_label);

    let individual_on_demand = summary
        .individual_usage
        .as_ref()
        .and_then(|u| u.on_demand.as_ref());
    let od_used = individual_on_demand
        .and_then(|od| od.used)
        .map(cents_to_usd);
    let od_limit = individual_on_demand
        .and_then(|od| od.limit)
        .map(cents_to_usd);
    let od_percent = match (od_used, od_limit) {
        (Some(used), Some(limit)) if limit > 0.0 => Some(round_metric((used / limit) * 100.0)),
        _ => None,
    };

    let mut usage_rows = Vec::new();
    if let Some(percent) = included_percent {
        usage_rows.push(DetailRow {
            label: "Included usage".to_string(),
            value: format_percent_window(percent, included_used, included_limit, reset_at),
            tone: RowTone::Default,
        });
    }
    if let Some(bu) = bonus_used {
        let bonus_limit = bonus_api_percent
            .filter(|&p| p > 0.0)
            .map(|p| round_metric(bu / (p / 100.0)));
        let value = match (bonus_api_percent, bonus_limit) {
            (Some(p), Some(limit)) => {
                format!("{p:.1}% used · {} / {}", format_usd(bu), format_usd(limit))
            }
            (Some(p), None) => format!("{p:.1}% used · {} used", format_usd(bu)),
            _ => format!("{} used", format_usd(bu)),
        };
        usage_rows.push(DetailRow {
            label: "Bonus usage".to_string(),
            value,
            tone: RowTone::Default,
        });
    }
    if od_limit.is_some() {
        let value = match (od_percent, od_used, od_limit) {
            (Some(p), Some(used), Some(limit)) => {
                format_percent_window(p, Some(used), Some(limit), reset_at)
            }
            (None, Some(used), Some(limit)) => {
                format!("{} / {}", format_usd(used), format_usd(limit))
            }
            _ => String::new(),
        };
        if !value.is_empty() {
            usage_rows.push(DetailRow {
                label: "On-Demand".to_string(),
                value,
                tone: RowTone::Default,
            });
        }
    }

    // Team section (separate from Usage so it doesn't appear in footer carousel)
    let team_section = summary
        .team_usage
        .as_ref()
        .and_then(|t| t.on_demand.as_ref())
        .and_then(|od| {
            let used = od.used.map(cents_to_usd)?;
            let limit = od.limit.map(cents_to_usd)?;
            let percent = if limit > 0.0 {
                round_metric((used / limit) * 100.0)
            } else {
                return None;
            };
            Some(DetailSection {
                title: "Team".to_string(),
                rows: vec![DetailRow {
                    label: "On-Demand".to_string(),
                    value: format_percent_window(percent, Some(used), Some(limit), reset_at),
                    tone: RowTone::Default,
                }],
            })
        });

    if usage_rows.is_empty() {
        return Err(ProviderError::Fetch(
            "Cursor usage-summary missing plan data".to_string(),
        ));
    }

    Ok(LiveFetchResult {
        plan_label: plan_label.clone(),
        usage_summary: Some(build_percent_usage_summary(
            summary_percent.or(included_percent),
        )),
        detail_sections: {
            let mut sections = vec![
                DetailSection {
                    title: "Account".to_string(),
                    rows: vec![
                        DetailRow {
                            label: "Account".to_string(),
                            value: auth.email.clone().unwrap_or_else(|| "Cursor".to_string()),
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
            ];
            if let Some(s) = team_section {
                sections.push(s);
            }
            sections
        },
        warnings: vec![],
        fetch_message: "Cursor usage-summary API".to_string(),
        reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

async fn fetch_cursor_usage_summary(
    client: &Client,
    auth: &CursorAuth,
) -> Result<CursorQuotaSummaryResponse, String> {
    if let Some(cookie) = cursor_session_cookie_from_access_token(&auth.access_token) {
        match request_cursor_usage_summary(client, &cookie, auth.team_id.as_deref()).await {
            Ok(summary) => return Ok(summary),
            Err(error) => {
                tracing::debug!(error = %error, "Cursor.app JWT cookie rejected by usage-summary");
            }
        }
    }

    if let Ok(Some(session)) = load_cursor_session_token() {
        let team_id =
            extract_cookie_value(&session.cookie_header, "team_id").or(auth.team_id.clone());
        return request_cursor_usage_summary(client, &session.cookie_header, team_id.as_deref())
            .await;
    }

    Err("no Cursor session cookie available".to_string())
}

/// Cursor.app local-auth cookie: `WorkosCursorSessionToken={userId}%3A%3A{jwt}`.
fn cursor_session_cookie_from_access_token(access_token: &str) -> Option<String> {
    let token = access_token.trim();
    if token.is_empty() {
        return None;
    }
    let payload = decode_jwt_payload(token)?;
    if let Some(exp) = payload.get("exp").and_then(|value| value.as_i64()) {
        if exp <= (unix_now() as i64) + 60 {
            return None;
        }
    } else {
        return None;
    }
    let user_id = cursor_user_id_from_jwt(&payload)?;
    Some(format!("WorkosCursorSessionToken={user_id}%3A%3A{token}"))
}

fn cursor_user_id_from_jwt(payload: &serde_json::Value) -> Option<String> {
    let sub = payload.get("sub")?.as_str()?.trim();
    if sub.is_empty() {
        return None;
    }
    let user_id = sub.rsplit('|').next().unwrap_or(sub).trim().to_string();
    if user_id.is_empty() {
        return None;
    }
    let allowed = |ch: char| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-');
    if !user_id.chars().all(allowed) {
        return None;
    }
    Some(user_id)
}

async fn request_cursor_usage_summary(
    client: &Client,
    cookie_header: &str,
    team_id: Option<&str>,
) -> Result<CursorQuotaSummaryResponse, String> {
    let url = match team_id {
        Some(id) => format!("{CURSOR_USAGE_SUMMARY_URL}?teamId={id}"),
        None => CURSOR_USAGE_SUMMARY_URL.to_string(),
    };
    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .header("Cookie", cookie_header)
        .send()
        .await
        .map_err(|e| format!("Cursor usage-summary request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Cursor usage-summary returned {}",
            response.status()
        ));
    }

    response
        .json::<CursorQuotaSummaryResponse>()
        .await
        .map_err(|e| format!("Invalid Cursor usage-summary payload: {e}"))
}

fn extract_cookie_value(cookie_header: &str, name: &str) -> Option<String> {
    cookie_header.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(&format!("{name}="))
            .map(|v| v.to_string())
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

fn load_cursor_auth() -> Result<CursorAuth, ProviderError> {
    let env_access = env::var("ATMOS_USAGE_CURSOR_ACCESS_TOKEN")
        .ok()
        .or_else(|| env::var("CURSOR_ACCESS_TOKEN").ok())
        .filter(|value| !value.trim().is_empty());
    if let Some(access_token) = env_access {
        return Ok(CursorAuth {
            access_token,
            email: None,
            membership_type: None,
            team_id: None,
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
        if access_token.is_none() {
            continue;
        }

        return Ok(Some(CursorAuth {
            access_token: access_token.unwrap_or_default(),
            email: cursor_state_value(&path, "cursorAuth/cachedEmail")?,
            membership_type: cursor_state_value(&path, "cursorAuth/stripeMembershipType")?,
            team_id: cursor_state_value(&path, "cursorAuth/cachedTeam")?
                .as_deref()
                .and_then(parse_cursor_team_id),
        }));
    }

    Ok(None)
}

fn load_cursor_auth_from_keychain() -> Result<Option<CursorAuth>, ProviderError> {
    let access_token = security_find_generic_password("cursor-access-token")?;
    if access_token.is_none() {
        return Ok(None);
    }

    Ok(Some(CursorAuth {
        access_token: access_token.unwrap_or_default(),
        email: None,
        membership_type: None,
        team_id: None,
    }))
}

fn cursor_state_value(path: &Path, key: &str) -> Result<Option<String>, ProviderError> {
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

fn parse_cursor_timestamp(raw: &str) -> Option<u64> {
    parse_i64_string(raw)
        .map(epoch_millis_to_secs)
        .or_else(|| parse_offset_datetime(raw).map(|value| value.unix_timestamp().max(0) as u64))
}

fn parse_cursor_team_id(raw: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    match value.get("teamId") {
        Some(serde_json::Value::Number(number)) => Some(number.to_string()),
        Some(serde_json::Value::String(text)) => {
            let text = text.trim();
            if text.is_empty() {
                None
            } else {
                Some(text.to_string())
            }
        }
        _ => None,
    }
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
            Some(limit) if limit > 0.0 => {
                value.push_str(&format!("{} / {}", format_usd(used), format_usd(limit)))
            }
            _ => value.push_str(&format!("{} used", format_usd(used))),
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

#[cfg(test)]
mod tests {
    use super::*;

    const LIVE_JWT: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRoMHx1c2VyXzAxSzlIWERURkczMkUyOTFISEQzTjY0R1JHIiwiZXhwIjo5OTk5OTk5OTk5LCJ0eXBlIjoic2Vzc2lvbiJ9.sig";
    const EXPIRED_JWT: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRoMHx1c2VyXzAxSzlIWERURkczMkUyOTFISEQzTjY0R1JHIiwiZXhwIjoxLCJ0eXBlIjoic2Vzc2lvbiJ9.sig";
    const NO_EXP_JWT: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRoMHx1c2VyXzAxQUJDIiwidHlwZSI6InNlc3Npb24ifQ.sig";

    #[test]
    fn derives_workos_cookie_from_cursor_app_jwt() {
        let cookie = cursor_session_cookie_from_access_token(LIVE_JWT).expect("cookie");
        assert_eq!(
            cookie,
            format!("WorkosCursorSessionToken=user_01K9HXDTFG32E291HHD3N64GRG%3A%3A{LIVE_JWT}")
        );
    }

    #[test]
    fn rejects_expired_or_unexpiring_access_token() {
        assert!(cursor_session_cookie_from_access_token(EXPIRED_JWT).is_none());
        assert!(cursor_session_cookie_from_access_token(NO_EXP_JWT).is_none());
        assert!(cursor_session_cookie_from_access_token("not-a-jwt").is_none());
    }

    #[test]
    fn parses_usage_summary_iso_and_dashboard_millis() {
        assert_eq!(
            parse_cursor_timestamp("2026-09-03T05:33:03.000Z"),
            Some(1788413583)
        );
        assert_eq!(parse_cursor_timestamp("1788413583000"), Some(1788413583));
    }

    #[test]
    fn parses_cached_team_id_from_state_db() {
        assert_eq!(
            parse_cursor_team_id(r#"{"teamId":8521357,"name":"HelloBike"}"#).as_deref(),
            Some("8521357")
        );
        assert_eq!(
            parse_cursor_team_id(r#"{"teamId":"team_abc"}"#).as_deref(),
            Some("team_abc")
        );
        assert!(parse_cursor_team_id("not-json").is_none());
    }

    #[test]
    fn usage_summary_reads_membership_and_plan_buckets() {
        let summary: CursorQuotaSummaryResponse = serde_json::from_str(
            r#"{
              "billingCycleEnd": "2026-09-03T05:33:03.000Z",
              "membershipType": "enterprise",
              "individualUsage": {
                "plan": { "used": 2000, "limit": 2000, "totalPercentUsed": 100 },
                "onDemand": { "used": 59640, "limit": 200000 }
              },
              "teamUsage": { "onDemand": { "used": 100, "limit": 200 } }
            }"#,
        )
        .expect("summary");
        let result = build_result_from_summary(
            &CursorAuth {
                access_token: LIVE_JWT.to_string(),
                email: Some("dev@example.com".to_string()),
                membership_type: Some("pro".to_string()),
                team_id: Some("8521357".to_string()),
            },
            summary,
        )
        .expect("result");
        assert_eq!(result.plan_label.as_deref(), Some("Enterprise"));
        assert_eq!(result.reset_at, Some(1788413583));
        assert_eq!(result.fetch_message, "Cursor usage-summary API");
        let usage = result
            .detail_sections
            .iter()
            .find(|section| section.title == "Usage")
            .expect("usage");
        assert!(usage.rows.iter().any(|row| row.label == "Included usage"));
        assert!(usage.rows.iter().any(|row| row.label == "On-Demand"));
    }
}
