use reqwest::Client;
use std::env;

use crate::constants::{
    OPENCODE_SERVER_URL, OPENCODE_SUBSCRIPTION_SERVER_ID, OPENCODE_WORKSPACES_SERVER_ID,
};
use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, extract_first_capture_f64, extract_first_capture_string,
    extract_first_capture_u64, format_reset_relative_text, load_cookie_header, round_metric,
    unix_now,
};

pub(crate) async fn fetch_opencode_live(client: &Client) -> Result<LiveFetchResult, ProviderError> {
    let cookie_header = load_cookie_header(
        &[
            "ATMOS_USAGE_OPENCODE_COOKIE_HEADER",
            "OPENCODE_COOKIE_HEADER",
            "OPENCODE_AUTH_COOKIE",
        ],
        Some("opencode"),
    )?
    .ok_or_else(|| ProviderError::Fetch("OpenCode auth cookie not found".to_string()))?;
    let workspace_id = load_opencode_workspace_id(client, &cookie_header).await?;
    let payload = load_opencode_subscription_payload(client, &cookie_header, &workspace_id).await?;

    let session_percent = extract_first_capture_f64(
        &payload,
        r#"rollingUsage[^}]*?usagePercent\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)"#,
    )
    .ok_or_else(|| ProviderError::Fetch("OpenCode rolling usage missing".to_string()))?;
    let session_reset = extract_first_capture_u64(
        &payload,
        r#"rollingUsage[^}]*?resetInSec\s*[:=]\s*([0-9]+)"#,
    )
    .map(|seconds| unix_now().saturating_add(seconds));
    let weekly_percent = extract_first_capture_f64(
        &payload,
        r#"weeklyUsage[^}]*?usagePercent\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)"#,
    )
    .ok_or_else(|| ProviderError::Fetch("OpenCode weekly usage missing".to_string()))?;
    let weekly_reset =
        extract_first_capture_u64(&payload, r#"weeklyUsage[^}]*?resetInSec\s*[:=]\s*([0-9]+)"#)
            .map(|seconds| unix_now().saturating_add(seconds));

    Ok(LiveFetchResult {
        plan_label: Some("OpenCode".to_string()),
        usage_summary: Some(build_percent_usage_summary(Some(session_percent))),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Account".to_string(),
                        value: workspace_id.clone(),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: "OpenCode".to_string(),
                        tone: RowTone::Default,
                    },
                ],
            },
            DetailSection {
                title: "Usage".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Session".to_string(),
                        value: format!(
                            "{}% used · {}",
                            round_metric(session_percent),
                            format_reset_relative_text(session_reset)
                        ),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Weekly".to_string(),
                        value: format!(
                            "{}% used · {}",
                            round_metric(weekly_percent),
                            format_reset_relative_text(weekly_reset)
                        ),
                        tone: RowTone::Default,
                    },
                ],
            },
        ],
        warnings: vec![],
        fetch_message: "OpenCode _server usage".to_string(),
        reset_at: session_reset.or(weekly_reset),
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}

async fn load_opencode_workspace_id(
    client: &Client,
    cookie_header: &str,
) -> Result<String, ProviderError> {
    if let Some(value) = env::var("ATMOS_USAGE_OPENCODE_WORKSPACE_ID")
        .ok()
        .or_else(|| env::var("CODEXBAR_OPENCODE_WORKSPACE_ID").ok())
        .filter(|value| !value.trim().is_empty())
    {
        if let Some(id) = normalize_opencode_workspace_id(&value) {
            return Ok(id);
        }
    }

    let url = format!("{OPENCODE_SERVER_URL}?id={OPENCODE_WORKSPACES_SERVER_ID}");
    let response = client
        .get(&url)
        .header("Cookie", cookie_header)
        .header("X-Server-Id", OPENCODE_WORKSPACES_SERVER_ID)
        .header("X-Server-Instance", format!("server-fn:{}", unix_now()))
        .header("Origin", "https://opencode.ai")
        .header("Referer", "https://opencode.ai")
        .send()
        .await
        .map_err(|error| {
            ProviderError::Fetch(format!("OpenCode workspaces request failed: {error}"))
        })?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "OpenCode workspaces returned {}",
            response.status()
        )));
    }
    let text = response.text().await.map_err(|error| {
        ProviderError::Fetch(format!("OpenCode workspaces decode failed: {error}"))
    })?;
    extract_first_capture_string(&text, r#"(wrk_[A-Za-z0-9]+)"#)
        .ok_or_else(|| ProviderError::Fetch("OpenCode workspace id missing".to_string()))
}

fn normalize_opencode_workspace_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with("wrk_") {
        return Some(trimmed.to_string());
    }
    extract_first_capture_string(trimmed, r#"(wrk_[A-Za-z0-9]+)"#)
}

async fn load_opencode_subscription_payload(
    client: &Client,
    cookie_header: &str,
    workspace_id: &str,
) -> Result<String, ProviderError> {
    let url = format!(
        "{OPENCODE_SERVER_URL}?id={OPENCODE_SUBSCRIPTION_SERVER_ID}&args=%5B%22{workspace_id}%22%5D"
    );
    let response = client
        .get(&url)
        .header("Cookie", cookie_header)
        .header("X-Server-Id", OPENCODE_SUBSCRIPTION_SERVER_ID)
        .header("X-Server-Instance", format!("server-fn:{}", unix_now()))
        .header("Origin", "https://opencode.ai")
        .header(
            "Referer",
            format!("https://opencode.ai/workspace/{workspace_id}/billing"),
        )
        .send()
        .await
        .map_err(|error| {
            ProviderError::Fetch(format!("OpenCode subscription request failed: {error}"))
        })?;

    if !response.status().is_success() {
        return Err(ProviderError::Fetch(format!(
            "OpenCode subscription returned {}",
            response.status()
        )));
    }
    response.text().await.map_err(|error| {
        ProviderError::Fetch(format!("OpenCode subscription decode failed: {error}"))
    })
}
