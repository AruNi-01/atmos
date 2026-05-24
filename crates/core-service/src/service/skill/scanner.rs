use super::metadata::{extract_description, extract_from_frontmatter, strip_frontmatter};
use super::support::{build_placement_id, build_skill_id, is_manageable_scope};
use super::types::{ScanContext, ScanMode, ScanStatus, SkillEntryMeta};
use super::{SkillScanner, DISABLED_STORAGE_REL_PATH};
use crate::{SkillFile, SkillInfo, SkillPlacement};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Agent skill directory configurations
const AGENT_SKILL_DIRS: &[(&str, &str)] = &[
    ("amp", ".agents/skills"),
    ("antigravity", ".agent/skills"),
    ("augment", ".augment/rules"),
    ("claude", ".claude/skills"),
    ("in-project", "skills"),
    ("cline", ".cline/skills"),
    ("codebuddy", ".codebuddy/skills"),
    ("codex", ".codex/skills"),
    ("commandcode", ".commandcode/skills"),
    ("continue", ".continue/skills"),
    ("crush", ".crush/skills"),
    ("cursor", ".cursor/skills"),
    ("factory", ".factory/skills"),
    ("gemini", ".gemini/skills"),
    ("copilot", ".github/skills"),
    ("goose", ".goose/skills"),
    ("junie", ".junie/skills"),
    ("iflow", ".iflow/skills"),
    ("kilocode", ".kilocode/skills"),
    ("kimi", ".agents/skills"),
    ("kiro", ".kiro/skills"),
    ("kode", ".kode/skills"),
    ("mcpjam", ".mcpjam/skills"),
    ("vibe", ".vibe/skills"),
    ("mux", ".mux/skills"),
    ("opencode", ".opencode/skills"),
    ("openclaude", ".openclaude/skills"),
    ("openhands", ".openhands/skills"),
    ("pi", ".pi/skills"),
    ("qoder", ".qoder/skills"),
    ("qwen", ".qwen/skills"),
    ("replit", ".agent/skills"),
    ("roo", ".roo/skills"),
    ("trae", ".trae/skills"),
    ("windsurf", ".windsurf/skills"),
    ("zencoder", ".zencoder/skills"),
    ("neovate", ".neovate/skills"),
    ("pochi", ".pochi/skills"),
    ("adal", ".adal/skills"),
];

/// Canonical skill entry file
const MAIN_FILE_CANDIDATES: &[&str] = &["SKILL.md"];

/// Text file extensions to read content
const TEXT_EXTENSIONS: &[&str] = &[
    "md", "txt", "json", "yaml", "yml", "toml", "sh", "bash", "zsh", "py", "js", "ts", "rs", "go",
];

impl SkillScanner {
    /// Scan for all installed skills (global + project-level + system built-in) with
    /// full file contents. Preserved for callers that need every `content` field,
    /// e.g. the detail endpoint.
    pub fn scan_all(project_paths: &[(String, String, String)]) -> Vec<SkillInfo> {
        Self::scan_all_with_mode(project_paths, ScanMode::Full)
    }

    /// Scan for all installed skills with caller-controlled content-loading depth.
    pub fn scan_all_with_mode(
        project_paths: &[(String, String, String)],
        mode: ScanMode,
    ) -> Vec<SkillInfo> {
        let mut raw_skills = Vec::new();

        if let Some(home_dir) = dirs::home_dir() {
            raw_skills.extend(Self::scan_scope(&home_dir, "global", None, None, mode));
            raw_skills.extend(Self::scan_system_skills_with_mode(&home_dir, mode));
        }

        for (project_id, project_name, project_path) in project_paths {
            let path = Path::new(project_path);
            if path.exists() {
                raw_skills.extend(Self::scan_scope(
                    path,
                    "project",
                    Some(project_id.clone()),
                    Some(project_name.clone()),
                    mode,
                ));
            }
        }

        Self::merge_skills(raw_skills)
    }

    /// Scan the Atmos system skills directory (`~/.atmos/skills/.system/`).
    ///
    /// Layout:
    /// ```text
    /// ~/.atmos/skills/.system/
    /// ├── project-wiki/                SKILL.md        (direct subdir)
    /// ├── project-wiki-update/         SKILL.md
    /// ├── project-wiki-specify/        SKILL.md
    /// ├── git-commit/                  SKILL.md
    /// ├── atmos-review-fix/            SKILL.md
    /// └── code_review_skills/                          (container, no SKILL.md)
    ///     ├── fullstack-reviewer/         SKILL.md
    ///     ├── code-review-expert/         SKILL.md
    ///     ├── typescript-react-reviewer/  SKILL.md
    ///     └── custom-review-skill-<hex>/  SKILL.md     (user-scaffolded)
    /// ```
    ///
    /// We walk every direct child of `.system/`; any dir with `SKILL.md` becomes a
    /// `scope="system"` skill, and for the well-known `code_review_skills/` container we
    /// recurse one level. The generic `scan_scope` walker does not find these because
    /// they live outside `AGENT_SKILL_DIRS`; this method fills that gap so the Skills
    /// list/detail UI can expose them uniformly.
    pub(crate) fn scan_system_skills_with_mode(home: &Path, mode: ScanMode) -> Vec<SkillInfo> {
        let base = home.join(".atmos").join("skills").join(".system");
        if !base.is_dir() {
            return Vec::new();
        }

        let mut skills = Vec::new();
        Self::collect_system_skill_dirs(&base, mode, &mut skills);
        skills
    }

    /// Walk `.system/` with one level of nesting through known container dirs.
    ///
    /// A directory is a skill when it contains `SKILL.md`. Otherwise, if its name is a
    /// recognized container (today: `code_review_skills`), recurse one level; anything
    /// else is ignored so we don't descend into random user directories.
    fn collect_system_skill_dirs(base: &Path, mode: ScanMode, skills: &mut Vec<SkillInfo>) {
        const CONTAINER_DIRS: &[&str] = &["code_review_skills"];

        let entries = match fs::read_dir(base) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            if name.starts_with('.') {
                continue;
            }

            if path.join("SKILL.md").is_file() {
                if let Some(skill) = Self::build_system_skill(&path, mode) {
                    skills.push(skill);
                }
                continue;
            }

            if CONTAINER_DIRS.contains(&name) {
                Self::collect_system_skill_dirs(&path, mode, skills);
            }
        }
    }

    fn build_system_skill(path: &Path, mode: ScanMode) -> Option<SkillInfo> {
        let metadata = fs::symlink_metadata(path).ok()?;
        let resolved_path = fs::canonicalize(path).ok();
        let entry_kind = Self::classify_entry_kind(path, &metadata);
        let meta = SkillEntryMeta {
            original_path: path.to_path_buf(),
            resolved_path,
            entry_kind,
            symlink_target: None,
            status: ScanStatus::Enabled,
        };
        Self::parse_skill_dir(
            path, /* agent */ "atmos", /* scope */ "system", /* project_id */ None,
            /* project_name */ None, meta, mode,
        )
    }

    /// Scan for a specific skill by stable id.
    /// Full scan is required because merge_skills deduplicates placements across agents.
    pub fn scan_one(
        project_paths: &[(String, String, String)],
        scope: &str,
        identifier: &str,
    ) -> Option<SkillInfo> {
        Self::scan_all(project_paths)
            .into_iter()
            .find(|skill| skill.id == identifier && skill.scope == scope)
    }

    fn scan_scope(
        scope_root: &Path,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        mode: ScanMode,
    ) -> Vec<SkillInfo> {
        let mut skills = Self::scan_directory(
            scope_root,
            scope_root,
            scope,
            project_id.clone(),
            project_name.clone(),
            ScanStatus::Enabled,
            mode,
        );

        let disabled_root = scope_root.join(DISABLED_STORAGE_REL_PATH);
        if disabled_root.exists() {
            skills.extend(Self::scan_directory(
                &disabled_root,
                scope_root,
                scope,
                project_id,
                project_name,
                ScanStatus::Disabled,
                mode,
            ));
        }

        skills
    }

    /// Scan a directory for skills from all agents.
    fn scan_directory(
        scan_base: &Path,
        scope_root: &Path,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        status: ScanStatus,
        mode: ScanMode,
    ) -> Vec<SkillInfo> {
        let mut skills = Vec::new();
        let mut visited_dirs = HashSet::new();

        for (agent, skill_dir) in AGENT_SKILL_DIRS {
            let skills_path = scan_base.join(skill_dir);
            if !skills_path.exists() || !skills_path.is_dir() {
                continue;
            }

            let ctx = ScanContext {
                scan_base,
                scope_root,
                scope,
                skill_dir,
                agent,
                project_id: project_id.clone(),
                project_name: project_name.clone(),
                status,
                mode,
            };
            Self::scan_skill_entries_recursive(&skills_path, &ctx, &mut visited_dirs, &mut skills);
        }

        skills
    }

    fn scan_skill_entries_recursive(
        current_dir: &Path,
        ctx: &ScanContext,
        visited_dirs: &mut HashSet<PathBuf>,
        skills: &mut Vec<SkillInfo>,
    ) {
        let visit_key = fs::canonicalize(current_dir).unwrap_or_else(|_| current_dir.to_path_buf());
        if !visited_dirs.insert(visit_key) {
            return;
        }

        let entries = match fs::read_dir(current_dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let entry_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if entry_name.starts_with('.') {
                continue;
            }

            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            let current_scope = Self::normalize_scope(ctx.scope, ctx.skill_dir);
            let original_path =
                Self::derive_original_path(&path, ctx.scan_base, ctx.scope_root, ctx.status)
                    .unwrap_or_else(|| path.clone());
            let resolved_path = Self::resolve_entry_path(&path, &original_path, &metadata);
            let entry_kind = Self::classify_entry_kind(&path, &metadata);
            let symlink_target = if metadata.file_type().is_symlink() {
                fs::read_link(&path)
                    .ok()
                    .map(|target| target.to_string_lossy().to_string())
            } else {
                None
            };

            let meta = SkillEntryMeta {
                original_path,
                resolved_path,
                entry_kind,
                symlink_target,
                status: ctx.status,
            };

            if Self::entry_behaves_like_directory(&path, &meta.original_path, &metadata) {
                if Self::directory_contains_main_file(&path, meta.resolved_path.as_deref()) {
                    if let Some(mut skill) = Self::parse_skill_dir(
                        &path,
                        ctx.agent,
                        current_scope.as_str(),
                        ctx.project_id.clone(),
                        ctx.project_name.clone(),
                        meta,
                        ctx.mode,
                    ) {
                        Self::apply_unified_label(&mut skill, ctx.skill_dir);
                        skills.push(skill);
                    }
                    continue;
                }

                if Self::entry_can_contain_nested_skills(
                    &path,
                    meta.resolved_path.as_deref(),
                    &metadata,
                ) {
                    Self::scan_skill_entries_recursive(&path, ctx, visited_dirs, skills);
                }
                continue;
            }

            if Self::entry_behaves_like_markdown_file(&path, &meta.original_path, &metadata) {
                if let Some(mut skill) = Self::parse_skill_file(
                    &path,
                    ctx.agent,
                    current_scope.as_str(),
                    ctx.project_id.clone(),
                    ctx.project_name.clone(),
                    meta,
                    ctx.mode,
                ) {
                    Self::apply_unified_label(&mut skill, ctx.skill_dir);
                    skills.push(skill);
                }
            }
        }
    }

    /// Merge skills that have the same name, scope, and project.
    fn merge_skills(raw_skills: Vec<SkillInfo>) -> Vec<SkillInfo> {
        let mut merged: HashMap<String, SkillInfo> = HashMap::new();

        for skill in raw_skills {
            let key = skill.id.clone();
            if let Some(existing) = merged.get_mut(&key) {
                for agent in &skill.agents {
                    if !existing.agents.contains(agent) {
                        existing.agents.push(agent.clone());
                    }
                }

                let should_replace = Self::should_replace_representative(existing, &skill);

                for placement in skill.placements {
                    if !existing.placements.iter().any(|p| p.id == placement.id) {
                        existing.placements.push(placement);
                    }
                }

                if should_replace {
                    existing.files = skill.files;
                    existing.path = skill.path;
                    existing.description = skill.description;
                    existing.title = skill.title;
                }
            } else {
                merged.insert(key, skill);
            }
        }

        let mut result: Vec<SkillInfo> = merged
            .into_values()
            .map(|mut skill| {
                Self::normalize_agent_order(&mut skill);
                Self::finalize_skill(&mut skill);
                skill
            })
            .collect();

        result.sort_by(|a, b| a.name.cmp(&b.name));
        result
    }

    fn should_replace_representative(existing: &SkillInfo, candidate: &SkillInfo) -> bool {
        let existing_rank = Self::status_rank(&existing.status);
        let candidate_rank = Self::status_rank(&candidate.status);

        candidate_rank > existing_rank
            || (candidate_rank == existing_rank && candidate.files.len() > existing.files.len())
    }

    fn status_rank(status: &str) -> usize {
        match status {
            "enabled" => 2,
            "partial" => 1,
            _ => 0,
        }
    }

    fn finalize_skill(skill: &mut SkillInfo) {
        skill.placements.sort_by(|a, b| {
            let status_cmp = b.status.cmp(&a.status);
            if status_cmp != std::cmp::Ordering::Equal {
                return status_cmp;
            }
            a.path.cmp(&b.path)
        });

        skill.status = Self::aggregate_status(&skill.placements).to_string();
        skill.manageable = is_manageable_scope(&skill.scope);
        skill.can_toggle = skill.manageable && skill.placements.iter().any(|p| p.can_toggle);
        skill.can_delete = skill.manageable && skill.placements.iter().any(|p| p.can_delete);
    }

    fn aggregate_status(placements: &[SkillPlacement]) -> &'static str {
        let has_enabled = placements.iter().any(|p| p.status == "enabled");
        let has_disabled = placements.iter().any(|p| p.status == "disabled");

        match (has_enabled, has_disabled) {
            (true, true) => "partial",
            (true, false) => "enabled",
            _ => "disabled",
        }
    }

    fn normalize_scope(scope: &str, skill_dir: &str) -> String {
        if scope == "project" && skill_dir == "skills" {
            "inside_project".to_string()
        } else {
            scope.to_string()
        }
    }

    fn derive_original_path(
        path: &Path,
        scan_base: &Path,
        scope_root: &Path,
        status: ScanStatus,
    ) -> Option<PathBuf> {
        match status {
            ScanStatus::Enabled => Some(path.to_path_buf()),
            ScanStatus::Disabled => {
                let relative = path.strip_prefix(scan_base).ok()?;
                Some(scope_root.join(relative))
            }
        }
    }

    fn classify_entry_kind(path: &Path, metadata: &fs::Metadata) -> String {
        if metadata.file_type().is_symlink() {
            "symlink".to_string()
        } else if path.is_dir() {
            "directory".to_string()
        } else {
            "file".to_string()
        }
    }

    fn resolve_entry_path(
        path: &Path,
        original_path: &Path,
        metadata: &fs::Metadata,
    ) -> Option<PathBuf> {
        if metadata.file_type().is_symlink() {
            let target = fs::read_link(path).ok()?;
            let base_dir = original_path.parent().or_else(|| path.parent())?;
            let resolved = if target.is_absolute() {
                target
            } else {
                base_dir.join(target)
            };

            return fs::canonicalize(&resolved).ok().or(Some(resolved));
        }

        fs::canonicalize(path).ok()
    }

    fn entry_behaves_like_markdown_file(
        path: &Path,
        original_path: &Path,
        metadata: &fs::Metadata,
    ) -> bool {
        if metadata.is_file() {
            return path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
        }

        if metadata.file_type().is_symlink() {
            return original_path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
        }

        false
    }

    fn entry_behaves_like_directory(
        path: &Path,
        original_path: &Path,
        metadata: &fs::Metadata,
    ) -> bool {
        if metadata.is_dir() || path.is_dir() {
            return true;
        }

        metadata.file_type().is_symlink()
            && !Self::entry_behaves_like_markdown_file(path, original_path, metadata)
    }

    fn directory_contains_main_file(path: &Path, resolved_path: Option<&Path>) -> bool {
        if MAIN_FILE_CANDIDATES
            .iter()
            .any(|candidate| path.join(candidate).is_file())
        {
            return true;
        }

        resolved_path.is_some_and(|resolved| {
            MAIN_FILE_CANDIDATES
                .iter()
                .any(|candidate| resolved.join(candidate).is_file())
        })
    }

    fn entry_can_contain_nested_skills(
        path: &Path,
        resolved_path: Option<&Path>,
        metadata: &fs::Metadata,
    ) -> bool {
        metadata.is_dir()
            || path.is_dir()
            || resolved_path.is_some_and(|resolved| resolved.is_dir())
    }

    /// Parse a skill directory.
    fn parse_skill_dir(
        path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        meta: SkillEntryMeta,
        mode: ScanMode,
    ) -> Option<SkillInfo> {
        let name = path.file_name()?.to_string_lossy().to_string();
        let files = Self::collect_skill_files(path, mode);
        let main_file_content = files
            .iter()
            .find(|f| f.is_main)
            .and_then(|f| f.content.as_ref());

        let (description, title) = if let Some(content) = main_file_content {
            let desc = extract_description(content);
            let (_, frontmatter) = strip_frontmatter(content);
            let title = frontmatter.and_then(|fm| {
                extract_from_frontmatter(fm, "title")
                    .or_else(|| extract_from_frontmatter(fm, "name"))
            });
            (desc, title)
        } else {
            (String::new(), None)
        };

        Some(Self::build_skill_info(
            name,
            description,
            files,
            title,
            agent,
            scope,
            project_id,
            project_name,
            path,
            meta,
        ))
    }

    /// Parse a single file skill.
    fn parse_skill_file(
        path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        meta: SkillEntryMeta,
        _mode: ScanMode,
    ) -> Option<SkillInfo> {
        let name = path.file_stem()?.to_string_lossy().to_string();
        let file_name = path.file_name()?.to_string_lossy().to_string();
        // Single-file skills ARE the main file — we always keep its content so detail
        // view continues to work without a separate re-read, and the list view still
        // gets the frontmatter it needs for title/description.
        let content = fs::read_to_string(path).ok();
        let (description, title) = if let Some(c) = content.as_ref() {
            let desc = extract_description(c);
            let (_, frontmatter) = strip_frontmatter(c);
            let title = frontmatter.and_then(|fm| {
                extract_from_frontmatter(fm, "title")
                    .or_else(|| extract_from_frontmatter(fm, "name"))
            });
            (desc, title)
        } else {
            (String::new(), None)
        };

        let files = vec![SkillFile {
            name: file_name.clone(),
            relative_path: file_name,
            absolute_path: path.to_string_lossy().to_string(),
            content,
            is_main: true,
            is_symlink: false,
            symlink_target: None,
        }];

        Some(Self::build_skill_info(
            name,
            description,
            files,
            title,
            agent,
            scope,
            project_id,
            project_name,
            path,
            meta,
        ))
    }

    #[allow(clippy::too_many_arguments)]
    fn build_skill_info(
        name: String,
        description: String,
        files: Vec<SkillFile>,
        title: Option<String>,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        current_path: &Path,
        meta: SkillEntryMeta,
    ) -> SkillInfo {
        let manageable = is_manageable_scope(scope);
        let skill_id = build_skill_id(scope, project_id.as_deref(), &name);
        let placement_id = build_placement_id(
            scope,
            project_id.as_deref(),
            agent,
            &meta.original_path,
            meta.status.as_str(),
        );

        SkillInfo {
            id: skill_id,
            name,
            description,
            agents: vec![agent.to_string()],
            scope: scope.to_string(),
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            path: current_path.to_string_lossy().to_string(),
            files,
            title,
            status: meta.status.as_str().to_string(),
            manageable,
            can_delete: manageable,
            can_toggle: manageable,
            placements: vec![SkillPlacement {
                id: placement_id,
                agent: agent.to_string(),
                scope: scope.to_string(),
                project_id,
                project_name,
                path: current_path.to_string_lossy().to_string(),
                original_path: meta.original_path.to_string_lossy().to_string(),
                resolved_path: meta.resolved_path.map(|p| p.to_string_lossy().to_string()),
                status: meta.status.as_str().to_string(),
                entry_kind: meta.entry_kind,
                symlink_target: meta.symlink_target,
                can_delete: manageable,
                can_toggle: manageable,
            }],
        }
    }

    /// Collect all files in a skill directory recursively.
    fn collect_skill_files(skill_dir: &Path, mode: ScanMode) -> Vec<SkillFile> {
        let mut files = Vec::new();
        Self::collect_files_recursive(skill_dir, skill_dir, mode, &mut files);

        files.sort_by(|a, b| match (a.is_main, b.is_main) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.relative_path.cmp(&b.relative_path),
        });

        files
    }

    fn collect_files_recursive(
        base: &Path,
        current: &Path,
        mode: ScanMode,
        files: &mut Vec<SkillFile>,
    ) {
        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                // Use symlink_metadata so we can detect symlinks before following them.
                let link_meta = match fs::symlink_metadata(&path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let is_symlink = link_meta.file_type().is_symlink();
                if !is_symlink && path.is_dir() {
                    let dir_name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !dir_name.starts_with('.')
                        && dir_name != "node_modules"
                        && dir_name != "__pycache__"
                    {
                        Self::collect_files_recursive(base, &path, mode, files);
                    }
                } else if path.is_file() {
                    // `path.is_file()` follows symlinks, so a symlink pointing at a file
                    // is included here just like a regular file — but we record it as a
                    // symlink so the UI can badge it.
                    if let Some(file) = Self::parse_file(&path, base, is_symlink, mode) {
                        files.push(file);
                    }
                }
            }
        }
    }

    fn parse_file(path: &Path, base: &Path, is_symlink: bool, mode: ScanMode) -> Option<SkillFile> {
        let file_name = path.file_name()?.to_string_lossy().to_string();
        if file_name.starts_with('.') {
            return None;
        }

        let relative_path = path.strip_prefix(base).ok()?.to_string_lossy().to_string();
        let absolute_path = path.to_string_lossy().to_string();
        let is_main = MAIN_FILE_CANDIDATES
            .iter()
            .any(|&c| c.eq_ignore_ascii_case(&file_name));

        // Lazy mode: only the main file's content is read (needed for frontmatter /
        // title / description). Every other text file's `content` stays `None` so the
        // list endpoint doesn't eat hundreds of KB of markdown bodies.
        let should_read_content = is_main || matches!(mode, ScanMode::Full);
        let content = if should_read_content {
            path.extension()
                .and_then(|ext| ext.to_str())
                .filter(|ext| TEXT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .and_then(|_| fs::read_to_string(path).ok())
                .filter(|c| c.len() < 100_000)
        } else {
            None
        };

        let symlink_target = if is_symlink {
            fs::read_link(path)
                .ok()
                .map(|target| target.to_string_lossy().to_string())
        } else {
            None
        };

        Some(SkillFile {
            name: file_name,
            relative_path,
            absolute_path,
            content,
            is_main,
            is_symlink,
            symlink_target,
        })
    }

    fn apply_unified_label(skill: &mut SkillInfo, skill_dir: &str) {
        if skill.scope == "inside_project" {
            skill.agents = vec!["in-project".to_string()];
        } else if skill_dir == ".agents/skills" {
            let unified = "unified".to_string();
            if !skill.agents.contains(&unified) {
                skill.agents.insert(0, unified);
            }
        }
    }

    fn normalize_agent_order(skill: &mut SkillInfo) {
        if let Some(pos) = skill.agents.iter().position(|agent| agent == "unified") {
            if pos != 0 {
                let unified = skill.agents.remove(pos);
                skill.agents.insert(0, unified);
            }
        }
    }
}
