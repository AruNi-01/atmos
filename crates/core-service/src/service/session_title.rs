use std::path::Path;
use std::sync::LazyLock;

use llm::{
    generate_text, FileLlmConfigStore, GenerateTextRequest, LlmFeature, ResponseFormat,
    SessionTitleFormatConfig,
};
use regex::Regex;
use serde::Deserialize;
use tracing::warn;

const DEFAULT_TITLE: &str = "新会话";
const MAX_TITLE_CHARS: usize = 64;
const MAX_TITLE_DESC_CHARS: usize = 40;
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

pub struct SessionTitleGenerationContext<'a> {
    pub cwd: &'a str,
    pub mode: &'a str,
    pub context_type: &'a str,
    pub agent_name: Option<&'a str>,
}

impl SessionTitleGenerator {
    pub fn new() -> Self {
        Self {
            store: FileLlmConfigStore::new().ok(),
        }
    }

    pub async fn generate(
        &self,
        first_prompt: &str,
        context: &SessionTitleGenerationContext<'_>,
    ) -> String {
        let project_name = project_name_for_context(context.cwd, context.context_type);
        let title_format = self
            .store
            .as_ref()
            .and_then(|store| store.load_session_title_format().ok())
            .unwrap_or_default();

        if let Some(store) = &self.store {
            match store.resolve_for_feature(LlmFeature::SessionTitle) {
                Ok(Some(provider)) => {
                    let prompt = build_generation_prompt(
                        first_prompt,
                        context.mode,
                        context.agent_name,
                        project_name.as_deref(),
                        &title_format,
                    );
                    let request = GenerateTextRequest {
                        system: Some(build_system_prompt(first_prompt, &title_format)),
                        prompt,
                        temperature: Some(0.2),
                        max_output_tokens: Some(resolve_max_output_tokens(
                            provider.max_output_tokens,
                        )),
                        response_format: ResponseFormat::JsonObject,
                    };

                    match generate_text(&provider, request).await {
                        Ok(response) => {
                            if let Some(title_desc) = parse_title_response(&response.text) {
                                return assemble_title(
                                    &title_desc,
                                    context.agent_name,
                                    project_name.as_deref(),
                                    &title_format,
                                );
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

        heuristic_title(
            first_prompt,
            context.mode,
            context.agent_name,
            project_name.as_deref(),
            &title_format,
        )
    }
}

fn build_system_prompt(first_prompt: &str, format: &SessionTitleFormatConfig) -> String {
    let language_instruction = if contains_cjk(first_prompt) {
        "Preferred output language: Simplified Chinese. Do not translate a Chinese prompt into English."
    } else {
        "Use the same primary language as the user's first prompt."
    };

    format!(
        r#"You generate concise ACP chat session title descriptions for developer tasks.
Return JSON only in the form {{"title_desc":"..."}}.

The app will assemble the final title using this exact format:
{}

Generate only the `title_desc` segment.

Rules:
- {}
- make `title_desc` structured and scannable, not a full sentence or question
- the final title uses ` | ` as the only segment separator
- if `title_desc` needs two compact facets, separate them with ` | ` instead of commas, dashes, or brackets
- prefer a compact task label such as "认证流程排查", "Codex vs Claude 对比", "Auth flow debug", or "Landing page copy update"
- do not repeat the agent name or project name inside `title_desc`
- avoid filler words and politeness
- no surrounding quotes
- no trailing punctuation
- use plain language
- if the mode is wiki_ask, reflect that briefly in `title_desc`"#,
        format_preview(format),
        language_instruction,
    )
}

fn build_generation_prompt(
    first_prompt: &str,
    mode: &str,
    agent_name: Option<&str>,
    project_name: Option<&str>,
    format: &SessionTitleFormatConfig,
) -> String {
    let agent_name = agent_name.unwrap_or("none");
    let project_name = project_name.unwrap_or("none");
    format!(
        "Mode: {mode}\nFinal title format: {}\nAgent name: {agent_name}\nProject name: {project_name}\n\nUser prompt:\n{first_prompt}",
        format_preview(format)
    )
}

#[derive(Debug, Deserialize)]
struct TitlePayload {
    #[serde(alias = "title")]
    title_desc: String,
}

fn parse_title_response(raw: &str) -> Option<String> {
    if let Ok(payload) = serde_json::from_str::<TitlePayload>(raw) {
        return sanitize_title_desc(&payload.title_desc);
    }

    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if start >= end {
        return sanitize_title_desc(raw);
    }

    serde_json::from_str::<TitlePayload>(&raw[start..=end])
        .ok()
        .and_then(|payload| sanitize_title_desc(&payload.title_desc))
        .or_else(|| sanitize_title_desc(raw))
}

fn heuristic_title(
    first_prompt: &str,
    mode: &str,
    agent_name: Option<&str>,
    project_name: Option<&str>,
    format: &SessionTitleFormatConfig,
) -> String {
    let title_desc = heuristic_title_desc(first_prompt, mode);
    assemble_title(&title_desc, agent_name, project_name, format)
}

fn heuristic_title_desc(first_prompt: &str, mode: &str) -> String {
    if mode == "wiki_ask" {
        let wiki_label = if contains_cjk(first_prompt) {
            "Wiki 问答"
        } else {
            "Wiki Ask"
        };
        return sanitize_title_desc(wiki_label).unwrap_or_else(|| DEFAULT_TITLE.to_string());
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

    sanitize_title_desc(&text).unwrap_or_else(|| DEFAULT_TITLE.to_string())
}

fn assemble_title(
    title_desc: &str,
    agent_name: Option<&str>,
    project_name: Option<&str>,
    format: &SessionTitleFormatConfig,
) -> String {
    let mut segments = Vec::new();

    if format.include_agent_name {
        if let Some(agent_name) = sanitize_segment(agent_name, 18) {
            segments.push(agent_name);
        }
    }

    if format.include_project_name {
        if let Some(project_name) = sanitize_segment(project_name, 18) {
            segments.push(project_name);
        }
    }

    let title_desc = sanitize_title_desc(title_desc)
        .or_else(|| sanitize_segment(Some(DEFAULT_TITLE), MAX_TITLE_DESC_CHARS))
        .unwrap_or_else(|| DEFAULT_TITLE.to_string());
    segments.push(title_desc);

    sanitize_final_title(&segments.join(" | ")).unwrap_or_else(|| DEFAULT_TITLE.to_string())
}

fn sanitize_title_desc(raw: &str) -> Option<String> {
    sanitize_with_limit(raw, MAX_TITLE_DESC_CHARS, false)
}

fn sanitize_final_title(raw: &str) -> Option<String> {
    sanitize_with_limit(raw, MAX_TITLE_CHARS, true)
}

fn sanitize_segment(raw: Option<&str>, max_chars: usize) -> Option<String> {
    raw.and_then(|value| sanitize_with_limit(value, max_chars, false))
}

fn sanitize_with_limit(raw: &str, max_chars: usize, preserve_pipes: bool) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '“' | '”' | '[' | ']'))
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

    let normalized = if preserve_pipes {
        normalized
            .split('|')
            .map(|segment| segment.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|segment| !segment.is_empty())
            .collect::<Vec<_>>()
            .join(" | ")
    } else {
        normalized
            .replace('|', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };
    let normalized = normalized.trim();
    if normalized.is_empty() {
        return None;
    }

    let title: String = normalized.chars().take(max_chars).collect();
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn project_name_for_context(cwd: &str, context_type: &str) -> Option<String> {
    if context_type == "temp" {
        return None;
    }
    cwd_basename(cwd)
}

fn cwd_basename(cwd: &str) -> Option<String> {
    Path::new(cwd)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn contains_cjk(value: &str) -> bool {
    value.chars().any(|ch| {
        ('\u{4E00}'..='\u{9FFF}').contains(&ch)
            || ('\u{3400}'..='\u{4DBF}').contains(&ch)
            || ('\u{3040}'..='\u{30FF}').contains(&ch)
            || ('\u{AC00}'..='\u{D7AF}').contains(&ch)
    })
}

fn format_preview(format: &SessionTitleFormatConfig) -> String {
    let mut segments = Vec::new();
    if format.include_agent_name {
        segments.push("[agentName]");
    }
    if format.include_project_name {
        segments.push("[projectName]");
    }
    segments.push("title desc");
    segments.join(" | ")
}

fn resolve_max_output_tokens(provider_max_output_tokens: Option<u32>) -> u32 {
    provider_max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
}

#[cfg(test)]
mod tests {
    use llm::SessionTitleFormatConfig;

    use super::{
        assemble_title, heuristic_title, parse_title_response, resolve_max_output_tokens,
        DEFAULT_MAX_OUTPUT_TOKENS,
    };

    #[test]
    fn parses_json_title_payload() {
        let title = parse_title_response(r#"{"title_desc":"认证流程排查"}"#);
        assert_eq!(title.as_deref(), Some("认证流程排查"));
    }

    #[test]
    fn parses_legacy_json_title_payload() {
        let title = parse_title_response(r#"{"title":"Debug auth flow"}"#);
        assert_eq!(title.as_deref(), Some("Debug auth flow"));
    }

    #[test]
    fn heuristic_title_strips_noise() {
        let title = heuristic_title(
            "Please help me debug the authentication flow",
            "default",
            None,
            None,
            &SessionTitleFormatConfig::default(),
        );
        assert_eq!(title, "debug the authentication flow");
    }

    #[test]
    fn assemble_title_uses_structured_format() {
        let title = assemble_title(
            "认证流程排查",
            Some("Claude Agent"),
            Some("atmos"),
            &SessionTitleFormatConfig {
                include_agent_name: true,
                include_project_name: true,
            },
        );
        assert_eq!(title, "Claude Agent | atmos | 认证流程排查");
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
