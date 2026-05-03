use base64::Engine;
use serde_json::Value;
use time::format_description::well_known::Rfc3339;
use time::{Date, OffsetDateTime};

use crate::models::UsageSummary;
use crate::support::unix_now;

pub(crate) fn extract_named_object(text: &str, tokens: &[&str]) -> Option<String> {
    for token in tokens {
        let Some(token_index) = text.find(token) else {
            continue;
        };
        let Some(brace_index) = text[token_index..].find('{') else {
            continue;
        };
        let start = token_index + brace_index;
        let mut depth = 0_i32;
        let mut in_string = false;
        let mut escaped = false;
        for (offset, ch) in text[start..].char_indices() {
            if in_string {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
                continue;
            }
            match ch {
                '"' => in_string = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(text[start..start + offset + 1].to_string());
                    }
                }
                _ => {}
            }
        }
    }
    None
}

pub(crate) fn extract_object_number(object: &str, key: &str) -> Option<f64> {
    extract_first_capture_f64(
        object,
        &format!(r#"\b{}\b\s*:\s*([0-9]+(?:\.[0-9]+)?)"#, regex::escape(key)),
    )
}

pub(crate) fn extract_first_capture_f64(text: &str, pattern: &str) -> Option<f64> {
    let regex = regex::Regex::new(pattern).ok()?;
    regex
        .captures(text)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse::<f64>().ok())
}

pub(crate) fn extract_first_capture_u64(text: &str, pattern: &str) -> Option<u64> {
    let regex = regex::Regex::new(pattern).ok()?;
    regex
        .captures(text)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse::<u64>().ok())
}

pub(crate) fn extract_first_capture_string(text: &str, pattern: &str) -> Option<String> {
    let regex = regex::Regex::new(pattern).ok()?;
    regex
        .captures(text)
        .and_then(|captures| captures.get(1).or_else(|| captures.get(0)))
        .map(|value| value.as_str().to_string())
}

pub(crate) fn extract_flag_value(command: &str, flag: &str) -> Option<String> {
    let regex =
        regex::Regex::new(&format!(r#"{}\s*[=\s]\s*([^\s]+)"#, regex::escape(flag))).ok()?;
    regex
        .captures(command)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

pub(crate) fn decode_jwt_payload(token: &str) -> Option<Value> {
    let mut segments = token.split('.');
    let _header = segments.next()?;
    let payload = segments.next()?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    serde_json::from_slice(&decoded).ok()
}

pub(crate) fn epoch_millis_to_secs(value: i64) -> u64 {
    if value > 1_000_000_000_000 {
        (value / 1000) as u64
    } else {
        value as u64
    }
}

pub(crate) fn read_u64(value: Option<&Value>) -> u64 {
    match value {
        Some(Value::Number(number)) => number.as_u64().unwrap_or_default(),
        Some(Value::String(text)) => text.parse::<u64>().unwrap_or_default(),
        _ => 0,
    }
}

pub(crate) fn round_metric(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

pub(crate) fn normalize_fraction_percent(value: f64) -> f64 {
    if value <= 1.0 {
        round_metric(value * 100.0)
    } else {
        round_metric(value)
    }
}

/// Convert a fractional ratio (e.g. 0.5 or 1.0042) into a percent value
/// (e.g. 50.0 or 100.42). Use this when the source API is documented to
/// always return a 0..=1+ fraction (where >1 indicates an overage), so we
/// never confuse a small overage like 1.0042 with an already-percent value.
pub(crate) fn fraction_to_percent(value: f64) -> f64 {
    round_metric(value * 100.0)
}

pub(crate) fn build_percent_usage_summary(percent: Option<f64>) -> UsageSummary {
    let percent = percent.map(round_metric);
    UsageSummary {
        unit: Some("percent".to_string()),
        currency: None,
        used: percent,
        remaining: percent.map(|value| round_metric((100.0 - value).max(0.0))),
        cap: Some(100.0),
        percent,
        used_label: percent.map(|value| format!("{value:.0}% used")),
        remaining_label: percent.map(|value| format!("{:.0}% left", (100.0 - value).max(0.0))),
        cap_label: Some("100%".to_string()),
    }
}

pub(crate) fn parse_i64_string(text: &str) -> Option<i64> {
    let filtered = text
        .chars()
        .filter(|char| char.is_ascii_digit() || matches!(char, '-' | '.'))
        .collect::<String>();
    if filtered.is_empty() {
        return None;
    }

    filtered.parse::<i64>().ok().or_else(|| {
        filtered
            .parse::<f64>()
            .ok()
            .map(|value| value.round() as i64)
    })
}

pub(crate) fn parse_offset_datetime(text: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(text, &Rfc3339).ok()
}

pub(crate) fn format_reset_relative_text(reset_at: Option<u64>) -> String {
    let Some(reset_at) = reset_at else {
        return "Reset unknown".to_string();
    };
    if reset_at <= unix_now() {
        return "Resetting now".to_string();
    }

    let remaining = reset_at.saturating_sub(unix_now());
    let days = remaining / 86_400;
    let hours = (remaining % 86_400) / 3_600;
    let minutes = (remaining % 3_600) / 60;

    if days > 0 {
        format!("Resets in {days}d {hours}h")
    } else if hours > 0 {
        format!("Resets in {hours}h {minutes}m")
    } else {
        format!("Resets in {minutes}m")
    }
}

pub(crate) fn format_day_key(day: Date) -> String {
    format!(
        "{:04}-{:02}-{:02}",
        day.year(),
        day.month() as u8,
        day.day()
    )
}

pub(crate) fn day_from_filename(filename: &str) -> Option<Date> {
    let bytes = filename.as_bytes();
    for index in 0..bytes.len().saturating_sub(9) {
        let slice = &filename[index..index + 10];
        let chars = slice.as_bytes();
        if chars[4] != b'-' || chars[7] != b'-' {
            continue;
        }
        let year = slice[0..4].parse::<i32>().ok()?;
        let month = slice[5..7].parse::<u8>().ok()?;
        let day = slice[8..10].parse::<u8>().ok()?;
        if let Ok(month) = time::Month::try_from(month) {
            if let Ok(date) = Date::from_calendar_date(year, month, day) {
                return Some(date);
            }
        }
    }
    None
}

pub(crate) fn normalize_codex_model(model: &str) -> String {
    let trimmed = model.trim().to_lowercase();
    match trimmed.as_str() {
        "gpt-5-codex" => "gpt-5".to_string(),
        "gpt-5-thinking" => "gpt-5".to_string(),
        _ => trimmed,
    }
}

pub(crate) fn format_tokens(value: u64) -> String {
    if value >= 1_000_000 {
        format!("{:.1}M tokens", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{:.1}K tokens", value as f64 / 1_000.0)
    } else {
        format!("{value} tokens")
    }
}

pub(crate) fn format_reset_at(value: u64) -> String {
    let date = OffsetDateTime::from_unix_timestamp(value as i64)
        .ok()
        .and_then(|value| value.format(&Rfc3339).ok())
        .unwrap_or_else(|| value.to_string());
    format!("Resets at {date}")
}

pub(crate) fn map_claude_rate_limit_tier(raw: String) -> String {
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
