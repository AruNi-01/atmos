use core_engine::{ChangedFileInfo, ChangedFilesInfo};
use llm::{
    generate_text, generate_text_stream, FileLlmConfigStore, GenerateTextRequest, LlmFeature,
    ResponseFormat,
};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::error::{Result, ServiceError};

const MAX_SUBJECT_CHARS: usize = 72;
const MAX_COMMIT_MESSAGE_CHARS: usize = 1_200;
const MAX_FILES_IN_PROMPT: usize = 48;
const MAX_FILE_PATH_CHARS: usize = 120;
const MAX_FILES_SUMMARY_CHARS: usize = 4_000;
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 4096;

pub struct GitCommitMessageGenerator {
    store: FileLlmConfigStore,
}

impl GitCommitMessageGenerator {
    pub fn new() -> Result<Self> {
        Ok(Self {
            store: FileLlmConfigStore::new().map_err(|error| {
                ServiceError::Processing(format!("Failed to initialize LLM config store: {error}"))
            })?,
        })
    }

    pub async fn generate(
        &self,
        repo_name: Option<&str>,
        changes: &ChangedFilesInfo,
    ) -> Result<String> {
        if let Err(error) = tokio::task::spawn_blocking(
            infra::utils::system_prompt_sync::sync_git_commit_prompt_if_missing,
        )
        .await
        .map_err(|join_error| {
            ServiceError::Processing(format!(
                "Failed to join git commit prompt sync task: {join_error}"
            ))
        })? {
            warn!("git commit prompt sync failed: {}", error);
        }

        let provider = self
            .store
            .resolve_for_feature(LlmFeature::GitCommit)
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to resolve git commit provider: {error}"))
            })?
            .ok_or_else(|| {
                ServiceError::Validation(
                    "No LLM provider is enabled for git commit message generation".to_string(),
                )
            })?;

        let prompt = build_generation_prompt(repo_name, changes);
        let prompt_chars = prompt.chars().count();
        let system_prompt = self.store.load_git_commit_prompt().map_err(|error| {
            ServiceError::Validation(format!("Failed to load git commit prompt: {error}"))
        })?;
        let request = GenerateTextRequest {
            system: Some(system_prompt),
            prompt,
            temperature: Some(0.1),
            max_output_tokens: Some(resolve_max_output_tokens(provider.max_output_tokens)),
            response_format: ResponseFormat::Text,
        };

        let response = generate_text(&provider, request).await.map_err(|error| {
            warn!(
                provider_id = %provider.id,
                model = %provider.model,
                repo_name = %sanitize_prompt_text(repo_name.unwrap_or("unknown")),
                prompt_chars,
                changed_files = changes.staged_files.len() + changes.unstaged_files.len() + changes.untracked_files.len(),
                prompt_preview = %prompt_preview(&build_generation_prompt(repo_name, changes)),
                "git commit message generation failed"
            );
            ServiceError::Validation(format!("Failed to generate git commit message: {error}"))
        })?;

        sanitize_commit_message(&response.text).ok_or_else(|| {
            ServiceError::Validation(
                "LLM provider returned an invalid git commit message".to_string(),
            )
        })
    }

    pub async fn generate_stream(
        &self,
        repo_name: Option<&str>,
        changes: &ChangedFilesInfo,
    ) -> Result<mpsc::Receiver<std::result::Result<String, llm::LlmError>>> {
        if let Err(error) = tokio::task::spawn_blocking(
            infra::utils::system_prompt_sync::sync_git_commit_prompt_if_missing,
        )
        .await
        .map_err(|join_error| {
            ServiceError::Processing(format!(
                "Failed to join git commit prompt sync task: {join_error}"
            ))
        })? {
            warn!("git commit prompt sync failed: {}", error);
        }

        let provider = self
            .store
            .resolve_for_feature(LlmFeature::GitCommit)
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to resolve git commit provider: {error}"))
            })?
            .ok_or_else(|| {
                ServiceError::Validation(
                    "No LLM provider is enabled for git commit message generation".to_string(),
                )
            })?;

        info!(
            provider_id = %provider.id,
            model = %provider.model,
            kind = ?provider.kind,
            repo_name = %sanitize_prompt_text(repo_name.unwrap_or("unknown")),
            "resolved git commit message provider"
        );

        let prompt = build_generation_prompt(repo_name, changes);
        let system_prompt = self.store.load_git_commit_prompt().map_err(|error| {
            ServiceError::Validation(format!("Failed to load git commit prompt: {error}"))
        })?;
        let request = GenerateTextRequest {
            system: Some(system_prompt),
            prompt,
            temperature: Some(0.1),
            max_output_tokens: Some(resolve_max_output_tokens(provider.max_output_tokens)),
            response_format: ResponseFormat::Text,
        };

        let rx = generate_text_stream(&provider, request)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!(
                    "Failed to start streaming git commit message: {error}"
                ))
            })?;

        Ok(rx)
    }

}

fn build_generation_prompt(repo_name: Option<&str>, changes: &ChangedFilesInfo) -> String {
    let repo_name = sanitize_prompt_text(repo_name.unwrap_or("unknown"));
    let (scope_label, files_summary) = generation_scope_and_summary(changes);

    format!(
        "Repository: {repo_name}\nCommit scope: {scope_label}\nTotal additions: {}\nTotal deletions: {}\n\nFiles:\n{}",
        changes.total_additions, changes.total_deletions, files_summary
    )
}

fn generation_scope_and_summary(changes: &ChangedFilesInfo) -> (&'static str, String) {
    if !changes.staged_files.is_empty() {
        (
            "staged changes",
            summarize_files(changes.staged_files.iter()),
        )
    } else {
        let mut files = Vec::new();
        files.extend(changes.unstaged_files.iter());
        files.extend(changes.untracked_files.iter());
        ("working tree changes", summarize_files(files))
    }
}

fn summarize_files<'a>(files: impl IntoIterator<Item = &'a ChangedFileInfo>) -> String {
    let collected = files.into_iter().collect::<Vec<_>>();
    let total_files = collected.len();
    let omitted_files = total_files.saturating_sub(MAX_FILES_IN_PROMPT);

    let mut lines = collected
        .into_iter()
        .take(MAX_FILES_IN_PROMPT)
        .into_iter()
        .map(|file| {
            format!(
                "- [{}] {} (+{} -{})",
                file.status,
                truncate_text(&sanitize_prompt_text(&file.path), MAX_FILE_PATH_CHARS),
                file.additions,
                file.deletions
            )
        })
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return "- No changed files detected".to_string();
    }

    if omitted_files > 0 {
        lines.push(format!("- ... and {omitted_files} more files"));
    }

    truncate_text(&lines.join("\n"), MAX_FILES_SUMMARY_CHARS)
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let char_count = value.chars().count();
    if char_count <= max_chars {
        return value.to_string();
    }

    if max_chars <= 3 {
        return ".".repeat(max_chars);
    }

    let mut truncated = value
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

fn sanitize_prompt_text(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut previous_was_space = false;

    for ch in value.chars() {
        if ch.is_control() {
            if !previous_was_space {
                normalized.push(' ');
                previous_was_space = true;
            }
            continue;
        }

        if ch.is_whitespace() {
            if !previous_was_space {
                normalized.push(' ');
                previous_was_space = true;
            }
            continue;
        }

        normalized.push(ch);
        previous_was_space = false;
    }

    normalized.trim().to_string()
}

fn prompt_preview(prompt: &str) -> String {
    truncate_text(&sanitize_prompt_text(prompt), 240)
}

fn sanitize_commit_message(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches(|c| matches!(c, '"' | '\'' | '`'));
    if trimmed.is_empty() {
        return None;
    }

    let mut lines = Vec::new();
    let mut previous_blank = false;

    for line in trimmed.lines() {
        let normalized_line = normalize_line(line);
        if normalized_line.is_empty() {
            if !previous_blank && !lines.is_empty() {
                lines.push(String::new());
            }
            previous_blank = true;
        } else {
            lines.push(normalized_line);
            previous_blank = false;
        }
    }

    while matches!(lines.last(), Some(line) if line.is_empty()) {
        lines.pop();
    }

    if lines.is_empty() {
        return None;
    }

    let subject = truncate_text(&lines[0], MAX_SUBJECT_CHARS);
    if subject.trim().is_empty() {
        return None;
    }

    let mut message_lines = vec![subject];
    message_lines.extend(lines.into_iter().skip(1));

    let message = truncate_commit_message(&message_lines.join("\n"));
    if message.trim().is_empty() {
        None
    } else {
        Some(message)
    }
}

fn normalize_line(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut previous_was_space = false;

    for ch in value.chars() {
        if ch.is_control() {
            continue;
        }

        if ch.is_whitespace() {
            if !previous_was_space {
                normalized.push(' ');
                previous_was_space = true;
            }
            continue;
        }

        normalized.push(ch);
        previous_was_space = false;
    }

    normalized
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`'))
        .trim()
        .to_string()
}

fn truncate_commit_message(value: &str) -> String {
    let normalized = value.trim();
    let char_count = normalized.chars().count();
    if char_count <= MAX_COMMIT_MESSAGE_CHARS {
        return normalized.to_string();
    }

    let mut truncated = normalized
        .chars()
        .take(MAX_COMMIT_MESSAGE_CHARS.saturating_sub(3))
        .collect::<String>();
    truncated.push_str("...");
    truncated.trim_end().to_string()
}

fn resolve_max_output_tokens(provider_max_output_tokens: Option<u32>) -> u32 {
    provider_max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
}

#[cfg(test)]
mod tests {
    use super::{
        prompt_preview, resolve_max_output_tokens, sanitize_commit_message, sanitize_prompt_text,
        summarize_files, DEFAULT_MAX_OUTPUT_TOKENS,
    };
    use core_engine::ChangedFileInfo;

    #[test]
    fn keeps_single_line_commit_subject() {
        let message = sanitize_commit_message("feat: add provider routing\n\nbody");
        assert_eq!(
            message.as_deref(),
            Some("feat: add provider routing\n\nbody")
        );
    }

    #[test]
    fn keeps_multiline_commit_message() {
        let message = sanitize_commit_message(
            "feat(git): improve prompt sync\n\nAdd startup prompt sync and a fallback sync before generation.\nKeep user overrides intact.\n",
        );
        assert_eq!(
            message.as_deref(),
            Some(
                "feat(git): improve prompt sync\n\nAdd startup prompt sync and a fallback sync before generation.\nKeep user overrides intact."
            )
        );
    }

    #[test]
    fn summarize_files_truncates_large_input() {
        let files = (0..80)
            .map(|index| ChangedFileInfo {
                path: format!("src/really/long/path/{index}/file.rs"),
                status: "M".to_string(),
                additions: 1,
                deletions: 0,
                staged: false,
            })
            .collect::<Vec<_>>();

        let summary = summarize_files(files.iter());
        assert!(summary.contains("... and 32 more files"));
        assert!(summary.chars().count() <= 4_000);
    }

    #[test]
    fn sanitize_prompt_text_collapses_control_characters() {
        assert_eq!(
            sanitize_prompt_text(" foo\tbar\nbaz\u{0000}qux "),
            "foo bar baz qux"
        );
    }

    #[test]
    fn prompt_preview_is_single_line_and_ascii_ellipsis() {
        let preview = prompt_preview("line 1\nline 2\tline 3");
        assert_eq!(preview, "line 1 line 2 line 3");
        assert!(!preview.contains('…'));
    }

    #[test]
    fn resolve_max_output_tokens_prefers_provider_config() {
        assert_eq!(resolve_max_output_tokens(Some(1024)), 1024);
        assert_eq!(
            resolve_max_output_tokens(None),
            DEFAULT_MAX_OUTPUT_TOKENS
        );
    }
}
