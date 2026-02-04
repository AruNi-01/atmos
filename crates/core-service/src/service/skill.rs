//! Skills scanning service for detecting installed Code Agent skills.

use std::path::Path;
use std::fs;
use std::collections::HashMap;
use infra::{SkillInfo, SkillFile};

/// Agent skill directory configurations
const AGENT_SKILL_DIRS: &[(&str, &str)] = &[
    ("amp", ".agents/skills"),
    ("antigravity", ".agent/skills"),
    ("augment", ".augment/rules"),
    ("claude", ".claude/skills"),
    ("openclaw", "skills"),
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
const MAIN_FILE_CANDIDATES: &[&str] = &["SKILL.md", "README.md", "skill.md", "readme.md", "index.md"];

/// Text file extensions to read content
const TEXT_EXTENSIONS: &[&str] = &["md", "txt", "json", "yaml", "yml", "toml", "sh", "bash", "zsh", "py", "js", "ts", "rs", "go"];

pub struct SkillScanner;

impl SkillScanner {
    /// Scan for all installed skills (global + project-level)
    pub fn scan_all(project_paths: &[(String, String, String)]) -> Vec<SkillInfo> {
        let mut raw_skills = Vec::new();

        // Scan global skills
        if let Some(home_dir) = dirs::home_dir() {
            raw_skills.extend(Self::scan_directory(&home_dir, "global", None, None));
        }

        // Scan project-level skills
        for (project_id, project_name, project_path) in project_paths {
            let path = Path::new(project_path);
            if path.exists() {
                raw_skills.extend(Self::scan_directory(
                    path,
                    "project",
                    Some(project_id.clone()),
                    Some(project_name.clone()),
                ));
            }
        }

        Self::merge_skills(raw_skills)
    }

    /// Merge skills that have the same path and scope but different agents
    fn merge_skills(raw_skills: Vec<SkillInfo>) -> Vec<SkillInfo> {
        let mut merged: HashMap<String, SkillInfo> = HashMap::new();

        for skill in raw_skills {
            // Revert to grouping by physical path + scope
            let key = format!("{}:{}", skill.scope, skill.path);
            
            if let Some(existing) = merged.get_mut(&key) {
                // Add agent if not already present
                for agent in skill.agents {
                    if !existing.agents.contains(&agent) {
                        existing.agents.push(agent);
                    }
                }
                Self::normalize_agent_order(existing);
            } else {
                let mut skill = skill;
                Self::normalize_agent_order(&mut skill);
                merged.insert(key, skill);
            }
        }

        let mut result: Vec<SkillInfo> = merged.into_values().collect();
        // Sort by name
        result.sort_by(|a, b| a.name.cmp(&b.name));
        result
    }

    /// Scan for a specific skill (by name/title matching)
    pub fn scan_one(
        project_paths: &[(String, String, String)],
        scope: &str,
        identifier: &str,
    ) -> Option<SkillInfo> {
        let all_skills = Self::scan_all(project_paths);
        
        all_skills.into_iter().find(|skill| {
            if skill.scope != scope {
                return false;
            }
            
            // Try matching name
            if skill.name == identifier {
                return true;
            }

            // Try matching title
            if let Some(title) = &skill.title {
                if title == identifier {
                    return true;
                }
            }
            
            false
        })
    }

    /// Scan a directory for skills from all agents
    fn scan_directory(
        base_path: &Path,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
    ) -> Vec<SkillInfo> {
        let mut skills = Vec::new();

        for (agent, skill_dir) in AGENT_SKILL_DIRS {
            let skills_path = base_path.join(skill_dir);
            if skills_path.exists() && skills_path.is_dir() {
                if let Ok(entries) = fs::read_dir(&skills_path) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let path = entry.path();
                        let entry_name = path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        if entry_name.starts_with('.') {
                            continue;
                        }
                        // Resolve symlinks to detect same skills
                        let canonical_path = fs::canonicalize(&path).unwrap_or(path.clone());
                        
                        if path.is_dir() {
                            if let Some(skill) = Self::parse_skill_dir(
                                &path,
                                &canonical_path,
                                agent,
                                scope,
                                project_id.clone(),
                                project_name.clone(),
                            ) {
                                let mut skill = skill;
                                Self::apply_unified_label(&mut skill, skill_dir);
                                skills.push(skill);
                            }
                        } else if path.extension().map_or(false, |ext| ext == "md") {
                            // Single file skill (e.g., skill-name.md)
                            if let Some(skill) = Self::parse_skill_file(
                                &path,
                                &canonical_path,
                                agent,
                                scope,
                                project_id.clone(),
                                project_name.clone(),
                            ) {
                                let mut skill = skill;
                                Self::apply_unified_label(&mut skill, skill_dir);
                                skills.push(skill);
                            }
                        }
                    }
                }
            }
        }

        skills
    }

    /// Parse a skill directory (contains SKILL.md or README.md)
    fn parse_skill_dir(
        path: &Path,
        canonical_path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
    ) -> Option<SkillInfo> {
        let name = path.file_name()?.to_string_lossy().to_string();

        // Collect all files in the skill directory
        let files = Self::collect_skill_files(path);

        // Try to find description from main file
        let main_file_content = files.iter()
            .find(|f| f.is_main)
            .and_then(|f| f.content.as_ref());
            
        let (description, title) = if let Some(content) = main_file_content {
            let desc = Self::extract_description(content);
            let (_, frontmatter) = Self::strip_frontmatter(content);
            let title = frontmatter.and_then(|fm| Self::extract_from_frontmatter(fm, "title").or_else(|| Self::extract_from_frontmatter(fm, "name")));
            (desc, title)
        } else {
            (String::new(), None)
        };

        Some(SkillInfo {
            name,
            description,
            agents: vec![agent.to_string()],
            scope: scope.to_string(),
            project_id,
            project_name,
            path: canonical_path.to_string_lossy().to_string(),
            files,
            title,
        })
    }

    /// Parse a single file skill
    fn parse_skill_file(
        path: &Path,
        canonical_path: &Path,
        agent: &str,
        scope: &str,
        project_id: Option<String>,
        project_name: Option<String>,
    ) -> Option<SkillInfo> {
        let name = path.file_stem()?.to_string_lossy().to_string();
        let file_name = path.file_name()?.to_string_lossy().to_string();

        // Read file content
        let content = fs::read_to_string(path).ok();
        let (description, title) = if let Some(c) = content.as_ref() {
            let desc = Self::extract_description(c);
            let (_, frontmatter) = Self::strip_frontmatter(c);
            let title = frontmatter.and_then(|fm| Self::extract_from_frontmatter(fm, "title").or_else(|| Self::extract_from_frontmatter(fm, "name")));
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

        Some(SkillInfo {
            name,
            description,
            agents: vec![agent.to_string()],
            scope: scope.to_string(),
            project_id,
            project_name,
            path: canonical_path.to_string_lossy().to_string(),
            files,
            title,
        })
    }

    /// Collect all files in a skill directory recursively
    fn collect_skill_files(skill_dir: &Path) -> Vec<SkillFile> {
        let mut files = Vec::new();
        Self::collect_files_recursive(skill_dir, skill_dir, &mut files);
        
        // Sort: main files first, then alphabetically
        files.sort_by(|a, b| {
            match (a.is_main, b.is_main) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.relative_path.cmp(&b.relative_path),
            }
        });
        
        files
    }

    fn collect_files_recursive(base: &Path, current: &Path, files: &mut Vec<SkillFile>) {
        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    // Skip hidden directories and common non-essential dirs
                    let dir_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    if !dir_name.starts_with('.') && dir_name != "node_modules" && dir_name != "__pycache__" {
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
        
        // Skip hidden files
        if file_name.starts_with('.') {
            return None;
        }

        let relative_path = path.strip_prefix(base).ok()?.to_string_lossy().to_string();
        let absolute_path = path.to_string_lossy().to_string();
        
        // Check if it's a main file
        let is_main = MAIN_FILE_CANDIDATES.iter().any(|&c| c.eq_ignore_ascii_case(&file_name));

        // Read content for text files
        let mut content = path.extension()
            .and_then(|ext| ext.to_str())
            .filter(|ext| TEXT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
            .and_then(|_| fs::read_to_string(path).ok())
            .filter(|c| c.len() < 100_000); // Limit to 100KB

        // If it's a main file, strip frontmatter from content for display
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
        if skill_dir == ".agents/skills" {
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

    /// Extract description from markdown content (first paragraph or first few lines)
    fn extract_description(content: &str) -> String {
        let (content_to_parse, frontmatter) = Self::strip_frontmatter(content);
        
        // Try to get description from frontmatter first
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

            // Skip empty lines at the beginning
            if !in_content && trimmed.is_empty() {
                continue;
            }

            // Skip markdown headers
            if trimmed.starts_with('#') {
                if in_content {
                    break;
                }
                continue;
            }

            // Skip code blocks
            if trimmed.starts_with("```") {
                if in_content {
                    break;
                }
                continue;
            }

            in_content = true;

            // Stop at empty line after content (end of paragraph)
            if trimmed.is_empty() && !description_lines.is_empty() {
                break;
            }

            description_lines.push(trimmed);

            // Limit to 3 lines
            if description_lines.len() >= 3 {
                break;
            }
        }

        description_lines.join(" ")
    }

    /// Strip YAML frontmatter (between --- and ---) from content
    fn strip_frontmatter(content: &str) -> (&str, Option<&str>) {
        if content.starts_with("---") {
            if let Some(end_idx) = content[3..].find("---") {
                let actual_end = end_idx + 3;
                let frontmatter = &content[3..actual_end];
                let rest = content[actual_end + 3..].trim_start();
                return (rest, Some(frontmatter));
            }
        }
        (content, None)
    }

    /// Extract a field from YAML frontmatter using simple regex
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
