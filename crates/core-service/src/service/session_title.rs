use std::path::Path;
use std::sync::LazyLock;

use llm::{
    generate_text, render_prompt_template, FileLlmConfigStore, GenerateTextRequest, LlmFeature, ResponseFormat,
    SessionTitleFormatConfig,
};
use regex::Regex;
use serde::Deserialize;
use tracing::warn;

const DEFAULT_TITLE: &str = "新会话";
const MAX_TITLE_CHARS: usize = 64;
const MAX_TITLE_DESC_CHARS: usize = 40;
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 80;
const SESSION_TITLE_SYSTEM_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/session-title/session-title-system.md");
const SESSION_TITLE_USER_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/session-title/session-title-user.md");
const INTENT_CLASSIFIER_PROMPT: &str =
    include_str!("../../../../prompt/session-title/intent-classifier.md");
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
    let duplicate_instruction = match (
        format.include_agent_name,
        format.include_project_name,
    ) {
        (true, true) => {
            "- do not repeat the enabled agent name or project name inside `title_desc`"
        }
        (true, false) => "- do not repeat the enabled agent name inside `title_desc`",
        (false, true) => "- do not repeat the enabled project name inside `title_desc`",
        (false, false) => "",
    };
    let intent_instruction = if format.include_intent_emoji {
        format!(
            r#"
Intent emoji mode is enabled.
- First infer the user's single primary intent using the classifier rubric below.
- Prefix `title_desc` with exactly one emoji, then a space, then the concise description.
- Example: "🎨 design a retry mechanism"
- Do not return the emoji alone. You must still return JSON in the form {{"title_desc":"..."}}.

Intent classifier rubric:
{}"#,
            intent_classifier_rules()
        )
    } else {
        String::new()
    };

    let format_preview = format_preview(format);
    let duplicate_instruction_block = if duplicate_instruction.is_empty() {
        String::new()
    } else {
        format!("{duplicate_instruction}\n")
    };
    let intent_instruction_block = if intent_instruction.is_empty() {
        String::new()
    } else {
        format!("\n{}", intent_instruction.trim())
    };

    render_prompt_template(
        SESSION_TITLE_SYSTEM_PROMPT_TEMPLATE,
        &[
            ("formatPreview", &format_preview),
            ("languageInstruction", language_instruction),
            ("duplicateInstructionBlock", &duplicate_instruction_block),
            ("intentInstructionBlock", &intent_instruction_block),
        ],
    )
}

fn build_generation_prompt(
    first_prompt: &str,
    mode: &str,
    agent_name: Option<&str>,
    project_name: Option<&str>,
    format: &SessionTitleFormatConfig,
) -> String {
    let format_preview = format_preview(format);
    let agent_name_block = if format.include_agent_name {
        format!("Agent name: {}\n", agent_name.unwrap_or("none"))
    } else {
        String::new()
    };
    let project_name_block = if format.include_project_name {
        format!("Project name: {}\n", project_name.unwrap_or("none"))
    } else {
        String::new()
    };

    render_prompt_template(
        SESSION_TITLE_USER_PROMPT_TEMPLATE,
        &[
            ("mode", mode),
            ("formatPreview", &format_preview),
            ("agentNameBlock", &agent_name_block),
            ("projectNameBlock", &project_name_block),
            ("firstPrompt", first_prompt),
        ],
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
    let title_desc = heuristic_title_desc(first_prompt, mode, format);
    assemble_title(&title_desc, agent_name, project_name, format)
}

fn heuristic_title_desc(
    first_prompt: &str,
    mode: &str,
    format: &SessionTitleFormatConfig,
) -> String {
    if mode == "wiki_ask" {
        let wiki_label = if contains_cjk(first_prompt) {
            "Wiki 问答"
        } else {
            "Wiki Ask"
        };
        let title_desc = sanitize_title_desc(wiki_label).unwrap_or_else(|| DEFAULT_TITLE.to_string());
        return maybe_prefix_intent_emoji(title_desc, first_prompt, format);
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

    let title_desc = sanitize_title_desc(&text).unwrap_or_else(|| DEFAULT_TITLE.to_string());
    maybe_prefix_intent_emoji(title_desc, first_prompt, format)
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

fn maybe_prefix_intent_emoji(
    title_desc: String,
    first_prompt: &str,
    format: &SessionTitleFormatConfig,
) -> String {
    if !format.include_intent_emoji {
        return title_desc;
    }

    let Some(emoji) = heuristic_intent_emoji(first_prompt) else {
        return title_desc;
    };

    format!("{emoji} {title_desc}")
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

fn heuristic_intent_emoji(first_prompt: &str) -> Option<&'static str> {
    let lower = first_prompt.to_lowercase();
    let text = lower.as_str();

    if text.contains("don't write code yet")
        || text.contains("do not write code yet")
        || text.contains("start with a plan")
        || text.contains("design ")
        || text.contains("方案")
        || text.contains("先别写代码")
        || text.contains("设计")
    {
        return Some("🎨");
    }

    if text.contains("debug")
        || text.contains("bug")
        || text.contains("error")
        || text.contains("exception")
        || text.contains("报错")
        || text.contains("异常")
        || text.contains("排查")
    {
        return Some("🐞");
    }

    if text.contains("review")
        || text.contains("code review")
        || text.contains("审查")
        || text.contains("评审")
    {
        return Some("👀");
    }

    if text.contains("test") || text.contains("单测") || text.contains("测试") {
        return Some("✅");
    }

    if text.contains("refactor") || text.contains("重构") {
        return Some("♻️");
    }

    if text.contains("optimize") || text.contains("performance") || text.contains("优化") {
        return Some("🚀");
    }

    if text.contains("summarize") || text.contains("summary") || text.contains("总结") {
        return Some("📝");
    }

    if text.contains("compare") || text.contains("vs") || text.contains("区别") || text.contains("对比")
    {
        return Some("⚖️");
    }

    if text.contains("explain")
        || text.contains("what is")
        || text.contains("为什么")
        || text.contains("解释")
        || text.contains("是什么")
    {
        return Some("💡");
    }

    if text.contains("explore") || text.contains("看看") || text.contains("结构") {
        return Some("🔎");
    }

    if text.contains("discuss") || text.contains("聊聊") || text.contains("讨论") {
        return Some("🗣️");
    }

    if text.contains("implement")
        || text.contains("add ")
        || text.contains("build")
        || text.contains("write ")
        || text.contains("实现")
        || text.contains("添加")
        || text.contains("增加")
    {
        return Some("🧩");
    }

    None
}

fn intent_classifier_rules() -> &'static str {
    INTENT_CLASSIFIER_PROMPT
        .split("Output requirements:")
        .next()
        .map(str::trim)
        .unwrap_or(INTENT_CLASSIFIER_PROMPT.trim())
}

fn format_preview(format: &SessionTitleFormatConfig) -> String {
    let mut segments = Vec::new();
    if format.include_agent_name {
        segments.push("[agentName]");
    }
    if format.include_project_name {
        segments.push("[projectName]");
    }
    if format.include_intent_emoji {
        segments.push("🎨 title desc");
    } else {
        segments.push("title desc");
    }
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
                include_intent_emoji: false,
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
