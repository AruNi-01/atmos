use std::time::Duration;

use regex::Regex;

use crate::error::{EngineError, Result};

use super::{LocalHttpProbeResult, LocalServiceProtocol};

const PROBE_TIMEOUT_MS: u64 = 700;
const MAX_BODY_BYTES: usize = 64 * 1024;

pub async fn probe_http(url: &str) -> Result<LocalHttpProbeResult> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(PROBE_TIMEOUT_MS))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| EngineError::Processing(format!("failed to build HTTP probe client: {e}")))?;

    let head = client.head(url).send().await;
    if let Ok(response) = head {
        let status_code = Some(response.status().as_u16());
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);
        if response.status().is_success() || response.status().is_redirection() {
            let browser_openable = is_browser_openable(content_type.as_deref());
            if browser_openable {
                return Ok(LocalHttpProbeResult {
                    url: url.to_string(),
                    protocol: LocalServiceProtocol::Http,
                    status_code,
                    content_type,
                    title: None,
                    browser_openable,
                });
            }
        }
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| EngineError::Processing(format!("HTTP probe failed: {e}")))?;
    let status_code = Some(response.status().as_u16());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let browser_openable = is_browser_openable(content_type.as_deref());
    let bytes = response
        .bytes()
        .await
        .map_err(|e| EngineError::Processing(format!("HTTP probe body read failed: {e}")))?;
    let body = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_BODY_BYTES)]);
    let title = extract_title(&body);

    Ok(LocalHttpProbeResult {
        url: url.to_string(),
        protocol: LocalServiceProtocol::Http,
        status_code,
        content_type,
        title,
        browser_openable,
    })
}

fn is_browser_openable(content_type: Option<&str>) -> bool {
    match content_type.map(|value| value.to_ascii_lowercase()) {
        None => true,
        Some(value) => {
            value.contains("text/html")
                || value.contains("application/xhtml")
                || value.contains("application/json")
                || value.contains("text/plain")
                || value.contains("application/javascript")
        }
    }
}

fn extract_title(body: &str) -> Option<String> {
    let re = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok()?;
    let title = re
        .captures(body)?
        .get(1)?
        .as_str()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (!title.is_empty()).then(|| title.chars().take(120).collect())
}

#[cfg(test)]
mod tests {
    use super::extract_title;

    #[test]
    fn extracts_html_title() {
        assert_eq!(
            extract_title("<html><title>  Hello   Atmos </title></html>").as_deref(),
            Some("Hello Atmos")
        );
    }
}
