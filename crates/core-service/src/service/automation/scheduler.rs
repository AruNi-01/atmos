use chrono::{Duration, NaiveDateTime, Timelike, Utc};
use chrono_tz::Tz;
use cron::Schedule;
use std::str::FromStr;

use crate::error::{Result, ServiceError};

use super::{AutomationScheduleInput, AutomationScheduleKind};

pub fn normalize_schedule(
    input: &AutomationScheduleInput,
    now: NaiveDateTime,
) -> Result<NormalizedSchedule> {
    let (timezone, tz) = normalize_timezone(input.timezone.as_deref())?;

    let expr = match input.kind {
        AutomationScheduleKind::Hourly => {
            let minute = input.minute.unwrap_or(0);
            validate_range("minute", minute, 0, 59)?;
            format!("{} * * * *", minute)
        }
        AutomationScheduleKind::Daily => {
            let hour = input.hour.unwrap_or(9);
            let minute = input.minute.unwrap_or(0);
            validate_range("hour", hour, 0, 23)?;
            validate_range("minute", minute, 0, 59)?;
            format!("{} {} * * *", minute, hour)
        }
        AutomationScheduleKind::Weekly => {
            let hour = input.hour.unwrap_or(9);
            let minute = input.minute.unwrap_or(0);
            let day_of_week = input.day_of_week.unwrap_or(1);
            validate_range("hour", hour, 0, 23)?;
            validate_range("minute", minute, 0, 59)?;
            validate_range("day_of_week", day_of_week, 0, 6)?;
            format!("{} {} * * {}", minute, hour, day_of_week)
        }
        AutomationScheduleKind::Monthly => {
            let hour = input.hour.unwrap_or(9);
            let minute = input.minute.unwrap_or(0);
            let day_of_month = input.day_of_month.unwrap_or(1);
            validate_range("hour", hour, 0, 23)?;
            validate_range("minute", minute, 0, 59)?;
            validate_range("day_of_month", day_of_month, 1, 31)?;
            format!("{} {} {} * *", minute, hour, day_of_month)
        }
        AutomationScheduleKind::Cron => input
            .expr
            .as_deref()
            .map(str::trim)
            .filter(|expr| !expr.is_empty())
            .ok_or_else(|| ServiceError::Validation("Cron expression is required.".to_string()))?
            .to_string(),
    };

    let next_run_at = next_after(&expr, tz, now)?;

    Ok(NormalizedSchedule {
        kind: input.kind.clone(),
        expr,
        timezone,
        next_run_at,
    })
}

pub fn preview_schedule(
    input: &AutomationScheduleInput,
    count: usize,
) -> Result<Vec<NaiveDateTime>> {
    let now = Utc::now().naive_utc();
    let normalized = normalize_schedule(input, now)?;
    let (_, tz) = normalize_timezone(Some(&normalized.timezone))?;
    preview_cron_expr(&normalized.expr, tz, now, count.clamp(1, 25))
}

fn preview_cron_expr(
    five_field_expr: &str,
    tz: Tz,
    now: NaiveDateTime,
    count: usize,
) -> Result<Vec<NaiveDateTime>> {
    let schedule = parse_five_field_cron(five_field_expr)?;
    let local_now = now.and_utc().with_timezone(&tz);
    Ok(schedule
        .after(&local_now)
        .take(count)
        .map(|value| value.with_timezone(&Utc).naive_utc())
        .collect())
}

fn next_after(five_field_expr: &str, tz: Tz, now: NaiveDateTime) -> Result<Option<NaiveDateTime>> {
    Ok(preview_cron_expr(five_field_expr, tz, now, 1)?
        .into_iter()
        .next()
        .or_else(|| Some((now + Duration::hours(1)).with_second(0).unwrap_or(now))))
}

pub fn next_run_after_expr(
    five_field_expr: &str,
    timezone: Option<&str>,
    now: NaiveDateTime,
) -> Result<Option<NaiveDateTime>> {
    let (_, tz) = normalize_timezone(timezone)?;
    next_after(five_field_expr, tz, now)
}

fn parse_five_field_cron(expr: &str) -> Result<Schedule> {
    let fields: Vec<&str> = expr.split_whitespace().collect();
    if fields.len() != 5 {
        return Err(ServiceError::Validation(
            "Cron expressions must use five fields: minute hour day-of-month month day-of-week."
                .to_string(),
        ));
    }
    Schedule::from_str(&format!("0 {}", expr))
        .map_err(|error| ServiceError::Validation(format!("Invalid cron expression: {error}")))
}

fn validate_range(name: &str, value: u32, min: u32, max: u32) -> Result<()> {
    if (min..=max).contains(&value) {
        Ok(())
    } else {
        Err(ServiceError::Validation(format!(
            "{name} must be between {min} and {max}."
        )))
    }
}

fn normalize_timezone(value: Option<&str>) -> Result<(String, Tz)> {
    let timezone = value.unwrap_or("UTC").trim();
    let timezone = if timezone.is_empty() { "UTC" } else { timezone };
    let tz = timezone.parse::<Tz>().map_err(|error| {
        ServiceError::Validation(format!("Invalid schedule timezone '{timezone}': {error}"))
    })?;
    Ok((timezone.to_string(), tz))
}

#[derive(Debug, Clone)]
pub struct NormalizedSchedule {
    pub kind: AutomationScheduleKind,
    pub expr: String,
    pub timezone: String,
    pub next_run_at: Option<NaiveDateTime>,
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;

    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(hour, minute, 0)
            .unwrap()
    }

    #[test]
    fn s7_daily_schedule_returns_next_future_occurrence() {
        let schedule = AutomationScheduleInput {
            kind: AutomationScheduleKind::Daily,
            expr: None,
            timezone: Some("UTC".to_string()),
            hour: Some(9),
            minute: Some(30),
            day_of_week: None,
            day_of_month: None,
        };

        let normalized = normalize_schedule(&schedule, at(2026, 5, 26, 8, 0)).unwrap();

        assert_eq!(normalized.expr, "30 9 * * *");
        assert_eq!(normalized.next_run_at, Some(at(2026, 5, 26, 9, 30)));
    }

    #[test]
    fn s8_invalid_five_field_cron_is_rejected() {
        let schedule = AutomationScheduleInput {
            kind: AutomationScheduleKind::Cron,
            expr: Some("* * *".to_string()),
            timezone: Some("UTC".to_string()),
            hour: None,
            minute: None,
            day_of_week: None,
            day_of_month: None,
        };

        let error = normalize_schedule(&schedule, at(2026, 5, 26, 8, 0)).unwrap_err();

        assert!(error.to_string().contains("five fields"));
    }

    #[test]
    fn s21_next_run_after_expr_skips_missed_hourly_occurrences() {
        let next = next_run_after_expr("0 * * * *", Some("UTC"), at(2026, 5, 26, 10, 30)).unwrap();

        assert_eq!(next, Some(at(2026, 5, 26, 11, 0)));
    }

    #[test]
    fn s7_daily_schedule_uses_configured_timezone() {
        let schedule = AutomationScheduleInput {
            kind: AutomationScheduleKind::Daily,
            expr: None,
            timezone: Some("Asia/Shanghai".to_string()),
            hour: Some(9),
            minute: Some(30),
            day_of_week: None,
            day_of_month: None,
        };

        let normalized = normalize_schedule(&schedule, at(2026, 5, 26, 0, 0)).unwrap();

        assert_eq!(normalized.expr, "30 9 * * *");
        assert_eq!(normalized.timezone, "Asia/Shanghai");
        assert_eq!(normalized.next_run_at, Some(at(2026, 5, 26, 1, 30)));
    }
}
