use async_trait::async_trait;
use serde_json::{json, Value};

use crate::client::LlmClient;
use crate::error::{LlmError, Result};
use crate::types::{GenerateTextRequest, GenerateTextResponse, ResolvedLlmProvider};

pub struct AnthropicCompatibleClient;

#[async_trait]
impl LlmClient for AnthropicCompatibleClient {
    async fn generate_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
    ) -> Result<GenerateTextResponse> {
        let endpoint = build_endpoint(&provider.base_url, "/v1/messages");
        let client = reqwest::Client::builder()
            .timeout(provider.timeout)
            .build()?;

        let mut body = json!({
            "model": provider.model,
            "messages": [
                {
                    "role": "user",
                    "content": request.prompt,
                }
            ],
            "max_tokens": request.max_output_tokens.unwrap_or(256),
        });

        if let Some(system) = request
            .system
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            body["system"] = json!(system);
        }
        if let Some(temperature) = request.temperature {
            body["temperature"] = json!(temperature);
        }

        let response = client
            .post(endpoint)
            .header("x-api-key", &provider.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let response_body = response.text().await?;
        if !status.is_success() {
            return Err(LlmError::Provider(format!(
                "Anthropic-compatible provider `{}` returned {}: {}",
                provider.id, status, response_body
            )));
        }
        let value: Value = serde_json::from_str(&response_body)?;

        let content = value
            .get("content")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                LlmError::Provider(format!(
                    "Anthropic-compatible provider `{}` returned no content blocks",
                    provider.id
                ))
            })?;

        let text = content
            .iter()
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n\n");

        if text.trim().is_empty() {
            return Err(LlmError::Provider(format!(
                "Anthropic-compatible provider `{}` returned empty text",
                provider.id
            )));
        }

        let finish_reason = value
            .get("stop_reason")
            .and_then(Value::as_str)
            .map(str::to_string);

        Ok(GenerateTextResponse {
            text,
            finish_reason,
        })
    }
}

fn build_endpoint(base_url: &str, suffix: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with(suffix) {
        trimmed.to_string()
    } else {
        format!("{trimmed}{suffix}")
    }
}
