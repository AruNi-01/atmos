//! Skills scanning and management service.

use crate::error::{Result, ServiceError};
use infra::{SkillFile, SkillInfo, SkillPlacement};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const DISABLED_STORAGE_REL_PATH: &str = ".atmos/skills/.disabled";

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

/// Main file candidates (in priority order)
const MAIN_FILE_CANDIDATES: &[&str] =
    &["SKILL.md", "README.md", "skill.md", "readme.md", "index.md"];

/// Text file extensions to read content
const TEXT_EXTENSIONS: &[&str] = &[
    "md", "txt", "json", "yaml", "yml", "toml", "sh", "bash", "zsh", "py", "js", "ts", "rs",
    "go",
];

#[derive(Debug, Clone)]
struct ProjectPathRecord {
    project_id: String,
    root_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScanStatus {
    Enabled,
    Disabled,
}

impl ScanStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Enabled => "enabled",
            Self::Disabled => "disabled",
        }
    }
}

pub struct SkillScanner;

pub struct SkillManager;

impl SkillScanner {
    /// Scan for all installed skills (global + project-level).
    pub fn scan_all(project_paths: &[(String, String, String)]) -> Vec<SkillInfo> {
        let mut raw_skills = Vec::new();

        if let Some(home_dir) = dirs::home_dir() {
            raw_skills.extend(Self::scan_scope(&home_dir, "global", None, None));
        }

        for (project_id, project_name, project_path) in project_paths {
            let path = Path::new(project_path);
            if path.exists() {
                raw_skills.extend(Self::scan_scope(
                    path,
                    "project",
                    Some(project_id.clone()),
                    Some(project_name.clone()),
                ));
            }
        }

        Self::merge_skills(raw_skills)
    }

    /// Scan for a specific skill by stable id.
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
    ) -> Vec<SkillInfo> {
        let mut skills = Self::scan_directory(
            scope_root,
            scope_root,
            scope,
            project_id.clone(),
            project_name.clone(),
            ScanStatus::Enabled,
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
    ) -> Vec<SkillInfo> {
        let mut skills = Vec::new();

        for (agent, skill_dir) in AGENT_SKILL_DIRS {
            let skills_path = scan_base.join(skill_dir);
            if !skills_path.exists() || !skills_path.is_dir() {
                continue;
            }

            let entries = match fs::read_dir(&skills_path) {
                Ok(entries) => entries,
                Err(_) => continue,
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

                let current_scope = Self::normalize_scope(scope, skill_dir);
                let original_path = Self::derive_original_path(
                    &path,
                    scan_base,
                    scope_root,
                    status,
                )
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

                let behaves_like_markdown_file = Self::entry_behaves_like_markdown_file(
                    &path,
                    &original_path,
                    &metadata,
                );

                let parsed = if Self::entry_behaves_like_directory(
                    &path,
                    &original_path,
                    &metadata,
                ) {
                    Self::parse_skill_dir(
                        &path,
                        agent,
                        current_scope.as_str(),
                        project_id.clone(),
                        project_name.clone(),
                        status,
                        original_path,
                        resolved_path,
                        entry_kind,
                        symlink_target,
                    )
                } else if behaves_like_markdown_file {
                    Self::parse_skill_file(
                        &path,
                        agent,
                        current_scope.as_str(),
                        project_id.clone(),
                        project_name.clone(),
                        status,
                        original_path,
                        resolved_path,
                        entry_kind,
                        symlink_target,
                    )
                } else {
                    None
                };

                if let Some(mut skill) = parsed {
                    Self::apply_unified_label(&mut skill, skill_dir);
                    skills.push(skill);
                }
            }
        }

        skills
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

        metadata.file_type().is_symlink() && !Self::entry_behaves_like_markdown_file(path, original_path, metadata)
    }

    /// Parse a skill directory.
    #[allow(clippy::too_many_arguments)]
    fn parse_skill_dir(
        path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        status: ScanStatus,
        original_path: PathBuf,
        resolved_path: Option<PathBuf>,
        entry_kind: String,
        symlink_target: Option<String>,
    ) -> Option<SkillInfo> {
        let name = path.file_name()?.to_string_lossy().to_string();
        let files = Self::collect_skill_files(path);
        let main_file_content = files
            .iter()
            .find(|f| f.is_main)
            .and_then(|f| f.content.as_ref());

        let (description, title) = if let Some(content) = main_file_content {
            let desc = Self::extract_description(content);
            let (_, frontmatter) = Self::strip_frontmatter(content);
            let title = frontmatter.and_then(|fm| {
                Self::extract_from_frontmatter(fm, "title")
                    .or_else(|| Self::extract_from_frontmatter(fm, "name"))
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
            original_path,
            resolved_path,
            status,
            entry_kind,
            symlink_target,
        ))
    }

    /// Parse a single file skill.
    #[allow(clippy::too_many_arguments)]
    fn parse_skill_file(
        path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
        status: ScanStatus,
        original_path: PathBuf,
        resolved_path: Option<PathBuf>,
        entry_kind: String,
        symlink_target: Option<String>,
    ) -> Option<SkillInfo> {
        let name = path.file_stem()?.to_string_lossy().to_string();
        let file_name = path.file_name()?.to_string_lossy().to_string();
        let content = fs::read_to_string(path).ok();
        let (description, title) = if let Some(c) = content.as_ref() {
            let desc = Self::extract_description(c);
            let (_, frontmatter) = Self::strip_frontmatter(c);
            let title = frontmatter.and_then(|fm| {
                Self::extract_from_frontmatter(fm, "title")
                    .or_else(|| Self::extract_from_frontmatter(fm, "name"))
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
            original_path,
            resolved_path,
            status,
            entry_kind,
            symlink_target,
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
        original_path: PathBuf,
        resolved_path: Option<PathBuf>,
        status: ScanStatus,
        entry_kind: String,
        symlink_target: Option<String>,
    ) -> SkillInfo {
        let manageable = is_manageable_scope(scope);
        let skill_id = build_skill_id(scope, project_id.as_deref(), &name);
        let placement_id = build_placement_id(
            scope,
            project_id.as_deref(),
            agent,
            &original_path,
            status.as_str(),
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
            status: status.as_str().to_string(),
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
                original_path: original_path.to_string_lossy().to_string(),
                resolved_path: resolved_path.map(|p| p.to_string_lossy().to_string()),
                status: status.as_str().to_string(),
                entry_kind,
                symlink_target,
                can_delete: manageable,
                can_toggle: manageable,
            }],
        }
    }

    /// Collect all files in a skill directory recursively.
    fn collect_skill_files(skill_dir: &Path) -> Vec<SkillFile> {
        let mut files = Vec::new();
        Self::collect_files_recursive(skill_dir, skill_dir, &mut files);

        files.sort_by(|a, b| match (a.is_main, b.is_main) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.relative_path.cmp(&b.relative_path),
        });

        files
    }

    fn collect_files_recursive(base: &Path, current: &Path, files: &mut Vec<SkillFile>) {
        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !dir_name.starts_with('.')
                        && dir_name != "node_modules"
                        && dir_name != "__pycache__"
                    {
                        Self::collect_files_recursive(base, &path, files);
                    }
                } else if path.is_file() {
                    if let Some(file) = Self::parse_file(&path, base) {
                        files.push(file);
                    }
                }
            }
        }
    }

    fn parse_file(path: &Path, base: &Path) -> Option<SkillFile> {
        let file_name = path.file_name()?.to_string_lossy().to_string();
        if file_name.starts_with('.') {
            return None;
        }

        let relative_path = path.strip_prefix(base).ok()?.to_string_lossy().to_string();
        let absolute_path = path.to_string_lossy().to_string();
        let is_main = MAIN_FILE_CANDIDATES
            .iter()
            .any(|&c| c.eq_ignore_ascii_case(&file_name));

        let mut content = path
            .extension()
            .and_then(|ext| ext.to_str())
            .filter(|ext| TEXT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
            .and_then(|_| fs::read_to_string(path).ok())
            .filter(|c| c.len() < 100_000);

        if is_main {
            if let Some(c) = content {
                let (rest, _) = Self::strip_frontmatter(&c);
                content = Some(rest.to_string());
            }
        }

        Some(SkillFile {
            name: file_name,
            relative_path,
            absolute_path,
            content,
            is_main,
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

    /// Extract description from markdown content (first paragraph or first few lines).
    fn extract_description(content: &str) -> String {
        let (content_to_parse, frontmatter) = Self::strip_frontmatter(content);

        if let Some(fm) = frontmatter {
            if let Some(desc) = Self::extract_from_frontmatter(fm, "description") {
                return desc;
            }
        }

        let lines: Vec<&str> = content_to_parse.lines().collect();
        let mut description_lines = Vec::new();
        let mut in_content = false;

        for line in lines {
            let trimmed = line.trim();

            if !in_content && trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with('#') {
                if in_content {
                    break;
                }
                continue;
            }

            if trimmed.starts_with("```") {
                if in_content {
                    break;
                }
                continue;
            }

            in_content = true;

            if trimmed.is_empty() && !description_lines.is_empty() {
                break;
            }

            description_lines.push(trimmed);
            if description_lines.len() >= 3 {
                break;
            }
        }

        description_lines.join(" ")
    }

    /// Strip YAML frontmatter (between --- and ---) from content.
    fn strip_frontmatter(content: &str) -> (&str, Option<&str>) {
        if let Some(stripped) = content.strip_prefix("---") {
            if let Some(end_idx) = stripped.find("---") {
                let actual_end = end_idx + 3;
                let frontmatter = &content[3..actual_end];
                let rest = content[actual_end + 3..].trim_start();
                return (rest, Some(frontmatter));
            }
        }
        (content, None)
    }

    /// Extract a field from YAML frontmatter using simple regex.
    fn extract_from_frontmatter(frontmatter: &str, field: &str) -> Option<String> {
        use regex::Regex;
        let pattern = format!(r"(?m)^{}:\s*(.*)$", field);
        let re = Regex::new(&pattern).ok()?;
        re.captures(frontmatter)
            .map(|caps| {
                let val = caps[1].trim();
                val.trim_matches('"').trim_matches('\'').to_string()
            })
            .filter(|s: &String| !s.is_empty())
    }
}

impl SkillManager {
    pub fn set_enabled(
        project_paths: &[(String, String, String)],
        skill_id: &str,
        enabled: bool,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        let project_records = project_records(project_paths);
        let skill = Self::load_managed_skill(project_paths, skill_id)?;
        let desired_status = if enabled { "enabled" } else { "disabled" };
        let selected_placement_ids = selected_placement_ids(placement_ids)?;

        let mut seen_paths = HashSet::new();
        for placement in skill
            .placements
            .iter()
            .filter(|placement| {
                placement.can_toggle
                    && placement.status != desired_status
                    && placement_matches_selection(placement, &selected_placement_ids)
            })
        {
            if !seen_paths.insert(placement.path.clone()) {
                continue;
            }

            let from = PathBuf::from(&placement.path);
            let to = if enabled {
                PathBuf::from(&placement.original_path)
            } else {
                Self::disabled_path_for(&project_records, placement)?
            };

            move_entry_without_following_symlink(&from, &to)?;
        }

        ensure_selection_applied(&skill, &selected_placement_ids, |placement| {
            placement.can_toggle && placement.status != desired_status
        })?;

        Ok(())
    }

    pub fn delete(
        project_paths: &[(String, String, String)],
        skill_id: &str,
        placement_ids: Option<&[String]>,
    ) -> Result<()> {
        let skill = Self::load_managed_skill(project_paths, skill_id)?;
        let selected_placement_ids = selected_placement_ids(placement_ids)?;
        let mut seen_paths = HashSet::new();

        for placement in skill.placements.iter().filter(|placement| {
            placement.can_delete && placement_matches_selection(placement, &selected_placement_ids)
        }) {
            if !seen_paths.insert(placement.path.clone()) {
                continue;
            }
            delete_entry_without_following_symlink(Path::new(&placement.path))?;
        }

        ensure_selection_applied(&skill, &selected_placement_ids, |placement| placement.can_delete)?;

        Ok(())
    }

    fn load_managed_skill(
        project_paths: &[(String, String, String)],
        skill_id: &str,
    ) -> Result<SkillInfo> {
        let skill = SkillScanner::scan_all(project_paths)
            .into_iter()
            .find(|skill| skill.id == skill_id)
            .ok_or_else(|| ServiceError::Validation("Skill not found".to_string()))?;

        if !skill.manageable || skill.scope == "inside_project" {
            return Err(ServiceError::Validation(
                "InsideTheProject skills are read-only".to_string(),
            ));
        }

        Ok(skill)
    }

    fn disabled_path_for(
        project_records: &[ProjectPathRecord],
        placement: &SkillPlacement,
    ) -> Result<PathBuf> {
        let original_path = PathBuf::from(&placement.original_path);
        let scope_root = match placement.scope.as_str() {
            "global" => dirs::home_dir().ok_or_else(|| {
                ServiceError::Validation("Cannot determine home directory".to_string())
            })?,
            "project" => project_records
                .iter()
                .find(|record| Some(record.project_id.as_str()) == placement.project_id.as_deref())
                .map(|record| record.root_path.clone())
                .ok_or_else(|| {
                    ServiceError::Validation("Project root not found for skill".to_string())
                })?,
            _ => {
                return Err(ServiceError::Validation(
                    "This skill cannot be disabled".to_string(),
                ))
            }
        };

        let relative = original_path.strip_prefix(&scope_root).map_err(|_| {
            ServiceError::Validation("Skill path is outside of its managed root".to_string())
        })?;

        Ok(scope_root.join(DISABLED_STORAGE_REL_PATH).join(relative))
    }
}

fn is_manageable_scope(scope: &str) -> bool {
    matches!(scope, "global" | "project")
}

fn build_skill_id(scope: &str, project_id: Option<&str>, name: &str) -> String {
    let project_key = project_id.unwrap_or("-");
    format!("{}::{}::{}", scope, project_key, name)
}

fn build_placement_id(
    scope: &str,
    project_id: Option<&str>,
    agent: &str,
    original_path: &Path,
    status: &str,
) -> String {
    let project_key = project_id.unwrap_or("-");
    format!(
        "{}::{}::{}::{}::{}",
        scope,
        project_key,
        agent,
        status,
        original_path.to_string_lossy()
    )
}

fn project_records(project_paths: &[(String, String, String)]) -> Vec<ProjectPathRecord> {
    project_paths
        .iter()
        .map(|(project_id, _project_name, root_path)| ProjectPathRecord {
            project_id: project_id.clone(),
            root_path: PathBuf::from(root_path),
        })
        .collect()
}

fn selected_placement_ids(placement_ids: Option<&[String]>) -> Result<Option<HashSet<&str>>> {
    let Some(placement_ids) = placement_ids else {
        return Ok(None);
    };

    if placement_ids.is_empty() {
        return Err(ServiceError::Validation(
            "Please choose at least one skill location".to_string(),
        ));
    }

    Ok(Some(
        placement_ids
            .iter()
            .map(std::string::String::as_str)
            .collect(),
    ))
}

fn placement_matches_selection(
    placement: &SkillPlacement,
    selected_placement_ids: &Option<HashSet<&str>>,
) -> bool {
    selected_placement_ids
        .as_ref()
        .is_none_or(|selected| selected.contains(placement.id.as_str()))
}

fn ensure_selection_applied(
    skill: &SkillInfo,
    selected_placement_ids: &Option<HashSet<&str>>,
    predicate: impl Fn(&SkillPlacement) -> bool,
) -> Result<()> {
    if selected_placement_ids.is_none() {
        return Ok(());
    }

    let matched = skill
        .placements
        .iter()
        .any(|placement| predicate(placement) && placement_matches_selection(placement, selected_placement_ids));

    if matched {
        Ok(())
    } else {
        Err(ServiceError::Validation(
            "No matching skill locations were available for this action".to_string(),
        ))
    }
}

fn move_entry_without_following_symlink(from: &Path, to: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(from).map_err(|e| {
        ServiceError::Validation(format!("Failed to inspect skill entry '{}': {}", from.display(), e))
    })?;

    if fs::symlink_metadata(to).is_ok() {
        return Err(ServiceError::Validation(format!(
            "Target path already exists: {}",
            to.display()
        )));
    }

    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create destination directory '{}': {}",
                parent.display(),
                e
            ))
        })?;
    }

    match fs::rename(from, to) {
        Ok(_) => Ok(()),
        Err(_) => {
            copy_entry_without_following_symlink(from, to, &metadata)?;
            delete_entry_without_following_symlink(from)?;
            Ok(())
        }
    }
}

fn copy_entry_without_following_symlink(from: &Path, to: &Path, metadata: &fs::Metadata) -> Result<()> {
    if metadata.file_type().is_symlink() {
        let target = fs::read_link(from).map_err(|e| {
            ServiceError::Validation(format!("Failed to read symlink '{}': {}", from.display(), e))
        })?;
        create_symlink(&target, to, from.is_dir())?;
        return Ok(());
    }

    if metadata.is_dir() {
        fs::create_dir_all(to).map_err(|e| {
            ServiceError::Validation(format!("Failed to create directory '{}': {}", to.display(), e))
        })?;
        let entries = fs::read_dir(from).map_err(|e| {
            ServiceError::Validation(format!("Failed to read directory '{}': {}", from.display(), e))
        })?;
        for entry in entries.filter_map(|entry| entry.ok()) {
            let child_from = entry.path();
            let child_to = to.join(entry.file_name());
            let child_metadata = fs::symlink_metadata(&child_from).map_err(|e| {
                ServiceError::Validation(format!(
                    "Failed to inspect nested skill entry '{}': {}",
                    child_from.display(),
                    e
                ))
            })?;
            copy_entry_without_following_symlink(&child_from, &child_to, &child_metadata)?;
        }
        return Ok(());
    }

    fs::copy(from, to).map_err(|e| {
        ServiceError::Validation(format!(
            "Failed to copy skill file '{}' to '{}': {}",
            from.display(),
            to.display(),
            e
        ))
    })?;
    Ok(())
}

fn delete_entry_without_following_symlink(path: &Path) -> Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => {
            return Err(ServiceError::Validation(format!(
                "Failed to inspect skill entry '{}': {}",
                path.display(),
                err
            )))
        }
    };

    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path).map_err(|e| {
            ServiceError::Validation(format!("Failed to remove skill link '{}': {}", path.display(), e))
        })?;
        return Ok(());
    }

    fs::remove_dir_all(path).map_err(|e| {
        ServiceError::Validation(format!("Failed to remove skill directory '{}': {}", path.display(), e))
    })?;
    Ok(())
}

fn create_symlink(target: &Path, link: &Path, _target_is_dir: bool) -> Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create symlink '{}' -> '{}': {}",
                link.display(),
                target.display(),
                e
            ))
        })?;
    }

    #[cfg(windows)]
    {
        let result = if _target_is_dir {
            std::os::windows::fs::symlink_dir(target, link)
        } else {
            std::os::windows::fs::symlink_file(target, link)
        };
        result.map_err(|e| {
            ServiceError::Validation(format!(
                "Failed to create symlink '{}' -> '{}': {}",
                link.display(),
                target.display(),
                e
            ))
        })?;
    }

    Ok(())
}
