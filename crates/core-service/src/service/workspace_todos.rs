use crate::error::{Result, ServiceError};
use infra::{GithubIssuePayload, GithubPrPayload};
use llm::{
    render_prompt_template, FileLlmConfigStore, GenerateTextRequest, LlmFeature, ResponseFormat,
};

const WORKSPACE_ISSUE_TODO_SYSTEM_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/workspace/workspace-issue-todo-generator.md");
const WORKSPACE_ISSUE_TODO_USER_PROMPT_TEMPLATE: &str =
    include_str!("../../../../prompt/workspace/workspace-issue-todo-user.md");

pub(crate) fn build_issue_todo_request(issue: &GithubIssuePayload) -> Result<GenerateTextRequest> {
    let store = FileLlmConfigStore::new().map_err(|error| {
        ServiceError::Processing(format!("Failed to initialize LLM config store: {error}"))
    })?;
    let output_language = store
        .load_feature_language(LlmFeature::WorkspaceIssueTodo)
        .map_err(|error| {
            ServiceError::Validation(format!(
                "Failed to load workspace issue TODO output language: {error}"
            ))
        })?;
    let prompt = render_prompt_template(
        WORKSPACE_ISSUE_TODO_USER_PROMPT_TEMPLATE,
        &[
            (
                "output_language_requirement",
                &build_todo_user_language_instruction(output_language.as_deref()),
            ),
            ("issue_title", issue.title.as_str()),
            ("issue_body", issue.body.as_deref().unwrap_or_default()),
        ],
    );
    let system_prompt = render_prompt_template(
        WORKSPACE_ISSUE_TODO_SYSTEM_PROMPT_TEMPLATE,
        &[(
            "output_language_instruction",
            &build_todo_output_language_instruction(output_language.as_deref()),
        )],
    );
    Ok(GenerateTextRequest {
        system: Some(system_prompt.trim().to_string()),
        prompt,
        temperature: Some(0.1),
        max_output_tokens: Some(2048),
        response_format: ResponseFormat::Text,
    })
}

fn build_todo_output_language_instruction(output_language: Option<&str>) -> String {
    let Some(language) = output_language
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return String::new();
    };

    format!(
        "Output language requirement:\n- Write every TODO item strictly in {language}.\n- This output-language requirement overrides the language of the issue title, body, logs, and examples.\n- Do not mix in any other natural language.\n- Keep only the markdown checkbox syntax unchanged."
    )
}

fn build_todo_user_language_instruction(output_language: Option<&str>) -> String {
    let Some(language) = output_language
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return String::new();
    };

    format!(
        "Output language: {language}\nReturn the markdown TODO list in {language} even if the issue content is written in another language."
    )
}

pub(crate) fn normalize_task_markdown(markdown: &str) -> String {
    markdown
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }

            if let Some(content) = trimmed.strip_prefix("- [ ]") {
                let content = content.trim();
                return (!content.is_empty()).then(|| format!("- [ ] {}", content));
            }

            if let Some(content) = trimmed.strip_prefix("- ") {
                let content = content.trim();
                return (!content.is_empty()).then(|| format!("- [ ] {}", content));
            }

            if trimmed.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                if let Some((prefix, content)) = trimmed.split_once(". ") {
                    if prefix.chars().all(|c| c.is_ascii_digit()) {
                        let content = content.trim();
                        return (!content.is_empty()).then(|| format!("- [ ] {}", content));
                    }
                }
            }

            Some(format!("- [ ] {}", trimmed))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn render_requirement_markdown(
    github_issue: Option<&GithubIssuePayload>,
    github_pr: Option<&GithubPrPayload>,
) -> Option<String> {
    // Prefer PR linkage when both are present — the welcome composer keeps
    // them mutually exclusive but the data layer may still hold a synthesized
    // issue alongside a real PR.
    if let Some(pr) = github_pr {
        let mut sections = vec!["# Requirement Specification".to_string()];

        sections.push(format!(
            "## GitHub Pull Request\n\n- Source: {}\n- Title: {}\n- Branch: {} → {}\n",
            pr.url, pr.title, pr.head_ref, pr.base_ref
        ));

        let body = pr
            .body
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No PR description provided.");
        sections.push(format!("## PR Description\n\n{}\n", body));

        return Some(sections.join("\n"));
    }

    let issue = github_issue?;

    let mut sections = vec!["# Requirement Specification".to_string()];

    sections.push(format!(
        "## GitHub Issue\n\n- Source: {}\n- Title: {}\n",
        issue.url, issue.title
    ));

    let issue_body = issue
        .body
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No issue description provided.");
    sections.push(format!("## Issue Description\n\n{}\n", issue_body));

    Some(sections.join("\n"))
}
