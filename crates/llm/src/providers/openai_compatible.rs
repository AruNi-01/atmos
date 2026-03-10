use async_trait::async_trait;
use serde_json::{json, Value};

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
            .post(endpoint)
            .bearer_auth(&provider.api_key)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let response_body = response.text().await?;
        if !status.is_success() {
            return Err(LlmError::Provider(format!(
                "OpenAI-compatible provider `{}` returned {}: {}",
                provider.id, status, response_body
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
}
