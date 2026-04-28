use reqwest::Client;
use std::fs;
use std::path::PathBuf;

use crate::constants::{
    OPENCODE_LOCAL_AUTH_PATH, OPENCODE_LOCAL_DB_PATH, OPENCODE_MONTHLY_LIMIT_USD,
    OPENCODE_SESSION_LIMIT_USD, OPENCODE_SESSION_WINDOW_SECS, OPENCODE_WEEKLY_LIMIT_USD,
    OPENCODE_WEEK_MS,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, expand_home, format_reset_relative_text, round_metric,
    run_sqlite_query, unix_now,
};

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

pub(crate) async fn fetch_opencode_live(_client: &Client) -> Result<LiveFetchResult, ProviderError> {
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
    if !has_history {
        return build_empty_result();
    }

    let rows = load_go_rows(&db_path)?;
    if rows.is_empty() {
        return build_empty_result();
    }

    build_usage_result(&rows)
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
        warnings: vec![],
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
        warnings: vec![],
        fetch_message: "OpenCode Go local usage".to_string(),
        reset_at: Some(session_reset),
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
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
    let era = if d >= 0 { d / 146097 } else { (d - 146096) / 146097 };
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
