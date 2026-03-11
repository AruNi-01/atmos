use async_trait::async_trait;
use tokio::sync::mpsc;
use tracing::error;

use crate::error::{LlmError, Result};
use crate::providers::{
    anthropic_compatible::AnthropicCompatibleClient, openai_compatible::OpenAiCompatibleClient,
};
use crate::types::{GenerateTextRequest, GenerateTextResponse, ProviderKind, ResolvedLlmProvider};

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn generate_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
    ) -> Result<GenerateTextResponse>;

    async fn stream_text(
        &self,
        provider: &ResolvedLlmProvider,
        request: GenerateTextRequest,
        tx: mpsc::Sender<Result<String>>,
    ) -> Result<()>;
}

pub async fn generate_text(
    provider: &ResolvedLlmProvider,
    request: GenerateTextRequest,
) -> Result<GenerateTextResponse> {
    match provider.kind {
        ProviderKind::OpenAiCompatible => {
            OpenAiCompatibleClient
                .generate_text(provider, request)
                .await
        }
        ProviderKind::AnthropicCompatible => {
            AnthropicCompatibleClient
                .generate_text(provider, request)
                .await
        }
    }
}

pub async fn generate_text_stream(
    provider: &ResolvedLlmProvider,
    request: GenerateTextRequest,
) -> Result<mpsc::Receiver<Result<String>>> {
    let (tx, rx) = mpsc::channel(32);
    let provider = provider.clone();

    let handle = tokio::spawn(async move {
        let result = match provider.kind {
            ProviderKind::OpenAiCompatible => {
                OpenAiCompatibleClient
                    .stream_text(&provider, request, tx.clone())
                    .await
            }
            ProviderKind::AnthropicCompatible => {
                AnthropicCompatibleClient
                    .stream_text(&provider, request, tx.clone())
                    .await
            }
        };

        if let Err(ref e) = result {
            error!(
                provider_id = %provider.id,
                model = %provider.model,
                "llm stream failed: {e}"
            );
            let _ = tx.send(Err(LlmError::Provider(e.to_string()))).await;
        }
    });

    // Spawn a watcher that logs if the stream task panics
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            error!("llm stream task panicked: {e}");
        }
    });

    Ok(rx)
}
