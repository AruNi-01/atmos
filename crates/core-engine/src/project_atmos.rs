//! Project-local `.atmos/` layout and gitignore policy.
//!
//! Call [`ensure_project_atmos_dir`] whenever Atmos first creates or writes under
//! `<project>/.atmos/`. That is the single place that owns the full managed
//! `.atmos/.gitignore` content. Feature-specific paths (run logs, attachments,
//! tmp) only need to call this helper (or a thin fallback that re-runs it).
//!
//! **Tracked on purpose** (not listed below): `scripts/`, `wiki/` — product
//! content users may commit. **Always ignored**: ephemeral local artifacts.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{EngineError, Result};

/// Directory name under a project / workspace checkout.
pub const PROJECT_ATMOS_DIR: &str = ".atmos";

/// Managed ignore entries relative to `.atmos/` (trailing `/` = directory).
///
/// Order is stable for readable diffs. Features must not invent ad-hoc ignore
/// rules for these paths — extend this list instead.
pub const PROJECT_ATMOS_IGNORED_ENTRIES: &[&str] = &[
    // Agent / chat uploads under the workspace or project root.
    "attachments/",
    // Agent Fix prompts, side-chat / spawn context files, other temp payloads.
    "tmp/",
    // Right-sidebar Run terminal plain-text logs (APP-055).
    "run-logs/",
];

const GITIGNORE_HEADER: &str = "\
# Managed by Atmos — local-only project artifacts under .atmos/
# Atmos merges missing rules on write; keep or extend these lines.
";

/// Create `<project>/.atmos` if needed and ensure `.atmos/.gitignore` contains
/// the full managed ignore set. Returns the absolute (or joined) `.atmos` path.
///
/// - Does **not** require a git repo (gitignore is still useful after `git init`).
/// - Never removes user-added lines.
/// - Idempotent: safe to call on every feature write path as a cheap fallback.
pub fn ensure_project_atmos_dir(project_root: &Path) -> Result<PathBuf> {
    let atmos_dir = project_root.join(PROJECT_ATMOS_DIR);
    fs::create_dir_all(&atmos_dir).map_err(|e| {
        EngineError::FileSystem(format!("Failed to create {}: {}", atmos_dir.display(), e))
    })?;
    ensure_project_atmos_gitignore(&atmos_dir)?;
    Ok(atmos_dir)
}

/// Ensure the managed ignore rules exist in `atmos_dir/.gitignore`.
///
/// Prefer [`ensure_project_atmos_dir`] so the directory is created first.
pub fn ensure_project_atmos_gitignore(atmos_dir: &Path) -> Result<()> {
    let gitignore_path = atmos_dir.join(".gitignore");
    let existing = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path).map_err(|e| {
            EngineError::FileSystem(format!(
                "Failed to read {}: {}",
                gitignore_path.display(),
                e
            ))
        })?
    } else {
        String::new()
    };

    let missing = missing_managed_rules(&existing);
    if missing.is_empty() {
        return Ok(());
    }

    let mut updated = existing;
    if updated.is_empty() {
        updated.push_str(GITIGNORE_HEADER);
    } else if !updated.ends_with('\n') {
        updated.push('\n');
    }

    for rule in missing {
        updated.push_str(rule);
        updated.push('\n');
    }

    fs::write(&gitignore_path, updated).map_err(|e| {
        EngineError::FileSystem(format!(
            "Failed to write {}: {}",
            gitignore_path.display(),
            e
        ))
    })?;
    Ok(())
}

/// Fallback compensation: ensure one managed rule is present (via full merge).
///
/// Prefer calling [`ensure_project_atmos_dir`] at create time; use this only
/// when a feature wants to re-assert a single rule without inventing local logic.
pub fn ensure_project_atmos_ignore_rule(project_root: &Path, rule: &str) -> Result<()> {
    let normalized = normalize_rule(rule);
    if !PROJECT_ATMOS_IGNORED_ENTRIES
        .iter()
        .any(|r| normalize_rule(r) == normalized)
    {
        // Still create dir + full set so unknown callers do not fragment policy.
        ensure_project_atmos_dir(project_root)?;
        return Ok(());
    }
    ensure_project_atmos_dir(project_root)?;
    Ok(())
}

fn normalize_rule(rule: &str) -> String {
    let t = rule.trim().trim_start_matches('/');
    if t.is_empty() {
        return String::new();
    }
    if t.ends_with('/') {
        t.to_string()
    } else {
        format!("{t}/")
    }
}

fn line_covers_rule(line: &str, rule: &str) -> bool {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return false;
    }
    // Broad ignore of everything under .atmos.
    if line == "*" || line == "/*" {
        return true;
    }
    let want = normalize_rule(rule);
    let have = normalize_rule(line);
    have == want
}

fn missing_managed_rules(existing: &str) -> Vec<&'static str> {
    PROJECT_ATMOS_IGNORED_ENTRIES
        .iter()
        .copied()
        .filter(|rule| !existing.lines().any(|line| line_covers_rule(line, rule)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn creates_atmos_and_full_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let atmos = ensure_project_atmos_dir(root).unwrap();
        assert!(atmos.is_dir());
        let gi = fs::read_to_string(atmos.join(".gitignore")).unwrap();
        for rule in PROJECT_ATMOS_IGNORED_ENTRIES {
            assert!(
                gi.lines().any(|l| line_covers_rule(l, rule)),
                "missing {rule} in:\n{gi}"
            );
        }
        assert!(gi.contains("Managed by Atmos"));
    }

    #[test]
    fn merges_missing_rules_without_wiping_user_lines() {
        let dir = tempfile::tempdir().unwrap();
        let atmos = dir.path().join(".atmos");
        fs::create_dir_all(&atmos).unwrap();
        fs::write(
            atmos.join(".gitignore"),
            "# user note\nattachments/\ncustom-keep/\n",
        )
        .unwrap();

        ensure_project_atmos_dir(dir.path()).unwrap();
        let gi = fs::read_to_string(atmos.join(".gitignore")).unwrap();
        assert!(gi.contains("# user note"));
        assert!(gi.contains("custom-keep/"));
        assert!(gi.lines().any(|l| line_covers_rule(l, "attachments/")));
        assert!(gi.lines().any(|l| line_covers_rule(l, "tmp/")));
        assert!(gi.lines().any(|l| line_covers_rule(l, "run-logs/")));
        // attachments already present → only one occurrence
        assert_eq!(
            gi.lines()
                .filter(|l| line_covers_rule(l, "attachments/"))
                .count(),
            1
        );
    }

    #[test]
    fn idempotent() {
        let dir = tempfile::tempdir().unwrap();
        ensure_project_atmos_dir(dir.path()).unwrap();
        let first = fs::read_to_string(dir.path().join(".atmos/.gitignore")).unwrap();
        ensure_project_atmos_dir(dir.path()).unwrap();
        let second = fs::read_to_string(dir.path().join(".atmos/.gitignore")).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn star_covers_all_managed_rules() {
        let dir = tempfile::tempdir().unwrap();
        let atmos = dir.path().join(".atmos");
        fs::create_dir_all(&atmos).unwrap();
        fs::write(atmos.join(".gitignore"), "*\n").unwrap();
        ensure_project_atmos_dir(dir.path()).unwrap();
        let gi = fs::read_to_string(atmos.join(".gitignore")).unwrap();
        assert_eq!(gi, "*\n");
    }
}
