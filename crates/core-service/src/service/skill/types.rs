use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ScanStatus {
    Enabled,
    Disabled,
}

impl ScanStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Enabled => "enabled",
            Self::Disabled => "disabled",
        }
    }
}

/// Shared context for recursive skill scanning (immutable per scan tree).
pub(super) struct ScanContext<'a> {
    pub(super) scan_base: &'a Path,
    pub(super) scope_root: &'a Path,
    pub(super) scope: &'a str,
    pub(super) skill_dir: &'a str,
    pub(super) agent: &'a str,
    pub(super) project_id: Option<String>,
    pub(super) project_name: Option<String>,
    pub(super) status: ScanStatus,
    pub(super) mode: ScanMode,
}

/// Per-entry classification data produced during directory traversal.
pub(super) struct SkillEntryMeta {
    pub(super) original_path: PathBuf,
    pub(super) resolved_path: Option<PathBuf>,
    pub(super) entry_kind: String,
    pub(super) symlink_target: Option<String>,
    pub(super) status: ScanStatus,
}

/// Controls how aggressively file contents are read during a scan.
///
/// Skills carry a `files` list with per-file `content` strings. A full scan reads every
/// text file (`.md`, `.json`, `.py`, ...) under every skill directory - fine for the
/// detail page, but wasteful for the list UI which only needs the main file's
/// frontmatter (title / description). Lazy mode reads content only for `is_main`
/// files, leaving every other file's `content` as `None`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanMode {
    /// Populate `content` for every text file in the skill. Used by `skills_get`
    /// (detail page), where the editor needs to load files on demand.
    Full,
    /// Populate `content` only for `is_main` files (SKILL.md / README.md / ...).
    /// Used by `skills_list` so the list endpoint doesn't pay for ~250KB of markdown
    /// bodies the list UI never reads.
    Lazy,
}
