use reqwest::Client;
use serde::Deserialize;
use std::env;

use crate::config::{provider_config_api_keys, provider_config_region, update_provider_api_key_region};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_reset_relative_text, load_zai_browser_cookie_source,
    round_metric, unix_now, BrowserCookieSource,
};

const ZAI_GLOBAL_URL: &str = "https://api.z.ai/api/monitor/usage/quota/limit";
const ZAI_CHINA_URL: &str = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";

#[derive(Debug, Clone, Copy)]
enum ZaiRegion {
    Global,
    China,
}

impl ZaiRegion {
    fn label(self) -> &'static str {
        match self {
            Self::Global => "Global",
            Self::China => "China",
        }
    }

    fn url(self) -> &'static str {
        match self {
            Self::Global => ZAI_GLOBAL_URL,
            Self::China => ZAI_CHINA_URL,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ZaiResponse {
    #[serde(default)]
    code: Option<i64>,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    data: Option<ZaiData>,
}

#[derive(Debug, Deserialize)]
struct ZaiData {
    #[serde(default)]
    limits: Vec<ZaiLimitRaw>,
    #[serde(default)]
    level: Option<String>,
    #[serde(default, rename = "planName")]
    plan_name: Option<String>,
    #[serde(default)]
    plan: Option<String>,
    #[serde(default, rename = "plan_type")]
    plan_type: Option<String>,
    #[serde(default, rename = "packageName")]
    package_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ZaiLimitRaw {
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    unit: Option<i64>,
    #[serde(default)]
    number: Option<i64>,
    #[serde(default)]
    usage: Option<f64>,
    #[serde(default, rename = "currentValue")]
    current_value: Option<f64>,
    #[serde(default)]
    remaining: Option<f64>,
    #[serde(default)]
    percentage: Option<f64>,
    #[serde(default, rename = "nextResetTime")]
    next_reset_time: Option<i64>,
    #[serde(default, rename = "usageDetails")]
    usage_details: Vec<ZaiUsageDetail>,
}

#[derive(Debug, Deserialize, Clone)]
struct ZaiUsageDetail {
    #[serde(default, rename = "modelCode")]
    model_code: Option<String>,
    #[serde(default)]
    usage: Option<i64>,
}

#[derive(Debug, Clone)]
struct ZaiSnapshot {
    region: ZaiRegion,
    plan_label: Option<String>,
    level: Option<String>,
    percent: Option<f64>,
    usage_rows: Vec<DetailRow>,
    extra_sections: Vec<DetailSection>,
    reset_at: Option<u64>,
}

pub(crate) async fn fetch_zai_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let browser_source = load_zai_browser_cookie_source().ok().flatten();
    let mut snapshots = Vec::new();
    let mut warnings = Vec::new();

    // Collect all configured API keys (env vars take priority as a single key)
    let env_key = ["Z_AI_API_KEY", "ZHIPU_API_KEY", "ZAI_API_KEY"]
        .into_iter()
        .find_map(|key| clean_env_value(env::var(key).ok()));

    if let Some(api_key) = env_key {
        // Env var path: use the global preferred-regions logic (single key)
        let regions = preferred_regions();
        let auto_detect = regions.len() > 1;
        for region in regions {
            match fetch_region(client, Some(&api_key), browser_source.as_ref(), region).await {
                Ok(Some(snapshot)) => {
                    snapshots.push(snapshot);
                    if auto_detect {
                        break;
                    }
                }
                Ok(None) => {}
                Err(error) => warnings.push(format!("{}: {}", region.label(), error)),
            }
        }
    } else {
        // Config-file path: iterate over all named keys
        let config_keys = provider_config_api_keys("zai");
        for named_key in &config_keys {
            let key_regions = regions_for_key(named_key.region.as_deref());
            let auto_detect = key_regions.len() > 1;
            for region in key_regions {
                match fetch_region(client, Some(&named_key.api_key), browser_source.as_ref(), region).await {
                    Ok(Some(snapshot)) => {
                        if auto_detect {
                            // Write back the detected region so "auto" is resolved once
                            update_provider_api_key_region("zai", &named_key.id, region.label().to_lowercase().as_str());
                        }
                        snapshots.push(snapshot);
                        if auto_detect {
                            break;
                        }
                    }
                    Ok(None) => {}
                    Err(error) => warnings.push(format!("{}: {}", region.label(), error)),
                }
            }
        }
        // Browser-only fallback if no config keys
        if config_keys.is_empty() {
            let regions = preferred_regions();
            let auto_detect = regions.len() > 1;
            for region in regions {
                match fetch_region(client, None, browser_source.as_ref(), region).await {
                    Ok(Some(snapshot)) => {
                        snapshots.push(snapshot);
                        if auto_detect {
                            break;
                        }
                    }
                    Ok(None) => {}
                    Err(error) => warnings.push(format!("{}: {}", region.label(), error)),
                }
            }
        }
    }

    if snapshots.is_empty() {
        let message = warnings
            .into_iter()
            .next()
            .unwrap_or_else(|| "Zhipu quota endpoints returned no data".to_string());
        return Err(ProviderError::Fetch(message));
    }

    let primary = snapshots
        .iter()
        .find(|snapshot| matches!(snapshot.region, ZaiRegion::Global))
        .or_else(|| snapshots.first())
        .cloned()
        .ok_or_else(|| {
            ProviderError::Fetch("Zhipu quota endpoints returned no data".to_string())
        })?;

    let plan_label = snapshots
        .iter()
        .find_map(|snapshot| snapshot.plan_label.clone());

    let usage_rows = snapshots
        .iter()
        .flat_map(|snapshot| snapshot.usage_rows.clone())
        .collect::<Vec<_>>();
    let extra_sections = snapshots
        .iter()
        .flat_map(|snapshot| snapshot.extra_sections.clone())
        .collect::<Vec<_>>();
    let level_label = snapshots.iter().find_map(|snapshot| snapshot.level.clone());

    Ok(LiveFetchResult {
        plan_label,
        usage_summary: Some(build_percent_usage_summary(primary.percent)),
        detail_sections: {
            let mut sections = vec![
                DetailSection {
                    title: "Account".to_string(),
                    rows: vec![
                        DetailRow {
                            label: "Account".to_string(),
                            value: "Zhipu AI".to_string(),
                            tone: RowTone::Default,
                        },
                        DetailRow {
                            label: "Plan".to_string(),
                            value: primary
                                .plan_label
                                .clone()
                                .unwrap_or_else(|| "Zhipu AI".to_string()),
                            tone: RowTone::Default,
                        },
                        DetailRow {
                            label: "Level".to_string(),
                            value: level_label.unwrap_or_else(|| "Unknown".to_string()),
                            tone: RowTone::Default,
                        },
                    ],
                },
                DetailSection {
                    title: "Usage".to_string(),
                    rows: usage_rows,
                },
            ];
            sections.extend(extra_sections);
            sections
        },
        warnings,
        fetch_message: format!(
            "Zhipu quota via {}",
            snapshots
                .iter()
                .map(|snapshot| snapshot.region.label())
                .collect::<Vec<_>>()
                .join(", ")
        ),
        reset_at: primary.reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

fn regions_for_key(region: Option<&str>) -> Vec<ZaiRegion> {
    match region {
        Some("global") => vec![ZaiRegion::Global],
        Some("china") => vec![ZaiRegion::China],
        _ => vec![ZaiRegion::Global, ZaiRegion::China],
    }
}

async fn fetch_region(
    client: &Client,
    api_key: Option<&str>,
    browser_source: Option<&BrowserCookieSource>,
    region: ZaiRegion,
) -> Result<Option<ZaiSnapshot>, ProviderError> {
    let response = if let Some(api_key) = api_key {
        client
            .get(region.url())
            .bearer_auth(api_key)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|error| ProviderError::Fetch(error.to_string()))?
    } else if let Some(browser_source) = browser_source {
        client
            .get(region.url())
            .header("accept", "application/json")
            .header("cookie", &browser_source.cookie_header)
            .send()
            .await
            .map_err(|error| ProviderError::Fetch(error.to_string()))?
    } else {
        return Err(ProviderError::Fetch(
            "Zhipu API key not found and no browser session detected".to_string(),
        ));
    };

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    if !status.is_success() {
        return Err(ProviderError::Fetch(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_body(&body)
        )));
    }

    if body.trim().is_empty() {
        return Err(ProviderError::Fetch("Empty response body".to_string()));
    }

    let payload = serde_json::from_str::<ZaiResponse>(&body)
        .map_err(|error| ProviderError::Fetch(format!("Invalid Zhipu payload: {error}")))?;

    if payload.success != Some(true) || payload.code.unwrap_or_default() != 200 {
        return Err(ProviderError::Fetch(
            payload
                .msg
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "Zhipu API error".to_string()),
        ));
    }

    let data = payload
        .data
        .ok_or_else(|| ProviderError::Fetch("Zhipu payload missing data".to_string()))?;

    let token_limit = data
        .limits
        .iter()
        .find(|limit| limit.r#type.as_deref() == Some("TOKENS_LIMIT"));
    let time_limit = data
        .limits
        .iter()
        .find(|limit| limit.r#type.as_deref() == Some("TIME_LIMIT"));

    let selected = token_limit.or(time_limit);
    let Some(selected) = selected else {
        return Ok(None);
    };
    Ok(Some(ZaiSnapshot {
        region,
        plan_label: first_plan_label(&data),
        level: data.level.clone().and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        percent: zai_used_percent(selected),
        usage_rows: build_usage_rows(region, token_limit, time_limit),
        extra_sections: build_extra_sections(region, time_limit),
        reset_at: selected.next_reset_time.map(normalize_epoch_secs),
    }))
}

fn preferred_regions() -> Vec<ZaiRegion> {
    match provider_config_region("zai").as_deref() {
        Some("global") => vec![ZaiRegion::Global],
        Some("china") => vec![ZaiRegion::China],
        _ => vec![ZaiRegion::Global, ZaiRegion::China],
    }
}

fn zai_used_percent(limit: &ZaiLimitRaw) -> Option<f64> {
    if let Some(usage) = limit.usage.filter(|value| *value > 0.0) {
        let used = zai_used_value(limit)?;
        return Some(round_metric((used / usage) * 100.0));
    }
    limit.percentage.map(round_metric)
}

fn zai_used_value(limit: &ZaiLimitRaw) -> Option<f64> {
    match (limit.usage, limit.current_value, limit.remaining) {
        (Some(usage), Some(current_value), Some(remaining)) if usage > 0.0 => {
            Some((usage - remaining).max(current_value).clamp(0.0, usage))
        }
        (Some(usage), Some(current_value), None) if usage > 0.0 => {
            Some(current_value.clamp(0.0, usage))
        }
        (Some(usage), None, Some(remaining)) if usage > 0.0 => {
            Some((usage - remaining).clamp(0.0, usage))
        }
        _ => None,
    }
}

fn build_usage_rows(
    region: ZaiRegion,
    token_limit: Option<&ZaiLimitRaw>,
    time_limit: Option<&ZaiLimitRaw>,
) -> Vec<DetailRow> {
    let mut rows = Vec::new();

    if let Some(limit) = token_limit {
        rows.push(DetailRow {
            label: prefix_region_label(region, "Tokens"),
            value: zai_limit_row_value(limit, true),
            tone: RowTone::Default,
        });
    }

    if let Some(limit) = time_limit {
        rows.push(DetailRow {
            label: prefix_region_label(region, "MCP"),
            value: zai_limit_row_value(limit, false),
            tone: RowTone::Default,
        });
    }

    rows
}

fn build_extra_sections(region: ZaiRegion, time_limit: Option<&ZaiLimitRaw>) -> Vec<DetailSection> {
    let Some(limit) = time_limit else {
        return Vec::new();
    };
    if limit.usage_details.is_empty() {
        return Vec::new();
    }
    let mut rows = Vec::new();
    if let (Some(current), Some(cap)) = (limit.current_value, limit.usage) {
        rows.push(DetailRow {
            label: "Total".to_string(),
            value: format!("{:.0} / {:.0}", round_metric(current), round_metric(cap)),
            tone: RowTone::Default,
        });
    }
    rows.extend(limit.usage_details.iter().map(|detail| {
        DetailRow {
            label: detail
                .model_code
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            value: detail
                .usage
                .map(|value| value.to_string())
                .unwrap_or_else(|| "0".to_string()),
            tone: RowTone::Default,
        }
    }));

    vec![DetailSection {
        title: prefix_region_label(region, "MCP details"),
        rows,
    }]
}

fn zai_limit_row_value(limit: &ZaiLimitRaw, show_window: bool) -> String {
    let mut parts = Vec::new();
    if let Some(percent) = zai_used_percent(limit) {
        if let (Some(used), Some(cap)) = (zai_used_value(limit), limit.usage) {
            let value = match limit.r#type.as_deref() {
                Some("TOKENS_LIMIT") => format!(
                    "{}% used ({:.0} / {:.0} tokens)",
                    round_metric(percent),
                    round_metric(used),
                    round_metric(cap)
                ),
                Some("TIME_LIMIT") => format!(
                    "{}% used ({:.0} / {:.0})",
                    round_metric(percent),
                    round_metric(used),
                    round_metric(cap)
                ),
                _ => format!("{}% used", round_metric(percent)),
            };
            parts.push(value);
        } else {
            parts.push(format!("{}% used", round_metric(percent)));
        }
    }

    if show_window {
        if let Some(window_label) = zai_window_label(limit) {
            parts.push(window_label);
        }
    }

    if let Some(reset_at) = limit.next_reset_time.map(normalize_epoch_secs) {
        parts.push(format_reset_relative_text(Some(reset_at)));
    }

    if parts.is_empty() {
        "No quota data".to_string()
    } else {
        parts.join(" · ")
    }
}

fn zai_window_label(limit: &ZaiLimitRaw) -> Option<String> {
    let number = limit.number?;
    let unit = match limit.unit.unwrap_or_default() {
        1 => "days",
        3 => "hours",
        5 => "months",
        _ => return None,
    };
    Some(format!("{number} {unit} window"))
}

fn prefix_region_label(region: ZaiRegion, label: &str) -> String {
    match region {
        ZaiRegion::Global => format!("Global {label}"),
        ZaiRegion::China => label.to_string(),
    }
}

fn first_plan_label(data: &ZaiData) -> Option<String> {
    [
        data.plan_name.as_deref(),
        data.plan.as_deref(),
        data.plan_type.as_deref(),
        data.package_name.as_deref(),
    ]
    .into_iter()
    .flatten()
    .find_map(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn clean_env_value(raw: Option<String>) -> Option<String> {
    let mut value = raw?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    if (value.starts_with('"') && value.ends_with('"'))
        || (value.starts_with('\'') && value.ends_with('\''))
    {
        value.remove(0);
        value.pop();
    }
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn normalize_epoch_secs(value: i64) -> u64 {
    if value > 1_000_000_000_000 {
        (value / 1000) as u64
    } else {
        value as u64
    }
}

fn truncate_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= 180 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..180])
    }
}
