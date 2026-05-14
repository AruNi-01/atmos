//! GitIgnore directory compensation for newly-created workspaces.
//!
//! When a workspace is created via `git worktree add`, files matched by the
//! repository's `.gitignore` (typical examples: `.claude/`, `.agents/`, `skills/`,
//! `.cursor/`, `.env`, locally-generated config) are NOT carried into the new
//! worktree. For workflows that depend on those files (especially agent
//! skills/commands directories), this leaves the worktree functionally broken.
//!
//! This module:
//!   1. Stores a user-editable list of "directories or files to compensate"
//!      under `workspace_settings.gitignore_dirs` in `~/.atmos/function_settings.json`.
//!   2. Ships a curated list of built-in defaults (common agent tool dirs).
//!   3. Exposes `compensate(source_root, target_root)` which the workspace
//!      service calls right after `git worktree add` succeeds.
//!
//! Per-entry strategy is one of `symlink` | `copy` | `off` (off = skip).
//!
//! NOTE: This module deliberately does NOT depend on `service::skill` — although
//! the built-in defaults overlap with agent-skill paths, this is a generic
//! "gitignore compensation" feature that may also be used for non-agent files
//! (`.env`, custom prompt dirs, etc.).

use crate::error::{Result, ServiceError};
use core_engine::{compensate_path, list_ignored_paths, CompensateStrategy};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Top-level key inside `function_settings.json`.
const SETTINGS_FUNCTION_KEY: &str = "workspace_settings";
/// Sub-key holding the gitignore-dirs config object.
const SETTINGS_SUB_KEY: &str = "gitignore_dirs";

/// Built-in directories that are gitignored by virtually every agent-using
/// project. Users can disable any of these by setting strategy = "off", but
/// cannot delete them (so they reappear as defaults if config is wiped).
///
/// Tuple is `(stable_id, relative_path)`. `stable_id` is what we persist so
/// renaming the relative path later won't desync user choices.
const BUILTIN_GITIGNORE_DIRS: &[(&str, &str)] = &[
    // Project-level skills/agents
    ("project-skills", "skills"),
    ("project-agents", "agents"),
    // Per-agent tool dirs (parent dirs cover skills/commands/agents/etc.)
    ("amp", ".agents"),
    ("antigravity", ".agent"),
    ("augment", ".augment"),
    ("claude", ".claude"),
    ("cline", ".cline"),
    ("codebuddy", ".codebuddy"),
    ("codex", ".codex"),
    ("commandcode", ".commandcode"),
    ("continue", ".continue"),
    ("crush", ".crush"),
    ("cursor", ".cursor"),
    ("factory", ".factory"),
    ("gemini", ".gemini"),
    ("copilot", ".github/skills"),
    ("goose", ".goose"),
    ("junie", ".junie"),
    ("iflow", ".iflow"),
    ("kilocode", ".kilocode"),
    ("kiro", ".kiro"),
    ("kode", ".kode"),
    ("mcpjam", ".mcpjam"),
    ("vibe", ".vibe"),
    ("mux", ".mux"),
    ("opencode", ".opencode"),
    ("openclaude", ".openclaude"),
    ("openhands", ".openhands"),
    ("pi", ".pi"),
    ("qoder", ".qoder"),
    ("qwen", ".qwen"),
    ("roo", ".roo"),
    ("trae", ".trae"),
    ("windsurf", ".windsurf"),
    ("zencoder", ".zencoder"),
    ("neovate", ".neovate"),
    ("pochi", ".pochi"),
    ("adal", ".adal"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Strategy {
    Symlink,
    Copy,
    Off,
}

impl Default for Strategy {
    fn default() -> Self {
        Self::Symlink
    }
}

impl Strategy {
    fn to_engine(self) -> Option<CompensateStrategy> {
        match self {
            Self::Symlink => Some(CompensateStrategy::Symlink),
            Self::Copy => Some(CompensateStrategy::Copy),
            Self::Off => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitIgnoreDirEntry {
    /// Stable identifier. For built-ins this is the agent key (e.g. "claude");
    /// for user-added entries this is a generated UUID-like string from the frontend.
    pub id: String,
    /// Path relative to the project root (e.g. ".claude" or "skills").
    pub path: String,
    pub strategy: Strategy,
    /// `true` if this entry comes from `BUILTIN_GITIGNORE_DIRS` — the UI must
    /// hide the delete button for these (user can only change strategy).
    pub builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitIgnoreDirsConfig {
    /// Master switch — when false, `compensate()` is a no-op regardless of entries.
    pub enabled: bool,
    pub entries: Vec<GitIgnoreDirEntry>,
}

impl Default for GitIgnoreDirsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            entries: builtin_entries(),
        }
    }
}

fn builtin_entries() -> Vec<GitIgnoreDirEntry> {
    BUILTIN_GITIGNORE_DIRS
        .iter()
        .map(|(id, path)| GitIgnoreDirEntry {
            id: (*id).to_string(),
            path: (*path).to_string(),
            strategy: Strategy::Symlink,
            builtin: true,
        })
        .collect()
}

fn function_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("function_settings.json")
}

/// Load the config, merging persisted state with built-in defaults so that:
///   - Newly-added built-ins (after upgrade) appear automatically.
///   - User overrides on built-ins (changed strategy) are preserved.
///   - User-added custom entries are preserved.
pub fn load_config() -> GitIgnoreDirsConfig {
    let path = function_settings_path();
    let raw: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!({}));

    let section = raw
        .get(SETTINGS_FUNCTION_KEY)
        .and_then(|v| v.get(SETTINGS_SUB_KEY));

    let Some(section) = section else {
        return GitIgnoreDirsConfig::default();
    };

    let enabled = section
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let stored_entries: Vec<GitIgnoreDirEntry> = section
        .get("entries")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Merge: keep stored entries first (preserves user strategy choices and ordering),
    // then append any built-ins that are missing from storage.
    let mut entries = stored_entries.clone();
    for (id, path) in BUILTIN_GITIGNORE_DIRS {
        if !entries.iter().any(|e| e.id == *id && e.builtin) {
            entries.push(GitIgnoreDirEntry {
                id: (*id).to_string(),
                path: (*path).to_string(),
                strategy: Strategy::Symlink,
                builtin: true,
            });
        }
    }

    GitIgnoreDirsConfig { enabled, entries }
}

/// Persist the config back to `function_settings.json` (preserves other sections).
pub fn save_config(config: &GitIgnoreDirsConfig) -> Result<()> {
    let path = function_settings_path();
    let mut root: Value = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(json!({}))
    } else {
        json!({})
    };

    if !root.is_object() {
        root = json!({});
    }
    let root_obj = root.as_object_mut().unwrap();

    let section = root_obj
        .entry(SETTINGS_FUNCTION_KEY.to_string())
        .or_insert(json!({}));
    if !section.is_object() {
        *section = json!({});
    }
    let section_obj = section.as_object_mut().unwrap();

    section_obj.insert(
        SETTINGS_SUB_KEY.to_string(),
        serde_json::to_value(config).map_err(|e| {
            ServiceError::Validation(format!("Serialize gitignore_dirs config: {}", e))
        })?,
    );

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            ServiceError::Validation(format!("Create ~/.atmos: {}", e))
        })?;
    }
    let pretty = serde_json::to_string_pretty(&root)
        .map_err(|e| ServiceError::Validation(format!("Serialize settings: {}", e)))?;
    std::fs::write(&path, pretty).map_err(|e| {
        ServiceError::Validation(format!("Write function_settings.json: {}", e))
    })?;

    Ok(())
}

/// Compensate gitignored paths from `source_root` (the original repo) into
/// `target_root` (the freshly-created worktree). Best-effort: per-entry failures
/// are logged but do not abort the whole operation, so a single broken symlink
/// won't break workspace creation.
pub fn compensate(source_root: &Path, target_root: &Path) -> CompensationReport {
    let mut report = CompensationReport::default();
    let config = load_config();
    if !config.enabled {
        report.skipped_disabled = true;
        return report;
    }

    for entry in &config.entries {
        let Some(strategy) = entry.strategy.to_engine() else {
            report.skipped += 1;
            continue;
        };

        // Disallow paths that escape the project root (no `..`, no absolute paths).
        let rel = Path::new(&entry.path);
        if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            tracing::warn!(
                "[gitignore_dirs] Skipping unsafe path: {} (absolute or parent traversal)",
                entry.path
            );
            report.failed += 1;
            continue;
        }

        if !source_root.join(rel).exists() {
            // Source dir doesn't exist in the original repo — nothing to compensate.
            report.skipped += 1;
            continue;
        }

        // Ask git for the exact set of paths under this entry that are
        // currently ignored AND present in the source repo. This is the
        // only thing we will compensate — anything else is either tracked
        // (already synced by `git worktree add`) or untracked-not-ignored
        // (user WIP / branch differences, out of scope for this feature).
        //
        // For an entirely-ignored top-level dir like `.claude`, git returns
        // a single entry `.claude/`. For partial cases like
        // `agents/skills/*` + `!agents/skills/keep-*`, git returns just the
        // ignored children (e.g. `agents/skills/cache/`). Either way: zero
        // filesystem walking on our side.
        let ignored_paths = list_ignored_paths(source_root, rel);
        if ignored_paths.is_empty() {
            tracing::debug!(
                "[gitignore_dirs] Nothing ignored under `{}` — skipping",
                entry.path
            );
            report.skipped += 1;
            continue;
        }

        let mut entry_applied = 0usize;
        let mut entry_failed = 0usize;
        for raw in ignored_paths {
            // git ls-files returns paths relative to the repo root; trailing
            // `/` marks a directory entry — strip it for path joins.
            let relative = raw.trim_end_matches('/');
            if relative.is_empty() {
                continue;
            }
            let child_source = source_root.join(relative);
            let child_target = target_root.join(relative);

            match compensate_path(&child_source, &child_target, strategy) {
                Ok(()) => entry_applied += 1,
                Err(e) => {
                    tracing::warn!(
                        "[gitignore_dirs] Failed to compensate `{}`: {}",
                        relative,
                        e
                    );
                    entry_failed += 1;
                }
            }
        }

        if entry_failed > 0 {
            report.failed += 1;
        } else {
            report.applied += 1;
        }
        tracing::info!(
            "[gitignore_dirs] `{}` ({:?}): {} compensated, {} failed",
            entry.path,
            entry.strategy,
            entry_applied,
            entry_failed
        );
    }

    report
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct CompensationReport {
    pub applied: usize,
    pub skipped: usize,
    pub failed: usize,
    pub skipped_disabled: bool,
}
