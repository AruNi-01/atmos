//! Split a GitHub Actions job plain-text log into per-step excerpts.
//!
//! GitHub only exposes job-level logs. Step boundaries are recovered from the
//! jobs API timestamps (`started_at` / `completed_at`) matched against the
//! ISO-8601 prefix on each log line. Nested `##[group]` markers inside
//! composite actions are intentionally ignored as step boundaries.

use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};

const DEFAULT_RECENT_LINES: usize = 120;
const DEFAULT_PLAIN_TAIL_LINES: usize = 500;
const DEFAULT_ERROR_CONTEXT_LINES: usize = 2;
const DEFAULT_MAX_EARLIER_ERROR_LINES: usize = 40;
const DEFAULT_MAX_BYTES: usize = 24 * 1024;
const EARLIER_SEPARATOR: &str = "… earlier errors …";

#[derive(Debug, Clone)]
pub struct JobStepMeta {
    pub number: u64,
    pub name: String,
    pub conclusion: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    /// Retained for future end-bound heuristics; partitioning primarily uses
    /// started_at + top-level `##[group]Run` handoff.
    #[allow(dead_code)]
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StepLogExcerpt {
    pub number: u64,
    pub name: String,
    pub conclusion: Option<String>,
    pub text: String,
    pub total_lines: usize,
    pub truncated: bool,
}

/// Parse a leading GitHub Actions log timestamp, e.g.
/// `2026-07-07T11:32:03.1269970Z rest of line`.
fn parse_line_timestamp(line: &str) -> Option<DateTime<Utc>> {
    // Timestamp ends at first space after a `Z`.
    let z_pos = line.find('Z')?;
    if z_pos < 19 {
        return None;
    }
    // Next char should be whitespace (or end).
    let after = line.as_bytes().get(z_pos + 1).copied();
    if after.is_some_and(|b| b != b' ' && b != b'\t') {
        return None;
    }
    let raw = &line[..=z_pos];
    // Must look like ISO-8601 date.
    if raw.as_bytes().get(4) != Some(&b'-') || raw.as_bytes().get(10) != Some(&b'T') {
        return None;
    }
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
}

fn is_error_marker_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("##[error]")
        || lower.contains("::error::")
        || lower.contains("::error ")
        || lower.contains(" error:")
        || lower.contains("\terror:")
        || lower.contains("failed")
        || lower.contains("exit code")
        || lower.contains("enoent")
        || lower.contains("eacces")
        || lower.contains("panic:")
        || lower.contains("assertionerror")
        || lower.contains("process completed with exit code")
}

pub fn is_failed_step_conclusion(conclusion: Option<&str>) -> bool {
    matches!(
        conclusion.map(|c| c.to_ascii_lowercase()).as_deref(),
        Some("failure") | Some("timed_out") | Some("startup_failure") | Some("cancelled")
    )
}

/// Parse ISO-8601 timestamps from the GitHub jobs API (second precision).
pub fn parse_github_time(value: Option<&str>) -> Option<DateTime<Utc>> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            // Some payloads omit fractional seconds or use space separators.
            DateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M:%SZ")
                .map(|dt| dt.with_timezone(&Utc))
                .ok()
        })
}

fn is_top_level_run_group_line(line: &str) -> bool {
    // Runner emits `##[group]Run …` at the start of uses:/run: steps.
    // Nested composite internals often look like `##[group]Run : …`.
    let Some(idx) = line.find("##[group]") else {
        return false;
    };
    let body = line[idx + "##[group]".len()..].trim_start();
    body.starts_with("Run ") && !body.starts_with("Run :")
}

/// Assign each log line to a top-level job step (API step list order).
///
/// Walks steps in `number` / `started_at` order with a cursor. When the next
/// step's `started_at` is reached, keep consuming lines for the current step
/// until a new top-level `##[group]Run …` line (or a timestamp strictly after
/// the next start second). This handles GitHub's second-precision timestamps
/// where a failed step and the following cleanup share the same clock second.
pub fn partition_log_lines_by_step<'a>(
    log_text: &'a str,
    steps: &[JobStepMeta],
) -> Vec<Vec<&'a str>> {
    let mut buckets: Vec<Vec<&str>> = steps.iter().map(|_| Vec::new()).collect();
    if steps.is_empty() {
        return buckets;
    }

    let mut ordered: Vec<usize> = (0..steps.len()).collect();
    ordered.sort_by(|&a, &b| {
        let sa = &steps[a];
        let sb = &steps[b];
        match (sa.started_at, sb.started_at) {
            (Some(ta), Some(tb)) => ta.cmp(&tb).then_with(|| sa.number.cmp(&sb.number)),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => sa.number.cmp(&sb.number),
        }
    });

    let lines: Vec<&'a str> = log_text.lines().collect();
    let mut cursor = 0usize;

    for (pos, &orig_idx) in ordered.iter().enumerate() {
        let next_start = ordered.get(pos + 1).and_then(|&ni| steps[ni].started_at);
        let step_start = steps[orig_idx].started_at;

        // Skip ahead to this step's start when possible (drop unassigned gap lines
        // into the previous bucket already closed, or the first step).
        while cursor < lines.len() {
            let line = lines[cursor];
            if let (Some(ts), Some(start)) = (parse_line_timestamp(line), step_start) {
                if ts < start {
                    // Belongs to an earlier preamble — attach to first step if still
                    // at the beginning, otherwise leave for previous bucket (already taken).
                    if pos == 0 {
                        buckets[orig_idx].push(line);
                    }
                    cursor += 1;
                    continue;
                }
            }
            break;
        }

        while cursor < lines.len() {
            let line = lines[cursor];
            if let Some(next) = next_start {
                if let Some(ts) = parse_line_timestamp(line) {
                    if ts >= next {
                        // Same-second boundary: only hand off on a new top-level Run group
                        // or a timestamp strictly after the next start second.
                        let strictly_after = ts >= next + Duration::seconds(1);
                        if strictly_after || is_top_level_run_group_line(line) {
                            break;
                        }
                    }
                }
            }
            buckets[orig_idx].push(line);
            cursor += 1;
        }
    }

    // Trailing lines after the last step window.
    if let Some(&last_idx) = ordered.last() {
        while cursor < lines.len() {
            buckets[last_idx].push(lines[cursor]);
            cursor += 1;
        }
    }

    buckets
}

/// Build a display excerpt: keep a recent window, and re-surface earlier error
/// markers so post-failure cleanup does not hide the real failure.
pub fn excerpt_step_log(lines: &[&str]) -> (String, bool) {
    let total = lines.len();
    if total == 0 {
        return (String::new(), false);
    }

    let recent_start = total.saturating_sub(DEFAULT_RECENT_LINES);
    let recent = &lines[recent_start..];

    if recent_start == 0 {
        let text = lines.join("\n");
        let text_len = text.len();
        let capped = apply_byte_cap(&text, DEFAULT_MAX_BYTES);
        let truncated = capped.len() != text_len || total > DEFAULT_PLAIN_TAIL_LINES;
        return (capped, truncated);
    }

    let earlier_indexes = collect_earlier_error_indexes(lines, recent_start);
    if earlier_indexes.is_empty() {
        let start = total.saturating_sub(DEFAULT_PLAIN_TAIL_LINES);
        let text = lines[start..].join("\n");
        let text_len = text.len();
        let capped = apply_byte_cap(&text, DEFAULT_MAX_BYTES);
        let truncated = start > 0 || capped.len() != text_len;
        return (capped, truncated);
    }

    let capped_indexes: Vec<usize> = earlier_indexes
        .into_iter()
        .rev()
        .take(DEFAULT_MAX_EARLIER_ERROR_LINES)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let mut earlier_lines: Vec<&str> = capped_indexes.iter().map(|&i| lines[i]).collect();
    earlier_lines.push(EARLIER_SEPARATOR);
    let text = join_with_byte_budget(&earlier_lines, recent, DEFAULT_MAX_BYTES);
    (text, true)
}

fn collect_earlier_error_indexes(lines: &[&str], recent_start: usize) -> Vec<usize> {
    let mut indexes = std::collections::BTreeSet::new();
    for (index, line) in lines.iter().enumerate().take(recent_start) {
        if !is_error_marker_line(line) {
            continue;
        }
        let start = index.saturating_sub(DEFAULT_ERROR_CONTEXT_LINES);
        let end = (index + DEFAULT_ERROR_CONTEXT_LINES).min(recent_start.saturating_sub(1));
        for ctx in start..=end {
            indexes.insert(ctx);
        }
    }
    indexes.into_iter().collect()
}

fn apply_byte_cap(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    // Walk from the end by char to avoid splitting UTF-8.
    let mut byte_len = 0usize;
    let chars: Vec<char> = text.chars().collect();
    let mut start = chars.len();
    while start > 0 {
        let ch = chars[start - 1];
        let ch_len = ch.len_utf8();
        if byte_len + ch_len > max_bytes {
            break;
        }
        byte_len += ch_len;
        start -= 1;
    }
    chars[start..].iter().collect()
}

fn join_with_byte_budget(prefix_lines: &[&str], recent: &[&str], max_bytes: usize) -> String {
    let prefix = prefix_lines.join("\n");
    if prefix.len() >= max_bytes {
        return apply_byte_cap(&prefix, max_bytes);
    }
    let separator = if !prefix.is_empty() && !recent.is_empty() {
        "\n"
    } else {
        ""
    };
    let budget = max_bytes
        .saturating_sub(prefix.len())
        .saturating_sub(separator.len());
    let recent_text = apply_byte_cap(&recent.join("\n"), budget);
    format!("{prefix}{separator}{recent_text}")
}

/// Partition a full job log and return excerpts for failed steps only.
pub fn build_failed_step_excerpts(log_text: &str, steps: &[JobStepMeta]) -> Vec<StepLogExcerpt> {
    let buckets = partition_log_lines_by_step(log_text, steps);
    let mut out = Vec::new();
    for (idx, step) in steps.iter().enumerate() {
        if !is_failed_step_conclusion(step.conclusion.as_deref()) {
            continue;
        }
        let lines = buckets.get(idx).map(|v| v.as_slice()).unwrap_or(&[]);
        let total_lines = lines.len();
        let (text, truncated) = excerpt_step_log(lines);
        out.push(StepLogExcerpt {
            number: step.number,
            name: step.name.clone(),
            conclusion: step.conclusion.clone(),
            text,
            total_lines,
            truncated: truncated || total_lines > DEFAULT_PLAIN_TAIL_LINES,
        });
    }
    out
}

/// Fallback when steps are missing: single job-level excerpt marked as step 0.
pub fn build_job_level_fallback_excerpt(log_text: &str) -> StepLogExcerpt {
    let lines: Vec<&str> = log_text.lines().collect();
    let total_lines = lines.len();
    let (text, truncated) = excerpt_step_log(&lines);
    StepLogExcerpt {
        number: 0,
        name: "Job log".to_string(),
        conclusion: Some("failure".to_string()),
        text,
        total_lines,
        truncated: truncated || total_lines > DEFAULT_PLAIN_TAIL_LINES,
    }
}

pub fn excerpts_to_json(job_id: u64, excerpts: &[StepLogExcerpt], job_total_lines: usize) -> Value {
    json!({
        "job_id": job_id,
        "job_total_lines": job_total_lines,
        "steps": excerpts.iter().map(|e| json!({
            "number": e.number,
            "name": e.name,
            "conclusion": e.conclusion,
            "text": e.text,
            "total_lines": e.total_lines,
            "truncated": e.truncated,
        })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(number: u64, name: &str, conclusion: &str, start: &str, end: &str) -> JobStepMeta {
        JobStepMeta {
            number,
            name: name.to_string(),
            conclusion: Some(conclusion.to_string()),
            started_at: parse_github_time(Some(start)),
            completed_at: parse_github_time(Some(end)),
        }
    }

    #[test]
    fn partitions_same_second_boundary_keeps_error_with_failed_step() {
        let steps = vec![
            step(
                1,
                "Setup",
                "success",
                "2026-07-07T11:30:15Z",
                "2026-07-07T11:31:00Z",
            ),
            step(
                2,
                "Run suite",
                "failure",
                "2026-07-07T11:32:03Z",
                "2026-07-07T11:33:13Z",
            ),
            step(
                3,
                "Upload",
                "success",
                "2026-07-07T11:33:13Z",
                "2026-07-07T11:33:14Z",
            ),
        ];
        let log = "\
2026-07-07T11:30:15.1000000Z setup line
2026-07-07T11:32:03.1269970Z ##[group]Run bun ./scripts/run-ci-suite.mjs
2026-07-07T11:32:10.0000000Z actual failure output
2026-07-07T11:33:13.4960000Z ##[error]Process completed with exit code 1.
2026-07-07T11:33:13.5030000Z ##[group]Run actions/upload-artifact@v4
2026-07-07T11:33:13.9000000Z uploaded ok
";
        let buckets = partition_log_lines_by_step(log, &steps);
        assert!(buckets[0].iter().any(|l| l.contains("setup line")));
        assert!(buckets[1]
            .iter()
            .any(|l| l.contains("actual failure output")));
        assert!(
            buckets[1].iter().any(|l| l.contains("##[error]")),
            "error should belong to failed step, not upload cleanup"
        );
        assert!(buckets[2].iter().any(|l| l.contains("uploaded ok")));
        assert!(!buckets[2].iter().any(|l| l.contains("##[error]")));
    }

    #[test]
    fn only_failed_steps_in_excerpts() {
        let steps = vec![
            step(
                1,
                "Setup",
                "success",
                "2026-07-07T11:30:15Z",
                "2026-07-07T11:31:00Z",
            ),
            step(
                2,
                "Run suite",
                "failure",
                "2026-07-07T11:32:03Z",
                "2026-07-07T11:33:13Z",
            ),
            step(
                3,
                "Upload",
                "success",
                "2026-07-07T11:33:13Z",
                "2026-07-07T11:33:14Z",
            ),
        ];
        let log = "\
2026-07-07T11:30:15.1000000Z setup
2026-07-07T11:32:05.0000000Z fail body
2026-07-07T11:33:13.4960000Z ##[error]Process completed with exit code 1.
2026-07-07T11:33:13.5030000Z ##[group]Run actions/upload-artifact@v4
2026-07-07T11:33:13.9000000Z upload body
";
        let excerpts = build_failed_step_excerpts(log, &steps);
        assert_eq!(excerpts.len(), 1);
        assert_eq!(excerpts[0].name, "Run suite");
        assert!(excerpts[0].text.contains("fail body"));
        assert!(excerpts[0].text.contains("##[error]"));
        assert!(!excerpts[0].text.contains("upload body"));
    }

    #[test]
    fn resurfaces_earlier_error_when_recent_tail_is_noisy() {
        let mut lines: Vec<String> = (0..80)
            .map(|i| format!("2026-07-07T11:32:00.{i:07}Z installing package {i}"))
            .collect();
        lines.push(
            "2026-07-07T11:32:50.0000000Z ##[error]Process completed with exit code 1.".into(),
        );
        for i in 0..130 {
            lines.push(format!(
                "2026-07-07T11:33:00.{i:07}Z cleanup noise line {i}"
            ));
        }
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
        let (excerpt, truncated) = excerpt_step_log(&refs);
        assert!(truncated);
        assert!(excerpt.contains("##[error]"));
        assert!(excerpt.contains(EARLIER_SEPARATOR));
        assert!(excerpt.contains("cleanup noise line 129"));
    }
}
