//! Headless generation of attention auto-summary JSON.
//!
//! Spawns a one-shot agent-cli (preferred, same path as automations) or falls
//! back to the default LLM provider. Never attaches to the original pane.

use std::path::Path;
use std::process::Command;
use std::time::Duration;

use llm::{
    FileLlmConfigStore, GenerateTextRequest, ProviderKind, ResolvedLlmProvider, ResponseFormat,
};
use tracing::{info, warn};

use super::attention_summary::{AttentionSummaryPayload, AttentionSummarySettings};
use super::AgentAttentionLatch;
use crate::error::{Result, ServiceError};
use crate::service::automation::{
    resolve_automation_agent_with_config, AutomationAgentRunConfig,
};
use crate::service::llm_text_generation::generate_text;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_CONTEXT_CHARS: usize = 12_000;

const SYSTEM_PROMPT: &str = r#"You are Atmos attention-summary helper.
A coding agent finished a turn and the user has not acknowledged it yet.
Summarize what was recently done and suggest concise next steps.
Respond with ONLY a single JSON object (no markdown fences) matching:
{
  "summary": "one sentence",
  "next_steps": ["short action 1", "short action 2"],
  "can_close_session": true
}
Rules:
- summary: one clear sentence about recent work (max ~160 chars).
- next_steps: 2-4 short imperative actions the user might take next.
- can_close_session: true only if work looks complete with no obvious unfinished blockers.
- Prefer the user's language if the context is clearly non-English; otherwise English.
"#;

/// Run headless summary generation for a sticky task-complete latch.
pub async fn generate_attention_summary(
    latch: &AgentAttentionLatch,
    settings: &AttentionSummarySettings,
) -> Result<AttentionSummaryPayload> {
    let context = build_context_block(latch);
    let prompt = format!(
        "Pane: {}\nSession: {}\nTool: {}\nRaised at: {}\nProject: {}\n\nRecent work context:\n{}",
        latch.stable_pane_id,
        latch.session_id,
        latch
            .tool
            .map(|t| t.to_string())
            .unwrap_or_else(|| "unknown".into()),
        latch.raised_at,
        latch
            .project_path
            .as_deref()
            .unwrap_or("(unknown project path)"),
        if context.trim().is_empty() {
            "(no git/terminal context available — infer cautiously)"
        } else {
            context.as_str()
        }
    );

    let provider = resolve_summary_provider(settings)?;
    info!(
        pane = %latch.stable_pane_id,
        provider = %provider.id,
        agent_id = ?provider.agent_id,
        model = %provider.model,
        "Generating unattended attention summary"
    );

    let request = GenerateTextRequest {
        system: Some(SYSTEM_PROMPT.to_string()),
        prompt,
        temperature: Some(0.2),
        max_output_tokens: Some(provider.max_output_tokens.unwrap_or(1024).min(2048)),
        response_format: ResponseFormat::JsonObject,
    };

    let response = generate_text(&provider, request).await.map_err(|error| {
        ServiceError::Processing(format!("Attention summary generation failed: {error}"))
    })?;

    parse_summary_payload(&response.text)
}

fn resolve_summary_provider(settings: &AttentionSummarySettings) -> Result<ResolvedLlmProvider> {
    if let Some(agent_id) = settings.agent_id.as_deref() {
        // Validate the agent can run headless (automation path) before building provider.
        let run_config = settings.model.as_ref().map(|model| AutomationAgentRunConfig {
            model: Some(model.clone()),
            ..Default::default()
        });
        let _spec = resolve_automation_agent_with_config(agent_id, run_config.as_ref())?;
        return Ok(ResolvedLlmProvider {
            id: format!("agent-cli:{agent_id}"),
            kind: ProviderKind::AgentCli,
            base_url: String::new(),
            api_key: String::new(),
            model: settings.model.clone().unwrap_or_default(),
            agent_id: Some(agent_id.to_string()),
            timeout: DEFAULT_TIMEOUT,
            max_output_tokens: Some(1024),
            context_window: 32_768,
        });
    }

    // Fall back to default LLM provider (may still be agent-cli via providers.json).
    let store = FileLlmConfigStore::new().map_err(|error| {
        ServiceError::Validation(format!("Failed to open LLM config: {error}"))
    })?;
    let provider = store
        .resolve_default_provider()
        .map_err(|error| {
            ServiceError::Validation(format!("Failed to resolve default LLM provider: {error}"))
        })?
        .ok_or_else(|| {
            ServiceError::Validation(
                "No attention summary agent configured and no default LLM provider is enabled"
                    .to_string(),
            )
        })?;

    // Optional model override for non-agent providers.
    if let Some(model) = settings.model.as_ref() {
        if provider.kind != ProviderKind::AgentCli {
            return Ok(ResolvedLlmProvider {
                model: model.clone(),
                ..provider
            });
        }
    }
    Ok(provider)
}

fn build_context_block(latch: &AgentAttentionLatch) -> String {
    let Some(project_path) = latch
        .project_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return String::new();
    };
    let path = Path::new(project_path);
    if !path.is_dir() {
        return format!("Project path is not a directory: {project_path}");
    }

    let mut sections = Vec::new();

    if let Some(status) = run_git_capture(path, &["status", "--short", "--branch"]) {
        if !status.trim().is_empty() {
            sections.push(format!("## git status\n{}", trim_chars(&status, 4_000)));
        }
    }
    if let Some(log) = run_git_capture(path, &["log", "-8", "--oneline", "--decorate"]) {
        if !log.trim().is_empty() {
            sections.push(format!("## recent commits\n{}", trim_chars(&log, 2_000)));
        }
    }
    if let Some(diff) = run_git_capture(path, &["diff", "--stat", "HEAD"]) {
        if !diff.trim().is_empty() {
            sections.push(format!("## diff stat\n{}", trim_chars(&diff, 3_000)));
        }
    }

    let joined = sections.join("\n\n");
    trim_chars(&joined, MAX_CONTEXT_CHARS)
}

fn run_git_capture(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

fn trim_chars(input: &str, max: usize) -> String {
    let count = input.chars().count();
    if count <= max {
        return input.to_string();
    }
    let kept: String = input.chars().take(max.saturating_sub(20)).collect();
    format!("{kept}\n… (truncated)")
}

pub fn parse_summary_payload(raw: &str) -> Result<AttentionSummaryPayload> {
    let text = raw.trim();
    if text.is_empty() {
        return Err(ServiceError::Processing(
            "Attention summary agent returned empty output".into(),
        ));
    }

    // Tolerate accidental markdown fences.
    let stripped = strip_json_fence(text);
    let value: serde_json::Value = serde_json::from_str(stripped).or_else(|_| {
        // Last resort: extract first {...} block.
        extract_json_object(stripped)
            .ok_or_else(|| {
                ServiceError::Processing(format!(
                    "Attention summary output was not valid JSON: {}",
                    trim_chars(text, 200)
                ))
            })
            .and_then(|slice| {
                serde_json::from_str(slice).map_err(|error| {
                    ServiceError::Processing(format!(
                        "Attention summary JSON parse failed: {error}"
                    ))
                })
            })
    })?;

    let summary = value
        .get("summary")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            ServiceError::Processing("Attention summary JSON missing non-empty `summary`".into())
        })?
        .to_string();

    let next_steps = value
        .get("next_steps")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .take(6)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let can_close_session = value
        .get("can_close_session")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if next_steps.is_empty() {
        warn!("Attention summary had no next_steps; continuing with summary only");
    }

    Ok(AttentionSummaryPayload {
        summary,
        next_steps,
        can_close_session,
    })
}

fn strip_json_fence(text: &str) -> &str {
    let trimmed = text.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        return rest
            .strip_suffix("```")
            .unwrap_or(rest)
            .trim();
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        return rest.strip_suffix("```").unwrap_or(rest).trim();
    }
    trimmed
}

fn extract_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&text[start..=end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_clean_json() {
        let payload = parse_summary_payload(
            r#"{
              "summary": "Implemented attention auto-summary.",
              "next_steps": ["Open PR", "Add UI tests"],
              "can_close_session": true
            }"#,
        )
        .unwrap();
        assert!(payload.summary.contains("attention"));
        assert_eq!(payload.next_steps.len(), 2);
        assert!(payload.can_close_session);
    }

    #[test]
    fn parse_fenced_json() {
        let payload = parse_summary_payload(
            "```json\n{\"summary\":\"Done\",\"next_steps\":[\"Ship\"],\"can_close_session\":false}\n```",
        )
        .unwrap();
        assert_eq!(payload.summary, "Done");
        assert!(!payload.can_close_session);
    }

    #[test]
    fn parse_rejects_missing_summary() {
        let err = parse_summary_payload(r#"{"next_steps":["x"]}"#).unwrap_err();
        assert!(err.to_string().contains("summary"));
    }
}
