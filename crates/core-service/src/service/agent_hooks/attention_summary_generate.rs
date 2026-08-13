//! Headless generation of attention auto-summary JSON.
//!
//! Spawns a one-shot agent-cli (preferred, same path as automations) or falls
//! back to the default LLM provider. Never attaches to the original pane.
//!
//! Primary context is the pane's plain terminal transcript (same capture path
//! as `/side` and `/spawn`). Optional supplement: relative paths of changed
//! files in the project (no diffs).

use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

use llm::{
    render_prompt_template, FileLlmConfigStore, GenerateTextRequest, ProviderKind,
    ResolvedLlmProvider, ResponseFormat,
};
use tracing::{info, warn};

use super::attention_summary::{AttentionSummaryPayload, AttentionSummarySettings};
use super::AgentAttentionLatch;
use crate::error::{Result, ServiceError};
use crate::service::automation::{resolve_automation_agent_with_config, AutomationAgentRunConfig};
use crate::service::llm_text_generation::generate_text;
use crate::service::terminal::{CapturePanePlainTextParams, TerminalService, TranscriptBudget};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_TERMINAL_CONTEXT_BYTES: u32 = 12_000;
const MAX_CHANGED_FILES: usize = 80;
const MAX_CHANGED_FILES_SECTION_CHARS: usize = 2_000;
const GIT_TIMEOUT: Duration = Duration::from_secs(8);
/// Attention captures: fewer lines than side chat; recent turn is enough.
const ATTENTION_CAPTURE_APPROX_LINES: i32 = 4_000;
const ATTENTION_MAX_RAW_BYTES: usize = 64_000;

const SYSTEM_PROMPT_TEMPLATE: &str =
    include_str!("../../../../../prompt/attention-summary/attention-summary-system.md");
const USER_PROMPT_TEMPLATE: &str =
    include_str!("../../../../../prompt/attention-summary/attention-summary-user.md");

const EMPTY_CONTEXT_FALLBACK: &str =
    "(no terminal transcript or changed-file list available — infer cautiously)";

/// Run headless summary generation for a sticky task-complete latch.
pub async fn generate_attention_summary(
    latch: &AgentAttentionLatch,
    settings: &AttentionSummarySettings,
    terminal: Option<&TerminalService>,
) -> Result<AttentionSummaryPayload> {
    let context = build_context_block(latch, terminal).await;
    let tool = latch
        .tool
        .map(|t| t.to_string())
        .unwrap_or_else(|| "unknown".into());
    let project_path = latch
        .project_path
        .as_deref()
        .unwrap_or("(unknown project path)");
    let context_body = if context.trim().is_empty() {
        EMPTY_CONTEXT_FALLBACK
    } else {
        context.as_str()
    };
    let prompt = render_prompt_template(
        USER_PROMPT_TEMPLATE,
        &[
            ("stable_pane_id", latch.stable_pane_id.as_str()),
            ("session_id", latch.session_id.as_str()),
            ("tool", tool.as_str()),
            ("raised_at", latch.raised_at.as_str()),
            ("project_path", project_path),
            ("context", context_body),
        ],
    );
    let system = SYSTEM_PROMPT_TEMPLATE.trim().to_string();

    let provider = resolve_summary_provider(settings)?;
    info!(
        pane = %latch.stable_pane_id,
        provider = %provider.id,
        agent_id = ?provider.agent_id,
        model = %provider.model,
        "Generating unattended attention summary"
    );

    let request = GenerateTextRequest {
        system: Some(system),
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
        // Only pass model when the user explicitly configured one.
        let run_config = settings
            .model
            .as_ref()
            .map(|model| AutomationAgentRunConfig {
                model: Some(model.clone()),
                ..Default::default()
            });
        let _spec = resolve_automation_agent_with_config(agent_id, run_config.as_ref())?;
        return Ok(ResolvedLlmProvider {
            id: format!("agent-cli:{agent_id}"),
            kind: ProviderKind::AgentCli,
            base_url: String::new(),
            api_key: String::new(),
            // Keep empty unless explicitly configured — agent-cli defaults apply.
            model: settings.model.clone().unwrap_or_default(),
            agent_id: Some(agent_id.to_string()),
            timeout: DEFAULT_TIMEOUT,
            max_output_tokens: Some(1024),
            context_window: 32_768,
        });
    }

    // Fall back to default LLM provider (may still be agent-cli via providers.json).
    let store = FileLlmConfigStore::new()
        .map_err(|error| ServiceError::Validation(format!("Failed to open LLM config: {error}")))?;
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

async fn build_context_block(
    latch: &AgentAttentionLatch,
    terminal: Option<&TerminalService>,
) -> String {
    let mut sections = Vec::new();

    if let Some(text) = capture_terminal_transcript(latch, terminal).await {
        if !text.trim().is_empty() {
            sections.push(format!("## Terminal transcript\n{text}"));
        }
    }

    let project_path = latch
        .project_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(Path::new)
        .filter(|p| p.is_dir());

    if let Some(path) = project_path {
        let path_buf = path.to_path_buf();
        let files = tokio::task::spawn_blocking(move || list_changed_relative_paths(&path_buf))
            .await
            .unwrap_or_default();
        if !files.is_empty() {
            let list = format_changed_files(&files);
            sections.push(format!("## Changed files (relative paths)\n{list}"));
        }
    }

    sections.join("\n\n")
}

async fn capture_terminal_transcript(
    latch: &AgentAttentionLatch,
    terminal: Option<&TerminalService>,
) -> Option<String> {
    let terminal = terminal?;
    let workspace_id = latch.context_id.trim();
    if workspace_id.is_empty() {
        return None;
    }
    let window_name = tmux_window_name_from_latch(latch)?;
    let budget = TranscriptBudget::attention_summary(MAX_TERMINAL_CONTEXT_BYTES as usize);

    match terminal
        .capture_pane_plain_text(CapturePanePlainTextParams {
            workspace_id: workspace_id.to_string(),
            project_name: None,
            workspace_name: None,
            source_session_id: None,
            source_tmux_window_name: window_name.to_string(),
            max_text_bytes: Some(MAX_TERMINAL_CONTEXT_BYTES),
            approx_lines: Some(ATTENTION_CAPTURE_APPROX_LINES),
            max_raw_bytes: Some(ATTENTION_MAX_RAW_BYTES),
            head_prefix_bytes: Some(budget.head_prefix_bytes),
        })
        .await
    {
        Ok(captured) => {
            if captured.text.trim().is_empty() {
                None
            } else {
                Some(captured.text)
            }
        }
        Err(error) => {
            warn!(
                pane = %latch.stable_pane_id,
                window = %window_name,
                "Attention summary terminal capture failed: {error}"
            );
            None
        }
    }
}

/// `stable_pane_id` is `{context_id}:{tmux_window_name}`.
fn tmux_window_name_from_latch(latch: &AgentAttentionLatch) -> Option<&str> {
    let id = latch.stable_pane_id.trim();
    let (_ctx, window) = id.split_once(':')?;
    let window = window.trim();
    if window.is_empty() {
        None
    } else {
        Some(window)
    }
}

/// Relative paths only — no diffs, no status codes, no commit log.
fn list_changed_relative_paths(project_path: &Path) -> Vec<String> {
    let mut paths = BTreeSet::new();

    // Tracked + staged + unstaged vs HEAD.
    if let Some(out) = run_git_capture(project_path, &["diff", "--name-only", "HEAD"]) {
        for line in out.lines() {
            let path = line.trim();
            if !path.is_empty() {
                paths.insert(path.to_string());
            }
        }
    }
    // Untracked files.
    if let Some(out) = run_git_capture(
        project_path,
        &["ls-files", "--others", "--exclude-standard"],
    ) {
        for line in out.lines() {
            let path = line.trim();
            if !path.is_empty() {
                paths.insert(path.to_string());
            }
        }
    }

    paths.into_iter().take(MAX_CHANGED_FILES).collect()
}

fn format_changed_files(files: &[String]) -> String {
    let mut out = String::new();
    for path in files {
        let line = format!("- {path}\n");
        if out.len() + line.len() > MAX_CHANGED_FILES_SECTION_CHARS {
            out.push_str("- … (truncated)\n");
            break;
        }
        out.push_str(&line);
    }
    out
}

fn run_git_capture(cwd: &Path, args: &[&str]) -> Option<String> {
    // Called from spawn_blocking; add a soft timeout so a locked index cannot hang forever.
    let cwd = cwd.to_path_buf();
    let args: Vec<String> = args.iter().map(|s| (*s).to_string()).collect();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = Command::new("git")
            .args(&args)
            .current_dir(&cwd)
            .output()
            .ok()
            .and_then(|output| {
                if !output.status.success() {
                    return None;
                }
                String::from_utf8(output.stdout).ok()
            });
        let _ = tx.send(result);
    });
    rx.recv_timeout(GIT_TIMEOUT).unwrap_or_default()
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
        return rest.strip_suffix("```").unwrap_or(rest).trim();
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

    #[test]
    fn window_name_from_stable_pane() {
        let latch = AgentAttentionLatch {
            stable_pane_id: "ws-guid:main".into(),
            context_id: "ws-guid".into(),
            reason: super::super::AgentAttentionReason::TaskComplete,
            session_id: "s1".into(),
            tool: None,
            project_path: None,
            raised_at: "t".into(),
        };
        assert_eq!(tmux_window_name_from_latch(&latch), Some("main"));
    }

    #[test]
    fn format_changed_files_lists_paths() {
        let text = format_changed_files(&["src/a.rs".into(), "README.md".into()]);
        assert!(text.contains("- src/a.rs"));
        assert!(text.contains("- README.md"));
        assert!(!text.contains("diff"));
    }

    #[test]
    fn prompt_templates_render_with_placeholders() {
        assert!(SYSTEM_PROMPT_TEMPLATE.contains("attention-summary helper"));
        assert!(SYSTEM_PROMPT_TEMPLATE.contains("can_close_session"));

        let rendered = render_prompt_template(
            USER_PROMPT_TEMPLATE,
            &[
                ("stable_pane_id", "ws:main"),
                ("session_id", "sess-1"),
                ("tool", "claude-code"),
                ("raised_at", "t0"),
                ("project_path", "/tmp/proj"),
                ("context", "## Terminal transcript\nhello"),
            ],
        );
        assert!(rendered.contains("Pane: ws:main"));
        assert!(rendered.contains("Tool: claude-code"));
        assert!(rendered.contains("## Terminal transcript\nhello"));
        assert!(!rendered.contains("${"));
    }
}
