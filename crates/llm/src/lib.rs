pub mod client;
pub mod config;
pub mod error;
pub mod providers;
pub mod types;

pub use client::{generate_text, LlmClient};
pub use config::{default_git_commit_prompt, FileLlmConfigStore};
pub use error::{LlmError, Result};
pub use types::{
    GenerateTextRequest, GenerateTextResponse, LlmFeature, LlmFeatureBindings, LlmProviderEntry,
    LlmProvidersFile, ProviderKind, ResolvedLlmProvider, ResponseFormat,
};
