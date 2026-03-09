use async_trait::async_trait;

use crate::error::Result;
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
