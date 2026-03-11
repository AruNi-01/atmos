use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::client::LlmClient;
use crate::error::{LlmError, Result};
use crate::providers::build_endpoint;
use crate::types::{
    GenerateTextRequest, GenerateTextResponse, ResolvedLlmProvider, ResponseFormat,
};

pub struct OpenAiCompatibleClient;

#[async_trait]
impl LlmClient for OpenAiCompatibleClient {
    async fn generate_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
    ) -> Result<GenerateTextResponse> {
        let prompt_chars = request.prompt.chars().count();
        let endpoint = build_endpoint(&provider.base_url, "/chat/completions");
        let client = reqwest::Client::builder()
            .timeout(provider.timeout)
            .build()?;

        let mut messages = Vec::new();
        if let Some(system) = request
            .system
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            messages.push(json!({
                "role": "system",
                "content": system,
            }));
        }
        messages.push(json!({
            "role": "user",
            "content": request.prompt,
        }));

        let mut body = json!({
            "model": provider.model,
            "messages": messages,
        });

        if let Some(temperature) = request.temperature {
            body["temperature"] = json!(temperature);
        }
        if let Some(max_output_tokens) = request.max_output_tokens.or(provider.max_output_tokens) {
            body["max_tokens"] = json!(max_output_tokens);
        }
        if matches!(request.response_format, ResponseFormat::JsonObject) {
            body["response_format"] = json!({ "type": "json_object" });
        }

        let response = client
            .post(&endpoint)
            .bearer_auth(&provider.api_key)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let response_body = response.text().await?;
        if !status.is_success() {
            return Err(LlmError::Provider(format!(
                "OpenAI-compatible provider `{}` returned {} at {} (model={}, prompt_chars={}): {}",
                provider.id, status, endpoint, provider.model, prompt_chars, response_body
            )));
        }
        let value: Value = serde_json::from_str(&response_body)?;

        let text = value
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| {
                LlmError::Provider(format!(
                    "OpenAI-compatible provider `{}` returned no message content",
                    provider.id
                ))
            })?;

        let finish_reason = value
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("finish_reason"))
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
        let endpoint = build_endpoint(&provider.base_url, "/chat/completions");
        let client = reqwest::Client::builder()
            .timeout(provider.timeout)
            .build()?;

        let mut messages = Vec::new();
        if let Some(system) = request
            .system
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            messages.push(json!({"role": "system", "content": system}));
        }
        messages.push(json!({"role": "user", "content": request.prompt}));

        let mut body = json!({
            "model": provider.model,
            "messages": messages,
            "stream": true,
        });
        if let Some(temperature) = request.temperature {
            body["temperature"] = json!(temperature);
        }
        if let Some(max_output_tokens) = request.max_output_tokens.or(provider.max_output_tokens) {
            body["max_tokens"] = json!(max_output_tokens);
        }
        if matches!(request.response_format, ResponseFormat::JsonObject) {
            body["response_format"] = json!({"type": "json_object"});
        }

        let mut response = client
            .post(&endpoint)
            .bearer_auth(&provider.api_key)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await?;
            return Err(LlmError::Provider(format!(
                "OpenAI-compatible provider `{}` returned {} at {} (model={}): {}",
                provider.id, status, endpoint, provider.model, body
            )));
        }

        let mut buf = String::new();
        let mut raw_body = String::new();
        let mut streamed_chunks = 0usize;
        while let Some(chunk) = response.chunk().await? {
            let chunk_text = String::from_utf8_lossy(&chunk).to_string();
            raw_body.push_str(&chunk_text);
            buf.push_str(&chunk_text);
            while let Some(pos) = buf.find('\n') {
                let line = buf[..pos].trim().to_string();
                buf = buf[pos + 1..].to_string();
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }
                let Some(data) = line.strip_prefix("data: ") else {
                    continue;
                };
                if data.trim() == "[DONE]" {
                    return Ok(());
                }
                if let Ok(parsed) = serde_json::from_str::<Value>(data) {
                    if let Some(content) = parsed
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(Value::as_str)
                    {
                        if !content.is_empty() {
                            streamed_chunks += 1;
                            if tx.send(Ok(content.to_string())).await.is_err() {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }

        // Fallback: provider ignored stream=true and returned a complete JSON response
        if streamed_chunks == 0 {
            if let Ok(parsed) = serde_json::from_str::<Value>(raw_body.trim()) {
                if let Some(content) = parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(Value::as_str)
                {
                    if !content.is_empty() {
                        let _ = tx.send(Ok(content.to_string())).await;
                    }
                }
            }
        }

        Ok(())
    }
}
