pub mod client;
pub mod config;
pub mod error;
pub mod prompt_template;
pub mod providers;
pub mod types;

pub use client::{generate_text, generate_text_stream, LlmClient};
pub use config::{default_git_commit_prompt, resolve_feature_config, resolve_provider_by_id, FileLlmConfigStore};
pub use error::{LlmError, Result};
pub use prompt_template::render_prompt_template;
pub use types::{
    GenerateTextRequest, GenerateTextResponse, LlmFeature, LlmFeatureBindings, LlmProviderEntry,
    LlmProvidersFile, ProviderKind, ResolvedLlmProvider, ResponseFormat, SessionTitleFormatConfig,
};
