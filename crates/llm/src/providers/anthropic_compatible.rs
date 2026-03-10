use async_trait::async_trait;
use serde_json::{json, Value};

use crate::client::LlmClient;
use crate::error::{LlmError, Result};
use crate::providers::build_endpoint;
use crate::types::{GenerateTextRequest, GenerateTextResponse, ResolvedLlmProvider};

pub struct AnthropicCompatibleClient;

#[async_trait]
impl LlmClient for AnthropicCompatibleClient {
    async fn generate_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
    ) -> Result<GenerateTextResponse> {
        let prompt_chars = request.prompt.chars().count();
        let max_output_tokens = request
            .max_output_tokens
            .or(provider.max_output_tokens)
            .ok_or_else(|| {
            LlmError::InvalidConfig(format!(
                "Anthropic-compatible provider `{}` requires max_output_tokens either in the request or provider config",
                provider.id
            ))
        })?;
        let endpoint = build_endpoint(&provider.base_url, "/v1/messages");
        let client = reqwest::Client::builder()
            .timeout(provider.timeout)
            .build()?;

        let primary_body = build_primary_body(provider, &request, max_output_tokens);
        let (status, response_body) =
            send_request(&client, provider, &endpoint, &primary_body).await?;
        let value: Value = if status.is_success() {
            serde_json::from_str(&response_body)?
        } else if status == reqwest::StatusCode::BAD_REQUEST {
            let fallback_body = build_fallback_body(provider, &request, max_output_tokens);
            let (fallback_status, fallback_response_body) =
                send_request(&client, provider, &endpoint, &fallback_body).await?;
            if !fallback_status.is_success() {
                return Err(LlmError::Provider(format!(
                    "Anthropic-compatible provider `{}` returned {} at {} (model={}, prompt_chars={}, max_tokens={}) after fallback retry: {}",
                    provider.id,
                    fallback_status,
                    endpoint,
                    provider.model,
                    prompt_chars,
                    max_output_tokens,
                    fallback_response_body
                )));
            }
            serde_json::from_str(&fallback_response_body)?
        } else {
            return Err(LlmError::Provider(format!(
                "Anthropic-compatible provider `{}` returned {} at {} (model={}, prompt_chars={}, max_tokens={}): {}",
                provider.id, status, endpoint, provider.model, prompt_chars, max_output_tokens, response_body
            )));
        };

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

fn build_primary_body(
    provider: &ResolvedLlmProvider,
    request: &GenerateTextRequest,
    max_output_tokens: u32,
) -> Value {
    let mut body = json!({
        "model": provider.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": request.prompt,
                    }
                ],
            }
        ],
        "max_tokens": max_output_tokens,
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

    body
}

fn build_fallback_body(
    provider: &ResolvedLlmProvider,
    request: &GenerateTextRequest,
    max_output_tokens: u32,
) -> Value {
    let prompt = request
        .system
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(|system| format!("{system}\n\nUser request:\n{}", request.prompt))
        .unwrap_or_else(|| request.prompt.clone());

    json!({
        "model": provider.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    }
                ],
            }
        ],
        "max_tokens": max_output_tokens,
    })
}

async fn send_request(
    client: &reqwest::Client,
    provider: &ResolvedLlmProvider,
    endpoint: &str,
    body: &Value,
) -> Result<(reqwest::StatusCode, String)> {
    let response = client
        .post(endpoint)
        .header("x-api-key", &provider.api_key)
        .header("anthropic-version", "2023-06-01")
        .json(body)
        .send()
        .await?;

    let status = response.status();
    let response_body = response.text().await?;
    Ok((status, response_body))
}
