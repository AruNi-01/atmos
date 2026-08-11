//! Unattended task-complete attention → headless auto-summary.
//!
//! When a `task_complete` latch stays unacknowledged past a configurable delay,
//! the API spawns a headless agent-cli (or LLM) session to produce structured
//! next-step JSON without polluting the original pane context. State lives in
//! API memory and is pushed over WebSocket so browser refresh keeps the UI.

use std::collections::HashSet;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tracing::{debug, warn};

use super::{AgentAttentionLatch, AgentAttentionReason, AgentHookEvent, AgentHooksService};

/// Drop abandoned in-flight generations after this bound so a hung provider
/// cannot permanently suppress retries for the pane.
const STALE_SUMMARIZING: Duration = Duration::from_secs(10 * 60);
/// Allow retry after a failed generation once this bound elapses.
const STALE_ERROR: Duration = Duration::from_secs(2 * 60);

/// Lifecycle of an attention auto-summary for one pane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttentionSummaryStatus {
    /// Headless summarizer is running.
    Summarizing,
    /// Structured result is ready for the rich input chrome.
    Ready,
    /// Generation failed (payload may include an error string).
    Error,
}

/// Structured payload the headless agent must return (JSON object).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AttentionSummaryPayload {
    /// One-sentence summary of recent work.
    pub summary: String,
    /// Suggested next actions the user can pick (filled into the composer).
    #[serde(default)]
    pub next_steps: Vec<String>,
    /// Whether the original agent session can safely be closed.
    #[serde(default)]
    pub can_close_session: bool,
}

/// In-memory summary state for a terminal pane (keyed by stable pane id).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentAttentionSummary {
    pub stable_pane_id: String,
    pub context_id: String,
    pub session_id: String,
    pub status: AttentionSummaryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub next_steps: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_close_session: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// RFC3339 when summarization started.
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    /// Monotonic generation token so late results cannot overwrite a newer run.
    #[serde(skip)]
    pub generation: u64,
}

/// Settings for unattended attention auto-summary (from terminal_code_agent.json).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttentionSummarySettings {
    pub enabled: bool,
    pub delay_mins: u64,
    pub agent_id: Option<String>,
    pub model: Option<String>,
}

impl Default for AttentionSummarySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            delay_mins: 5,
            agent_id: None,
            model: None,
        }
    }
}

impl AttentionSummarySettings {
    pub fn from_json(val: &serde_json::Value) -> Self {
        let enabled = val
            .get("attention_summary_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let delay_mins = val
            .get("attention_summary_delay_mins")
            .and_then(|v| v.as_u64())
            .filter(|v| *v >= 1)
            .unwrap_or(5)
            .min(24 * 60);
        let agent_id = val
            .get("attention_summary_agent_id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let model = val
            .get("attention_summary_model")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        Self {
            enabled,
            delay_mins,
            agent_id,
            model,
        }
    }

    pub fn delay(&self) -> Duration {
        Duration::from_secs(self.delay_mins.saturating_mul(60).max(60))
    }
}

fn row_timestamp(row: &AgentAttentionSummary) -> Option<DateTime<Utc>> {
    let raw = row
        .completed_at
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(row.started_at.as_str());
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

fn is_stale_summary_row(row: &AgentAttentionSummary, now: DateTime<Utc>) -> bool {
    let Some(ts) = row_timestamp(row) else {
        return true;
    };
    let age = now.signed_duration_since(ts);
    match row.status {
        AttentionSummaryStatus::Summarizing => {
            age >= chrono::Duration::from_std(STALE_SUMMARIZING)
                .unwrap_or_else(|_| chrono::Duration::minutes(10))
        }
        AttentionSummaryStatus::Error => {
            age >= chrono::Duration::from_std(STALE_ERROR)
                .unwrap_or_else(|_| chrono::Duration::minutes(2))
        }
        AttentionSummaryStatus::Ready => false,
    }
}

impl AgentHooksService {
    pub fn get_all_attention_summaries(&self) -> Vec<AgentAttentionSummary> {
        self.summaries.read().values().cloned().collect()
    }

    pub fn get_attention_summary(&self, stable_pane_id: &str) -> Option<AgentAttentionSummary> {
        self.summaries.read().get(stable_pane_id).cloned()
    }

    /// Drop abandoned / failed rows that would otherwise block forever, and
    /// broadcast clear events for removed panes.
    pub fn prune_stale_attention_summaries(&self) -> Vec<String> {
        let now = Utc::now();
        let stale_ids: Vec<String> = {
            let summaries = self.summaries.read();
            summaries
                .iter()
                .filter(|(_, row)| is_stale_summary_row(row, now))
                .map(|(key, _)| key.clone())
                .collect()
        };
        if stale_ids.is_empty() {
            return Vec::new();
        }
        self.clear_attention_summaries_matching_ids(&stale_ids)
    }

    /// Task-complete latches that have waited past `delay` and do not yet have
    /// an in-flight or finished summary. Permission latches are never summarized.
    pub fn attention_due_for_summary(&self, delay: Duration) -> Vec<AgentAttentionLatch> {
        // Expire abandoned/failed rows first so they become eligible again.
        self.prune_stale_attention_summaries();

        let cutoff = Utc::now()
            - chrono::Duration::from_std(delay).unwrap_or_else(|_| chrono::Duration::minutes(5));
        let summaries = self.summaries.read();
        self.attention
            .read()
            .values()
            .filter(|latch| latch.reason == AgentAttentionReason::TaskComplete)
            .filter(|latch| !summaries.contains_key(&latch.stable_pane_id))
            .filter(|latch| {
                DateTime::parse_from_rfc3339(&latch.raised_at)
                    .map(|t| t.with_timezone(&Utc) <= cutoff)
                    .unwrap_or(true)
            })
            .cloned()
            .collect()
    }

    /// Mark a pane as summarizing. Returns `None` if the latch is gone, not
    /// task-complete, or a summary is already present.
    pub fn begin_attention_summary(
        &self,
        stable_pane_id: &str,
    ) -> Option<(AgentAttentionLatch, AgentAttentionSummary, u64)> {
        let pane_id = stable_pane_id.trim();
        if pane_id.is_empty() {
            return None;
        }

        let latch = {
            let attention = self.attention.read();
            attention.get(pane_id).cloned()
        }?;
        if latch.reason != AgentAttentionReason::TaskComplete {
            return None;
        }

        {
            let summaries = self.summaries.read();
            if summaries.contains_key(pane_id) {
                return None;
            }
        }

        let generation = {
            let mut gen = self.summary_generation.write();
            let next = gen.saturating_add(1).max(1);
            *gen = next;
            next
        };

        let summary = AgentAttentionSummary {
            stable_pane_id: latch.stable_pane_id.clone(),
            context_id: latch.context_id.clone(),
            session_id: latch.session_id.clone(),
            status: AttentionSummaryStatus::Summarizing,
            summary: None,
            next_steps: Vec::new(),
            can_close_session: None,
            error: None,
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
            generation,
        };

        {
            let mut summaries = self.summaries.write();
            // Race: another begin won.
            if summaries.contains_key(pane_id) {
                return None;
            }
            summaries.insert(pane_id.to_string(), summary.clone());
        }

        self.broadcast_summary_updated(summary.clone());
        Some((latch, summary, generation))
    }

    /// Apply a successful generation. Ignores stale generation tokens.
    pub fn complete_attention_summary(
        &self,
        stable_pane_id: &str,
        generation: u64,
        payload: AttentionSummaryPayload,
    ) -> Option<AgentAttentionSummary> {
        let pane_id = stable_pane_id.trim();
        if pane_id.is_empty() {
            return None;
        }
        // Still need the latch — user may have acknowledged mid-flight.
        if !self.attention.read().contains_key(pane_id) {
            self.clear_attention_summaries_matching_ids(&[pane_id.to_string()]);
            return None;
        }

        let updated = {
            let mut summaries = self.summaries.write();
            let entry = summaries.get_mut(pane_id)?;
            if entry.generation != generation {
                debug!(
                    "Ignoring stale attention summary completion for {} (gen {} != {})",
                    pane_id, generation, entry.generation
                );
                return None;
            }
            entry.status = AttentionSummaryStatus::Ready;
            entry.summary = Some(payload.summary.trim().to_string());
            entry.next_steps = payload
                .next_steps
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .take(6)
                .collect();
            entry.can_close_session = Some(payload.can_close_session);
            entry.error = None;
            entry.completed_at = Some(Utc::now().to_rfc3339());
            entry.clone()
        };
        self.broadcast_summary_updated(updated.clone());
        Some(updated)
    }

    /// Apply a failed generation. Ignores stale generation tokens.
    pub fn fail_attention_summary(
        &self,
        stable_pane_id: &str,
        generation: u64,
        error: impl Into<String>,
    ) -> Option<AgentAttentionSummary> {
        let pane_id = stable_pane_id.trim();
        if pane_id.is_empty() {
            return None;
        }
        if !self.attention.read().contains_key(pane_id) {
            self.clear_attention_summaries_matching_ids(&[pane_id.to_string()]);
            return None;
        }

        let updated = {
            let mut summaries = self.summaries.write();
            let entry = summaries.get_mut(pane_id)?;
            if entry.generation != generation {
                return None;
            }
            entry.status = AttentionSummaryStatus::Error;
            entry.error = Some(error.into());
            entry.completed_at = Some(Utc::now().to_rfc3339());
            entry.clone()
        };
        self.broadcast_summary_updated(updated.clone());
        Some(updated)
    }

    /// Drop summary rows for the given pane/session ids (also on attention clear).
    pub fn clear_attention_summaries_matching_ids(&self, ids: &[String]) -> Vec<String> {
        let id_set: HashSet<&str> = ids
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if id_set.is_empty() {
            return Vec::new();
        }

        let cleared: Vec<String> = {
            let mut summaries = self.summaries.write();
            let to_clear: Vec<String> = summaries
                .iter()
                .filter(|(key, row)| {
                    id_set.contains(key.as_str()) || id_set.contains(row.session_id.as_str())
                })
                .map(|(key, _)| key.clone())
                .collect();
            for key in &to_clear {
                summaries.remove(key);
            }
            to_clear
        };

        if !cleared.is_empty() {
            self.broadcast_summary_cleared(cleared.clone());
        }
        cleared
    }

    fn broadcast_summary_updated(&self, summary: AgentAttentionSummary) {
        if let Err(error) = self
            .event_tx
            .send(AgentHookEvent::AttentionSummaryUpdated(summary))
        {
            warn!("Failed to publish attention summary update: {}", error);
        }
    }

    fn broadcast_summary_cleared(&self, stable_pane_ids: Vec<String>) {
        if let Err(error) = self
            .event_tx
            .send(AgentHookEvent::AttentionSummaryCleared { stable_pane_ids })
        {
            warn!("Failed to publish attention summary cleared: {}", error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_hooks::{
        AgentHookState, AgentHooksService, AgentToolType, AtmosContext, StateUpdateKind,
    };

    fn ctx_with_pane(pane_id: &str) -> AtmosContext {
        AtmosContext {
            pane_id: Some(pane_id.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AtmosContext::default()
        }
    }

    fn raise_task_complete(service: &AgentHooksService, pane: &str) {
        let ctx = ctx_with_pane(pane);
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/proj".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            pane,
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/proj".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
    }

    #[test]
    fn settings_parse_defaults_and_bounds() {
        let defaults = AttentionSummarySettings::from_json(&serde_json::json!({}));
        assert!(defaults.enabled);
        assert_eq!(defaults.delay_mins, 5);
        assert!(defaults.agent_id.is_none());

        let custom = AttentionSummarySettings::from_json(&serde_json::json!({
            "attention_summary_enabled": false,
            "attention_summary_delay_mins": 12,
            "attention_summary_agent_id": "  codex  ",
            "attention_summary_model": "gpt-5",
        }));
        assert!(!custom.enabled);
        assert_eq!(custom.delay_mins, 12);
        assert_eq!(custom.agent_id.as_deref(), Some("codex"));
        assert_eq!(custom.model.as_deref(), Some("gpt-5"));
    }

    #[test]
    fn due_only_after_delay_and_task_complete() {
        let service = AgentHooksService::new();
        raise_task_complete(&service, "ws-1:main");
        // Fresh latch is not due yet for a long delay.
        assert!(service
            .attention_due_for_summary(Duration::from_secs(300))
            .is_empty());
        // Zero-ish delay (clamped in settings, but raw Duration::ZERO here) → due.
        let due = service.attention_due_for_summary(Duration::from_secs(0));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].stable_pane_id, "ws-1:main");
    }

    #[test]
    fn begin_complete_and_clear_summary_flow() {
        let service = AgentHooksService::new();
        raise_task_complete(&service, "ws-1:main");
        let (latch, row, gen) = service.begin_attention_summary("ws-1:main").expect("begin");
        assert_eq!(latch.stable_pane_id, "ws-1:main");
        assert_eq!(row.status, AttentionSummaryStatus::Summarizing);
        assert!(service.begin_attention_summary("ws-1:main").is_none());

        let ready = service
            .complete_attention_summary(
                "ws-1:main",
                gen,
                AttentionSummaryPayload {
                    summary: "Shipped the attention summary feature.".into(),
                    next_steps: vec!["Open PR".into(), "Write tests".into()],
                    can_close_session: true,
                },
            )
            .expect("complete");
        assert_eq!(ready.status, AttentionSummaryStatus::Ready);
        assert_eq!(ready.next_steps.len(), 2);
        assert_eq!(ready.can_close_session, Some(true));

        // Clear attention also drops summary.
        service.clear_attention_for_pane("ws-1:main");
        assert!(service.get_all_attention_summaries().is_empty());
    }

    #[test]
    fn stale_generation_is_ignored() {
        let service = AgentHooksService::new();
        raise_task_complete(&service, "ws-1:main");
        let (_, _, gen) = service.begin_attention_summary("ws-1:main").expect("begin");
        assert!(service
            .complete_attention_summary(
                "ws-1:main",
                gen + 1,
                AttentionSummaryPayload {
                    summary: "stale".into(),
                    next_steps: vec![],
                    can_close_session: false,
                },
            )
            .is_none());
        assert_eq!(
            service.get_attention_summary("ws-1:main").unwrap().status,
            AttentionSummaryStatus::Summarizing
        );
    }

    #[test]
    fn permission_latches_are_not_summarized() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::PermissionRequest,
            Some("/tmp/proj".into()),
            &ctx,
            StateUpdateKind::Permission,
        );
        assert!(service
            .attention_due_for_summary(Duration::from_secs(0))
            .is_empty());
        assert!(service.begin_attention_summary("ws-1:main").is_none());
    }

    #[test]
    fn failed_summary_expires_and_becomes_due_again() {
        let service = AgentHooksService::new();
        raise_task_complete(&service, "ws-1:main");
        let (_, _, gen) = service.begin_attention_summary("ws-1:main").expect("begin");
        service
            .fail_attention_summary("ws-1:main", gen, "provider down")
            .expect("fail");
        // Fresh Error row still blocks due.
        assert!(service
            .attention_due_for_summary(Duration::from_secs(0))
            .is_empty());

        // Backdate completed_at past STALE_ERROR so prune can run.
        service.test_set_summary_timestamps(
            "ws-1:main",
            (Utc::now() - chrono::Duration::minutes(5)).to_rfc3339(),
            Some((Utc::now() - chrono::Duration::minutes(3)).to_rfc3339()),
        );
        let due = service.attention_due_for_summary(Duration::from_secs(0));
        assert_eq!(due.len(), 1);
        assert!(service.get_attention_summary("ws-1:main").is_none());
    }
}
