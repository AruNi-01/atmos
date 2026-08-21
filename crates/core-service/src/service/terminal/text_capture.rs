//! Shared plain-text terminal capture helpers.
//!
//! Used by side chat /spawn context, attention auto-summary, run-log tee, and any
//! other feature that needs readable terminal content without ANSI noise.

/// Default budget for side-chat style prompt seeding (~96 KiB).
pub const DEFAULT_PROMPT_BUDGET_BYTES: usize = 98_304;
pub const MIN_PROMPT_BUDGET_BYTES: usize = 8_192;
pub const MAX_PROMPT_BUDGET_BYTES: usize = 131_072;

/// How much raw `capture-pane` text to keep before budgeting (prevents huge history).
pub const DEFAULT_MAX_RAW_CAPTURE_BYTES: usize = 524_288;
/// Approximate scrollback lines requested from tmux (`capture-pane -S -N`).
pub const DEFAULT_CAPTURE_APPROX_LINES: i32 = 12_000;
/// Head-of-transcript bytes kept when mid-section is omitted (side-chat default).
pub const DEFAULT_HEAD_PREFIX_BYTES: usize = 8_192;

/// How to window a long transcript into a prompt-sized budget.
#[derive(Debug, Clone, Copy)]
pub struct TranscriptBudget {
    /// Max UTF-8 bytes in the selected text (marker included when truncated).
    pub max_text_bytes: usize,
    /// Bytes kept from the start of the transcript when mid is omitted.
    /// `0` means tail-only (prefer recent output).
    pub head_prefix_bytes: usize,
}

impl TranscriptBudget {
    pub fn side_chat(max_text_bytes: usize) -> Self {
        Self {
            max_text_bytes: max_text_bytes.clamp(MIN_PROMPT_BUDGET_BYTES, MAX_PROMPT_BUDGET_BYTES),
            head_prefix_bytes: DEFAULT_HEAD_PREFIX_BYTES,
        }
    }

    /// Attention auto-summary: emphasize recent agent turn, keep a tiny head for titles.
    pub fn attention_summary(max_text_bytes: usize) -> Self {
        let max_text_bytes = max_text_bytes.clamp(2_048, 32_768);
        Self {
            max_text_bytes,
            // Small head for session banner / cwd; bulk is the recent tail.
            head_prefix_bytes: 1_024.min(max_text_bytes / 8).max(256),
        }
    }

    pub fn tail_only(max_text_bytes: usize) -> Self {
        Self {
            max_text_bytes: max_text_bytes.max(1),
            head_prefix_bytes: 0,
        }
    }
}

/// Result of selecting a budgeted slice from captured terminal text.
#[derive(Debug, Clone)]
pub struct SelectedTranscript {
    pub text: String,
    pub omitted_older_bytes: usize,
    pub omitted_middle_bytes: usize,
    pub truncated: bool,
}

/// Strip ANSI CSI/OSC/DCS sequences and most C0 controls for LLM / log use.
///
/// Keeps `\n` and `\t`; normalizes lone `\r` to `\n` and drops `\r` before `\n`.
pub fn strip_ansi_and_controls(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == 0x1b {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            match bytes[i] {
                b'[' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if (0x40..=0x7e).contains(&c) {
                            break;
                        }
                    }
                }
                b']' => {
                    i += 1;
                    while i < bytes.len() {
                        let c = bytes[i];
                        i += 1;
                        if c == 0x07 {
                            break;
                        }
                        if c == 0x1b && i < bytes.len() && bytes[i] == b'\\' {
                            i += 1;
                            break;
                        }
                    }
                }
                b'P' | b'X' | b'^' | b'_' => {
                    i += 1;
                    while i < bytes.len() {
                        if bytes[i] == 0x1b {
                            i += 1;
                            if i < bytes.len() && bytes[i] == b'\\' {
                                i += 1;
                                break;
                            }
                        } else {
                            i += 1;
                        }
                    }
                }
                b'(' | b')' | b'*' | b'+' => {
                    // charset designation: ESC ( B etc.
                    i += 1;
                    if i < bytes.len() {
                        i += 1;
                    }
                }
                _ => {
                    // Single-char ESC sequences
                    i += 1;
                }
            }
            continue;
        }
        // Keep tab and newline; drop other C0 controls and DEL.
        if b == b'\n' || b == b'\t' || b == b'\r' {
            if b == b'\r' {
                // Normalize CR to nothing if followed by LF; else treat as newline.
                if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                    i += 1;
                    continue;
                }
                out.push('\n');
            } else {
                out.push(b as char);
            }
            i += 1;
            continue;
        }
        if b < 0x20 || b == 0x7f {
            i += 1;
            continue;
        }
        // UTF-8: take valid leading bytes as chars via lossy slice walk
        let ch = input[i..].chars().next().unwrap_or('\u{FFFD}');
        let len = ch.len_utf8();
        out.push(ch);
        i += len;
    }
    out
}

/// Count lines in text (empty → 0; otherwise 1 + newline count).
pub fn count_lines(text: &str) -> u32 {
    if text.is_empty() {
        0
    } else {
        text.matches('\n').count() as u32 + 1
    }
}

pub fn byte_prefix(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

pub fn byte_suffix(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut start = text.len().saturating_sub(max_bytes);
    while start < text.len() && !text.is_char_boundary(start) {
        start += 1;
    }
    text[start..].to_string()
}

/// Select a head+tail (or tail-only) window within `budget`.
pub fn select_transcript(text: &str, budget: TranscriptBudget) -> SelectedTranscript {
    let max_bytes = budget.max_text_bytes.max(1);
    if text.len() <= max_bytes {
        return SelectedTranscript {
            text: text.to_string(),
            omitted_older_bytes: 0,
            omitted_middle_bytes: 0,
            truncated: false,
        };
    }

    if budget.head_prefix_bytes == 0 {
        return SelectedTranscript {
            text: byte_suffix(text, max_bytes),
            omitted_older_bytes: text.len().saturating_sub(max_bytes),
            omitted_middle_bytes: 0,
            truncated: true,
        };
    }

    let marker_overhead = 128usize;
    let prefix_budget = budget
        .head_prefix_bytes
        .min(max_bytes / 4)
        .max(256)
        .min(max_bytes.saturating_sub(marker_overhead + 256));
    let tail_budget = max_bytes
        .saturating_sub(prefix_budget + marker_overhead)
        .max(256);
    let prefix = byte_prefix(text, prefix_budget);
    let tail = byte_suffix(text, tail_budget);
    let omitted_middle_bytes = text
        .len()
        .saturating_sub(prefix.len())
        .saturating_sub(tail.len());
    let marker = format!(
        "\n\n[... omitted {omitted_middle_bytes} bytes from the middle of the terminal transcript ...]\n\n"
    );
    let mut selected = format!("{prefix}{marker}{tail}");
    if selected.len() > max_bytes {
        selected = byte_suffix(&selected, max_bytes);
    }

    SelectedTranscript {
        text: selected,
        omitted_older_bytes: 0,
        omitted_middle_bytes,
        truncated: true,
    }
}

/// Normalize raw tmux capture into prompt-safe text within budgets.
///
/// 1. Keep the newest `max_raw_bytes` of the capture (drop older scrollback).
/// 2. Strip ANSI / control sequences.
/// 3. Window into `budget` with optional head+tail selection.
pub fn process_captured_pane_text(
    raw_full: &str,
    max_raw_bytes: usize,
    budget: TranscriptBudget,
) -> SelectedTranscript {
    let max_raw_bytes = max_raw_bytes.max(1);
    let omitted_older_bytes = raw_full.len().saturating_sub(max_raw_bytes);
    let raw = byte_suffix(raw_full, max_raw_bytes);
    let plain = strip_ansi_and_controls(&raw);
    let mut selected = select_transcript(&plain, budget);
    selected.omitted_older_bytes = selected
        .omitted_older_bytes
        .saturating_add(omitted_older_bytes);
    selected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_ansi_color() {
        let raw = "\x1b[31merror\x1b[0m hello\n";
        let out = strip_ansi_and_controls(raw);
        assert_eq!(out, "error hello\n");
        assert!(!out.contains('\x1b'));
    }

    #[test]
    fn select_fits_without_truncation() {
        let selected = select_transcript("short", TranscriptBudget::tail_only(100));
        assert_eq!(selected.text, "short");
        assert!(!selected.truncated);
    }

    #[test]
    fn select_tail_only_keeps_end() {
        let text = "a".repeat(100) + "TAIL";
        let selected = select_transcript(&text, TranscriptBudget::tail_only(10));
        assert!(selected.text.ends_with("TAIL"));
        assert!(selected.truncated);
        assert!(selected.omitted_older_bytes > 0);
    }

    #[test]
    fn select_head_tail_omits_middle() {
        let text = format!("{}MID{}", "H".repeat(2_000), "T".repeat(2_000));
        let selected = select_transcript(
            &text,
            TranscriptBudget {
                max_text_bytes: 1_200,
                head_prefix_bytes: 400,
            },
        );
        assert!(selected.truncated);
        assert!(selected.omitted_middle_bytes > 0);
        assert!(selected.text.starts_with('H'));
        assert!(selected.text.ends_with('T'));
        assert!(selected.text.contains("omitted"));
    }

    #[test]
    fn process_strips_ansi_and_budgets() {
        let raw = format!("\x1b[32m{}\x1b[0mEND", "x".repeat(5_000));
        let selected = process_captured_pane_text(
            &raw,
            10_000,
            TranscriptBudget {
                max_text_bytes: 500,
                head_prefix_bytes: 0,
            },
        );
        assert!(selected.text.ends_with("END"));
        assert!(!selected.text.contains('\x1b'));
    }
}
