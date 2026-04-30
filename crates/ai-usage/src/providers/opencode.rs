use regex::Regex;
use reqwest::redirect::Policy;
use reqwest::Client;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use crate::constants::{
    OPENCODE_LOCAL_AUTH_PATH, OPENCODE_LOCAL_DB_PATH, OPENCODE_MONTHLY_LIMIT_USD,
    OPENCODE_SESSION_LIMIT_USD, OPENCODE_SESSION_WINDOW_SECS, OPENCODE_WEEKLY_LIMIT_USD,
    OPENCODE_WEEK_MS,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, expand_home, format_reset_relative_text,
    load_opencode_browser_cookie_source, round_metric, run_sqlite_query, unix_now,
    BrowserCookieSource,
};

const OPENCODE_BASE_URL: &str = "https://opencode.ai";
const OPENCODE_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const HISTORY_EXISTS_SQL: &str = r#"
SELECT 1
FROM message
WHERE json_valid(data)
  AND json_extract(data, '$.providerID') = 'opencode-go'
  AND json_extract(data, '$.role') = 'assistant'
  AND json_type(data, '$.cost') IN ('integer', 'real')
LIMIT 1
"#;

const HISTORY_ROWS_SQL: &str = r#"
SELECT
  CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER),
  CAST(json_extract(data, '$.cost') AS REAL)
FROM message
WHERE json_valid(data)
  AND json_extract(data, '$.providerID') = 'opencode-go'
  AND json_extract(data, '$.role') = 'assistant'
  AND json_type(data, '$.cost') IN ('integer', 'real')
"#;

const PROVIDER_ID: &str = "opencode-go";

struct CostRow {
    created_ms: i64,
    cost: f64,
}

pub(crate) async fn fetch_opencode_live(
    _client: &Client,
) -> Result<LiveFetchResult, ProviderError> {
    // Prefer the cloud workspace dashboard (cross-machine totals) when an
    // opencode.ai browser session is available locally. Falls back to the
    // single-machine local DB otherwise.
    let browser_source = load_opencode_browser_cookie_source().ok().flatten();
    let mut remote_warning: Option<String> = None;
    if let Some(source) = browser_source {
        match fetch_opencode_remote(&source).await {
            Ok(result) => return Ok(result),
            Err(error) => {
                remote_warning = Some(format!(
                    "Cloud fetch via {} failed: {}. Showing local DB only.",
                    source.source_label, error.0
                ));
            }
        }
    }

    if !opencode_go_auth_available() {
        return Err(ProviderError::Fetch(
            "OpenCode Go is not signed in; run `opencode auth login` and select opencode-go"
                .to_string(),
        ));
    }

    let db_path = resolve_path(OPENCODE_LOCAL_DB_PATH)
        .ok_or_else(|| ProviderError::Fetch("OpenCode Go database path not found".to_string()))?;

    if !db_path.exists() {
        return Err(ProviderError::Fetch(
            "OpenCode Go database does not exist; use OpenCode Go locally first".to_string(),
        ));
    }

    let has_history = has_go_history(&db_path)?;
    let mut result = if has_history {
        let rows = load_go_rows(&db_path)?;
        if rows.is_empty() {
            build_empty_result()?
        } else {
            build_usage_result(&rows)?
        }
    } else {
        build_empty_result()?
    };

    if let Some(extra) = remote_warning {
        result.warnings.insert(0, extra);
    }
    Ok(result)
}

struct ProviderErrorMsg(String);

async fn fetch_opencode_remote(
    source: &BrowserCookieSource,
) -> Result<LiveFetchResult, ProviderErrorMsg> {
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(20))
        .user_agent(OPENCODE_USER_AGENT)
        .build()
        .map_err(|error| ProviderErrorMsg(format!("client build failed: {error}")))?;

    let workspace_id = discover_opencode_workspace_id(&client, &source.cookie_header).await?;
    let html = fetch_opencode_go_page(&client, &source.cookie_header, &workspace_id).await?;
    let parsed = parse_opencode_go_page(&html).ok_or_else(|| {
        ProviderErrorMsg("could not parse usage data from opencode.ai HTML".to_string())
    })?;

    Ok(build_remote_result(&workspace_id, source, parsed))
}

async fn discover_opencode_workspace_id(
    client: &Client,
    cookie_header: &str,
) -> Result<String, ProviderErrorMsg> {
    let response = client
        .get(format!("{OPENCODE_BASE_URL}/auth"))
        .header("Cookie", cookie_header)
        .send()
        .await
        .map_err(|error| ProviderErrorMsg(format!("/auth request failed: {error}")))?;

    let status = response.status();
    let location = response
        .headers()
        .get("location")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    if !status.is_redirection() || location.is_none() {
        return Err(ProviderErrorMsg(format!(
            "/auth returned {status} (expected 302 with workspace id)"
        )));
    }

    let location = location.unwrap();
    extract_workspace_id(&location)
        .ok_or_else(|| ProviderErrorMsg(format!("workspace id not found in redirect: {location}")))
}

#[derive(Debug)]
struct SolidWindowUsage {
    usage_percent: f64,
    reset_in_sec: u64,
}

fn parse_opencode_go_solid_payload(html: &str) -> Option<ParsedRemoteUsage> {
    let rolling = parse_solid_window_usage(html, "rollingUsage");
    let weekly = parse_solid_window_usage(html, "weeklyUsage");
    let monthly = parse_solid_window_usage(html, "monthlyUsage");

    if rolling.is_none() && weekly.is_none() && monthly.is_none() {
        return None;
    }

    let now = unix_now();
    let reset_text = |usage: Option<&SolidWindowUsage>| {
        usage.map(|usage| format_reset_duration_text(usage.reset_in_sec))
    };
    let reset_at = |usage: Option<&SolidWindowUsage>| {
        usage.map(|usage| now.saturating_add(usage.reset_in_sec))
    };

    Some(ParsedRemoteUsage {
        rolling_pct: rolling.as_ref().map(|usage| usage.usage_percent),
        weekly_pct: weekly.as_ref().map(|usage| usage.usage_percent),
        monthly_pct: monthly.as_ref().map(|usage| usage.usage_percent),
        rolling_reset: reset_text(rolling.as_ref()),
        weekly_reset: reset_text(weekly.as_ref()),
        monthly_reset: reset_text(monthly.as_ref()),
        rolling_reset_at: reset_at(rolling.as_ref()),
        weekly_reset_at: reset_at(weekly.as_ref()),
        monthly_reset_at: reset_at(monthly.as_ref()),
    })
}

fn parse_solid_window_usage(html: &str, field: &str) -> Option<SolidWindowUsage> {
    let escaped_field = regex::escape(field);
    let object_pattern = format!(r#"{escaped_field}:\$R\[\d+\]=\{{(?P<body>[^}}]*)\}}"#);
    let object_regex = Regex::new(&object_pattern).ok()?;
    let body = object_regex
        .captures(html)
        .and_then(|captures| captures.name("body"))?
        .as_str();

    let usage_percent = extract_object_field_number(body, "usagePercent")?;
    let reset_in_sec = extract_object_field_number(body, "resetInSec")?;
    if !usage_percent.is_finite() || !reset_in_sec.is_finite() {
        return None;
    }

    Some(SolidWindowUsage {
        usage_percent: usage_percent.max(0.0),
        reset_in_sec: reset_in_sec.max(0.0).round() as u64,
    })
}

fn extract_object_field_number(body: &str, field: &str) -> Option<f64> {
    let escaped_field = regex::escape(field);
    let pattern = format!(r#"{escaped_field}:(-?\d+(?:\.\d+)?)"#);
    Regex::new(&pattern)
        .ok()?
        .captures(body)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse::<f64>().ok())
}

fn format_reset_duration_text(seconds: u64) -> String {
    let days = seconds / 86_400;
    let hours = (seconds % 86_400) / 3_600;
    let minutes = (seconds % 3_600) / 60;

    if days > 0 {
        format!("{days}d {hours}h")
    } else if hours > 0 {
        format!("{hours}h {minutes}m")
    } else {
        format!("{minutes}m")
    }
}

fn extract_workspace_id(location: &str) -> Option<String> {
    for segment in location.split('/') {
        if segment.starts_with("wrk_") {
            let trimmed = segment.split('?').next().unwrap_or(segment);
            return Some(trimmed.to_string());
        }
    }
    None
}

async fn fetch_opencode_go_page(
    client: &Client,
    cookie_header: &str,
    workspace_id: &str,
) -> Result<String, ProviderErrorMsg> {
    let url = format!("{OPENCODE_BASE_URL}/workspace/{workspace_id}/go");
    let response = client
        .get(&url)
        .header("Cookie", cookie_header)
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|error| ProviderErrorMsg(format!("Go page request failed: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        return Err(ProviderErrorMsg(format!(
            "Go page returned {status} (cookie may be expired)"
        )));
    }

    response
        .text()
        .await
        .map_err(|error| ProviderErrorMsg(format!("Go page body read failed: {error}")))
}

#[derive(Debug)]
struct ParsedRemoteUsage {
    rolling_pct: Option<f64>,
    weekly_pct: Option<f64>,
    monthly_pct: Option<f64>,
    rolling_reset: Option<String>,
    weekly_reset: Option<String>,
    monthly_reset: Option<String>,
    rolling_reset_at: Option<u64>,
    weekly_reset_at: Option<u64>,
    monthly_reset_at: Option<u64>,
}

fn parse_opencode_go_page(html: &str) -> Option<ParsedRemoteUsage> {
    if let Some(parsed) = parse_opencode_go_solid_payload(html) {
        return Some(parsed);
    }
    let percents = extract_data_slot_values(html, "usage-value");
    let resets = extract_data_slot_values(html, "reset-time");

    if percents.is_empty() && resets.is_empty() {
        return None;
    }

    let parse_pct = |raw: &str| -> Option<f64> {
        let cleaned = raw.trim().trim_end_matches('%').trim();
        cleaned.parse::<f64>().ok()
    };

    Some(ParsedRemoteUsage {
        rolling_pct: percents.first().and_then(|s| parse_pct(s)),
        weekly_pct: percents.get(1).and_then(|s| parse_pct(s)),
        monthly_pct: percents.get(2).and_then(|s| parse_pct(s)),
        rolling_reset: resets.first().cloned(),
        weekly_reset: resets.get(1).cloned(),
        monthly_reset: resets.get(2).cloned(),
        rolling_reset_at: None,
        weekly_reset_at: None,
        monthly_reset_at: None,
    })
}

fn extract_data_slot_values(html: &str, slot: &str) -> Vec<String> {
    let needle = format!("data-slot=\"{slot}\"");
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while let Some(pos) = html[cursor..].find(&needle) {
        let abs = cursor + pos + needle.len();
        // Find the next '>' that opens the element body
        let Some(rel_gt) = html[abs..].find('>') else {
            break;
        };
        let body_start = abs + rel_gt + 1;
        let Some(rel_lt) = html[body_start..].find('<') else {
            break;
        };
        let body_end = body_start + rel_lt;
        let raw = html[body_start..body_end].trim();
        if !raw.is_empty() {
            out.push(decode_html_entities(raw));
        }
        cursor = body_end;
    }
    out
}

fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#x27;", "'")
        .replace("&quot;", "\"")
}

fn build_remote_result(
    workspace_id: &str,
    source: &BrowserCookieSource,
    parsed: ParsedRemoteUsage,
) -> LiveFetchResult {
    let primary_pct = parsed
        .rolling_pct
        .or(parsed.weekly_pct)
        .or(parsed.monthly_pct);

    let format_row = |pct: Option<f64>, reset: Option<&String>| -> String {
        let mut parts = Vec::new();
        if let Some(p) = pct {
            parts.push(format!("{}% used", round_metric(p)));
        } else {
            parts.push("—".to_string());
        }
        if let Some(r) = reset.filter(|s| !s.is_empty()) {
            if r.to_ascii_lowercase().starts_with("reset") {
                parts.push(r.to_string());
            } else {
                parts.push(format!("Resets in {r}"));
            }
        }
        parts.join(" · ")
    };

    let reset_at = parsed
        .rolling_reset_at
        .or(parsed.weekly_reset_at)
        .or(parsed.monthly_reset_at);

    let rows = vec![
        DetailRow {
            label: "Session".to_string(),
            value: format_row(parsed.rolling_pct, parsed.rolling_reset.as_ref()),
            tone: RowTone::Default,
        },
        DetailRow {
            label: "Weekly".to_string(),
            value: format_row(parsed.weekly_pct, parsed.weekly_reset.as_ref()),
            tone: RowTone::Default,
        },
        DetailRow {
            label: "Monthly".to_string(),
            value: format_row(parsed.monthly_pct, parsed.monthly_reset.as_ref()),
            tone: RowTone::Default,
        },
    ];

    LiveFetchResult {
        plan_label: Some("Go".to_string()),
        usage_summary: Some(build_percent_usage_summary(primary_pct)),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Workspace".to_string(),
                        value: workspace_id.to_string(),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: "Go".to_string(),
                        tone: RowTone::Default,
                    },
                ],
            },
            DetailSection {
                title: "Usage".to_string(),
                rows,
            },
        ],
        warnings: vec![],
        fetch_message: format!("opencode.ai workspace dashboard ({})", source.source_label),
        reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    }
}

fn resolve_path(raw: &str) -> Option<PathBuf> {
    expand_home(raw)
}

fn has_go_history(db_path: &PathBuf) -> Result<bool, ProviderError> {
    let output = run_sqlite_query(db_path, HISTORY_EXISTS_SQL)?;
    Ok(!output.trim().is_empty())
}

fn load_go_rows(db_path: &PathBuf) -> Result<Vec<CostRow>, ProviderError> {
    let output = run_sqlite_query(db_path, HISTORY_ROWS_SQL)?;
    let now_sec = unix_now() as i64;
    let mut rows = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('|');
        let Some(created_str) = parts.next() else {
            continue;
        };
        let Some(cost_str) = parts.next() else {
            continue;
        };
        let Ok(created_ms) = created_str.trim().parse::<i64>() else {
            continue;
        };
        let Ok(cost) = cost_str.trim().parse::<f64>() else {
            continue;
        };
        if created_ms <= 0 || cost < 0.0 {
            continue;
        }
        if !cost.is_finite() {
            continue;
        }
        if created_ms > now_sec * 1000 + 86_400_000 {
            continue;
        }
        rows.push(CostRow { created_ms, cost });
    }

    rows.sort_by_key(|r| r.created_ms);
    Ok(rows)
}

fn build_empty_result() -> Result<LiveFetchResult, ProviderError> {
    Ok(LiveFetchResult {
        plan_label: Some("Go".to_string()),
        usage_summary: Some(build_percent_usage_summary(Some(0.0))),
        detail_sections: vec![DetailSection {
            title: "Usage".to_string(),
            rows: vec![
                DetailRow {
                    label: "Session".to_string(),
                    value: "0% used".to_string(),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Weekly".to_string(),
                    value: "0% used".to_string(),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Monthly".to_string(),
                    value: "0% used".to_string(),
                    tone: RowTone::Default,
                },
            ],
        }],
        warnings: vec![local_only_warning()],
        fetch_message: "OpenCode Go local usage".to_string(),
        reset_at: None,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

fn build_usage_result(rows: &[CostRow]) -> Result<LiveFetchResult, ProviderError> {
    let now_ms = unix_now() as i64 * 1000;

    let earliest_ms = rows.first().map(|r| r.created_ms);

    let session_start_ms = now_ms - (OPENCODE_SESSION_WINDOW_SECS as i64 * 1000);
    let weekly_start_ms = start_of_utc_week_ms(now_ms);
    let weekly_end_ms = weekly_start_ms + OPENCODE_WEEK_MS as i64;
    let (monthly_start_ms, monthly_end_ms) = anchored_monthly_window_ms(now_ms, earliest_ms);

    let session_cost = sum_cost_in_window(rows, session_start_ms, now_ms);
    let weekly_cost = sum_cost_in_window(rows, weekly_start_ms, weekly_end_ms);
    let monthly_cost = sum_cost_in_window(rows, monthly_start_ms, monthly_end_ms);

    let session_pct = clamp_percent(session_cost, OPENCODE_SESSION_LIMIT_USD);
    let weekly_pct = clamp_percent(weekly_cost, OPENCODE_WEEKLY_LIMIT_USD);
    let monthly_pct = clamp_percent(monthly_cost, OPENCODE_MONTHLY_LIMIT_USD);

    let session_reset = compute_session_reset(rows, now_ms);
    let weekly_reset = (weekly_end_ms / 1000) as u64;
    let monthly_reset = (monthly_end_ms / 1000) as u64;

    Ok(LiveFetchResult {
        plan_label: Some("Go".to_string()),
        usage_summary: Some(build_percent_usage_summary(Some(session_pct))),
        detail_sections: vec![DetailSection {
            title: "Usage".to_string(),
            rows: vec![
                DetailRow {
                    label: "Session".to_string(),
                    value: format!(
                        "{}% used · {}",
                        round_metric(session_pct),
                        format_reset_relative_text(Some(session_reset))
                    ),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Weekly".to_string(),
                    value: format!(
                        "{}% used · {}",
                        round_metric(weekly_pct),
                        format_reset_relative_text(Some(weekly_reset))
                    ),
                    tone: RowTone::Default,
                },
                DetailRow {
                    label: "Monthly".to_string(),
                    value: format!(
                        "{}% used · {}",
                        round_metric(monthly_pct),
                        format_reset_relative_text(Some(monthly_reset))
                    ),
                    tone: RowTone::Default,
                },
            ],
        }],
        warnings: vec![local_only_warning()],
        fetch_message: "OpenCode Go local usage".to_string(),
        reset_at: Some(session_reset),
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

fn local_only_warning() -> String {
    "Local DB only reflects usage from this machine. For cross-machine totals, sign in at opencode.ai and open your workspace's Go page.".to_string()
}

fn sum_cost_in_window(rows: &[CostRow], start_ms: i64, end_ms: i64) -> f64 {
    let mut total = 0.0;
    for row in rows {
        if row.created_ms >= start_ms && row.created_ms < end_ms {
            total += row.cost;
        }
    }
    total
}

fn clamp_percent(used: f64, limit: f64) -> f64 {
    if !used.is_finite() || !limit.is_finite() || limit <= 0.0 {
        return 0.0;
    }
    let pct = (used / limit) * 100.0;
    if !pct.is_finite() {
        return 0.0;
    }
    pct.clamp(0.0, 100.0)
}

fn compute_session_reset(rows: &[CostRow], now_ms: i64) -> u64 {
    let session_start_ms = now_ms - (OPENCODE_SESSION_WINDOW_SECS as i64 * 1000);
    let oldest = rows
        .iter()
        .filter(|r| r.created_ms >= session_start_ms && r.created_ms < now_ms)
        .map(|r| r.created_ms)
        .min()
        .unwrap_or(now_ms);
    ((oldest + OPENCODE_SESSION_WINDOW_SECS as i64 * 1000) / 1000) as u64
}

fn start_of_utc_week_ms(now_ms: i64) -> i64 {
    let now_sec = now_ms / 1000;
    let days_since_epoch = now_sec / 86_400;
    let weekday = (days_since_epoch + 3) % 7;
    let monday_epoch_days = days_since_epoch - weekday;
    monday_epoch_days * 86_400 * 1000
}

fn anchored_monthly_window_ms(now_ms: i64, earliest_ms: Option<i64>) -> (i64, i64) {
    let Some(earliest) = earliest_ms else {
        let start = start_of_utc_month_ms(now_ms);
        let end = start_of_next_utc_month_ms(now_ms);
        return (start, end);
    };

    let now_sec = now_ms / 1000;
    let anchor_sec = earliest / 1000;
    let anchor_days = anchor_sec / 86_400;

    let now_days = now_sec / 86_400;

    let anchor_day_of_month = day_of_month_from_epoch_days(anchor_days);
    let anchor_time_of_day = anchor_sec % 86_400;

    let (mut year, mut month) = year_month_from_epoch_days(now_days);

    let month_start_days = epoch_days_from_year_month_day(year, month, anchor_day_of_month);
    if month_start_days * 86_400 + anchor_time_of_day > now_sec {
        let (py, pm) = prev_year_month(year, month);
        year = py;
        month = pm;
    }

    let start_days = epoch_days_from_year_month_day(year, month, anchor_day_of_month);
    let start_ms = (start_days * 86_400 + anchor_time_of_day) * 1000;

    let (ny, nm) = next_year_month(year, month);
    let end_days = epoch_days_from_year_month_day(ny, nm, anchor_day_of_month);
    let end_ms = (end_days * 86_400 + anchor_time_of_day) * 1000;

    (start_ms, end_ms)
}

fn start_of_utc_month_ms(now_ms: i64) -> i64 {
    let now_sec = now_ms / 1000;
    let days = now_sec / 86_400;
    let (year, month) = year_month_from_epoch_days(days);
    let start_days = epoch_days_from_year_month_day(year, month, 1);
    start_days * 86_400 * 1000
}

fn start_of_next_utc_month_ms(now_ms: i64) -> i64 {
    let now_sec = now_ms / 1000;
    let days = now_sec / 86_400;
    let (year, month) = year_month_from_epoch_days(days);
    let (ny, nm) = next_year_month(year, month);
    let start_days = epoch_days_from_year_month_day(ny, nm, 1);
    start_days * 86_400 * 1000
}

fn year_month_from_epoch_days(days: i64) -> (i32, u32) {
    let mut d = days;
    let era = if d >= 0 {
        d / 146097
    } else {
        (d - 146096) / 146097
    };
    d -= era * 146097;
    let doe = d - d / 146097 * 146097;

    let mut yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);

    yoe = (doy - doy / 1460 + doy / 36524 - doy / 146096) / 365;
    year += yoe;
    let doy = doy - (365 * yoe + yoe / 4 - yoe / 100);

    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    year = if month <= 2 { year - 1 } else { year };

    (year as i32, month as u32)
}

fn epoch_days_from_year_month_day(year: i32, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year } as i64;
    let m = if month <= 2 { month + 12 } else { month } as i64;
    let d = day as i64;
    let era = if y >= 0 { y / 400 } else { (y - 399) / 400 };
    let yoe = y - era * 400;
    let doy = (153 * (m - 3) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn day_of_month_from_epoch_days(days: i64) -> u32 {
    let (year, month) = year_month_from_epoch_days(days);
    let start = epoch_days_from_year_month_day(year, month, 1);
    (days - start + 1) as u32
}

fn next_year_month(year: i32, month: u32) -> (i32, u32) {
    if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    }
}

fn prev_year_month(year: i32, month: u32) -> (i32, u32) {
    if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    }
}

fn read_opencode_go_auth() -> Option<String> {
    let auth_path = expand_home(OPENCODE_LOCAL_AUTH_PATH)?;
    if !auth_path.exists() {
        return None;
    }
    let text = fs::read_to_string(&auth_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&text).ok()?;
    let entry = parsed.get(PROVIDER_ID)?;
    let key = entry.get("key")?.as_str()?;
    let key = key.trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

pub(crate) fn opencode_go_auth_available() -> bool {
    read_opencode_go_auth().is_some()
}

pub(crate) fn opencode_go_db_exists() -> bool {
    expand_home(OPENCODE_LOCAL_DB_PATH)
        .map(|p| p.exists())
        .unwrap_or(false)
}

pub(crate) fn opencode_go_auth_source() -> Option<String> {
    expand_home(OPENCODE_LOCAL_AUTH_PATH).map(|p| p.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_workspace_id_from_redirect_path() {
        assert_eq!(
            extract_workspace_id("/workspace/wrk_01KK1NEECABQNG2B42BQ77J10B"),
            Some("wrk_01KK1NEECABQNG2B42BQ77J10B".to_string())
        );
        assert_eq!(
            extract_workspace_id("/zh/workspace/wrk_ABC123/go?x=1"),
            Some("wrk_ABC123".to_string())
        );
        assert_eq!(extract_workspace_id("/auth/authorize"), None);
    }

    #[test]
    fn parses_data_slot_values_in_order() {
        let html = r#"
            <div data-slot="usage">
                <div data-slot="usage-item">
                    <span data-slot="usage-label">Rolling usage</span>
                    <span data-slot="usage-value">42%</span>
                    <span data-slot="reset-time">2 days 3 hours</span>
                </div>
                <div data-slot="usage-item">
                    <span data-slot="usage-label">Weekly usage</span>
                    <span data-slot="usage-value">17%</span>
                    <span data-slot="reset-time">5 days</span>
                </div>
                <div data-slot="usage-item">
                    <span data-slot="usage-label">Monthly usage</span>
                    <span data-slot="usage-value">100%</span>
                    <span data-slot="reset-time">12 days</span>
                </div>
            </div>
        "#;
        let parsed = parse_opencode_go_page(html).expect("should parse");
        assert_eq!(parsed.rolling_pct, Some(42.0));
        assert_eq!(parsed.weekly_pct, Some(17.0));
        assert_eq!(parsed.monthly_pct, Some(100.0));
        assert_eq!(parsed.rolling_reset.as_deref(), Some("2 days 3 hours"));
        assert_eq!(parsed.weekly_reset.as_deref(), Some("5 days"));
        assert_eq!(parsed.monthly_reset.as_deref(), Some("12 days"));
    }
    #[test]
    fn parses_solid_hydration_usage_windows() {
        let html = r#"
            <script>
                rollingUsage:$R[12]={usage:1.23,usagePercent:42.5,resetInSec:18000}
                weeklyUsage:$R[13]={resetInSec:432000,usagePercent:17}
                monthlyUsage:$R[14]={usagePercent:100,resetInSec:1036800}
            </script>
        "#;

        let parsed = parse_opencode_go_page(html).expect("should parse");
        assert_eq!(parsed.rolling_pct, Some(42.5));
        assert_eq!(parsed.weekly_pct, Some(17.0));
        assert_eq!(parsed.monthly_pct, Some(100.0));
        assert_eq!(parsed.rolling_reset.as_deref(), Some("5h 0m"));
        assert_eq!(parsed.weekly_reset.as_deref(), Some("5d 0h"));
        assert_eq!(parsed.monthly_reset.as_deref(), Some("12d 0h"));
        assert!(parsed.rolling_reset_at.is_some());
        assert!(parsed.weekly_reset_at.is_some());
        assert!(parsed.monthly_reset_at.is_some());
    }

    #[test]
    fn parse_returns_none_when_no_slots() {
        assert!(parse_opencode_go_page("<html><body>nothing</body></html>").is_none());
    }
}
