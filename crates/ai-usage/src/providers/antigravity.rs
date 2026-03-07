use reqwest::Client;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

use crate::models::{DetailRow, DetailSection, ProviderError, RowTone};
use crate::runtime::LiveFetchResult;
use crate::support::{
    build_percent_usage_summary, extract_flag_value, format_reset_relative_text,
    parse_offset_datetime, round_metric, run_command, unix_now,
};

#[derive(Debug, Clone)]
struct AntigravityProcess {
    pid: i32,
    extension_port: Option<u16>,
    csrf_token: String,
}

#[derive(Debug, Clone)]
struct AntigravityModel {
    label: String,
    used_percent: f64,
    reset_at: Option<u64>,
}

#[derive(Debug, Clone)]
struct AntigravityPool {
    label: String,
    used_percent: f64,
    reset_at: Option<u64>,
}

fn detect_antigravity_process() -> Result<AntigravityProcess, ProviderError> {
    let output = run_command("/bin/ps", &["-ax", "-o", "pid=,command="])?;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.splitn(2, ' ');
        let pid = parts
            .next()
            .and_then(|value| value.trim().parse::<i32>().ok());
        let command = parts.next().map(str::trim).unwrap_or_default();
        let lower = command.to_lowercase();
        if !lower.contains("language_server_macos") {
            continue;
        }
        if !(lower.contains("--app_data_dir") && lower.contains("antigravity")
            || lower.contains("/antigravity/")
            || lower.contains("\\antigravity\\"))
        {
            continue;
        }
        let csrf_token = extract_flag_value(command, "--csrf_token")
            .ok_or_else(|| ProviderError::Fetch("Antigravity CSRF token not found".to_string()))?;
        let extension_port = extract_flag_value(command, "--extension_server_port")
            .and_then(|value| value.parse().ok());
        return Ok(AntigravityProcess {
            pid: pid.unwrap_or_default(),
            extension_port,
            csrf_token,
        });
    }
    Err(ProviderError::Fetch(
        "Antigravity language server not detected".to_string(),
    ))
}

fn antigravity_listening_ports(pid: i32) -> Result<Vec<u16>, ProviderError> {
    let lsof = ["/usr/sbin/lsof", "/usr/bin/lsof"]
        .into_iter()
        .find(|path| Path::new(path).exists())
        .ok_or_else(|| ProviderError::Fetch("lsof is required for Antigravity".to_string()))?;
    let output = run_command(
        lsof,
        &["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", &pid.to_string()],
    )?;
    let regex = regex::Regex::new(r#":(\d+)\s+\(LISTEN\)"#).map_err(|error| {
        ProviderError::Fetch(format!("Invalid Antigravity port regex: {error}"))
    })?;
    let mut ports = regex
        .captures_iter(&output)
        .filter_map(|captures| captures.get(1))
        .filter_map(|value| value.as_str().parse::<u16>().ok())
        .collect::<Vec<_>>();
    ports.sort_unstable();
    ports.dedup();
    if ports.is_empty() {
        return Err(ProviderError::Fetch(
            "Antigravity listening ports not found".to_string(),
        ));
    }
    Ok(ports)
}

async fn antigravity_probe_port(port: u16, csrf_token: &str) -> bool {
    let client = match Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };
    client
        .post(format!(
            "https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUnleashData"
        ))
        .header("X-Codeium-Csrf-Token", csrf_token)
        .header("Connect-Protocol-Version", "1")
        .json(&serde_json::json!({
            "context": {
                "properties": {
                    "ide": "antigravity",
                }
            }
        }))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn antigravity_fetch_status(
    https_port: u16,
    http_port: Option<u16>,
    csrf_token: &str,
) -> Result<Value, ProviderError> {
    let client = Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| {
            ProviderError::Fetch(format!("Antigravity client init failed: {error}"))
        })?;

    let body = serde_json::json!({
        "metadata": {
            "ideName": "antigravity",
            "extensionName": "antigravity",
            "ideVersion": "unknown",
            "locale": "en",
        }
    });

    for (scheme, port, path) in [
        (
            "https",
            Some(https_port),
            "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        ),
        (
            "https",
            Some(https_port),
            "/exa.language_server_pb.LanguageServerService/GetCommandModelConfigs",
        ),
        (
            "http",
            http_port,
            "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        ),
    ] {
        let Some(port) = port else {
            continue;
        };
        let url = format!("{scheme}://127.0.0.1:{port}{path}");
        let response = client
            .post(&url)
            .header("X-Codeium-Csrf-Token", csrf_token)
            .header("Connect-Protocol-Version", "1")
            .json(&body)
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => {
                return response.json::<Value>().await.map_err(|error| {
                    ProviderError::Fetch(format!("Invalid Antigravity payload: {error}"))
                });
            }
            Ok(_) | Err(_) => continue,
        }
    }

    Err(ProviderError::Fetch(
        "Antigravity status endpoints failed".to_string(),
    ))
}

fn antigravity_extract_models(payload: &Value) -> Result<Vec<AntigravityModel>, ProviderError> {
    let configs = payload
        .get("userStatus")
        .and_then(|value| value.get("cascadeModelConfigData"))
        .and_then(|value| value.get("clientModelConfigs"))
        .or_else(|| payload.get("clientModelConfigs"))
        .and_then(Value::as_array)
        .ok_or_else(|| ProviderError::Fetch("Antigravity model configs missing".to_string()))?;

    let models = configs
        .iter()
        .filter_map(|config| {
            let label = config.get("label").and_then(Value::as_str)?.to_string();
            let quota = config.get("quotaInfo")?;
            let remaining_fraction = quota.get("remainingFraction").and_then(Value::as_f64)?;
            let reset_at = quota
                .get("resetTime")
                .and_then(Value::as_str)
                .and_then(parse_offset_datetime)
                .map(|value| value.unix_timestamp() as u64)
                .or_else(|| {
                    quota
                        .get("resetTime")
                        .and_then(Value::as_i64)
                        .map(|value| value as u64)
                });
            Some(AntigravityModel {
                label,
                used_percent: round_metric((1.0 - remaining_fraction) * 100.0),
                reset_at,
            })
        })
        .collect::<Vec<_>>();

    if models.is_empty() {
        return Err(ProviderError::Fetch(
            "Antigravity quota models missing".to_string(),
        ));
    }
    Ok(models)
}

fn antigravity_pool_label(label: &str) -> String {
    let normalized = regex::Regex::new(r#"\s*\([^)]*\)\s*$"#)
        .ok()
        .map(|regex| regex.replace(label.trim(), "").to_string())
        .unwrap_or_else(|| label.trim().to_string())
        .to_lowercase();
    if normalized.contains("gemini") && normalized.contains("pro") {
        return "Gemini Pro".to_string();
    }
    if normalized.contains("gemini") && normalized.contains("flash") {
        return "Gemini Flash".to_string();
    }
    "Claude".to_string()
}

fn antigravity_select_models(models: &[AntigravityModel]) -> Vec<AntigravityPool> {
    let mut pools = std::collections::BTreeMap::<String, AntigravityPool>::new();
    for model in models {
        let pool = antigravity_pool_label(&model.label);
        let entry = pools
            .entry(pool.clone())
            .or_insert_with(|| AntigravityPool {
                label: pool.clone(),
                used_percent: model.used_percent,
                reset_at: model.reset_at,
            });
        if model.used_percent > entry.used_percent {
            entry.used_percent = model.used_percent;
            entry.reset_at = model.reset_at;
        }
    }

    let mut ordered = ["Claude", "Gemini Pro", "Gemini Flash"]
        .into_iter()
        .filter_map(|label| pools.remove(label))
        .collect::<Vec<_>>();
    if ordered.is_empty() {
        let mut fallback = pools.into_values().collect::<Vec<_>>();
        fallback.sort_by(|lhs, rhs| lhs.used_percent.total_cmp(&rhs.used_percent).reverse());
        ordered.extend(fallback);
    }
    ordered
}

pub(crate) async fn fetch_antigravity_live() -> Result<LiveFetchResult, ProviderError> {
    let process = detect_antigravity_process()?;
    let ports = antigravity_listening_ports(process.pid)?;
    let mut selected_port = None;
    for port in ports {
        if antigravity_probe_port(port, &process.csrf_token).await {
            selected_port = Some(port);
            break;
        }
    }
    let port = selected_port
        .ok_or_else(|| ProviderError::Fetch("Antigravity API port not reachable".to_string()))?;

    let payload =
        antigravity_fetch_status(port, process.extension_port, &process.csrf_token).await?;
    let models = antigravity_extract_models(&payload)?;
    let ordered = antigravity_select_models(&models);
    let primary = ordered
        .first()
        .cloned()
        .ok_or_else(|| ProviderError::Fetch("Antigravity quota models missing".to_string()))?;
    let secondary = ordered.get(1).cloned();
    let account_email = payload
        .get("userStatus")
        .and_then(|value| value.get("email"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let plan_label = payload
        .get("userStatus")
        .and_then(|value| value.get("planStatus"))
        .and_then(|value| value.get("planInfo"))
        .and_then(|value| {
            value
                .get("preferredName")
                .or_else(|| value.get("planName"))
                .or_else(|| value.get("planDisplayName"))
                .or_else(|| value.get("displayName"))
                .or_else(|| value.get("productName"))
                .or_else(|| value.get("planShortName"))
        })
        .and_then(Value::as_str)
        .map(str::to_string);

    Ok(LiveFetchResult {
        plan_label: plan_label.clone(),
        usage_summary: Some(build_percent_usage_summary(Some(primary.used_percent))),
        detail_sections: vec![
            DetailSection {
                title: "Account".to_string(),
                rows: vec![
                    DetailRow {
                        label: "Account".to_string(),
                        value: account_email
                            .clone()
                            .or_else(|| plan_label.clone())
                            .unwrap_or_else(|| "Antigravity".to_string()),
                        tone: RowTone::Default,
                    },
                    DetailRow {
                        label: "Plan".to_string(),
                        value: plan_label.unwrap_or_else(|| "Antigravity".to_string()),
                        tone: RowTone::Default,
                    },
                ],
            },
            DetailSection {
                title: "Usage".to_string(),
                rows: {
                    let mut rows = vec![DetailRow {
                        label: primary.label.clone(),
                        value: format!(
                            "{}% used · {}",
                            round_metric(primary.used_percent),
                            format_reset_relative_text(primary.reset_at)
                        ),
                        tone: RowTone::Default,
                    }];
                    if let Some(model) = secondary {
                        rows.push(DetailRow {
                            label: model.label,
                            value: format!(
                                "{}% used · {}",
                                round_metric(model.used_percent),
                                format_reset_relative_text(model.reset_at)
                            ),
                            tone: RowTone::Default,
                        });
                    }
                    if let Some(model) = ordered.get(2) {
                        rows.push(DetailRow {
                            label: model.label.clone(),
                            value: format!(
                                "{}% used · {}",
                                round_metric(model.used_percent),
                                format_reset_relative_text(model.reset_at)
                            ),
                            tone: RowTone::Default,
                        });
                    }
                    rows
                },
            },
        ],
        warnings: vec![],
        fetch_message: format!("Antigravity local server on port {port}"),
        reset_at: primary.reset_at,
        credits_label: None,
        last_updated_at: Some(unix_now()),
    })
}
