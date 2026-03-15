use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::{debug, warn};

use crate::client::LlmClient;
use crate::error::{LlmError, Result};
use crate::providers::build_endpoint;
use crate::types::{GenerateTextRequest, GenerateTextResponse, ResolvedLlmProvider};

pub struct AnthropicCompatibleClient;

enum StreamAttemptFailure {
    Retryable(LlmError),
    Fatal(LlmError),
}

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

    async fn stream_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
        tx: mpsc::Sender<Result<String>>,
    ) -> Result<()> {
        let prompt_chars = request.prompt.chars().count();
        let max_output_tokens = request
            .max_output_tokens
            .or(provider.max_output_tokens)
            .ok_or_else(|| {
                LlmError::InvalidConfig(format!(
                    "Anthropic-compatible provider `{}` requires max_output_tokens",
                    provider.id
                ))
            })?;
        let endpoint = build_endpoint(&provider.base_url, "/v1/messages");
        let client = reqwest::Client::builder()
            .timeout(provider.timeout)
            .build()?;

        let primary_body =
            build_stream_body(build_primary_body(provider, &request, max_output_tokens));
        match stream_once(&client, provider, &endpoint, &primary_body, &tx).await {
            Ok(()) => Ok(()),
            Err(StreamAttemptFailure::Retryable(error)) => {
                warn!(
                    provider_id = %provider.id,
                    model = %provider.model,
                    prompt_chars,
                    error = %error,
                    "anthropic-compatible stream request failed before output, retrying with fallback body"
                );

                let fallback_body =
                    build_stream_body(build_fallback_body(provider, &request, max_output_tokens));
                match stream_once(&client, provider, &endpoint, &fallback_body, &tx).await {
                    Ok(()) => Ok(()),
                    Err(StreamAttemptFailure::Retryable(error))
                    | Err(StreamAttemptFailure::Fatal(error)) => Err(error),
                }
            }
            Err(StreamAttemptFailure::Fatal(error)) => Err(error),
        }
    }
}

fn try_parse_non_stream_response(raw: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(raw.trim()).ok()?;

    // Anthropic format: content[].text
    if let Some(text) = parsed
        .get("content")
        .and_then(Value::as_array)
        .and_then(|blocks| {
            let texts: Vec<&str> = blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect();
            if texts.is_empty() {
                None
            } else {
                Some(texts.join("\n\n"))
            }
        })
    {
        if !text.trim().is_empty() {
            return Some(text);
        }
    }

    // OpenAI format: choices[0].message.content
    if let Some(content) = parsed
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
    {
        if !content.trim().is_empty() {
            return Some(content.to_string());
        }
    }

    None
}

fn extract_stream_text_from_data(data: &str, provider: &ResolvedLlmProvider) -> Option<String> {
    let parsed = match serde_json::from_str::<Value>(data) {
        Ok(parsed) => parsed,
        Err(error) => {
            warn!(
                provider_id = %provider.id,
                model = %provider.model,
                raw = %truncate_for_log(data, 400),
                "failed to parse anthropic-compatible stream json: {}",
                error
            );
            return None;
        }
    };

    let event_type = parsed
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown");

    let text = parsed
        .get("delta")
        .and_then(|d| d.get("text"))
        .and_then(Value::as_str)
        .or_else(|| {
            parsed
                .get("delta")
                .and_then(|d| d.get("type"))
                .and_then(Value::as_str)
                .filter(|kind| *kind == "text_delta")
                .and_then(|_| parsed.get("delta").and_then(|d| d.get("text")))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            parsed
                .get("content_block")
                .and_then(|block| block.get("text"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            parsed
                .get("choices")
                .and_then(|choices| choices.get(0))
                .and_then(|choice| choice.get("delta"))
                .and_then(|delta| delta.get("content"))
                .and_then(Value::as_str)
        });

    if text.is_none() {
        debug!(
            provider_id = %provider.id,
            model = %provider.model,
            event_type,
            payload = %truncate_for_log(&parsed.to_string(), 400),
            "anthropic-compatible stream event contained no text"
        );
    }

    text.map(str::to_string)
}

fn truncate_for_log(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn build_stream_body(mut body: Value) -> Value {
    body["stream"] = json!(true);
    body
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

async fn stream_once(
    client: &reqwest::Client,
    provider: &ResolvedLlmProvider,
    endpoint: &str,
    body: &Value,
    tx: &mpsc::Sender<Result<String>>,
) -> std::result::Result<(), StreamAttemptFailure> {
    let body_json = serde_json::to_string(body).unwrap_or_default();
    debug!(
        provider_id = %provider.id,
        endpoint = %endpoint,
        body = %truncate_for_log(&body_json, 800),
        "anthropic-compatible stream request body"
    );

    let mut response = client
        .post(endpoint)
        .header("x-api-key", &provider.api_key)
        .header("anthropic-version", "2023-06-01")
        .json(body)
        .send()
        .await
        .map_err(|error| StreamAttemptFailure::Fatal(error.into()))?;

    debug!(
        provider_id = %provider.id,
        status = %response.status(),
        content_type = ?response.headers().get("content-type"),
        "anthropic-compatible stream response received"
    );

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| StreamAttemptFailure::Fatal(error.into()))?;
        let error = LlmError::Provider(format!(
            "Anthropic-compatible provider `{}` returned {} at {} (model={}): {}",
            provider.id, status, endpoint, provider.model, body
        ));
        return if status == reqwest::StatusCode::BAD_REQUEST {
            Err(StreamAttemptFailure::Retryable(error))
        } else {
            Err(StreamAttemptFailure::Fatal(error))
        };
    }

    let mut buf = String::new();
    let mut raw_body = String::new();
    let mut streamed_chunks = 0usize;
    let mut next_is_error = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| StreamAttemptFailure::Fatal(error.into()))?
    {
        let chunk_text = String::from_utf8_lossy(&chunk).to_string();
        raw_body.push_str(&chunk_text);
        buf.push_str(&chunk_text);
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            if let Some(event_name) = line.strip_prefix("event:").map(str::trim) {
                next_is_error = event_name == "error";
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                return Ok(());
            }

            if next_is_error {
                let error = LlmError::Provider(format!(
                    "Anthropic-compatible provider `{}` returned SSE error (model={}): {}",
                    provider.id,
                    provider.model,
                    parse_stream_error_message(data)
                ));
                return if streamed_chunks == 0 {
                    Err(StreamAttemptFailure::Retryable(error))
                } else {
                    Err(StreamAttemptFailure::Fatal(error))
                };
            }

            if let Some(text) = extract_stream_text_from_data(data, provider) {
                streamed_chunks += 1;
                if !text.is_empty() && tx.send(Ok(text.to_string())).await.is_err() {
                    return Ok(());
                }
            }
        }
    }

    if streamed_chunks == 0 {
        if let Some(text) = try_parse_non_stream_response(&raw_body) {
            debug!(
                provider_id = %provider.id,
                "provider returned non-streaming response despite stream=true, falling back"
            );
            if !text.is_empty() {
                let _ = tx.send(Ok(text)).await;
            }
            return Ok(());
        }
    }

    if !buf.trim().is_empty() {
        let line = buf.trim();
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data != "[DONE]" {
                if let Some(text) = extract_stream_text_from_data(data, provider) {
                    if !text.is_empty() {
                        let _ = tx.send(Ok(text.to_string())).await;
                    }
                }
            }
        }
    }

    Ok(())
}

fn parse_stream_error_message(data: &str) -> String {
    serde_json::from_str::<Value>(data)
        .ok()
        .and_then(|v| {
            let error = v.get("error")?;
            let code = error
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            Some(format!("[{code}] {message}"))
        })
        .unwrap_or_else(|| data.to_string())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::Value;

    use super::{
        build_fallback_body, build_primary_body, build_stream_body, parse_stream_error_message,
    };
    use crate::types::{GenerateTextRequest, ProviderKind, ResolvedLlmProvider, ResponseFormat};

    fn provider() -> ResolvedLlmProvider {
        ResolvedLlmProvider {
            id: "glm-4.7".to_string(),
            kind: ProviderKind::AnthropicCompatible,
            base_url: "https://example.com".to_string(),
            api_key: "test-key".to_string(),
            model: "glm-4.7".to_string(),
            timeout: Duration::from_secs(30),
            max_output_tokens: Some(4096),
        }
    }

    fn request() -> GenerateTextRequest {
        GenerateTextRequest {
            system: Some("system prompt".to_string()),
            prompt: "user prompt".to_string(),
            temperature: Some(0.1),
            max_output_tokens: Some(512),
            response_format: ResponseFormat::Text,
        }
    }

    #[test]
    fn build_stream_body_sets_stream_flag() {
        let body = build_stream_body(build_primary_body(&provider(), &request(), 512));
        assert_eq!(body.get("stream").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn build_fallback_body_inlines_system_prompt() {
        let body = build_fallback_body(&provider(), &request(), 512);
        let text = body
            .get("messages")
            .and_then(|v| v.get(0))
            .and_then(|v| v.get("content"))
            .and_then(|v| v.get(0))
            .and_then(|v| v.get("text"))
            .and_then(Value::as_str);
        assert_eq!(text, Some("system prompt\n\nUser request:\nuser prompt"));
    }

    #[test]
    fn parse_stream_error_message_reads_provider_error_payload() {
        let message = parse_stream_error_message(
            r#"{"error":{"code":"1210","message":"API 调用参数有误，请检查文档。"}}"#,
        );
        assert_eq!(message, "[1210] API 调用参数有误，请检查文档。");
    }
}
