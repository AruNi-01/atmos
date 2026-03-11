use std::path::Path;
use std::sync::LazyLock;

use llm::{generate_text, FileLlmConfigStore, GenerateTextRequest, LlmFeature, ResponseFormat};
use regex::Regex;
use serde::Deserialize;
use tracing::warn;

const DEFAULT_TITLE: &str = "新会话";
const MAX_TITLE_CHARS: usize = 64;
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 80;
static CODE_BLOCK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)```.*?```").expect("valid code block regex"));
static LEADING_NOISE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^\s*(please|pls|can you|could you|would you|help me|i need you to|i want you to|let's|帮我|请)\s+",
    )
    .expect("valid leading noise regex")
});

pub struct SessionTitleGenerator {
    store: Option<FileLlmConfigStore>,
}

impl SessionTitleGenerator {
    pub fn new() -> Self {
        Self {
            store: FileLlmConfigStore::new().ok(),
        }
    }

    pub async fn generate(&self, first_prompt: &str, cwd: &str, mode: &str) -> String {
        let cwd_name = cwd_basename(cwd);

        if let Some(store) = &self.store {
            match store.resolve_for_feature(LlmFeature::SessionTitle) {
                Ok(Some(provider)) => {
                    let prompt = build_generation_prompt(first_prompt, cwd_name.as_deref(), mode);
                    let request = GenerateTextRequest {
                        system: Some(TITLE_SYSTEM_PROMPT.to_string()),
                        prompt,
                        temperature: Some(0.2),
                        max_output_tokens: Some(resolve_max_output_tokens(
                            provider.max_output_tokens,
                        )),
                        response_format: ResponseFormat::JsonObject,
                    };

                    match generate_text(&provider, request).await {
                        Ok(response) => {
                            if let Some(title) = parse_title_response(&response.text) {
                                return title;
                            }
                            warn!(
                                "LLM title generation returned unusable content for provider {}",
                                provider.id
                            );
                        }
                        Err(error) => {
                            warn!(
                                "LLM title generation failed for provider {}: {}",
                                provider.id, error
                            );
                        }
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    warn!("Failed to resolve session title provider: {}", error);
                }
            }
        }

        heuristic_title(first_prompt, cwd_name.as_deref(), mode)
    }
}

const TITLE_SYSTEM_PROMPT: &str = r#"You generate concise chat session titles for developer tasks.
Return JSON only in the form {"title":"..."}.

Rules:
- 6 to 40 characters is ideal
- summarize the user's main task
- avoid filler words and politeness
- no surrounding quotes
- no trailing punctuation
- use plain language
- if the mode is wiki_ask, reflect that briefly in the title"#;

fn build_generation_prompt(first_prompt: &str, cwd_name: Option<&str>, mode: &str) -> String {
    let workspace = cwd_name.unwrap_or("unknown");
    format!("Mode: {mode}\nWorkspace: {workspace}\n\nUser prompt:\n{first_prompt}")
}

#[derive(Debug, Deserialize)]
struct TitlePayload {
    title: String,
}

fn parse_title_response(raw: &str) -> Option<String> {
    if let Ok(payload) = serde_json::from_str::<TitlePayload>(raw) {
        return sanitize_title(&payload.title);
    }

    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if start >= end {
        return sanitize_title(raw);
    }

    serde_json::from_str::<TitlePayload>(&raw[start..=end])
        .ok()
        .and_then(|payload| sanitize_title(&payload.title))
        .or_else(|| sanitize_title(raw))
}

fn heuristic_title(first_prompt: &str, cwd_name: Option<&str>, mode: &str) -> String {
    if mode == "wiki_ask" {
        let base = cwd_name.unwrap_or("Project");
        return sanitize_title(&format!("{base} Wiki Ask"))
            .unwrap_or_else(|| DEFAULT_TITLE.to_string());
    }

    let mut text = first_prompt.trim().to_string();
    if text.is_empty() {
        return DEFAULT_TITLE.to_string();
    }

    text = CODE_BLOCK_RE.replace_all(&text, " ").into_owned();
    text = text.replace('\n', " ");

    loop {
        let next = LEADING_NOISE_RE.replace(&text, "").into_owned();
        if next == text {
            break;
        }
        text = next;
    }

    sanitize_title(&text).unwrap_or_else(|| DEFAULT_TITLE.to_string())
}

fn sanitize_title(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '“' | '”'))
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?' | '。' | '！' | '？'))
        .trim();

    if trimmed.is_empty() {
        return None;
    }

    let mut normalized = String::with_capacity(trimmed.len());
    let mut previous_was_space = false;
    for ch in trimmed.chars() {
        let is_space = ch.is_whitespace();
        if is_space {
            if !previous_was_space {
                normalized.push(' ');
            }
        } else if !ch.is_control() {
            normalized.push(ch);
        }
        previous_was_space = is_space;
    }

    let normalized = normalized.trim();
    if normalized.is_empty() {
        return None;
    }

    let title: String = normalized.chars().take(MAX_TITLE_CHARS).collect();
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn cwd_basename(cwd: &str) -> Option<String> {
    Path::new(cwd)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn resolve_max_output_tokens(provider_max_output_tokens: Option<u32>) -> u32 {
    provider_max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
}

#[cfg(test)]
mod tests {
    use super::{
        heuristic_title, parse_title_response, resolve_max_output_tokens,
        DEFAULT_MAX_OUTPUT_TOKENS,
    };

    #[test]
    fn parses_json_title_payload() {
        let title = parse_title_response(r#"{"title":"Debug auth flow"}"#);
        assert_eq!(title.as_deref(), Some("Debug auth flow"));
    }

    #[test]
    fn heuristic_title_strips_noise() {
        let title = heuristic_title(
            "Please help me debug the authentication flow",
            None,
            "default",
        );
        assert_eq!(title, "debug the authentication flow");
    }

    #[test]
    fn resolve_max_output_tokens_prefers_provider_config() {
        assert_eq!(resolve_max_output_tokens(Some(256)), 256);
        assert_eq!(
            resolve_max_output_tokens(None),
            DEFAULT_MAX_OUTPUT_TOKENS
        );
    }
}
