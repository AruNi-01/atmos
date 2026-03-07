use reqwest::Client;
use serde::Deserialize;
use std::env;

use crate::config::{provider_config_api_key, provider_config_region};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, format_reset_relative_text, load_minimax_browser_cookie_source,
    round_metric, unix_now, BrowserCookieSource,
};

const MINIMAX_GLOBAL_URL: &str = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";
const MINIMAX_CHINA_URL: &str =
    "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains";
const MINIMAX_GLOBAL_WEB_URL: &str =
    "https://platform.minimax.io/v1/api/openplatform/coding_plan/remains";
const MINIMAX_CHINA_WEB_URL: &str =
    "https://platform.minimaxi.com/v1/api/openplatform/coding_plan/remains";

#[derive(Debug, Clone, Copy)]
enum MiniMaxRegion {
    Global,
    China,
}

impl MiniMaxRegion {
    fn label(self) -> &'static str {
        match self {
            Self::Global => "Global",
            Self::China => "China",
        }
    }

    fn url(self) -> &'static str {
        match self {
            Self::Global => MINIMAX_GLOBAL_URL,
            Self::China => MINIMAX_CHINA_URL,
        }
    }

    fn web_url(self) -> &'static str {
        match self {
            Self::Global => MINIMAX_GLOBAL_WEB_URL,
            Self::China => MINIMAX_CHINA_WEB_URL,
        }
    }
}

#[derive(Debug, Deserialize)]
struct MiniMaxPayload {
    #[serde(default, rename = "base_resp")]
    base_resp: Option<MiniMaxBaseResp>,
    #[serde(default)]
    data: Option<MiniMaxData>,
    #[serde(default, rename = "current_subscribe_title")]
    current_subscribe_title: Option<String>,
    #[serde(default, rename = "plan_name")]
    plan_name: Option<String>,
    #[serde(default, rename = "combo_title")]
    combo_title: Option<String>,
    #[serde(default, rename = "current_plan_title")]
    current_plan_title: Option<String>,
    #[serde(default, rename = "model_remains")]
    model_remains: Vec<MiniMaxModelRemain>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxData {
    #[serde(default, rename = "base_resp")]
    base_resp: Option<MiniMaxBaseResp>,
    #[serde(default, rename = "current_subscribe_title")]
    current_subscribe_title: Option<String>,
    #[serde(default, rename = "plan_name")]
    plan_name: Option<String>,
    #[serde(default, rename = "combo_title")]
    combo_title: Option<String>,
    #[serde(default, rename = "current_plan_title")]
    current_plan_title: Option<String>,
    #[serde(default, rename = "current_combo_card")]
    current_combo_card: Option<MiniMaxComboCard>,
    #[serde(default, rename = "model_remains")]
    model_remains: Vec<MiniMaxModelRemain>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxComboCard {
    #[serde(default)]
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxBaseResp {
    #[serde(default, rename = "status_code")]
    status_code: Option<i64>,
    #[serde(default, rename = "status_msg")]
    status_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxModelRemain {
    #[serde(default, rename = "current_interval_total_count")]
    current_interval_total_count: Option<i64>,
    #[serde(default, rename = "current_interval_usage_count")]
    current_interval_usage_count: Option<i64>,
    #[serde(default, rename = "start_time")]
    start_time: Option<i64>,
    #[serde(default, rename = "end_time")]
    end_time: Option<i64>,
    #[serde(default, rename = "remains_time")]
    remains_time: Option<i64>,
}

#[derive(Debug, Clone)]
struct MiniMaxSnapshot {
    region: MiniMaxRegion,
    plan_label: Option<String>,
    total_prompts: Option<i64>,
    used_prompts: Option<i64>,
    percent: Option<f64>,
    reset_at: Option<u64>,
    label: String,
}

pub(crate) async fn fetch_minimax_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let api_token = minimax_api_token();
    let browser_source = load_minimax_browser_cookie_source().ok().flatten();
    let mut snapshots = Vec::new();
    let mut warnings = Vec::new();

    for region in preferred_regions() {
        match fetch_region(client, api_token.as_deref(), browser_source.as_ref(), region).await {
            Ok(Some(snapshot)) => snapshots.push(snapshot),
            Ok(None) => {}
            Err(error) => warnings.push(format!("{}: {}", region.label(), error)),
        }
    }

    if snapshots.is_empty() {
        let message = warnings
            .into_iter()
            .next()
            .unwrap_or_else(|| "MiniMax coding-plan endpoints returned no data".to_string());
        return Err(ProviderError::Fetch(message));
    }

    let primary = snapshots
        .iter()
        .find(|snapshot| matches!(snapshot.region, MiniMaxRegion::Global))
        .or_else(|| snapshots.first())
        .cloned()
        .ok_or_else(|| ProviderError::Fetch("MiniMax coding-plan endpoints returned no data".to_string()))?;

    let plan_label = snapshots
        .iter()
        .find_map(|snapshot| snapshot.plan_label.clone());

    let rows = snapshots
        .iter()
        .map(|snapshot| DetailRow {
            label: snapshot.label.clone(),
            value: minimax_row_value(snapshot),
            tone: RowTone::Default,
        })
        .collect::<Vec<_>>();

    Ok(LiveFetchResult {
        plan_label,
        usage_summary: Some(build_percent_usage_summary(primary.percent)),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Account".to_string(),
                        value: "MiniMax".to_string(),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: primary
                            .plan_label
                            .clone()
                            .unwrap_or_else(|| "MiniMax".to_string()),
                        tone: RowTone::Default,
                    },
                ],
            },
            DetailSection {
                title: "Usage".to_string(),
                rows,
            },
        ],
        warnings,
        fetch_message: format!(
            "MiniMax coding-plan via {}",
            snapshots
                .iter()
                .map(|snapshot| snapshot.label.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ),
        reset_at: primary.reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

fn minimax_api_token() -> Option<String> {
    clean_env_value(env::var("MINIMAX_API_KEY").ok())
        .or_else(|| provider_config_api_key("minimax"))
}

async fn fetch_region(
    client: &Client,
    api_token: Option<&str>,
    browser_source: Option<&BrowserCookieSource>,
    region: MiniMaxRegion,
) -> Result<Option<MiniMaxSnapshot>, ProviderError> {
    let response = if let Some(api_token) = api_token {
        client
            .get(region.url())
            .bearer_auth(api_token)
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .header("MM-API-Source", "Atmos")
            .send()
            .await
            .map_err(|error| ProviderError::Fetch(error.to_string()))?
    } else if let Some(browser_source) = browser_source {
        client
            .get(region.web_url())
            .header("accept", "application/json, text/plain, */*")
            .header("content-type", "application/json")
            .header("x-requested-with", "XMLHttpRequest")
            .header("cookie", &browser_source.cookie_header)
            .header("origin", region.origin())
            .header("referer", region.referer())
            .send()
            .await
            .map_err(|error| ProviderError::Fetch(error.to_string()))?
    } else {
        return Err(ProviderError::Fetch(
            "MiniMax API token not found and no browser session detected".to_string(),
        ));
    };

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ProviderError::Fetch(error.to_string()))?;

    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403 | 404) {
            return Err(ProviderError::Fetch(format!("HTTP {}", status.as_u16())));
        }
        return Err(ProviderError::Fetch(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_body(&body)
        )));
    }

    let payload = serde_json::from_str::<MiniMaxPayload>(&body)
        .map_err(|error| ProviderError::Fetch(format!("Invalid MiniMax payload: {error}")))?;

    let base_resp = payload
        .data
        .as_ref()
        .and_then(|data| data.base_resp.as_ref())
        .or(payload.base_resp.as_ref());

    if let Some(base_resp) = base_resp {
        if base_resp.status_code.unwrap_or_default() != 0 {
            let message = base_resp
                .status_msg
                .clone()
                .unwrap_or_else(|| format!("status_code {}", base_resp.status_code.unwrap_or_default()));
            return Err(ProviderError::Fetch(message));
        }
    }

    let plan_label = minimax_plan_label(&payload);
    let remain = payload
        .data
        .as_ref()
        .and_then(|data| data.model_remains.first())
        .or(payload.model_remains.first());
    let Some(remain) = remain else {
        return Ok(None);
    };

    let total = remain.current_interval_total_count;
    let remaining = remain.current_interval_usage_count;
    let used_prompts = match (total, remaining) {
        (Some(total), Some(remaining)) => Some((total - remaining).max(0)),
        _ => None,
    };
    let percent = match (total, remaining) {
        (Some(total), Some(remaining)) if total > 0 => {
            Some(round_metric(((total - remaining).max(0) as f64 / total as f64) * 100.0))
        }
        _ => None,
    };
    let reset_at = date_from_epoch(remain.end_time).or_else(|| {
        remain.remains_time.map(|value| {
            let seconds = if value > 1_000_000 { value / 1000 } else { value };
            unix_now().saturating_add(seconds.max(0) as u64)
        })
    });

    Ok(Some(MiniMaxSnapshot {
        region,
        plan_label,
        total_prompts: total,
        used_prompts,
        percent,
        reset_at,
        label: region.label().to_string(),
    }))
}

impl MiniMaxRegion {
    fn origin(self) -> &'static str {
        match self {
            Self::Global => "https://platform.minimax.io",
            Self::China => "https://platform.minimaxi.com",
        }
    }

    fn referer(self) -> &'static str {
        match self {
            Self::Global => "https://platform.minimax.io/user-center/payment/coding-plan",
            Self::China => "https://platform.minimaxi.com/user-center/payment/coding-plan",
        }
    }
}

fn preferred_regions() -> Vec<MiniMaxRegion> {
    match provider_config_region("minimax").as_deref() {
        Some("global") => vec![MiniMaxRegion::Global],
        Some("china") => vec![MiniMaxRegion::China],
        _ => vec![MiniMaxRegion::Global, MiniMaxRegion::China],
    }
}

fn minimax_row_value(snapshot: &MiniMaxSnapshot) -> String {
    let mut parts = Vec::new();
    if let Some(percent) = snapshot.percent {
        if let (Some(used), Some(total)) = (snapshot.used_prompts, snapshot.total_prompts) {
            parts.push(format!(
                "{}% used ({} / {} prompts)",
                round_metric(percent),
                used,
                total
            ));
        } else {
            parts.push(format!("{}% used", round_metric(percent)));
        }
    }

    if let Some(reset_at) = snapshot.reset_at {
        parts.push(format_reset_relative_text(Some(reset_at)));
    }

    if parts.is_empty() {
        "No coding-plan data".to_string()
    } else {
        parts.join(" · ")
    }
}

fn minimax_plan_label(payload: &MiniMaxPayload) -> Option<String> {
    let data = payload.data.as_ref();
    [
        data.and_then(|value| value.current_subscribe_title.as_deref()),
        data.and_then(|value| value.plan_name.as_deref()),
        data.and_then(|value| value.combo_title.as_deref()),
        data.and_then(|value| value.current_plan_title.as_deref()),
        data.and_then(|value| value.current_combo_card.as_ref()?.title.as_deref()),
        payload.current_subscribe_title.as_deref(),
        payload.plan_name.as_deref(),
        payload.combo_title.as_deref(),
        payload.current_plan_title.as_deref(),
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

fn date_from_epoch(value: Option<i64>) -> Option<u64> {
    let raw = value?;
    if raw > 1_000_000_000_000 {
        Some((raw / 1000) as u64)
    } else if raw > 1_000_000_000 {
        Some(raw as u64)
    } else {
        None
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
